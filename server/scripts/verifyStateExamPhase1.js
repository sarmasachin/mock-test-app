#!/usr/bin/env node
'use strict';

/**
 * Phase 1 verify — server wiring for dynamic state exam categories.
 * Run: npm run verify:state-exam-phase1
 */

const fs = require('fs');
const path = require('path');
const {
  normalizeExamCategoriesValue,
  normalizeStateExamSectionTemplates,
  validateExamCategoriesCollisions,
  buildExamCategoriesSettingsForApi,
  mergeExamCategoryRow,
  resolveFinalExamCategoryIconKey,
} = require('../src/lib/examCategoriesAdmin');
const { buildStateExamSectionsForState } = require('../src/lib/stateExamDynamicSpec');

const root = path.join(__dirname, '..', '..');
const adminJs = fs.readFileSync(path.join(root, 'server/src/routes/admin.js'), 'utf8');
const homeJs = fs.readFileSync(path.join(root, 'server/src/routes/home.js'), 'utf8');
const permsJs = fs.readFileSync(path.join(root, 'server/src/lib/adminRoutePermissions.js'), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 1: Dynamic state exam — server wiring ===\n');
  let ok = true;

  ok = line(fs.existsSync(path.join(root, 'server/src/lib/examCategoriesAdmin.js')), 'examCategoriesAdmin.js exists') && ok;
  ok = line(fs.existsSync(path.join(root, 'server/scripts/migrateExamCategoriesStateExam.js')), 'migration script exists') && ok;
  ok = line(fs.existsSync(path.join(root, 'server/PHASE1_STATE_EXAM_DYNAMIC_RUNBOOK.txt')), 'Phase 1 runbook exists') && ok;

  ok = line(adminJs.includes("require('../lib/examCategoriesAdmin')"), 'admin.js imports examCategoriesAdmin') && ok;
  ok = line(adminJs.includes('normalizeExamCategoriesForPatch'), 'admin.js has async normalize on PATCH') && ok;
  ok = line(adminJs.includes('validateExamCategoriesCollisions'), 'admin.js validates collisions') && ok;
  ok = line(adminJs.includes("'stateExamSectionTemplates'"), 'admin.js SETTINGS_KEYS includes templates') && ok;
  ok = line(adminJs.includes('stateExamSectionTemplatesUpdated'), 'admin PATCH response includes templates flag') && ok;

  ok = line(homeJs.includes("require('../lib/examCategoriesAdmin')"), 'home.js imports examCategoriesAdmin') && ok;
  ok = line(homeJs.includes('buildExamCategoriesSettingsForApi'), 'home.js sanitizes examCategories') && ok;
  ok = line(homeJs.includes('stateExamSectionTemplates'), 'home.js loads section templates') && ok;

  ok = line(permsJs.includes('stateExamSectionTemplates'), 'RBAC maps stateExamSectionTemplates') && ok;

  const adminWeb = fs.readFileSync(path.join(root, 'admin-web/src/tabs/AdvancedAdminTabs.tsx'), 'utf8');
  ok = line(adminWeb.includes('sectionSlug'), 'admin-web preserves sectionSlug on load') && ok;
  ok = line(adminWeb.includes('featured'), 'admin-web preserves featured on load') && ok;

  const apiModels = fs.readFileSync(
    path.join(root, 'app/src/main/java/com/freemocktest/app/data/remote/ApiModels.kt'),
    'utf8',
  );
  ok = line(apiModels.includes('sectionSlug'), 'Android DTO has sectionSlug') && ok;
  ok = line(apiModels.includes('featured'), 'Android DTO has featured') && ok;

  // --- normalize legacy row ---
  const legacy = normalizeExamCategoriesValue({
    items: [{ id: 'c1', level1: 'State', level2: 'Bihar', level3: 'Bihar Police', enabled: true }],
  });
  ok = line(legacy.value.items.length === 1, 'legacy row normalizes') && ok;
  ok = line(legacy.value.items[0].sectionSlug === 'police', 'legacy auto sectionSlug') && ok;
  ok = line(legacy.value.items[0].itemSortOrder === 999, 'legacy default itemSortOrder') && ok;
  ok = line(legacy.value.items[0].iconKey === 'br:bihar-police', 'legacy auto iconKey br:bihar-police') && ok;

  // --- merge preserves extended fields when client omits ---
  const merged = mergeExamCategoryRow(
    { id: 'c1', level1: 'State', level2: 'Bihar', level3: 'Bihar Police', enabled: true },
    {
      id: 'c1',
      sectionSlug: 'police',
      featured: true,
      itemSortOrder: 1,
    },
  );
  ok = line(merged.featured === true, 'merge keeps featured from existing') && ok;
  ok = line(merged.itemSortOrder === 1, 'merge keeps itemSortOrder from existing') && ok;

  const renormalized = normalizeExamCategoriesValue(
    { items: [merged] },
    { existingItems: [merged] },
  );
  ok = line(renormalized.value.items[0].featured === true, 're-normalize keeps featured') && ok;

  // --- collision rejected ---
  const collision = validateExamCategoriesCollisions([
    { level1: 'State', level2: 'Bihar', level3: 'Exam A', iconKey: 'br:exam-a', enabled: true },
    { level1: 'State', level2: 'Bihar', level3: 'Exam B', iconKey: 'br:exam-a', enabled: true },
  ]);
  ok = line(!collision.ok && collision.status === 409, 'duplicate iconKey → 409') && ok;

  // --- HP TGT unique under new keys ---
  const tgt = normalizeExamCategoriesValue({
    items: [
      { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP TGT Math', enabled: true },
      { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP TGT Hindi', enabled: true },
    ],
  });
  ok = line(tgt.value.items.length === 2, 'HP TGT Math + Hindi both normalize') && ok;
  ok = line(
    validateExamCategoriesCollisions(tgt.value.items).ok,
    'HP TGT subjects no collision after normalize',
  ) && ok;

  // --- public API builder ---
  const publicBuilt = buildExamCategoriesSettingsForApi(
    { items: [{ id: 'x', level1: 'State', level2: 'MP', level3: 'MP Patwari', enabled: true }] },
    null,
  );
  ok = line(publicBuilt.examCategories.items[0].sectionSlug === 'revenue', 'public API builder adds section') && ok;
  ok = line(publicBuilt.stateExamSectionTemplates.items.length === 11, 'public API includes default templates count') && ok;

  // --- sections for state (used in Phase 3) ---
  const sections = buildStateExamSectionsForState(
    {
      items: [
        {
          level1: 'State',
          level2: 'Bihar',
          level3: 'Bihar Police',
          sectionSlug: 'police',
          itemSortOrder: 1,
          featured: true,
          enabled: true,
          iconKey: 'br:bihar-police',
        },
      ],
    },
    'Bihar',
  );
  ok = line(sections.length === 1 && sections[0].tests[0].featured === true, 'buildStateExamSectionsForState works') && ok;

  // --- Himachal hp: preserved ---
  ok = line(
    resolveFinalExamCategoryIconKey('State', 'Himachal Pradesh', 'HP TET', 'hp:hp-tet') === 'hp:hp-tet',
    'hp: legacy icon preserved on resolve',
  ) && ok;

  // --- templates normalize ---
  const templates = normalizeStateExamSectionTemplates({ items: [] });
  ok = line(templates.value.items.length === 11, 'empty templates → 11 defaults') && ok;

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_PHASE1_OK' : 'VERIFY_STATE_EXAM_PHASE1_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
