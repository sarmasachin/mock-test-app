'use strict';

/**
 * Phase 4 — integrated apply-screen isolation (offline E2E mirror).
 * Covers sync merge ghost pruning + Phases 1–3 UI/lookup/cache rules.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// --- AppliedTestSeriesSync.kt mirror (Phase 4) ---
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
  return (serverEntries || []).some((s) => entriesMatchSameTest(local, s));
}

function mergeAppliedSeries(localActive, serverEntries) {
  if (!serverEntries || serverEntries.length === 0) return localActive || [];
  const pendingOnServer = (localActive || []).filter(
    (local) =>
      !isLocalCoveredByServer(local, serverEntries) &&
      String(local.testId || '').trim() !== '',
  );
  return [...serverEntries, ...pendingOnServer];
}

// --- Phase 1 Start preview UI ---
function deriveStartPreviewUi({
  isListRoute,
  activeAppliedCount,
  showLoading,
  hasSpecificTest,
  specificStartEntry,
  resolveAlreadyApplied,
}) {
  const showAppliedList = isListRoute && activeAppliedCount > 0;
  const showSpecificStart =
    !showAppliedList && !showLoading && hasSpecificTest && specificStartEntry != null;
  const showSpecificApply =
    !showAppliedList && !showLoading && hasSpecificTest &&
    !showSpecificStart && !resolveAlreadyApplied;
  return { showAppliedList, showSpecificStart, showSpecificApply };
}

// --- Phase 2 applied lookup ---
function catalogLookupKeyMatchesCard(key, card) {
  const k = String(key || '').trim();
  if (!k) return false;
  const title = String(card?.title || '').trim();
  const sub = String(card?.subcategory || '').trim();
  if (title && k.toLowerCase() === title.toLowerCase()) return true;
  if (sub && k.toLowerCase() === sub.toLowerCase()) return true;
  return false;
}

function findAppliedEntry(lookupKey, catalogCard, entries) {
  const key = String(lookupKey || '').trim();
  if (!key) return null;
  const direct = (entries || []).find((e) => e.testName.toLowerCase() === key.toLowerCase());
  if (direct) return direct;
  if (!catalogCard || !catalogLookupKeyMatchesCard(key, catalogCard)) return null;
  const cardId = String(catalogCard.id || '').trim();
  if (cardId) {
    const byId = (entries || []).find(
      (e) => String(e.testId || '').trim() && String(e.testId).toLowerCase() === cardId.toLowerCase(),
    );
    if (byId) return byId;
  }
  const cardTitle = String(catalogCard.title || '').trim();
  if (cardTitle) {
    const byTitle = (entries || []).find((e) => e.testName.toLowerCase() === cardTitle.toLowerCase());
    if (byTitle) return byTitle;
  }
  return null;
}

// --- Phase 3 logout cache ---
function peekBlob(raw) {
  const t = String(raw || '').trim();
  return t || null;
}

function simulateLogout(prefs) {
  return {
    ...prefs,
    appliedSeries: [],
    testCardsBlob: '',
    testsListsBlob: '',
    memoryCleared: true,
  };
}

const HP_GK_ID = '2c7f05c8-7048-43f7-aec3-3013bc02acf2';
const FF_ID = 'bf26f870-8d31-4feb-ae8d-1c16f10b1dff';

let ok = true;

// Static: Phase 4 merge in Kotlin
const syncKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestSeriesSync.kt');
ok = line(syncKt.includes('pendingOnServer'), 'Kotlin merge: pendingOnServer catch-up') && ok;
ok = line(syncKt.includes('local.testId.trim().isNotBlank()'), 'Kotlin merge: prune ghosts without testId') && ok;
ok = line(!syncKt.includes('localOnly'), 'Kotlin merge: removed unscoped localOnly keep-all') && ok;

// Journey 1: logout → clean slate
let state = simulateLogout({
  appliedSeries: [{ testName: 'ff' }, { testName: 'HP GK', testId: HP_GK_ID }],
  testCardsBlob: '{"stale":true}',
  testsListsBlob: '{"stale":true}',
  memoryCleared: false,
});
ok = line(state.appliedSeries.length === 0, 'journey1: logout clears applied list') && ok;
ok = line(peekBlob(state.testCardsBlob) === null, 'journey1: logout clears card blob') && ok;
ok = line(state.memoryCleared === true, 'journey1: in-memory caches cleared') && ok;

// Journey 2: apply HP GK → sync prunes ff ghost
const localAfterApply = [
  { testName: 'HP GK', testId: HP_GK_ID },
  { testName: 'ff' },
];
const serverApps = [{ testName: 'HP GK', testId: HP_GK_ID }];
const merged = mergeAppliedSeries(localAfterApply, serverApps);
ok = line(merged.length === 1 && merged[0].testName === 'HP GK', 'journey2: sync drops ff ghost without testId') && ok;

// Journey 3: apply race — server empty keeps local
const raceMerged = mergeAppliedSeries(
  [{ testName: 'HP GK', testId: HP_GK_ID }],
  [],
);
ok = line(raceMerged.length === 1, 'journey3: empty server keeps fresh local apply') && ok;

// Journey 4: pending testId not on server yet (other app on account)
const pendingMerged = mergeAppliedSeries(
  [
    { testName: 'HP GK', testId: HP_GK_ID },
    { testName: 'Railway', testId: 'rail-uuid' },
  ],
  [{ testName: 'HP GK', testId: HP_GK_ID }],
);
ok = line(pendingMerged.length === 2, 'journey4: keeps testId row pending server catch-up') && ok;

// Journey 5: after sync, ff UI isolated (Phase 1)
const ffUi = deriveStartPreviewUi({
  isListRoute: false,
  activeAppliedCount: merged.length,
  showLoading: false,
  hasSpecificTest: true,
  specificStartEntry: null,
  resolveAlreadyApplied: false,
});
ok = line(ffUi.showSpecificApply === true, 'journey5: ff shows Apply after ghost prune') && ok;
ok = line(ffUi.showAppliedList === false, 'journey5: ff not replaced by applied list') && ok;

// Journey 6: stale card cannot mark ff applied (Phase 2)
const staleCard = { id: HP_GK_ID, title: 'HP GK', subcategory: 'HP GK' };
const ffCard = { id: FF_ID, title: 'ff', subcategory: 'ff' };
ok = line(
  findAppliedEntry('ff', staleCard, merged) == null,
  'journey6: stale HP GK card does not apply to ff',
) && ok;
ok = line(
  findAppliedEntry('HP GK', { id: HP_GK_ID, title: 'HP GK', subcategory: 'HP GK' }, merged)?.testName === 'HP GK',
  'journey6: HP GK lookup still works',
) && ok;
ok = line(findAppliedEntry('ff', ffCard, merged) == null, 'journey6: ff not in applied list') && ok;

// Journey 7: home applied route unchanged
const homeUi = deriveStartPreviewUi({
  isListRoute: true,
  activeAppliedCount: 1,
  showLoading: false,
  hasSpecificTest: true,
  specificStartEntry: { testName: 'HP GK' },
  resolveAlreadyApplied: true,
});
ok = line(homeUi.showAppliedList === true, 'journey7: home applied list still works') && ok;

if (ok) {
  console.log('\nE2E_APPLY_SCREEN_ISOLATION_PHASE4_OK');
  process.exit(0);
}
console.log('\nE2E_APPLY_SCREEN_ISOLATION_PHASE4_FAILED');
process.exit(1);
