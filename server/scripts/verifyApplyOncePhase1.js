'use strict';

/**
 * Phase 1 — Apply-once Android fix verification (static + logic mirror).
 * No DB writes. Safe to run anytime.
 *
 * Usage:
 *   node scripts/verifyApplyOncePhase1.js
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

// --- JS mirror of TestApplyState.kt (Phase 1) ---

function matchesApplication(app, routeKey, card) {
  const key = String(routeKey || '').trim();
  if (!key) return false;
  const appTitle = String(app.testTitle || '').trim();
  const appId = String(app.testId || '').trim();
  if (appId && card?.id && appId === card.id) return true;
  if (appTitle.toLowerCase() === key.toLowerCase()) return true;
  const cardTitle = String(card?.title || '').trim();
  if (cardTitle && appTitle.toLowerCase() === cardTitle.toLowerCase()) return true;
  const cardSub = String(card?.subcategory || '').trim();
  if (
    cardSub &&
    key.toLowerCase() === cardSub.toLowerCase() &&
    cardTitle &&
    appTitle.toLowerCase() === cardTitle.toLowerCase()
  ) {
    return true;
  }
  return false;
}

function pickPreferredMyTestApplication(applications, routeKey, card) {
  const matches = (applications || []).filter((app) => matchesApplication(app, routeKey, card));
  if (matches.length === 0) return null;
  return (
    matches.find((m) => m.alreadyAppliedInCurrentCycle && !m.mayReapplyForNewCycle) ||
    matches.find((m) => m.mayReapplyForNewCycle && !m.alreadyAppliedInCurrentCycle) ||
    matches[0]
  );
}

function userMayReapplyForNewCycle(resolve) {
  return resolve?.mayReapplyForNewCycle === true && resolve?.alreadyAppliedInCurrentCycle !== true;
}

function userHasAppliedForCurrentCycle(resolve, matchedApplication, lockedTestId = '', card = null) {
  if (userMayReapplyForNewCycle(resolve)) return false;
  if (resolve?.alreadyAppliedInCurrentCycle === true) return true;
  if (resolve?.canStart === true) return true;
  if (matchedApplication) return true;
  const locked = String(lockedTestId || '').trim();
  const cardId = String(card?.id || '').trim();
  if (locked && cardId && locked === cardId) return true;
  return false;
}

function preferStableTestId(matchedApplication, resolve, lockedTestId, catalogCard) {
  const fromApp = String(matchedApplication?.testId || '').trim();
  if (fromApp) return fromApp;
  const locked = String(lockedTestId || '').trim();
  if (locked) return locked;
  const fromResolve = String(resolve?.card?.id || '').trim();
  if (fromResolve) return fromResolve;
  return String(catalogCard?.id || '').trim();
}

function runLogicMirrorTests() {
  let ok = true;
  const app = { testId: 'uuid-a', testTitle: 'SSC CGL Mock 1' };
  const card = { id: 'uuid-a', title: 'SSC CGL Mock 1', subcategory: 'SSC CGL' };

  ok = line(matchesApplication(app, 'SSC CGL Mock 1', card), 'matchesApplication: route title') && ok;
  ok = line(matchesApplication(app, 'SSC CGL', card), 'matchesApplication: subcategory + card title') && ok;
  ok = line(!matchesApplication(app, 'Other Test', null), 'matchesApplication: unrelated route (no card)') && ok;
  ok =
    line(
      !matchesApplication(
        { testId: 'other-id', testTitle: 'Railway Mock' },
        'Banking PO',
        { id: 'uuid-a', title: 'SSC CGL Mock 1', subcategory: 'SSC CGL' },
      ),
      'matchesApplication: unrelated app vs route/card',
    ) && ok;

  ok =
    line(
      userHasAppliedForCurrentCycle({ alreadyAppliedInCurrentCycle: true }, null),
      'userHasAppliedForCurrentCycle: resolve alreadyApplied',
    ) && ok;
  ok =
    line(
      !userHasAppliedForCurrentCycle({ mayReapplyForNewCycle: true }, app),
      'userHasAppliedForCurrentCycle: may reapply new cycle',
    ) && ok;
  ok =
    line(
      userHasAppliedForCurrentCycle(null, app, '', card),
      'userHasAppliedForCurrentCycle: matched application',
    ) && ok;
  ok =
    line(
      userHasAppliedForCurrentCycle(null, null, 'uuid-a', card),
      'userHasAppliedForCurrentCycle: locked test id',
    ) && ok;

  ok =
    line(
      preferStableTestId(app, { card: { id: 'uuid-b' } }, '', { id: 'uuid-c' }) === 'uuid-a',
      'preferStableTestId: prefers application id',
    ) && ok;
  ok =
    line(
      preferStableTestId(null, null, 'uuid-locked', { id: 'uuid-c' }) === 'uuid-locked',
      'preferStableTestId: prefers locked id',
    ) && ok;

  const matched = pickPreferredMyTestApplication([app], 'SSC CGL', card);
  ok = line(matched?.testId === 'uuid-a', 'pickPreferredMyTestApplication: finds by subcategory') && ok;

  const currentCycle = pickPreferredMyTestApplication(
    [
      { testId: 'old', testTitle: 'SSC CGL Mock 1', mayReapplyForNewCycle: true, alreadyAppliedInCurrentCycle: false },
      { testId: 'uuid-a', testTitle: 'SSC CGL Mock 1', alreadyAppliedInCurrentCycle: true, mayReapplyForNewCycle: false },
    ],
    'SSC CGL Mock 1',
    card,
  );
  ok =
    line(
      currentCycle?.testId === 'uuid-a',
      'pickPreferredMyTestApplication: prefers current-cycle row over may-reapply',
    ) && ok;

  return ok;
}

function runStaticChecks() {
  let ok = true;
  const applyState = read('app/src/main/java/com/freemocktest/app/util/TestApplyState.kt');
  const cyclePhase = read('app/src/main/java/com/freemocktest/app/util/TestCyclePhase.kt');
  const contentRepo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const applyScreen = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');
  const startScreen = read('app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt');

  ok = line(applyState.includes('object TestApplyState'), 'TestApplyState.kt exists') && ok;
  ok = line(applyState.includes('pickPreferredMyTestApplication'), 'TestApplyState: pickPreferredMyTestApplication') && ok;
  ok = line(applyState.includes('userHasAppliedForCurrentCycle'), 'TestApplyState: userHasAppliedForCurrentCycle') && ok;
  ok = line(applyState.includes('preferStableTestId'), 'TestApplyState: preferStableTestId') && ok;
  ok = line(applyState.includes('alreadyAppliedInCurrentCycle'), 'TestApplyState: server cycle flags in picker') && ok;

  ok =
    line(
      contentRepo.includes('resolveTestForApply(') &&
        contentRepo.includes('attachResolveToCatalogCard') &&
        contentRepo.includes('loadTestForApplyScreen'),
      'ContentRepository: loadTestForApplyScreen merges catalog + resolve fallback',
    ) && ok;

  ok = mustInclude(applyScreen, 'TestApplyState.pickPreferredMyTestApplication', 'ApplyForTestScreenNew') && ok;
  ok = mustInclude(applyScreen, 'TestApplyState.userHasAppliedForCurrentCycle', 'ApplyForTestScreenNew') && ok;
  ok = mustInclude(applyScreen, 'TestApplyState.preferStableTestId', 'ApplyForTestScreenNew') && ok;
  ok = mustInclude(applyScreen, 'TestCyclePhase.resolveApplyUiState', 'ApplyForTestScreenNew') && ok;
  ok = mustInclude(applyScreen, 'response.alreadyApplied', 'ApplyForTestScreenNew') && ok;

  ok = mustInclude(startScreen, 'TestApplyState.pickPreferredMyTestApplication', 'StartTestPreviewScreenNew') && ok;
  ok = mustInclude(startScreen, 'TestApplyState.resolveAlreadyAppliedFromSources', 'StartTestPreviewScreenNew') && ok;
  ok = mustInclude(startScreen, 'TestCyclePhase.resolvePreviewApplyState', 'StartTestPreviewScreenNew') && ok;
  ok = line(cyclePhase.includes('resolveApplyUiState'), 'TestCyclePhase: shared apply UI state') && ok;
  ok =
    line(
      !startScreen.includes('matchesAppliedTestLookup'),
      'StartTestPreviewScreenNew: removed duplicate matchesAppliedTestLookup',
    ) && ok;

  return ok;
}

function main() {
  console.log('=== verifyApplyOncePhase1 ===\n');
  let ok = runStaticChecks();
  console.log('');
  ok = runLogicMirrorTests() && ok;
  console.log('');
  if (ok) {
    console.log('PASS  Apply-once Phase 1 checks');
    process.exit(0);
  }
  console.error('FAIL  Apply-once Phase 1 checks');
  process.exit(1);
}

main();
