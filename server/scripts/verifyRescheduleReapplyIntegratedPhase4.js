#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — integrated offline E2E for admin reschedule → returning user re-apply.
 * Chains Phase 1 (server cycle bump), Phase 2 (API flags), Phase 3 (Android cache/UI).
 *
 * Usage:
 *   node scripts/verifyRescheduleReapplyIntegratedPhase4.js
 */

const { buildExamStartMs } = require('../src/lib/examSchedule');
const {
  resolveAdminCycleStartUpdate,
  shouldRenewCycleOnAdminEdit,
  resolveApplyWindowState,
  MS_PER_MINUTE,
} = require('../src/lib/testCycleWindow');
const {
  resolveApplyEligibilityForTest,
  evaluateApplicationCycleState,
  resolveAlreadyAppliedForTarget,
  buildMyTestApplicationItem,
  shouldSyncMyApplicationToLocalAppliedSeries,
} = require('../src/lib/testApplicationCycle');
const { buildTestResolvePayload } = require('../src/lib/testResolve');

const TEST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function baseRow(overrides = {}) {
  return {
    id: TEST_ID,
    title: 'E2E Reschedule Test',
    subcategory: 'GK',
    is_published: true,
    duration_minutes: 30,
    exam_date: '2026-07-12',
    slot_label: '10:00 am',
    dynamic_date_enabled: true,
    date_cycle_days: 3,
    last_cycle_started_at: '2026-07-01T10:00:00.000Z',
    capacity_total: 100,
    enrolled_count: 8,
    ...overrides,
  };
}

// --- Android TestApplyState mirror (Phase 3) ---
function userMayReapplyForNewCycle(resolve, matchedApplication) {
  if (resolve?.mayReapplyForNewCycle === true && resolve?.alreadyAppliedInCurrentCycle !== true) {
    return true;
  }
  if (
    matchedApplication?.mayReapplyForNewCycle === true &&
    !matchedApplication?.alreadyAppliedInCurrentCycle
  ) {
    return true;
  }
  return false;
}

function userHasAppliedForCurrentCycle(resolve, matchedApplication) {
  if (userMayReapplyForNewCycle(resolve, matchedApplication)) return false;
  if (resolve?.alreadyAppliedInCurrentCycle === true) return true;
  if (resolve?.canStart === true) return true;
  if (matchedApplication?.alreadyAppliedInCurrentCycle === true) return true;
  if (matchedApplication?.mayReapplyForNewCycle === true) return false;
  return false;
}

function shouldSyncApplicationToLocalSeries(app) {
  return app?.alreadyAppliedInCurrentCycle === true && app?.mayReapplyForNewCycle !== true;
}

