'use strict';

const {
  isPublishScheduleItemPending,
  PUBLISH_SCHEDULE_STALE_PROCESSING_MS,
} = require('./testVisibility');

const DEFAULT_OVERDUE_ALERT_MINUTES = 5;

function getRepublishOverdueAlertMinutes() {
  const raw = Number(process.env.PUBLISH_SCHEDULE_OVERDUE_ALERT_MINUTES);
  if (Number.isFinite(raw) && raw >= 0) {
    return Math.min(1440, Math.floor(raw));
  }
  return DEFAULT_OVERDUE_ALERT_MINUTES;
}

function isScheduleItemOverdue(item, nowMs = Date.now()) {
  if (!isPublishScheduleItemPending(item)) return false;
  const scheduleMs = Date.parse(String(item?.scheduleAt || ''));
  if (!Number.isFinite(scheduleMs)) return false;
  return scheduleMs <= nowMs;
}

function overdueMinutesForItem(item, nowMs = Date.now()) {
  const scheduleMs = Date.parse(String(item?.scheduleAt || ''));
  if (!Number.isFinite(scheduleMs) || scheduleMs > nowMs) return 0;
  return Math.floor((nowMs - scheduleMs) / 60000);
}

function isStaleProcessingItem(item, nowMs = Date.now()) {
  if (String(item?.status || '').trim().toLowerCase() !== 'processing') return false;
  const startedMs = Date.parse(String(item?.processingStartedAt || ''));
  if (!Number.isFinite(startedMs)) return true;
  return nowMs - startedMs >= PUBLISH_SCHEDULE_STALE_PROCESSING_MS;
}

/**
 * Enrich publish schedule rows with health flags for admin UI + ops logs.
 *
 * @param {object[]} items
 * @param {number} [nowMs]
 * @param {Record<string, string>} [entityLabels] — entityId → title/headline
 */
function buildPublishSchedulingDiagnostics(items, nowMs = Date.now(), entityLabels = {}) {
  const list = Array.isArray(items) ? items : [];
  const alertAfterMinutes = getRepublishOverdueAlertMinutes();

  let overdueCount = 0;
  let staleProcessingCount = 0;
  let maxOverdueMinutes = 0;
  let alertWorthyCount = 0;
  const overdueSamples = [];
  const enrichedItems = [];

  for (const raw of list) {
    const item = raw || {};
    const overdue = isScheduleItemOverdue(item, nowMs);
    const overdueMinutes = overdue ? overdueMinutesForItem(item, nowMs) : 0;
    const staleProcessing = isStaleProcessingItem(item, nowMs);

    if (overdue) {
      overdueCount += 1;
      maxOverdueMinutes = Math.max(maxOverdueMinutes, overdueMinutes);
      if (overdueMinutes >= alertAfterMinutes) {
        alertWorthyCount += 1;
      }
      if (overdueSamples.length < 25) {
        const entityId = String(item.entityId || '').trim();
        overdueSamples.push({
          id: String(item.id || ''),
          entityType: String(item.entityType || ''),
          entityId,
          entityLabel: String(entityLabels[entityId] || ''),
          scheduleAt: String(item.scheduleAt || ''),
          status: String(item.status || ''),
          action: String(item.action || 'publish'),
          overdueMinutes,
        });
      }
    }
    if (staleProcessing) {
      staleProcessingCount += 1;
    }

    enrichedItems.push({
      ...item,
      scheduleHealth: {
        isOverdue: overdue,
        overdueMinutes: overdue ? overdueMinutes : null,
        isStaleProcessing: staleProcessing,
        needsAttention: overdue || staleProcessing,
      },
    });
  }

  return {
    enrichedItems,
    diagnostics: {
      serverNow: new Date(nowMs).toISOString(),
      overdueCount,
      staleProcessingCount,
      maxOverdueMinutes,
      alertWorthyCount,
      alertAfterMinutes,
      overdueSamples,
      healthy: overdueCount === 0 && staleProcessingCount === 0,
    },
  };
}

module.exports = {
  DEFAULT_OVERDUE_ALERT_MINUTES,
  getRepublishOverdueAlertMinutes,
  isScheduleItemOverdue,
  overdueMinutesForItem,
  isStaleProcessingItem,
  buildPublishSchedulingDiagnostics,
};
