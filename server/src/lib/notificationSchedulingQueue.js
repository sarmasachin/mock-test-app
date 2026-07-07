'use strict';

const { pool } = require('../db');
const { prependNotificationIfNotDuplicate } = require('./notificationScheduling');
const { trimNotificationSchedulingPayload } = require('./schedulingQueueLimits');

/** Advisory lock — serializes notificationScheduling JSON read/write (separate from publishScheduling lock). */
const NOTIFICATION_SCHEDULING_ADVISORY_LOCK_KEY = 84729104;

async function loadNotificationSchedulingItems(db = pool) {
  const res = await db.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'notificationScheduling' LIMIT 1`,
  );
  if (!res.rows[0]) return { items: [] };
  try {
    const parsed = JSON.parse(String(res.rows[0].setting_value || '{}')) || { items: [] };
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch (_e) {
    return { items: [] };
  }
}

async function saveNotificationSchedulingItems(payload, userId = null, db = pool) {
  const trimmed = trimNotificationSchedulingPayload(payload);
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ('notificationScheduling', $1, $2::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value,
                   updated_by = COALESCE(EXCLUDED.updated_by, app_settings.updated_by),
                   updated_at = now()`,
    [JSON.stringify(trimmed), userId],
  );
  return trimmed;
}

/**
 * Run callback while holding an exclusive transaction lock on notificationScheduling mutations.
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withNotificationSchedulingLock(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [NOTIFICATION_SCHEDULING_ADVISORY_LOCK_KEY]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Locked read-modify-write enqueue — safe across concurrent admin saves and scheduler ticks.
 */
async function enqueueNotificationSchedulingItem(payload, userId = null) {
  return withNotificationSchedulingLock(async (client) => {
    const current = await loadNotificationSchedulingItems(client);
    const result = prependNotificationIfNotDuplicate(current, payload);
    if (result.enqueued) {
      await saveNotificationSchedulingItems(result.current, userId, client);
    }
    return result;
  });
}

/**
 * Locked read-modify-write for the notification scheduler tick.
 * @param {(current: { items: object[] }) => Promise<{ changed: boolean, items: object[] }>} mutator
 */
async function mutateNotificationScheduling(mutator) {
  return withNotificationSchedulingLock(async (client) => {
    const current = await loadNotificationSchedulingItems(client);
    const outcome = await mutator(current);
    if (outcome && outcome.changed) {
      await saveNotificationSchedulingItems({ items: outcome.items }, null, client);
    }
    return outcome;
  });
}

module.exports = {
  NOTIFICATION_SCHEDULING_ADVISORY_LOCK_KEY,
  loadNotificationSchedulingItems,
  saveNotificationSchedulingItems,
  withNotificationSchedulingLock,
  enqueueNotificationSchedulingItem,
  mutateNotificationScheduling,
};
