'use strict';

const {
  buildExamStartMs,
  isBeforeExamStart,
  isAfterLateJoinWindow,
} = require('./examSchedule');
const { parseCycleEndMs } = require('./testCycleTiming');

/** Matches Android TestScheduleUtils.APPLIED_SERIES_NO_TIMER_TTL_MS */
const DEFAULT_NO_SCHEDULE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** When schedule timer is on but admin omitted lateJoinMinutes */
const DEFAULT_SCHEDULED_JOIN_MS = 24 * 60 * 60 * 1000;

function resolveJoinClosesAtMs({
  examDate,
  slotLabel,
  lateJoinMinutes,
  scheduleTimerEnabled,
  cycleEndMs,
  nowMs = Date.now(),
}) {
  const startMs = buildExamStartMs(examDate, slotLabel);
  if (scheduleTimerEnabled === true && startMs != null) {
    const lateMin = Math.max(0, Number(lateJoinMinutes || 0));
    const joinWindowMs = lateMin > 0 ? lateMin * 60 * 1000 : DEFAULT_SCHEDULED_JOIN_MS;
    return startMs + joinWindowMs;
  }
  if (Number.isFinite(cycleEndMs) && cycleEndMs > nowMs) {
    return cycleEndMs;
  }
  return nowMs + DEFAULT_NO_SCHEDULE_TTL_MS;
}

function formatStartBlockExamLabel(examDate, slotLabel) {
  const date = String(examDate || '').trim();
  const slot = String(slotLabel || '').trim();
  if (!date) return 'the scheduled time';
  return slot ? `${date} ${slot}` : date;
}

/**
 * Whether an already-applied user may enter the quiz now.
 * Apply (canApply) and start (canStart) are intentionally separate.
 */
function evaluateTestStartAccess({
  alreadyAppliedInCurrentCycle,
  scheduleTimerEnabled = false,
  cyclePhase,
  catalogError,
  examDate,
  slotLabel,
  lateJoinMinutes = 0,
  attemptAccess,
  nowMs = Date.now(),
  row,
  advancedConfig,
}) {
  const cycleEndMs = parseCycleEndMs(row);
  const joinClosesAtMs = resolveJoinClosesAtMs({
    examDate,
    slotLabel,
    lateJoinMinutes,
    scheduleTimerEnabled,
    cycleEndMs,
    nowMs,
  });
  const joinClosesAt =
    Number.isFinite(joinClosesAtMs) && joinClosesAtMs > 0
      ? new Date(joinClosesAtMs).toISOString()
      : null;

  if (!alreadyAppliedInCurrentCycle) {
    return {
      canStart: false,
      startBlockReason: null,
      joinClosesAt: null,
    };
  }

  if (cyclePhase === 'between_cycles') {
    return {
      canStart: false,
      startBlockReason: 'Test is between cycles — opens again when republished',
      joinClosesAt: null,
    };
  }

  if (cyclePhase === 'closed') {
    return {
      canStart: false,
      startBlockReason: catalogError || 'Test registration has closed',
      joinClosesAt: null,
    };
  }

  if (cyclePhase === 'scheduled' || cyclePhase === 'unpublished' || cyclePhase === 'not_found') {
    return {
      canStart: false,
      startBlockReason: catalogError || 'Test is not available yet',
      joinClosesAt: null,
    };
  }

  if (catalogError) {
    return {
      canStart: false,
      startBlockReason: catalogError,
      joinClosesAt: null,
    };
  }

  if (scheduleTimerEnabled === true && buildExamStartMs(examDate, slotLabel) != null) {
    if (isBeforeExamStart(examDate, slotLabel, nowMs)) {
      return {
        canStart: false,
        startBlockReason: `Test starts on ${formatStartBlockExamLabel(examDate, slotLabel)}`,
        joinClosesAt,
      };
    }
    const lateMin = Math.max(0, Number(lateJoinMinutes || 0));
    if (lateMin > 0 && isAfterLateJoinWindow(examDate, slotLabel, lateMin, nowMs)) {
      return {
        canStart: false,
        startBlockReason: 'Late join window has closed for this test',
        joinClosesAt,
      };
    }
  }

  if (attemptAccess && attemptAccess.allowed === false) {
    return {
      canStart: false,
      startBlockReason: attemptAccess.error || 'Attempt not allowed for this test',
      joinClosesAt,
    };
  }

  return {
    canStart: true,
    startBlockReason: null,
    joinClosesAt,
  };
}

async function loadScheduleTimerEnabled(db) {
  try {
    const { rows } = await db.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'homeContent' LIMIT 1`,
    );
    const parsed = JSON.parse(String(rows[0]?.setting_value || '{}'));
    return parsed?.startSeriesScheduleTimerEnabled === true;
  } catch (_e) {
    return false;
  }
}

module.exports = {
  DEFAULT_NO_SCHEDULE_TTL_MS,
  DEFAULT_SCHEDULED_JOIN_MS,
  resolveJoinClosesAtMs,
  evaluateTestStartAccess,
  loadScheduleTimerEnabled,
};
