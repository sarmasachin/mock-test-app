#!/usr/bin/env node
'use strict';

/**
 * Phase 8 verify — admin badge + resolve + start access use testCycleWindow (not duration bug).
 * Offline, no DB. Run: npm run verify:exam-cycle-admin-cycle-phase8
 */

const fs = require('fs');
const path = require('path');
const { buildAdminTestCycleFields } = require('../src/lib/adminTestCycleStatus');
const { buildTestResolvePayload } = require('../src/lib/testResolve');
const { evaluateTestStartAccess } = require('../src/lib/testStartAccess');
const {
  shouldRunSchedulerRollover,
  resolveSchedulerCycleEndMs,
  legacyParseCycleEndMs,
} = require('../src/lib/testCycleWindow');

function line(ok, msg) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${msg}`);
  return ok;
}

function readText(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

/** HP GK-like: exam future, Date On 1d, 30min attempt — must NOT expire before exam. */
const hpGkRow = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'HP GK',
  slug: 'hp-gk',
  is_published: true,
  duration_minutes: 30,
  exam_date: '2026-07-10',
  slot_label: '10:00',
  dynamic_date_enabled: true,
  date_cycle_days: 1,
  last_cycle_started_at: '2026-07-08T10:00:00.000Z',
  capacity_total: 500,
  enrolled_count: 0,
};

/** ff-like: manual mode, 60min attempt — must NOT auto-expire on duration. */
const ffRow = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  title: 'ff',
  slug: 'ff-ff',
  is_published: true,
  duration_minutes: 60,
  exam_date: null,
  dynamic_date_enabled: false,
  date_cycle_days: 0,
  last_cycle_started_at: '2026-06-01T08:00:00.000Z',
  capacity_total: 500,
  enrolled_count: 0,
};

function main() {
  console.log('=== Phase 8: admin cycle + resolve + start access alignment ===\n');
  let ok = true;

  const adminJs = readText('src/lib/adminTestCycleStatus.js');
  const resolveJs = readText('src/lib/testResolve.js');
  const startJs = readText('src/lib/testStartAccess.js');

  ok = line(adminJs.includes('shouldRunSchedulerRollover'), 'adminTestCycleStatus uses shouldRunSchedulerRollover') && ok;
  ok = line(!adminJs.includes('parseCycleEndMs'), 'adminTestCycleStatus no longer uses parseCycleEndMs') && ok;
  ok = line(resolveJs.includes('resolveSchedulerCycleEndMs'), 'testResolve uses resolveSchedulerCycleEndMs') && ok;
  ok = line(!resolveJs.includes("require('./testCycleTiming')"), 'testResolve no longer imports testCycleTiming') && ok;
  ok = line(startJs.includes('resolveSchedulerCycleEndMs'), 'testStartAccess uses resolveSchedulerCycleEndMs') && ok;

  const beforeExamMs = Date.parse('2026-07-09T02:00:00.000Z');

  const hpLegacyEnd = legacyParseCycleEndMs(hpGkRow);
  const hpCanonicalEnd = resolveSchedulerCycleEndMs(hpGkRow);
  ok =
    line(
      Number.isFinite(hpLegacyEnd) && hpLegacyEnd < beforeExamMs,
      'HP GK legacy duration end is before exam day (old bug)',
    ) && ok;
  ok =
    line(
      Number.isFinite(hpCanonicalEnd) && hpCanonicalEnd > beforeExamMs,
      'HP GK canonical cycle end is after exam start (exam window)',
    ) && ok;
  ok =
    line(
      !shouldRunSchedulerRollover(hpGkRow, beforeExamMs),
      'HP GK before exam: scheduler rollover NOT due',
    ) && ok;

  const hpAdmin = buildAdminTestCycleFields(hpGkRow, {}, [], beforeExamMs);
  ok = line(hpAdmin.cycle_status === 'live', 'HP GK admin badge → Live (not Cycle expired)') && ok;
  ok = line(hpAdmin.cycle_status_label === 'Live', 'HP GK label is Live') && ok;

  const hpResolve = buildTestResolvePayload({
    row: hpGkRow,
    nowMs: beforeExamMs,
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: true,
    examDate: '2026-07-10',
    slotLabel: '10:00',
  });
  ok = line(hpResolve.cyclePhase === 'live', 'HP GK resolve phase live') && ok;
  ok =
    line(
      hpResolve.canStart === false && String(hpResolve.startBlockReason || '').includes('2026-07-10'),
      'HP GK canStart false until exam (schedule timer) — expected lock',
    ) && ok;

  ok =
    line(
      !shouldRunSchedulerRollover(ffRow, beforeExamMs),
      'ff manual mode: no scheduler rollover',
    ) && ok;
  ok = line(!Number.isFinite(resolveSchedulerCycleEndMs(ffRow)), 'ff manual mode: no canonical cycle end') && ok;

  const ffAdmin = buildAdminTestCycleFields(ffRow, {}, [], beforeExamMs);
  ok = line(ffAdmin.cycle_status === 'live', 'ff admin badge → Live (not duration-expired)') && ok;

  const ffResolve = buildTestResolvePayload({
    row: ffRow,
    nowMs: beforeExamMs,
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
  });
  ok = line(ffResolve.cyclePhase === 'live', 'ff resolve phase live') && ok;
  ok = line(ffResolve.canStart === true, 'ff applied + timer off → canStart true') && ok;

  const ffStart = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
    cyclePhase: 'live',
    catalogError: null,
    examDate: null,
    slotLabel: '',
    row: ffRow,
    nowMs: beforeExamMs,
  });
  ok = line(ffStart.canStart === true, 'ff evaluateTestStartAccess → canStart true') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_ADMIN_CYCLE_PHASE8_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_ADMIN_CYCLE_PHASE8_FAIL');
  process.exit(1);
}

main();
