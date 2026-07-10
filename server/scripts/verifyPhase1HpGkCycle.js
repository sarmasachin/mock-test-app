#!/usr/bin/env node
'use strict';

/**
 * Phase 1 verify — HP GK scheduled timer + next-day date + apply response fields.
 * Offline, no DB.
 *
 * Usage:
 *   node scripts/verifyPhase1HpGkCycle.js
 */

const { buildExamStartMs } = require('../src/lib/examSchedule');
const {
  evaluateTestStartAccess,
  isScheduledExamTest,
  resolveEffectiveScheduleTimerEnabled,
} = require('../src/lib/testStartAccess');
const {
  resolveExamDate,
  buildApplyResponseBody,
  resolveApplyResponseScheduleFields,
} = require('../src/lib/testApplicationCycle');
const { MS_PER_MINUTE } = require('../src/lib/testCycleWindow');

const HP_GK_ROW = {
  id: '2c7f05c8-7048-43f7-aec3-3013bc02acf2',
  title: 'HP GK',
  is_published: true,
  duration_minutes: 30,
  exam_date: '2026-07-10',
  slot_label: '09:00 PM',
  dynamic_date_enabled: true,
  date_cycle_days: 1,
  last_cycle_started_at: '2026-07-10T16:00:54.461Z',
};

const FF_ROW = {
  id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  title: 'ff',
  is_published: true,
  duration_minutes: 30,
  exam_date: null,
  slot_label: null,
  dynamic_date_enabled: false,
  date_cycle_days: 0,
};

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Verify Phase 1 HP GK cycle (server) ===\n');
  let ok = true;

  ok = line(isScheduledExamTest('2026-07-10', '09:00 PM'), 'scheduled test detected') && ok;
  ok = line(!isScheduledExamTest(null, null), 'manual test not scheduled') && ok;
  ok =
    line(
      resolveEffectiveScheduleTimerEnabled(false, '2026-07-10', '09:00 PM') === true,
      'effective timer ON for HP GK even when global OFF',
    ) && ok;
  ok =
    line(
      resolveEffectiveScheduleTimerEnabled(false, null, null) === false,
      'effective timer OFF for manual test when global OFF',
    ) && ok;

  const examStartMs = buildExamStartMs('2026-07-10', '09:00 PM');
  const beforeExamMs = examStartMs - 60_000;
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 60_000;

  const blockedGlobalOff = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
    cyclePhase: 'live',
    catalogError: null,
    examDate: '2026-07-10',
    slotLabel: '09:00 PM',
    lateJoinMinutes: 0,
    attemptAccess: { allowed: true },
    nowMs: beforeExamMs,
    row: HP_GK_ROW,
    advancedConfig: {},
  });
  ok = line(blockedGlobalOff.canStart === false, 'HP GK blocked before 9 PM (global timer OFF)') && ok;

  const allowedAtStart = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
    cyclePhase: 'live',
    catalogError: null,
    examDate: '2026-07-10',
    slotLabel: '09:00 PM',
    lateJoinMinutes: 0,
    attemptAccess: { allowed: true },
    nowMs: examStartMs + 1000,
    row: HP_GK_ROW,
    advancedConfig: {},
  });
  ok = line(allowedAtStart.canStart === true, 'HP GK allowed at 9 PM (global timer OFF)') && ok;

  const ffStart = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
    cyclePhase: 'live',
    catalogError: null,
    examDate: null,
    slotLabel: '',
    attemptAccess: { allowed: true },
    nowMs: beforeExamMs,
    row: FF_ROW,
    advancedConfig: {},
  });
  ok = line(ffStart.canStart === true, 'ff manual test still instant start (global timer OFF)') && ok;

  const beforeExamDate = resolveExamDate(HP_GK_ROW, beforeExamMs);
  ok = line(beforeExamDate === '2026-07-10', `before exam: resolved date stays Jul-10 (${beforeExamDate})`) && ok;

  const afterExamDate = resolveExamDate(HP_GK_ROW, afterExamMs);
  ok =
    line(
      afterExamDate === '2026-07-11',
      `after exam same night: advances to Jul-11 (${afterExamDate})`,
    ) && ok;

  const nextMorning = Date.parse('2026-07-11T08:00:00.000+05:30');
  const nextMorningDate = resolveExamDate(HP_GK_ROW, nextMorning);
  ok = line(nextMorningDate === '2026-07-11', `next morning: Jul-11 (${nextMorningDate})`) && ok;

  const schedule = resolveApplyResponseScheduleFields({
    test: HP_GK_ROW,
    scheduleTimerEnabled: false,
    advancedConfig: {},
    cyclePhase: 'live',
    catalogError: null,
    alreadyAppliedInCurrentCycle: true,
    nowMs: beforeExamMs,
  });
  ok = line(schedule.examDate === '2026-07-10', 'apply schedule fields include examDate') && ok;
  ok = line(schedule.slotLabel === '09:00 PM', 'apply schedule fields include slotLabel') && ok;
  ok = line(schedule.canStart === false, 'apply schedule fields canStart false before exam') && ok;
  ok = line(Boolean(schedule.lastCycleStartedAt), 'apply schedule fields include lastCycleStartedAt') && ok;

  const body = buildApplyResponseBody({
    test: HP_GK_ROW,
    enrolledCount: 1,
    capacityTotal: 100,
    alreadyAppliedInCurrentCycle: true,
    reenrolledForNewCycle: true,
    examDate: schedule.examDate,
    slotLabel: schedule.slotLabel,
    canStart: schedule.canStart,
    startBlockReason: schedule.startBlockReason,
    joinClosesAt: schedule.joinClosesAt,
    lastCycleStartedAt: schedule.lastCycleStartedAt,
    message: 'Re-enrolled for new test cycle',
  });
  ok = line(body.examDate === '2026-07-10', 'buildApplyResponseBody exposes examDate') && ok;
  ok = line(body.canStart === false, 'buildApplyResponseBody exposes canStart') && ok;
  ok = line(body.reenrolledForNewCycle === true, 'buildApplyResponseBody preserves reenrolled flag') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_PHASE1_HP_GK_CYCLE_OK');
    process.exit(0);
  }
  console.log('VERIFY_PHASE1_HP_GK_CYCLE_FAILED');
  process.exit(1);
}

main();
