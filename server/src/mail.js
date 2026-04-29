'use strict';

const nodemailer = require('nodemailer');

function isMailConfigured() {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.MAIL_FROM || '').trim();
  return Boolean(user && pass && from);
}

function resolveFromAddress() {
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const configuredFrom = String(process.env.MAIL_FROM || '').trim();
  // Inbox placement is better when From is authenticated with SMTP account.
  if (!configuredFrom) return smtpUser;
  return configuredFrom;
}

function resolveReplyToAddress() {
  return String(process.env.MAIL_SUPPORT_EMAIL || process.env.SMTP_USER || '').trim();
}

function createTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const connectionTimeout = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10);
  const greetingTimeout = parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '10000', 10);
  const socketTimeout = parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '15000', 10);
  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends a 6-digit OTP for password reset (Gmail: use an App Password with 2FA on the Google account).
 * @param {{ to: string, otp: string }} opts
 */
async function sendPasswordResetOtp(opts) {
  const to = String(opts.to || '').trim();
  const otp = String(opts.otp || '').trim();
  if (!to || !otp) throw new Error('sendPasswordResetOtp: missing to or otp');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const brandInitial = (brandName.trim().charAt(0) || 'M').toUpperCase();
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const logoMarkup = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName} logo" width="44" height="44" style="display:inline-block;width:44px;height:44px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`
    : `<span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:999px;background:#24292f;color:#ffffff;font-size:20px;font-weight:700;text-align:center;">${brandInitial}</span>`;
  const otpPretty = otp.split('').join(' ');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Please contact support.';
  const subject = process.env.MAIL_SUBJECT_RESET || 'Your password reset code';
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject,
    text:
      `Password reset request.\n\n` +
      `Your verification code is: ${otp}\n\n` +
      `This code is valid for 15 minutes and can only be used once.\n\n` +
      `If you did not request this reset, you can safely ignore this email.\n\n` +
      `Please do not share this code with anyone.\n\n` +
      footerContactText,
    html: `
      <div style="background:#f6f8fa;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:12px;padding:28px;">
          <div style="text-align:center;margin:0 0 14px 0;">
            ${logoMarkup}
          </div>
          <p style="margin:0 0 6px 0;font-size:34px;line-height:1.2;font-weight:700;text-align:center;">Password reset code</p>
          <p style="margin:0 0 20px 0;font-size:18px;line-height:1.5;color:#57606a;text-align:center;">Use this code to reset your password.</p>
          <div style="border:1px solid #d0d7de;border-radius:10px;padding:22px 20px;margin:0 0 16px 0;text-align:center;">
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">Your password reset code:</p>
            <p style="margin:0 0 16px 0;text-align:center;">
              <span style="display:inline-block;max-width:100%;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.08em;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">
                ${otpPretty}
              </span>
            </p>
            <p style="margin:0 0 10px 0;font-size:16px;line-height:1.5;">This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
            <p style="margin:0 0 10px 0;font-size:16px;line-height:1.5;">If you did not request this reset, you can safely ignore this email.</p>
            <p style="margin:0;font-size:16px;line-height:1.5;"><strong>Please do not share this code with anyone.</strong></p>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            You're receiving this email because a password reset was requested for your ${brandName} account.
            If this wasn't you, no further action is needed.
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            ${footerContactText}
          </p>
        </div>
      </div>
    `,
  });
}

/**
 * Sends a 6-digit OTP for email verification.
 * @param {{ to: string, otp: string }} opts
 */
