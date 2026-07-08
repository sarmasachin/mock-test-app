#!/usr/bin/env node
'use strict';

/**
 * Phase 5 verify — apply / resolve / my-applications aligned with testCycleWindow.
 *
 * Usage:
 *   node scripts/verifyExamCycleApplicationPhase5.js
 */

const fs = require('fs');
const path = require('path');
const {
  isApplicationFromOlderCycle,
  evaluateApplicationCycleState,
  resolveApplyEligibilityForTest,
  resolveAttemptCycleStartedAtMs,
} = require('../src/lib/testApplicationCycle');
const {
  resolveApplicationCycleBoundaryMs,
  CYCLE_MODES,
  classifyCycleMode,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');
const { buildTestResolvePayload } = require('../src/lib/testResolve');
const { buildExamStartMs } = require('../src/lib/examSchedule');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function row(overrides) {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Test',
    subcategory: 'GK',
    is_published: true,
    duration_minutes: 30,
    exam_date: null,
    slot_label: '',
    dynamic_date_enabled: false,
    date_cycle_days: 0,
    last_cycle_started_at: null,
    capacity_total: 100,
    enrolled_count: 0,
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 5: application cycle alignment ===\n');
  let ok = true;

  const cycleStart = '2026-07-01T10:00:00.000Z';
  const withCycle = row({ last_cycle_started_at: cycleStart });

  ok =
    line(
      evaluateApplicationCycleState(withCycle, '2026-07-01T10:30:00.000Z').alreadyAppliedInCurrentCycle === true,
      'evaluateApplicationCycleState: applied after cycle start → current',
    ) && ok;
  ok =
    line(
      evaluateApplicationCycleState(withCycle, '2026-07-01T09:30:00.000Z').mayReapplyForNewCycle === true,
      'evaluateApplicationCycleState: applied before cycle start → may reapply',
    ) && ok;
  ok =
    line(
      isApplicationFromOlderCycle({ last_cycle_started_at: null }, '2026-07-01T09:00:00.000Z') === false,
      'no cycle boundary → not older (safe default)',
    ) && ok;

  const hpGk = row({
    title: 'HP GK',
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: null,
  });
  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const beforeExamMs = examStartMs - 4 * 24 * 60 * MS_PER_MINUTE;
  const earlyApplyIso = new Date(beforeExamMs).toISOString();

  ok =
    line(
      classifyCycleMode(hpGk) === CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS,
      'HP GK → Mode A',
    ) && ok;
  ok =
    line(
      !Number.isFinite(resolveApplicationCycleBoundaryMs(hpGk, beforeExamMs)),
      'HP GK: no application boundary before first rollover',
    ) && ok;
  ok =
    line(
      isApplicationFromOlderCycle(hpGk, earlyApplyIso, beforeExamMs) === false,
      'HP GK: early apply stays current cycle (legacy exam-date fallback removed)',
    ) && ok;
  ok =
    line(
      evaluateApplicationCycleState(hpGk, earlyApplyIso, beforeExamMs).alreadyAppliedInCurrentCycle === true,
      'HP GK: my-applications keeps early apply visible',
    ) && ok;
  ok =
    line(
      resolveAttemptCycleStartedAtMs(hpGk, beforeExamMs) === null,
      'HP GK: attempt boundary null before cycle seed',
    ) && ok;

  const afterRollover = {
    ...hpGk,
    last_cycle_started_at: new Date(examStartMs + 30 * MS_PER_MINUTE + 5000).toISOString(),
  };
  const afterRolloverMs = Date.parse(afterRollover.last_cycle_started_at) + 1000;
  ok =
    line(
      isApplicationFromOlderCycle(afterRollover, earlyApplyIso, afterRolloverMs) === true,
      'HP GK: apply before rollover → older after scheduler bump',
    ) && ok;
  ok =
    line(
      resolveApplyEligibilityForTest(afterRollover, [
        { id: afterRollover.id, applied_at: earlyApplyIso },
      ]).kind === 'may_reapply_same_test',
      'apply route: may reapply after rollover',
    ) && ok;

  const resolvePayload = buildTestResolvePayload({
    row: hpGk,
    advancedConfig: {},
    nowMs: beforeExamMs,
    alreadyAppliedInCurrentCycle: true,
    mayReapplyForNewCycle: false,
  });
  ok = line(resolvePayload.canApply === false, 'resolve: applied user cannot apply again') && ok;
  ok = line(resolvePayload.canStart !== undefined, 'resolve: start access still present') && ok;

  const reapplyResolve = buildTestResolvePayload({
    row: afterRollover,
    advancedConfig: {},
    nowMs: afterRolloverMs,
    alreadyAppliedInCurrentCycle: false,
    mayReapplyForNewCycle: true,
  });
  ok = line(reapplyResolve.canApply === true, 'resolve: mayReapply → canApply after rollover') && ok;

  console.log('\n-- Static wiring --');
  const appCycleSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'testApplicationCycle.js'),
    'utf8',
  );
  const testsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tests.js'), 'utf8');
  const attemptsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'testAttempts.js'), 'utf8');

  ok =
    line(
      appCycleSrc.includes('resolveApplicationCycleBoundaryMs') &&
        !appCycleSrc.includes('toStartOfDayMs'),
      'testApplicationCycle uses testCycleWindow boundary (no legacy exam-date fallback)',
    ) && ok;
  ok =
    line(
      testsSrc.includes('evaluateApplicationCycleState') &&
        testsSrc.includes('resolveAttemptCycleStartedAtMs') &&
        testsSrc.includes('cyclePhase'),
      'my-applications uses Phase 5 cycle helpers',
    ) && ok;
  ok =
    line(
      attemptsSrc.includes('resolveAttemptCycleStartedAtMs'),
      'testAttempts uses canonical attempt boundary',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_EXAM_CYCLE_APPLICATION_PHASE5_OK');
    process.exit(0);
  }
  console.error('VERIFY_EXAM_CYCLE_APPLICATION_PHASE5_FAILED');
  process.exit(1);
}

main();
