'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildStreakRiskAlertEmail } = require('../templates/streakRiskTemplate');
const { marketingFooterAppend } = require('../emailMarketingFooter');
const { buildMarketingUnsubscribeUrl } = require('../../lib/marketingEmailUnsubscribe');

async function sendStreakRiskAlertEmail(opts) {
  const to = String(opts?.to || '').trim();
  if (!to) throw new Error('sendStreakRiskAlertEmail: missing recipient');

  const displayName = String(opts?.displayName || 'Learner').trim();
  const inactiveDays = Number(opts?.inactiveDays || 2);
  const streakUser = String(process.env.SMTP_STREAK_RISK_USER || process.env.SMTP_USER || '').trim();
  const streakPass = String(process.env.SMTP_STREAK_RISK_PASS || process.env.SMTP_PASS || '').trim();
  if (!streakUser || !streakPass) {
    throw new Error('Streak-risk SMTP not configured (set SMTP_STREAK_RISK_USER and SMTP_STREAK_RISK_PASS)');
  }

  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || streakUser).trim();
  const subject = String(process.env.MAIL_SUBJECT_STREAK_RISK || 'Your Streak Is At Risk').trim();
  let tpl = buildStreakRiskAlertEmail({
    displayName,
    brandName: brand,
    inactiveDays,
    ctaLink: appUrl,
    supportEmail,
  });
  tpl = marketingFooterAppend(tpl, {
    unsubscribeUrl: buildMarketingUnsubscribeUrl(opts.userId),
    brandName: brand,
  });
  const transporter = createTransportForPrefix('SMTP_STREAK_RISK_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_STREAK_RISK || process.env.MAIL_FROM || streakUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_STREAK_RISK || process.env.MAIL_SUPPORT_EMAIL || streakUser).trim(),
    to,
    subject: subject.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendStreakRiskAlertEmail };
