/** Compact “Exam Snap” card — admin preview + future app modal (same fields). */

export type ExamSnapCardData = {
  registrationLeft: string;
  registrationRight: string;
  sessionInfo: string;
  examTitle: string;
  conductingBody: string;
  courseLabel: string;
  courseValue: string;
  eligLabel: string;
  eligValue: string;
  examModeLabel: string;
  examModeValue: string;
  feeLabel: string;
  feeValue: string;
  examDateLabel: string;
  examDateValue: string;
  universitiesLabel: string;
  universitiesValue: string;
  markingLabel: string;
  markingValue: string;
  patternLabel: string;
  patternValue: string;
  brandName: string;
  brandSubtitle: string;
  qrImageUrl: string;
};

export function defaultExamSnapCard(): ExamSnapCardData {
  return {
    registrationLeft: '● Registration: Open',
    registrationRight: '● Last Date: 20 May 2026',
    sessionInfo: 'ADMISSION SESSION: 2026-27',
    examTitle: 'CUET (UG) 2026',
    conductingBody: 'National Testing Agency (NTA)',
    courseLabel: 'कोर्स (Courses)',
    courseValue: 'BA, B.Sc, B.Com',
    eligLabel: 'योग्यता (Elig.)',
    eligValue: '12th Pass/App.',
    examModeLabel: 'एग्जाम मोड',
    examModeValue: 'Hybrid (CBT/Pen)',
    feeLabel: 'आवेदन शुल्क',
    feeValue: '₹750 (Gen/OBC)',
    examDateLabel: 'परीक्षा तिथि (Exam Date)',
    examDateValue: '15 मई - 31 मई 2026',
    universitiesLabel: 'कुल यूनिवर्सिटी',
    universitiesValue: '250+ Universities',
    markingLabel: 'मार्किंग स्कीम',
    markingValue: '+5 Correct | -1 Wrong',
    patternLabel: 'Exam Pattern',
    patternValue: 'Sec 1: Lang | Sec 2: Domain | Sec 3: Gen. Test',
    brandName: 'Entrance Master',
    brandSubtitle: 'Get App on Play Store',
    qrImageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://nta.ac.in',
  };
}

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeQrSrc(raw: string, fallback: string): string {
  const t = String(raw || '').trim();
  if (/^https:\/\//i.test(t) && t.length <= 800) return t;
  return fallback;
}

const SNAP_STYLES = `
        body {
            background-color: #f0f2f5;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
            margin: 0;
            padding: 16px 0 32px;
            font-family: 'Segoe UI', Tahoma, sans-serif;
        }
        #snap-card {
            width: 390px;
            max-width: 100%;
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            overflow: hidden;
            border: 1px solid #dcdde1;
        }
        .date-bar {
            display: flex;
            justify-content: space-between;
            padding: 8px 15px;
            background-color: #ffffff;
            border-bottom: 1px solid #f1f2f6;
        }
        .date-item { font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .start-date { color: #27ae60; }
        .last-date { color: #eb4d4b; }
        .header {
            background-color: #f8f9fa;
            padding: 12px 15px;
            text-align: center;
            border-bottom: 2px dashed #eeeeee;
        }
        .session-info { font-size: 9px; color: #007bff; font-weight: bold; display: block; }
        .exam-title { font-size: 22px; color: #2f3640; margin: 2px 0; font-weight: 800; }
        .conducting-body { font-size: 12px; color: #7f8c8d; font-weight: 600; }
        .content { padding: 15px; }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 10px;
        }
        .info-box {
            padding: 8px 10px;
            border-radius: 10px;
            border: 1px solid #f1f2f6;
            background-color: #ffffff;
        }
        .info-box label {
            display: block;
            font-size: 9px;
            color: #a4b0be;
            font-weight: bold;
            margin-bottom: 2px;
            text-transform: uppercase;
        }
        .info-box span { font-size: 13px; font-weight: 700; color: #2f3640; }
        .exam-date-bar {
            background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
            color: white;
            padding: 10px 15px;
            border-radius: 10px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .exam-info label { font-size: 9px; font-weight: bold; display: block; opacity: 0.9; }
        .exam-info span { font-size: 15px; font-weight: 800; }
        .highlight-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 10px;
        }
        .course-box { background-color: #f8f9fa; padding: 8px 10px; border-radius: 10px; border: 1px solid #f1f2f6; }
        .elig-box { background-color: #fff4e6; padding: 8px 10px; border-radius: 10px; color: #d9480f; border: 1px solid #ffe8cc; }
        .pattern-box {
            background: #f1f3f5;
            border: 1px solid #dee2e6;
            padding: 8px 10px;
            border-radius: 10px;
            margin-bottom: 5px;
        }
        .pattern-box span { font-size: 11px; font-weight: 700; color: #495057; }
        .footer {
            background-color: #2f3640;
            color: white;
            padding: 10px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .brand-info strong { font-size: 14px; display: block; }
        .brand-info span { font-size: 10px; opacity: 0.7; }
        .qr-code { width: 45px; height: 45px; background: white; padding: 2px; border-radius: 6px; object-fit: contain; }
`;

/** Full HTML document for iframe srcDoc (preview). */
export function buildExamSnapCardSrcDoc(data: ExamSnapCardData): string {
  const d = defaultExamSnapCard();
  const e = escapeHtml;
  const qr = safeQrSrc(data.qrImageUrl, d.qrImageUrl);
  const regL = e(data.registrationLeft || d.registrationLeft);
  const regR = e(data.registrationRight || d.registrationRight);
  const sess = e(data.sessionInfo || d.sessionInfo);
  const title = e(data.examTitle || d.examTitle);
  const body = e(data.conductingBody || d.conductingBody);
  return `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exam Snap Card</title>
  <style>${SNAP_STYLES}</style>
</head>
<body>
  <div id="snap-card">
    <div class="date-bar">
      <div class="date-item start-date">${regL}</div>
      <div class="date-item last-date">${regR}</div>
    </div>
    <div class="header">
      <span class="session-info">${sess}</span>
      <div class="exam-title">${title}</div>
      <div class="conducting-body">${body}</div>
    </div>
    <div class="content">
      <div class="info-grid">
        <div class="info-box">
          <label>${e(data.courseLabel || d.courseLabel)}</label>
          <span>${e(data.courseValue || d.courseValue)}</span>
        </div>
        <div class="info-box">
          <label>${e(data.eligLabel || d.eligLabel)}</label>
          <span>${e(data.eligValue || d.eligValue)}</span>
        </div>
        <div class="info-box">
          <label>${e(data.examModeLabel || d.examModeLabel)}</label>
          <span>${e(data.examModeValue || d.examModeValue)}</span>
        </div>
        <div class="info-box">
          <label>${e(data.feeLabel || d.feeLabel)}</label>
          <span>${e(data.feeValue || d.feeValue)}</span>
        </div>
      </div>
      <div class="exam-date-bar">
        <div class="exam-info">
          <label>${e(data.examDateLabel || d.examDateLabel)}</label>
          <span>${e(data.examDateValue || d.examDateValue)}</span>
        </div>
        <div style="font-size: 18px;">📅</div>
      </div>
      <div class="highlight-row">
        <div class="course-box">
          <label style="display:block; font-size:9px; font-weight:bold; color:#a4b0be; margin-bottom:2px;">${e(
            data.universitiesLabel || d.universitiesLabel,
          )}</label>
          <span style="font-size: 12px; font-weight:700;">${e(data.universitiesValue || d.universitiesValue)}</span>
        </div>
        <div class="elig-box">
          <label style="display:block; font-size:9px; font-weight:bold; margin-bottom:2px; opacity:0.8;">${e(
            data.markingLabel || d.markingLabel,
          )}</label>
          <span style="font-size: 12px; font-weight:700;">${e(data.markingValue || d.markingValue)}</span>
        </div>
      </div>
      <div class="pattern-box">
        <label style="color: #495057; font-size: 9px; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 2px;">${e(
          data.patternLabel || d.patternLabel,
        )}</label>
        <span>${e(data.patternValue || d.patternValue)}</span>
      </div>
    </div>
    <div class="footer">
      <div class="brand-info">
        <strong>${e(data.brandName || d.brandName)}</strong>
        <span>${e(data.brandSubtitle || d.brandSubtitle)}</span>
      </div>
      <img src="${escapeHtml(qr)}" alt="QR" class="qr-code" referrerpolicy="no-referrer" />
    </div>
  </div>
</body>
</html>`;
}

export function mergeExamSnapCardFromServer(raw: unknown): ExamSnapCardData {
  const base = defaultExamSnapCard();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const pick = (k: keyof ExamSnapCardData) => String(o[k] !== undefined && o[k] !== null ? o[k] : base[k]);
  return {
    registrationLeft: pick('registrationLeft'),
    registrationRight: pick('registrationRight'),
    sessionInfo: pick('sessionInfo'),
    examTitle: pick('examTitle'),
    conductingBody: pick('conductingBody'),
    courseLabel: pick('courseLabel'),
    courseValue: pick('courseValue'),
    eligLabel: pick('eligLabel'),
    eligValue: pick('eligValue'),
    examModeLabel: pick('examModeLabel'),
    examModeValue: pick('examModeValue'),
    feeLabel: pick('feeLabel'),
    feeValue: pick('feeValue'),
    examDateLabel: pick('examDateLabel'),
    examDateValue: pick('examDateValue'),
    universitiesLabel: pick('universitiesLabel'),
    universitiesValue: pick('universitiesValue'),
    markingLabel: pick('markingLabel'),
    markingValue: pick('markingValue'),
    patternLabel: pick('patternLabel'),
    patternValue: pick('patternValue'),
    brandName: pick('brandName'),
    brandSubtitle: pick('brandSubtitle'),
    qrImageUrl: pick('qrImageUrl'),
  };
}
