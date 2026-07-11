#!/usr/bin/env node
'use strict';

/**
 * Verify Himachal Pradesh inner page — sectioned circular tests + tap → Apply.
 *
 * Usage:
 *   node scripts/verifyHimachalExamCircleUi.js
 */

const fs = require('fs');
const path = require('path');
const {
  isHimachalStateLevel2,
  resolveAutoHimachalIconKey,
  resolveTestSlug,
} = require('../src/lib/himachalExamVisualCatalog');
const { resolveExamCategoryIconKey } = require('../src/lib/allIndiaExamVisualCatalog');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Himachal inner page: sectioned circular tests ===\n');
  let ok = true;

  const catalogKt = read('app/src/main/java/com/freemocktest/app/util/HimachalExamVisualCatalog.kt');
  const gridKt = read('app/src/main/java/com/freemocktest/app/newui/home/HimachalExamSectionedGrid.kt');
  const screenKt = read('app/src/main/java/com/freemocktest/app/newui/home/SeeAllCategoriesScreenNew.kt');
  const adminKt = read('admin-web/src/tabs/AdvancedAdminTabs.tsx');
  const adminJs = read('server/src/routes/admin.js');

  ok = line(catalogKt.includes('object HimachalExamVisualCatalog'), 'Himachal visual catalog exists') && ok;
  ok = line(gridKt.includes('HimachalExamSectionedGrid'), 'Himachal sectioned grid composable exists') && ok;
  ok = line(screenKt.includes('showHimachalInnerGrid'), 'State drill shows Himachal inner grid') && ok;
  ok = line(screenKt.includes('catalogTestSeeds'), 'Himachal catalog seeds back inner design when admin empty') && ok;
  ok = line(screenKt.includes('fullStateNode'), 'Himachal uses full admin hierarchy (not interest-filtered)') && ok;
  ok = line(screenKt.includes('HimachalExamSectionedGrid'), 'Himachal grid wired in Tests screen') && ok;
  ok = line(screenKt.includes('onOpenTest = onOpenCategory'), 'Himachal card tap opens Apply route') && ok;
  ok = line(!screenKt.includes('हिमाचल प्रदेश परीक्षा पोर्टल'), 'Long Hindi portal title not embedded') && ok;
  ok = line(adminKt.includes('resolveAutoHimachalIconKey'), 'Admin auto-assigns Himachal test icons') && ok;
  ok = line(adminJs.includes('resolveExamCategoryIconKey'), 'Server normalizes Himachal icons on save') && ok;

  ok = line(isHimachalStateLevel2('Himachal Pradesh'), 'Himachal Level 2 detector works') && ok;
  ok = line(resolveTestSlug('HP TET') === 'hp-tet', 'HP TET slug resolved') && ok;
  ok = line(
    resolveAutoHimachalIconKey('State', 'Himachal Pradesh', 'HP TET', '') === 'hp:hp-tet',
    'Auto iconKey for HP TET',
  ) && ok;
  ok = line(
    resolveExamCategoryIconKey('State', 'Himachal Pradesh', 'HP Patwari', '') === 'hp:hp-patwari',
    'resolveExamCategoryIconKey prefers hp: for Himachal tests',
  ) && ok;
  ok = line(
    resolveAutoHimachalIconKey('State', 'Himachal Pradesh', 'HP TET', 'https://cdn/x.png') === 'https://cdn/x.png',
    'Custom uploaded icon kept',
  ) && ok;

  console.log(`\n${ok ? 'VERIFY_HIMACHAL_EXAM_CIRCLE_UI_OK' : 'VERIFY_HIMACHAL_EXAM_CIRCLE_UI_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
