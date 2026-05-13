'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildWeeklyPerformanceReportEmail } = require('../templates/weeklyPerformanceTemplate');
const { marketingFooterAppend } = require('../emailMarketingFooter');
const { buildMarketingUnsubscribeUrl } = require('../../lib/marketingEmailUnsubscribe');

async function sendWeeklyPerformanceReportEmail(opts) {
  const to = String(opts?.to || '').trim();
  if (!to) throw new Error('sendWeeklyPerformanceReportEmail: missing recipient');

  const displayName = String(opts?.displayName || 'Learner').trim();
  const attempts = Number(opts?.attempts || 0);
  const avgPercent = Number(opts?.avgPercent || 0);
  const weakTopic = String(opts?.weakTopic || 'General Practice').trim();
  const weeklyUser = String(process.env.SMTP_WEEKLY_PERF_USER || process.env.SMTP_USER || '').trim();
  const weeklyPass = String(process.env.SMTP_WEEKLY_PERF_PASS || process.env.SMTP_PASS || '').trim();
  if (!weeklyUser || !weeklyPass) {
    throw new Error('Weekly-performance SMTP not configured (set SMTP_WEEKLY_PERF_USER and SMTP_WEEKLY_PERF_PASS)');
  }

  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || weeklyUser).trim();
  const subject = String(process.env.MAIL_SUBJECT_WEEKLY_PERF || 'Your Weekly Performance Report').trim();
  let tpl = buildWeeklyPerformanceReportEmail({
    displayName,
    brandName: brand,
    attempts,
    avgPercent,
    weakTopic,
    ctaLink: appUrl,
    supportEmail,
  });
  tpl = marketingFooterAppend(tpl, {
    unsubscribeUrl: buildMarketingUnsubscribeUrl(opts.userId),
    brandName: brand,
  });
  const transporter = createTransportForPrefix('SMTP_WEEKLY_PERF_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_WEEKLY_PERF || process.env.MAIL_FROM || weeklyUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_WEEKLY_PERF || process.env.MAIL_SUPPORT_EMAIL || weeklyUser).trim(),
    to,
    subject: subject.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendWeeklyPerformanceReportEmail };
