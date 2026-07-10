'use strict';

/**
 * Phase 1 — Canonical exam / cycle window rules (single source of truth).
 *
 * duration_minutes = attempt length ONLY (exam start → exam end).
 * date_cycle_days  = rolling or scheduled multi-cycle interval (admin sets any N).
 * Scheduler rollover MUST use resolveSchedulerCycleEndMs — NOT duration_minutes alone.
 *
 * Modes:
 *   scheduled_with_cycle_days — exam_date + Date On (Nd)
 *   scheduled_single          — exam_date, Date Off
 *   rolling_no_exam_date      — no exam_date, Date On (Nd)
 *   manual_no_auto_cycle      — no exam_date, Date Off (e.g. ff)
 */

const { buildExamStartMs } = require('./examSchedule');
const { resolveExamDate } = require('./testApplicationCycle');
const { parseCycleEndMs: legacyParseCycleEndMs } = require('./testCycleTiming');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

const CYCLE_MODES = Object.freeze({
  SCHEDULED_WITH_CYCLE_DAYS: 'scheduled_with_cycle_days',
  SCHEDULED_SINGLE: 'scheduled_single',
  ROLLING_NO_EXAM_DATE: 'rolling_no_exam_date',
  MANUAL_NO_AUTO_CYCLE: 'manual_no_auto_cycle',
});

function classifyCycleMode(row) {
  if (!row) return CYCLE_MODES.MANUAL_NO_AUTO_CYCLE;
  const examDate = row.exam_date ? String(row.exam_date).trim() : '';
  const dateOn = row.dynamic_date_enabled === true;
  const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
  if (examDate) {
    return dateOn && cycleDays > 0
      ? CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS
      : CYCLE_MODES.SCHEDULED_SINGLE;
  }
  if (dateOn && cycleDays > 0) return CYCLE_MODES.ROLLING_NO_EXAM_DATE;
  return CYCLE_MODES.MANUAL_NO_AUTO_CYCLE;
}

function cycleModeLabel(mode) {
  switch (mode) {
    case CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS:
      return 'Mode A — exam date + N-day cycles';
    case CYCLE_MODES.SCHEDULED_SINGLE:
      return 'Scheduled — single exam window';
    case CYCLE_MODES.ROLLING_NO_EXAM_DATE:
      return 'Mode B — rolling N-day cycle (no exam date)';
    case CYCLE_MODES.MANUAL_NO_AUTO_CYCLE:
      return 'Mode C — manual only (no auto scheduler rollover)';
    default:
      return String(mode || 'unknown');
  }
}

function parseDurationMinutes(row) {
  return Math.max(0, Number(row?.duration_minutes || 0));
}

function parseCycleDays(row) {
  return Math.max(0, Number(row?.date_cycle_days || 0));
}

