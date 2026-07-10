#!/usr/bin/env node
'use strict';

/**
 * Verify apply UX phases: single-button confirm + State exam direct apply shortcut.
 *
 * Usage:
 *   node scripts/verifyApplyUxPhases.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const applyKt = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');
const categoriesKt = read('app/src/main/java/com/freemocktest/app/newui/home/SeeAllCategoriesScreenNew.kt');
const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
const hostKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Apply UX + Home Applied Tests phases ===\n');
  let ok = true;

  ok = line(!applyKt.includes('revealSubmitSection'), 'Apply screen removed two-step revealSubmitSection flow') && ok;
  ok = line(applyKt.includes('showApplyConfirmDialog'), 'Single apply button opens confirm dialog') && ok;
  ok = line(applyKt.includes('fun submitApplication()'), 'Submit logic centralized in submitApplication()') && ok;
  ok = line(applyKt.includes('Apply for $resolvedTestName'), 'Apply button shows test name') && ok;

  ok = line(categoriesKt.includes('soleChildApplyTarget'), 'Shared sole-child apply shortcut helper') && ok;
  ok = line(categoriesKt.includes('isStateExamLevel1(level1)'), 'State exams use direct apply when one child') && ok;
  ok = line(categoriesKt.includes('directApplyTargetForLevel2Pick'), 'Level-2 pick resolves direct apply target') && ok;

  ok = line(homeKt.includes('HomeAppliedTestsSection'), 'Option A: Home applied cards section') && ok;
  ok = line(homeKt.includes('startTestSubtitle') || homeKt.includes('startSeriesState.routeName'), 'Option E: smart Start test routing') && ok;
  ok = line(hostKt.includes('navigateToStartTestPreview(safeTitle)'), 'Apply success navigates to Start Test preview') && ok;
  ok = line(hostKt.includes('HomeCategoryNavigation.resolveOpenTarget'), 'Home category chip smart routing (Phase 2+)') && ok;
  ok = line(read('app/src/main/java/com/freemocktest/app/util/HomeCategoryNavigation.kt').includes('OpenTarget.Apply'), 'Single-test subcategory opens apply directly') && ok;
  ok = line(homeKt.includes('My Applied Tests'), 'Drawer link to applied tests list') && ok;

  console.log(`\n${ok ? 'VERIFY_OK' : 'VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
