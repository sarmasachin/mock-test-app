'use strict';

/**
 * Structured logs for processTestCycleAutoReschedule (Phase 5 observability).
 * Set CYCLE_SCHEDULER_LOG=false to disable. Default: on.
 * CYCLE_SCHEDULER_LOG_MIN_INTERVAL_MS (default 300000) dedupes identical events per test.
 */

const lastLoggedAt = new Map();

function isCycleSchedulerLogEnabled() {
  const raw = String(process.env.CYCLE_SCHEDULER_LOG ?? 'true')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function logCycleSchedulerEvent(event, payload = {}) {
  if (!isCycleSchedulerLogEnabled()) return;
  const testId = String(payload.testId || '').trim();
  const reason = String(payload.reason || '').trim();
  const key = `${event}:${testId}:${reason}`;
  const now = Date.now();
  const minInterval = Math.max(
    0,
    Number(process.env.CYCLE_SCHEDULER_LOG_MIN_INTERVAL_MS || 300000),
  );
  const prev = lastLoggedAt.get(key) || 0;
  if (minInterval > 0 && now - prev < minInterval) return;
  lastLoggedAt.set(key, now);
  console.info(event, {
    ...payload,
    at: new Date(now).toISOString(),
  });
}

function logCycleSchedulerSkip(testId, reason, extra = {}) {
  logCycleSchedulerEvent('cycle_scheduler_skip', {
    testId,
    reason,
    ...extra,
  });
}

function logCycleSchedulerRollover(testId, mode, extra = {}) {
  logCycleSchedulerEvent('cycle_scheduler_rollover', {
    testId,
    mode,
    ...extra,
  });
}

module.exports = {
  isCycleSchedulerLogEnabled,
  logCycleSchedulerEvent,
  logCycleSchedulerSkip,
  logCycleSchedulerRollover,
};
