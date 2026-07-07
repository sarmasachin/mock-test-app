'use strict';

/** Skip duplicate test-publish notifications within this window. */
const NOTIFICATION_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const TEST_PUBLISH_DEDUPE_PREFIX = 'test_publish:';

/**
 * Normalize cycle timestamps to UTC ISO so dedupe keys match across admin, scheduler, and PG Date objects.
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
function normalizeCycleStartedAtIso(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? value.toISOString() : '';
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

/**
 * Canonical compare form for dedupe keys (handles legacy locale Date strings in stored queue rows).
 * @param {string} key
 * @returns {string}
 */
function normalizeDedupeKeyForCompare(key) {
  const k = String(key || '').trim();
  if (!k.startsWith(TEST_PUBLISH_DEDUPE_PREFIX)) return k;
  const rest = k.slice(TEST_PUBLISH_DEDUPE_PREFIX.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx < 0) return k;
  const testId = rest.slice(0, colonIdx).trim();
  const cyclePart = rest.slice(colonIdx + 1);
  const cycle = normalizeCycleStartedAtIso(cyclePart);
  if (!testId || !cycle) return k;
  const cycleMs = Date.parse(cycle);
  const cycleBucket = Number.isFinite(cycleMs)
    ? new Date(Math.floor(cycleMs / 1000) * 1000).toISOString()
    : cycle;
  return `${TEST_PUBLISH_DEDUPE_PREFIX}${testId}:${cycleBucket}`;
}

function buildTestPublishDedupeKey(testId, cycleStartedAt) {
  const id = String(testId || '').trim();
  const cycle = normalizeCycleStartedAtIso(cycleStartedAt);
  if (!id || !cycle) return '';
  return `${TEST_PUBLISH_DEDUPE_PREFIX}${id}:${cycle}`;
}

function isActiveDedupeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  // Include failed so a failed send cannot be immediately re-enqueued for the same cycle.
  return normalized === 'scheduled' || normalized === 'sent' || normalized === 'failed';
}

function findRecentDedupeMatch(items, dedupeKey, nowMs = Date.now(), windowMs = NOTIFICATION_DEDUPE_WINDOW_MS) {
  const key = normalizeDedupeKeyForCompare(dedupeKey);
  if (!key) return null;
  for (const raw of Array.isArray(items) ? items : []) {
    const item = raw || {};
    if (normalizeDedupeKeyForCompare(item.dedupeKey) !== key) continue;
    if (!isActiveDedupeStatus(item.status)) continue;
    const refMs = Date.parse(String(item.sentAt || item.scheduleAt || item.createdAt || ''));
    if (Number.isFinite(refMs) && nowMs - refMs > windowMs) continue;
    return item;
  }
  return null;
}

function createNotificationScheduleItem(payload = {}) {
  const nowIso = new Date().toISOString();
  const dedupeKey = String(payload.dedupeKey || '').trim();
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
    dedupeKey: dedupeKey ? normalizeDedupeKeyForCompare(dedupeKey).slice(0, 200) : '',
  };
}

/**
 * Build a queued push payload for test publish / cycle republish (shared by admin + scheduler).
 * @returns {object|null} null when testId or cycle cannot form a dedupe key
 */
function buildTestPublishNotificationPayload({
  testId,
  testTitle,
  cycleStartedAt,
  title = 'New Test Published',
  message,
}) {
  const dedupeKey = buildTestPublishDedupeKey(testId, cycleStartedAt);
  if (!dedupeKey) return null;
  const name = String(testTitle || 'New test').trim() || 'New test';
  return {
    title: String(title || 'New Test Published').trim().slice(0, 100),
    message: String(message || `${name} is now available.`).trim().slice(0, 300),
    target: 'all',
    deepLink: 'main/tests',
    scheduleAt: new Date().toISOString(),
    dedupeKey,
  };
}

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
  const rawDedupeKey = String(payload.dedupeKey || '').trim();
  const dedupeKey = rawDedupeKey ? normalizeDedupeKeyForCompare(rawDedupeKey) : '';
  const normalizedPayload = dedupeKey ? { ...payload, dedupeKey } : payload;
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
  const newItem = createNotificationScheduleItem(normalizedPayload);
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
  TEST_PUBLISH_DEDUPE_PREFIX,
  normalizeCycleStartedAtIso,
  normalizeDedupeKeyForCompare,
  buildTestPublishDedupeKey,
  buildTestPublishNotificationPayload,
  isActiveDedupeStatus,
  findRecentDedupeMatch,
  createNotificationScheduleItem,
  resolveNotificationDeliveryOutcome,
  prependNotificationIfNotDuplicate,
};
