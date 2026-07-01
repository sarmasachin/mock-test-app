'use strict';

const { pool } = require('../db');
const { getPublishSchedulingItems, savePublishSchedulingItems } = require('./testVisibility');
const {
  reconcilePublishSchedulingItems,
  trimNotificationSchedulingPayload,
} = require('./schedulingQueueLimits');

async function loadNotificationSchedulingJson() {
  const res = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'notificationScheduling' LIMIT 1`,
  );
  if (!res.rows[0]) return { items: [] };
  try {
    const parsed = JSON.parse(String(res.rows[0].setting_value || '{}')) || { items: [] };
    return parsed && typeof parsed === 'object' ? parsed : { items: [] };
  } catch {
    return { items: [] };
  }
}

async function saveNotificationSchedulingJson(value, userId = null) {
  const trimmed = trimNotificationSchedulingPayload(value);
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ('notificationScheduling', $1, $2::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify(trimmed), userId],
  );
  return trimmed;
}

async function loadTestRowsById(testIds) {
  const testRowsById = new Map();
  const ids = [...new Set((testIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return testRowsById;
  const testsRes = await pool.query(
    `SELECT id::text AS id, is_published, last_cycle_started_at
     FROM tests
     WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  for (const row of testsRes.rows || []) {
    testRowsById.set(String(row.id), row);
  }
  return testRowsById;
}

/**
 * Preview or apply publish + notification queue cleanup.
 * @param {{ apply?: boolean, userId?: string|null }} options
 */
async function runSchedulingQueueCleanup(options = {}) {
  const apply = options.apply === true;
  const userId = options.userId || null;
  const nowMs = Date.now();

  const publishBefore = await getPublishSchedulingItems();
  const testIds = publishBefore
    .map((item) => String(item?.entityId || '').trim())
    .filter(Boolean);
  const testRowsById = await loadTestRowsById(testIds);

  const publishReconciled = reconcilePublishSchedulingItems(publishBefore, testRowsById, nowMs);
  const notificationBefore = await loadNotificationSchedulingJson();
  const notificationAfter = trimNotificationSchedulingPayload(notificationBefore, nowMs);

  const summary = {
    mode: apply ? 'apply' : 'preview',
    publishScheduling: {
      before: publishBefore.length,
      after: publishReconciled.items.length,
      removed: Math.max(0, publishBefore.length - publishReconciled.items.length),
      changes: publishReconciled.changes,
    },
    notificationScheduling: {
      before: Array.isArray(notificationBefore.items) ? notificationBefore.items.length : 0,
      after: Array.isArray(notificationAfter.items) ? notificationAfter.items.length : 0,
      removed: Math.max(
        0,
        (Array.isArray(notificationBefore.items) ? notificationBefore.items.length : 0) -
          (Array.isArray(notificationAfter.items) ? notificationAfter.items.length : 0),
      ),
    },
  };

  if (!apply) {
    return { applied: false, summary };
  }

  await savePublishSchedulingItems(publishReconciled.items, userId);
  const savedNotification = await saveNotificationSchedulingJson(notificationAfter, userId);

  return {
    applied: true,
    summary: {
      ...summary,
      notificationScheduling: {
        ...summary.notificationScheduling,
        after: Array.isArray(savedNotification.items) ? savedNotification.items.length : 0,
      },
    },
  };
}

module.exports = {
  runSchedulingQueueCleanup,
};
