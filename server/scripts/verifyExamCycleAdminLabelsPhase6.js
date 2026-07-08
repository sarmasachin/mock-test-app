#!/usr/bin/env node
'use strict';

/**
 * Phase 6 verify — admin UI labels distinguish attempt duration vs exam cycle.
 *
 * Usage:
 *   node scripts/verifyExamCycleAdminLabelsPhase6.js
 */

const fs = require('fs');
const path = require('path');
const { CYCLE_MODES, classifyCycleMode } = require('../src/lib/testCycleWindow');

const ROOT = path.join(__dirname, '..', '..');
const APP_TSX = path.join(ROOT, 'admin-web', 'src', 'App.tsx');
const LABELS_TS = path.join(ROOT, 'admin-web', 'src', 'lib', 'testCycleLabels.ts');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function classifyCycleModeInput(input) {
  const examDate = String(input.examDate || '').trim();
  const dateOn = input.dynamicDateEnabled === true;
  const cycleDays = Math.max(0, Number(input.dateCycleDays || 0));
  if (examDate) {
    return dateOn && cycleDays > 0
      ? CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS
      : CYCLE_MODES.SCHEDULED_SINGLE;
  }
  if (dateOn && cycleDays > 0) return CYCLE_MODES.ROLLING_NO_EXAM_DATE;
  return CYCLE_MODES.MANUAL_NO_AUTO_CYCLE;
}

function main() {
  console.log('=== Phase 6: admin UI cycle labels ===\n');
  let ok = true;

  ok =
    line(
      classifyCycleModeInput({ examDate: '', dynamicDateEnabled: false, dateCycleDays: 0 }) ===
        CYCLE_MODES.MANUAL_NO_AUTO_CYCLE,
      'UI mode mirror: ff → Mode C',
    ) && ok;
  ok =
    line(
      classifyCycleModeInput({
        examDate: '2026-07-12',
        dynamicDateEnabled: true,
        dateCycleDays: 3,
      }) === CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS,
      'UI mode mirror: HP GK → Mode A',
    ) && ok;
  ok =
    line(
      classifyCycleModeInput({ examDate: '', dynamicDateEnabled: true, dateCycleDays: 7 }) ===
        CYCLE_MODES.ROLLING_NO_EXAM_DATE,
      'UI mode mirror: rolling → Mode B',
    ) && ok;
  ok =
    line(
      classifyCycleMode({
        is_published: true,
        exam_date: '2026-07-12',
        dynamic_date_enabled: true,
        date_cycle_days: 3,
      }) === classifyCycleModeInput({
        examDate: '2026-07-12',
        dynamicDateEnabled: true,
        dateCycleDays: 3,
      }),
      'admin classifyCycleModeInput matches server classifyCycleMode',
    ) && ok;

  const labelsSrc = fs.readFileSync(LABELS_TS, 'utf8');
  const appSrc = fs.readFileSync(APP_TSX, 'utf8');

  ok = line(labelsSrc.includes('ATTEMPT_DURATION_LABEL'), 'testCycleLabels.ts: attempt duration label') && ok;
  ok =
    line(
      labelsSrc.includes('Does NOT control catalog republish'),
      'testCycleLabels.ts: duration disclaimer',
    ) && ok;
  ok =
    line(
      labelsSrc.includes('formatListAttemptLine') && labelsSrc.includes('formatListCycleLine'),
      'testCycleLabels.ts: list formatters',
    ) && ok;

  ok = line(appSrc.includes("from './lib/testCycleLabels'"), 'App.tsx imports testCycleLabels') && ok;
  ok = line(appSrc.includes('ATTEMPT_DURATION_LABEL'), 'App.tsx uses Attempt duration label') && ok;
  ok =
    line(
      appSrc.includes('Exam cycle (repeat schedule)') && appSrc.includes('cycleModeUi.hint'),
      'App.tsx: exam cycle section + live mode hint',
    ) && ok;
  ok =
    line(
      appSrc.includes('formatListAttemptLine') && appSrc.includes('formatListCycleLine'),
      'App.tsx: list shows Attempt vs Cycle separately',
    ) && ok;
  ok =
    line(
      !appSrc.includes('duration + gap minutes'),
      'App.tsx: removed misleading duration+cycle republish tooltip',
    ) && ok;
  ok =
    line(
      appSrc.includes('Shuffle: On') && appSrc.includes('dynamic fluctuation (shuffle)'),
      'App.tsx: fluctuation labeled as shuffle (not cycle)',
    ) && ok;
  ok =
    line(
      fs.readFileSync(path.join(ROOT, 'admin-web', 'src', 'App.css'), 'utf8').includes('.all-tests-cycle-hint'),
      'App.css: cycle hint styles',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_ADMIN_LABELS_PHASE6_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_ADMIN_LABELS_PHASE6_FAILED');
  process.exit(1);
}

main();
