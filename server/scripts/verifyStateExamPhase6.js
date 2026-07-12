#!/usr/bin/env node
'use strict';

/**
 * Phase 6 verify — catalog seed migration + production ship gate.
 * Run: npm run verify:state-exam-phase6
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  buildCatalogExamCategorySeeds,
  mergeCatalogSeedsIntoExamCategories,
  HIMACHAL_CATALOG_TESTS,
  ALL_INDIA_CATALOG_TESTS,
} = require('../src/lib/catalogExamCategorySeeds');
const { validateExamCategoriesCollisions } = require('../src/lib/examCategoriesAdmin');
const { findStateExamCatalogCollisions } = require('../src/lib/stateExamDynamicSpec');

const root = path.join(__dirname, '..', '..');
const serverDir = path.join(__dirname, '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function runVerify(scriptName) {
  try {
    execSync(`node scripts/${scriptName}`, { cwd: serverDir, stdio: 'pipe' });
    return true;
  } catch (_e) {
    return false;
  }
}

function main() {
  console.log('=== Phase 6: Catalog migration + production ship ===\n');
  let ok = true;

  ok = line(fs.existsSync(path.join(serverDir, 'src/lib/catalogExamCategorySeeds.js')), 'catalogExamCategorySeeds.js exists') && ok;
  ok = line(fs.existsSync(path.join(serverDir, 'scripts/migrateExamCategoriesCatalogSeeds.js')), 'catalog migration script exists') && ok;
  ok = line(fs.existsSync(path.join(serverDir, 'PHASE6_STATE_EXAM_DYNAMIC_RUNBOOK.txt')), 'Phase 6 runbook exists') && ok;

  const seeds = buildCatalogExamCategorySeeds();
  ok = line(seeds.length === HIMACHAL_CATALOG_TESTS.length + ALL_INDIA_CATALOG_TESTS.length, 'catalog seed count matches Android') && ok;
  ok = line(seeds.every((s) => s.iconKey && s.level3), 'every seed has iconKey + level3') && ok;

  const hpSeeds = seeds.filter((s) => s.iconKey.startsWith('hp:'));
  const aiSeeds = seeds.filter((s) => s.iconKey.startsWith('allindia:'));
  ok = line(hpSeeds.length === HIMACHAL_CATALOG_TESTS.length, 'HP seed count') && ok;
  ok = line(aiSeeds.length === ALL_INDIA_CATALOG_TESTS.length, 'All India seed count') && ok;

  const hpIcons = new Set(hpSeeds.map((s) => s.iconKey.toLowerCase()));
  ok = line(hpIcons.size === hpSeeds.length, 'HP iconKeys unique') && ok;

  const merged = mergeCatalogSeedsIntoExamCategories([], {
    tests: [{ id: 't1', title: 'HP TET', subcategory: 'हिमाचल टीईटी' }],
  });
  ok = line(merged.stats.added === seeds.length, 'empty DB gets all seeds') && ok;
  const tetRow = merged.items.find((r) => r.iconKey === 'hp:hp-tet');
  ok = line(tetRow && tetRow.linkedTestId === 't1', 'links test by hindi level3') && ok;

  const second = mergeCatalogSeedsIntoExamCategories(merged.items, { tests: [] });
  ok = line(second.stats.added === 0 && second.stats.skipped === seeds.length, 'idempotent merge') && ok;

  const collisions = findStateExamCatalogCollisions(merged.items);
  ok = line(collisions.length === 0, 'no collisions in raw seeds') && ok;

  const pkg = JSON.parse(read('server/package.json'));
  ok = line(Boolean(pkg.scripts['migrate:state-exam-catalog']), 'npm migrate:state-exam-catalog script') && ok;
  ok = line(Boolean(pkg.scripts['verify:state-exam-ship']), 'npm verify:state-exam-ship script') && ok;

  const plan = read('server/STATE_EXAM_DYNAMIC_PLAN.txt');
  ok = line(plan.includes('Phase 6'), 'master plan documents Phase 6') && ok;

  console.log('\n--- Prior phase verifies (ship gate) ---');
  const phases = [
    'verifyStateExamPhase0.js',
    'verifyStateExamPhase1.js',
    'verifyStateExamPhase2.js',
    'verifyStateExamPhase3.js',
    'verifyStateExamPhase4.js',
    'verifyStateExamPhase5.js',
  ];
  for (const script of phases) {
    const pass = runVerify(script);
    ok = line(pass, `${script} still passes`) && ok;
  }

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_PHASE6_OK' : 'VERIFY_STATE_EXAM_PHASE6_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
