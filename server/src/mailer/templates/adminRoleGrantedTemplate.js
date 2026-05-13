'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAdminPanelUrl(adminPanelUrl) {
  const explicit = String(adminPanelUrl || '').trim();
  if (explicit) return explicit;
  const fromEnv = String(process.env.MAIL_ADMIN_PANEL_URL || process.env.PUBLIC_ADMIN_URL || '').trim();
  if (fromEnv) return fromEnv;
  const base = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (base) return `${base}/admin`;
  return '';
}

/**
 * @param {object} opts
 * @param {string} opts.displayName
 * @param {string} opts.brandName
 * @param {string} [opts.adminPanelUrl] — optional override; else env MAIL_ADMIN_PANEL_URL / PUBLIC_BASE_URL + /admin
 * @param {string} [opts.supportEmail]
 * @param {'admin_only'|'admin_and_super'|'super_only'} opts.variant
 */
function buildAdminRoleGrantedEmail({ displayName, brandName, adminPanelUrl, supportEmail, variant }) {
  const plainName = String(displayName || 'there').trim() || 'there';
  const safeName = escapeHtml(plainName);
  const safeBrand = escapeHtml(String(brandName || 'Our app').trim() || 'Our app');
  const panelUrl = resolveAdminPanelUrl(adminPanelUrl);
  const safePanelUrl = escapeHtml(panelUrl);
  const support = String(supportEmail || '').trim();
  const safeSupport = escapeHtml(support);

  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const brandInitial = String(brandName || 'M')
    .trim()
    .charAt(0)
    .toUpperCase();
  const logoMarkup = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeBrand} logo" width="56" height="56" style="display:inline-block;width:56px;height:56px;border-radius:16px;border:1px solid rgba(255,255,255,0.35);object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,0.2);" />`
    : `<span style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:16px;background:rgba(255,255,255,0.18);color:#ffffff;font-size:24px;font-weight:800;text-align:center;border:1px solid rgba(255,255,255,0.35);">${escapeHtml(
        brandInitial || 'M',
      )}</span>`;

  let headline = 'You have a new role';
  let subline = 'Your account now includes trusted admin access.';
  let detailBullets = [
    'Curate content, review submissions, and keep the learning experience high quality.',
    'Help learners stay on track with fair, thoughtful moderation.',
    'Use your powers carefully — small actions here affect many students.',
  ];
  let textIntro =
    'Congratulations — your account has been granted admin access on ' +
    String(brandName || 'the platform').trim() +
    '.';

  if (variant === 'admin_and_super') {
    headline = 'Welcome to the inner circle';
    subline = 'You now have Admin and Super Admin access — thank you for the deep trust.';
    detailBullets = [
      'You can manage critical settings, user roles, and platform safety.',
      'Super Admin tools are powerful: double-check before confirming sensitive actions.',
      'Your leadership helps the whole community prepare with confidence.',
    ];
    textIntro =
      'Congratulations — you have been granted both Admin and Super Admin access on ' +
      String(brandName || 'the platform').trim() +
      '.';
  } else if (variant === 'super_only') {
    headline = 'You have been promoted';
    subline = 'Super Admin access is now on your account — elevated responsibility, same great mission.';
    detailBullets = [
      'You can now approve sensitive changes and guide other admins.',
      'Please review audit trails and security practices regularly.',
      'Reach out to fellow admins when in doubt — clarity beats speed.',
    ];
    textIntro =
      'Great news — your account has been upgraded to Super Admin on ' +
      String(brandName || 'the platform').trim() +
      '.';
  }

  const ctaBlock = panelUrl
    ? `\nOpen the admin panel: ${panelUrl}\n`
    : '\nUse the admin website URL shared by your team to sign in.\n';

  const textBody =
    `${textIntro}\n\n` +
    `${headline}\n${subline}\n` +
    ctaBlock +
    (support ? `\nQuestions? Write to us at ${support}.\n` : '\n') +
    '\n' +
    'Security tips:\n' +
    '- Use a unique, strong password for this account.\n' +
    '- Never share OTPs or admin links in chat or screenshots.\n' +
    '- Sign out when using a shared device.\n\n' +
    `— The ${String(brandName || 'team').trim()} team`;

  const ctaHtml = panelUrl
    ? `<div style="text-align:center;margin:22px 0 8px 0;">
        <a href="${safePanelUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 55%,#8b5cf6 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;border-radius:999px;padding:14px 32px;box-shadow:0 10px 28px rgba(79,70,229,0.35);">
          Open admin panel
        </a>
        <p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:#64748b;">
          If the button does not work, copy this link into your browser:<br/>
          <span style="color:#4338ca;word-break:break-all;">${safePanelUrl}</span>
        </p>
      </div>`
    : `<p style="margin:18px 0;font-size:15px;line-height:1.6;color:#475569;text-align:center;">
        Ask your team lead for the <strong>admin website URL</strong>, then sign in with this email address.
      </p>`;

  const bulletsHtml = detailBullets
    .map(
      (line, i) => `
      <tr>
        <td style="vertical-align:top;width:36px;padding:0 0 12px 0;">
          <span style="display:inline-block;width:26px;height:26px;line-height:26px;border-radius:999px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);color:#4338ca;font-size:13px;font-weight:800;text-align:center;">${i + 1}</span>
        </td>
        <td style="padding:0 0 12px 0;font-size:15px;line-height:1.55;color:#334155;">${escapeHtml(line)}</td>
      </tr>`,
    )
    .join('');

  const footerLine = support
    ? `Questions or need a walkthrough? We are one email away: <a href="mailto:${safeSupport}" style="color:#4f46e5;text-decoration:none;">${safeSupport}</a>.`
    : 'If you were not expecting this email, contact your organisation immediately.';

  const html = `
    <div style="margin:0;padding:0;background:#eef2ff;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:linear-gradient(180deg,#eef2ff 0%,#f8fafc 55%,#f1f5f9 100%);">
        <tr>
          <td align="center" style="padding:28px 14px 36px 14px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:100%;max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 22px 50px rgba(15,23,42,0.08);">
              <tr>
                <td style="padding:0;background:linear-gradient(135deg,#312e81 0%,#4c1d95 42%,#6d28d9 100%);">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="padding:28px 26px 26px 26px;text-align:center;">
                        ${logoMarkup}
                        <p style="margin:18px 0 6px 0;font-size:11px;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.78);font-weight:600;">Trusted role · ${safeBrand}</p>
                        <h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(headline)}</h1>
                        <p style="margin:12px auto 0 auto;max-width:480px;font-size:16px;line-height:1.55;color:rgba(255,255,255,0.92);">${escapeHtml(subline)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:26px 26px 8px 26px;">
                  <p style="margin:0 0 16px 0;font-size:18px;line-height:1.55;color:#0f172a;">Hi ${safeName},</p>
                  <p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#334155;">
                    This is a little note to celebrate the confidence placed in you — and to make sure you feel supported from day one.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:linear-gradient(135deg,#faf5ff 0%,#f5f3ff 100%);border:1px solid #ede9fe;border-radius:16px;">
                    <tr>
                      <td style="padding:18px 18px 8px 18px;">
                        <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#5b21b6;">What this means for you</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bulletsHtml}</table>
                      </td>
                    </tr>
                  </table>
                  ${ctaHtml}
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 0 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
                    <tr>
                      <td style="padding:16px 18px;">
                        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.06em;">Stay safe</p>
                        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Use a strong unique password, keep OTPs private, and sign out on shared devices. Your calm habits keep thousands of learners secure.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 22px 22px 22px;">
                  <p style="margin:0;font-size:14px;line-height:1.65;color:#64748b;text-align:center;">${footerLine}</p>
                  <p style="margin:16px 0 0 0;font-size:13px;line-height:1.5;color:#94a3b8;text-align:center;">With respect,<br/><strong style="color:#475569;">${safeBrand}</strong></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { text: textBody, html };
}

module.exports = { buildAdminRoleGrantedEmail, resolveAdminPanelUrl };