function parseCycleStartedMs(row) {
  const ms = Date.parse(String(row?.last_cycle_started_at || ''));
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * @returns {{ examStartMs: number, examEndMs: number, resolvedExamDate: string|null }}
 */
function resolveExamWindowMs(row, nowMs = Date.now()) {
  const resolvedExamDate = resolveExamDate(row);
  if (!resolvedExamDate) {
    return { examStartMs: Number.NaN, examEndMs: Number.NaN, resolvedExamDate: null };
  }
  const examStartMs = buildExamStartMs(resolvedExamDate, row?.slot_label);
  if (!Number.isFinite(examStartMs)) {
    return { examStartMs: Number.NaN, examEndMs: Number.NaN, resolvedExamDate };
  }
  const durationMin = parseDurationMinutes(row);
  const examEndMs =
    durationMin > 0 ? examStartMs + durationMin * MS_PER_MINUTE : examStartMs;
  return { examStartMs, examEndMs, resolvedExamDate };
}

/**
 * When Phase 2 scheduler should treat the current cycle as complete (epoch ms).
 * Returns NaN when auto rollover must NOT run.
 */
function resolveSchedulerCycleEndMs(row, mode = classifyCycleMode(row)) {
  switch (mode) {
    case CYCLE_MODES.MANUAL_NO_AUTO_CYCLE:
      return Number.NaN;
    case CYCLE_MODES.ROLLING_NO_EXAM_DATE: {
      const startedMs = parseCycleStartedMs(row);
      const cycleDays = parseCycleDays(row);
      if (!Number.isFinite(startedMs) || cycleDays <= 0) return Number.NaN;
      return startedMs + cycleDays * MS_PER_DAY;
    }
    case CYCLE_MODES.SCHEDULED_SINGLE:
    case CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS: {
      const { examEndMs } = resolveExamWindowMs(row);
      return Number.isFinite(examEndMs) ? examEndMs : Number.NaN;
    }
    default:
      return Number.NaN;
  }
}

function shouldRunSchedulerRollover(row, nowMs = Date.now()) {
  if (row?.is_published !== true) return false;
  const mode = classifyCycleMode(row);
  if (mode === CYCLE_MODES.MANUAL_NO_AUTO_CYCLE) return false;
  const cycleEndMs = resolveSchedulerCycleEndMs(row, mode);
  if (!Number.isFinite(cycleEndMs)) return false;
  return nowMs >= cycleEndMs;
}

function isExamInProgress(row, nowMs = Date.now()) {
  const mode = classifyCycleMode(row);
  if (
    mode !== CYCLE_MODES.SCHEDULED_SINGLE &&
    mode !== CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS
  ) {
    return false;
  }
  const { examStartMs, examEndMs } = resolveExamWindowMs(row, nowMs);
  if (!Number.isFinite(examStartMs) || !Number.isFinite(examEndMs)) return false;
  return nowMs >= examStartMs && nowMs < examEndMs;
}

function isPostExamPreRollover(row, nowMs, examEndMs) {
  if (!Number.isFinite(examEndMs) || nowMs < examEndMs) return false;
  const startedMs = parseCycleStartedMs(row);
  if (!Number.isFinite(startedMs)) return true;
  return startedMs < examEndMs;
}

/**
 * Whether new applications are allowed now (Phase 3 will wire into canApply).
 * @returns {{ open: boolean, reason: string|null }}
 */
function resolveApplyWindowState(row, nowMs = Date.now()) {
  if (row?.is_published !== true) {
    return { open: false, reason: 'Test is not published' };
  }

  if (isExamInProgress(row, nowMs)) {
    return { open: false, reason: 'Registration closed — exam in progress' };
  }

  const mode = classifyCycleMode(row);
  const { examStartMs, examEndMs, resolvedExamDate } = resolveExamWindowMs(row, nowMs);

  if (
    mode === CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS ||
    mode === CYCLE_MODES.SCHEDULED_SINGLE
  ) {
    if (!resolvedExamDate || !Number.isFinite(examStartMs)) {
      return { open: false, reason: 'Exam schedule is not configured' };
    }
    if (isPostExamPreRollover(row, nowMs, examEndMs)) {
      return { open: false, reason: 'Exam completed — preparing next cycle' };
    }
    if (nowMs < examStartMs) {
      return { open: true, reason: null };
    }
    if (mode === CYCLE_MODES.SCHEDULED_SINGLE && nowMs >= examEndMs) {
      return { open: false, reason: 'Exam window has ended' };
    }
    if (mode === CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS && nowMs >= examEndMs) {
      const startedMs = parseCycleStartedMs(row);
      if (Number.isFinite(startedMs) && startedMs >= examEndMs) {
        return { open: true, reason: null };
      }
      return { open: false, reason: 'Exam window has ended' };
    }
    return { open: false, reason: 'Registration is not open' };
  }

  if (mode === CYCLE_MODES.ROLLING_NO_EXAM_DATE) {
    return { open: true, reason: null };
  }

  return { open: true, reason: null };
}

/**
 * Phase 4 — Admin publish: whether to seed last_cycle_started_at = now().
 * Future scheduled exams defer the cycle marker until exam window (no duration timer).
 */
function shouldSeedCycleStartOnAdminPublish(row, nowMs = Date.now()) {
  const mode = classifyCycleMode(row);
  if (
    mode === CYCLE_MODES.MANUAL_NO_AUTO_CYCLE ||
    mode === CYCLE_MODES.ROLLING_NO_EXAM_DATE
  ) {
    return true;
  }
  if (
    mode === CYCLE_MODES.SCHEDULED_SINGLE ||
    mode === CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS
  ) {
    const { examStartMs } = resolveExamWindowMs(row, nowMs);
    if (Number.isFinite(examStartMs) && nowMs < examStartMs) {
      return false;
    }
    return true;
  }
  return true;
}

function normalizeExamDateKey(value) {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return text;
}

function normalizeSlotLabelKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDynamicDateKey(row) {
  return row?.dynamic_date_enabled === true;
}

function normalizeCycleDaysKey(row) {
  return Math.max(0, Number(row?.date_cycle_days || 0));
}

/**
 * True when admin save changes fields that define the next exam round schedule.
 */
function hasAdminScheduleFieldsChanged(beforeRow, afterRow) {
  if (!beforeRow || !afterRow) return false;
  if (normalizeExamDateKey(beforeRow.exam_date) !== normalizeExamDateKey(afterRow.exam_date)) {
    return true;
  }
  if (normalizeSlotLabelKey(beforeRow.slot_label) !== normalizeSlotLabelKey(afterRow.slot_label)) {
    return true;
  }
  if (normalizeDynamicDateKey(beforeRow) !== normalizeDynamicDateKey(afterRow)) {
    return true;
  }
  if (normalizeCycleDaysKey(beforeRow) !== normalizeCycleDaysKey(afterRow)) {
    return true;
  }
  return false;
}

/**
 * True when the prior catalog round has ended (same rule as scheduler rollover).
 * Uses beforeRow — state before admin save. Blocks renew while exam is in progress.
 */
function hasPreviousCatalogCycleEnded(beforeRow, nowMs = Date.now()) {
  if (!beforeRow || beforeRow.is_published !== true) {
    return false;
  }
  if (isExamInProgress(beforeRow, nowMs)) {
    return false;
  }
  return shouldRunSchedulerRollover(beforeRow, nowMs);
}

/**
 * Phase 9 — Renew application cycle when admin reschedules after a completed round.
 * Requires schedule field change AND prior round ended. Title/capacity-only edits never renew.
 */
function shouldRenewCycleOnAdminEdit(beforeRow, afterRow, nowMs = Date.now()) {
  if (!beforeRow || !afterRow || afterRow.is_published !== true) {
    return false;
  }
  if (!hasAdminScheduleFieldsChanged(beforeRow, afterRow)) {
    return false;
  }
  return hasPreviousCatalogCycleEnded(beforeRow, nowMs);
}

/**
 * Phase 4 — Admin create/patch/scheduled publish: when to SET last_cycle_started_at = now().
 * Never bumps an existing cycle on edit using duration_minutes (scheduler owns rollover).
 *
 * @returns {{ setCycleStart: boolean, reason: string|null }}
 */
function resolveAdminCycleStartUpdate(row, beforeRow, { justPublished = false, nowMs = Date.now() } = {}) {
  if (row?.is_published !== true) {
    return { setCycleStart: false, reason: 'unpublished' };
  }

  const hadCycleStart = Number.isFinite(parseCycleStartedMs(beforeRow || {}));
  const shouldSeed = shouldSeedCycleStartOnAdminPublish(row, nowMs);

  if (justPublished) {
    if (!shouldSeed) {
      return { setCycleStart: false, reason: 'future_exam_deferred' };
    }
    return { setCycleStart: true, reason: 'first_publish' };
  }

  if (!hadCycleStart && shouldSeed) {
    return { setCycleStart: true, reason: 'seed_missing_cycle_marker' };
  }

  if (shouldRenewCycleOnAdminEdit(beforeRow, row, nowMs)) {
    return { setCycleStart: true, reason: 'admin_reschedule_new_cycle' };
  }

  return {
    setCycleStart: false,
    reason: hadCycleStart ? 'cycle_active_no_bump_on_edit' : 'future_exam_deferred',
  };
}

/**
 * Phase 5 — Application / attempt cycle boundary (epoch ms).
 * Uses last_cycle_started_at when set (scheduler rollover or admin seed).
 * Returns NaN when boundary is not established yet (e.g. future exam before first rollover).
 */
function resolveApplicationCycleBoundaryMs(row, nowMs = Date.now()) {
  const startedMs = parseCycleStartedMs(row);
  if (Number.isFinite(startedMs)) {
    return startedMs;
  }
  return Number.NaN;
}

/**
 * Phase 5 — Attempt counting boundary; null when no established cycle marker.
 */
function resolveAttemptCycleStartedAtMs(row, nowMs = Date.now()) {
  const boundaryMs = resolveApplicationCycleBoundaryMs(row, nowMs);
  return Number.isFinite(boundaryMs) ? boundaryMs : null;
}

/**
 * Full snapshot for admin diagnostics, Phase 2 scheduler, and Phase 3 apply gates.
 */
function resolveCycleWindows(row, nowMs = Date.now()) {
  const mode = classifyCycleMode(row);
  const cycleDays = parseCycleDays(row);
  const durationMinutes = parseDurationMinutes(row);
  const cycleStartedMs = parseCycleStartedMs(row);
  const schedulerCycleEndMs = resolveSchedulerCycleEndMs(row, mode);
  const legacySchedulerCycleEndMs = legacyParseCycleEndMs(row);
  const examWindow = resolveExamWindowMs(row, nowMs);
  const applyState = resolveApplyWindowState(row, nowMs);

  return {
    mode,
    modeLabel: cycleModeLabel(mode),
    durationMinutes,
    dateCycleDays: cycleDays,
    dynamicDateEnabled: row?.dynamic_date_enabled === true,
    cycleStartedMs: Number.isFinite(cycleStartedMs) ? cycleStartedMs : null,
    schedulerCycleEndMs: Number.isFinite(schedulerCycleEndMs) ? schedulerCycleEndMs : null,
    legacySchedulerCycleEndMs: Number.isFinite(legacySchedulerCycleEndMs)
      ? legacySchedulerCycleEndMs
      : null,
    schedulerUsesDurationBug:
      Number.isFinite(legacySchedulerCycleEndMs) &&
      legacySchedulerCycleEndMs !== schedulerCycleEndMs,
    examStartMs: Number.isFinite(examWindow.examStartMs) ? examWindow.examStartMs : null,
    examEndMs: Number.isFinite(examWindow.examEndMs) ? examWindow.examEndMs : null,
    resolvedExamDate: examWindow.resolvedExamDate,
    examInProgress: isExamInProgress(row, nowMs),
    applyOpen: applyState.open,
    applyBlockReason: applyState.reason,
    shouldRunSchedulerRollover: shouldRunSchedulerRollover(row, nowMs),
    retainPublishedOnRollover: true,
  };
}

module.exports = {
  MS_PER_DAY,
  MS_PER_MINUTE,
  CYCLE_MODES,
  classifyCycleMode,
  cycleModeLabel,
  parseDurationMinutes,
  parseCycleDays,
  parseCycleStartedMs,
  resolveExamWindowMs,
  resolveSchedulerCycleEndMs,
  shouldRunSchedulerRollover,
  isExamInProgress,
  isPostExamPreRollover,
  resolveApplyWindowState,
  resolveCycleWindows,
  shouldSeedCycleStartOnAdminPublish,
  hasAdminScheduleFieldsChanged,
  hasPreviousCatalogCycleEnded,
  shouldRenewCycleOnAdminEdit,
  resolveAdminCycleStartUpdate,
  resolveApplicationCycleBoundaryMs,
  resolveAttemptCycleStartedAtMs,
  legacyParseCycleEndMs,
};
