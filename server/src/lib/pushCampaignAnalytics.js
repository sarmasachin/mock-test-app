'use strict';

const crypto = require('crypto');
const { pool } = require('../db');

let tablesReady = false;

function hashDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex').slice(0, 64);
}

async function ensurePushAnalyticsTables() {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      push_item_id VARCHAR(60) NOT NULL DEFAULT '',
      title VARCHAR(120) NOT NULL,
      message VARCHAR(500) NOT NULL,
      target VARCHAR(32) NOT NULL DEFAULT 'all',
      deep_link VARCHAR(300) NOT NULL DEFAULT '',
      sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
      total_attempted INT NOT NULL DEFAULT 0,
      delivered_count INT NOT NULL DEFAULT 0,
      failed_count INT NOT NULL DEFAULT 0,
      deactivated_count INT NOT NULL DEFAULT 0,
      opened_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_delivery_events (
      id BIGSERIAL PRIMARY KEY,
      campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      device_token_hash VARCHAR(64) NOT NULL,
      platform VARCHAR(20) NOT NULL DEFAULT 'android',
      device_model VARCHAR(120) NOT NULL DEFAULT '',
      delivery_status VARCHAR(20) NOT NULL,
      fail_code VARCHAR(40) NOT NULL DEFAULT '',
      fail_detail VARCHAR(500) NOT NULL DEFAULT '',
      delivered_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (campaign_id, device_token_hash)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_campaigns_created_at ON push_campaigns (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_delivery_events_campaign ON push_delivery_events (campaign_id)`);
  tablesReady = true;
}

async function createCampaign({ pushItemId, title, message, target, deepLink, sentByUserId }) {
  await ensurePushAnalyticsTables();
  const { rows } = await pool.query(
    `INSERT INTO push_campaigns (
       push_item_id, title, message, target, deep_link, sent_by
     ) VALUES ($1, $2, $3, $4, $5, $6::uuid)
     RETURNING id`,
    [
      String(pushItemId || '').slice(0, 60),
      String(title || '').slice(0, 120),
      String(message || '').slice(0, 500),
      String(target || 'all').slice(0, 32),
      String(deepLink || '').slice(0, 300),
      sentByUserId || null,
    ],
  );
  return rows[0]?.id || null;
}

async function finalizeCampaignCounts(campaignId, { total, delivered, failed, deactivated }) {
  await pool.query(
    `UPDATE push_campaigns
     SET total_attempted = $2,
         delivered_count = $3,
         failed_count = $4,
         deactivated_count = $5
     WHERE id = $1::uuid`,
    [campaignId, total, delivered, failed, deactivated],
  );
}

async function insertDeliveryEventsBatch(campaignId, events) {
  if (!events.length) return;
  const chunkSize = 150;
  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const ev of chunk) {
      values.push(
        `($${p++}::uuid, $${p++}::uuid, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
      );
      params.push(
        campaignId,
        ev.userId || null,
        ev.deviceTokenHash,
        String(ev.platform || 'android').slice(0, 20),
        String(ev.deviceModel || '').slice(0, 120),
        ev.deliveryStatus,
        String(ev.failCode || '').slice(0, 40),
        String(ev.failDetail || '').slice(0, 500),
        ev.deliveredAt || null,
      );
    }
    const sql = `INSERT INTO push_delivery_events (
      campaign_id, user_id, device_token_hash, platform, device_model,
      delivery_status, fail_code, fail_detail, delivered_at
    ) VALUES ${values.join(', ')}
    ON CONFLICT (campaign_id, device_token_hash) DO NOTHING`;
    await pool.query(sql, params);
  }
}

async function recordNotificationOpen(campaignId, userId) {
  await ensurePushAnalyticsTables();
  const { rowCount } = await pool.query(
    `UPDATE push_delivery_events
     SET opened_at = COALESCE(opened_at, now())
     WHERE campaign_id = $1::uuid
       AND user_id = $2::uuid
       AND delivery_status = 'delivered'
       AND opened_at IS NULL`,
    [campaignId, userId],
  );
  if (rowCount > 0) {
    await pool.query(
      `UPDATE push_campaigns
       SET opened_count = (
         SELECT COUNT(*)::int FROM push_delivery_events
         WHERE campaign_id = $1::uuid AND opened_at IS NOT NULL
       )
       WHERE id = $1::uuid`,
      [campaignId],
    );
    return { ok: true, updated: rowCount };
  }
  return { ok: true, updated: 0 };
}