async function sendEmailVerificationOtp(opts) {
  const to = String(opts.to || '').trim();
  const otp = String(opts.otp || '').trim();
  if (!to || !otp) throw new Error('sendEmailVerificationOtp: missing to or otp');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const brandInitial = (brandName.trim().charAt(0) || 'M').toUpperCase();
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const logoMarkup = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName} logo" width="44" height="44" style="display:inline-block;width:44px;height:44px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`
    : `<span style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:999px;background:#24292f;color:#ffffff;font-size:20px;font-weight:700;text-align:center;">${brandInitial}</span>`;
  const otpPretty = otp.split('').join(' ');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Please contact support.';
  const subject = process.env.MAIL_SUBJECT_EMAIL_VERIFY || 'Your email verification code';
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject,
    text:
      `Email verification request.\n\n` +
      `Your verification code is: ${otp}\n\n` +
      `This code is valid for 15 minutes and can only be used once.\n\n` +
      `Please do not share this code with anyone.\n\n` +
      footerContactText,
    html: `
      <div style="background:#f6f8fa;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#24292f;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:12px;padding:28px;">
          <div style="text-align:center;margin:0 0 14px 0;">
            ${logoMarkup}
          </div>
          <p style="margin:0 0 6px 0;font-size:34px;line-height:1.2;font-weight:700;text-align:center;">Email verification code</p>
          <p style="margin:0 0 20px 0;font-size:18px;line-height:1.5;color:#57606a;text-align:center;">Use this code to verify your email.</p>
          <div style="border:1px solid #d0d7de;border-radius:10px;padding:22px 20px;margin:0 0 16px 0;text-align:center;">
            <p style="margin:0 0 10px 0;font-size:18px;line-height:1.5;">Your email verification code:</p>
            <p style="margin:0 0 16px 0;text-align:center;">
              <span style="display:inline-block;max-width:100%;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.08em;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">
                ${otpPretty}
              </span>
            </p>
            <p style="margin:0 0 10px 0;font-size:16px;line-height:1.5;">This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
            <p style="margin:0;font-size:16px;line-height:1.5;"><strong>Please do not share this code with anyone.</strong></p>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            You're receiving this email because a verification code was requested for your ${brandName} account.
            If this wasn't you, please ignore this email.
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#57606a;text-align:center;">
            ${footerContactText}
          </p>
        </div>
      </div>
    `,
  });
}

/**
 * Sends premium welcome email right after signup.
 * @param {{ to: string, displayName: string }} opts
 */
async function sendWelcomeEmail(opts) {
  const to = String(opts.to || '').trim();
  const displayName = String(opts.displayName || '').trim();
  if (!to) throw new Error('sendWelcomeEmail: missing to');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const safeName = escapeHtml(displayName || 'Learner');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const appUrl = String(process.env.MAIL_APP_URL || '').trim();
  const ctaLink = appUrl || 'https://play.google.com/store';
  const ctaLabel = appUrl ? 'Open Dashboard' : 'Start Your First Test';
  const subject = process.env.MAIL_SUBJECT_WELCOME || `Welcome to ${brandName}`;
  const logoUrl = String(process.env.MAIL_LOGO_URL || '').trim();
  const brandInitial = (brandName.trim().charAt(0) || 'M').toUpperCase();
  const logoMarkup = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName} logo" width="52" height="52" style="display:inline-block;width:52px;height:52px;border-radius:999px;border:1px solid #d0d7de;object-fit:cover;" />`
    : `<span style="display:inline-block;width:52px;height:52px;line-height:52px;border-radius:999px;background:#111827;color:#ffffff;font-size:22px;font-weight:700;text-align:center;">${brandInitial}</span>`;
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Our support team is always with you.';

  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject,
    text:
      `Hello ${displayName || 'Learner'}, welcome to ${brandName}.\n\n` +
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
            <p style="margin:0;font-size:33px;line-height:1.15;font-weight:800;color:#ffffff;">Hello, ${safeName}</p>
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
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${escapeHtml(footerContactText)}</p>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * Sends premium reminder email to complete profile.
 * @param {{ to: string, displayName: string }} opts
 */
