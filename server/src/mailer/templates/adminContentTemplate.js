'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAdminContentAlertEmail({ displayName, kind, title, message, ctaUrl, ctaLabel, supportEmail }) {
  const safeName = escapeHtml(String(displayName || 'Learner').trim() || 'Learner');
  const paletteByKind = {
    job: { heroA: '#0ea5e9', heroB: '#2563eb', badge: 'Job Alert' },
    exam: { heroA: '#7c3aed', heroB: '#2563eb', badge: 'Exam Alert' },
    mocktest: { heroA: '#0f766e', heroB: '#14b8a6', badge: 'Mock Test' },
  };
  const selected = paletteByKind[String(kind || '').trim().toLowerCase()] || paletteByKind.exam;
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is always with you.';

  return {
    text:
      `Hey, ${String(displayName || 'Learner').trim() || 'Learner'}\n\n` +
      `${selected.badge}: ${String(title || '').trim()}\n` +
      `${String(message || '').trim()}\n\n` +
      `${String(ctaLabel || 'Open App').trim()}: ${String(ctaUrl || '').trim()}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,${selected.heroA} 0%,${selected.heroB} 100%);padding:22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#ecfeff;letter-spacing:0.08em;text-transform:uppercase;">${selected.badge}</p>
            <p style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 10px 0;font-size:22px;line-height:1.3;font-weight:700;color:#111827;">${escapeHtml(title)}</p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#374151;">${escapeHtml(message)}</p>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,${selected.heroA},${selected.heroB});color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                ${escapeHtml(ctaLabel)}
              </a>
            </div>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${footerContactText}</p>
          </div>
        </div>
      </div>
    `,
  };
}

module.exports = { buildAdminContentAlertEmail };
