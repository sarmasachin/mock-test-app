'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAdminLoginSecurityEmail({
  displayName,
  eventType,
  eventDetail,
  supportEmail,
  accountActionUrl,
  brandName,
}) {
  const plainName = String(displayName || 'User').trim() || 'User';
  const safeName = escapeHtml(plainName);
  const safeEventType = escapeHtml(String(eventType || 'Account activity'));
  const safeEventDetail = escapeHtml(String(eventDetail || 'A sign-in event was detected on your account.'));
  const safeBrandName = escapeHtml(String(brandName || 'MockTest').trim() || 'MockTest');
  const safeSupportEmail = escapeHtml(String(supportEmail || '').trim());
  const safeAccountActionUrl = escapeHtml(String(accountActionUrl || '').trim());
  const actionLabel = safeAccountActionUrl ? 'Review account security' : 'Reset password immediately';
  const actionHref = safeAccountActionUrl || 'https://support.google.com/accounts/answer/41078';
  const footerContactText = safeSupportEmail
    ? `If this was not you, reset your password now and contact us at ${safeSupportEmail}.`
    : "If this was not you, reset your password now and review your account security settings.";

  return {
    text:
      `Security Alert - ${String(eventType || 'Account activity')}\n\n` +
      `Hello ${plainName},\n\n` +
      `We detected a security-related account event.\n\n` +
      `Event: ${String(eventType || 'Account activity')}\n` +
      `Details: ${String(eventDetail || 'A sign-in event was detected on your account.')}\n\n` +
      `${safeSupportEmail ? `Support: ${String(supportEmail).trim()}\n` : ''}` +
      `${actionLabel}: ${actionHref}\n\n` +
      'If this was you, no action is needed.',
    html: `
      <div style="margin:0;padding:0;background:#f3f6fb;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f6fb;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #d7dfeb;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:0;background:linear-gradient(135deg,#0f172a,#1e293b);">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding:20px 24px;color:#ffffff;">
                          <p style="margin:0;font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">${safeBrandName}</p>
                          <h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.3;font-weight:700;">Security Alert</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 12px 0;color:#0f172a;font-size:16px;line-height:1.5;">Hi ${safeName},</p>
                    <p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.6;">
                      We detected a security-related activity in your account. Please review the details below.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0 0 6px 0;font-size:12px;line-height:1.4;color:#9a3412;text-transform:uppercase;letter-spacing:0.08em;">Event</p>
                          <p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;color:#7c2d12;font-weight:700;">${safeEventType}</p>
                          <p style="margin:0 0 6px 0;font-size:12px;line-height:1.4;color:#9a3412;text-transform:uppercase;letter-spacing:0.08em;">Details</p>
                          <p style="margin:0;font-size:14px;line-height:1.6;color:#431407;">${safeEventDetail}</p>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
                      <tr>
                        <td align="center" bgcolor="#0f172a" style="border-radius:10px;">
                          <a href="${actionHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;font-size:14px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;">${actionLabel}</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:16px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
                      If this was you, no action is required.
                    </p>
                    <p style="margin:8px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
                      ${footerContactText}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                    <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">
                      This is an automated security notification from ${safeBrandName}.
                    </p>
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

module.exports = { buildAdminLoginSecurityEmail };
