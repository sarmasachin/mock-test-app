#!/usr/bin/env node
'use strict';

/**
 * Verify All India tab — sectioned circular tests + tap → Apply.
 *
 * Usage:
 *   node scripts/verifyAllIndiaExamCircleUi.js
 */

const fs = require('fs');
const path = require('path');
const {
  isAllIndiaExamLevel1,
  resolveAutoAllIndiaIconKey,
  resolveTestSlug,
} = require('../src/lib/allIndiaExamVisualCatalog');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== All India tab: sectioned circular tests ===\n');
  let ok = true;

  const catalogKt = read('app/src/main/java/com/freemocktest/app/util/AllIndiaExamVisualCatalog.kt');
  const gridKt = read('app/src/main/java/com/freemocktest/app/newui/home/AllIndiaExamSectionedGrid.kt');
  const screenKt = read('app/src/main/java/com/freemocktest/app/newui/home/SeeAllCategoriesScreenNew.kt');
  const adminKt = read('admin-web/src/tabs/AdvancedAdminTabs.tsx');
  const adminJs = read('server/src/routes/admin.js');

  ok = line(catalogKt.includes('object AllIndiaExamVisualCatalog'), 'All India visual catalog exists') && ok;
  ok = line(gridKt.includes('AllIndiaExamSectionedGrid'), 'Sectioned circular grid composable exists') && ok;
  ok = line(screenKt.includes('ExamScopeTabRow'), 'Tests page has State | All India tabs') && ok;
  ok = line(screenKt.includes('showAllIndiaGrid'), 'All India tab renders sectioned grid') && ok;
  ok = line(screenKt.includes('catalogTestSeeds'), 'All India catalog seeds back design when admin empty') && ok;
  ok = line(screenKt.includes('fullAllIndiaNode'), 'All India uses full admin hierarchy') && ok;
  ok = line(screenKt.includes('findAllIndiaNode'), 'All India accepts Central Level 1 fallback') && ok;
  ok = line(screenKt.includes('onOpenTest = onOpenCategory'), 'All India card tap opens Apply route') && ok;
  ok = line(!screenKt.includes('भारत की सभी'), 'Long Hindi page title not embedded') && ok;
  ok = line(adminKt.includes('resolveAutoAllIndiaIconKey'), 'Admin auto-assigns All India test icons') && ok;
  ok = line(adminJs.includes('resolveExamCategoryIconKey'), 'Server normalizes All India icons on save') && ok;

  ok = line(isAllIndiaExamLevel1('All India'), 'All India Level 1 detector works') && ok;
  ok = line(resolveTestSlug('SSC CGL') === 'ssc-cgl', 'SSC CGL slug resolved') && ok;
  ok = line(
    resolveAutoAllIndiaIconKey('All India', 'SSC', 'SSC CGL', '') === 'allindia:ssc-cgl',
    'Auto iconKey for SSC CGL',
  ) && ok;
  ok = line(
    resolveAutoAllIndiaIconKey('All India', 'SSC', 'SSC CGL', 'https://cdn/x.png') === 'https://cdn/x.png',
    'Custom uploaded icon kept',
  ) && ok;

  console.log(`\n${ok ? 'VERIFY_ALL_INDIA_EXAM_CIRCLE_UI_OK' : 'VERIFY_ALL_INDIA_EXAM_CIRCLE_UI_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
