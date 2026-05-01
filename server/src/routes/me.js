'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { sha256Hex } = require('../cryptoUtil');
const { mapUserRow } = require('../userMapper');
const {
  isMailConfigured,
  sendEmailVerificationOtp,
  sendSecurityAccountAlertEmail,
  sendSupportJourneyEmail,
} = require('../mail');

const router = express.Router();
const EMAIL_VERIFY_OTP_MINUTES = () =>
  parseInt(process.env.EMAIL_VERIFY_OTP_MINUTES || '15', 10);

function pickSixDigit() {
  return 100000 + Math.floor(Math.random() * 900000);
}

function parseBirthdayDateOnly(input) {
  const raw = String(input || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const dt = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return null;
  const [yy, mm, dd] = raw.split('-').map((x) => Number(x));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd) return null;
  return raw;
}

async function ensureDeviceTokensTable() {
  await pool.query(
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

async function resolveDeviceTokenStorage() {
  const colsRes = await pool.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('user_device_tokens', 'user_devices')`,
  );
  const map = {};
  for (const row of colsRes.rows || []) {
    const table = String(row.table_name || '');
    const col = String(row.column_name || '');
    if (!table || !col) continue;
    if (!map[table]) map[table] = new Set();
    map[table].add(col);
  }
  if (map.user_device_tokens && map.user_device_tokens.size > 0) {
    return { table: 'user_device_tokens', cols: map.user_device_tokens };
  }
  if (map.user_devices && map.user_devices.size > 0) {
    return { table: 'user_devices', cols: map.user_devices };
  }
  return null;
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
  const { displayName, email, phone, state, district, birthdayDate } = req.body || {};
  if (
    displayName === undefined &&
    email === undefined &&
    phone === undefined &&
    state === undefined &&
    district === undefined &&
    birthdayDate === undefined
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

    let nextBirthdayDate = cur.date_of_birth ? String(cur.date_of_birth).slice(0, 10) : null;
    if (birthdayDate !== undefined) {
      if (birthdayDate === null || String(birthdayDate).trim() === '') {
        nextBirthdayDate = null;
      } else {
        const parsed = parseBirthdayDateOnly(birthdayDate);
        if (!parsed) {
          return res.status(400).json({ error: 'birthdayDate must be in YYYY-MM-DD format' });
        }
        const today = new Date().toISOString().slice(0, 10);
        if (parsed > today) {
          return res.status(400).json({ error: 'birthdayDate cannot be in the future' });
        }
        nextBirthdayDate = parsed;
      }
    }

    const upd = await pool.query(
      `UPDATE users
       SET display_name = $1,
           email = $2,
           phone = $3,
           signup_state = $4,
           signup_district = $5,
           date_of_birth = $6::date,
           updated_at = now()
       WHERE id = $7::uuid
       RETURNING *`,
      [nextName, nextEmail, nextPhone, nextState, nextDistrict, nextBirthdayDate, req.userId],
    );
    if (isMailConfigured() && String(cur.email || '').trim().toLowerCase() !== String(nextEmail || '').trim().toLowerCase()) {
      sendSecurityAccountAlertEmail({
        to: String(nextEmail || '').trim(),
        displayName: String(nextName || '').trim(),
        subject: 'Email updated on your account',
        eventType: 'Email Changed',
        eventDetail: `Your account email was changed from ${String(cur.email || '').trim()} to ${String(nextEmail || '').trim()}.`,
      }).catch((mailErr) => {
        console.error('security_email_change_alert_failed', mailErr && (mailErr.message || mailErr));
      });
    }
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
    if (isMailConfigured()) {
      const userRes = await pool.query(`SELECT email, display_name FROM users WHERE id = $1::uuid LIMIT 1`, [req.userId]);
      const em = String(userRes.rows[0]?.email || '').trim();
      const dn = String(userRes.rows[0]?.display_name || '').trim();
      if (em) {
        sendSecurityAccountAlertEmail({
          to: em,
          displayName: dn,
          subject: 'Password changed from profile',
          eventType: 'Password Changed',
          eventDetail: 'Your password was changed successfully from profile settings.',
        }).catch((mailErr) => {
          console.error('security_profile_password_change_alert_failed', mailErr && (mailErr.message || mailErr));
        });
      }
    }
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
    await appendInboxItem('helpSupportInbox', {
      id: `support-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      userId: String(req.userId || ''),
      userEmail: String(user.email || ''),
      user: String(user.display_name || user.email || 'User'),
      subject: 'Help & Support',
      message,
      createdAt: new Date().toISOString(),
      status: 'new',
    }, req.userId);
    if (isMailConfigured() && String(user.email || '').trim()) {
      sendSupportJourneyEmail({
        to: String(user.email || '').trim(),
        status: 'received',
        subject: 'Help & Support',
        message: 'We have received your support request. Our team will review it shortly.',
        userMessage: message,
        displayName: String(user.display_name || user.email || 'User'),
      }).catch((mailErr) => {
        console.error('support_received_email_failed', mailErr && (mailErr.message || mailErr));
      });
    }
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
      userId: String(req.userId || ''),
      userEmail: String(user.email || ''),
      user: String(user.display_name || user.email || 'User'),
      subject: 'Feedback',
      message,
      createdAt: new Date().toISOString(),
      status: 'new',
    }, req.userId);
    if (isMailConfigured() && String(user.email || '').trim()) {
      sendSupportJourneyEmail({
        to: String(user.email || '').trim(),
        status: 'received',
        subject: 'Feedback',
        message: 'Thanks for your feedback. We have received it and will review it soon.',
        userMessage: message,
        displayName: String(user.display_name || user.email || 'User'),
      }).catch((mailErr) => {
        console.error('feedback_received_email_failed', mailErr && (mailErr.message || mailErr));
      });
    }
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
      userId: String(req.userId || ''),
      userEmail: String(user.email || ''),
      user: String(user.display_name || user.email || 'User'),
      subject: 'Reported Issue',
      message,
      createdAt: new Date().toISOString(),
      status: 'new',
    }, req.userId);
    if (isMailConfigured() && String(user.email || '').trim()) {
      sendSupportJourneyEmail({
        to: String(user.email || '').trim(),
        status: 'received',
        subject: 'Issue Report',
        message: 'Issue report received. We are on it and will update you once resolved.',
        userMessage: message,
        displayName: String(user.display_name || user.email || 'User'),
      }).catch((mailErr) => {
        console.error('issue_received_email_failed', mailErr && (mailErr.message || mailErr));
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to submit issue report' });
  }
});

