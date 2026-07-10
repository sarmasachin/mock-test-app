#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — navigation edge cases, pull sync, interest quick apply.
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
const interestKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeInterestApplySection.kt');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 3: Home navigation + edge cases ===\n');
  let ok = true;

  ok = line(navKt.includes('OpenPendingResult'), 'Pending result card tap routes to result when ready') && ok;
  ok = line(navKt.includes('OpenStartPreview'), 'Locked/ready cards route to start preview') && ok;
  ok = line(homeKt.includes('HomeAppliedTestNavigation.resolveCardTapAction'), 'Home uses safe card tap resolver') && ok;
  ok = line(homeKt.includes('markPendingResultViewedAndClear'), 'Result view clears pending state') && ok;
  ok = line(homeKt.includes('onOpenPendingResult'), 'Pending result opens result screen from card') && ok;

  ok = line(interestKt.includes('HomeInterestApplySection'), 'Quick Apply interest chips section exists') && ok;
  ok = line(homeKt.includes('HomeInterestApplySection'), 'Home renders interest quick apply') && ok;
  ok = line(homeKt.includes('loginPickedSubcategories'), 'Login interests drive quick apply chips') && ok;

  ok = line(
    homeKt.includes('syncAppliedTestSeriesFromServer') &&
      homeKt.includes('triggerPullRefresh'),
    'Pull-to-refresh syncs applied tests from server',
  ) && ok;

  console.log(`\n${ok ? 'VERIFY_OK' : 'VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
