'use strict';

const PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY = 50;
const NOTIFICATION_SCHEDULE_MAX_ITEMS = 100;
const NOTIFICATION_FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function publishScheduleEntityKey(item) {
  const entityType = String((item || {}).entityType || '').trim().toLowerCase();
  const entityId = String((item || {}).entityId || '').trim();
  return `${entityType}:${entityId}`;
}

function publishScheduleItemMs(item) {
  const processedMs = Date.parse(String((item || {}).processedAt || ''));
  if (Number.isFinite(processedMs)) return processedMs;
  const scheduleMs = Date.parse(String((item || {}).scheduleAt || ''));
  if (Number.isFinite(scheduleMs)) return scheduleMs;
  const createdMs = Date.parse(String((item || {}).createdAt || ''));
  return Number.isFinite(createdMs) ? createdMs : 0;
}

function notificationScheduleItemMs(item) {
  const sentMs = Date.parse(String((item || {}).sentAt || ''));
  if (Number.isFinite(sentMs)) return sentMs;
  const scheduleMs = Date.parse(String((item || {}).scheduleAt || ''));
  if (Number.isFinite(scheduleMs)) return scheduleMs;
  const createdMs = Date.parse(String((item || {}).createdAt || ''));
  return Number.isFinite(createdMs) ? createdMs : 0;
}

function isPublishSchedulePendingStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'scheduled' || normalized === 'processing';
}

/**
 * Keep all pending rows; drop oldest published history beyond per-entity cap.
 */
function trimPublishSchedulingItems(items, maxPublishedPerEntity = PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];

  const publishedByEntity = new Map();
  for (const item of list) {
    if (String(item?.status || '').trim().toLowerCase() !== 'published') continue;
    const key = publishScheduleEntityKey(item);
    if (!publishedByEntity.has(key)) publishedByEntity.set(key, []);
    publishedByEntity.get(key).push(item);
  }

  const dropIds = new Set();
  for (const group of publishedByEntity.values()) {
    const sorted = [...group].sort((a, b) => publishScheduleItemMs(b) - publishScheduleItemMs(a));
    for (const dropped of sorted.slice(maxPublishedPerEntity)) {
      if (dropped?.id != null) dropIds.add(String(dropped.id));
    }
  }

  if (!dropIds.size) return list;
  return list.filter((item) => !dropIds.has(String(item?.id || '')));
}

function notificationRemovalPriority(item) {
  const status = String(item?.status || '').trim().toLowerCase();
  if (status === 'scheduled') return 0;
  if (status === 'processing') return 1;
  if (status === 'sent') return 2;
  if (status === 'failed') return 4;
  if (status === 'cancelled') return 5;
  return 3;
}

/**
 * Cap total notification queue rows; scheduled/processing are never dropped first.
 */
function trimNotificationSchedulingItems(items, maxTotal = NOTIFICATION_SCHEDULE_MAX_ITEMS, nowMs = Date.now()) {
  let list = Array.isArray(items) ? [...items] : [];
  if (!list.length) return [];

  list = list.filter((item) => {
    const status = String(item?.status || '').trim().toLowerCase();
    if (status !== 'failed') return true;
    const refMs = notificationScheduleItemMs(item);
    if (!Number.isFinite(refMs)) return false;
    return nowMs - refMs <= NOTIFICATION_FAILED_RETENTION_MS;
  });

  if (list.length <= maxTotal) return list;

  const indexed = list.map((item, index) => ({
    item,
    index,
    priority: notificationRemovalPriority(item),
    ms: notificationScheduleItemMs(item),
  }));
  const dropCount = list.length - maxTotal;
  const sortedForRemoval = [...indexed].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.ms !== b.ms) return a.ms - b.ms;
    return b.index - a.index;
  });
  const dropIds = new Set(
    sortedForRemoval.slice(0, dropCount).map((entry) => String(entry.item?.id || '')),
  );
  return list.filter((item) => !dropIds.has(String(item?.id || '')));
}

function trimNotificationSchedulingPayload(payload, nowMs = Date.now()) {
  const base = payload && typeof payload === 'object' ? payload : { items: [] };
  const items = Array.isArray(base.items) ? base.items : [];
  return {
    ...base,
    items: trimNotificationSchedulingItems(items, NOTIFICATION_SCHEDULE_MAX_ITEMS, nowMs),
  };
}

/**
 * Repair overdue pending publish rows using live DB test state.
 */
function reconcilePublishSchedulingItems(items, testRowsById, nowMs = Date.now()) {
  const list = Array.isArray(items) ? items.map((item) => ({ ...(item || {}) })) : [];
  const changes = [];

  for (const item of list) {
    if (!isPublishSchedulePendingStatus(item.status)) continue;
    const scheduleMs = Date.parse(String(item.scheduleAt || ''));
    if (!Number.isFinite(scheduleMs) || scheduleMs > nowMs) continue;
    if (String(item.entityType || '').trim().toLowerCase() !== 'test') continue;

    const testId = String(item.entityId || '').trim();
    const test = testRowsById.get(testId);
    const cycleMs = Date.parse(String(test?.last_cycle_started_at || ''));
    if (test?.is_published === true && Number.isFinite(cycleMs) && cycleMs >= scheduleMs) {
      item.status = 'published';
      item.processedAt = String(item.processedAt || test.last_cycle_started_at || new Date(nowMs).toISOString());
      item.processingStartedAt = '';
      item.lastError = '';
      changes.push({ id: item.id, action: 'mark_published_from_db' });
    }
  }

  const overduePendingByEntity = new Map();
  for (const item of list) {
    if (!isPublishSchedulePendingStatus(item.status)) continue;
    const scheduleMs = Date.parse(String(item.scheduleAt || ''));
    if (!Number.isFinite(scheduleMs) || scheduleMs > nowMs) continue;
    const key = publishScheduleEntityKey(item);
    if (!overduePendingByEntity.has(key)) overduePendingByEntity.set(key, []);
    overduePendingByEntity.get(key).push(item);
  }

  for (const group of overduePendingByEntity.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort(
      (a, b) => Date.parse(String(b.scheduleAt || '')) - Date.parse(String(a.scheduleAt || '')),
    );
    for (const dup of sorted.slice(1)) {
      dup.status = 'cancelled';
      dup.processingStartedAt = '';
      dup.lastError = 'duplicate_overdue_schedule';
      changes.push({ id: dup.id, action: 'cancel_duplicate_overdue' });
    }
  }

  const trimmed = trimPublishSchedulingItems(list);
  if (trimmed.length !== list.length) {
    changes.push({
      action: 'trim_published_history',
      removed: list.length - trimmed.length,
    });
  }

  return { items: trimmed, changes };
}

module.exports = {
  PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY,
  NOTIFICATION_SCHEDULE_MAX_ITEMS,
  NOTIFICATION_FAILED_RETENTION_MS,
  publishScheduleEntityKey,
  publishScheduleItemMs,
  trimPublishSchedulingItems,
  trimNotificationSchedulingItems,
  trimNotificationSchedulingPayload,
  reconcilePublishSchedulingItems,
  isPublishSchedulePendingStatus,
};
