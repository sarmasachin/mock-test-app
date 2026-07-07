'use strict';

const { pool } = require('../db');
const { sendPushToToken } = require('../notificationDispatch');
const { normalizeDedupeKeyForCompare } = require('./notificationScheduling');

const MAX_DEDUPE_KEY_LEN = 200;
const MAX_AUDIENCE_ROWS = 10000;

function normalizeDeliveryDedupeKey(raw) {
  const key = normalizeDedupeKeyForCompare(String(raw || '').trim());
  if (!key) return '';
  return key.slice(0, MAX_DEDUPE_KEY_LEN);
}

function buildNotificationScheduleDedupeKey(item) {
  const itemId = String((item || {}).id || '').trim();
  const explicit = normalizeDeliveryDedupeKey((item || {}).dedupeKey);
  if (explicit) return explicit;
  if (!itemId) return '';
  return normalizeDeliveryDedupeKey(`notif_schedule:${itemId}`);
}

function buildCampaignDedupeKey(campaignId) {
  const id = String(campaignId || '').trim();
  if (!id) return '';
  return normalizeDeliveryDedupeKey(`campaign:${id}`);
}

function buildPushTargetWhereClause(target) {
  const normalized = String(target || 'all').trim().toLowerCase();
  if (normalized === 'new_users') {
    return `u.created_at >= now() - interval '7 days'`;
  }
  if (normalized === 'active_users') {
    return `EXISTS (
      SELECT 1 FROM test_attempts ta
      WHERE ta.user_id = u.id AND ta.completed_at >= now() - interval '30 days'
    )`;
  }
  return 'TRUE';
}

/**
 * @param {object[]} recipients
 * @param {Set<string>} deliveredUserIds
 * @returns {{ recipients: object[], skipped: number }}
 */
function filterRecipientsAlreadyDelivered(recipients, deliveredUserIds) {
  const delivered = deliveredUserIds instanceof Set ? deliveredUserIds : new Set();
  if (!delivered.size) {
    return { recipients: Array.isArray(recipients) ? recipients : [], skipped: 0 };
  }
  let skipped = 0;
  const next = [];
  for (const row of Array.isArray(recipients) ? recipients : []) {
    const userId = String(row?.user_id || row?.userId || '').trim();
    if (userId && delivered.has(userId)) {
      skipped += 1;
      continue;
    }
    next.push(row);
  }
  return { recipients: next, skipped };
}

async function ensureUserDeviceTokensTable(db = pool) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS user_device_tokens (
       id BIGSERIAL PRIMARY KEY,
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       device_token TEXT NOT NULL,
       platform VARCHAR(20) NOT NULL DEFAULT 'android',
       app_version VARCHAR(40) NOT NULL DEFAULT '',
       device_model VARCHAR(120) NOT NULL DEFAULT '',
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (device_token)
     )`,
  );
}

async function ensureUserPushDeliveriesTable(db = pool) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS user_push_deliveries (
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       dedupe_key VARCHAR(200) NOT NULL,
       sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (user_id, dedupe_key)
     )`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_user_push_deliveries_dedupe_key
     ON user_push_deliveries (dedupe_key)`,
  );
}

async function resolvePushAudienceStorage(db = pool) {
  const tableColsRes = await db.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('user_device_tokens', 'user_devices')`,
  );
  const tableCols = {};
  for (const row of tableColsRes.rows || []) {
    const table = String(row.table_name || '');
    const col = String(row.column_name || '');
    if (!table || !col) continue;
    if (!tableCols[table]) tableCols[table] = new Set();
    tableCols[table].add(col);
  }
  const hasUdt = tableCols.user_device_tokens && tableCols.user_device_tokens.size > 0;
  const hasUd = tableCols.user_devices && tableCols.user_devices.size > 0;
  if (!hasUdt && !hasUd) return null;

  const sourceTable = hasUdt ? 'user_device_tokens' : 'user_devices';
  const cols = tableCols[sourceTable];
  const tokenColumn = cols.has('device_token')
    ? 'device_token'
    : cols.has('token')
      ? 'token'
      : cols.has('fcm_token')
        ? 'fcm_token'
        : null;
  if (!tokenColumn) return null;

  const activeColumn = cols.has('is_active')
    ? 'is_active'
    : cols.has('active')
      ? 'active'
      : cols.has('enabled')
        ? 'enabled'
        : null;
  const orderColumn = cols.has('updated_at')
    ? 'updated_at'
    : cols.has('last_seen_at')
      ? 'last_seen_at'
      : cols.has('created_at')
        ? 'created_at'
        : null;

  return {
    sourceTable,
    cols,
    tokenColumn,
    activeColumn,
    orderColumn,
    hasPlatform: cols.has('platform'),
    hasDeviceModel: cols.has('device_model'),
  };
}