async function sendCompleteProfileReminderEmail(opts) {
  const to = String(opts.to || '').trim();
  const displayName = String(opts.displayName || '').trim();
  if (!to) throw new Error('sendCompleteProfileReminderEmail: missing to');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const safeName = escapeHtml(displayName || 'Learner');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const appUrl = String(process.env.MAIL_APP_URL || '').trim();
  const profileDeepLink = String(process.env.MAIL_COMPLETE_PROFILE_DEEP_LINK || 'mocktestapp://complete-profile').trim();
  const ctaLink = profileDeepLink || appUrl || 'https://play.google.com/store';
  const fallbackLink = appUrl || 'https://play.google.com/store';
  const subject = process.env.MAIL_SUBJECT_PROFILE_REMINDER || `Complete your profile on ${brandName}`;
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Our support team is always with you.';

  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject,
    text:
      `Hello ${displayName || 'Learner'},\n\n` +
      `Complete your profile to unlock a better ${brandName} experience.\n\n` +
      `Benefits:\n` +
      `- Personalized test recommendations\n` +
      `- Better progress insights\n` +
      `- Relevant exam and job alerts\n\n` +
      `Complete profile now: ${ctaLink}\n` +
      `If the button doesn't open the app, use this link: ${fallbackLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#0f766e 0%,#0ea5e9 100%);padding:24px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:15px;line-height:1.4;color:#e6fffb;letter-spacing:0.08em;text-transform:uppercase;">Profile Reminder</p>
            <p style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;">Hi ${safeName}, almost done</p>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 14px 0;font-size:17px;line-height:1.55;color:#1f2937;">
              Complete your profile once to unlock a fully personalized experience in <strong>${escapeHtml(brandName)}</strong>.
            </p>
            <div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:14px;padding:12px 14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:15px;">- Get smarter test recommendations</p>
              <p style="margin:0 0 8px 0;font-size:15px;">- See more accurate progress and insights</p>
              <p style="margin:0;font-size:15px;">- Receive better exam/job update relevance</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${escapeHtml(ctaLink)}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                Complete Profile
              </a>
            </div>
            <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">
              If the button does not open the app, open this link in your phone browser:
            </p>
            <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;text-align:center;">
              <a href="${escapeHtml(fallbackLink)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(fallbackLink)}</a>
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">
              It takes less than a minute and helps us serve you better.
            </p>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${escapeHtml(footerContactText)}</p>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * Sends a premium content alert email for admin-published content.
 * @param {{ to: string, displayName: string, kind: 'job'|'exam'|'mocktest', title: string, message: string, ctaUrl?: string, ctaLabel?: string }} opts
 */
async function sendAdminContentAlertEmail(opts) {
  const to = String(opts.to || '').trim();
  const displayName = String(opts.displayName || '').trim();
  const kind = String(opts.kind || '').trim().toLowerCase();
  const title = String(opts.title || '').trim();
  const message = String(opts.message || '').trim();
  if (!to || !title || !message) throw new Error('sendAdminContentAlertEmail: missing required fields');
  if (!['job', 'exam', 'mocktest'].includes(kind)) throw new Error('sendAdminContentAlertEmail: invalid kind');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const safeName = escapeHtml(displayName || 'Learner');
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const ctaUrl = String(opts.ctaUrl || appUrl).trim() || appUrl;
  const ctaLabel = String(opts.ctaLabel || '').trim() || 'Open App';
  const titleSafe = escapeHtml(title);
  const messageSafe = escapeHtml(message);
  const paletteByKind = {
    job: { heroA: '#0ea5e9', heroB: '#2563eb', badge: 'Job Alert', emoji: 'Briefcase' },
    exam: { heroA: '#7c3aed', heroB: '#2563eb', badge: 'Exam Alert', emoji: 'Target' },
    mocktest: { heroA: '#0f766e', heroB: '#14b8a6', badge: 'Mock Test', emoji: 'Trophy' },
  };
  const palette = paletteByKind[kind];
  const subjectPrefix = palette.badge;
  const subject = `${subjectPrefix}: ${title}`.slice(0, 170);
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Our support team is always with you.';

  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject,
    text:
      `Hello ${displayName || 'Learner'},\n\n` +
      `${palette.badge}: ${title}\n` +
      `${message}\n\n` +
      `${ctaLabel}: ${ctaUrl}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,${palette.heroA} 0%,${palette.heroB} 100%);padding:22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#ecfeff;letter-spacing:0.08em;text-transform:uppercase;">${palette.badge}</p>
            <p style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;">Hello, ${safeName}</p>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 10px 0;font-size:22px;line-height:1.3;font-weight:700;color:#111827;">${titleSafe}</p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#374151;">${messageSafe}</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin:0 0 18px 0;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">
                ${palette.emoji} We picked this update for you to help you prepare better.
              </p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,${palette.heroA},${palette.heroB});color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                ${escapeHtml(ctaLabel)}
              </a>
            </div>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${escapeHtml(footerContactText)}</p>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * Sends premium unlocked-result email card with rank.
 * @param {{ to: string, displayName: string, testTitle: string, correct: number, total: number, rank: number, participants: number, unlockAtIso: string }} opts
 */
