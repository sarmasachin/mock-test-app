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

function buildWeeklyPerformanceReportEmail({ displayName, brandName, attempts, avgPercent, weakTopic, ctaLink, supportEmail }) {
  const safeName = escapeHtml(displayName || 'Learner');
  const safeBrand = escapeHtml(brandName || 'MockTestApp');
  const safeTopic = escapeHtml(weakTopic || 'General Practice');
  const safeCtaLink = escapeHtml(ctaLink || 'https://play.google.com/store');
  const safeAttempts = toSafeInt(attempts, 0);
  const safeAvgPercent = toSafeInt(avgPercent, 0);
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is available for you.';

  return {
    text:
      `Hey, ${displayName || 'Learner'}\n\n` +
      `Here is your weekly performance snapshot.\n\n` +
      `Attempts: ${safeAttempts}\n` +
      `Average Score: ${safeAvgPercent}%\n` +
      `Focus Topic: ${weakTopic || 'General Practice'}\n\n` +
      `Open app for full insights: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#0f766e 0%,#0ea5e9 45%,#2563eb 100%);padding:26px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#d1fae5;letter-spacing:0.08em;text-transform:uppercase;">Weekly Performance Report</p>
            <p style="margin:0;font-size:32px;line-height:1.15;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:24px 22px 20px 22px;">
            <p style="margin:0 0 12px 0;font-size:18px;line-height:1.55;color:#1f2937;">
              Great effort this week. Here is your progress snapshot to keep your preparation sharp.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;table-layout:fixed;">
              <tr>
                <td style="vertical-align:top;padding:6px;">
                  <div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:12px;padding:14px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#0369a1;font-weight:700;">Attempts</p>
                    <p style="margin:8px 0 0 0;font-size:28px;line-height:1.2;font-weight:800;color:#0c4a6e;">${safeAttempts}</p>
                  </div>
                </td>
                <td style="vertical-align:top;padding:6px;">
                  <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;padding:14px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#1d4ed8;font-weight:700;">Average Score</p>
                    <p style="margin:8px 0 0 0;font-size:28px;line-height:1.2;font-weight:800;color:#1e3a8a;">${safeAvgPercent}%</p>
                  </div>
                </td>
              </tr>
            </table>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#334155;font-weight:700;">Recommended focus for next week</p>
              <p style="margin:0;font-size:16px;line-height:1.5;"><strong>${safeTopic}</strong></p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${safeCtaLink}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 28px;">
                View Full Weekly Report
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
              Keep building momentum. Team <strong>${safeBrand}</strong> is proud of your progress.
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

module.exports = { buildWeeklyPerformanceReportEmail };
