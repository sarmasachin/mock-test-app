'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMissedTestFollowupEmail({ displayName, brandName, testTitle, ctaLink, supportEmail }) {
  const safeName = escapeHtml(displayName || 'Learner');
  const safeBrand = escapeHtml(brandName || 'MockTestApp');
  const safeTestTitle = escapeHtml(testTitle || 'Today Mock Test');
  const safeCtaLink = escapeHtml(ctaLink || 'https://play.google.com/store');
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is here for you.';

  return {
    text:
      `Hey, ${displayName || 'Learner'}\n\n` +
      `You missed today's mock test: ${testTitle || 'Today Mock Test'}.\n\n` +
      `No worries - keep your momentum going.\n` +
      `Open app and continue your preparation: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#dc2626 0%,#ea580c 45%,#f59e0b 100%);padding:26px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#ffedd5;letter-spacing:0.08em;text-transform:uppercase;">Missed Test Reminder</p>
            <p style="margin:0;font-size:32px;line-height:1.15;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:24px 22px 20px 22px;">
            <p style="margin:0 0 12px 0;font-size:18px;line-height:1.55;color:#1f2937;">
              You missed one test today, but your preparation journey is still on track.
            </p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#9a3412;font-weight:700;">Missed mock test</p>
              <p style="margin:0;font-size:16px;line-height:1.5;"><strong>${safeTestTitle}</strong></p>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#334155;font-weight:700;">Quick comeback plan</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Attempt the next mock test on time.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Review mistakes to improve rank faster.</p>
              <p style="margin:0;font-size:15px;line-height:1.5;">- Stay consistent daily for best results.</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${safeCtaLink}" style="display:inline-block;background:linear-gradient(135deg,#ea580c,#f97316);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 28px;">
                Continue Preparation
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
              One missed test does not define your journey. Team <strong>${safeBrand}</strong> believes in your comeback.
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

module.exports = { buildMissedTestFollowupEmail };
