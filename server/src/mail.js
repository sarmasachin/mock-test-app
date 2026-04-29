'use strict';

const nodemailer = require('nodemailer');
const { sendWelcomeEmail: sendWelcomeEmailEvent } = require('./mailer/events/welcome');
const { sendSecurityAccountAlertEmail: sendSecurityAlertEvent } = require('./mailer/events/security');
const { sendCompleteProfileReminderEmail: sendProfileReminderEvent } = require('./mailer/events/profileReminder');
const { sendAdminContentAlertEmail: sendAdminContentEvent } = require('./mailer/events/adminContent');
const { sendResultUnlockedEmail: sendResultUnlockedEvent } = require('./mailer/events/resultUnlocked');

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
  return sendWelcomeEmailEvent(opts);
}

async function sendSecurityAccountAlertEmail(opts) {
  return sendSecurityAlertEvent(opts);
}

async function sendSupportJourneyEmail(opts) {
  const to = String(opts?.to || '').trim();
  const subject = `Support Update: ${String(opts?.subject || 'Request update').trim()}`;
  const message = String(opts?.message || 'We have received your request.').trim();
  await sendMail({
    to,
    subject,
    text: message,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111">
        <p>${escapeHtml(message)}</p>
      </div>
    `,
  });
}

async function noop() {
  return undefined;
}

async function sendCompleteProfileReminderEmail(opts) {
  return sendProfileReminderEvent(opts);
}
async function sendAdminContentAlertEmail(opts) {
  return sendAdminContentEvent(opts);
}
async function sendResultUnlockedEmail(opts) {
  return sendResultUnlockedEvent(opts);
}
const sendMockTestStartingSoonEmail = noop;
const sendMissedTestFollowupEmail = noop;
const sendStreakRiskAlertEmail = noop;
const sendWeeklyPerformanceReportEmail = noop;
const sendRankMilestoneEmail = noop;
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
  sendNewContentByInterestEmail,
  sendReEngagementEmail,
  sendSecurityAccountAlertEmail,
  sendSupportJourneyEmail,
};
