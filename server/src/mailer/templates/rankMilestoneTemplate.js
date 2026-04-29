'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toSafeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function buildRankMilestoneEmail({ displayName, brandName, testTitle, rank, improvedBy, reason, ctaLink, supportEmail }) {
  const safeName = escapeHtml(displayName || 'Learner');
  const safeBrand = escapeHtml(brandName || 'MockTestApp');
  const safeTestTitle = escapeHtml(testTitle || 'Mock Test');
  const safeReason = escapeHtml(reason || 'Great progress in your latest attempt.');
  const safeCtaLink = escapeHtml(ctaLink || 'https://play.google.com/store');
  const safeRank = toSafeInt(rank, 0);
  const safeImprovedBy = toSafeInt(improvedBy, 0);
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is here for you.';

  return {
    text:
      `Hey, ${displayName || 'Learner'}\n\n` +
      `You unlocked a rank milestone in ${testTitle || 'Mock Test'}.\n\n` +
      `Current Rank: #${safeRank}\n` +
      `Improved By: ${safeImprovedBy} ranks\n` +
      `Highlight: ${reason || 'Great progress in your latest attempt.'}\n\n` +
      `Open app and keep improving: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#a16207 0%,#ca8a04 45%,#f59e0b 100%);padding:26px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#fef3c7;letter-spacing:0.08em;text-transform:uppercase;">Rank Milestone</p>
            <p style="margin:0;font-size:32px;line-height:1.15;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:24px 22px 20px 22px;">
            <p style="margin:0 0 12px 0;font-size:18px;line-height:1.55;color:#1f2937;">
              You achieved a strong ranking milestone in <strong>${safeTestTitle}</strong>. Keep this momentum alive.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;table-layout:fixed;">
              <tr>
                <td style="vertical-align:top;padding:6px;">
                  <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:14px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#92400e;font-weight:700;">Current Rank</p>
                    <p style="margin:8px 0 0 0;font-size:28px;line-height:1.2;font-weight:800;color:#78350f;">#${safeRank}</p>
                  </div>
                </td>
                <td style="vertical-align:top;padding:6px;">
                  <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:14px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#92400e;font-weight:700;">Improved By</p>
                    <p style="margin:8px 0 0 0;font-size:28px;line-height:1.2;font-weight:800;color:#78350f;">${safeImprovedBy}</p>
                  </div>
                </td>
              </tr>
            </table>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#334155;font-weight:700;">Milestone highlight</p>
              <p style="margin:0;font-size:15px;line-height:1.5;">${safeReason}</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${safeCtaLink}" style="display:inline-block;background:linear-gradient(135deg,#ca8a04,#f59e0b);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 28px;">
                Keep Improving My Rank
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
              Your progress is real. Team <strong>${safeBrand}</strong> is proud of your consistency.
            </p>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px 18px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${footerContactText}</p>
          </div>
        </div>
      </div>
    `,
  };
}

module.exports = { buildRankMilestoneEmail };
