'use strict';

const nodemailer = require('nodemailer');
const { pool } = require('./db');
const { sendWelcomeEmail: sendWelcomeEmailEvent } = require('./mailer/events/welcome');
const { sendSecurityAccountAlertEmail: sendSecurityAlertEvent } = require('./mailer/events/security');
const { sendCompleteProfileReminderEmail: sendProfileReminderEvent } = require('./mailer/events/profileReminder');
const { sendAdminContentAlertEmail: sendAdminContentEvent } = require('./mailer/events/adminContent');
const { sendResultUnlockedEmail: sendResultUnlockedEvent } = require('./mailer/events/resultUnlocked');
const { sendMockTestStartingSoonEmail: sendMockStartEvent } = require('./mailer/events/mockTestStartingSoon');
const { sendMissedTestFollowupEmail: sendMissedTestEvent } = require('./mailer/events/missedTestFollowup');
const { sendStreakRiskAlertEmail: sendStreakRiskEvent } = require('./mailer/events/streakRisk');
const { sendWeeklyPerformanceReportEmail: sendWeeklyPerfEvent } = require('./mailer/events/weeklyPerformance');
const { sendRankMilestoneEmail: sendRankMilestoneEvent } = require('./mailer/events/rankMilestone');
const { sendBirthdayEmail: sendBirthdayEvent } = require('./mailer/events/birthday');
const { buildSupportJourneyEmail } = require('./mailer/templates/supportJourneyTemplate');

const EMAIL_EVENT_KEYS = {
  welcome: 'welcome',
  securityAlert: 'security_alert',
  adminLoginAlert: 'admin_login_alert',
  helpSupportAck: 'help_support_ack',
  feedbackAck: 'feedback_ack',
  issueReportAck: 'issue_report_ack',
  profileReminder: 'profile_reminder',
  adminContentAlert: 'admin_content_alert',
  resultUnlocked: 'result_unlocked',
  mockTestStartingSoon: 'mock_test_starting_soon',
  missedTestFollowup: 'missed_test_followup',
  streakRiskAlert: 'streak_risk_alert',
  weeklyPerformanceReport: 'weekly_performance_report',
  rankMilestone: 'rank_milestone',
  newContentByInterest: 'new_content_by_interest',
  reEngagement: 're_engagement',
  birthday: 'birthday',
};

let emailEventTogglesCache = null;
let emailEventTogglesCacheAt = 0;

async function getEmailEventToggles() {
  const now = Date.now();
  if (emailEventTogglesCache && now - emailEventTogglesCacheAt < 30000) {
    return emailEventTogglesCache;
  }
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'emailEventToggles' LIMIT 1`,
    );
    const raw = String(rows[0]?.setting_value || '{}');
    const parsed = JSON.parse(raw);
    const map = parsed && typeof parsed === 'object' ? parsed : {};
    emailEventTogglesCache = map;
    emailEventTogglesCacheAt = now;
    return map;
  } catch (_e) {
    emailEventTogglesCache = {};
    emailEventTogglesCacheAt = now;
    return {};
  }
}

async function isEmailEventEnabled(eventKey) {
  const toggles = await getEmailEventToggles();
  if (!Object.prototype.hasOwnProperty.call(toggles, eventKey)) return true;
  return toggles[eventKey] !== false;
}

function isMailConfigured() {
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || '').trim();
  return Boolean(smtpUser && smtpPass);
}

function resolveFromAddress() {
  return String(process.env.MAIL_FROM || process.env.SMTP_USER || '').trim();
}

function resolveReplyToAddress() {
  return String(process.env.MAIL_SUPPORT_EMAIL || process.env.SMTP_USER || '').trim();
}

function createTransport() {
  const host = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const connectionTimeout = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10);
  const greetingTimeout = parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '10000', 10);
  const socketTimeout = parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '15000', 10);
  const tlsRejectUnauthorized =
    String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
  const tlsMinVersion = String(process.env.SMTP_TLS_MIN_VERSION || 'TLSv1.2').trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: tlsRejectUnauthorized,
      minVersion: tlsMinVersion,
    },
  });
}

function createTransportForPrefix(prefix) {
  const safePrefix = String(prefix || '').trim();
  const host = String(process.env[`${safePrefix}HOST`] || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(process.env[`${safePrefix}PORT`] || process.env.SMTP_PORT || '587', 10);
  const secure =
    String(process.env[`${safePrefix}SECURE`] || process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const connectionTimeout = parseInt(
    process.env[`${safePrefix}CONNECTION_TIMEOUT_MS`] || process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000',
    10,
  );
  const greetingTimeout = parseInt(
    process.env[`${safePrefix}GREETING_TIMEOUT_MS`] || process.env.SMTP_GREETING_TIMEOUT_MS || '10000',
    10,
  );
  const socketTimeout = parseInt(
    process.env[`${safePrefix}SOCKET_TIMEOUT_MS`] || process.env.SMTP_SOCKET_TIMEOUT_MS || '15000',
    10,
  );
  const tlsRejectUnauthorized =
    String(
      process.env[`${safePrefix}TLS_REJECT_UNAUTHORIZED`] ||
        process.env.SMTP_TLS_REJECT_UNAUTHORIZED ||
        'true',
    ).toLowerCase() !== 'false';
  const tlsMinVersion = String(
    process.env[`${safePrefix}TLS_MIN_VERSION`] || process.env.SMTP_TLS_MIN_VERSION || 'TLSv1.2',
  ).trim();
  const user = String(process.env[`${safePrefix}USER`] || process.env.SMTP_USER || '').trim();
  const pass = String(process.env[`${safePrefix}PASS`] || process.env.SMTP_PASS || '').trim();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: tlsRejectUnauthorized,
      minVersion: tlsMinVersion,
    },
  });
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBrandLogoMarkup(brandName) {
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const brandInitial = String((brandName || '').trim().charAt(0) || 'M').toUpperCase();
  if (logoUrl) {
    return `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)} logo" width="44" height="44" style="display:inline-block;width:44px;height:44px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`;
  }
  return `<span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:999px;background:#24292f;color:#ffffff;font-size:20px;font-weight:700;text-align:center;">${escapeHtml(brandInitial)}</span>`;
}