async function getLatestCampaignForPushItem(pushItemId) {
  await ensurePushAnalyticsTables();
  const { rows } = await pool.query(
    `SELECT id, push_item_id, title, message, target, deep_link,
            total_attempted, delivered_count, failed_count, deactivated_count, opened_count, created_at
     FROM push_campaigns
     WHERE push_item_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [String(pushItemId || '').slice(0, 60)],
  );
  return rows[0] || null;
}

function buildCampaignSummary(row) {
  if (!row) return null;
  const sent = Number(row.total_attempted || 0);
  const delivered = Number(row.delivered_count || 0);
  const failed = Number(row.failed_count || 0);
  const opened = Number(row.opened_count || 0);
  const deactivated = Number(row.deactivated_count || 0);
  const notOpened = Math.max(0, delivered - opened);
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0;
  const ctr = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0;
  return {
    id: row.id,
    pushItemId: row.push_item_id,
    title: row.title,
    message: row.message,
    target: row.target,
    deepLink: row.deep_link,
    sentAt: row.created_at,
    sent,
    delivered,
    failed,
    opened,
    deactivated,
    notOpened,
    deliveryRate,
    ctr,
  };
}

async function getCampaignSummary(campaignId) {
  await ensurePushAnalyticsTables();
  const { rows } = await pool.query(
    `SELECT id, push_item_id, title, message, target, deep_link,
            total_attempted, delivered_count, failed_count, deactivated_count, opened_count, created_at
     FROM push_campaigns
     WHERE id = $1::uuid
     LIMIT 1`,
    [campaignId],
  );
  return buildCampaignSummary(rows[0]);
}

async function listCampaignEvents(campaignId, { status, q, limit, offset }) {
  await ensurePushAnalyticsTables();
  const filters = ['e.campaign_id = $1::uuid'];
  const params = [campaignId];
  let p = 2;
  const statusNorm = String(status || '').trim().toLowerCase();
  if (statusNorm === 'delivered') {
    filters.push(`e.delivery_status = 'delivered'`);
  } else if (statusNorm === 'failed') {
    filters.push(`e.delivery_status = 'failed'`);
  } else if (statusNorm === 'opened') {
    filters.push(`e.opened_at IS NOT NULL`);
  } else if (statusNorm === 'not_opened') {
    filters.push(`e.delivery_status = 'delivered' AND e.opened_at IS NULL`);
  }
  const queryText = String(q || '').trim();
  if (queryText) {
    filters.push(
      `(COALESCE(u.display_name, '') ILIKE $${p} OR COALESCE(u.email, '') ILIKE $${p} OR COALESCE(u.phone, '') ILIKE $${p})`,
    );
    params.push(`%${queryText}%`);
    p += 1;
  }
  const whereSql = filters.join(' AND ');
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM push_delivery_events e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRes.rows[0]?.c || 0);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);
  const { rows } = await pool.query(
    `SELECT e.id, e.user_id, e.platform, e.device_model, e.delivery_status, e.fail_code,
            e.delivered_at, e.opened_at,
            u.display_name, u.email, u.phone
     FROM push_delivery_events e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE ${whereSql}
     ORDER BY e.id DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    params,
  );
  const items = (rows || []).map((r) => {
    let openDelayMinutes = null;
    if (r.opened_at && r.delivered_at) {
      const ms = new Date(r.opened_at).getTime() - new Date(r.delivered_at).getTime();
      if (ms >= 0) openDelayMinutes = Math.round(ms / 60000);
    }
    return {
      id: Number(r.id),
      userId: r.user_id,
      displayName: String(r.display_name || '').trim(),
      email: String(r.email || '').trim(),
      phone: String(r.phone || '').trim(),
      platform: r.platform,
      deviceModel: r.device_model,
      status: r.delivery_status,
      failCode: r.fail_code,
      deliveredAt: r.delivered_at,
      openedAt: r.opened_at,
      openDelayMinutes,
    };
  });
  return { total, items, limit: lim, offset: off };
}

module.exports = {
  ensurePushAnalyticsTables,
  hashDeviceToken,
  createCampaign,
  finalizeCampaignCounts,
  insertDeliveryEventsBatch,
  recordNotificationOpen,
  getCampaignSummary,
  getLatestCampaignForPushItem,
  listCampaignEvents,
};
