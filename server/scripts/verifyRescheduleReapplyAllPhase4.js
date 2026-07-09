#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — run all reschedule/re-apply verification suites (offline).
 *
 * Usage:
 *   node scripts/verifyRescheduleReapplyAllPhase4.js
 *   node scripts/verifyRescheduleReapplyAllPhase4.js --with-live
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = __dirname;

const OFFLINE_SUITES = [
  'verifyAdminRescheduleReapplyPhase9.js',
  'verifyExamCycleAdminPublishPhase4.js',
  'verifyExamCycleMyApplicationsPhase2.js',
  'verifyAndroidReapplyPhase3.js',
  'verifyRescheduleReapplyIntegratedPhase4.js',
  'verifyExamCycleApplicationPhase5.js',
  'verifyApplyCyclePhase7.js',
  'e2eApplyScreenIsolationPhase4.js',
  'verifyAdminRescheduleWarningPhase5.js',
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function run(script) {
  console.log(`\n>>> ${script}\n`);
  execSync(`node "${path.join(SCRIPTS_DIR, script)}"`, { stdio: 'inherit' });
}

function main() {
  console.log('=== Phase 4: all reschedule/re-apply suites ===');
  for (const script of OFFLINE_SUITES) {
    run(script);
  }
  if (hasFlag('--with-live')) {
    run('e2eRescheduleReapplyLivePhase4.js');
  } else {
    console.log('\n(live API smoke skipped — pass --with-live to run e2eRescheduleReapplyLivePhase4.js)\n');
  }
  console.log('VERIFY_RESCHEDULE_REAPPLY_ALL_PHASE4_OK');
}

main();
