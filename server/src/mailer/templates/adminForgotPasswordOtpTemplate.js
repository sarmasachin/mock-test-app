'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAdminForgotPasswordOtpEmail({ displayName, otp, supportEmail, brandName, minutes }) {
  const safeName = escapeHtml(String(displayName || 'Admin').trim() || 'Admin');
  const safeOtp = escapeHtml(String(otp || '').trim());
  const safeBrandName = escapeHtml(String(brandName || 'MockTest').trim() || 'MockTest');
  const safeSupportEmail = escapeHtml(String(supportEmail || '').trim());
  const ttlMinutes = Number.isFinite(Number(minutes)) ? Math.max(1, Number(minutes)) : 15;
  const footerText = safeSupportEmail
    ? `Need help? Contact ${safeSupportEmail}.`
    : 'Need help? Contact support.';

  return {
    text:
      `${safeBrandName} Admin Password Reset\n\n` +
      `Hello ${String(displayName || 'Admin').trim() || 'Admin'},\n\n` +
      `Your admin password reset OTP is: ${String(otp || '').trim()}\n` +
      `This OTP is valid for ${ttlMinutes} minutes.\n\n` +
      `If you did not request this, secure your account immediately.`,
    html: `
      <div style="margin:0;padding:0;background:#f4f6fb;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f6fb;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #d9e2ef;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;background:linear-gradient(135deg,#111827,#1d4ed8);color:#ffffff;">
                    <p style="margin:0;font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">${safeBrandName}</p>
                    <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;">Admin Password Reset</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 10px 0;color:#0f172a;font-size:16px;line-height:1.5;">Hello ${safeName},</p>
                    <p style="margin:0 0 14px 0;color:#334155;font-size:14px;line-height:1.7;">
                      We received a request to reset your admin panel password. Use the OTP below to continue.
                    </p>
                    <div style="margin:0 0 14px 0;padding:14px 16px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;">
                      <p style="margin:0 0 8px 0;color:#1e3a8a;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">One-time Password</p>
                      <p style="margin:0;color:#1e40af;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:0.16em;">${safeOtp}</p>
                    </div>
                    <p style="margin:0 0 8px 0;color:#475569;font-size:13px;line-height:1.6;">This OTP is valid for <strong>${ttlMinutes} minutes</strong>.</p>
                    <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">If you did not request this, secure your account immediately.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                    <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">${footerText}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  };
}

module.exports = { buildAdminForgotPasswordOtpEmail };
