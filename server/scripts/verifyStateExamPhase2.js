#!/usr/bin/env node
'use strict';

/**
 * Phase 2 verify — State Exam Manager admin wizard.
 * Run: npm run verify:state-exam-phase2
 */

const fs = require('fs');
const path = require('path');
const { buildWizardExamCategoryDraft } = require('../src/lib/stateExamDynamicSpec');

const root = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 2: State Exam Manager wizard ===\n');
  let ok = true;

  const wizardTab = path.join(root, 'admin-web/src/tabs/StateExamManagerTab.tsx');
  const wizardLib = path.join(root, 'admin-web/src/lib/stateExamWizard.ts');
  const appTsx = fs.readFileSync(path.join(root, 'admin-web/src/App.tsx'), 'utf8');
  const tabTypes = fs.readFileSync(path.join(root, 'admin-web/src/tabTypes.ts'), 'utf8');
  const rbac = fs.readFileSync(path.join(root, 'admin-web/src/lib/adminRbac.ts'), 'utf8');
  const appCss = fs.readFileSync(path.join(root, 'admin-web/src/App.css'), 'utf8');

  ok = line(fs.existsSync(wizardTab), 'StateExamManagerTab.tsx exists') && ok;
  ok = line(fs.existsSync(wizardLib), 'stateExamWizard.ts exists') && ok;
  ok = line(fs.existsSync(path.join(root, 'server/PHASE2_STATE_EXAM_DYNAMIC_RUNBOOK.txt')), 'Phase 2 runbook exists') && ok;

  ok = line(tabTypes.includes('stateExamManager'), 'tabTypes includes stateExamManager') && ok;
  ok = line(rbac.includes('stateExamManager'), 'adminRbac maps stateExamManager tab') && ok;
  ok = line(rbac.includes("'stateExamManager'"), 'stateExamManager in ALL_NAV_TABS') && ok;
  ok = line(appTsx.includes('StateExamManagerTabImpl'), 'App.tsx wires State Exam Manager tab') && ok;
  ok = line(appTsx.includes("tab === 'stateExamManager'"), 'App.tsx renders stateExamManager') && ok;
  ok = line(appCss.includes('state-exam-manager-grid'), 'wizard CSS present') && ok;

  const wizardSrc = fs.readFileSync(wizardLib, 'utf8');
  ok = line(wizardSrc.includes('collectWizardWarnings'), 'client warning collector') && ok;
  ok = line(wizardSrc.includes('buildWizardCategoryDraft'), 'client draft builder') && ok;
  ok = line(wizardSrc.includes('mergeCategoryRow'), 'client merge by state+level3') && ok;
  ok = line(
    fs.readFileSync(path.join(root, 'admin-web/src/lib/indianStateVisualCatalog.ts'), 'utf8').includes('INDIA_STATE_OPTIONS'),
    'uses 36 state dropdown data',
  ) && ok;

  const tabSrc = fs.readFileSync(wizardTab, 'utf8');
  ok = line(tabSrc.includes('/admin/settings'), 'wizard loads settings') && ok;
  ok = line(tabSrc.includes('/admin/tests'), 'wizard loads tests list') && ok;
  ok = line(tabSrc.includes('featured'), 'featured toggle in UI') && ok;
  ok = line(tabSrc.includes('itemSortOrder'), 'sort order in UI') && ok;
  ok = line(tabSrc.includes("post('/admin/tests'"), 'can create draft test') && ok;
  ok = line(
    fs.existsSync(path.join(root, 'admin-web/src/components/StateExamSectionTemplatesEditor.tsx')),
    'section templates editor exists',
  ) && ok;
  ok = line(tabSrc.includes('StateExamSectionTemplatesEditor'), 'wizard wires section editor') && ok;
  ok = line(wizardSrc.includes('addSectionTemplate'), 'client add section helper') && ok;
  ok = line(appTsx.includes('stateExamSectionTemplates'), 'All Tests loads section templates') && ok;
  ok = line(
    fs.readFileSync(path.join(root, 'admin-web/src/components/StateExamTestSyncFields.tsx'), 'utf8').includes('sections?:'),
    'test sync uses dynamic sections',
  ) && ok;

  const draft = buildWizardExamCategoryDraft({
    stateName: 'Bihar',
    sectionSlug: 'police',
    testTitle: 'Bihar Police SI',
    testId: 'uuid-1',
    featured: true,
    itemSortOrder: 1,
  });
  ok = line(draft.ok && draft.row.level2 === 'Bihar', 'server draft aligns with wizard') && ok;
  ok = line(draft.row.sectionSlug === 'police', 'server draft section police') && ok;
  ok = line(draft.row.featured === true, 'server draft featured') && ok;

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_PHASE2_OK' : 'VERIFY_STATE_EXAM_PHASE2_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
