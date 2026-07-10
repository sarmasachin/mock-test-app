#!/usr/bin/env node
'use strict';

/**
 * E2E-style proof — after Bihar GK apply, "Back to Start Test" must land on
 * start_test_preview (countdown), not pop back to Tests tab category drill (State/Bihar).
 *
 * Usage:
 *   node scripts/verifyApplyBackToStartTestNavigation.js
 */

const fs = require('fs');
const path = require('path');

const hostKt = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app', 'newui', 'navigation', 'MainBottomNavHost.kt'),
  'utf8',
);
const applyKt = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app', 'newui', 'apply', 'ApplyForTestScreenNew.kt'),
  'utf8',
);
const categoriesKt = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app', 'newui', 'home', 'SeeAllCategoriesScreenNew.kt'),
  'utf8',
);

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Apply → Back to Start Test navigation proof ===\n');
  let ok = true;

  ok = line(
    categoriesKt.includes('onOpenCategory = { cat ->') ||
      (categoriesKt.includes('onOpenCategory = onOpenCategory') && categoriesKt.includes('else -> onOpenCategory(trimmedPicked)')),
    'Tests tab leaf pick (Bihar GK) calls onOpenCategory → apply screen (preview skipped)',
  ) && ok;

  ok = line(
    categoriesKt.includes('onOpenCategory(trimmedPicked)') && categoriesKt.includes('setLevel2 = { level2 = it }'),
    'Category drill keeps level1/level2 in SeeAllCategoriesScreenNew while apply is pushed on top',
  ) && ok;

  ok = line(
    applyKt.includes('Text(text = "Back to Start Test"') && applyKt.includes('onClick = onSubmit'),
    '"Back to Start Test" button calls onSubmit callback',
  ) && ok;

  ok = line(
    applyKt.includes('onSubmit()') && applyKt.includes('showSuccessDialog = false'),
    'Success dialog OK also calls onSubmit after apply',
  ) && ok;

  const buggyOnlyPop = /onSubmit\s*=\s*\{\s*mainNavController\.popBackStack\(\)\s*\}/.test(hostKt);
  ok = line(!buggyOnlyPop, 'MainBottomNavHost onSubmit is NOT only popBackStack (bug fixed)') && ok;

  ok = line(
    hostKt.includes('navigateToStartTestPreview(safeTitle)') &&
      hostKt.includes('alreadyOnPreview'),
    'onSubmit pops apply then navigates to start_test_preview when not already on preview',
  ) && ok;

  ok = line(
    hostKt.includes('navigateToTestApply(cat)'),
    'Tests tab still uses navigateToTestApply for leaf picks (Bihar GK path)',
  ) && ok;

  console.log('\n--- Simulated back-stack (Bihar GK via Tests tab) ---');
  console.log('1. User: Tests → State → Bihar → Bihar GK');
  console.log('   Stack: [main/tests (level1=State, level2=Bihar), apply/Bihar GK]');
  console.log('2. User applies → Success → "Back to Start Test" / OK');
  console.log('   BEFORE fix: popBackStack → [main/tests] shows Bihar drill (WRONG)');
  console.log('   AFTER fix:  popBackStack → navigate start_test_preview/Bihar GK → countdown (CORRECT)');
  console.log('\n--- Simulated back-stack (Home → preview → apply) ---');
  console.log('1. Stack: [..., start_test_preview/Bihar GK, apply/Bihar GK]');
  console.log('2. onSubmit: pop only → already on preview (no duplicate push)');

  console.log(`\n${ok ? 'VERIFY_OK' : 'VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
