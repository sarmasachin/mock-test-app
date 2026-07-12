#!/usr/bin/env node
'use strict';

/**
 * Phase 5 verify — test create/update auto-sync examCategories.
 * Run: npm run verify:state-exam-phase5
 */

const fs = require('fs');
const path = require('path');
const {
  parseStateExamSyncPayload,
  buildExamCategoriesAfterTestSave,
} = require('../src/lib/testExamCategorySync');

const root = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function main() {
  console.log('=== Phase 5: Test ↔ exam category auto-sync ===\n');
  let ok = true;

  ok = line(fs.existsSync(path.join(root, 'server/src/lib/testExamCategorySync.js')), 'testExamCategorySync.js exists') && ok;
  ok = line(fs.existsSync(path.join(root, 'server/PHASE5_STATE_EXAM_DYNAMIC_RUNBOOK.txt')), 'Phase 5 runbook exists') && ok;

  const adminJs = read('server/src/routes/admin.js');
  const syncJs = read('server/src/lib/testExamCategorySync.js');
  const syncFields = read('admin-web/src/components/StateExamTestSyncFields.tsx');
  const appTsx = read('admin-web/src/App.tsx');
  const wizardTab = read('admin-web/src/tabs/StateExamManagerTab.tsx');

  ok = line(adminJs.includes('testExamCategorySync'), 'admin.js imports sync module') && ok;
  ok = line(adminJs.includes('syncExamCategoryForTestSave'), 'POST/PATCH call sync') && ok;
  ok = line(adminJs.includes('examCategorySync'), 'API returns examCategorySync') && ok;
  ok = line(syncJs.includes('buildExamCategoriesAfterTestSave'), 'build sync helper') && ok;
  ok = line(syncJs.includes('linkedTestId'), 'links test id on category row') && ok;
  ok = line(syncFields.includes('buildStateExamSyncApiPayload'), 'All Tests sync payload builder') && ok;
  ok = line(appTsx.includes('StateExamTestSyncFields'), 'All Tests form has sync fields') && ok;
  ok = line(wizardTab.includes('stateExamSync'), 'wizard POST includes stateExamSync') && ok;

  const upsert = parseStateExamSyncPayload({
    stateExamSync: { enabled: true, stateName: 'Bihar', sectionSlug: 'police', featured: true, itemSortOrder: 1 },
  });
  ok = line(upsert.mode === 'upsert' && upsert.stateName === 'Bihar', 'parse upsert payload') && ok;

  const off = parseStateExamSyncPayload({ stateExamSync: { enabled: false } });
  ok = line(off.mode === 'off', 'parse disabled sync') && ok;

  const created = buildExamCategoriesAfterTestSave({
    existingExamCategories: { items: [] },
    sectionTemplates: null,
    test: { id: 'test-uuid-1', title: 'Bihar Police SI', subcategory: 'Bihar Police SI' },
    stateExamSync: upsert,
    previousSubcategory: '',
  });
  ok = line(created.ok && created.value.items.length === 1, 'creates category row on upsert') && ok;
  ok = line(created.value.items[0].linkedTestId === 'test-uuid-1', 'linkedTestId set') && ok;
  ok = line(created.value.items[0].level3 === 'Bihar Police SI', 'level3 = subcategory') && ok;
  ok = line(created.value.items[0].sectionSlug === 'police', 'section from sync') && ok;

  const updated = buildExamCategoriesAfterTestSave({
    existingExamCategories: {
      items: [
        {
          id: 'cat-1',
          level1: 'State',
          level2: 'Bihar',
          level3: 'Old Name',
          linkedTestId: 'test-uuid-2',
          sectionSlug: 'police',
          enabled: true,
        },
      ],
    },
    test: { id: 'test-uuid-2', title: 'Bihar Police SI', subcategory: 'Bihar Police SI' },
    stateExamSync: { mode: 'auto' },
    previousSubcategory: 'Old Name',
  });
  ok = line(updated.ok && updated.value.items[0].level3 === 'Bihar Police SI', 'auto-updates linked row level3') && ok;

  const badSync = parseStateExamSyncPayload({ stateExamSync: { enabled: true } });
  ok = line(Boolean(badSync.error), 'enabled sync requires stateName') && ok;

  const { validateExamCategoriesCollisions } = require('../src/lib/examCategoriesAdmin');
  const collisionCheck = validateExamCategoriesCollisions([
    {
      id: 'a',
      level1: 'State',
      level2: 'Bihar',
      level3: 'Exam A',
      iconKey: 'br:same-key',
      sectionSlug: 'police',
      enabled: true,
      itemSortOrder: 1,
    },
    {
      id: 'b',
      level1: 'State',
      level2: 'Bihar',
      level3: 'Exam B',
      iconKey: 'br:same-key',
      sectionSlug: 'police',
      enabled: true,
      itemSortOrder: 2,
    },
  ]);
  ok = line(!collisionCheck.ok, 'collision validator blocks duplicate iconKey') && ok;

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_PHASE5_OK' : 'VERIFY_STATE_EXAM_PHASE5_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
