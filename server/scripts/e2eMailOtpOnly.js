#!/usr/bin/env node
'use strict';

/**
 * Single live OTP email (production send path) — one message only.
 * Full multi-template suite: npm run e2e:mail-live
 *
 * From server/:
 *   MAIL_E2E_TO=you@gmail.com npm run e2e:mail-otp
 *
 * Optional:
 *   MAIL_E2E_OTP_KIND=verify   → email verification template instead of password reset
 *   MAIL_E2E_OTP_CODE=482913   → 6 digits (default random each run)
 *   --dry                      → print isMailConfigured only, no SMTP send
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mail = require('../src/mail');

async function main() {
  const dry = process.argv.includes('--dry');
  const to = String(process.env.MAIL_E2E_TO || '').trim();
  const kind = String(process.env.MAIL_E2E_OTP_KIND || 'reset').toLowerCase();

  const configured = mail.isMailConfigured();
  console.log('[e2e:mail-otp] isMailConfigured:', configured);
  if (!configured) {
    console.error('[e2e:mail-otp] Set SMTP_USER and SMTP_PASS in server/.env');
    process.exit(1);
  }
  if (dry) {
    console.log('[e2e:mail-otp] --dry: no email sent.');
    process.exit(0);
  }
  if (!to) {
    console.error('[e2e:mail-otp] Set MAIL_E2E_TO=<inbox> for one OTP test email.');
    process.exit(1);
  }

  let code = String(process.env.MAIL_E2E_OTP_CODE || '').replace(/\D/g, '');
  if (code.length !== 6) {
    code = String(Math.floor(100000 + Math.random() * 900000));
  }

  const label = kind === 'verify' ? 'email verification OTP' : 'password reset OTP';
  try {
    if (kind === 'verify') {
      await mail.sendEmailVerificationOtp({ to, otp: code });
    } else {
      await mail.sendPasswordResetOtp({ to, otp: code });
    }
    console.log(`[e2e:mail-otp] OK: sent one ${label} to ${to} (code ${code}).`);
    process.exit(0);
  } catch (e) {
    console.error('[e2e:mail-otp] FAIL:', e && (e.message || String(e)));
    process.exit(1);
  }
}

main();
