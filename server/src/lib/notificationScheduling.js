'use strict';

/** Skip duplicate test-publish notifications within this window. */
const NOTIFICATION_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

function buildTestPublishDedupeKey(testId, cycleStartedAt) {
  const id = String(testId || '').trim();
  const cycle = String(cycleStartedAt || '').trim();
  if (!id || !cycle) return '';
  return `test_publish:${id}:${cycle}`;
}

function isActiveDedupeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'scheduled' || normalized === 'sent';
}

function findRecentDedupeMatch(items, dedupeKey, nowMs = Date.now(), windowMs = NOTIFICATION_DEDUPE_WINDOW_MS) {
  const key = String(dedupeKey || '').trim();
  if (!key) return null;
  for (const raw of Array.isArray(items) ? items : []) {
    const item = raw || {};
    if (String(item.dedupeKey || '').trim() !== key) continue;
    if (!isActiveDedupeStatus(item.status)) continue;
    const refMs = Date.parse(String(item.sentAt || item.scheduleAt || item.createdAt || ''));
    if (Number.isFinite(refMs) && nowMs - refMs > windowMs) continue;
    return item;
  }
  return null;
}

function createNotificationScheduleItem(payload = {}) {
  const nowIso = new Date().toISOString();
  return {
    id: `schedule-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    title: String(payload.title || '').slice(0, 100),
    message: String(payload.message || '').slice(0, 300),
    target: String(payload.target || 'all'),
    segmentKey: String(payload.segmentKey || ''),
    scheduleAt: String(payload.scheduleAt || nowIso),
    repeatType: 'none',
    dayOfWeek: 1,
    dayOfMonth: 1,
    repeatUntil: '',
    status: 'scheduled',
    createdAt: nowIso,
    sentAt: '',
    deepLink: String(payload.deepLink || '').trim().slice(0, 300),
    dedupeKey: String(payload.dedupeKey || '').trim().slice(0, 200),
  };
}

/**
 * @returns {{ current: object, enqueued: boolean, skipped: boolean, dedupeKey: string, newItem?: object, existingItem?: object }}
 */
/**
 * Decide whether a scheduler run succeeded and why it failed.
 * Partial delivery (some tokens failed) still counts as success when sent > 0.
 *
 * @param {{ sent?: number, failed?: number, total?: number }} result
 * @returns {{ succeeded: boolean, lastError: string }}
 */
function resolveNotificationDeliveryOutcome(result) {
  const sent = Number(result?.sent || 0);
  const failed = Number(result?.failed || 0);
  const totalRaw = result?.total;
  const total = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : sent + failed;
  if (sent > 0) {
    return {
      succeeded: true,
      lastError: failed > 0 ? 'partial_delivery' : '',
    };
  }
  if (total <= 0) {
    return { succeeded: false, lastError: 'no_device_tokens' };
  }
  return { succeeded: false, lastError: 'all_tokens_failed' };
}

function prependNotificationIfNotDuplicate(current, payload, nowMs = Date.now()) {
  const base = current && typeof current === 'object' ? current : { items: [] };
  const items = Array.isArray(base.items) ? base.items : [];
  const dedupeKey = String(payload.dedupeKey || '').trim();
  if (dedupeKey) {
    const existing = findRecentDedupeMatch(items, dedupeKey, nowMs);
    if (existing) {
      return {
        current: base,
        enqueued: false,
        skipped: true,
        dedupeKey,
        existingItem: existing,
      };
    }
  }
  const newItem = createNotificationScheduleItem(payload);
  return {
    current: { ...base, items: [newItem, ...items] },
    enqueued: true,
    skipped: false,
    dedupeKey,
    newItem,
  };
}

module.exports = {
  NOTIFICATION_DEDUPE_WINDOW_MS,
  buildTestPublishDedupeKey,
  isActiveDedupeStatus,
  findRecentDedupeMatch,
  createNotificationScheduleItem,
  resolveNotificationDeliveryOutcome,
  prependNotificationIfNotDuplicate,
};
