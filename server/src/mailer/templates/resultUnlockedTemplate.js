'use strict';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildResultUnlockedEmail({
  displayName,
  testTitle,
  correct,
  total,
  rank,
  participants,
  unlockAtIso,
  appUrl,
  supportEmail,
}) {
  const safeName = escapeHtml(String(displayName || 'Learner').trim() || 'Learner');
  const safeTestTitle = escapeHtml(String(testTitle || 'Mock Test').trim() || 'Mock Test');
  const footerContactText = supportEmail
    ? `Need help? Contact us at ${escapeHtml(supportEmail)}.`
    : 'Need help? Our support team is always with you.';
  const c = Math.max(0, Number(correct || 0));
  const t = Math.max(1, Number(total || 1));
  const r = Math.max(1, Number(rank || 1));
  const p = Math.max(r, Number(participants || r));
  const pct = Math.round((c / t) * 100);
  const unlock = String(unlockAtIso || new Date().toISOString()).trim();
  const unlockMs = Date.parse(unlock);
  const isUnlocked = !Number.isFinite(unlockMs) || unlockMs <= Date.now();

  return {
    text:
      `Hey, ${String(displayName || 'Learner').trim() || 'Learner'}\n\n` +
      `${isUnlocked ? 'Your result is now unlocked.' : 'Your result will be available soon.'}\n\n` +
      `Test: ${String(testTitle || 'Mock Test').trim() || 'Mock Test'}\n` +
      `${isUnlocked ? `Score: ${c}/${t} (${pct}%)\n` : ''}` +
      `${isUnlocked ? `Rank: #${r} out of ${p}\n` : ''}` +
      `Unlocked at: ${unlock}\n\n` +
      `${isUnlocked ? 'View full result' : 'Open app for latest status'}: ${appUrl}\n\n` +
      `${footerContactText}`,
    html: `
      <div style="background:#f3f6fb;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7c3aed 0%,#2563eb 55%,#0ea5e9 100%);padding:24px 22px;text-align:center;">
            <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#ede9fe;letter-spacing:0.08em;text-transform:uppercase;">Result Unlocked</p>
            <p style="margin:0;font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;">Hey, ${safeName}</p>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 8px 0;font-size:21px;line-height:1.3;font-weight:700;color:#111827;">${safeTestTitle}</p>
            <p style="margin:0 0 14px 0;font-size:14px;color:#64748b;">Unlocked at ${escapeHtml(unlock)}</p>
            ${isUnlocked ? '' : `<p style="margin:0 0 14px 0;font-size:14px;color:#334155;">Your result details will be visible as soon as the unlock time is reached.</p>`}
            ${isUnlocked ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px 0;border-collapse:separate;border-spacing:0;table-layout:fixed;">
              <tr>
                <td style="width:50%;padding:0 5px 0 0;vertical-align:top;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;height:108px;box-sizing:border-box;">
                    <p style="margin:0 0 4px 0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Score</p>
                    <p style="margin:0;font-size:24px;font-weight:800;color:#0f172a;line-height:1.2;">${c}/${t}</p>
                    <p style="margin:6px 0 0 0;font-size:12px;color:#475569;white-space:nowrap;">Accuracy: ${pct}%</p>
                  </div>
                </td>
                <td style="width:50%;padding:0 0 0 5px;vertical-align:top;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;height:108px;box-sizing:border-box;">
                    <p style="margin:0 0 4px 0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Rank</p>
                    <p style="margin:0;font-size:24px;font-weight:800;color:#0f172a;line-height:1.2;">#${r}</p>
                    <p style="margin:6px 0 0 0;font-size:12px;color:#475569;white-space:nowrap;">Of ${p} participants</p>
                  </div>
                </td>
              </tr>
            </table>
            ` : ''}
            <div style="text-align:center;margin-top:6px;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:999px;padding:12px 26px;">
                ${isUnlocked ? 'View Detailed Result' : 'Check Result Status'}
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

module.exports = { buildResultUnlockedEmail };
