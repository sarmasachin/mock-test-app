'use strict';

/**
 * Phase 2 — Applied list sync merge verification (static + logic mirror).
 * No DB writes. Safe to run anytime.
 *
 * Usage:
 *   node scripts/verifyApplyOncePhase2.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function mustInclude(source, needle, label) {
  return line(source.includes(needle), `${label}: contains "${needle}"`);
}

// --- JS mirror of AppliedTestSeriesSync.kt ---

function entriesMatchSameTest(a, b) {
  const aId = String(a.testId || '').trim();
  const bId = String(b.testId || '').trim();
  if (aId && bId && aId === bId) return true;
  const aTitle = String(a.testName || '').trim();
  const bTitle = String(b.testName || '').trim();
  if (aTitle && bTitle && aTitle.toLowerCase() === bTitle.toLowerCase()) return true;
  return false;
}

function isLocalCoveredByServer(local, serverEntries) {
  return (serverEntries || []).some((server) => entriesMatchSameTest(local, server));
}

function merge(localActive, serverEntries) {
  if (!serverEntries || serverEntries.length === 0) return localActive || [];
  const pendingOnServer = (localActive || []).filter(
    (local) =>
      !isLocalCoveredByServer(local, serverEntries) &&
      String(local.testId || '').trim() !== '',
  );
  return [...serverEntries, ...pendingOnServer];
}

function runLogicMirrorTests() {
  let ok = true;
  const now = Date.now();
  const local = [
    {
      testName: 'SSC CGL Mock 1',
      testId: 'uuid-local',
      unlockAtMillis: now - 60_000,
      expiresAtMillis: now + 3_600_000,
    },
  ];
  const server = [
    {
      testName: 'SSC CGL Mock 1',
      testId: 'uuid-local',
      unlockAtMillis: now,
      expiresAtMillis: now + 7_200_000,
      serverCanStart: true,
    },
  ];

  ok = line(entriesMatchSameTest(local[0], server[0]), 'entriesMatchSameTest: id match') && ok;
  ok =
    line(
      merge(local, []).length === 1,
      'merge: empty server keeps active local (no wipe on resume)',
    ) && ok;
  const merged = merge(local, server);
  ok = line(merged.length === 1, 'merge: server replaces duplicate local row') && ok;
  ok = line(merged[0].serverCanStart === true, 'merge: server row wins fields') && ok;

  const localOther = [
    {
      testName: 'Railway Mock',
      testId: 'uuid-r',
      unlockAtMillis: now - 30_000,
      expiresAtMillis: now + 3_600_000,
    },
  ];
  const mergedTwo = merge(localOther, server);
  ok = line(mergedTwo.length === 2, 'merge: keeps testId local row pending server catch-up') && ok;

  const ghostLocal = [
    { testName: 'HP GK', testId: 'uuid-local' },
    { testName: 'ff' },
  ];
  const ghostServer = [{ testName: 'HP GK', testId: 'uuid-local' }];
  const ghostMerged = merge(ghostLocal, ghostServer);
  ok = line(ghostMerged.length === 1, 'merge: drops local ghost without testId when server has data') && ok;

  ok =
    line(
      entriesMatchSameTest(
        { testName: 'Patwari', testId: '' },
        { testName: 'patwari', testId: '' },
      ),
      'entriesMatchSameTest: title case-insensitive',
    ) && ok;

  return ok;
}

function runStaticChecks() {
  let ok = true;
  const sync = read('app/src/main/java/com/freemocktest/app/util/AppliedTestSeriesSync.kt');
  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
  const auth = read('app/src/main/java/com/freemocktest/app/data/AuthRepository.kt');
  const applyScreen = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');

  ok = line(sync.includes('object AppliedTestSeriesSync'), 'AppliedTestSeriesSync.kt exists') && ok;
  ok = mustInclude(sync, 'if (serverEntries.isEmpty())', 'AppliedTestSeriesSync') && ok;
  ok = mustInclude(sync, 'pendingOnServer', 'AppliedTestSeriesSync') && ok;
  ok = mustInclude(sync, 'testId.trim().isNotBlank()', 'AppliedTestSeriesSync ghost prune') && ok;

  ok = mustInclude(prefs, 'mergeAppliedTestSeriesFromServer', 'AppPreferencesRepository') && ok;
  ok = mustInclude(prefs, 'AppliedTestSeriesSync.merge', 'AppPreferencesRepository') && ok;
  ok =
    line(
      prefs.includes('encodeAppliedTestSeries(merged)') &&
        !prefs.match(/mergeAppliedTestSeriesFromServer[\s\S]{0,400}encodeAppliedTestSeries\(entries\)/),
      'AppPreferencesRepository: merge writes merged list (not server-only replace)',
    ) && ok;
  ok = mustInclude(prefs, 'val testId: String = ""', 'AppliedTestSeriesEntry.testId') && ok;

  ok = mustInclude(auth, 'mergeAppliedTestSeriesFromServer', 'AuthRepository') && ok;
  ok = mustInclude(auth, 'testId = item.testId', 'AuthRepository sync testId') && ok;

  ok = mustInclude(applyScreen, 'testId = idToSave', 'ApplyForTestScreenNew local save testId') && ok;
  ok = mustInclude(applyScreen, 'testId = testId.trim()', 'ApplyForTestScreenNew dialog save testId') && ok;

  return ok;
}

function main() {
  console.log('=== verifyApplyOncePhase2 ===\n');
  let ok = runStaticChecks();
  console.log('');
  ok = runLogicMirrorTests() && ok;
  console.log('');
  if (ok) {
    console.log('PASS  Apply-once Phase 2 checks');
    process.exit(0);
  }
  console.error('FAIL  Apply-once Phase 2 checks');
  process.exit(1);
}

main();
