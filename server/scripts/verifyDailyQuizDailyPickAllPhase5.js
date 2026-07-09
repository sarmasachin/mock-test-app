#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — deploy readiness + offline suites + optional live API smoke.
 *
 * Usage:
 *   node scripts/verifyDailyQuizDailyPickAllPhase5.js
 *   node scripts/verifyDailyQuizDailyPickAllPhase5.js --live-api
 *   node scripts/verifyDailyQuizDailyPickAllPhase5.js --live-api https://admin-admin.govmocktest.com/v1
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
  console.log('=== Phase 5: daily quiz daily-pick full release gate ===\n');

  run('verifyDailyQuizDailyPickDeployPhase5.js');
  run('verifyDailyQuizDailyPickIntegratedPhase4.js');

  if (hasFlag('--live-api')) {
    const apiArg = argValue('--live-api');
    const extra = apiArg && !apiArg.startsWith('-') ? ` --api ${apiArg}` : '';
    run('e2eDailyQuizDailyPickLivePhase5.js', extra);
  } else {
    console.log('\n(live API smoke skipped — pass --live-api after VPS deploy)\n');
  }

  console.log('VERIFY_DAILY_QUIZ_DAILY_PICK_ALL_PHASE5_OK');
}

main();
