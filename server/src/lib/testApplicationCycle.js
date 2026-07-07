'use strict';

/**
 * Canonical apply / cycle rules for POST /tests/:id/apply, GET /tests/resolve,
 * and GET /tests/my-applications (apply-once Phase 3).
 */

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function resolveExamDate(row) {
  if (!row) return null;
  const base = row.exam_date ? new Date(row.exam_date) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  if (!row.dynamic_date_enabled) return toIsoDate(base);
  const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
  if (!cycleDays) return toIsoDate(base);
  const today = new Date();
  const diffMs = today.setHours(0, 0, 0, 0) - new Date(base).setHours(0, 0, 0, 0);
  if (diffMs <= 0) return toIsoDate(base);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const jump = Math.ceil(diffDays / cycleDays) * cycleDays;
  const shifted = new Date(base);
  shifted.setDate(shifted.getDate() + jump);
  return toIsoDate(shifted);
}

function toStartOfDayMs(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * True when user's application predates the current test cycle (may re-apply for new shuffle round).
 * Safe default: when cycle boundary cannot be determined, treat as current cycle (return false).
 */
function isApplicationFromOlderCycle(row, appliedAtIso) {
  if (!appliedAtIso) return false;
  const appliedAt = new Date(appliedAtIso);
  if (Number.isNaN(appliedAt.getTime())) return false;

  const cycleStartedMs = Date.parse(String(row?.last_cycle_started_at || '').trim());
  if (Number.isFinite(cycleStartedMs)) {
    return appliedAt.getTime() < cycleStartedMs;
  }

  const resolved = resolveExamDate(row);
  if (resolved) {
    const cycleExamDate = new Date(`${resolved}T00:00:00`);
    if (!Number.isNaN(cycleExamDate.getTime())) {
      const cycleExamMs = toStartOfDayMs(cycleExamDate);
      if (row?.dynamic_date_enabled) {
        const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
        if (cycleDays > 0) {
          const cycleStartMs = cycleExamMs - cycleDays * 24 * 60 * 60 * 1000;
          return appliedAt.getTime() < cycleStartMs;
        }
      }
      const nowStartMs = toStartOfDayMs(new Date());
      return nowStartMs > cycleExamMs && appliedAt.getTime() < cycleExamMs;
    }
  }

  return false;
}

/**
 * @param {object|null|undefined} row — tests DB row
 * @param {string|null|undefined} appliedAtIso
 */
function evaluateApplicationCycleState(row, appliedAtIso) {
  const appliedAt = appliedAtIso ? String(appliedAtIso).trim() : '';
  const fromOlderCycle = Boolean(appliedAt) && isApplicationFromOlderCycle(row, appliedAt);
  const alreadyAppliedInCurrentCycle = Boolean(appliedAt) && !fromOlderCycle;
  const mayReapplyForNewCycle = Boolean(appliedAt) && fromOlderCycle;
  return {
    fromOlderCycle,
    alreadyAppliedInCurrentCycle,
    mayReapplyForNewCycle,
    appliedAt: appliedAt || null,
  };
}

function normalizeSubcategoryKey(subcategory) {
  return String(subcategory || '').trim().toLowerCase();
}

function normalizeAppliedAtIso(appliedAt) {
  if (!appliedAt) return null;
  if (appliedAt instanceof Date) return appliedAt.toISOString();
  const parsed = Date.parse(String(appliedAt));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Another test in the same subcategory with a current-cycle application (apply-once Phase 4).
 */
function findCurrentCycleSiblingApplication(targetTestRow, applicationRows) {
  const targetSub = normalizeSubcategoryKey(targetTestRow?.subcategory);
  if (!targetSub) return null;
  const targetId = String(targetTestRow?.id || '').trim().toLowerCase();

  for (const row of applicationRows || []) {
    const rowId = String(row.id || row.test_id || '').trim().toLowerCase();
    if (!rowId || rowId === targetId) continue;
    if (normalizeSubcategoryKey(row.subcategory) !== targetSub) continue;
    const appliedAt = normalizeAppliedAtIso(row.applied_at);
    const cycleState = evaluateApplicationCycleState(row, appliedAt);
    if (cycleState.alreadyAppliedInCurrentCycle) {
      return { applicationRow: row, cycleState, appliedAt };
    }
  }
  return null;
}

/**
 * @returns {{
 *   kind: 'already_applied_same_test'|'already_applied_sibling_subcategory'|'may_reapply_same_test'|'may_apply_fresh',
 *   testRow: object,
 *   cycleState: object,
 *   sibling?: object,
 * }}
 */
function resolveApplyEligibilityForTest(targetTestRow, applicationRows) {
  const targetId = String(targetTestRow?.id || '').trim().toLowerCase();
  const direct = (applicationRows || []).find(
    (row) => String(row.id || row.test_id || '').trim().toLowerCase() === targetId,
  );
  const directAppliedAt = normalizeAppliedAtIso(direct?.applied_at);
  const directCycle = evaluateApplicationCycleState(targetTestRow, directAppliedAt);

  if (direct && directCycle.alreadyAppliedInCurrentCycle) {
    return {
      kind: 'already_applied_same_test',
      testRow: targetTestRow,
      cycleState: directCycle,
    };
  }

  const sibling = findCurrentCycleSiblingApplication(targetTestRow, applicationRows);
  if (sibling) {
    return {
      kind: 'already_applied_sibling_subcategory',
      testRow: sibling.applicationRow,
      cycleState: {
        fromOlderCycle: false,
        alreadyAppliedInCurrentCycle: true,
        mayReapplyForNewCycle: false,
        appliedAt: sibling.appliedAt,
      },
      sibling,
    };
  }

  if (direct && directCycle.mayReapplyForNewCycle) {
    return {
      kind: 'may_reapply_same_test',
      testRow: targetTestRow,
      cycleState: directCycle,
    };
  }

  return {
    kind: 'may_apply_fresh',
    testRow: targetTestRow,
    cycleState: directCycle,
  };
}

function resolveAlreadyAppliedForTarget(targetRow, applicationRows) {
  const eligibility = resolveApplyEligibilityForTest(targetRow, applicationRows);
  if (
    eligibility.kind === 'already_applied_same_test' ||
    eligibility.kind === 'already_applied_sibling_subcategory'
  ) {
    return {
      alreadyAppliedInCurrentCycle: true,
      mayReapplyForNewCycle: false,
      appliedTestRow: eligibility.testRow,
    };
  }
  if (eligibility.kind === 'may_reapply_same_test') {
    return {
      alreadyAppliedInCurrentCycle: false,
      mayReapplyForNewCycle: true,
      appliedTestRow: null,
    };
  }
  return {
    alreadyAppliedInCurrentCycle: false,
    mayReapplyForNewCycle: false,
    appliedTestRow: null,
  };
}

function normalizeEnrollmentCounts(testRow, enrolledCount, capacityTotal) {
  const capacity = Math.max(
    0,
    Number.isFinite(Number(capacityTotal))
      ? Number(capacityTotal)
      : Number(testRow?.capacity_total || 0),
  );
  const enrolled = Math.max(
    0,
    Number.isFinite(Number(enrolledCount))
      ? Number(enrolledCount)
      : Number(testRow?.enrolled_count || 0),
  );
  const remainingSeats = capacity > 0 ? Math.max(0, capacity - enrolled) : 0;
  return { capacityTotal: capacity, enrolledCount: enrolled, remainingSeats };
}

/**
 * Stable JSON body for POST /tests/:id/apply (all branches).
 */
function buildApplyResponseBody({
  test,
  enrolledCount,
  capacityTotal,
  alreadyApplied = false,
  alreadyAppliedInCurrentCycle = false,
  mayReapplyForNewCycle = false,
  reenrolledForNewCycle = false,
  waitlisted = false,
  message = '',
  waitingPosition = 0,
  waitingTotal = 0,
}) {
  const counts = normalizeEnrollmentCounts(test, enrolledCount, capacityTotal);
  const enrolledInCurrentCycle = alreadyAppliedInCurrentCycle && !waitlisted;
  return {
    ok: true,
    alreadyApplied,
    alreadyAppliedInCurrentCycle,
    mayReapplyForNewCycle,
    reenrolledForNewCycle,
    enrolledInCurrentCycle,
    waitlisted,
    message: String(message || '').trim(),
    testId: String(test?.id || ''),
    testTitle: String(test?.title || 'Test'),
    enrolledCount: counts.enrolledCount,
    capacityTotal: counts.capacityTotal,
    remainingSeats: waitlisted ? 0 : counts.remainingSeats,
    waitingPosition: Math.max(0, Number(waitingPosition || 0)),
    waitingTotal: Math.max(0, Number(waitingTotal || 0)),
  };
}

module.exports = {
  resolveExamDate,
  isApplicationFromOlderCycle,
  evaluateApplicationCycleState,
  normalizeSubcategoryKey,
  findCurrentCycleSiblingApplication,
  resolveApplyEligibilityForTest,
  resolveAlreadyAppliedForTarget,
  normalizeEnrollmentCounts,
  buildApplyResponseBody,
};
