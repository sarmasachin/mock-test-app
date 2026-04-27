'use strict';

const { pool } = require('./db');

const MAX_ITEMS = 500;

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
    },
    data: {
      title: String(payload.title || 'MockTestApp'),
      body: String(payload.message || 'New update'),
      target: String(payload.target || 'all'),
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
  return { ok: true };
}

async function publishAppNotification(payload, userId = null) {
  await appendPushNotificationFeed(payload, userId);
  return sendFcmBroadcast(payload);
}

module.exports = {
  publishAppNotification,
};

