'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Appends a visible unsubscribe block to HTML + plain text.
 * OTP / verification emails must NOT call this (they use buildOtpEmailTemplate only).
 */
function marketingFooterAppend(tpl, { unsubscribeUrl, brandName }) {
  const url = String(unsubscribeUrl || '').trim();
  if (!url) return tpl;
  const brand = escapeHtml(String(brandName || 'MockTestApp').trim() || 'MockTestApp');
  const safeUrl = escapeHtml(url);
  const block = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:10px 12px 0 12px;">
  <p style="margin:0 auto;max-width:620px;font-size:12px;line-height:1.65;color:#94a3b8;text-align:center;">
    <a href="${safeUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
    from optional product emails (${brand}).
    Login / verification codes are not affected.
  </p>
</div>`;
  return {
    html: String(tpl.html || '') + block,
    text: String(tpl.text || '') + `\n\nUnsubscribe from optional emails: ${url}\n`,
  };
}

module.exports = { marketingFooterAppend, escapeHtml };
