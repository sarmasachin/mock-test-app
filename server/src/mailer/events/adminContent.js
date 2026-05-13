'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildAdminContentAlertEmail } = require('../templates/adminContentTemplate');
const { marketingFooterAppend } = require('../emailMarketingFooter');
const { buildMarketingUnsubscribeUrl } = require('../../lib/marketingEmailUnsubscribe');

async function sendAdminContentAlertEmail(opts) {
  const to = String(opts?.to || '').trim();
  const displayName = String(opts?.displayName || 'Learner').trim();
  const kind = String(opts?.kind || 'exam').trim().toLowerCase();
  const title = String(opts?.title || '').trim();
  const message = String(opts?.message || '').trim();
  const adminUser = String(process.env.SMTP_ADMIN_CONTENT_USER || process.env.SMTP_USER || '').trim();
  const adminPass = String(process.env.SMTP_ADMIN_CONTENT_PASS || process.env.SMTP_PASS || '').trim();
  if (!adminUser || !adminPass) {
    throw new Error(
      'Admin content SMTP not configured (set SMTP_ADMIN_CONTENT_USER and SMTP_ADMIN_CONTENT_PASS)',
    );
  }
  if (!to || !title || !message) {
    throw new Error('sendAdminContentAlertEmail: missing to/title/message');
  }
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const ctaUrl = String(opts?.ctaUrl || appUrl).trim() || appUrl;
  const ctaLabel = String(opts?.ctaLabel || 'Open App').trim() || 'Open App';
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || adminUser).trim();
  const brandName = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  let tpl = buildAdminContentAlertEmail({
    displayName,
    kind,
    title,
    message,
    ctaUrl,
    ctaLabel,
    supportEmail,
  });
  tpl = marketingFooterAppend(tpl, {
    unsubscribeUrl: buildMarketingUnsubscribeUrl(opts.userId),
    brandName,
  });
  const transporter = createTransportForPrefix('SMTP_ADMIN_CONTENT_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_ADMIN_CONTENT || process.env.MAIL_FROM || adminUser).trim(),
    replyTo: String(
      process.env.MAIL_REPLY_TO_ADMIN_CONTENT || process.env.MAIL_SUPPORT_EMAIL || adminUser,
    ).trim(),
    to,
    subject: `${String(kind || 'Update').toUpperCase()}: ${title}`.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendAdminContentAlertEmail };
