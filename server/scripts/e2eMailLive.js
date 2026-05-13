#!/usr/bin/env node
'use strict';

/**
 * Live SMTP E2E: sends one test message per outbound channel (same code paths as production).
 *
 * From repo `server/` folder:
 *   MAIL_E2E_TO=you@example.com npm run e2e:mail-live
 *
 * For a single OTP-only send (no other templates): npm run e2e:mail-otp
 *
 * Uses server/.env (DATABASE_URL optional — email toggles default to "on" if DB unreachable).
 * Optional: MAIL_E2E_DELAY_MS=3000  (gap between SMTP sends; Gmail often rate-limits if too low — default 2500)
 *
 * Admin "email event" toggles: if a kind is disabled in app_settings, that send returns
 * without error — you may see PASS but no inbox mail; enable toggles for a full check.
 *
 * Not covered here (noop in mail.js): sendNewContentByInterestEmail, sendReEngagementEmail.
 *
 * --dry   Only print isMailConfigured + recipient requirement; no emails sent.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(label, fn) {
  try {
    await fn();
    console.log(`[PASS] ${label}`);
    return 'PASS';
  } catch (e) {
    console.log(`[FAIL] ${label}: ${e && (e.message || String(e))}`);
    return 'FAIL';
  }
}

async function main() {
  const dry = process.argv.includes('--dry') || String(process.env.MAIL_E2E_DRY || '') === '1';
  const to = String(process.env.MAIL_E2E_TO || '').trim();

  const mail = require('../src/mail');
  const configured = mail.isMailConfigured();
  console.log('[e2e:mail-live] isMailConfigured:', configured);
  if (!configured) {
    console.error('[e2e:mail-live] Set SMTP_USER and SMTP_PASS in server/.env');
    process.exit(1);
  }

  if (dry) {
    console.log('[e2e:mail-live] --dry: no emails sent. Run with MAIL_E2E_TO=<email> for live sends.');
    process.exit(0);
  }

  if (!to) {
    console.error('[e2e:mail-live] Set MAIL_E2E_TO=<your inbox> to receive test messages (live send).');
    process.exit(1);
  }

  const gap = Math.max(0, parseInt(process.env.MAIL_E2E_DELAY_MS || '2500', 10) || 0);
  const displayName = 'E2E Mail Test';
  const e2eUserId = String(process.env.MAIL_E2E_USER_ID || '00000000-0000-4000-8000-000000000001').trim();

  const tests = [
    ['OTP password reset template', () => mail.sendPasswordResetOtp({ to, otp: '111111' })],
    ['OTP email verification template', () => mail.sendEmailVerificationOtp({ to, otp: '222222' })],
    ['Welcome', () => mail.sendWelcomeEmail({ to, displayName, userId: e2eUserId })],
    [
      'Security: new login (user)',
      () =>
        mail.sendSecurityAccountAlertEmail({
          userId: e2eUserId,
          to,
          displayName,
          subject: 'Security Alert: New login on your account',
          eventType: 'New Login',
          eventDetail: 'E2E mail live script — safe to ignore.',
        }),
    ],
    [
      'Security: password changed',
      () =>
        mail.sendSecurityAccountAlertEmail({
          userId: e2eUserId,
          to,
          displayName,
          subject: 'Password changed (E2E)',
          eventType: 'Password Changed',
          eventDetail: 'E2E mail live script — safe to ignore.',
        }),
    ],
    ['Profile reminder', () => mail.sendCompleteProfileReminderEmail({ to, displayName, userId: e2eUserId })],
    [
      'Admin content alert',
      () =>
        mail.sendAdminContentAlertEmail({
          userId: e2eUserId,
          to,
          displayName,
          kind: 'exam',
          title: 'E2E content ping',
          message: 'This is an automated admin-content mail test.',
        }),
    ],
    [
      'Result unlocked',
      () =>
        mail.sendResultUnlockedEmail({
          userId: e2eUserId,
          to,
          displayName,
          testTitle: 'E2E Mock Test',
          correct: 7,
          total: 10,
          rank: 3,
          participants: 120,
          unlockAtIso: new Date().toISOString(),
        }),
    ],
    [
      'Mock test starting soon',
      () =>
        mail.sendMockTestStartingSoonEmail({
          userId: e2eUserId,
          to,
          displayName,
          testTitle: 'E2E Starting Soon',
          examDate: 'Today',
          slotLabel: 'Evening',
          startAtIso: new Date().toISOString(),
        }),
    ],
    [
      'Missed test follow-up',
      () =>
        mail.sendMissedTestFollowupEmail({
          userId: e2eUserId,
          to,
          displayName,
          testTitle: 'E2E Missed Test',
        }),
    ],
    ['Streak risk', () => mail.sendStreakRiskAlertEmail({ userId: e2eUserId, to, displayName, inactiveDays: 2 })],
    [
      'Weekly performance',
      () =>
        mail.sendWeeklyPerformanceReportEmail({
          userId: e2eUserId,
          to,
          displayName,
          attempts: 5,
          avgPercent: 72,
          weakTopic: 'Reasoning',
        }),
    ],
    [
      'Rank milestone',
      () =>
        mail.sendRankMilestoneEmail({
          userId: e2eUserId,
          to,
          displayName,
          testTitle: 'E2E Rank Test',
          rank: 5,
          improvedBy: 12,
          reason: 'E2E automated check.',
        }),
    ],
    ['Birthday wish', () => mail.sendBirthdayEmail({ userId: e2eUserId, to, displayName })],
    [
      'Support journey (help ack style)',
      () =>
        mail.sendSupportJourneyEmail({
          userId: e2eUserId,
          to,
          displayName,
          subject: 'Help request',
          message: 'E2E support journey template.',
          status: 'received',
          userMessage: 'Test message from e2eMailLive.js',
        }),
    ],
  ];

  let pass = 0;
  let fail = 0;

  for (const [label, fn] of tests) {
    const status = await runOne(label, fn);
    if (status === 'PASS') pass += 1;
    else fail += 1;
    if (gap) await delay(gap);
  }

  console.log(`[e2e:mail-live] Summary: PASS=${pass} FAIL=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
