#!/usr/bin/env node
'use strict';

/**
 * Phase 2 verify — scheduler uses testCycleWindow (not duration_minutes rollover).
 *
 * Usage:
 *   node scripts/verifyExamCycleSchedulerPhase2.js
 */

const fs = require('fs');
const path = require('path');
const {
  CYCLE_MODES,
  shouldRunSchedulerRollover,
  resolveSchedulerCycleEndMs,
  legacyParseCycleEndMs,
  MS_PER_DAY,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');

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
  console.log('=== Phase 2: Exam cycle scheduler ===\n');
  let ok = true;

  const indexJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  ok = line(indexJs.includes("require('./lib/testCycleWindow')"), 'index.js imports testCycleWindow') && ok;
  ok =
    line(
      /processTestCycleAutoReschedule[\s\S]*?shouldRunSchedulerRollover/.test(indexJs),
      'scheduler uses shouldRunSchedulerRollover',
    ) && ok;
  ok =
    line(
      /processTestCycleAutoReschedule[\s\S]*?resolveSchedulerCycleEndMs/.test(indexJs),
      'scheduler uses resolveSchedulerCycleEndMs',
    ) && ok;
  ok =
    line(
      !/processTestCycleAutoReschedule[\s\S]*?duration_minutes \* 60 \* 1000/.test(indexJs),
      'scheduler removed duration_minutes * 60 * 1000 rollover gate',
    ) && ok;
  ok =
    line(
      indexJs.includes('enrolled_count = 0, last_cycle_started_at = now()'),
      'default rollover still keeps is_published=true',
    ) && ok;

  const ff = row({
    duration_minutes: 60,
    last_cycle_started_at: '2026-07-08T18:24:08.000Z',
  });
  const ffNow = Date.parse('2026-07-08T20:00:00.000Z');
  ok = line(!shouldRunSchedulerRollover(ff, ffNow), 'ff Mode C: no rollover after 60min (legacy would)') && ok;
  ok = line(Number.isFinite(legacyParseCycleEndMs(ff)), 'legacy parseCycleEndMs still exists for comparison') && ok;

  const hpGk = row({
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-08T10:00:00.000Z',
  });
  const beforeExam = Date.parse('2026-07-10T08:00:00.000Z');
  ok = line(!shouldRunSchedulerRollover(hpGk, beforeExam), 'HP GK: no rollover before exam ends') && ok;
  const legacyEarly = legacyParseCycleEndMs(hpGk);
  ok =
    line(
      shouldRunSchedulerRollover(hpGk, legacyEarly + 1000) === false,
      'HP GK: no rollover at legacy 30min mark (before exam)',
    ) && ok;

  const rolling = row({
    duration_minutes: 60,
    dynamic_date_enabled: true,
    date_cycle_days: 7,
    last_cycle_started_at: '2026-07-01T00:00:00.000Z',
  });
  const rollEnd = resolveSchedulerCycleEndMs(rolling);
  ok =
    line(
      shouldRunSchedulerRollover(rolling, rollEnd + 1000),
      'rolling Mode B: rollover after N days',
    ) && ok;
  ok =
    line(
      !shouldRunSchedulerRollover(rolling, rollEnd - MS_PER_DAY),
      'rolling Mode B: no rollover before N days',
    ) && ok;

  const scheduledEnd = resolveSchedulerCycleEndMs(hpGk);
  ok = line(scheduledEnd > legacyEarly, 'HP GK: planned cycle end after legacy duration bug end') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_SCHEDULER_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_SCHEDULER_PHASE2_FAILED');
  process.exit(1);
}

main();
