'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { sha256Hex } = require('../cryptoUtil');
const { mapUserRow } = require('../userMapper');
const { isMailConfigured, sendEmailVerificationOtp } = require('../mail');

const router = express.Router();
const EMAIL_VERIFY_OTP_MINUTES = () =>
  parseInt(process.env.EMAIL_VERIFY_OTP_MINUTES || '15', 10);

function normalizeDeviceToken(raw) {
  let value = String(raw || '').trim();
  // Some clients accidentally wrap token as a JSON string literal, e.g. "\"abc...\"".
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
  // FCM registration tokens are typically long and contain URL-safe-ish characters.
  return (
    token.length >= 20 &&
    token.length <= 4096 &&
    !/\s/.test(token) &&
    /^[A-Za-z0-9:_\-.]+$/.test(token)
  );
}

function pickSixDigit() {
  return 100000 + Math.floor(Math.random() * 900000);
}

async function ensureUserDeviceTokensTable() {
  // Backwards-compatible schema upgrades:
  // - old schema: token PRIMARY KEY, no device_id
  // - new schema: add device_id + unique(user_id, device_id) for per-device tracking
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
  // Ensure column exists on older deployments.
  await pool.query(`ALTER TABLE user_device_tokens ADD COLUMN IF NOT EXISTS device_id TEXT`);
  // Uniqueness per user-device. Postgres UNIQUE indexes allow multiple NULLs,
  // so legacy rows with NULL device_id remain valid and do not block new clients.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS user_device_tokens_user_device_uidx
     ON user_device_tokens (user_id, device_id)`,
  );
}

async function appendInboxItem(settingKey, item, userId) {
  const cur = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
    [settingKey],
  );
  let payload = { items: [] };
  if (cur.rows[0]) {
    try {
      payload = JSON.parse(String(cur.rows[0].setting_value || '{}')) || { items: [] };
    } catch (_e) {
      payload = { items: [] };
    }
  }
  const existing = Array.isArray(payload.items) ? payload.items : [];
  const next = { items: [item, ...existing].slice(0, 500) };
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, $3::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [settingKey, JSON.stringify(next), userId],
  );
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1::uuid LIMIT 1`, [req.userId]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: mapUserRow(row) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM users WHERE id = $1::uuid`, [req.userId]);
    if (r.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.patch('/profile', async (req, res) => {
  const { displayName, email, phone, state, district } = req.body || {};
  if (
    displayName === undefined &&
    email === undefined &&
    phone === undefined &&
    state === undefined &&
    district === undefined
  ) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }
  try {
    const curQ = await pool.query(`SELECT * FROM users WHERE id = $1::uuid`, [req.userId]);
    const cur = curQ.rows[0];
    if (!cur) return res.status(404).json({ error: 'User not found' });

    let nextName = cur.display_name;
    if (displayName !== undefined) {
      if (displayName === null) {
        return res.status(400).json({ error: 'displayName cannot be null' });
      }
      const n = String(displayName).trim();
      if (!n) return res.status(400).json({ error: 'displayName cannot be empty' });
      nextName = n;
    }

    let nextEmail = cur.email;
    if (email !== undefined) {
      if (email === null) {
        return res.status(400).json({ error: 'email cannot be null' });
      }
      const emTrim = String(email).trim().toLowerCase();
      if (!emTrim || !emTrim.includes('@')) {
        return res.status(400).json({ error: 'Invalid email' });
      }
      const curNorm = String(cur.email || '').trim().toLowerCase();
      if (cur.email_verified_at && emTrim !== curNorm) {
        return res.status(403).json({ error: 'Email cannot be changed after verification' });
      }
      nextEmail = emTrim;
    }

    let nextPhone = String(cur.phone || '').replace(/\D/g, '').slice(0, 10);
    if (phone !== undefined) {
      if (phone === null) {
        return res.status(400).json({ error: 'phone cannot be null' });
      }
      const ph = String(phone).replace(/\D/g, '').slice(0, 10);
      if (ph.length !== 10) {
        return res.status(400).json({ error: 'phone must be 10 digits' });
      }
      nextPhone = ph;
    }

    let nextState = String(cur.signup_state || '');
    if (state !== undefined && state !== null) {
      nextState = String(state).trim().slice(0, 120);
    }

    let nextDistrict = String(cur.signup_district || '');
    if (district !== undefined && district !== null) {
      nextDistrict = String(district).trim().slice(0, 120);
    }

    const upd = await pool.query(
      `UPDATE users SET display_name = $1, email = $2, phone = $3, signup_state = $4, signup_district = $5, updated_at = now()
       WHERE id = $6::uuid RETURNING *`,
      [nextName, nextEmail, nextPhone, nextState, nextDistrict, req.userId],
    );
    return res.json({ user: mapUserRow(upd.rows[0]) });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email or phone already in use' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Profile update failed' });
  }
});

router.patch('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const curPw = String(currentPassword || '');
  const nextPw = String(newPassword || '');
  if (!curPw || !nextPw) {
    return res.status(400).json({ error: 'currentPassword and newPassword required' });
  }
  if (nextPw.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  try {
    const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1::uuid`, [req.userId]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(curPw, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(nextPw, 12);
    await pool.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid`, [
      hash,
      req.userId,
    ]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Password update failed' });
  }
});

router.post('/email-verification/request', async (req, res) => {
  try {
    const userRes = await pool.query(`SELECT id, email, email_verified_at FROM users WHERE id = $1::uuid LIMIT 1`, [req.userId]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email_verified_at) {
      return res.status(200).json({ ok: true, message: 'Email is already verified' });
    }
    if (!isMailConfigured()) {
      return res.status(503).json({
        error: 'Email verification is not configured. Add SMTP settings to server .env.',
      });
    }
    const otp = String(pickSixDigit());
    const tokenHash = sha256Hex(otp);
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + EMAIL_VERIFY_OTP_MINUTES());
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE user_one_time_tokens SET used_at = now()
         WHERE user_id = $1::uuid AND purpose = 'email_verify' AND used_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO user_one_time_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1::uuid, 'email_verify', $2, $3)`,
        [user.id, tokenHash, expires.toISOString()],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await sendEmailVerificationOtp({ to: user.email, otp });
    return res.status(200).json({
      ok: true,
      message: 'We sent a 6-digit verification code to your email.',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not send verification code' });
  }
});

router.post('/email-verification/confirm', async (req, res) => {
  const otpRaw = String((req.body || {}).otp || '').replace(/\D/g, '');
  if (otpRaw.length !== 6) {
    return res.status(400).json({ error: 'Enter a valid 6-digit code' });
  }
  const tokenHash = sha256Hex(otpRaw);
  const client = await pool.connect();
  try {
    const userRes = await client.query(
      `SELECT id, email_verified_at FROM users WHERE id = $1::uuid LIMIT 1`,
      [req.userId],
    );
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email_verified_at) return res.json({ ok: true, alreadyVerified: true });
    const tok = await client.query(
      `SELECT id FROM user_one_time_tokens
       WHERE user_id = $1::uuid
         AND purpose = 'email_verify'
         AND token_hash = $2
         AND used_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.userId, tokenHash],
    );
    const tokenRow = tok.rows[0];
    if (!tokenRow) return res.status(400).json({ error: 'Invalid or expired code' });
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1::uuid`,
      [req.userId],
    );
    await client.query(`UPDATE user_one_time_tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);
    await client.query(
      `UPDATE user_one_time_tokens SET used_at = now()
       WHERE user_id = $1::uuid AND purpose = 'email_verify' AND used_at IS NULL AND id <> $2`,
      [req.userId, tokenRow.id],
    );
    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    return res.status(500).json({ error: 'Email verification failed' });
  } finally {
    client.release();
  }
});

router.post('/support', async (req, res) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required' });
  try {
    const userQ = await pool.query(
      `SELECT email, display_name FROM users WHERE id = $1::uuid LIMIT 1`,
      [req.userId],
    );
    const user = userQ.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    await appendInboxItem('feedbackInbox', {
      id: `support-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      user: String(user.display_name || user.email || 'User'),
      subject: 'Help & Support',
      message,
      createdAt: new Date().toISOString(),
      status: 'new',
    }, req.userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to submit support message' });
  }
});

