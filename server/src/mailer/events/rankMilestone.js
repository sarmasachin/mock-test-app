'use strict';

const { createTransportForPrefix } = require('../transport');
const { buildRankMilestoneEmail } = require('../templates/rankMilestoneTemplate');
const { marketingFooterAppend } = require('../emailMarketingFooter');
const { buildMarketingUnsubscribeUrl } = require('../../lib/marketingEmailUnsubscribe');

async function sendRankMilestoneEmail(opts) {
  const to = String(opts?.to || '').trim();
  if (!to) throw new Error('sendRankMilestoneEmail: missing recipient');

  const displayName = String(opts?.displayName || 'Learner').trim();
  const testTitle = String(opts?.testTitle || 'Mock Test').trim();
  const rank = Number(opts?.rank || 0);
  const improvedBy = Number(opts?.improvedBy || 0);
  const reason = String(opts?.reason || '').trim() || 'Great progress in your latest attempt.';
  const rankUser = String(process.env.SMTP_RANK_MILESTONE_USER || process.env.SMTP_USER || '').trim();
  const rankPass = String(process.env.SMTP_RANK_MILESTONE_PASS || process.env.SMTP_PASS || '').trim();
  if (!rankUser || !rankPass) {
    throw new Error('Rank-milestone SMTP not configured (set SMTP_RANK_MILESTONE_USER and SMTP_RANK_MILESTONE_PASS)');
  }

  const brand = String(process.env.MAIL_BRAND_NAME || 'MockTestApp').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || rankUser).trim();
  const subject = String(process.env.MAIL_SUBJECT_RANK_MILESTONE || `Rank Milestone: #${Math.max(0, Math.round(rank))}`).trim();
  let tpl = buildRankMilestoneEmail({
    displayName,
    brandName: brand,
    testTitle,
    rank,
    improvedBy,
    reason,
    ctaLink: appUrl,
    supportEmail,
  });
  tpl = marketingFooterAppend(tpl, {
    unsubscribeUrl: buildMarketingUnsubscribeUrl(opts.userId),
    brandName: brand,
  });
  const transporter = createTransportForPrefix('SMTP_RANK_MILESTONE_');
  await transporter.sendMail({
    from: String(process.env.MAIL_FROM_RANK_MILESTONE || process.env.MAIL_FROM || rankUser).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO_RANK_MILESTONE || process.env.MAIL_SUPPORT_EMAIL || rankUser).trim(),
    to,
    subject: subject.slice(0, 170),
    text: tpl.text,
    html: tpl.html,
  });
}

module.exports = { sendRankMilestoneEmail };
