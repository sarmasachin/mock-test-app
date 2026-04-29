'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildWelcomeEmail({ displayName, brandName, ctaLink, ctaLabel, supportEmail }) {
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const brandInitial = (brandName.trim().charAt(0) || 'M').toUpperCase();
  const logoMarkup = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)} logo" width="52" height="52" style="display:inline-block;width:52px;height:52px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`
    : `<span style="display:inline-block;width:52px;height:52px;line-height:52px;border-radius:999px;background:#111827;color:#ffffff;font-size:22px;font-weight:700;text-align:center;">${escapeHtml(brandInitial)}</span>`;
  const safeName = escapeHtml(displayName || 'Learner');
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is always with you.';

  return {
    text:
      `Hey, ${displayName || 'Learner'}\n\n` +
      `Welcome to ${brandName}.\n\n` +
      `We are happy to have you with us. You can now:\n` +
      `- Practice mock tests\n` +
      `- Improve daily with quiz and digest\n` +
      `- Track your progress and rankings\n` +
      `- Stay updated with exam and job alerts\n\n` +
      `Start here: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 45%,#14b8a6 100%);padding:26px 22px;text-align:center;">
            ${logoMarkup}
            <p style="margin:14px 0 6px 0;font-size:15px;line-height:1.4;color:#eaf2ff;letter-spacing:0.08em;text-transform:uppercase;">Welcome to ${escapeHtml(brandName)}</p>
            <p style="margin:0;font-size:33px;line-height:1.15;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:24px 22px 20px 22px;">
            <p style="margin:0 0 14px 0;font-size:18px;line-height:1.55;color:#1f2937;">
              Your account is ready. We are excited to support your preparation journey with a premium experience.
            </p>
            <div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:14px;padding:14px 14px 8px 14px;margin:0 0 18px 0;">
              <p style="margin:0 0 10px 0;font-size:14px;color:#1e3a8a;font-weight:700;">What you can do now</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Attempt high-quality mock tests with real exam feel.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Stay consistent with daily quiz and digest updates.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Track performance from history, score and leaderboard.</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;">- Get timely job, exam and important news alerts.</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${escapeHtml(ctaLink)}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                ${escapeHtml(ctaLabel)}
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
              Thank you for trusting <strong>${escapeHtml(brandName)}</strong>. Your goals matter to us, and we are here to help you succeed.
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

module.exports = { buildWelcomeEmail };
