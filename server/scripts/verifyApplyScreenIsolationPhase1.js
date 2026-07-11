'use strict';

/**
 * Phase 1 — Start Test screen isolation (offline mirror of StartTestPreviewScreenNew.kt).
 * Specific catalog routes must not be replaced by the global applied-tests list.
 */

const fs = require('fs');
const path = require('path');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function deriveStartPreviewUi({
  isListRoute,
  carouselCount,
  showLoading,
  hasSpecificTest,
  specificStartEntry,
  resolveAlreadyApplied,
}) {
  const showAppliedList = isListRoute && carouselCount > 0;
  const showSpecificStart =
    !showAppliedList && !showLoading && hasSpecificTest && specificStartEntry != null;
  const showSpecificApply =
    !showAppliedList && !showLoading && hasSpecificTest &&
    !showSpecificStart && !resolveAlreadyApplied;
  return { showAppliedList, showSpecificStart, showSpecificApply };
}

let ok = true;

const kt = read('app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt');
ok = line(
  /val showAppliedList = isListRoute && appliedHomeState\.carouselItems\.isNotEmpty\(\)/.test(kt),
  'Kotlin: showAppliedList gated by isListRoute + full carousel',
) && ok;
ok = line(
  !/val showAppliedList = activeAppliedEntries\.isNotEmpty\(\)/.test(kt),
  'Kotlin: removed unscoped applied-list takeover',
) && ok;

// User applied HP GK, opens ff from Tests list (specific route).
const ffNotApplied = deriveStartPreviewUi({
  isListRoute: false,
  carouselCount: 1,
  showLoading: false,
  hasSpecificTest: true,
  specificStartEntry: null,
  resolveAlreadyApplied: false,
});
ok = line(ffNotApplied.showAppliedList === false, 'ff route: no global applied list') && ok;
ok = line(ffNotApplied.showSpecificApply === true, 'ff route: shows Apply Now') && ok;

// User applied HP GK, opens HP GK (specific route).
const hpGkApplied = deriveStartPreviewUi({
  isListRoute: false,
  carouselCount: 1,
  showLoading: false,
  hasSpecificTest: true,
  specificStartEntry: { testName: 'HP GK' },
  resolveAlreadyApplied: true,
});
ok = line(hpGkApplied.showAppliedList === false, 'HP GK route: no global applied list') && ok;
ok = line(hpGkApplied.showSpecificStart === true, 'HP GK route: shows its own start card') && ok;

// Home → Start Test ("applied" list route) with applications.
const homeList = deriveStartPreviewUi({
  isListRoute: true,
  carouselCount: 2,
  showLoading: false,
  hasSpecificTest: false,
  specificStartEntry: null,
  resolveAlreadyApplied: false,
});
ok = line(homeList.showAppliedList === true, 'applied route: shows full carousel list') && ok;
ok = line(homeList.showSpecificStart === false, 'applied route: hides specific start') && ok;

// Home list route, interests only (e.g. Bihar GK suggest card).
const homeInterestOnly = deriveStartPreviewUi({
  isListRoute: true,
  carouselCount: 1,
  showLoading: false,
  hasSpecificTest: false,
  specificStartEntry: null,
  resolveAlreadyApplied: false,
});
ok = line(homeInterestOnly.showAppliedList === true, 'applied route: shows suggest cards when no applied tests') && ok;

// Home list route, nothing applied and no interests.
const homeEmpty = deriveStartPreviewUi({
  isListRoute: true,
  carouselCount: 0,
  showLoading: false,
  hasSpecificTest: false,
  specificStartEntry: null,
  resolveAlreadyApplied: false,
});
ok = line(homeEmpty.showAppliedList === false, 'applied route empty: no applied list') && ok;

if (ok) {
  console.log('\nAPPLY_SCREEN_ISOLATION_PHASE1_OK');
  process.exit(0);
}
console.log('\nAPPLY_SCREEN_ISOLATION_PHASE1_FAILED');
process.exit(1);