function buildOtpEmailTemplate({ title, subtitle, otp, brandName }) {
  const otpPretty = String(otp || '')
    .trim()
    .split('')
    .join(' ');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || resolveFromAddress() || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Please contact support.';
  const logoMarkup = buildBrandLogoMarkup(brandName);

  return {
    text:
      `${title}\n\n` +
      `Your verification code is: ${String(otp || '').trim()}\n\n` +
      `This code is valid for 15 minutes and can only be used once.\n\n` +
      `Please do not share this code with anyone.\n\n` +
      footerContactText,
    html: `
      <div style="background:#f6f8fa;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:12px;padding:28px;">
          <div style="text-align:center;margin:0 0 14px 0;">
            ${logoMarkup}
          </div>
          <p style="margin:0 0 6px 0;font-size:34px;line-height:1.2;font-weight:700;text-align:center;">${escapeHtml(title)}</p>
          <p style="margin:0 0 20px 0;font-size:18px;line-height:1.5;color:#57606a;text-align:center;">${escapeHtml(subtitle)}</p>
          <div style="border:1px solid #d0d7de;border-radius:10px;padding:22px 20px;margin:0 0 16px 0;text-align:center;">
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">Your code:</p>
            <p style="margin:0 0 16px 0;text-align:center;">
              <span style="display:inline-block;max-width:100%;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.08em;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(otpPretty)}
              </span>
            </p>
            <p style="margin:0 0 10px 0;font-size:16px;line-height:1.5;">This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
            <p style="margin:0;font-size:16px;line-height:1.5;"><strong>Please do not share this code with anyone.</strong></p>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            You're receiving this email because a code was requested for your ${escapeHtml(brandName)} account.
            If this wasn't you, please ignore this email.
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            ${footerContactText}
          </p>
        </div>
      </div>
    `,
  };
}

async function sendMail({ to, subject, text, html }) {
  if (!isMailConfigured()) {
    throw new Error('SMTP is not configured');
  }
  const toAddress = String(to || '').trim();
  if (!toAddress) {
    throw new Error('Recipient email is required');
  }
  const transporter = createTransport();
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to: toAddress,
    subject: String(subject || '').trim() || 'Notification',
    text: String(text || ''),
    html: String(html || ''),
  });
}

async function sendPasswordResetOtp(opts) {
  const to = String(opts?.to || '').trim();
  const otp = String(opts?.otp || '').trim();
  const subject = String(process.env.MAIL_SUBJECT_RESET || 'Your password reset code').trim();
  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const tpl = buildOtpEmailTemplate({
    title: 'Password reset code',
    subtitle: 'Use this code to reset your password.',
    otp,
    brandName: brand,
  });
  await sendMail({
    to,
    subject,
    text: tpl.text,
    html: tpl.html,
  });
}

