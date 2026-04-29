'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBirthdayEmail({ displayName, brandName, ctaLink, supportEmail }) {
  const safeName = escapeHtml(displayName || 'Learner');
  const safeBrand = escapeHtml(brandName || 'MockTestApp');
  const safeCtaLink = escapeHtml(ctaLink || 'https://play.google.com/store');
  const birthdayGifUrl = String(process.env.MAIL_BIRTHDAY_GIF_URL || '').trim();
  const gifMarkup = birthdayGifUrl
    ? `<img src="${escapeHtml(birthdayGifUrl)}" alt="Birthday celebration" style="display:block;width:100%;max-width:560px;margin:0 auto 14px auto;border-radius:14px;border:1px solid #f5d0fe;" />`
    : '';
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is always with you.';

  return {
    text:
      `Happy Birthday, ${displayName || 'Learner'}!\n\n` +
      `Wishing you a wonderful year ahead filled with success and joy.\n` +
      `Your preparation journey with ${brandName || 'MockTestApp'} is special to us.\n\n` +
      `Open app: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#faf5ff;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ead7ff;border-radius:20px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#9333ea 0%,#ec4899 50%,#f59e0b 100%);padding:26px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#fae8ff;letter-spacing:0.08em;text-transform:uppercase;">Birthday Wishes</p>
            <p style="margin:0;font-size:34px;line-height:1.15;font-weight:800;color:#ffffff;">Happy Birthday, ${safeName}!</p>
          </div>
          <div style="padding:22px;">
            ${gifMarkup}
            <p style="margin:0 0 12px 0;font-size:18px;line-height:1.6;color:#1f2937;">
              Many many happy returns of the day. May this year bring you confidence, progress, and big wins in every exam goal.
            </p>
            <div style="background:#fdf4ff;border:1px solid #f5d0fe;border-radius:14px;padding:14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#86198f;font-weight:700;">A special note from ${safeBrand}</p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">
                Your dedication inspires us. Keep going strong and make this year your best preparation year yet.
              </p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${safeCtaLink}" style="display:inline-block;background:linear-gradient(135deg,#9333ea,#ec4899);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 30px;">
                Start Today with Energy
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#52525b;text-align:center;">
              Celebrate your day and keep moving toward your dream rank.
            </p>
          </div>
          <div style="border-top:1px solid #f3e8ff;padding:14px 18px 18px 18px;background:#fdfaff;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;text-align:center;">${footerContactText}</p>
          </div>
        </div>
      </div>
    `,
  };
}

module.exports = { buildBirthdayEmail };