async function loadLatestTokenPerUser({ db = pool, target = 'all', limit = MAX_AUDIENCE_ROWS }) {
  const storage = await resolvePushAudienceStorage(db);
  if (!storage) return [];

  const {
    sourceTable,
    tokenColumn,
    activeColumn,
    orderColumn,
    hasPlatform,
    hasDeviceModel,
  } = storage;

  const whereClause = buildPushTargetWhereClause(target);
  const activeClause = activeColumn ? `src.${activeColumn} = true AND ` : '';
  const tokenOrder = orderColumn ? `src.${orderColumn} DESC NULLS LAST` : 'src.user_id';
  const extraCols = [
    hasPlatform ? 'src.platform AS platform' : null,
    hasDeviceModel ? 'src.device_model AS device_model' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const res = await db.query(
    `SELECT DISTINCT ON (src.user_id)
       src.user_id AS user_id,
       src.${tokenColumn} AS token
       ${extraCols ? `, ${extraCols}` : ''}
     FROM ${sourceTable} src
     INNER JOIN users u ON u.id = src.user_id
     WHERE ${activeClause}${whereClause}
     ORDER BY src.user_id, ${tokenOrder}`,
    [],
  );

  const capped = (res.rows || []).slice(0, Math.max(1, Math.min(MAX_AUDIENCE_ROWS, Number(limit) || MAX_AUDIENCE_ROWS)));
  return capped;
}

async function loadDeliveredUserIdsForDedupe({ db = pool, dedupeKey, userIds }) {
  const key = normalizeDeliveryDedupeKey(dedupeKey);
  const ids = (Array.isArray(userIds) ? userIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!key || !ids.length) return new Set();

  const res = await db.query(
    `SELECT user_id::text AS user_id
     FROM user_push_deliveries
     WHERE dedupe_key = $1
       AND user_id = ANY($2::uuid[])`,
    [key, ids],
  );
  return new Set((res.rows || []).map((row) => String(row.user_id || '').trim()).filter(Boolean));
}

async function recordUserPushDelivery({ db = pool, userId, dedupeKey }) {
  const key = normalizeDeliveryDedupeKey(dedupeKey);
  const uid = String(userId || '').trim();
  if (!key || !uid) return false;
  await db.query(
    `INSERT INTO user_push_deliveries (user_id, dedupe_key, sent_at)
     VALUES ($1::uuid, $2, now())
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [uid, key],
  );
  return true;
}

async function deactivateInvalidToken({ db, storage, token }) {
  const currentToken = String(token || '').trim();
  if (!currentToken || !storage) return false;

  const { sourceTable, tokenColumn, activeColumn, cols } = storage;
  if (activeColumn) {
    const updateTs = cols.has('updated_at') ? ', updated_at = now()' : '';
    await db.query(
      `UPDATE ${sourceTable}
       SET ${activeColumn} = false${updateTs}
       WHERE ${tokenColumn} = $1`,
      [currentToken],
    );
  } else {
    await db.query(`DELETE FROM ${sourceTable} WHERE ${tokenColumn} = $1`, [currentToken]);
  }
  return true;
}

/**
 * Send a push to the audience — one token per user (latest), optional per-user dedupe.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.target]
 * @param {string} [options.deepLink]
 * @param {string} [options.dedupeKey] — when set, each user receives at most one successful delivery for this key
 * @param {string} [options.campaignId] — forwarded to FCM payload
 * @param {boolean} [options.collectDeliveries]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 */
async function sendPushToAudience({
  title,
  message,
  target = 'all',
  deepLink = '',
  dedupeKey = '',
  campaignId = '',
  collectDeliveries = false,
  db = pool,
}) {
  await ensureUserDeviceTokensTable(db);
  const deliveryDedupeKey = normalizeDeliveryDedupeKey(dedupeKey);
  if (deliveryDedupeKey) {
    await ensureUserPushDeliveriesTable(db);
  }

  const storage = await resolvePushAudienceStorage(db);
  if (!storage) {
    return { total: 0, sent: 0, failed: 0, deactivated: 0, skipped: 0, deliveries: [] };
  }

  const allRecipients = await loadLatestTokenPerUser({ db, target });
  const eligibleTotal = allRecipients.length;

  let recipients = allRecipients;
  let skipped = 0;
  if (deliveryDedupeKey && allRecipients.length) {
    const userIds = allRecipients.map((row) => row.user_id);
    const delivered = await loadDeliveredUserIdsForDedupe({
      db,
      dedupeKey: deliveryDedupeKey,
      userIds,
    });
    const filtered = filterRecipientsAlreadyDelivered(allRecipients, delivered);
    recipients = filtered.recipients;
    skipped = filtered.skipped;
  }

  const campaignIdStr = String(campaignId || '').trim().slice(0, 64);
  let sent = 0;
  let failed = 0;
  let deactivated = 0;
  const deliveries = [];

  for (const row of recipients) {
    const currentToken = String(row.token || '').trim();
    const userId = row.user_id || null;
    const platform = String(row.platform || 'android').slice(0, 20);
    const deviceModel = String(row.device_model || '').slice(0, 120);

    if (!currentToken) {
      failed += 1;
      if (collectDeliveries) {
        deliveries.push({
          userId,
          token: '',
          platform,
          deviceModel,
          ok: false,
          code: 'EMPTY_TOKEN',
          detail: '',
        });
      }
      continue;
    }

    try {
      const result = await sendPushToToken(currentToken, {
        title,
        message,
        deepLink,
        campaignId: campaignIdStr,
        dedupeKey: deliveryDedupeKey,
      });

      if (result.ok) {
        sent += 1;
        if (deliveryDedupeKey && userId) {
          await recordUserPushDelivery({ db, userId, dedupeKey: deliveryDedupeKey });
        }
        if (collectDeliveries) {
          deliveries.push({
            userId,
            token: currentToken,
            platform,
            deviceModel,
            ok: true,
            code: '',
            detail: '',
          });
        }
      } else {
        failed += 1;
        if (result.code === 'UNREGISTERED') {
          const didDeactivate = await deactivateInvalidToken({ db, storage, token: currentToken });
          if (didDeactivate) deactivated += 1;
        }
        if (collectDeliveries) {
          deliveries.push({
            userId,
            token: currentToken,
            platform,
            deviceModel,
            ok: false,
            code: String(result.code || 'unknown'),
            detail: String(result.detail || ''),
          });
        }
      }
    } catch (e) {
      failed += 1;
      console.error('push_audience_token_send_failed', e && (e.message || e));
      if (collectDeliveries) {
        deliveries.push({
          userId,
          token: currentToken,
          platform,
          deviceModel,
          ok: false,
          code: 'EXCEPTION',
          detail: String(e && (e.message || e) || ''),
        });
      }
    }
  }

  return {
    total: recipients.length,
    eligible: eligibleTotal,
    sent,
    failed,
    deactivated,
    skipped,
    deliveries: collectDeliveries ? deliveries : undefined,
  };
}

module.exports = {
  MAX_DEDUPE_KEY_LEN,
  normalizeDeliveryDedupeKey,
  buildNotificationScheduleDedupeKey,
  buildCampaignDedupeKey,
  buildPushTargetWhereClause,
  filterRecipientsAlreadyDelivered,
  ensureUserDeviceTokensTable,
  ensureUserPushDeliveriesTable,
  resolvePushAudienceStorage,
  loadLatestTokenPerUser,
  loadDeliveredUserIdsForDedupe,
  recordUserPushDelivery,
  sendPushToAudience,
};
