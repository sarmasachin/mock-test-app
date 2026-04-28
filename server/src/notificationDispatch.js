'use strict';

const { pool } = require('./db');
const { GoogleAuth } = require('google-auth-library');

const MAX_ITEMS = 500;

function normalizeDeviceToken(raw) {
  let value = String(raw || '').trim();
  for (let i = 0; i < 3; i += 1) {
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return value;
}

function isLikelyValidFcmToken(token) {
  return (
    token.length >= 20 &&
    token.length <= 4096 &&
    !/\s/.test(token) &&
    /^[A-Za-z0-9:_\-.]+$/.test(token)
  );
}

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
  // Prefer FCM HTTP v1 (service account) because legacy HTTP endpoint may be disabled.
  const v1ProjectId = String(process.env.FCM_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  const serviceJsonRaw = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim();
  const legacyServerKey = String(process.env.FCM_SERVER_KEY || '').trim();

  if (!v1ProjectId && !legacyServerKey) {
    return { ok: false, reason: 'FCM config missing', detail: 'Set FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_JSON (preferred) or FCM_SERVER_KEY (legacy)' };
  }
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
  const malformed = [];
  const tokens = rows
    .map((x) => ({
      raw: String(x.token || ''),
      normalized: normalizeDeviceToken(x.token),
    }))
    .filter(({ normalized, raw }) => {
      const ok = isLikelyValidFcmToken(normalized);
      if (!ok && raw) malformed.push(raw);
      return ok;
    })
    .map(({ normalized }) => normalized);
  if (malformed.length) {
    try {
      await pool.query(`DELETE FROM user_device_tokens WHERE token = ANY($1::text[])`, [malformed]);
      console.info('push_malformed_token_cleanup', { deleted: malformed.length });
    } catch (e) {
      console.warn('malformed_token_cleanup_failed', e?.message || e);
    }
  }
  if (!tokens.length) return { ok: false, reason: 'no tokens' };

  // --- FCM HTTP v1 path ---
  if (v1ProjectId && serviceJsonRaw) {
    const creds = (() => {
      try {
        return JSON.parse(serviceJsonRaw);
      } catch (_e) {
        return null;
      }
    })();
    if (!creds || !creds.client_email || !creds.private_key) {
      return { ok: false, reason: 'FCM_SERVICE_ACCOUNT_JSON invalid' };
    }
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    if (!accessToken || !accessToken.token) {
      return { ok: false, reason: 'fcm_v1_token_missing' };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(v1ProjectId)}/messages:send`;
    const invalid = [];
    let sent = 0;
    let firstFailure = null;

    // Limit concurrency to avoid rate limits.
    const CONCURRENCY = 20;
    let i = 0;
    async function sendOne(token) {
      const body = {
        message: {
          token,
          notification: {
            title: String(payload.title || 'MockTestApp'),
            body: String(payload.message || 'New update'),
          },
          data: {
            title: String(payload.title || 'MockTestApp'),
            body: String(payload.message || 'New update'),
            target: String(payload.target || 'all'),
            deepLink: String(payload.deepLink || '').trim(),
          },
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'exams_jobs_alerts_v2',
              sound: 'default',
            },
          },
        },
      };
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        sent += 1;
        return;
      }
      const txt = await resp.text().catch(() => '');
      // v1 commonly returns 404 NOT_FOUND for unregistered tokens.
      const isUnregistered =
        resp.status === 404 ||
        txt.includes('UNREGISTERED') ||
        txt.includes('registration-token-not-registered') ||
        txt.includes('Requested entity was not found');
      const isInvalidTokenFormat =
        resp.status === 400 &&
        (txt.includes('not a valid FCM registration token') ||
          (txt.includes('INVALID_ARGUMENT') && txt.toLowerCase().includes('registration token')));
      if (isUnregistered || isInvalidTokenFormat) invalid.push(token);
      if (!isUnregistered && !firstFailure) {
        firstFailure = {
          status: resp.status,
          body: String(txt || '').slice(0, 500),
        };
      }
    }

    async function worker() {
      while (true) {
        const idx = i;
        i += 1;
        if (idx >= tokens.length) return;
        const token = tokens[idx];
        if (!token) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendOne(token);
        } catch (_e) {
          // Ignore single-token failure; we'll keep token for now.
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, () => worker()));

    if (invalid.length) {
      try {
        await pool.query(`DELETE FROM user_device_tokens WHERE token = ANY($1::text[])`, [invalid]);
      } catch (e) {
        console.warn('token_cleanup_failed', e?.message || e);
      }
    }
    // Optional: remove tokens that haven't been updated in 30 days.
    try {
      await pool.query(`DELETE FROM user_device_tokens WHERE updated_at < now() - interval '30 days'`);
    } catch (_e) {}

    if (sent <= 0) {
      console.warn('push_dispatch_summary', {
        ok: false,
        totalTokens: tokens.length,
        sent,
        invalidDeleted: invalid.length,
        malformedDeleted: malformed.length,
        firstFailureStatus: firstFailure?.status || null,
      });
      return {
        ok: false,
        reason: 'fcm_v1_send_failed',
        detail: firstFailure ? JSON.stringify(firstFailure) : 'No successful sends; check FCM credentials/project id and token validity',
        sent,
        invalidDeleted: invalid.length,
      };
    }
    console.info('push_dispatch_summary', {
      ok: true,
      totalTokens: tokens.length,
      sent,
      invalidDeleted: invalid.length,
      malformedDeleted: malformed.length,
    });
    return { ok: true, sent, invalidDeleted: invalid.length };
  }

  // --- Legacy HTTP path (may be disabled) ---
  if (!legacyServerKey) return { ok: false, reason: 'FCM_SERVER_KEY missing' };
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
      Authorization: `key=${legacyServerKey}`,
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

