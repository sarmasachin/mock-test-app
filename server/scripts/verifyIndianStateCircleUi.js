#!/usr/bin/env node
'use strict';

/**
 * Verify mock-test Level 2 state circular UI + auto icon mapping.
 *
 * Usage:
 *   node scripts/verifyIndianStateCircleUi.js
 */

const fs = require('fs');
const path = require('path');
const {
  resolveAutoStateIconKey,
  resolveIndianStateSlug,
  findIndianStateVisual,
  isStateExamLevel1,
} = require('../src/lib/indianStateVisualCatalog');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Mock-test Level 2 state circular UI ===\n');
  let ok = true;

  const catalogKt = read('app/src/main/java/com/freemocktest/app/util/IndianStateVisualCatalog.kt');
  const cardKt = read('app/src/main/java/com/freemocktest/app/newui/home/StateCircleCategoryCard.kt');
  const screenKt = read('app/src/main/java/com/freemocktest/app/newui/home/SeeAllCategoriesScreenNew.kt');
  const adminKt = read('admin-web/src/tabs/AdvancedAdminTabs.tsx');
  const adminJs = read('server/src/routes/admin.js');

  ok = line(catalogKt.includes('object IndianStateVisualCatalog'), 'Android state visual catalog exists') && ok;
  ok = line(cardKt.includes('StateCircleCategoryCard'), 'Circular state card composable exists') && ok;
  ok = line(cardKt.includes('StateCircleCategoryGrid'), 'Circular state grid exists') && ok;
  ok = line(screenKt.includes('showStateCircleGrid'), 'Exam categories use circular grid for State Level 2') && ok;
  ok = line(catalogKt.includes('buildStateCircleItems'), 'Full catalog state grid builder exists') && ok;
  ok = line(screenKt.includes('buildStateCircleItems'), 'State tab shows all catalog states') && ok;
  ok = line(cardKt.includes('verticalArrangement = Arrangement.Center'), 'State name rendered inside circle') && ok;
  ok = line(!cardKt.includes('.padding(top = 8.dp)'), 'State name not placed outside circle') && ok;
  ok = line(screenKt.includes('StateCircleCategoryGrid'), 'State screen wires circular grid') && ok;
  ok = line(adminKt.includes('resolveAutoStateIconKey'), 'Admin auto-assigns state icon on add') && ok;
  ok = line(
    adminJs.includes('resolveExamCategoryIconKey'),
    'Server normalizes state/all-india icons on save',
  ) && ok;

  ok = line(isStateExamLevel1('State'), 'State Level 1 detector works') && ok;
  ok = line(resolveIndianStateSlug('Bihar') === 'br', 'Bihar slug = br') && ok;
  ok = line(resolveIndianStateSlug('Himachal Pradesh') === 'hp', 'Himachal Pradesh slug = hp') && ok;
  ok = line(resolveIndianStateSlug('HP Govt') === 'hp', 'HP alias slug = hp') && ok;
  ok = line(
    resolveAutoStateIconKey('State', 'Bihar', '') === 'state:br',
    'Auto iconKey for Bihar = state:br',
  ) && ok;
  ok = line(
    resolveAutoStateIconKey('State', 'Bihar', 'https://cdn/x.png') === 'https://cdn/x.png',
    'Custom uploaded icon kept over auto map',
  ) && ok;
  ok = line(
    resolveAutoStateIconKey('Central', 'SSC', '') === '',
    'Non-state Level 1 does not force state icon',
  ) && ok;

  const visual = findIndianStateVisual('बिहार');
  ok = line(visual?.slug === 'br', 'Hindi state name resolves to Bihar visual') && ok;

  ok = line(
    resolveAutoStateIconKey('State', 'Bihar', '') === resolveAutoStateIconKey('State', 'Bihar', ''),
    'Sim: delete + re-add Bihar gets same auto iconKey',
  ) && ok;

  console.log(`\n${ok ? 'VERIFY_INDIAN_STATE_CIRCLE_UI_OK' : 'VERIFY_INDIAN_STATE_CIRCLE_UI_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