async function sendEmailVerificationOtp(opts) {
  const to = String(opts?.to || '').trim();
  const otp = String(opts?.otp || '').trim();
  const subject = String(process.env.MAIL_SUBJECT_EMAIL_VERIFY || 'Your email verification code').trim();
  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const tpl = buildOtpEmailTemplate({
    title: 'Email verification code',
    subtitle: 'Use this code to verify your email.',
    otp,
    brandName: brand,
  });
  await sendMail({
    to,
    subject,
    text: tpl.text,
    html: tpl.html,
  });
}

async function sendWelcomeEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.welcome))) return undefined;
  return sendWelcomeEmailEvent(opts);
}

async function sendSecurityAccountAlertEmail(opts) {
  const eventType = String(opts?.eventType || '').toLowerCase();
  const subject = String(opts?.subject || '').toLowerCase();
  const isLoginAlert = eventType.includes('login') || subject.includes('login');
  if (isLoginAlert) {
    if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.adminLoginAlert))) return undefined;
  } else if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.securityAlert))) {
    return undefined;
  }
  return sendSecurityAlertEvent(opts);
}

async function sendSupportJourneyEmail(opts) {
  const to = String(opts?.to || '').trim();
  const rawSubject = String(opts?.subject || 'Request update').trim();
  const subject = `Support Update: ${rawSubject}`;
  const statusMessage = String(opts?.message || 'We have received your request.').trim();
  const userMessage = String(opts?.userMessage || '').trim();
  const displayName = String(opts?.displayName || 'User').trim();
  const normalizedSubject = rawSubject.toLowerCase();
  if (normalizedSubject.includes('feedback')) {
    if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.feedbackAck))) return undefined;
  } else if (normalizedSubject.includes('issue')) {
    if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.issueReportAck))) return undefined;
  } else if (normalizedSubject.includes('help') || normalizedSubject.includes('support')) {
    if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.helpSupportAck))) return undefined;
  }
  const brandName = String(process.env.MAIL_BRAND_NAME || 'MockTest').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || resolveFromAddress() || '').trim();
  const tpl = buildSupportJourneyEmail({
    displayName,
    subject: rawSubject,
    statusMessage,
    userMessage,
    supportEmail,
    brandName,
  });
  await sendMail({
    to,
    subject,
    text: tpl.text,
    html: tpl.html,
  });
}

async function noop() {
  return undefined;
}

async function sendCompleteProfileReminderEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.profileReminder))) return undefined;
  return sendProfileReminderEvent(opts);
}
async function sendAdminContentAlertEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.adminContentAlert))) return undefined;
  return sendAdminContentEvent(opts);
}
async function sendResultUnlockedEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.resultUnlocked))) return undefined;
  return sendResultUnlockedEvent(opts);
}
async function sendMockTestStartingSoonEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.mockTestStartingSoon))) return undefined;
  return sendMockStartEvent(opts);
}
async function sendMissedTestFollowupEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.missedTestFollowup))) return undefined;
  return sendMissedTestEvent(opts);
}
async function sendStreakRiskAlertEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.streakRiskAlert))) return undefined;
  return sendStreakRiskEvent(opts);
}
async function sendWeeklyPerformanceReportEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.weeklyPerformanceReport))) return undefined;
  return sendWeeklyPerfEvent(opts);
}
async function sendRankMilestoneEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.rankMilestone))) return undefined;
  return sendRankMilestoneEvent(opts);
}
async function sendBirthdayEmail(opts) {
  if (!(await isEmailEventEnabled(EMAIL_EVENT_KEYS.birthday))) return undefined;
  return sendBirthdayEvent(opts);
}
const sendNewContentByInterestEmail = noop;
const sendReEngagementEmail = noop;

module.exports = {
  isMailConfigured,
  sendPasswordResetOtp,
  sendEmailVerificationOtp,
  sendWelcomeEmail,
  sendCompleteProfileReminderEmail,
  sendAdminContentAlertEmail,
  sendResultUnlockedEmail,
  sendMockTestStartingSoonEmail,
  sendMissedTestFollowupEmail,
  sendStreakRiskAlertEmail,
  sendWeeklyPerformanceReportEmail,
  sendRankMilestoneEmail,
  sendBirthdayEmail,
  sendNewContentByInterestEmail,
  sendReEngagementEmail,
  sendSecurityAccountAlertEmail,
  sendSupportJourneyEmail,
};
