'use strict';

const { resolveCycleWindows, shouldRunSchedulerRollover } = require('./testCycleWindow');
const {
  isResultVisibilityDeferred,
  isCycleRolloverDeferEnabled,
  hasPendingDeferredResultsInCycle,
  loadResultUnlockEmailSettings,
} = require('./resultUnlock');

function msToIso(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Admin GET /admin/tests/:id/cycle-diagnostics — live cycle + rollover gate snapshot.
 */
async function buildAdminTestCycleDiagnostics(pool, row, advancedConfig, nowMs = Date.now()) {
  const windows = resolveCycleWindows(row, nowMs);
  const resultVisibility = String(advancedConfig?.resultVisibility || 'immediate')
    .trim()
    .toLowerCase();
  const deferred = isResultVisibilityDeferred(resultVisibility);
  const deferEnabled = isCycleRolloverDeferEnabled();
  const settings = await loadResultUnlockEmailSettings(pool);

  let pendingDeferredResults = false;
  const testId = String(row?.id || '').trim();
  if (deferred && testId) {
    pendingDeferredResults = await hasPendingDeferredResultsInCycle({
      db: pool,
      testId,
      lastCycleStartedAt: row?.last_cycle_started_at,
      delayHours: settings.delayHours,
      now: new Date(nowMs),
    });
  }

  const rolloverDue = shouldRunSchedulerRollover(row, nowMs);
  let rolloverBlockedReason = null;
  if (rolloverDue) {
    if (deferEnabled && deferred && pendingDeferredResults) {
      rolloverBlockedReason = 'pending_deferred_results';
    }
  }

  return {
    testId,
    now: new Date(nowMs).toISOString(),
    mode: windows.mode,
    modeLabel: windows.modeLabel,
    durationMinutes: windows.durationMinutes,
    dateCycleDays: windows.dateCycleDays,
    dynamicDateEnabled: windows.dynamicDateEnabled,
    cycleStartedAt: msToIso(windows.cycleStartedMs),
    examStartAt: msToIso(windows.examStartMs),
    examEndAt: msToIso(windows.examEndMs),
    schedulerCycleEndAt: msToIso(windows.schedulerCycleEndMs),
    resolvedExamDate: windows.resolvedExamDate,
    examInProgress: windows.examInProgress,
    shouldRunSchedulerRollover: windows.shouldRunSchedulerRollover,
    applyOpen: windows.applyOpen,
    applyBlockReason: windows.applyBlockReason,
    resultVisibility,
    resultUnlockDelayHours: settings.delayHours,
    schedulerDeferResultsEnabled: deferEnabled,
    pendingDeferredResults,
    rolloverDue,
    rolloverBlockedReason,
    rolloverWouldExecute: rolloverDue && !rolloverBlockedReason,
  };
}

module.exports = {
  buildAdminTestCycleDiagnostics,
};
