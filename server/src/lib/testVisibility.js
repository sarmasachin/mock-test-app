'use strict';

const { pool } = require('../db');

function parseScheduleMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function examTzOffsetLabel() {
  const tzOffsetMinutes = Number(process.env.EXAM_TIMEZONE_OFFSET_MINUTES || 330);
  const sign = tzOffsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMinutes);
  const tzH = String(Math.floor(abs / 60)).padStart(2, '0');
  const tzM = String(abs % 60).padStart(2, '0');
  return `${sign}${tzH}:${tzM}`;
}

function toDayOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

/** True when validUntil calendar day has ended in exam timezone. */
function isPastValidUntil(validUntil, nowMs = Date.now()) {
  const day = toDayOnly(validUntil);
  if (!day) return false;
  const endMs = Date.parse(`${day}T23:59:59.999${examTzOffsetLabel()}`);
  if (!Number.isFinite(endMs)) return false;
  return nowMs > endMs;
}

function isBeforeScheduledPublish(publishAt, nowMs = Date.now()) {
  const ms = parseScheduleMs(publishAt);
  return ms != null && nowMs < ms;
}

function isAfterScheduledUnpublish(unpublishAt, nowMs = Date.now()) {
  const ms = parseScheduleMs(unpublishAt);
  return ms != null && nowMs >= ms;
}

function isTestCatalogVisible(row, advancedConfig, nowMs = Date.now()) {
  if (!row || row.is_published !== true) return false;
  if (isPastValidUntil(row.valid_until, nowMs)) return false;
  const adv = advancedConfig && typeof advancedConfig === 'object' ? advancedConfig : {};
  if (isBeforeScheduledPublish(adv.publishAt, nowMs)) return false;
  if (isAfterScheduledUnpublish(adv.unpublishAt, nowMs)) return false;
  return true;
}

function catalogVisibilityError(row, advancedConfig, nowMs = Date.now()) {
  if (!row) return 'Test not found';
  if (row.is_published !== true) return 'Test is not published';
  if (isPastValidUntil(row.valid_until, nowMs)) return 'Test registration has closed';
  const adv = advancedConfig && typeof advancedConfig === 'object' ? advancedConfig : {};
  if (isBeforeScheduledPublish(adv.publishAt, nowMs)) return 'Test is not available yet';
  if (isAfterScheduledUnpublish(adv.unpublishAt, nowMs)) return 'Test is no longer available';
  return null;
}

/**
 * Catalog-only helper: whether publishAt/unpublishAt windows allow user-facing visibility.
 * Admin save must NOT use this for DB is_published — checkbox is the source of truth.
 */
function resolveEffectivePublishedState(isPublishedCheckbox, advancedConfig, nowMs = Date.now()) {
  const publishMs = parseScheduleMs(advancedConfig?.publishAt);
  const unpublishMs = parseScheduleMs(advancedConfig?.unpublishAt);
  if (unpublishMs != null && nowMs >= unpublishMs) return false;
  if (publishMs != null && nowMs < publishMs) return false;
  return isPublishedCheckbox !== false;
}

/** @deprecated alias */
function resolveStoredPublishedFlag(isPublishedCheckbox, advancedConfig, nowMs = Date.now()) {
  return resolveEffectivePublishedState(isPublishedCheckbox, advancedConfig, nowMs);
}

function scheduleItemId(testId, action) {
  return `test-${action}-${String(testId || '').trim()}`;
}

function isManagedAdvancedScheduleItem(item, testId) {
  const entityId = String(item?.entityId || '').trim();
  if (entityId !== String(testId || '').trim()) return false;
  if (String(item?.source || '') === 'advancedConfig') return true;
  const id = String(item?.id || '');
  return id === scheduleItemId(testId, 'publish') || id === scheduleItemId(testId, 'unpublish');
}

function buildAdvancedScheduleItems(testId, advancedConfig, options = {}) {
  const notifyOnPublish = options.notifyOnPublish !== false;
  const publishAt = String(advancedConfig?.publishAt || '').trim();
  const unpublishAt = String(advancedConfig?.unpublishAt || '').trim();
  const items = [];
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const publishMs = parseScheduleMs(publishAt);
  if (publishMs != null && publishMs > nowMs) {
    items.push({
      id: scheduleItemId(testId, 'publish'),
      entityType: 'test',
      entityId: String(testId),
      scheduleAt: publishAt,
      action: 'publish',
      notifyOnPublish,
      status: 'scheduled',
      source: 'advancedConfig',
      createdAt: nowIso,
      processedAt: '',
    });
  }
  const unpublishMs = parseScheduleMs(unpublishAt);
  if (unpublishMs != null && unpublishMs > nowMs) {
    items.push({
      id: scheduleItemId(testId, 'unpublish'),
      entityType: 'test',
      entityId: String(testId),
      scheduleAt: unpublishAt,
      action: 'unpublish',
      notifyOnPublish: false,
      status: 'scheduled',
      source: 'advancedConfig',
      createdAt: nowIso,
      processedAt: '',
    });
  }
  return items;
}

async function getPublishSchedulingItems() {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'publishScheduling' LIMIT 1`,
  );
  if (!rows[0]) return [];
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || '{}')) || { items: [] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (_e) {
    return [];
  }
}

async function savePublishSchedulingItems(items, userId = null) {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ('publishScheduling', $1, $2::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify({ items }), userId],
  );
}

async function syncTestPublishScheduleFromAdvancedConfig(testId, advancedConfig, userId = null) {
  const safeId = String(testId || '').trim();
  if (!safeId) return;
  const items = await getPublishSchedulingItems();
  const kept = items.filter((item) => !isManagedAdvancedScheduleItem(item, safeId));
  const nextItems = [...buildAdvancedScheduleItems(safeId, advancedConfig, {
    notifyOnPublish: advancedConfig?.notifyOnPublish !== false,
  }), ...kept];
  await savePublishSchedulingItems(nextItems, userId);
}

/**
 * @deprecated Do not mutate DB is_published here — it overwrote admin checkbox and hid tests permanently.
 * User-facing windows are enforced via isTestCatalogVisible + publishScheduling.
 */
async function enforceTestPublicationWindows() {
  return { updated: 0 };
}

module.exports = {
  parseScheduleMs,
  isPastValidUntil,
  isBeforeScheduledPublish,
  isAfterScheduledUnpublish,
  isTestCatalogVisible,
  catalogVisibilityError,
  resolveEffectivePublishedState,
  resolveStoredPublishedFlag,
  buildAdvancedScheduleItems,
  syncTestPublishScheduleFromAdvancedConfig,
  enforceTestPublicationWindows,
  getPublishSchedulingItems,
  savePublishSchedulingItems,
  scheduleItemId,
  isManagedAdvancedScheduleItem,
};