router.post('/device-token', async (req, res) => {
  const token = String(req.body?.deviceToken || '').trim();
  const platform = String(req.body?.platform || 'android')
    .trim()
    .toLowerCase()
    .slice(0, 20);
  const appVersion = String(req.body?.appVersion || '').trim().slice(0, 40);
  const deviceModel = String(req.body?.deviceModel || '').trim().slice(0, 120);
  if (!token || token.length < 20) {
    return res.status(400).json({ error: 'deviceToken is required' });
  }
  try {
    await ensureDeviceTokensTable();
    const storage = await resolveDeviceTokenStorage();
    if (!storage) return res.status(500).json({ error: 'Device token table not found' });
    const { table, cols } = storage;
    const tokenCol = cols.has('device_token')
      ? 'device_token'
      : cols.has('token')
        ? 'token'
        : cols.has('fcm_token')
          ? 'fcm_token'
          : null;
    if (!tokenCol) return res.status(500).json({ error: 'Device token column not found' });
    const hasPlatform = cols.has('platform');
    const hasAppVersion = cols.has('app_version');
    const hasDeviceModel = cols.has('device_model');
    const hasActive = cols.has('is_active') || cols.has('active') || cols.has('enabled');
    const activeCol = cols.has('is_active') ? 'is_active' : cols.has('active') ? 'active' : 'enabled';
    const hasUpdatedAt = cols.has('updated_at');
    const hasLastSeenAt = cols.has('last_seen_at');
    const insertCols = ['user_id', tokenCol];
    const insertVals = ['$1::uuid', '$2'];
    const params = [req.userId, token];
    let p = 3;
    if (hasPlatform) {
      insertCols.push('platform');
      insertVals.push(`$${p}`);
      params.push(platform || 'android');
      p += 1;
    }
    if (hasAppVersion) {
      insertCols.push('app_version');
      insertVals.push(`$${p}`);
      params.push(appVersion);
      p += 1;
    }
    if (hasDeviceModel) {
      insertCols.push('device_model');
      insertVals.push(`$${p}`);
      params.push(deviceModel);
      p += 1;
    }
    if (hasActive) {
      insertCols.push(activeCol);
      insertVals.push('true');
    }
    if (hasUpdatedAt) {
      insertCols.push('updated_at');
      insertVals.push('now()');
    }
    if (hasLastSeenAt) {
      insertCols.push('last_seen_at');
      insertVals.push('now()');
    }
    const setParts = ['user_id = EXCLUDED.user_id'];
    if (hasPlatform) setParts.push('platform = EXCLUDED.platform');
    if (hasAppVersion) setParts.push('app_version = EXCLUDED.app_version');
    if (hasDeviceModel) setParts.push('device_model = EXCLUDED.device_model');
    if (hasActive) setParts.push(`${activeCol} = true`);
    if (hasUpdatedAt) setParts.push('updated_at = now()');
    if (hasLastSeenAt) setParts.push('last_seen_at = now()');
    await pool.query(
      `INSERT INTO ${table} (${insertCols.join(', ')})
       VALUES (${insertVals.join(', ')})
       ON CONFLICT (${tokenCol})
       DO UPDATE SET ${setParts.join(', ')}`,
      params,
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to save device token' });
  }
});

router.delete('/device-token', async (req, res) => {
  const token = String(req.body?.deviceToken || '').trim();
  if (!token) return res.status(400).json({ error: 'deviceToken is required' });
  try {
    await ensureDeviceTokensTable();
    const storage = await resolveDeviceTokenStorage();
    if (!storage) return res.json({ ok: true });
    const { table, cols } = storage;
    const tokenCol = cols.has('device_token')
      ? 'device_token'
      : cols.has('token')
        ? 'token'
        : cols.has('fcm_token')
          ? 'fcm_token'
          : null;
    if (!tokenCol) return res.json({ ok: true });
    const hasActive = cols.has('is_active') || cols.has('active') || cols.has('enabled');
    const activeCol = cols.has('is_active') ? 'is_active' : cols.has('active') ? 'active' : 'enabled';
    if (hasActive) {
      const updatedExpr = cols.has('updated_at') ? ', updated_at = now()' : '';
      await pool.query(
        `UPDATE ${table}
         SET ${activeCol} = false${updatedExpr}
         WHERE user_id = $1::uuid AND ${tokenCol} = $2`,
        [req.userId, token],
      );
    } else {
      await pool.query(
        `DELETE FROM ${table}
         WHERE user_id = $1::uuid AND ${tokenCol} = $2`,
        [req.userId, token],
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to remove device token' });
  }
});

module.exports = router;
