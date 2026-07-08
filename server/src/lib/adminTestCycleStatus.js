'use strict';

const {
  buildTestResolvePayload,
  resolveTestCyclePhase,
} = require('./testResolve');
const { shouldRunSchedulerRollover } = require('./testCycleWindow');

/**
 * Admin-facing cycle badge fields for GET /admin/tests (Phase 5).
 *
 * @param {object} row — tests DB row (includes last_cycle_started_at when available)
 * @param {object|null|undefined} advancedConfig
 * @param {object[]} [publishScheduleItems]
 * @param {number} [nowMs]
 */
function buildAdminTestCycleFields(row, advancedConfig, publishScheduleItems = [], nowMs = Date.now()) {
  const payload = buildTestResolvePayload({
    row,
    advancedConfig,
    nowMs,
    publishScheduleItems,
  });

  const phase = payload.cyclePhase;
  /** Phase 8: same rollover rule as index.js scheduler (not duration_minutes alone). */
  const stuckPublishedAfterCycle =
    row?.is_published === true && shouldRunSchedulerRollover(row, nowMs);

  let cycleStatus = 'unpublished';
  let cycleStatusLabel = 'Unpublished';
  let republishOverdue = false;

  if (stuckPublishedAfterCycle) {
    cycleStatus = 'republish_overdue';
    cycleStatusLabel = 'Cycle expired';
    republishOverdue = true;
  } else if (phase === 'live') {
    cycleStatus = 'live';
    cycleStatusLabel = 'Live';
  } else if (phase === 'between_cycles') {
    cycleStatus = 'between_cycles';
    cycleStatusLabel = 'Between cycles';
    const republishMs = Date.parse(String(payload.republishAt || ''));
    if (Number.isFinite(republishMs) && nowMs >= republishMs) {
      cycleStatus = 'republish_overdue';
      cycleStatusLabel = 'Republish overdue';
      republishOverdue = true;
    }
  } else if (phase === 'scheduled') {
    cycleStatus = 'scheduled';
    cycleStatusLabel = 'Scheduled';
  } else if (phase === 'closed') {
    cycleStatus = 'closed';
    cycleStatusLabel = 'Closed';
  }

  const canRepublishNow =
    phase === 'between_cycles' ||
    (stuckPublishedAfterCycle && phase !== 'closed' && phase !== 'scheduled');

  return {
    cycle_status: cycleStatus,
    cycle_status_label: cycleStatusLabel,
    cycle_phase: phase,
    republish_at: payload.republishAt,
    republish_overdue: republishOverdue,
    catalog_visible: payload.catalogVisible,
    can_republish_now: canRepublishNow,
  };
}

/**
 * Count pending publish schedule items whose scheduleAt is in the past.
 */
function countOverduePublishSchedules(publishScheduleItems, nowMs = Date.now()) {
  const items = Array.isArray(publishScheduleItems) ? publishScheduleItems : [];
  let count = 0;
  for (const raw of items) {
    const item = raw || {};
    const status = String(item.status || '').trim().toLowerCase();
    if (status !== 'scheduled' && status !== 'processing') continue;
    const scheduleMs = Date.parse(String(item.scheduleAt || ''));
    if (!Number.isFinite(scheduleMs) || scheduleMs > nowMs) continue;
    count += 1;
  }
  return count;
}

module.exports = {
  buildAdminTestCycleFields,
  countOverduePublishSchedules,
  resolveTestCyclePhase,
};
