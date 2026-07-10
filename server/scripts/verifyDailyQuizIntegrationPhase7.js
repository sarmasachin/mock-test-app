#!/usr/bin/env node
'use strict';

/**
 * Phase 7 — integration verify for daily quiz login-only + hardening stack.
 *
 * Usage:
 *   node scripts/verifyDailyQuizIntegrationPhase7.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'verifyDailyQuizUserIsolationPhase1.js',
  'verifyDailyQuizServerTruthPhase2.js',
  'verifyDailyQuizLogoutClearPhase3.js',
  'verifyDailyQuizUiRoutingPhase4.js',
  'verifyDailyQuizHardeningPhase5.js',
  'verifyDailyQuizLoginOnlyPhase6.js',
  'verifyDailyQuizLoginOnlyServerPhase8.js',
  'verifyDailyQuizDashboardPhase1.js',
];

function run(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  const res = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
  console.log(out);
  console.log('');
  return res.status === 0;
}

function main() {
  console.log('=== Phase 7: daily quiz integration verify ===\n');
  let ok = true;
  for (const script of SCRIPTS) {
    console.log(`--- ${script} ---`);
    ok = run(script) && ok;
  }
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_INTEGRATION_PHASE7_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_INTEGRATION_PHASE7_FAILED');
  process.exit(1);
}

main();
