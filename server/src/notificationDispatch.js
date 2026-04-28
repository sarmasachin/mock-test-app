'use strict';

const { pool } = require('./db');

const MAX_ITEMS = 500;

async function ensureUserDeviceTokensTable() {
  // Backwards-compatible schema upgrades for per-device tracking.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_device_tokens (
       token TEXT PRIMARY KEY,
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       device_id TEXT,
       platform VARCHAR(20) NOT NULL DEFAULT 'android',
       app_version VARCHAR(40) NOT NULL DEFAULT '',
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  await pool.query(`ALTER TABLE user_device_tokens ADD COLUMN IF NOT EXISTS device_id TEXT`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS user_device_tokens_user_device_uidx
     ON user_device_tokens (user_id, device_id)`,
  );
}

async function getJsonSetting(settingKey, fallback) {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
    [settingKey],
  );
  if (!rows[0]) return fallback;
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || ''));
    return parsed ?? fallback;
  } catch (_e) {
    return fallback;
  }
}

async function setJsonSetting(settingKey, value, userId = null) {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, $3::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [settingKey, JSON.stringify(value), userId],
  );
}

async function appendPushNotificationFeed(payload, userId = null) {
  const current = await getJsonSetting('pushNotificationSettings', { items: [] });
  const items = Array.isArray(current.items) ? current.items : [];
  const nextItem = {
    id: `push-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    title: String(payload.title || '').slice(0, 100),
    message: String(payload.message || '').slice(0, 300),
    target: String(payload.target || 'all'),
    deepLink: String(payload.deepLink || '').slice(0, 300),
    scheduledAt: String(payload.scheduleAt || ''),
    enabled: true,
    status: 'sent',
    resendCount: 0,
    lastSentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  await setJsonSetting(
    'pushNotificationSettings',
    { ...current, items: [nextItem, ...items].slice(0, MAX_ITEMS) },
    userId,
  );
}

async function sendFcmBroadcast(payload) {
  const serverKey = String(process.env.FCM_SERVER_KEY || '').trim();
  if (!serverKey) return { ok: false, reason: 'FCM_SERVER_KEY missing' };
  let rows = [];
  try {
    await ensureUserDeviceTokensTable();
    const res = await pool.query(
      `SELECT token FROM user_device_tokens WHERE platform = 'android' ORDER BY updated_at DESC LIMIT 5000`,
    );
    rows = res.rows || [];
  } catch (e) {
    if (e && e.code === '42P01') return { ok: false, reason: 'user_device_tokens missing' };
    throw e;
  }
  const tokens = rows.map((x) => String(x.token || '').trim()).filter(Boolean);
  if (!tokens.length) return { ok: false, reason: 'no tokens' };

  const body = {
    registration_ids: tokens,
    priority: 'high',
    notification: {
      title: String(payload.title || 'MockTestApp'),
      body: String(payload.message || 'New update'),
      sound: 'default',
      // Ensure Android uses our high-importance channel for heads-up/popup.
      android_channel_id: 'exams_jobs_alerts_v2',
    },
    data: {
      title: String(payload.title || 'MockTestApp'),
      body: String(payload.message || 'New update'),
      target: String(payload.target || 'all'),
      deepLink: String(payload.deepLink || '').trim(),
    },
  };
  const resp = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, reason: `fcm_http_${resp.status}`, detail: txt.slice(0, 500) };
  }
  // Cleanup invalid/stale tokens based on FCM response.
  const json = await resp.json().catch(() => null);
  if (json && Array.isArray(json.results)) {
    const invalid = [];
    for (let i = 0; i < json.results.length; i += 1) {
      const r = json.results[i] || {};
      const err = String(r.error || '');
      if (err === 'NotRegistered' || err === 'InvalidRegistration') {
        const t = tokens[i];
        if (t) invalid.push(t);
      }
    }
    if (invalid.length) {
      try {
        await pool.query(`DELETE FROM user_device_tokens WHERE token = ANY($1::text[])`, [invalid]);
      } catch (e) {
        // Non-fatal: cleanup best-effort.
        console.warn('token_cleanup_failed', e?.message || e);
      }
    }
  }
  // Optional: remove tokens that haven't been updated in 30 days.
  try {
    await pool.query(`DELETE FROM user_device_tokens WHERE updated_at < now() - interval '30 days'`);
  } catch (_e) {
    // Ignore if table doesn't exist yet or DB doesn't support interval (very unlikely on Postgres).
  }
  return { ok: true };
}

async function publishAppNotification(payload, userId = null) {
  await appendPushNotificationFeed(payload, userId);
  return sendFcmBroadcast(payload);
}

module.exports = {
  publishAppNotification,
};

