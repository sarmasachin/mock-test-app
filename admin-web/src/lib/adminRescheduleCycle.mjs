/**
 * Shared admin reschedule → enrollment renewal detection.
 * Mirrors server/src/lib/testCycleWindow.js (shouldRenewCycleOnAdminEdit chain).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const EXAM_TZ_OFFSET_MINUTES = 330;

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

function toIsoDate(base) {
  if (!base || Number.isNaN(base.getTime())) return null;
  return base.toISOString().slice(0, 10);
}

function resolveExamDate(row, nowMs = Date.now()) {
  if (!row) return null;
  const base = row.exam_date ? new Date(row.exam_date) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  if (!row.dynamic_date_enabled) return toIsoDate(base);
  const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
  if (!cycleDays) return toIsoDate(base);
  const today = new Date(nowMs);
  const diffMs = today.setHours(0, 0, 0, 0) - new Date(base).setHours(0, 0, 0, 0);
  if (diffMs <= 0) return toIsoDate(base);
  const diffDays = Math.floor(diffMs / MS_PER_DAY);
  const jump = Math.ceil(diffDays / cycleDays) * cycleDays;
  const shifted = new Date(base);
  shifted.setDate(shifted.getDate() + jump);
  return toIsoDate(shifted);
}

function parseHourMinuteFromSlotLabel(slotLabel) {
  const raw = String(slotLabel || '').trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const meridiem = String(m[3] || '').toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return { hour, minute };
}

function buildExamStartMs(examDate, slotLabel) {
  const date = String(examDate || '').trim();
  if (!date) return null;
  const hm = parseHourMinuteFromSlotLabel(slotLabel);
  const tzOffsetMinutes = EXAM_TZ_OFFSET_MINUTES;
  const sign = tzOffsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMinutes);
  const tzH = String(Math.floor(abs / 60)).padStart(2, '0');
  const tzM = String(abs % 60).padStart(2, '0');
  let iso;
  if (hm) {
    const hh = String(hm.hour).padStart(2, '0');
    const mm = String(hm.minute).padStart(2, '0');
    iso = `${date}T${hh}:${mm}:00${sign}${tzH}:${tzM}`;
  } else {
    iso = `${date}T00:00:00${sign}${tzH}:${tzM}`;
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return ms;
}

function resolveExamWindowMs(row, nowMs = Date.now()) {
  const resolvedExamDate = resolveExamDate(row, nowMs);
  if (!resolvedExamDate) {
    return { examStartMs: Number.NaN, examEndMs: Number.NaN, resolvedExamDate: null };
  }
  const examStartMs = buildExamStartMs(resolvedExamDate, row?.slot_label);
  if (!Number.isFinite(examStartMs)) {
    return { examStartMs: Number.NaN, examEndMs: Number.NaN, resolvedExamDate };
  }
  const durationMin = parseDurationMinutes(row);
  const examEndMs = durationMin > 0 ? examStartMs + durationMin * MS_PER_MINUTE : examStartMs;
  return { examStartMs, examEndMs, resolvedExamDate };
}

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
  if (mode !== CYCLE_MODES.SCHEDULED_SINGLE && mode !== CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS) {
    return false;
  }
  const { examStartMs, examEndMs } = resolveExamWindowMs(row, nowMs);
  if (!Number.isFinite(examStartMs) || !Number.isFinite(examEndMs)) return false;
  return nowMs >= examStartMs && nowMs < examEndMs;
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

export function hasAdminScheduleFieldsChanged(beforeRow, afterRow) {
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

export function hasPreviousCatalogCycleEnded(beforeRow, nowMs = Date.now()) {
  if (!beforeRow || beforeRow.is_published !== true) {
    return false;
  }
  if (isExamInProgress(beforeRow, nowMs)) {
    return false;
  }
  return shouldRunSchedulerRollover(beforeRow, nowMs);
}

export function shouldRenewCycleOnAdminEdit(beforeRow, afterRow, nowMs = Date.now()) {
  if (!beforeRow || !afterRow || afterRow.is_published !== true) {
    return false;
  }
  if (!hasAdminScheduleFieldsChanged(beforeRow, afterRow)) {
    return false;
  }
  return hasPreviousCatalogCycleEnded(beforeRow, nowMs);
}

export function baselineToCycleRow(baseline) {
  return {
    exam_date: baseline.examDate || null,
    slot_label: baseline.slotLabel || '',
    dynamic_date_enabled: baseline.dynamicDateEnabled === true,
    date_cycle_days: Math.max(0, Number(baseline.dateCycleDays || 0)),
    duration_minutes: Math.max(0, Number(baseline.durationMinutes || 0)),
    is_published: baseline.isPublished !== false,
    last_cycle_started_at: baseline.lastCycleStartedAt || null,
  };
}

export function previewRescheduleCycleRenewal(baseline, draft, nowMs = Date.now()) {
  if (!baseline) return false;
  const beforeRow = baselineToCycleRow(baseline);
  const afterRow = {
    ...beforeRow,
    exam_date: draft.examDate || null,
    slot_label: draft.slotLabel || '',
    dynamic_date_enabled: draft.dynamicDateEnabled === true,
    date_cycle_days: Math.max(0, Number(draft.dateCycleDays || 0)),
    duration_minutes: Math.max(0, Number(draft.durationMinutes || 0)),
    is_published: draft.isPublished !== false,
  };
  return shouldRenewCycleOnAdminEdit(beforeRow, afterRow, nowMs);
}

export function buildRescheduleConfirmDialog(input) {
  const title = String(input?.testTitle || '').trim() || 'this test';
  const enrolledCount = Math.max(0, Number(input?.enrolledCount || 0));
  const enrolledLine =
    enrolledCount > 0 ? ` The current enrollment count (${enrolledCount}) will reset to zero.` : '';
  return {
    title: 'Start a new enrollment period?',
    message:
      `Saving schedule changes for "${title}" after the previous exam round has ended will open a new enrollment period. Students who enrolled earlier will need to apply again.${enrolledLine}`,
    confirmLabel: 'Save schedule',
    cancelLabel: 'Keep current schedule',
  };
}

export function buildRescheduleInlineNotice() {
  return 'After the exam window ends, changing the exam date, slot time, or repeat-cycle settings opens a new enrollment period. Previously enrolled students must apply again.';
}