async function sendResultUnlockedEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendResultUnlockedEmail: missing to');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const displayName = String(opts.displayName || '').trim();
  const testTitle = String(opts.testTitle || 'Mock Test').trim();
  const correct = Math.max(0, Number(opts.correct || 0));
  const total = Math.max(1, Number(opts.total || 1));
  const rank = Math.max(1, Number(opts.rank || 1));
  const participants = Math.max(rank, Number(opts.participants || rank));
  const unlockAtIso = String(opts.unlockAtIso || '').trim();
  const scorePercent = Math.round((correct / total) * 100);
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Our support team is always with you.';
  const subject = `Result Unlocked: ${testTitle}`.slice(0, 170);
  const safeName = escapeHtml(displayName || 'Learner');
  const safeTestTitle = escapeHtml(testTitle);
  const safeUnlock = escapeHtml(unlockAtIso || new Date().toISOString());

  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject,
    text:
      `Hello ${displayName || 'Learner'}, your result is unlocked.\n\n` +
      `Test: ${testTitle}\n` +
      `Score: ${correct}/${total} (${scorePercent}%)\n` +
      `Rank: #${rank} out of ${participants}\n` +
      `Unlocked at: ${unlockAtIso}\n\n` +
      `Open app: ${appUrl}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7c3aed 0%,#2563eb 55%,#0ea5e9 100%);padding:24px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#ede9fe;letter-spacing:0.08em;text-transform:uppercase;">Result Unlocked</p>
            <p style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;">Hi ${safeName}, great effort</p>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 8px 0;font-size:21px;line-height:1.3;font-weight:700;color:#111827;">${safeTestTitle}</p>
            <p style="margin:0 0 14px 0;font-size:14px;color:#64748b;">Unlocked at ${safeUnlock}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px 0;border-collapse:separate;border-spacing:0;">
              <tr>
                <td style="width:50%;padding:0 5px 0 0;vertical-align:top;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;">
                    <p style="margin:0 0 4px 0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Score</p>
                    <p style="margin:0;font-size:24px;font-weight:800;color:#0f172a;">${correct}/${total}</p>
                    <p style="margin:4px 0 0 0;font-size:12px;color:#475569;">${scorePercent}% accuracy</p>
                  </div>
                </td>
                <td style="width:50%;padding:0 0 0 5px;vertical-align:top;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;">
                    <p style="margin:0 0 4px 0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Rank</p>
                    <p style="margin:0;font-size:24px;font-weight:800;color:#0f172a;">#${rank}</p>
                    <p style="margin:4px 0 0 0;font-size:12px;color:#475569;">out of ${participants} participants</p>
                  </div>
                </td>
              </tr>
            </table>
            <div style="text-align:center;margin-top:6px;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                View Detailed Result
              </a>
            </div>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${escapeHtml(footerContactText)}</p>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * Sends premium reminder email one hour before mock test starts.
 * @param {{ to: string, displayName: string, testTitle: string, examDate: string, slotLabel: string, startAtIso?: string }} opts
 */
async function sendMockTestStartingSoonEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendMockTestStartingSoonEmail: missing to');
  if (!isMailConfigured()) {
    throw new Error('SMTP not configured (set SMTP_USER, SMTP_PASS, MAIL_FROM)');
  }
  const transporter = createTransport();
  const displayName = String(opts.displayName || '').trim();
  const testTitle = String(opts.testTitle || 'Mock Test').trim();
  const examDate = String(opts.examDate || '').trim();
  const slotLabel = String(opts.slotLabel || '').trim();
  const startAtIso = String(opts.startAtIso || '').trim();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const brandName = process.env.MAIL_BRAND_NAME || 'Free Mock Test App';
  const supportEmail = String(process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM || '').trim();
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${supportEmail}.`
    : 'Need help? Our support team is always with you.';
  const safeName = escapeHtml(displayName || 'Learner');
  const safeTestTitle = escapeHtml(testTitle);
  const safeExamDate = escapeHtml(examDate || '-');
  const safeSlotLabel = escapeHtml(slotLabel || '-');
  const safeStartAt = escapeHtml(startAtIso || '-');
  const subject = `Starts in 1 Hour: ${testTitle}`.slice(0, 170);

  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject,
    text:
      `Hello ${displayName || 'Learner'},\n\n` +
      `Your mock test starts in around 1 hour.\n\n` +
      `Test: ${testTitle}\n` +
      `Date: ${examDate}\n` +
      `Slot: ${slotLabel}\n` +
      `Start time: ${startAtIso}\n\n` +
      `Open app and get ready: ${appUrl}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f5f6ff;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:radial-gradient(circle at top left,#f59e0b 0%,#ef4444 40%,#7c3aed 100%);padding:24px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:13px;line-height:1.4;color:#fff7ed;letter-spacing:0.1em;text-transform:uppercase;">Mock Test Alert</p>
            <p style="margin:0;font-size:31px;line-height:1.2;font-weight:800;color:#ffffff;">Hi ${safeName}, almost time</p>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 10px 0;font-size:21px;line-height:1.3;font-weight:800;color:#111827;">${safeTestTitle}</p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#334155;">
              Your test window is opening in about <strong>1 hour</strong>. Warm up quickly and keep your essentials ready.
            </p>
            <div style="background:linear-gradient(135deg,#fff7ed,#eef2ff);border:1px solid #fde68a;border-radius:14px;padding:14px 14px 10px 14px;margin:0 0 16px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#7c2d12;"><strong>Date:</strong> ${safeExamDate}</p>
              <p style="margin:0 0 8px 0;font-size:14px;color:#7c2d12;"><strong>Slot:</strong> ${safeSlotLabel}</p>
              <p style="margin:0;font-size:13px;color:#6b21a8;"><strong>Start (ISO):</strong> ${safeStartAt}</p>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin:0 0 18px 0;">
              <p style="margin:0 0 6px 0;font-size:14px;color:#334155;">Quick prep checklist</p>
              <p style="margin:0 0 6px 0;font-size:14px;color:#334155;">- Keep stable internet and device battery ready</p>
              <p style="margin:0 0 6px 0;font-size:14px;color:#334155;">- Open app 10 minutes early</p>
              <p style="margin:0;font-size:14px;color:#334155;">- Stay calm, attempt with smart time management</p>
            </div>
            <div style="text-align:center;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:linear-gradient(135deg,#ef4444,#7c3aed);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 28px;">
                Open App & Get Ready
              </a>
            </div>
          </div>
          <div style="border-top:1px solid #e5e7eb;padding:14px 18px;background:#fbfcfe;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">${escapeHtml(footerContactText)}</p>
          </div>
        </div>
      </div>
    `,
  });
}

