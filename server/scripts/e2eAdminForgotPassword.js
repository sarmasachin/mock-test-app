#!/usr/bin/env node
'use strict';

/**
 * End-to-end diagnostics for POST /v1/auth/admin/password-reset/request
 *
 * Reads server/.env from ../.env (same as API process).
 *
 * Usage:
 *   cd server
 *   npm run e2e:admin-fp
 *
 * Or with overrides:
 *   API_BASE=https://your-domain.com/v1 ADMIN_IDENTIFIER=admin@mail.com node scripts/e2eAdminForgotPassword.js
 *
 * Steps:
 *   [1] SMTP vars present (SMTP_ADMIN_FP_* or SMTP_*)
 *   [2] Optional: transporter.verify() — real SMTP login test (VERIFY_SMTP=1)
 *   [3] Optional DB: resolve admin user + is_admin + email + purpose constraint (needs DATABASE_URL)
 *   [4] HTTP POST to API — same path as admin panel
 *
 * Exit codes: 0 = HTTP 200 && ok:true ; 1 = failure / missing config
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

function smtpSummary() {
  const user = String(process.env.SMTP_ADMIN_FP_USER || process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_ADMIN_FP_PASS || process.env.SMTP_PASS || '').trim();
  const host = String(process.env.SMTP_ADMIN_FP_HOST || 'smtp.gmail.com').trim();
  const port = String(process.env.SMTP_ADMIN_FP_PORT || '587');
  return {
    configured: Boolean(user && pass),
    host,
    port,
    userPreview: user ? `${user.slice(0, 4)}…@${user.split('@')[1] || ''}` : '(missing)',
  };
}

function isValidPhone(input) {
  const digits = String(input || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length !== 10) return false;
  const allSameDigit = new Set(digits.split('')).size === 1;
  const firstFiveSame = new Set(digits.slice(0, 5).split('')).size === 1;
  return !allSameDigit && !firstFiveSame;
}

async function findAdminRow(pool, identifierRaw) {
  const idRaw = String(identifierRaw || '').trim();
  if (!idRaw) return null;
  if (idRaw.includes('@')) {
    const { rows } = await pool.query(
      `SELECT id, email, display_name, is_admin
       FROM users
       WHERE email_normalized = lower(trim($1))
       LIMIT 1`,
      [idRaw],
    );
    return rows[0] || null;
  }
  const digits = idRaw.replace(/\D/g, '').slice(0, 10);
  if (!isValidPhone(digits)) return null;
  const { rows } = await pool.query(
    `SELECT id, email, display_name, is_admin
     FROM users
     WHERE phone = $1
     LIMIT 1`,
    [digits],
  );
  return rows[0] || null;
}

async function checkPurposeConstraint(pool) {
  const { rows } = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conname = 'user_one_time_tokens_purpose_check'
     LIMIT 1`,
  );
  const def = rows[0] && rows[0].def ? String(rows[0].def) : '';
  const allowsAdmin = def.includes('admin_password_reset');
  return { def: def || '(constraint not found — run database/postgres/013_admin_password_reset_token_purpose.sql)', allowsAdmin };
}

async function postJson(urlStr, body) {
  const u = new URL(urlStr);
  const isHttps = u.protocol === 'https:';
  const lib = isHttps ? require('https') : require('http');
  const payload = JSON.stringify(body);
  const opts = {
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: u.pathname + u.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 25000,
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_e) {
          /* leave as string */
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const apiBase = String(
    process.env.API_BASE || process.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/v1',
  ).replace(/\/$/, '');
  const identifier = String(process.env.ADMIN_IDENTIFIER || process.argv[2] || '').trim();
  const verifySmtp = String(process.env.VERIFY_SMTP || '').toLowerCase() === '1' || process.argv.includes('--verify-smtp');

  console.log('=== E2E: Admin forgot-password OTP request ===\n');

  const smtp = smtpSummary();
  console.log('[1] SMTP env (API process uses same .env)');
  console.log('    Host:', smtp.host, 'Port:', smtp.port);
  console.log('    Credentials:', smtp.configured ? 'present ' + smtp.userPreview : 'MISSING — OTP email cannot send');
  if (!smtp.configured) {
    console.log('    Fix: set SMTP_ADMIN_FP_USER + SMTP_ADMIN_FP_PASS (or SMTP_USER + SMTP_PASS) in server/.env\n');
  } else {
    console.log('');
  }

  if (verifySmtp && smtp.configured) {
    console.log('[2] SMTP verify() — connecting to mail server…');
    try {
      const { verifyAdminForgotPasswordSmtp } = require('../src/mailer/events/adminForgotPasswordOtp');
      await verifyAdminForgotPasswordSmtp();
      console.log('    OK: SMTP authentication succeeded.\n');
    } catch (e) {
      console.error('    FAIL:', e && e.message ? e.message : e);
      console.error('    Fix credentials, app password (Gmail), host/port, or firewall.\n');
      process.exitCode = 1;
    }
  } else if (verifySmtp && !smtp.configured) {
    console.log('[2] SKIP verify (no credentials)\n');
  } else {
    console.log('[2] SKIP SMTP verify (set VERIFY_SMTP=1 or pass --verify-smtp to test login)\n');
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!identifier) {
    console.log('[3] DB lookup: SKIP (set ADMIN_IDENTIFIER or pass email/mobile as argv)\n');
  } else if (!dbUrl) {
    console.log('[3] DB lookup: SKIP (no DATABASE_URL in env)\n');
  } else {
    console.log('[3] DB lookup for identifier:', identifier);
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    try {
      const row = await findAdminRow(pool, identifier);
      if (!row) {
        console.log('    FAIL: No user matches this email/mobile (same rules as API).');
        console.log('    Use exact admin email or 10-digit mobile stored on user.\n');
        process.exitCode = 1;
      } else {
        console.log('    User row found: id=', row.id);
        console.log('    is_admin:', row.is_admin, '| email:', row.email || '(empty)');
        if (!row.is_admin) {
          console.log('    FAIL: User exists but is_admin is false — API returns ok:false.\n');
          process.exitCode = 1;
        }
        const em = String(row.email || '').trim().toLowerCase();
        if (!em.includes('@')) {
          console.log('    FAIL: Admin has no valid email — API returns 400 before sending mail.\n');
          process.exitCode = 1;
        }
      }
      const purpose = await checkPurposeConstraint(pool);
      console.log('    Purpose constraint allows admin_password_reset:', purpose.allowsAdmin);
      if (!purpose.allowsAdmin) {
        console.log('    Definition:', purpose.def);
        console.log('    FAIL: Apply migration database/postgres/013_admin_password_reset_token_purpose.sql\n');
        process.exitCode = 1;
      }
      console.log('');
    } catch (e) {
      console.error('    DB error:', e.message || e);
      process.exitCode = 1;
    } finally {
      await pool.end().catch(() => {});
    }
  }

  if (!identifier) {
    console.log('[4] HTTP: SKIP — set ADMIN_IDENTIFIER to call API.\n');
    console.log('Done.');
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0);
    return;
  }

  const url = `${apiBase}/auth/admin/password-reset/request`;
  console.log('[4] POST', url);
  try {
    const res = await postJson(url, { identifier });
    console.log('    Status:', res.status);
    console.log('    Body:', typeof res.body === 'string' ? res.raw.slice(0, 500) : JSON.stringify(res.body, null, 2));

    if (res.status === 200 && res.body && res.body.ok === true) {
      console.log('\nPASS: API accepted request and reports OTP sent.');
      console.log('If inbox is empty: check Spam, SMTP_FROM vs mailbox, and run VERIFY_SMTP=1 node scripts/e2eAdminForgotPassword.js');
      process.exit(0);
      return;
    }

    if (res.status === 200 && res.body && res.body.ok === false) {
      console.log('\nFAIL: API returned ok:false (admin not found or not eligible).');
      process.exit(1);
      return;
    }

    console.log('\nFAIL: Unexpected status or body.');
    process.exit(1);
  } catch (e) {
    console.error('\nFAIL: HTTP error:', e.message || e);
    console.error('Check API_BASE (must include /v1), firewall, and that the API is running.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
