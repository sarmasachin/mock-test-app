'use strict';

const nodemailer = require('nodemailer');
const { buildAdminForgotPasswordOtpEmail } = require('../templates/adminForgotPasswordOtpTemplate');

function readBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function createAdminForgotPasswordTransport() {
  const host = String(process.env.SMTP_ADMIN_FP_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(process.env.SMTP_ADMIN_FP_PORT || '587', 10);
  const secure = readBool(process.env.SMTP_ADMIN_FP_SECURE, false);
  const user = String(process.env.SMTP_ADMIN_FP_USER || process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_ADMIN_FP_PASS || process.env.SMTP_PASS || '').trim();
  const connectionTimeout = parseInt(process.env.SMTP_ADMIN_FP_CONNECTION_TIMEOUT_MS || '10000', 10);
  const greetingTimeout = parseInt(process.env.SMTP_ADMIN_FP_GREETING_TIMEOUT_MS || '10000', 10);
  const socketTimeout = parseInt(process.env.SMTP_ADMIN_FP_SOCKET_TIMEOUT_MS || '15000', 10);
  const rejectUnauthorized = readBool(process.env.SMTP_ADMIN_FP_TLS_REJECT_UNAUTHORIZED, true);
  const minVersion = String(process.env.SMTP_ADMIN_FP_TLS_MIN_VERSION || 'TLSv1.2').trim();

  if (!user || !pass) {
    throw new Error('Admin forgot-password SMTP not configured (SMTP_ADMIN_FP_USER / SMTP_ADMIN_FP_PASS)');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: { user, pass },
    tls: {
      rejectUnauthorized,
      minVersion,
    },
  });
}

async function sendAdminForgotPasswordOtpEmail(opts) {
  const to = String(opts?.to || '').trim();
  const otp = String(opts?.otp || '').trim();
  const displayName = String(opts?.displayName || 'Admin').trim();
  const minutes = Number(opts?.minutes || 15);
  const brandName = String(process.env.MAIL_BRAND_NAME || 'MockTest').trim();
  const fromUser = String(process.env.SMTP_ADMIN_FP_USER || process.env.SMTP_USER || '').trim();
  const from = String(process.env.MAIL_FROM_ADMIN_FP || fromUser).trim();
  const replyTo = String(process.env.MAIL_REPLY_TO_ADMIN_FP || process.env.MAIL_SUPPORT_EMAIL || from).trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || replyTo || from).trim();

  if (!to) throw new Error('sendAdminForgotPasswordOtpEmail: recipient is required');
  if (!otp || otp.length !== 6) throw new Error('sendAdminForgotPasswordOtpEmail: valid 6-digit OTP is required');

  const transporter = createAdminForgotPasswordTransport();
  const tpl = buildAdminForgotPasswordOtpEmail({
    displayName,
    otp,
    supportEmail,
    brandName,
    minutes,
  });

  await transporter.sendMail({
    from,
    replyTo,
    to,
    subject: String(process.env.MAIL_SUBJECT_ADMIN_FP_RESET || 'Admin password reset OTP').trim(),
    text: tpl.text,
    html: tpl.html,
  });
}

/** True when env has credentials used by [createAdminForgotPasswordTransport] (no network I/O). */
function isAdminForgotMailConfigured() {
  const user = String(process.env.SMTP_ADMIN_FP_USER || process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_ADMIN_FP_PASS || process.env.SMTP_PASS || '').trim();
  return Boolean(user && pass);
}

/** E2E / ops: confirm SMTP can connect and authenticate (does not send email). */
async function verifyAdminForgotPasswordSmtp() {
  const transporter = createAdminForgotPasswordTransport();
  await transporter.verify();
}

module.exports = {
  sendAdminForgotPasswordOtpEmail,
  verifyAdminForgotPasswordSmtp,
  isAdminForgotMailConfigured,
};