async function sendMissedTestFollowupEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendMissedTestFollowupEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const name = escapeHtml(String(opts.displayName || 'Learner'));
  const title = escapeHtml(String(opts.testTitle || 'today mock test'));
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `You missed today: ${String(opts.testTitle || 'Mock Test').slice(0, 120)}`,
    text: `Hi ${String(opts.displayName || 'Learner')}, you missed ${String(opts.testTitle || 'today mock test')}. Retry now: ${appUrl}`,
    html: `<div style="background:#fff7ed;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #fed7aa;border-radius:16px;overflow:hidden"><div style="padding:20px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;text-align:center"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Missed Test Follow-up</p><h2 style="margin:8px 0 0 0">Hi ${name}, let's bounce back</h2></div><div style="padding:20px"><p style="margin:0 0 12px 0">Aaj ka test miss ho gaya: <strong>${title}</strong></p><p style="margin:0 0 14px 0">No worries. Abhi retry karke momentum wapas le aao.</p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#ea580c;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">Retry Now</a></div></div></div>`,
  });
}

async function sendStreakRiskAlertEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendStreakRiskAlertEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const days = Math.max(2, Number(opts.inactiveDays || 2));
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `Streak Alert: ${days} days inactive`,
    text: `You have been inactive for ${days} days. Continue your streak: ${appUrl}`,
    html: `<div style="background:#eff6ff;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #bfdbfe;border-radius:16px"><div style="padding:22px;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Streak Risk</p><h2 style="margin:8px 0 0 0">Don't break the streak</h2></div><div style="padding:20px"><p style="margin:0 0 10px 0">Aap ${days} din se inactive ho. Chhota sa session bhi streak bacha sakta hai.</p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">Continue Streak</a></div></div></div>`,
  });
}

async function sendWeeklyPerformanceReportEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendWeeklyPerformanceReportEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const attempts = Math.max(0, Number(opts.attempts || 0));
  const avg = Math.max(0, Math.min(100, Number(opts.avgPercent || 0)));
  const weak = escapeHtml(String(opts.weakTopic || 'General Practice'));
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `Weekly Report: ${attempts} attempts, ${avg}% avg`,
    text: `Weekly report: attempts=${attempts}, avg=${avg}%, weak topic=${String(opts.weakTopic || 'General Practice')}. Open app: ${appUrl}`,
    html: `<div style="background:#f0fdf4;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #bbf7d0;border-radius:16px;overflow:hidden"><div style="padding:22px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;text-align:center"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Weekly Performance</p><h2 style="margin:8px 0 0 0">Your progress snapshot</h2></div><div style="padding:20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0 8px;"><tr><td style="width:33.33%;padding-right:6px;vertical-align:top;"><div style="background:#f7fee7;border:1px solid #d9f99d;border-radius:12px;padding:10px"><small>Attempts</small><h3 style="margin:4px 0">${attempts}</h3></div></td><td style="width:33.33%;padding:0 3px;vertical-align:top;"><div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;padding:10px"><small>Average</small><h3 style="margin:4px 0">${avg}%</h3></div></td><td style="width:33.33%;padding-left:6px;vertical-align:top;"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:10px"><small>Weak Topic</small><h3 style="margin:4px 0;font-size:18px">${weak}</h3></div></td></tr></table><div style="margin-top:14px"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#16a34a;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">Improve This Week</a></div></div></div></div>`,
  });
}

async function sendRankMilestoneEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendRankMilestoneEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const rank = Math.max(1, Number(opts.rank || 1));
  const improvedBy = Math.max(0, Number(opts.improvedBy || 0));
  const reason = escapeHtml(String(opts.reason || 'Rank milestone unlocked'));
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `Rank Milestone: #${rank} (${improvedBy}+ jump)`,
    text: `${String(opts.testTitle || 'Mock Test')}: rank #${rank}, improved by ${improvedBy}. ${reason}. Open app: ${appUrl}`,
    html: `<div style="background:#faf5ff;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e9d5ff;border-radius:16px;overflow:hidden"><div style="padding:22px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-align:center"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Rank Milestone</p><h2 style="margin:8px 0 0 0">Outstanding jump</h2></div><div style="padding:20px"><p style="margin:0 0 8px 0"><strong>${escapeHtml(String(opts.testTitle || 'Mock Test'))}</strong></p><p style="margin:0 0 8px 0">Current Rank: <strong>#${rank}</strong></p><p style="margin:0 0 12px 0">Improvement: <strong>+${improvedBy}</strong> places</p><p style="margin:0 0 14px 0;color:#6b21a8">${reason}</p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">View Leaderboard</a></div></div></div>`,
  });
}

async function sendNewContentByInterestEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendNewContentByInterestEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const badge = escapeHtml(String(opts.interestLabel || 'For your interest'));
  const title = escapeHtml(String(opts.title || 'New update'));
  const message = escapeHtml(String(opts.message || 'New content matching your preparation track is live.'));
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `New for your interest: ${String(opts.title || 'Update').slice(0, 120)}`,
    text: `${String(opts.title || 'Update')}\n${String(opts.message || '')}\nOpen app: ${appUrl}`,
    html: `<div style="background:#ecfeff;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #a5f3fc;border-radius:16px;overflow:hidden"><div style="padding:22px;background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">${badge}</p><h2 style="margin:8px 0 0 0">New content picked for you</h2></div><div style="padding:20px"><h3 style="margin:0 0 8px 0">${title}</h3><p style="margin:0 0 14px 0">${message}</p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#0f766e;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">Open Recommended Content</a></div></div></div>`,
  });
}

