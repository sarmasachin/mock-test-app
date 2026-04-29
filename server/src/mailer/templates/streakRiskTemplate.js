'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStreakRiskAlertEmail({ displayName, brandName, inactiveDays, ctaLink, supportEmail }) {
  const safeName = escapeHtml(displayName || 'Learner');
  const safeBrand = escapeHtml(brandName || 'MockTestApp');
  const safeCtaLink = escapeHtml(ctaLink || 'https://play.google.com/store');
  const days = Number(inactiveDays || 0);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 2;
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is available for you.';

  return {
    text:
      `Hey, ${displayName || 'Learner'}\n\n` +
      `Your preparation streak is at risk. You have been inactive for ${safeDays} days.\n\n` +
      `Open app now, attempt a quick test, and keep your momentum alive.\n` +
      `Continue now: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#be123c 0%,#e11d48 45%,#f43f5e 100%);padding:26px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#ffe4e6;letter-spacing:0.08em;text-transform:uppercase;">Streak Risk Alert</p>
            <p style="margin:0;font-size:32px;line-height:1.15;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:24px 22px 20px 22px;">
            <p style="margin:0 0 12px 0;font-size:18px;line-height:1.55;color:#1f2937;">
              Your consistency is your superpower. We noticed you were inactive for <strong>${safeDays} days</strong>.
            </p>
            <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;padding:14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#9f1239;font-weight:700;">Quick recovery steps</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Attempt one short mock test today.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Review errors and improve weak topics.</p>
              <p style="margin:0;font-size:15px;line-height:1.5;">- Continue daily to build rank and confidence.</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${safeCtaLink}" style="display:inline-block;background:linear-gradient(135deg,#e11d48,#f43f5e);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 28px;">
                Protect My Streak
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
              Keep pushing forward. Team <strong>${safeBrand}</strong> is with you at every step.
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

module.exports = { buildStreakRiskAlertEmail };
