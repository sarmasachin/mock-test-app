'use strict';

/**
 * Parse admin negativeMarkingText into a positive penalty fraction per wrong answer.
 * Examples: "No" -> 0, "-0.5" -> 0.5, "0.25" -> 0.25, "1/3" -> 0.333...
 */
function parseNegativeMarkingFraction(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw || raw === 'no' || raw === 'none' || raw === 'false' || raw === '0' || raw === '0.0') {
    return 0;
  }
  if (raw.includes('/')) {
    const [a, b] = raw.replace(/^-/, '').split('/').map((x) => Number(String(x || '').trim()));
    if (Number.isFinite(a) && Number.isFinite(b) && b > 0) {
      return Math.max(0, Math.abs(a / b));
    }
  }
  if (raw.includes(':')) {
    const [a, b] = raw.replace(/^-/, '').split(':').map((x) => Number(String(x || '').trim()));
    if (Number.isFinite(a) && Number.isFinite(b) && b > 0) {
      return Math.max(0, Math.abs(a / b));
    }
  }
  const num = Number.parseFloat(raw.replace(/^\+/, ''));
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.abs(num));
}

function computeExamScore({
  correct,
  wrong,
  unanswered = 0,
  totalQuestions,
  totalMarks,
  negativeMarkingText,
}) {
  const total = Math.max(0, Number(totalQuestions || 0));
  const safeCorrect = Math.max(0, Number(correct || 0));
  const safeWrong = Math.max(0, Number(wrong || 0));
  const safeUnanswered = Math.max(0, Number(unanswered || 0));
  const configuredMarks = Math.max(0, Number(totalMarks || 0));
  const maxMarks = configuredMarks > 0 ? configuredMarks : total;
  const marksPerCorrect = total > 0 ? maxMarks / total : maxMarks;
  const penaltyFraction = parseNegativeMarkingFraction(negativeMarkingText);
  const penaltyPerWrong = marksPerCorrect * penaltyFraction;
  const rawScore = safeCorrect * marksPerCorrect - safeWrong * penaltyPerWrong;
  const scoreMarks = Math.max(0, Math.round(rawScore * 100) / 100);
  return {
    scoreMarks,
    maxMarks: Math.round(maxMarks * 100) / 100,
    marksPerCorrect: Math.round(marksPerCorrect * 1000) / 1000,
    penaltyPerWrong: Math.round(penaltyPerWrong * 1000) / 1000,
    negativeMarkingEnabled: penaltyFraction > 0,
    correct: safeCorrect,
    wrong: safeWrong,
    unanswered: safeUnanswered,
    totalQuestions: total,
  };
}

module.exports = {
  parseNegativeMarkingFraction,
  computeExamScore,
};