async function sendReEngagementEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendReEngagementEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const appUrl = String(process.env.MAIL_APP_URL || 'https://play.google.com/store').trim();
  const days = Math.max(1, Number(opts.inactiveDays || 7));
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `We miss you - ${days} days away`,
    text: `It's been ${days} days. Come back and restart your prep: ${appUrl}`,
    html: `<div style="background:#f8fafc;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden"><div style="padding:22px;background:linear-gradient(135deg,#334155,#0f172a);color:#fff;text-align:center"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Re-engagement</p><h2 style="margin:8px 0 0 0">Your goals are waiting</h2></div><div style="padding:20px"><p style="margin:0 0 12px 0">Aap ${days} din se app se door ho. Sirf 15 min ka session momentum wapas laa sakta hai.</p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#0f172a;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">Resume Preparation</a></div></div></div>`,
  });
}

async function sendSecurityAccountAlertEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendSecurityAccountAlertEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const eventType = escapeHtml(String(opts.eventType || 'account_event'));
  const eventDetail = escapeHtml(String(opts.eventDetail || 'Account activity detected.'));
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `Security Alert: ${String(opts.subject || 'Account activity').slice(0, 120)}`,
    text: `${String(opts.subject || 'Account activity')}\n${String(opts.eventDetail || '')}`,
    html: `<div style="background:#fef2f2;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #fecaca;border-radius:16px;overflow:hidden"><div style="padding:22px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Security Alert</p><h2 style="margin:8px 0 0 0">${eventType}</h2></div><div style="padding:20px"><p style="margin:0 0 12px 0">${eventDetail}</p><p style="margin:0;color:#7f1d1d;font-size:13px">If this was not you, reset password immediately and contact support.</p></div></div></div>`,
  });
}

async function sendSupportJourneyEmail(opts) {
  const to = String(opts.to || '').trim();
  if (!to) throw new Error('sendSupportJourneyEmail: missing to');
  if (!isMailConfigured()) throw new Error('SMTP not configured');
  const transporter = createTransport();
  const status = String(opts.status || 'received').trim().toLowerCase();
  const isResolved = status === 'resolved';
  const title = isResolved ? 'Your support request is resolved' : 'We received your support request';
  const toneA = isResolved ? '#16a34a' : '#0ea5e9';
  const toneB = isResolved ? '#15803d' : '#2563eb';
  await transporter.sendMail({
    from: resolveFromAddress(),
    replyTo: resolveReplyToAddress(),
    to,
    subject: `Support Update: ${title}`,
    text: `${title}\n${String(opts.subject || 'Support')}\n${String(opts.message || '')}`,
    html: `<div style="background:#f8fafc;padding:22px;font-family:Segoe UI,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden"><div style="padding:22px;background:linear-gradient(135deg,${toneA},${toneB});color:#fff"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Support Journey</p><h2 style="margin:8px 0 0 0">${escapeHtml(title)}</h2></div><div style="padding:20px"><p style="margin:0 0 8px 0"><strong>${escapeHtml(String(opts.subject || 'Support Request'))}</strong></p><p style="margin:0">${escapeHtml(String(opts.message || 'Thank you for reaching out.'))}</p></div></div></div>`,
  });
}

module.exports = {
  isMailConfigured,
  sendPasswordResetOtp,
  sendEmailVerificationOtp,
  sendWelcomeEmail,
  sendCompleteProfileReminderEmail,
  sendAdminContentAlertEmail,
  sendResultUnlockedEmail,
  sendMockTestStartingSoonEmail,
  sendMissedTestFollowupEmail,
  sendStreakRiskAlertEmail,
  sendWeeklyPerformanceReportEmail,
  sendRankMilestoneEmail,
  sendNewContentByInterestEmail,
  sendReEngagementEmail,
  sendSecurityAccountAlertEmail,
  sendSupportJourneyEmail,
};
