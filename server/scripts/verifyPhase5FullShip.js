#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — full ship verify: runs all Home UX phase scripts + server API checks.
 *
 * Usage:
 *   node scripts/verifyPhase5FullShip.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const root = path.join(scriptsDir, '..');
const appRoot = path.join(root, '..');

const phaseScripts = [
  'verifyHomeAppliedTestsSection.js',
  'verifyApplyUxPhases.js',
  'verifyApplyBackToStartTestNavigation.js',
  'verifyPhase3HomeNavigation.js',
  'verifyPhase4CatalogPolish.js',
];

const requiredAppFiles = [
  'app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt',
  'app/src/main/java/com/freemocktest/app/util/AppliedTestCatalogLoader.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeAppliedTestNavigation.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeCategoryNavigation.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/HomeAppliedTestsSection.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/HomeInterestApplySection.kt',
];

const requiredServerPatterns = [
  { file: 'server/src/routes/tests.js', patterns: ['my-applications', '/apply'] },
  { file: 'server/src/routes/admin.js', patterns: ['validateExamCategoriesPatch'] },
];

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 5: Full ship verification ===\n');
  let ok = true;

  for (const rel of requiredAppFiles) {
    const full = path.join(appRoot, rel);
    ok = line(fs.existsSync(full), `App file present: ${rel}`) && ok;
  }

  for (const { file, patterns } of requiredServerPatterns) {
    const full = path.join(appRoot, file);
    if (!fs.existsSync(full)) {
      ok = line(false, `Server file missing: ${file}`) && ok;
      continue;
    }
    const src = fs.readFileSync(full, 'utf8');
    for (const p of patterns) {
      ok = line(src.includes(p), `Server ${file} includes ${p}`) && ok;
    }
  }

  console.log('\n--- Running phase scripts ---\n');
  for (const script of phaseScripts) {
    const scriptPath = path.join(scriptsDir, script);
    if (!fs.existsSync(scriptPath)) {
      ok = line(false, `Missing script: ${script}`) && ok;
      continue;
    }
    try {
      execSync(`node "${scriptPath}"`, { stdio: 'inherit', cwd: root });
      ok = line(true, `${script} passed`) && ok;
    } catch {
      ok = line(false, `${script} FAILED`) && ok;
    }
  }

  console.log(`\n${ok ? 'PHASE5_SHIP_VERIFY_OK' : 'PHASE5_SHIP_VERIFY_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
