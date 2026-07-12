#!/usr/bin/env node
'use strict';

/**
 * Phase 0 verify — dynamic state exam catalog spec (offline, no DB).
 * Run: npm run verify:state-exam-phase0
 */

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_STATE_EXAM_SECTION_TEMPLATES,
  normalizeSlugPart,
  normalizeSectionSlug,
  buildStateExamIconKey,
  suggestSectionSlugFromLevel3,
  normalizeStateExamCategoryRow,
  migrateLegacyExamCategoryRow,
  sortStateExamItems,
  buildStateExamSectionsForState,
  findStateExamCatalogCollisions,
  auditStateExamTestAlignment,
  buildWizardExamCategoryDraft,
  compareStateExamItems,
} = require('../src/lib/stateExamDynamicSpec');

const root = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 0: Dynamic state exam catalog spec ===\n');
  let ok = true;

  // --- Files exist ---
  ok = line(fs.existsSync(path.join(root, 'server/STATE_EXAM_DYNAMIC_PLAN.txt')), 'STATE_EXAM_DYNAMIC_PLAN.txt exists') && ok;
  ok = line(fs.existsSync(path.join(root, 'server/PHASE0_STATE_EXAM_DYNAMIC_RUNBOOK.txt')), 'PHASE0_STATE_EXAM_DYNAMIC_RUNBOOK.txt exists') && ok;
  ok = line(fs.existsSync(path.join(root, 'server/src/lib/stateExamDynamicSpec.js')), 'stateExamDynamicSpec.js exists') && ok;

  // --- Default templates ---
  ok = line(DEFAULT_STATE_EXAM_SECTION_TEMPLATES.length === 11, '11 default section templates') && ok;
  ok = line(
    DEFAULT_STATE_EXAM_SECTION_TEMPLATES.some((t) => t.slug === 'police' && t.sortOrder === 30),
    'police section template sortOrder 30',
  ) && ok;
  ok = line(
    DEFAULT_STATE_EXAM_SECTION_TEMPLATES.some((t) => t.slug === 'other' && t.sortOrder === 99),
    'other section is last (99)',
  ) && ok;

  // --- Slug normalization ---
  ok = line(normalizeSlugPart('Bihar Police Constable') === 'bihar-police-constable', 'slug from title') && ok;
  ok = line(normalizeSlugPart('HP T.G.T. Computer') === 'hp-t-g-t-computer', 'dots stripped from slug') && ok;
  ok = line(normalizeSectionSlug('') === 'other', 'empty section → other') && ok;

  // --- Icon key factory ---
  ok = line(
    buildStateExamIconKey('State', 'Bihar', 'Bihar Police Constable', '') === 'br:bihar-police-constable',
    'Bihar iconKey br:bihar-police-constable',
  ) && ok;
  ok = line(
    buildStateExamIconKey('State', 'Himachal Pradesh', 'HP TET', 'hp:hp-tet') === 'hp:hp-tet',
    'legacy hp: icon preserved',
  ) && ok;
  ok = line(
    buildStateExamIconKey('All India', 'SSC', 'SSC CGL', 'allindia:ssc-cgl') === 'allindia:ssc-cgl',
    'legacy allindia: icon preserved',
  ) && ok;
  ok = line(
    buildStateExamIconKey('State', 'Bihar', 'X', 'https://cdn.example.com/icon.png') === 'https://cdn.example.com/icon.png',
    'custom HTTPS icon preserved',
  ) && ok;

  // --- Section suggestion heuristic ---
  ok = line(suggestSectionSlugFromLevel3('Bihar Police Constable') === 'police', 'suggest police') && ok;
  ok = line(suggestSectionSlugFromLevel3('HP Math Teacher') === 'teaching', 'suggest teaching') && ok;
  ok = line(suggestSectionSlugFromLevel3('HP Staff Nurse') === 'medical', 'suggest medical') && ok;
  ok = line(suggestSectionSlugFromLevel3('MP Patwari') === 'revenue', 'suggest revenue') && ok;

  // --- Legacy row migration ---
  const legacy = migrateLegacyExamCategoryRow({
    id: 'exam-cat-1',
    level1: 'State',
    level2: 'Bihar',
    level3: 'Bihar Police Constable',
    iconKey: '',
    enabled: true,
  });
  ok = line(legacy.ok, 'legacy row normalizes') && ok;
  ok = line(legacy.row.sectionSlug === 'police', 'legacy auto sectionSlug police') && ok;
  ok = line(legacy.row.itemSortOrder === 999, 'legacy default itemSortOrder 999') && ok;
  ok = line(legacy.row.featured === false, 'legacy default featured false') && ok;
  ok = line(legacy.row.iconKey === 'br:bihar-police-constable', 'legacy auto iconKey') && ok;

  // --- Sort: featured first, then itemSortOrder ---
  const sorted = sortStateExamItems([
    { level3: 'Z Exam', featured: false, itemSortOrder: 5 },
    { level3: 'A Featured', featured: true, itemSortOrder: 99 },
    { level3: 'B Early', featured: false, itemSortOrder: 1 },
  ]);
  ok = line(sorted[0].level3 === 'A Featured', 'featured first') && ok;
  ok = line(sorted[1].level3 === 'B Early', 'itemSortOrder second') && ok;
  ok = line(sorted[2].level3 === 'Z Exam', 'alphabet last tie') && ok;
  ok = line(compareStateExamItems(sorted[0], sorted[1]) < 0, 'compareStateExamItems consistent') && ok;

  // --- Build sections for Bihar (multi-section) ---
  const biharCats = {
    items: [
      { level1: 'State', level2: 'Bihar', level3: 'Bihar Police Constable', sectionSlug: 'police', itemSortOrder: 1, featured: true, enabled: true },
      { level1: 'State', level2: 'Bihar', level3: 'Bihar TET', sectionSlug: 'teaching', itemSortOrder: 2, enabled: true },
      { level1: 'State', level2: 'Bihar', level3: 'Bihar GK', sectionSlug: 'gk', itemSortOrder: 1, enabled: true },
    ],
  };
  const biharSections = buildStateExamSectionsForState(biharCats, 'Bihar');
  ok = line(biharSections.length === 3, 'Bihar has 3 sections') && ok;
  ok = line(biharSections[0].sectionSlug === 'gk', 'gk section first (sortOrder 10)') && ok;
  ok = line(biharSections[1].sectionSlug === 'police', 'police section second') && ok;
  ok = line(
    biharSections[1].tests[0].applyTestName === 'Bihar Police Constable' && biharSections[1].tests[0].featured === true,
    'featured police test in police section',
  ) && ok;

  // --- TGT subjects: new iconKey format is unique (fixes old hp-tgt collision) ---
  const tgtMath = buildStateExamIconKey('State', 'Himachal Pradesh', 'HP TGT Math', '');
  const tgtHindi = buildStateExamIconKey('State', 'Himachal Pradesh', 'HP TGT Hindi', '');
  ok = line(tgtMath === 'hp:hp-tgt-math' && tgtHindi === 'hp:hp-tgt-hindi', 'HP TGT subjects get unique iconKeys') && ok;
  ok = line(tgtMath !== tgtHindi, 'HP TGT Math ≠ HP TGT Hindi iconKey') && ok;

  const tgtCollision = findStateExamCatalogCollisions([
    { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP TGT Math', enabled: true },
    { level1: 'State', level2: 'Himachal Pradesh', level3: 'HP TGT Hindi', enabled: true },
  ]);
  ok = line(tgtCollision.length === 0, 'HP TGT Math + Hindi no collision under new spec') && ok;

  const dupLevel3 = findStateExamCatalogCollisions([
    { level1: 'State', level2: 'Bihar', level3: 'Bihar Police', enabled: true },
    { level1: 'State', level2: 'Bihar', level3: 'bihar police', enabled: true },
  ]);
  ok = line(dupLevel3.some((c) => c.type === 'duplicate_level3'), 'duplicate level3 same state detected') && ok;

  // --- Audit alignment ---
  const goodAudit = auditStateExamTestAlignment(biharCats, [
    { id: 't1', title: 'Police Mock', subcategory: 'Bihar Police Constable' },
    { id: 't2', title: 'TET Mock', subcategory: 'Bihar TET' },
    { id: 't3', title: 'GK Mock', subcategory: 'Bihar GK' },
  ]);
  ok = line(goodAudit.ok, 'audit OK when subs match categories') && ok;

  const badAudit = auditStateExamTestAlignment(biharCats, [
    { title: 'Orphan', subcategory: 'Unknown Exam' },
  ]);
  ok = line(!badAudit.ok && badAudit.testsNotInCategories.length === 1, 'audit fails on orphan test') && ok;

  // --- Wizard draft ---
  const draft = buildWizardExamCategoryDraft({
    stateName: 'Madhya Pradesh',
    sectionSlug: 'revenue',
    testTitle: 'MP Patwari Mock 1',
    testId: 'uuid-123',
    featured: true,
    itemSortOrder: 1,
  });
  ok = line(draft.ok, 'wizard draft builds') && ok;
  ok = line(draft.row.level1 === 'State' && draft.row.level2 === 'Madhya Pradesh', 'wizard level1/2') && ok;
  ok = line(draft.row.level3 === 'MP Patwari Mock 1', 'wizard level3 = test title') && ok;
  ok = line(draft.row.sectionSlug === 'revenue', 'wizard sectionSlug') && ok;
  ok = line(draft.row.linkedTestId === 'uuid-123', 'wizard linkedTestId') && ok;
  ok = line(draft.row.featured === true, 'wizard featured') && ok;
  ok = line(draft.row.iconKey === 'mp:mp-patwari-mock-1', 'wizard auto iconKey mp:...') && ok;

  // --- Invalid row rejected ---
  const invalid = normalizeStateExamCategoryRow({ level1: 'State', level2: '', level3: 'X' });
  ok = line(!invalid.ok, 'missing level2 rejected') && ok;

  // --- Phase 0 must not touch admin.js normalize yet ---
  const adminJs = fs.readFileSync(path.join(root, 'server/src/routes/admin.js'), 'utf8');
  ok = line(!adminJs.includes('stateExamDynamicSpec'), 'admin.js uses examCategoriesAdmin wrapper (not inline spec)') && ok;

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_PHASE0_OK' : 'VERIFY_STATE_EXAM_PHASE0_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
