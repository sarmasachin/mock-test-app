#!/usr/bin/env node
'use strict';

/**
 * State exam tests: dynamic_fluctuation_on_publish off (fixed papers).
 * Run: npm run verify:state-exam-fluctuation-off
 */

const fs = require('fs');
const path = require('path');
const {
  isStateExamSyncRequest,
  applyStateExamDynamicFluctuationDefault,
  resolveDynamicFluctuationOnPublishForSave,
} = require('../src/lib/stateExamTestDefaults');

const root = path.join(__dirname, '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== State exam: fluctuation off on publish ===\n');
  let ok = true;

  const adminJs = fs.readFileSync(path.join(root, 'src/routes/admin.js'), 'utf8');
  const helpers = fs.readFileSync(path.join(root, '..', 'admin-web/src/lib/stateExamTestCreateHelpers.ts'), 'utf8');
  const wizard = fs.readFileSync(path.join(root, '..', 'admin-web/src/tabs/StateExamManagerTab.tsx'), 'utf8');
  const regen = adminJs.includes('regenerateTestFromSubcategoryPool');

  ok = line(fs.existsSync(path.join(root, 'src/lib/stateExamTestDefaults.js')), 'stateExamTestDefaults.js exists') && ok;
  ok = line(adminJs.includes('applyStateExamDynamicFluctuationDefault'), 'admin POST applies state exam default') && ok;
  ok = line(adminJs.includes('resolveDynamicFluctuationOnPublishForSave'), 'admin PATCH resolves fluctuation for sync') && ok;
  ok = line(
    adminJs.includes('dynamic_fluctuation_on_publish === false'),
    'regenerate pool skips when fluctuation off',
  ) && ok;
  ok = line(helpers.includes('resolveDynamicFluctuationOnPublishForSave'), 'client forces off when sync on') && ok;
  ok = line(wizard.includes('dynamicFluctuationOnPublish: false'), 'State Exam Manager create sends off') && ok;

  ok = line(isStateExamSyncRequest({ mode: 'upsert' }), 'detects state exam sync request') && ok;
  ok = line(!isStateExamSyncRequest({ mode: 'off' }), 'non-sync request unchanged') && ok;

  const data = { dynamicFluctuationOnPublish: true };
  applyStateExamDynamicFluctuationDefault({
    body: {},
    syncParsed: { mode: 'upsert' },
    data,
  });
  ok = line(data.dynamicFluctuationOnPublish === false, 'server defaults fluctuation off for state exam create') && ok;

  const explicit = { dynamicFluctuationOnPublish: true };
  applyStateExamDynamicFluctuationDefault({
    body: { dynamicFluctuationOnPublish: true },
    syncParsed: { mode: 'upsert' },
    data: explicit,
  });
  ok = line(explicit.dynamicFluctuationOnPublish === true, 'explicit admin override still respected') && ok;

  const patchOff = resolveDynamicFluctuationOnPublishForSave({
    body: {},
    syncParsed: { mode: 'upsert' },
    hasExplicitValue: false,
    explicitValue: true,
    existingValue: true,
  });
  ok = line(patchOff === false, 'PATCH with sync turns fluctuation off when not explicit') && ok;

  const patchKeep = resolveDynamicFluctuationOnPublishForSave({
    body: {},
    syncParsed: { mode: 'off' },
    hasExplicitValue: false,
    explicitValue: true,
    existingValue: true,
  });
  ok = line(patchKeep === true, 'non-state-exam PATCH keeps existing on') && ok;

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_FLUCTUATION_OFF_OK' : 'VERIFY_STATE_EXAM_FLUCTUATION_OFF_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