router.post('/feedback', async (req, res) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'Feedback is required' });
  try {
    const userQ = await pool.query(
      `SELECT email, display_name FROM users WHERE id = $1::uuid LIMIT 1`,
      [req.userId],
    );
    const user = userQ.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    await appendInboxItem('feedbackInbox', {
      id: `feedback-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      user: String(user.display_name || user.email || 'User'),
      subject: 'Feedback',
      message,
      createdAt: new Date().toISOString(),
      status: 'new',
    }, req.userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

router.post('/report-issue', async (req, res) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'Issue details are required' });
  try {
    const userQ = await pool.query(
      `SELECT email, display_name FROM users WHERE id = $1::uuid LIMIT 1`,
      [req.userId],
    );
    const user = userQ.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    await appendInboxItem('reportIssueInbox', {
      id: `issue-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      user: String(user.display_name || user.email || 'User'),
      subject: 'Reported Issue',
      message,
      createdAt: new Date().toISOString(),
      status: 'new',
    }, req.userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to submit issue report' });
  }
});

router.post('/device-token', async (req, res) => {
  const body = req.body || {};
  const token = normalizeDeviceToken(body.token);
  const deviceIdRaw = body.deviceId ?? body.device_id;
  const deviceId = String(deviceIdRaw || '').trim().slice(0, 200);
  const platform = String(body.platform || 'android').trim().toLowerCase().slice(0, 20) || 'android';
  const appVersion = String(body.appVersion || '').trim().slice(0, 40);
  if (!isLikelyValidFcmToken(token)) {
    console.warn('device_token_register_rejected', {
      userId: req.userId,
      platform,
      len: token.length,
      hasSpace: /\s/.test(token),
      starts: token.slice(0, 8),
      ends: token.slice(-8),
    });
    return res.status(400).json({ error: 'Valid device token is required' });
  }
  try {
    await ensureUserDeviceTokensTable();
    if (!deviceId) {
      // Legacy clients: keep old behavior (upsert by token).
      await pool.query(
        `INSERT INTO user_device_tokens (token, user_id, device_id, platform, app_version, updated_at)
         VALUES ($1, $2::uuid, NULL, $3, $4, now())
         ON CONFLICT (token)
         DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, app_version = EXCLUDED.app_version, updated_at = now()`,
        [token, req.userId, platform, appVersion],
      );
      console.info('device_token_registered', {
        userId: req.userId,
        platform,
        legacy: true,
        len: token.length,
        starts: token.slice(0, 8),
        ends: token.slice(-8),
      });
      return res.json({ ok: true, legacy: true });
    }

    // Per-device upsert:
    // - Delete any row already holding this token for a different device/user to avoid PK conflicts
    // - Upsert by (user_id, device_id) so rotation updates token in-place for that device
    await pool.query(
      `DELETE FROM user_device_tokens
       WHERE token = $1
         AND NOT (user_id = $2::uuid AND device_id = $3)`,
      [token, req.userId, deviceId],
    );
    await pool.query(
      `INSERT INTO user_device_tokens (token, user_id, device_id, platform, app_version, updated_at)
       VALUES ($1, $2::uuid, $3, $4, $5, now())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET token = EXCLUDED.token, platform = EXCLUDED.platform, app_version = EXCLUDED.app_version, updated_at = now()`,
      [token, req.userId, deviceId, platform, appVersion],
    );
    console.info('device_token_registered', {
      userId: req.userId,
      platform,
      legacy: false,
      deviceId: deviceId.slice(0, 16),
      len: token.length,
      starts: token.slice(0, 8),
      ends: token.slice(-8),
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to register device token' });
  }
});

module.exports = router;
