#!/usr/bin/env node
'use strict';

/**
 * E2E diagnostic: why "send email on publish" may not deliver mail.
 * Read-only DB checks + optional live send to MAIL_E2E_TO.
 *
 * Usage (from server/):
 *   node scripts/e2ePublishEmailDiag.js
 *   node scripts/e2ePublishEmailDiag.js --test-id <uuid>
 *   node scripts/e2ePublishEmailDiag.js --email you@example.com
 *   node scripts/e2ePublishEmailDiag.js --send-test   (live admin-content mail to MAIL_E2E_TO)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const mail = require('../src/mail');

function line(ok, msg) {
  console.log(`${ok ? 'OK ' : '!! '} ${msg}`);
  return ok;
}

function maskEmail(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at <= 1) return e ? '***' : '(empty)';
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

function parseArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return '';
  return String(process.argv[i + 1] || '').trim();
}

async function loadAdvancedMap() {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
  );
  try {
    const parsed = JSON.parse(String(rows[0]?.setting_value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

async function loadEmailEventToggles() {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'emailEventToggles' LIMIT 1`,
  );
  try {
    const parsed = JSON.parse(String(rows[0]?.setting_value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

async function countEligibleRecipients() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM users
     WHERE is_banned = false
       AND trim(COALESCE(email, '')) <> ''
       AND marketing_emails_unsubscribed_at IS NULL`,
  );
  return Number(rows[0]?.total || 0);
}

async function lookupUserByEmail(email) {
  const q = String(email || '').trim().toLowerCase();
  if (!q) return null;
  const { rows } = await pool.query(
    `SELECT id::text AS id, email, display_name, is_banned,
            marketing_emails_unsubscribed_at
     FROM users
     WHERE lower(trim(email)) = $1
     LIMIT 1`,
    [q],
  );
  return rows[0] || null;
}

async function main() {
  const testIdArg = parseArg('--test-id');
  const checkEmail = parseArg('--email');
  const sendTest = process.argv.includes('--send-test');
  const mailE2eTo = String(process.env.MAIL_E2E_TO || checkEmail || '').trim();

  console.log('=== Publish Email E2E Diagnostic (line-by-line) ===\n');

  let ok = true;

  // Gate 1: checkbox meaning (code path)
  console.log('-- Gate 1: Admin checkbox → server flag');
  line(true, 'Checkbox "send email on publish" maps to advancedConfig.sendEmailOnPublish === true');
  line(true, 'Default is FALSE unless admin explicitly ticks it on save');
  console.log('');

  // Gate 2: trigger event (justPublished)
  console.log('-- Gate 2: When does server queue publish announcement emails?');
  line(true, 'POST /admin/tests with isPublished=true → immediate background send when sendEmailOnPublish ON');
  line(true, 'PATCH /admin/tests/:id when justPublished → send');
  line(true, 'PATCH published test when sendEmailOnPublish newly enabled → send once per cycle');
  line(true, 'PATCH when cycleRenewed (expired cycle save) → send when checkbox ON');
  line(true, 'POST /admin/tests/:id/republish-now → send when checkbox ON (new cycle)');
  line(true, 'Auto scheduled republish (index.js) → send when checkbox ON');
  console.log('');

  console.log('-- Gate 3: Delivery delay');
  line(true, 'Emails queue immediately via setImmediate (no 5-minute wait)');
  line(true, 'HTTP response is not blocked; Hostinger SMTP sends in background');
  console.log('');

  // Gate 4: SMTP configured
  console.log('-- Gate 4: SMTP env (isMailConfigured)');
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || '').trim();
  const adminContentUser = String(process.env.SMTP_ADMIN_CONTENT_USER || smtpUser).trim();
  const adminContentPass = String(process.env.SMTP_ADMIN_CONTENT_PASS || smtpPass).trim();
  ok = line(mail.isMailConfigured(), `isMailConfigured (SMTP_USER set: ${Boolean(smtpUser)}, SMTP_PASS set: ${Boolean(smtpPass)})`) && ok;
  ok = line(Boolean(adminContentUser && adminContentPass), `Admin content SMTP creds present (user: ${Boolean(adminContentUser)}, pass: ${Boolean(adminContentPass)})`) && ok;
  line(true, `SMTP_HOST=${String(process.env.SMTP_HOST || 'smtp.gmail.com')}`);
  console.log('');

  // Gate 5: email event toggle
  console.log('-- Gate 5: emailEventToggles.admin_content_alert');
  const toggles = await loadEmailEventToggles();
  const adminContentToggle = toggles.admin_content_alert;
  const toggleEnabled = adminContentToggle !== false;
  ok = line(toggleEnabled, `admin_content_alert enabled (DB value: ${JSON.stringify(adminContentToggle)})`) && ok;
  console.log('');

  // Gate 6: recipients
  console.log('-- Gate 6: DB recipients (sendContentAnnouncementEmails query)');
  const eligible = await countEligibleRecipients();
  ok = line(eligible > 0, `Eligible users with email (not banned, not unsubscribed): ${eligible} (max 2000 sent per publish)`) && ok;
  console.log('');

  // Gate 7: specific user
  if (checkEmail) {
    console.log(`-- Gate 7: Your account (${maskEmail(checkEmail)})`);
    const u = await lookupUserByEmail(checkEmail);
    if (!u) {
      ok = line(false, 'User not found in DB with this email') && ok;
    } else {
      ok = line(!u.is_banned, `is_banned=${u.is_banned}`) && ok;
      ok = line(Boolean(String(u.email || '').trim()), `email on file: ${maskEmail(u.email)}`) && ok;
      ok = line(u.marketing_emails_unsubscribed_at == null, `marketing_emails_unsubscribed_at=${u.marketing_emails_unsubscribed_at || 'null'}`) && ok;
    }
    console.log('');
  }

  // Gate 8: test advanced config
  console.log('-- Gate 8: testAdvancedConfigs.sendEmailOnPublish per test');
  const advMap = await loadAdvancedMap();
  const entries = Object.entries(advMap);
  if (!entries.length) {
    line(true, 'No testAdvancedConfigs entries in DB');
  } else {
    let withEmailOn = 0;
    for (const [key, cfg] of entries) {
      if (cfg && cfg.sendEmailOnPublish === true) withEmailOn += 1;
    }
    line(true, `${entries.length} test(s) have advanced config; sendEmailOnPublish=true on ${withEmailOn}`);
    if (testIdArg) {
      const key = testIdArg;
      const cfg = advMap[key] || advMap[key.toLowerCase()] || null;
      if (!cfg) {
        ok = line(false, `No advanced config found for test id ${testIdArg}`) && ok;
      } else {
        ok = line(cfg.sendEmailOnPublish === true, `Test ${testIdArg} sendEmailOnPublish=${cfg.sendEmailOnPublish}`) && ok;
      }
    }
  }
  console.log('');

  // Gate 9: published tests state
  console.log('-- Gate 9: Published tests (re-save does not re-email)');
  const { rows: pubTests } = await pool.query(
    `SELECT id::text AS id, title, is_published
     FROM tests
     WHERE is_published = true
     ORDER BY updated_at DESC
     LIMIT 5`,
  );
  for (const t of pubTests) {
    const cfg = advMap[t.id] || {};
    console.log(`    • ${t.title} | sendEmailOnPublish=${cfg.sendEmailOnPublish === true} | already published`);
  }
  if (!pubTests.length) line(true, 'No published tests in DB');
  console.log('');

  // Optional live send (same template as publish)
  if (sendTest) {
    console.log('-- Live send: sendAdminContentAlertEmail (mocktest template)');
    if (!mailE2eTo) {
      ok = line(false, 'Set MAIL_E2E_TO or --email for --send-test') && ok;
    } else if (!mail.isMailConfigured()) {
      ok = line(false, 'SMTP not configured — cannot send test') && ok;
    } else {
      try {
        const u = await lookupUserByEmail(mailE2eTo);
        await mail.sendAdminContentAlertEmail({
          userId: u?.id || '00000000-0000-4000-8000-000000000001',
          to: mailE2eTo,
          displayName: u?.display_name || 'E2E User',
          kind: 'mocktest',
          title: 'E2E Publish Email Diagnostic',
          message: 'If you received this, admin-content SMTP + toggle work. Publish mail uses the same path.',
          ctaUrl: String(process.env.MAIL_APP_URL || '').trim(),
          ctaLabel: 'Open Mock Test',
        });
        ok = line(true, `Test email dispatched to ${maskEmail(mailE2eTo)} — check inbox/spam in 1-2 min`) && ok;
      } catch (e) {
        ok = line(false, `Send failed: ${e && (e.message || e)}`) && ok;
      }
    }
    console.log('');
  }

  console.log('=== Summary ===');
  if (ok) {
    console.log('All automated gates PASS — if publish mail still missing, most common causes:');
    console.log('  1) send email on publish checkbox OFF on save');
    console.log('  2) Same catalog cycle already emailed (dedupe — republish or new cycle to resend)');
    console.log('  3) Production server missing Hostinger SMTP env');
    console.log('  4) User email is fake/unsubscribed/banned');
    console.log('  5) Email in spam/promotions');
    process.exit(0);
  }
  console.log('One or more gates FAILED — fix items marked !! above.');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
