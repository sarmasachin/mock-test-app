'use strict';

/**
 * Canonical apply / cycle rules for POST /tests/:id/apply, GET /tests/resolve,
 * and GET /tests/my-applications (apply-once Phase 3).
 */

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDaysToIsoDate(isoDate, days) {
  const raw = String(isoDate || '').trim();
  const parts = raw.split('-').map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + Math.max(0, Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

function resolveExamTimezoneOffsetMinutes() {
  return Number(process.env.EXAM_TIMEZONE_OFFSET_MINUTES || 330);
}

/** Calendar date (YYYY-MM-DD) in exam timezone for [nowMs]. */
function resolveExamTodayIso(nowMs = Date.now()) {
  const offsetMin = resolveExamTimezoneOffsetMinutes();
  return new Date(nowMs + offsetMin * 60 * 1000).toISOString().slice(0, 10);
}

function loadCycleWindowHelpers() {
  return require('./testCycleWindow');
}

function loadExamScheduleHelpers() {
  return require('./examSchedule');
}

/**
 * Resolve catalog exam date for a test row.
 * Dynamic date shifts forward by date_cycle_days; after the current window ends,
 * advances to the next cycle day (Phase 1 — fixes same-night stale date after rollover).
 *
 * @param {object|null|undefined} row
 * @param {number} [nowMs]
 */
function resolveExamDate(row, nowMs = Date.now()) {
  if (!row) return null;
  const base = row.exam_date ? new Date(row.exam_date) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  if (!row.dynamic_date_enabled) return toIsoDate(base);
  const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
  if (!cycleDays) return toIsoDate(base);

  const baseIso = toIsoDate(base);
  const examTodayIso = resolveExamTodayIso(nowMs);
  const baseUtc = Date.parse(`${baseIso}T00:00:00Z`);
  const todayUtc = Date.parse(`${examTodayIso}T00:00:00Z`);
  const diffDays = Math.floor((todayUtc - baseUtc) / (24 * 60 * 60 * 1000));
  let candidate;
  if (diffDays <= 0) {
    candidate = baseIso;
  } else {
    const jump = Math.ceil(diffDays / cycleDays) * cycleDays;
    candidate = addDaysToIsoDate(baseIso, jump);
  }

  const { buildExamStartMs } = loadExamScheduleHelpers();
  const { parseCycleStartedMs } = loadCycleWindowHelpers();
  const slotLabel = row.slot_label;
  const durationMinutes = Math.max(0, Number(row.duration_minutes || 0));
  const cycleStartedMs = parseCycleStartedMs(row);
  let guard = 0;
  while (candidate && guard < 400) {
    guard += 1;
    const startMs = buildExamStartMs(candidate, slotLabel);
    if (!Number.isFinite(startMs)) break;
    const examEndMs =
      durationMinutes > 0 ? startMs + durationMinutes * 60 * 1000 : startMs;
    if (nowMs < examEndMs) break;

    const rolloverDone = Number.isFinite(cycleStartedMs) && cycleStartedMs >= examEndMs;
    const calendarMoved = examTodayIso > candidate;
    if (!rolloverDone && !calendarMoved) break;

    const nextIso = addDaysToIsoDate(candidate, cycleDays);
    if (!nextIso || nextIso === candidate) break;
    candidate = nextIso;
  }
  return candidate;
}

/**
 * True when user's application predates the current test cycle (may re-apply for new shuffle round).
 * Phase 5: uses testCycleWindow.resolveApplicationCycleBoundaryMs (last_cycle_started_at only).
 * Safe default: when boundary is not established, treat as current cycle (return false).
 */
function isApplicationFromOlderCycle(row, appliedAtIso, nowMs = Date.now()) {
  if (!appliedAtIso) return false;
  const appliedAt = new Date(appliedAtIso);
  if (Number.isNaN(appliedAt.getTime())) return false;

  const { resolveApplicationCycleBoundaryMs } = loadCycleWindowHelpers();
  const boundaryMs = resolveApplicationCycleBoundaryMs(row, nowMs);
  if (!Number.isFinite(boundaryMs)) {
    return false;
  }
  return appliedAt.getTime() < boundaryMs;
}

/**
 * @param {object|null|undefined} row — tests DB row
 * @param {string|null|undefined} appliedAtIso
 * @param {number} [nowMs]
 */
function evaluateApplicationCycleState(row, appliedAtIso, nowMs = Date.now()) {
  const appliedAt = appliedAtIso ? String(appliedAtIso).trim() : '';
  const fromOlderCycle = Boolean(appliedAt) && isApplicationFromOlderCycle(row, appliedAt, nowMs);
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

function normalizeCycleStartedAtIso(row) {
  const raw = row?.last_cycle_started_at;
  if (!raw) return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Phase 2 — one GET /tests/my-applications item (aligned with resolve / apply flags).
 */
function buildMyTestApplicationItem({
  row,
  appliedAtIso,
  cycleState,
  cyclePhase,
  examDate,
  startAccess = null,
  enrolledCount,
  capacityTotal,
  mayReapplyForNewCycle = false,
  applyBlockReason = null,
}) {
  const isCurrentCycle = cycleState.alreadyAppliedInCurrentCycle === true;
  const canReapply = mayReapplyForNewCycle === true;
  const capacityTotalNorm = Math.max(0, Number(capacityTotal || 0));
  const enrolledCountNorm = Math.max(0, Number(enrolledCount || 0));
  return {
    testId: String(row.id),
    testTitle: String(row.title || 'Test'),
    appliedAt: appliedAtIso,
    isPublished: row.is_published === true,
    alreadyAppliedInCurrentCycle: isCurrentCycle,
    mayReapplyForNewCycle: canReapply,
    enrolledInCurrentCycle: isCurrentCycle && !canReapply,
    cyclePhase,
    enrolledCount: enrolledCountNorm,
    capacityTotal: capacityTotalNorm,
    remainingSeats: Math.max(0, capacityTotalNorm - enrolledCountNorm),
    slotLabel: String(row.slot_label || ''),
    examDate,
    lastCycleStartedAt: normalizeCycleStartedAtIso(row),
    canStart: isCurrentCycle ? startAccess?.canStart === true : false,
    startBlockReason: isCurrentCycle
      ? startAccess?.startBlockReason || null
      : canReapply
        ? null
        : applyBlockReason || 'Apply again when the new test cycle opens',
    joinClosesAt: isCurrentCycle ? startAccess?.joinClosesAt || null : null,
  };
}

/**
 * Whether my-applications row should sync into Android local appliedSeries cache.
 * Re-apply eligible rows are API-only — must not become ghost "applied" on device.
 */
function shouldSyncMyApplicationToLocalAppliedSeries(item) {
  return item?.alreadyAppliedInCurrentCycle === true && item?.mayReapplyForNewCycle !== true;
}

/**
 * Phase 1 — schedule snapshot for POST /tests/:id/apply responses.
 */
function resolveApplyResponseScheduleFields({
  test,
  scheduleTimerEnabled = false,
  advancedConfig = {},
  cyclePhase = 'live',
  catalogError = null,
  alreadyAppliedInCurrentCycle = true,
  attemptAccess = { allowed: true },
  nowMs = Date.now(),
}) {
  const { evaluateTestStartAccess } = require('./testStartAccess');
  const examDate = resolveExamDate(test, nowMs);
  const slotLabel = String(test?.slot_label || '');
  const startAccess = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle,
    scheduleTimerEnabled,
    cyclePhase,
    catalogError,
    examDate,
    slotLabel,
    lateJoinMinutes: Math.max(0, Number(advancedConfig.lateJoinMinutes || 0)),
    attemptAccess,
    nowMs,
    row: test,
    advancedConfig,
  });
  return {
    examDate: examDate || null,
    slotLabel,
    canStart: startAccess.canStart,
    startBlockReason: startAccess.startBlockReason,
    joinClosesAt: startAccess.joinClosesAt,
    lastCycleStartedAt: normalizeCycleStartedAtIso(test),
  };
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
  examDate = null,
  slotLabel = null,
  canStart = null,
  startBlockReason = null,
  joinClosesAt = null,
  lastCycleStartedAt = null,
}) {
  const counts = normalizeEnrollmentCounts(test, enrolledCount, capacityTotal);
  const enrolledInCurrentCycle = alreadyAppliedInCurrentCycle && !waitlisted;
  const body = {
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
  if (examDate != null) body.examDate = examDate;
  if (slotLabel != null) body.slotLabel = String(slotLabel);
  if (canStart != null) body.canStart = canStart === true;
  if (startBlockReason != null) body.startBlockReason = startBlockReason;
  if (joinClosesAt != null) body.joinClosesAt = joinClosesAt;
  if (lastCycleStartedAt != null) body.lastCycleStartedAt = lastCycleStartedAt;
  return body;
}

/**
 * Phase 5 — Attempt boundary aligned with testCycleWindow (null when cycle not seeded yet).
 */
function resolveAttemptCycleStartedAtMs(row, nowMs = Date.now()) {
  const { resolveAttemptCycleStartedAtMs: fromWindow } = loadCycleWindowHelpers();
  return fromWindow(row, nowMs);
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
  buildMyTestApplicationItem,
  shouldSyncMyApplicationToLocalAppliedSeries,
  normalizeCycleStartedAtIso,
  buildApplyResponseBody,
  resolveApplyResponseScheduleFields,
  resolveAttemptCycleStartedAtMs,
};
