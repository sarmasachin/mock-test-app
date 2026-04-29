'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSecurityAlertEmail({ displayName, eventType, eventDetail, supportEmail }) {
  const safeName = escapeHtml(String(displayName || 'User').trim() || 'User');
  const footerContactText = supportEmail
    ? `If this wasn't you, reset your password now and contact ${escapeHtml(supportEmail)}.`
    : "If this wasn't you, reset your password immediately.";

  return {
    text:
      `Hey, ${String(displayName || 'User').trim() || 'User'}\n\n` +
      `${eventType}\n\n` +
      `${eventDetail}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#fef2f2;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #fecaca;border-radius:16px;overflow:hidden">
          <div style="padding:22px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff">
            <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Security Alert</p>
            <h2 style="margin:8px 0 0 0">${escapeHtml(eventType)}</h2>
          </div>
          <div style="padding:20px">
            <p style="margin:0 0 10px 0;color:#111827;font-weight:600;">Hey, ${safeName}</p>
            <p style="margin:0 0 12px 0">${escapeHtml(eventDetail)}</p>
            <p style="margin:0;color:#7f1d1d;font-size:13px">${footerContactText}</p>
          </div>
        </div>
      </div>
    `,
  };
}

module.exports = { buildSecurityAlertEmail };
