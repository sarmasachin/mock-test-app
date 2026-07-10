#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — integrated offline E2E: HP GK full daily cycle (Phases 0–3).
 *
 * Timeline (IST Jul 11 cycle, production-shaped row):
 *   apply (morning) → countdown → 9 PM start → submit → immediate result
 *   → post-exam apply closed → rollover → next-day re-apply
 *   Bihar GK / manual tests stay unaffected.
 *
 * Usage:
 *   node scripts/e2eHpGkFullCyclePhase4.js
 */

const { buildExamStartMs } = require('../src/lib/examSchedule');
const {
  evaluateTestStartAccess,
  resolveEffectiveScheduleTimerEnabled,
} = require('../src/lib/testStartAccess');
const {
  resolveExamDate,
  resolveApplyResponseScheduleFields,
  evaluateApplicationCycleState,
  buildApplyResponseBody,
} = require('../src/lib/testApplicationCycle');
const {
  resolveApplyWindowState,
  shouldRunSchedulerRollover,
  resolveSchedulerCycleEndMs,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');
const { simulateHpGkStartAccess } = require('../src/lib/phase0HpGkCycleSetup');

const HP_GK_ID = '2c7f05c8-7048-43f7-aec3-3013bc02acf2';
const BIHAR_GK_ID = '7f882a47-2889-4b4d-89c8-2c405366b3a5';

const HP_GK_ROW = {
  id: HP_GK_ID,
  title: 'HP GK',
  subcategory: 'HP GK',
  is_published: true,
  duration_minutes: 30,
  exam_date: '2026-07-10',
  slot_label: '09:00 PM',
  dynamic_date_enabled: true,
  date_cycle_days: 1,
  last_cycle_started_at: '2026-07-10T16:00:54.461Z',
};

const BIHAR_GK_ROW = {
  id: BIHAR_GK_ID,
  title: 'Bihar GK',
  is_published: true,
  duration_minutes: 30,
  exam_date: null,
  slot_label: null,
  dynamic_date_enabled: false,
  date_cycle_days: 0,
  last_cycle_started_at: null,
};

const FF_ROW = {
  id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  title: 'ff',
  is_published: true,
  duration_minutes: 30,
  exam_date: null,
  slot_label: null,
};

const RESULT_RELEASE_DELAY_HOURS = 3;
const HourMs = 60 * 60 * 1000;

// --- Android mirrors (Phase 2–3) ---
function effectiveScheduleTimerEnabled(globalOn, examDate, slotLabel) {
  if (examDate && String(examDate).trim() && slotLabel && String(slotLabel).trim()) return true;
  return Boolean(globalOn);
}

function resolveResultReleaseMillisForSubmit(resultVisibility, resultReleaseAtMs, defaultReleaseAtMs) {
  const deferred = String(resultVisibility || '').trim().toLowerCase() === 'after_result_time';
  if (!deferred) return 0;
  return resultReleaseAtMs > 0 ? resultReleaseAtMs : defaultReleaseAtMs;
}

function resolvePendingResultPublishAtMillis(submitPublishAtMillis, defaultDeferredReleaseAtMs) {
  if (submitPublishAtMillis > 0) return submitPublishAtMillis;
  if (submitPublishAtMillis === 0) return 0;
  return defaultDeferredReleaseAtMs;
}

function readPendingResultState(name, publishAt) {
  if (!String(name || '').trim()) return null;
  return { testName: name.trim(), publishAtMillis: Math.max(0, publishAt) };
}

function isPendingResultReleaseReady(publishAtMillis, nowMs) {
  return publishAtMillis <= 0 || nowMs >= publishAtMillis;
}

function canStartTest(testName, pending) {
  if (!pending) return true;
  const name = String(testName || '').trim();
  if (!name) return true;
  return pending.testName.toLowerCase() !== name.toLowerCase();
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Phase 4 E2E: HP GK full daily cycle ===\n');
  let ok = true;

  const jul11Morning = Date.parse('2026-07-11T10:00:00.000+05:30');
  const resolvedDateMorning = resolveExamDate(HP_GK_ROW, jul11Morning);
  const examStartJul11 = buildExamStartMs(resolvedDateMorning, HP_GK_ROW.slot_label);
  const examEndJul11 = examStartJul11 + 30 * MS_PER_MINUTE;
  const beforeNinePm = examStartJul11 - 5 * MS_PER_MINUTE;
  const atNinePm = examStartJul11 + 1000;
  const midExam = examStartJul11 + 15 * MS_PER_MINUTE;
  const afterSubmit = examStartJul11 + 25 * MS_PER_MINUTE;
  const postExamPreRoll = examEndJul11 + 30 * 1000;
  const afterRollover = examEndJul11 + 120 * 1000;

  ok = line(resolvedDateMorning === '2026-07-11', `Jul-11 morning catalog date: ${resolvedDateMorning}`) && ok;

  // Stage 1 — apply before 9 PM
  const applyWindowMorning = resolveApplyWindowState(HP_GK_ROW, jul11Morning);
  ok = line(applyWindowMorning.open === true, 'Morning: apply window open') && ok;

  const scheduleMorning = resolveApplyResponseScheduleFields({
    test: HP_GK_ROW,
    scheduleTimerEnabled: true,
    advancedConfig: { resultVisibility: 'immediate' },
    cyclePhase: 'live',
    catalogError: null,
    alreadyAppliedInCurrentCycle: true,
    nowMs: jul11Morning,
  });
  ok = line(scheduleMorning.canStart === false, 'Morning apply response: canStart false') && ok;
  ok = line(scheduleMorning.examDate === '2026-07-11', 'Morning apply response: examDate Jul-11') && ok;

  const androidTimerMorning = effectiveScheduleTimerEnabled(true, scheduleMorning.examDate, scheduleMorning.slotLabel);
  ok = line(androidTimerMorning === true, 'Android effective timer ON for HP GK') && ok;

  const startMorning = simulateHpGkStartAccess(HP_GK_ROW, true, jul11Morning);
  ok = line(startMorning.canStart === false, 'Morning: HP GK start blocked') && ok;

  // Stage 2 — 5 min before 9 PM still locked
  const startBefore = simulateHpGkStartAccess(HP_GK_ROW, true, beforeNinePm);
  ok = line(startBefore.canStart === false, '5 min before 9 PM: still blocked') && ok;

  // Stage 3 — 9 PM unlock
  const startAtNine = simulateHpGkStartAccess(HP_GK_ROW, true, atNinePm);
  ok = line(startAtNine.canStart === true, '9 PM: HP GK start allowed') && ok;

  const scheduleAtNine = resolveApplyResponseScheduleFields({
    test: HP_GK_ROW,
    scheduleTimerEnabled: true,
    advancedConfig: {},
    cyclePhase: 'live',
    catalogError: null,
    alreadyAppliedInCurrentCycle: true,
    nowMs: atNinePm,
  });
  ok = line(scheduleAtNine.canStart === true, '9 PM apply fields: canStart true') && ok;

  // Stage 4 — during exam: apply closed
  const applyMidExam = resolveApplyWindowState(HP_GK_ROW, midExam);
  ok = line(applyMidExam.open === false, 'Mid-exam: apply window closed') && ok;
  ok = line(
    String(applyMidExam.reason || '').toLowerCase().includes('exam in progress'),
    'Mid-exam: block reason mentions exam in progress',
  ) && ok;

  // Stage 5 — submit + immediate result (Phase 3)
  const defaultReleaseAt = afterSubmit + RESULT_RELEASE_DELAY_HOURS * HourMs;
  const quizPublishAt = resolveResultReleaseMillisForSubmit('immediate', 0, defaultReleaseAt);
  const storedPublishAt = resolvePendingResultPublishAtMillis(quizPublishAt, defaultReleaseAt);
  ok = line(storedPublishAt === 0, 'Submit immediate: publishAt stored as 0') && ok;

  const pending = readPendingResultState('HP GK', storedPublishAt);
  ok = line(pending?.testName === 'HP GK', 'Pending result row exists after submit') && ok;
  ok = line(isPendingResultReleaseReady(storedPublishAt, afterSubmit), 'Result ready immediately on Home') && ok;
  ok = line(canStartTest('HP GK', pending) === false, 'Cannot restart HP GK while pending result') && ok;

  // Stage 6 — post-exam pre-rollover: apply still closed
  const applyPostExam = resolveApplyWindowState(HP_GK_ROW, postExamPreRoll);
  ok = line(applyPostExam.open === false, 'Post-exam pre-rollover: apply closed') && ok;

  const rollShould = shouldRunSchedulerRollover(HP_GK_ROW, afterRollover);
  ok = line(rollShould === true, 'After exam end: scheduler rollover due') && ok;

  // Stage 7 — after rollover: apply re-opens for new cycle
  const rowAfterRoll = {
    ...HP_GK_ROW,
    last_cycle_started_at: new Date(examEndJul11 + 54 * 1000).toISOString(),
  };
  const afterRolloverAt = examEndJul11 + 120 * 1000;
  const applyAfterRoll = resolveApplyWindowState(rowAfterRoll, afterRolloverAt + 60_000);
  ok = line(applyAfterRoll.open === true, 'After rollover: apply window re-opens') && ok;

  const resolvedAfterRoll = resolveExamDate(rowAfterRoll, afterRolloverAt + 60_000);
  ok = line(resolvedAfterRoll === '2026-07-12', `After rollover catalog date: ${resolvedAfterRoll}`) && ok;

  const cycleAfterRoll = evaluateApplicationCycleState(
    rowAfterRoll,
    '2026-07-10T12:00:00.000Z',
    afterRolloverAt + 60_000,
  );
  ok = line(cycleAfterRoll.mayReapplyForNewCycle === true, 'Returning user may re-apply after rollover') && ok;

  const reapplySchedule = resolveApplyResponseScheduleFields({
    test: rowAfterRoll,
    scheduleTimerEnabled: true,
    advancedConfig: { resultVisibility: 'immediate' },
    cyclePhase: 'live',
    catalogError: null,
    alreadyAppliedInCurrentCycle: true,
    nowMs: afterRolloverAt + 60_000,
  });
  const reapplyBody = buildApplyResponseBody({
    test: rowAfterRoll,
    enrolledCount: 2,
    capacityTotal: 100,
    alreadyAppliedInCurrentCycle: true,
    mayReapplyForNewCycle: false,
    reenrolledForNewCycle: true,
    examDate: reapplySchedule.examDate,
    slotLabel: reapplySchedule.slotLabel,
    canStart: reapplySchedule.canStart,
    startBlockReason: reapplySchedule.startBlockReason,
    joinClosesAt: reapplySchedule.joinClosesAt,
    lastCycleStartedAt: reapplySchedule.lastCycleStartedAt,
  });
  ok = line(reapplyBody.reenrolledForNewCycle === true, 'Re-apply response marks reenrolledForNewCycle') && ok;
  ok = line(reapplyBody.examDate === '2026-07-12', 'Re-apply response has advanced examDate') && ok;

  // Isolation — manual tests unaffected
  const biharStart = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: true,
    cyclePhase: 'live',
    catalogError: null,
    examDate: null,
    slotLabel: '',
    attemptAccess: { allowed: true },
    nowMs: jul11Morning,
    row: BIHAR_GK_ROW,
    advancedConfig: {},
  });
  ok = line(biharStart.canStart === true, 'Bihar GK: instant start with timer ON') && ok;

  const ffTimer = resolveEffectiveScheduleTimerEnabled(true, null, null);
  ok = line(ffTimer === true, 'ff: effective timer follows global when no exam schedule') && ok;

  const ffStart = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: true,
    cyclePhase: 'live',
    catalogError: null,
    examDate: null,
    slotLabel: '',
    attemptAccess: { allowed: true },
    nowMs: jul11Morning,
    row: FF_ROW,
    advancedConfig: {},
  });
  ok = line(ffStart.canStart === true, 'ff: instant start with global timer ON') && ok;

  const biharApply = resolveApplyWindowState(BIHAR_GK_ROW, midExam);
  ok = line(biharApply.open === true, 'Bihar GK: apply stays open during HP GK exam') && ok;

  // Deferred result path still works (no regression)
  const deferredPublish = resolvePendingResultPublishAtMillis(
    resolveResultReleaseMillisForSubmit('after_result_time', 0, defaultReleaseAt),
    defaultReleaseAt,
  );
  ok = line(deferredPublish === defaultReleaseAt, 'Deferred result still uses default delay') && ok;
  ok = line(!isPendingResultReleaseReady(deferredPublish, afterSubmit), 'Deferred result waits before release') && ok;

  console.log('');
  if (ok) {
    console.log('E2E_HP_GK_FULL_CYCLE_PHASE4_OK');
    process.exit(0);
  }
  console.error('E2E_HP_GK_FULL_CYCLE_PHASE4_FAILED');
  process.exit(1);
}

main();
