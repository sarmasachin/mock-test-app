#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — HP GK full ship verify: runs Phases 0–3 suites + integrated E2E.
 *
 * Usage:
 *   node scripts/verifyPhase4HpGkFullShip.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const serverRoot = path.join(scriptsDir, '..');
const appRoot = path.join(serverRoot, '..');

const phaseScripts = [
  'verifyPhase0HpGkCycle.js',
  'verifyPhase1HpGkCycle.js',
  'verifyPhase2AndroidHpGk.js',
  'verifyPhase3ResultFlow.js',
  'e2eImmediateResultCountdownProof.js',
  'e2eHpGkRescheduleProof.js',
  'verifyExamCycleApplyWindowPhase3.js',
  'verifyStartAccessPhase3.js',
  'e2eHpGkFullCyclePhase4.js',
];

const requiredRunbooks = [
  'PHASE0_HP_GK_CYCLE_RUNBOOK.txt',
  'PHASE1_HP_GK_CYCLE_RUNBOOK.txt',
  'PHASE2_HP_GK_CYCLE_RUNBOOK.txt',
  'PHASE3_HP_GK_RESULT_RUNBOOK.txt',
];

const requiredAppFiles = [
  'app/src/main/java/com/freemocktest/app/util/TestScheduleUtils.kt',
  'app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt',
  'app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt',
  'app/src/main/java/com/freemocktest/app/util/AppliedTestHomeUi.kt',
];

const requiredServerFiles = [
  'server/src/lib/testStartAccess.js',
  'server/src/lib/testApplicationCycle.js',
  'server/src/lib/phase0HpGkCycleSetup.js',
  'server/src/routes/tests.js',
];

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 4: HP GK full ship verification ===\n');
  let ok = true;

  for (const rel of requiredAppFiles) {
    ok = line(fs.existsSync(path.join(appRoot, rel)), `App file: ${rel}`) && ok;
  }

  for (const rel of requiredServerFiles) {
    ok = line(fs.existsSync(path.join(appRoot, rel)), `Server file: ${rel}`) && ok;
  }

  for (const rel of requiredRunbooks) {
    ok = line(fs.existsSync(path.join(serverRoot, rel)), `Runbook: ${rel}`) && ok;
  }

  const apkCandidates = [
    path.join(appRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-PHASE3-HPGK-RESULT.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-PHASE4-HPGK-FULLSHIP.apk'),
  ];
  const apkFound = apkCandidates.find((p) => fs.existsSync(p));
  ok = line(Boolean(apkFound), `Debug APK present (${apkFound ? path.basename(apkFound) : 'run gradlew assembleDebug'})`) && ok;

  const testsJs = fs.readFileSync(path.join(appRoot, 'server/src/routes/tests.js'), 'utf8');
  ok = line(testsJs.includes('buildApplyJsonBody') || testsJs.includes('buildApplyResponseBody'), 'tests.js apply response schedule fields wired') && ok;
  ok = line(testsJs.includes('resolveApplyWindowState'), 'tests.js apply window gate wired') && ok;

  console.log('\n--- Running phase suites ---\n');
  for (const script of phaseScripts) {
    const scriptPath = path.join(scriptsDir, script);
    if (!fs.existsSync(scriptPath)) {
      ok = line(false, `Missing script: ${script}`) && ok;
      continue;
    }
    try {
      execSync(`node "${scriptPath}"`, { stdio: 'inherit', cwd: serverRoot });
      ok = line(true, `${script} passed`) && ok;
    } catch {
      ok = line(false, `${script} FAILED`) && ok;
    }
  }

  console.log(`\n${ok ? 'VERIFY_PHASE4_HP_GK_FULL_SHIP_OK' : 'VERIFY_PHASE4_HP_GK_FULL_SHIP_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
