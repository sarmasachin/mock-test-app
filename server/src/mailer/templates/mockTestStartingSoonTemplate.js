'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStartTime(startAtIso) {
  const date = new Date(startAtIso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function buildMockTestStartingSoonEmail({
  displayName,
  brandName,
  testTitle,
  examDate,
  slotLabel,
  startAtIso,
  ctaLink,
  supportEmail,
}) {
  const safeName = escapeHtml(displayName || 'Learner');
  const safeTestTitle = escapeHtml(testTitle || 'Mock Test');
  const safeDate = escapeHtml(examDate || 'Scheduled today');
  const safeSlot = escapeHtml(slotLabel || 'Slot details available in app');
  const startTimeText = formatStartTime(startAtIso) || 'Check app for exact time';
  const safeStartTime = escapeHtml(startTimeText);
  const safeBrand = escapeHtml(brandName || 'MockTestApp');
  const safeCtaLink = escapeHtml(ctaLink || 'https://play.google.com/store');
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is ready to assist you.';

  return {
    text:
      `Hey, ${displayName || 'Learner'}\n\n` +
      `Your upcoming mock test starts soon.\n\n` +
      `Test: ${testTitle || 'Mock Test'}\n` +
      `Date: ${examDate || 'Scheduled today'}\n` +
      `Slot: ${slotLabel || 'Slot details available in app'}\n` +
      `Start: ${startTimeText}\n\n` +
      `Open now: ${ctaLink}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:26px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 45%,#2563eb 100%);padding:26px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#ede9fe;letter-spacing:0.08em;text-transform:uppercase;">Mock Test Alert</p>
            <p style="margin:0;font-size:32px;line-height:1.15;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:24px 22px 20px 22px;">
            <p style="margin:0 0 12px 0;font-size:18px;line-height:1.55;color:#1f2937;">
              Your next mock test is about to begin. Join on time to get the full exam-like experience.
            </p>
            <div style="background:#f8faff;border:1px solid #dbeafe;border-radius:14px;padding:14px;margin:0 0 18px 0;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#1e3a8a;font-weight:700;">Test details</p>
              <p style="margin:0 0 7px 0;font-size:15px;line-height:1.5;"><strong>Title:</strong> ${safeTestTitle}</p>
              <p style="margin:0 0 7px 0;font-size:15px;line-height:1.5;"><strong>Date:</strong> ${safeDate}</p>
              <p style="margin:0 0 7px 0;font-size:15px;line-height:1.5;"><strong>Slot:</strong> ${safeSlot}</p>
              <p style="margin:0;font-size:15px;line-height:1.5;"><strong>Start time:</strong> ${safeStartTime}</p>
            </div>
            <div style="text-align:center;margin:0 0 14px 0;">
              <a href="${safeCtaLink}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#2563eb);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 28px;">
                Open Mock Test
              </a>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;text-align:center;">
              Stay focused and give your best. Team <strong>${safeBrand}</strong> is cheering for you.
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

module.exports = { buildMockTestStartingSoonEmail };
