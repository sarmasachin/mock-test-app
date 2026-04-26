'use strict';

const nodemailer = require('nodemailer');

function isMailConfigured() {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.MAIL_FROM || '').trim();
  return Boolean(user && pass && from);
}

function createTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends a 6-digit OTP for password reset (Gmail: use an App Password with 2FA on the Google account).
 * @param {{ to: string, otp: string }} opts
 */
async function sendPasswordResetOtp(opts) {
  const to = String(opts.to || '').trim();
  const otp = String(opts.otp || '').trim();
  if (!to || !otp) throw new Error('sendPasswordResetOtp: missing to or otp');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const brandInitial = (brandName.trim().charAt(0) || 'M').toUpperCase();
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const logoMarkup = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName} logo" width="44" height="44" style="display:inline-block;width:44px;height:44px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`
    : `<span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:999px;background:#24292f;color:#ffffff;font-size:20px;font-weight:700;text-align:center;">${brandInitial}</span>`;
  const otpPretty = otp.split('').join(' ');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Please contact support.';
  const subject = process.env.MAIL_SUBJECT_RESET || 'MockTestApp — password reset code';
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text:
      `Reset your password for ${brandName}.\n\n` +
      `Here is your ${brandName} password reset code: ${otp}\n\n` +
      `This code is valid for 15 minutes and can only be used once.\n\n` +
      `If you did not request this reset, you can safely ignore this email.\n\n` +
      `Please do not share this code with anyone.\n\n` +
      footerContactText,
    html: `
      <div style="background:#f6f8fa;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:12px;padding:28px;">
          <div style="text-align:center;margin:0 0 14px 0;">
            ${logoMarkup}
          </div>
          <p style="margin:0 0 6px 0;font-size:34px;line-height:1.2;font-weight:700;text-align:center;">Password reset requested</p>
          <p style="margin:0 0 20px 0;font-size:18px;line-height:1.5;color:#57606a;text-align:center;">Use this code to continue with your ${brandName} account.</p>
          <div style="border:1px solid #d0d7de;border-radius:10px;padding:22px 20px;margin:0 0 16px 0;text-align:center;">
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">Here is your <strong>${brandName}</strong> password reset code:</p>
            <p style="margin:0 0 16px 0;font-size:42px;line-height:1.1;font-weight:700;letter-spacing:0.22em;">${otpPretty}</p>
            <p style="margin:0 0 10px 0;font-size:16px;line-height:1.5;">This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
            <p style="margin:0 0 10px 0;font-size:16px;line-height:1.5;">If you did not request this reset, you can safely ignore this email.</p>
            <p style="margin:0;font-size:16px;line-height:1.5;"><strong>Please do not share this code with anyone.</strong></p>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            You're receiving this email because a password reset was requested for your ${brandName} account.
            If this wasn't you, no further action is needed.
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            ${footerContactText}
          </p>
        </div>
      </div>
    `,
  });
}

/**
 * Sends a 6-digit OTP for email verification.
 * @param {{ to: string, otp: string }} opts
 */
async function sendEmailVerificationOtp(opts) {
  const to = String(opts.to || '').trim();
  const otp = String(opts.otp || '').trim();
  if (!to || !otp) throw new Error('sendEmailVerificationOtp: missing to or otp');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const brandInitial = (brandName.trim().charAt(0) || 'M').toUpperCase();
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const logoMarkup = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName} logo" width="44" height="44" style="display:inline-block;width:44px;height:44px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`
    : `<span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:999px;background:#24292f;color:#ffffff;font-size:20px;font-weight:700;text-align:center;">${brandInitial}</span>`;
  const otpPretty = otp.split('').join(' ');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Please contact support.';
  const subject = process.env.MAIL_SUBJECT_EMAIL_VERIFY || 'MockTestApp — email verification code';
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text:
      `Please verify your identity for ${brandName}.\n\n` +
      `Here is your ${brandName} verification code: ${otp}\n\n` +
      `This code is valid for 15 minutes and can only be used once.\n\n` +
      `Please do not share this code with anyone.\n\n` +
      footerContactText,
    html: `
      <div style="background:#f6f8fa;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:12px;padding:28px;">
          <div style="text-align:center;margin:0 0 14px 0;">
            ${logoMarkup}
          </div>
          <p style="margin:0 0 6px 0;font-size:34px;line-height:1.2;font-weight:700;text-align:center;">Please verify your identity</p>
          <p style="margin:0 0 20px 0;font-size:18px;line-height:1.5;color:#57606a;text-align:center;">Use this code to verify your ${brandName} account.</p>
          <div style="border:1px solid #d0d7de;border-radius:10px;padding:22px 20px;margin:0 0 16px 0;text-align:center;">
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">Here is your <strong>${brandName}</strong> authentication code:</p>
            <p style="margin:0 0 16px 0;font-size:42px;line-height:1.1;font-weight:700;letter-spacing:0.22em;">${otpPretty}</p>
            <p style="margin:0 0 10px 0;font-size:16px;line-height:1.5;">This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
            <p style="margin:0;font-size:16px;line-height:1.5;"><strong>Please do not share this code with anyone.</strong></p>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            You're receiving this email because a verification code was requested for your ${brandName} account.
            If this wasn't you, please ignore this email.
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            ${footerContactText}
          </p>
        </div>
      </div>
    `,
  });
}

module.exports = { isMailConfigured, sendPasswordResetOtp, sendEmailVerificationOtp };
