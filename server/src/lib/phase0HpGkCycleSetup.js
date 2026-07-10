'use strict';

const { sanitizeHomeContentForPublicApi } = require('./homeContentPublicSanitize');
const { buildAdminTestCycleDiagnostics } = require('./adminTestCycleDiagnostics');
const { classifyCycleMode, CYCLE_MODES } = require('./testCycleWindow');
const { evaluateTestStartAccess } = require('./testStartAccess');
const { resolveExamDate } = require('./testApplicationCycle');
const { buildExamStartMs } = require('./examSchedule');

/** Production HP GK test id (stable across envs). */
const HP_GK_TEST_ID = '2c7f05c8-7048-43f7-aec3-3013bc02acf2';

const HP_GK_TITLE = 'HP GK';

/** Fields we verify on HP GK — we never auto-mutate these in Phase 0. */
const HP_GK_REQUIRED = Object.freeze({
  dynamic_date_enabled: true,
  date_cycle_days: 1,
  min_duration_minutes: 1,
});

function normalizeSlotKey(slot) {
  return String(slot || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isNinePmSlot(slotLabel) {
  const s = normalizeSlotKey(slotLabel);
  return s === '09:00 pm' || s === '9:00 pm' || s === '21:00' || s === '21:00 pm';
}

function validateHpGkRow(row) {
  const issues = [];
  const warnings = [];
  if (!row) {
    issues.push('HP GK test row not found in database');
    return { ok: false, issues, warnings, row: null };
  }
  if (row.is_published !== true) {
    issues.push('HP GK is not published (is_published must be true)');
  }
  if (!String(row.exam_date || '').trim()) {
    issues.push('HP GK missing exam_date (required for 9 PM schedule)');
  }
  if (!String(row.slot_label || '').trim()) {
    issues.push('HP GK missing slot_label (required for 9 PM schedule)');
  } else if (!isNinePmSlot(row.slot_label)) {
    warnings.push(
      `HP GK slot_label is "${row.slot_label}" (expected 09:00 PM — verify in admin if intentional)`,
    );
  }
  if (row.dynamic_date_enabled !== HP_GK_REQUIRED.dynamic_date_enabled) {
    issues.push('HP GK dynamic_date_enabled must be true for daily next-day cycles');
  }
  const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
  if (cycleDays !== HP_GK_REQUIRED.date_cycle_days) {
    issues.push(`HP GK date_cycle_days must be ${HP_GK_REQUIRED.date_cycle_days} (got ${cycleDays})`);
  }
  const duration = Math.max(0, Number(row.duration_minutes || 0));
  if (duration < HP_GK_REQUIRED.min_duration_minutes) {
    issues.push('HP GK duration_minutes must be set (attempt window)');
  }
  const mode = classifyCycleMode(row);
  if (mode !== CYCLE_MODES.SCHEDULED_WITH_CYCLE_DAYS) {
    issues.push(`HP GK cycle mode must be scheduled_with_cycle_days (got ${mode})`);
  }
  const resolvedExamDate = resolveExamDate(row);
  const examStartMs = resolvedExamDate
    ? buildExamStartMs(resolvedExamDate, row.slot_label)
    : Number.NaN;
  if (!resolvedExamDate || !Number.isFinite(examStartMs)) {
    issues.push('HP GK resolved exam schedule is invalid (exam_date + slot_label)');
  }
  return {
    ok: issues.length === 0,
    issues,
    warnings,
    row,
    mode,
    resolvedExamDate,
    examStartMs,
  };
}

/**
 * Timer ON is safe for tests without exam_date — server/client skip slot lock when date missing.
 */
function assessScheduleTimerSafety(publishedTests) {
  const rows = Array.isArray(publishedTests) ? publishedTests : [];
  const withExam = rows.filter((r) => String(r.exam_date || '').trim() && String(r.slot_label || '').trim());
  const withoutExam = rows.filter(
    (r) => !String(r.exam_date || '').trim() || !String(r.slot_label || '').trim(),
  );
  const warnings = [];
  if (withExam.length === 0) {
    warnings.push('No published tests with exam_date+slot — schedule timer ON has limited effect');
  }
  return {
    safe: true,
    publishedCount: rows.length,
    withExamDateCount: withExam.length,
    withoutExamDateCount: withoutExam.length,
    withoutExamTitles: withoutExam.map((r) => String(r.title || r.id || '').trim()).filter(Boolean).slice(0, 8),
    warnings,
  };
}

function buildHomeContentTimerEnablePatch(rawHomeContent) {
  const merged = {
    ...(rawHomeContent && typeof rawHomeContent === 'object' ? rawHomeContent : {}),
    startSeriesScheduleTimerEnabled: true,
  };
  const cleaned = sanitizeHomeContentForPublicApi(merged);
  if (!cleaned) {
    return { ok: false, error: 'homeContent could not be sanitized', cleaned: null, changed: false };
  }
  const wasEnabled = rawHomeContent?.startSeriesScheduleTimerEnabled === true;
  const changed = !wasEnabled;
  return {
    ok: true,
    error: null,
    cleaned,
    changed,
    wasEnabled,
  };
}

function simulateHpGkStartAccess(hpGkRow, scheduleTimerEnabled, nowMs) {
  const examDate = resolveExamDate(hpGkRow);
  return evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled,
    cyclePhase: 'live',
    catalogError: null,
    examDate,
    slotLabel: hpGkRow?.slot_label,
    lateJoinMinutes: 0,
    attemptAccess: { allowed: true },
    nowMs,
    row: hpGkRow,
    advancedConfig: {},
  });
}

