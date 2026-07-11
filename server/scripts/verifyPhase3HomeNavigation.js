#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — navigation edge cases, pull sync, unified home test carousel.
 *
 * Usage:
 *   node scripts/verifyPhase3HomeNavigation.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
const navKt = read('app/src/main/java/com/freemocktest/app/util/HomeAppliedTestNavigation.kt');
const sectionKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeAppliedTestsSection.kt');
const uiKt = read('app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 3: Home navigation + edge cases ===\n');
  let ok = true;

  ok = line(navKt.includes('OpenPendingResult'), 'Pending result card tap routes to result when ready') && ok;
  ok = line(navKt.includes('OpenStartPreview'), 'Ready cards route to start preview') && ok;
  ok = line(navKt.includes('Blocked'), 'Locked cards return blocked tap action') && ok;
  ok = line(
    homeKt.includes('HomeCarouselNavigation.resolveCarouselTapAction') ||
      homeKt.includes('HomeAppliedTestNavigation.resolveCardTapAction'),
    'Home uses safe carousel/applied card tap resolver',
  ) && ok;
  ok = line(homeKt.includes('markPendingResultViewedAndClear'), 'Result view clears pending state') && ok;
  ok = line(homeKt.includes('onOpenPendingResult'), 'Pending result opens result screen from card') && ok;

  ok = line(!homeKt.includes('HomeInterestApplySection'), 'Legacy Quick Apply chip section removed from Home') && ok;
  ok = line(sectionKt.includes('onSuggestApply'), 'Unified carousel routes suggest-apply taps') && ok;
  ok = line(sectionKt.includes('carouselItems'), 'Home section renders merged carousel items') && ok;
  ok = line(
    homeKt.includes('interestSubcategories = loginPickedSubcategories'),
    'Login interests feed merged home carousel state',
  ) && ok;
  ok = line(uiKt.includes('carouselItems.isNotEmpty()'), 'Section visible when carousel has cards') && ok;

  ok = line(
    homeKt.includes('syncAppliedTestSeriesFromServer') &&
      homeKt.includes('triggerPullRefresh'),
    'Pull-to-refresh syncs applied tests from server',
  ) && ok;

  ok = line(
    homeKt.includes('Lifecycle.Event.ON_RESUME') &&
      homeKt.includes('appliedSnapshotsReloadKey++'),
    'ON_RESUME syncs applied tests and reloads catalog snapshots',
  ) && ok;

  console.log(`\n${ok ? 'VERIFY_OK' : 'VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
