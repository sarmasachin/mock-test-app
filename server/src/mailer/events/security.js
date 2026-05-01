'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildAdminLoginSecurityEmail } = require('../templates/adminLoginSecurityTemplate');

async function sendSecurityAccountAlertEmail(opts) {
  const to = String(opts?.to || '').trim();
  const displayName = String(opts?.displayName || '').trim();
  const subject = String(opts?.subject || 'Security alert').trim();
  const eventType = String(opts?.eventType || 'Account activity').trim();
  const eventDetail = String(opts?.eventDetail || 'An account event was detected.').trim();
  const securityUser = String(process.env.SMTP_SECURITY_USER || process.env.SMTP_USER || '').trim();
  const securityPass = String(process.env.SMTP_SECURITY_PASS || process.env.SMTP_PASS || '').trim();
  if (!securityUser || !securityPass) {
    throw new Error('Security SMTP not configured (set SMTP_SECURITY_USER and SMTP_SECURITY_PASS)');
  }
  const transporter = createTransportForPrefix('SMTP_SECURITY_');
  const from = String(process.env.MAIL_FROM_SECURITY || process.env.MAIL_FROM || securityUser).trim();
  const replyTo = String(
    process.env.MAIL_REPLY_TO_SECURITY || process.env.MAIL_SUPPORT_EMAIL || securityUser,
  ).trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || from || '').trim();
  const accountActionUrl = String(process.env.MAIL_SECURITY_ACTION_URL || '').trim();
  const brandName = String(process.env.MAIL_BRAND_NAME || 'MockTest').trim();
  const tpl = buildAdminLoginSecurityEmail({
    displayName,
    eventType,
    eventDetail,
    supportEmail,
    accountActionUrl,
    brandName,
  });
  await transporter.sendMail({
    from,
    replyTo,
    to,
    subject,
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendSecurityAccountAlertEmail };
