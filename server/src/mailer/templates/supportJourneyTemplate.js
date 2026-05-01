'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function prettifyType(rawSubject) {
  const source = String(rawSubject || '').trim().toLowerCase();
  if (source.includes('feedback')) return 'Feedback';
  if (source.includes('issue')) return 'Report Issue';
  if (source.includes('help') || source.includes('support')) return 'Help & Support';
  return 'Support Update';
}

function buildSupportJourneyEmail({
  displayName,
  subject,
  statusMessage,
  userMessage,
  supportEmail,
  brandName,
}) {
  const safeBrandName = escapeHtml(String(brandName || 'MockTest').trim() || 'MockTest');
  const safeName = escapeHtml(String(displayName || 'User').trim() || 'User');
  const safeSubject = escapeHtml(String(subject || 'Support Update').trim() || 'Support Update');
  const safeStatusMessage = escapeHtml(String(statusMessage || 'We have received your request.').trim());
  const safeUserMessage = escapeHtml(String(userMessage || '').trim());
  const safeType = escapeHtml(prettifyType(subject));
  const safeSupportEmail = escapeHtml(String(supportEmail || '').trim());
  const footerHelpText = safeSupportEmail
    ? `Need help? Contact us at ${safeSupportEmail}.`
    : 'Need help? Our support team is ready to assist you.';

  const plainStatusMessage = String(statusMessage || 'We have received your request.').trim();
  const plainUserMessage = String(userMessage || '').trim();

  return {
    text:
      `${safeType} - ${String(subject || 'Support Update').trim()}\n\n` +
      `Hi ${String(displayName || 'User').trim() || 'User'},\n\n` +
      `${plainStatusMessage}\n\n` +
      (plainUserMessage ? `User Message: ${plainUserMessage}\n\n` : '') +
      `${safeSupportEmail ? `Support: ${String(supportEmail || '').trim()}\n\n` : ''}` +
      'Thank you for reaching out.',
    html: `
      <div style="margin:0;padding:0;background:#f4f7fb;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f7fb;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #d9e2ef;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:20px 24px;color:#ffffff;">
                    <p style="margin:0;font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">${safeBrandName}</p>
                    <h1 style="margin:8px 0 0 0;font-size:23px;line-height:1.3;font-weight:700;">${safeSubject}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 14px 0;color:#0f172a;font-size:16px;line-height:1.5;">Hi ${safeName},</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
                      <tr>
                        <td style="display:inline-block;padding:6px 10px;border-radius:999px;background:#dbeafe;color:#1e3a8a;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${safeType}</td>
                      </tr>
                    </table>
                    <p style="margin:0 0 14px 0;color:#334155;font-size:15px;line-height:1.7;">${safeStatusMessage}</p>
                    ${
                      safeUserMessage
                        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #dbe2ea;border-radius:12px;">
                            <tr>
                              <td style="padding:14px 16px;">
                                <p style="margin:0 0 8px 0;color:#0f172a;font-size:13px;line-height:1.5;"><strong>User Message:</strong></p>
                                <p style="margin:0;color:#1e293b;font-size:14px;line-height:1.7;">${safeUserMessage}</p>
                              </td>
                            </tr>
                          </table>`
                        : ''
                    }
                    <p style="margin:14px 0 0 0;color:#64748b;font-size:13px;line-height:1.6;">${footerHelpText}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                    <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">
                      This is an automated update from ${safeBrandName} support.
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

module.exports = { buildSupportJourneyEmail };
