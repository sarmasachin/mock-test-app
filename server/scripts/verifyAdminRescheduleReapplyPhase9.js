#!/usr/bin/env node
'use strict';

/**
 * Phase 9 verify — admin reschedule after completed round renews cycle so prior applicants may re-apply.
 *
 * Usage:
 *   node scripts/verifyAdminRescheduleReapplyPhase9.js
 */

const {
  resolveAdminCycleStartUpdate,
  shouldRenewCycleOnAdminEdit,
  hasAdminScheduleFieldsChanged,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');
const { buildExamStartMs } = require('../src/lib/examSchedule');
const {
  resolveApplyEligibilityForTest,
  evaluateApplicationCycleState,
} = require('../src/lib/testApplicationCycle');
const { buildTestResolvePayload } = require('../src/lib/testResolve');

const TEST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function row(overrides) {
  return {
    id: TEST_ID,
    title: 'Phase9 Test',
    subcategory: 'GK',
    is_published: true,
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-01T10:00:00.000Z',
    capacity_total: 100,
    enrolled_count: 5,
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 9: admin reschedule → re-apply ===\n');
  let ok = true;

  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const beforeExamMs = examStartMs - 2 * 24 * 60 * 60 * 1000;
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  const appliedAtIso = new Date(examStartMs - 60 * 60 * 1000).toISOString();

  const beforeRound = row();
  const afterReschedule = row({ exam_date: '2026-07-20', slot_label: '11:00 am' });
  const titleOnlyAfter = row({ title: 'Phase9 Test Renamed' });

  ok =
    line(
      hasAdminScheduleFieldsChanged(beforeRound, afterReschedule) === true,
      'schedule fields detect exam_date + slot change',
    ) && ok;
  ok =
    line(
      hasAdminScheduleFieldsChanged(beforeRound, titleOnlyAfter) === false,
      'title-only edit is not a schedule change',
    ) && ok;

  const waitEdit = resolveAdminCycleStartUpdate(beforeRound, beforeRound, {
    justPublished: false,
    nowMs: beforeExamMs,
  });
  ok =
    line(
      waitEdit.setCycleStart === false,
      'regression: no cycle bump while waiting for exam',
    ) && ok;

  const duringExamMs = examStartMs + 15 * MS_PER_MINUTE;
  const duringExamEdit = resolveAdminCycleStartUpdate(afterReschedule, beforeRound, {
    justPublished: false,
    nowMs: duringExamMs,
  });
  ok =
    line(
      duringExamEdit.setCycleStart === false,
      'regression: no cycle bump during exam even if schedule changes',
    ) && ok;

  ok =
    line(
      shouldRenewCycleOnAdminEdit(beforeRound, afterReschedule, afterExamMs) === true,
      'after exam end + reschedule → should renew cycle',
    ) && ok;

  const rescheduleAction = resolveAdminCycleStartUpdate(afterReschedule, beforeRound, {
    justPublished: false,
    nowMs: afterExamMs,
  });
  ok =
    line(
      rescheduleAction.setCycleStart === true && rescheduleAction.reason === 'admin_reschedule_new_cycle',
      'resolveAdminCycleStartUpdate → admin_reschedule_new_cycle',
    ) && ok;

  const simulatedAfterBump = {
    ...afterReschedule,
    last_cycle_started_at: new Date(afterExamMs).toISOString(),
    enrolled_count: 0,
  };
  const oldUserApps = [{ id: TEST_ID, applied_at: appliedAtIso, subcategory: 'GK' }];
  const eligibility = resolveApplyEligibilityForTest(simulatedAfterBump, oldUserApps);
  ok = line(eligibility.kind === 'may_reapply_same_test', 'old applicant → may_reapply_same_test') && ok;

  const cycleState = evaluateApplicationCycleState(simulatedAfterBump, appliedAtIso, afterExamMs);
  ok = line(cycleState.mayReapplyForNewCycle === true, 'old applicant → mayReapplyForNewCycle') && ok;

  const resolvePayload = buildTestResolvePayload({
    row: simulatedAfterBump,
    advancedConfig: {},
    nowMs: afterExamMs,
    alreadyAppliedInCurrentCycle: false,
    mayReapplyForNewCycle: true,
  });
  ok = line(resolvePayload.canApply === true, 'resolve → canApply for returning user') && ok;

  const newUserElig = resolveApplyEligibilityForTest(simulatedAfterBump, []);
  ok = line(newUserElig.kind === 'may_apply_fresh', 'new user → may_apply_fresh') && ok;

  const preBumpElig = resolveApplyEligibilityForTest(beforeRound, oldUserApps);
  ok =
    line(
      preBumpElig.kind === 'already_applied_same_test',
      'before fix state: old user blocked without cycle bump',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_ADMIN_RESCHEDULE_REAPPLY_PHASE9_OK');
    process.exit(0);
  }
  console.error('VERIFY_ADMIN_RESCHEDULE_REAPPLY_PHASE9_FAILED');
  process.exit(1);
}

main();
