#!/usr/bin/env node
'use strict';

/**
 * Phase 8 — full release gate: deploy readiness + offline suites + optional live API smoke.
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopeAllPhase8.js
 *   node scripts/verifyDailyQuizScopeAllPhase8.js --live-api
 *   node scripts/verifyDailyQuizScopeAllPhase8.js --live-api https://admin-admin.govmocktest.com/v1
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const { execSync } = require('child_process');

const SCRIPTS_DIR = __dirname;

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function run(script, extraArgs = '') {
  console.log(`\n>>> ${script}${extraArgs ? ` ${extraArgs}` : ''}\n`);
  execSync(`node "${path.join(SCRIPTS_DIR, script)}"${extraArgs}`, { stdio: 'inherit' });
}

function main() {
  console.log('=== Phase 8: daily quiz scope full release gate ===\n');

  run('verifyDailyQuizScopeDeployPhase8.js');
  run('verifyDailyQuizScopePhase0.js');
  run('verifyDailyQuizScopePhase1.js');
  run('verifyDailyQuizScopePhase2.js');
  run('verifyDailyQuizScopePhase3.js');
  run('verifyDailyQuizScopePhase4.js');
  run('verifyDailyQuizScopePhase7.js');
  run('verifyDailyQuizAndroidScopePhase5.js');
  run('verifyDailyQuizAndroidScopePhase6.js');
  run('verifyDailyQuizDashboardPhase1.js');
  run('verifyDailyQuizDashboardPhase2.js');
  run('verifyDailyQuizDashboardPhase3.js');
  run('verifyDailyQuizDashboardPhase4.js');

  if (hasFlag('--live-api')) {
    const apiArg = argValue('--live-api');
    const extra = apiArg && !apiArg.startsWith('-') ? ` --api ${apiArg}` : '';
    run('e2eDailyQuizScopeLivePhase8.js', extra);
  } else {
    console.log('\n(live API smoke skipped — pass --live-api after VPS deploy)\n');
  }

  console.log('VERIFY_DAILY_QUIZ_SCOPE_ALL_PHASE8_OK');
}

main();
