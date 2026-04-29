'use strict';

const nodemailer = require('nodemailer');

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
  const to = String(opts?.to || '').trim();
  const displayName = String(opts?.displayName || 'User').trim();
  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const welcomeUser = String(process.env.SMTP_WELCOME_USER || process.env.SMTP_USER || '').trim();
  const welcomePass = String(process.env.SMTP_WELCOME_PASS || process.env.SMTP_PASS || '').trim();
  if (!welcomeUser || !welcomePass) {
    throw new Error('Welcome SMTP not configured (set SMTP_WELCOME_USER and SMTP_WELCOME_PASS)');
  }
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || welcomeUser).trim();
  const appUrl = String(process.env.MAIL_APP_URL || '').trim();
  const ctaLink = appUrl || 'https://play.google.com/store';
  const ctaLabel = appUrl ? 'Open Dashboard' : 'Start Your First Test';
  const subject = String(process.env.MAIL_SUBJECT_WELCOME || `Welcome to ${brand}`).trim();
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const brandInitial = (brand.trim().charAt(0) || 'M').toUpperCase();
  const logoMarkup = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand)} logo" width="52" height="52" style="display:inline-block;width:52px;height:52px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`
    : `<span style="display:inline-block;width:52px;height:52px;line-height:52px;border-radius:999px;background:#111827;color:#ffffff;font-size:22px;font-weight:700;text-align:center;">${escapeHtml(brandInitial)}</span>`;
  const safeName = escapeHtml(displayName || 'Learner');
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is always with you.';
  const transporter = createTransportForPrefix('SMTP_WELCOME_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_WELCOME || process.env.MAIL_FROM || welcomeUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_WELCOME || process.env.MAIL_SUPPORT_EMAIL || welcomeUser).trim(),
    to,
    subject,
    text:
      `Hello ${displayName || 'Learner'}, welcome to ${brand}.\n\n` +
      `We are happy to have you with us. You can now:\n` +
      `- Practice mock tests\n` +
      `- Improve daily with quiz and digest\n` +
      `- Track your progress and rankings\n` +
      `- Stay updated with exam and job alerts\n\n` +
      `Start here: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 45%,#14b8a6 100%);padding:26px 22px;text-align:center;">
            ${logoMarkup}
            <p style="margin:14px 0 6px 0;font-size:15px;line-height:1.4;color:#eaf2ff;letter-spacing:0.08em;text-transform:uppercase;">Welcome to ${escapeHtml(brand)}</p>
            <p style="margin:0;font-size:33px;line-height:1.15;font-weight:800;color:#ffffff;">Hello, ${safeName}</p>
          </div>
          <div style="padding:24px 22px 20px 22px;">
            <p style="margin:0 0 14px 0;font-size:18px;line-height:1.55;color:#1f2937;">
              Your account is ready. We are excited to support your preparation journey with a premium experience.
            </p>
            <div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:14px;padding:14px 14px 8px 14px;margin:0 0 18px 0;">
              <p style="margin:0 0 10px 0;font-size:14px;color:#1e3a8a;font-weight:700;">What you can do now</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Attempt high-quality mock tests with real exam feel.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Stay consistent with daily quiz and digest updates.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Track performance from history, score and leaderboard.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Get timely job, exam and important news alerts.</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${escapeHtml(ctaLink)}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                ${escapeHtml(ctaLabel)}
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
              Thank you for trusting <strong>${escapeHtml(brand)}</strong>. Your goals matter to us, and we are here to help you succeed.
            </p>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px 18px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${footerContactText}</p>
          </div>
        </div>
      </div>
    `,
  });
}

async function sendSecurityAccountAlertEmail(opts) {
  const to = String(opts?.to || '').trim();
  const subject = String(opts?.subject || 'Security alert').trim();
  const eventType = String(opts?.eventType || 'Account activity').trim();
  const eventDetail = String(opts?.eventDetail || 'An account event was detected.').trim();
  await sendMail({
    to,
    subject,
    text: `${eventType}\n\n${eventDetail}`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111">
        <h2>${escapeHtml(eventType)}</h2>
        <p>${escapeHtml(eventDetail)}</p>
      </div>
    `,
  });
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

const sendCompleteProfileReminderEmail = noop;
const sendAdminContentAlertEmail = noop;
const sendResultUnlockedEmail = noop;
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
