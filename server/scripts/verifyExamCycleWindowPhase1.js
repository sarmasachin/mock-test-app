#!/usr/bin/env node
'use strict';

/**
 * Phase 1 verify — testCycleWindow.js (offline, no DB).
 *
 * Usage:
 *   node scripts/verifyExamCycleWindowPhase1.js
 */

const fs = require('fs');
const path = require('path');
const {
  CYCLE_MODES,
  classifyCycleMode,
  resolveCycleWindows,
  resolveSchedulerCycleEndMs,
  resolveApplyWindowState,
  isExamInProgress,
  shouldRunSchedulerRollover,
  legacyParseCycleEndMs,
  parseCycleDays,
  MS_PER_DAY,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');
const { buildExamStartMs } = require('../src/lib/examSchedule');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function row(overrides) {
  return {
    is_published: true,
    duration_minutes: 60,
    exam_date: null,
    slot_label: '',
    dynamic_date_enabled: false,
    date_cycle_days: 0,
    last_cycle_started_at: new Date().toISOString(),
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 1: testCycleWindow.js ===\n');
  let ok = true;

  const ff = row({
    title: 'ff',
    duration_minutes: 60,
    exam_date: null,
    dynamic_date_enabled: false,
    date_cycle_days: 0,
    last_cycle_started_at: '2026-07-08T18:24:08.000Z',
  });
  ok = line(classifyCycleMode(ff) === CYCLE_MODES.MANUAL_NO_AUTO_CYCLE, 'ff → Mode C manual') && ok;
  const ffWin = resolveCycleWindows(ff, Date.parse('2026-07-08T19:00:00.000Z'));
  ok = line(ffWin.schedulerCycleEndMs === null, 'ff: no scheduler cycle end (manual)') && ok;
  ok = line(!ffWin.shouldRunSchedulerRollover, 'ff: shouldRunSchedulerRollover=false') && ok;
  ok = line(ffWin.applyOpen === true, 'ff: apply window open while published') && ok;
  ok = line(ffWin.schedulerUsesDurationBug === true, 'ff: legacy duration scheduler still diverges (Phase 2 fix)') && ok;
  ok =
    line(
      Number.isFinite(ffWin.legacySchedulerCycleEndMs),
      `ff: legacy would rollover at ${new Date(ffWin.legacySchedulerCycleEndMs).toISOString()}`,
    ) && ok;

  const hpGk = row({
    title: 'HP GK',
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-08T10:00:00.000Z',
  });
  ok =
    line(
      classifyCycleMode(hpGk) === CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS,
      'HP GK → Mode A scheduled + 3d',
    ) && ok;
  const beforeExamMs = Date.parse('2026-07-10T08:00:00.000Z');
  const hpBefore = resolveCycleWindows(hpGk, beforeExamMs);
  ok = line(hpBefore.applyOpen === true, 'HP GK: apply open before exam') && ok;
  ok = line(!hpBefore.examInProgress, 'HP GK: not in exam before start') && ok;
  ok = line(!hpBefore.shouldRunSchedulerRollover, 'HP GK: no rollover before exam ends') && ok;
  const hpEnd = resolveSchedulerCycleEndMs(hpGk);
  const legacyHp = legacyParseCycleEndMs(hpGk);
  ok =
    line(
      hpEnd > legacyHp,
      'HP GK: planned cycle end is AFTER legacy 30min bug end',
    ) && ok;

  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const duringExamMs = examStartMs + 15 * MS_PER_MINUTE;
  ok = line(isExamInProgress(hpGk, duringExamMs), 'HP GK: exam in progress mid-window') && ok;
  const applyDuring = resolveApplyWindowState(hpGk, duringExamMs);
  ok = line(applyDuring.open === false, 'HP GK: apply closed during exam') && ok;
  ok =
    line(
      applyDuring.reason.includes('exam in progress'),
      'HP GK: apply block reason mentions exam in progress',
    ) && ok;

  const rolling = row({
    title: 'rolling',
    duration_minutes: 60,
    exam_date: null,
    dynamic_date_enabled: true,
    date_cycle_days: 7,
    last_cycle_started_at: '2026-07-01T00:00:00.000Z',
  });
  ok = line(classifyCycleMode(rolling) === CYCLE_MODES.ROLLING_NO_EXAM_DATE, 'rolling → Mode B') && ok;
  const rollEnd = resolveSchedulerCycleEndMs(rolling);
  ok =
    line(
      rollEnd === Date.parse('2026-07-01T00:00:00.000Z') + 7 * MS_PER_DAY,
      'rolling: cycle end = start + 7 days',
    ) && ok;
  ok =
    line(
      shouldRunSchedulerRollover(rolling, rollEnd + 1000),
      'rolling: rollover after 7 days',
    ) && ok;
  ok = line(resolveApplyWindowState(rolling, rollEnd - 1000).open === true, 'rolling: apply open inside cycle') && ok;

  const fiveDay = row({
    title: 'five-day',
    duration_minutes: 120,
    exam_date: '2026-07-20',
    slot_label: '9:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 5,
    last_cycle_started_at: '2026-07-08T00:00:00.000Z',
  });
  ok = line(parseCycleDays(fiveDay) === 5, 'admin can set any cycle days (5)') && ok;

  console.log('\n-- Static checks --');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'testCycleWindow.js'),
    'utf8',
  );
  const indexJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  ok = line(src.includes('resolveSchedulerCycleEndMs'), 'testCycleWindow exports resolveSchedulerCycleEndMs') && ok;
  ok = line(src.includes('retainPublishedOnRollover: true'), 'rollover keeps published flag') && ok;
  ok =
    line(
      indexJs.includes('testCycleWindow') && indexJs.includes('shouldRunSchedulerRollover'),
      'Phase 2: index.js wired to testCycleWindow',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_WINDOW_PHASE1_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_WINDOW_PHASE1_FAILED');
  process.exit(1);
}

main();