function filterLocalsEvictingMayReapply(localActive, evictIds, evictTitles) {
  const ids = new Set(evictIds.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  const titles = new Set(evictTitles.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  return (localActive || []).filter((entry) => {
    const id = String(entry.testId || '').trim().toLowerCase();
    const title = String(entry.testName || '').trim().toLowerCase();
    return !ids.has(id) && !titles.has(title);
  });
}

function buildMyAppsItemForRow(row, appliedAtIso, nowMs, mayReapply) {
  const cycleState = evaluateApplicationCycleState(row, appliedAtIso, nowMs);
  const applyWindow = resolveApplyWindowState(row, nowMs);
  const canReapply = mayReapply && applyWindow.open;
  if (cycleState.mayReapplyForNewCycle) {
    return buildMyTestApplicationItem({
      row,
      appliedAtIso,
      cycleState,
      cyclePhase: 'live',
      examDate: row.exam_date,
      enrolledCount: row.enrolled_count,
      capacityTotal: row.capacity_total,
      mayReapplyForNewCycle: canReapply,
      applyBlockReason: canReapply ? null : applyWindow.reason,
    });
  }
  return buildMyTestApplicationItem({
    row,
    appliedAtIso,
    cycleState,
    cyclePhase: 'live',
    examDate: row.exam_date,
    startAccess: { canStart: false, startBlockReason: 'Exam not started', joinClosesAt: null },
    enrolledCount: row.enrolled_count,
    capacityTotal: row.capacity_total,
  });
}

function main() {
  console.log('=== Phase 4: integrated reschedule → re-apply E2E ===\n');
  let ok = true;

  const examStartMs = buildExamStartMs('2026-07-12', '10:00 am');
  const beforeExamMs = examStartMs - 2 * 24 * 60 * 60 * 1000;
  const afterExamMs = examStartMs + 30 * MS_PER_MINUTE + 1000;
  const appliedAtIso = new Date(examStartMs - 60 * 60 * 1000).toISOString();
  const userApps = [{ id: TEST_ID, applied_at: appliedAtIso, subcategory: 'GK' }];

  const beforeRound = baseRow();
  const afterReschedule = baseRow({
    exam_date: '2026-07-20',
    slot_label: '11:00 am',
    enrolled_count: 0,
  });

  // --- Journey 1: symptom — reschedule without cycle bump blocks old user, not new ---
  const blockedOld = resolveApplyEligibilityForTest(beforeRound, userApps);
  const freshNew = resolveApplyEligibilityForTest(beforeRound, []);
  ok = line(blockedOld.kind === 'already_applied_same_test', 'j1: old user blocked before cycle bump') && ok;
  ok = line(freshNew.kind === 'may_apply_fresh', 'j1: new user may_apply_fresh before cycle bump') && ok;

  // --- Journey 2: admin reschedule after exam ends bumps cycle (Phase 1) ---
  ok =
    line(
      shouldRenewCycleOnAdminEdit(beforeRound, afterReschedule, afterExamMs) === true,
      'j2: shouldRenewCycleOnAdminEdit after exam + schedule change',
    ) && ok;
  const cycleAction = resolveAdminCycleStartUpdate(afterReschedule, beforeRound, {
    justPublished: false,
    nowMs: afterExamMs,
  });
  ok =
    line(
      cycleAction.setCycleStart === true && cycleAction.reason === 'admin_reschedule_new_cycle',
      'j2: resolveAdminCycleStartUpdate → admin_reschedule_new_cycle',
    ) && ok;

  const afterBump = baseRow({
    exam_date: '2026-07-20',
    slot_label: '11:00 am',
    last_cycle_started_at: new Date(afterExamMs).toISOString(),
    enrolled_count: 0,
  });

  // --- Journey 3: returning user may re-apply (server apply + resolve) ---
  const reapplyElig = resolveApplyEligibilityForTest(afterBump, userApps);
  ok = line(reapplyElig.kind === 'may_reapply_same_test', 'j3: POST /apply → may_reapply_same_test') && ok;

  const applyState = resolveAlreadyAppliedForTarget(afterBump, userApps);
  const resolvePayload = buildTestResolvePayload({
    row: afterBump,
    advancedConfig: {},
    nowMs: afterExamMs,
    alreadyAppliedInCurrentCycle: applyState.alreadyAppliedInCurrentCycle,
    mayReapplyForNewCycle: applyState.mayReapplyForNewCycle,
  });
  ok =
    line(
      resolvePayload.mayReapplyForNewCycle === true && resolvePayload.canApply === true,
      'j3: GET /resolve → mayReapply + canApply',
    ) && ok;
  ok = line(resolvePayload.canStart === false, 'j3: resolve canStart=false until re-enrolled') && ok;

  // --- Journey 4: my-applications API consistency (Phase 2) ---
  const myItem = buildMyAppsItemForRow(afterBump, appliedAtIso, afterExamMs, true);
  ok =
    line(
      myItem.mayReapplyForNewCycle === true &&
        myItem.alreadyAppliedInCurrentCycle === false &&
        myItem.enrolledInCurrentCycle === false,
      'j4: my-applications re-apply row flags',
    ) && ok;
  ok =
    line(
      shouldSyncMyApplicationToLocalAppliedSeries(myItem) === false,
      'j4: re-apply row must not sync to local appliedSeries',
    ) && ok;

  // --- Journey 5: Android UI mirrors (Phase 3) ---
  ok =
    line(
      userHasAppliedForCurrentCycle(resolvePayload, myItem) === false,
      'j5: Apply UI shows re-apply CTA (not already applied)',
    ) && ok;
  ok =
    line(
      userMayReapplyForNewCycle(resolvePayload, myItem) === true,
      'j5: userMayReapplyForNewCycle true from resolve + my-apps',
    ) && ok;

  const localGhost = [
    { testName: afterBump.title, testId: TEST_ID, unlockAtMillis: Date.now(), expiresAtMillis: Date.now() + 1e6 },
  ];
  const evicted = filterLocalsEvictingMayReapply(localGhost, [TEST_ID], [afterBump.title]);
  ok = line(evicted.length === 0, 'j5: local appliedSeries ghost evicted for may-reapply test') && ok;

  // --- Journey 6: after successful re-enroll UI state ---
  const enrolledResolve = buildTestResolvePayload({
    row: afterBump,
    advancedConfig: {},
    nowMs: afterExamMs,
    alreadyAppliedInCurrentCycle: true,
    mayReapplyForNewCycle: false,
  });
  const enrolledMyItem = buildMyAppsItemForRow(
    { ...afterBump, enrolled_count: 1 },
    new Date(afterExamMs + 1000).toISOString(),
    afterExamMs + 2000,
    false,
  );
  ok =
    line(
      userHasAppliedForCurrentCycle(enrolledResolve, enrolledMyItem) === true,
      'j6: after re-enroll user is applied for current cycle',
    ) && ok;
  ok =
    line(
      shouldSyncApplicationToLocalSeries(enrolledMyItem) === true,
      'j6: re-enrolled row syncs to local appliedSeries',
    ) && ok;

  // --- Journey 7: regressions — must NOT bump cycle ---
  const waitEdit = resolveAdminCycleStartUpdate(beforeRound, beforeRound, {
    justPublished: false,
    nowMs: beforeExamMs,
  });
  ok = line(waitEdit.setCycleStart === false, 'j7 regression: no bump while waiting for exam') && ok;

  const titleOnly = baseRow({ title: 'Renamed only' });
  ok =
    line(
      shouldRenewCycleOnAdminEdit(beforeRound, titleOnly, afterExamMs) === false,
      'j7 regression: title-only edit is not a reschedule',
    ) && ok;

  const duringExam = resolveAdminCycleStartUpdate(
    { ...afterReschedule },
    beforeRound,
    { justPublished: false, nowMs: examStartMs + 15 * MS_PER_MINUTE },
  );
  ok = line(duringExam.setCycleStart === false, 'j7 regression: no bump during exam') && ok;

  // --- Journey 8: new user still applies after reschedule ---
  const newAfterBump = resolveApplyEligibilityForTest(afterBump, []);
  ok = line(newAfterBump.kind === 'may_apply_fresh', 'j8: new user may_apply_fresh after reschedule') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_RESCHEDULE_REAPPLY_INTEGRATED_PHASE4_OK');
    process.exit(0);
  }
  console.error('VERIFY_RESCHEDULE_REAPPLY_INTEGRATED_PHASE4_FAILED');
  process.exit(1);
}

main();