function buildPhase0Report({
  hpGkValidation,
  timerSafety,
  homeTimerState,
  diagnostics,
  advancedConfig,
}) {
  const lines = [];
  lines.push('=== Phase 0 HP GK cycle setup report ===');
  lines.push('');
  lines.push(`HP GK row: ${hpGkValidation.ok ? 'OK' : 'ISSUES'}`);
  for (const i of hpGkValidation.issues) lines.push(`  ISSUE: ${i}`);
  for (const w of hpGkValidation.warnings) lines.push(`  WARN:  ${w}`);
  if (hpGkValidation.resolvedExamDate) {
    lines.push(`  resolvedExamDate: ${hpGkValidation.resolvedExamDate}`);
  }
  lines.push('');
  lines.push(`Schedule timer (home CMS): ${homeTimerState.enabled ? 'ON' : 'OFF'}`);
  if (homeTimerState.needsEnable) {
    lines.push('  ACTION: enable startSeriesScheduleTimerEnabled (safe for manual tests without exam date)');
  } else {
    lines.push('  OK: already enabled');
  }
  lines.push('');
  lines.push(
    `Published tests: ${timerSafety.publishedCount} total, ${timerSafety.withExamDateCount} scheduled, ${timerSafety.withoutExamDateCount} without full schedule`,
  );
  for (const w of timerSafety.warnings) lines.push(`  WARN: ${w}`);
  if (timerSafety.withoutExamTitles.length) {
    lines.push(`  Manual/no-slot tests (unaffected by timer): ${timerSafety.withoutExamTitles.join(', ')}`);
  }
  lines.push('');
  const rv = String(advancedConfig?.resultVisibility || 'immediate').trim();
  lines.push(`HP GK resultVisibility: ${rv} (verify-only in Phase 0 — not auto-changed)`);
  if (rv === 'immediate') {
    lines.push('  NOTE: immediate = View Result right after submit (no 3h countdown)');
  } else if (rv === 'after_result_time') {
    lines.push('  NOTE: after_result_time = result countdown after submit');
  }
  if (diagnostics) {
    lines.push('');
    lines.push('Cycle diagnostics snapshot:');
    lines.push(`  mode: ${diagnostics.mode}`);
    lines.push(`  examStartAt: ${diagnostics.examStartAt}`);
    lines.push(`  examEndAt: ${diagnostics.examEndAt}`);
    lines.push(`  applyOpen: ${diagnostics.applyOpen}`);
    lines.push(`  applyBlockReason: ${diagnostics.applyBlockReason || '—'}`);
    lines.push(`  rolloverWouldExecute: ${diagnostics.rolloverWouldExecute}`);
    lines.push(`  rolloverBlockedReason: ${diagnostics.rolloverBlockedReason || '—'}`);
    lines.push(`  pendingDeferredResults: ${diagnostics.pendingDeferredResults}`);
  }
  return lines.join('\n');
}

function canApplyPhase0({ hpGkValidation, timerSafety, homeTimerState }) {
  if (!hpGkValidation.ok) return { ok: false, reason: 'HP GK validation failed' };
  if (!timerSafety.safe) return { ok: false, reason: 'Schedule timer safety check failed' };
  if (!homeTimerState.needsEnable) return { ok: false, reason: 'Schedule timer already enabled' };
  return { ok: true, reason: null };
}

module.exports = {
  HP_GK_TEST_ID,
  HP_GK_TITLE,
  validateHpGkRow,
  assessScheduleTimerSafety,
  buildHomeContentTimerEnablePatch,
  simulateHpGkStartAccess,
  buildPhase0Report,
  canApplyPhase0,
  isNinePmSlot,
  buildAdminTestCycleDiagnostics,
};
