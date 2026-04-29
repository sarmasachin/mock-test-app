'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildProfileReminderEmail({ displayName, brandName, ctaLink, fallbackLink, supportEmail }) {
  const safeName = escapeHtml(String(displayName || 'Learner').trim() || 'Learner');
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is always with you.';

  return {
    text:
      `Hey, ${String(displayName || 'Learner').trim() || 'Learner'}\n\n` +
      `Complete your profile to unlock a better ${brandName} experience.\n\n` +
      `Benefits:\n` +
      `- Personalized test recommendations\n` +
      `- Better progress insights\n` +
      `- Relevant exam and job alerts\n\n` +
      `Complete profile now: ${ctaLink}\n` +
      `If the app link does not open, use: ${fallbackLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#0f766e 0%,#0ea5e9 100%);padding:24px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:15px;line-height:1.4;color:#e6fffb;letter-spacing:0.08em;text-transform:uppercase;">Profile Reminder</p>
            <p style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 14px 0;font-size:17px;line-height:1.55;color:#1f2937;">
              Complete your profile once to unlock a fully personalized experience in <strong>${escapeHtml(brandName)}</strong>.
            </p>
            <div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:14px;padding:12px 14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:15px;">- Get smarter test recommendations</p>
              <p style="margin:0 0 8px 0;font-size:15px;">- See more accurate progress and insights</p>
              <p style="margin:0;font-size:15px;">- Receive better exam/job update relevance</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${escapeHtml(ctaLink)}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                Complete Profile
              </a>
            </div>
            <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">
              If the button does not open the app, open this link in your phone browser:
            </p>
            <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;text-align:center;">
              <a href="${escapeHtml(fallbackLink)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(fallbackLink)}</a>
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">
              It takes less than a minute and helps us serve you better.
            </p>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${footerContactText}</p>
          </div>
        </div>
      </div>
    `,
  };
}

module.exports = { buildProfileReminderEmail };
