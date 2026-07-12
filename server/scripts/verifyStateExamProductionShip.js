#!/usr/bin/env node
'use strict';

/**
 * Full production ship gate — runs verify:state-exam-phase0 … phase6.
 * Run: npm run verify:state-exam-ship
 */

const { execSync } = require('child_process');
const path = require('path');

const serverDir = path.join(__dirname, '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== State Exam Dynamic — full production ship gate ===\n');
  let ok = true;

  const scripts = [
    'verify:state-exam-phase0',
    'verify:state-exam-phase1',
    'verify:state-exam-phase2',
    'verify:state-exam-phase3',
    'verify:state-exam-phase4',
    'verify:state-exam-phase5',
    'verify:state-exam-phase6',
    'verify:publish-guard',
    'verify:draft-stub-on-create',
    'verify:question-count-auto-sync',
    'verify:add-questions-shortcut',
    'verify:import-feedback-toast',
    'verify:state-exam-fluctuation-off',
    'verify:question-csv-template',
  ];

  for (const script of scripts) {
    try {
      execSync(`npm run ${script}`, { cwd: serverDir, stdio: 'inherit' });
      ok = line(true, script) && ok;
    } catch (_e) {
      ok = line(false, script) && ok;
      break;
    }
  }

  console.log(`\n${ok ? 'VERIFY_STATE_EXAM_SHIP_OK' : 'VERIFY_STATE_EXAM_SHIP_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
