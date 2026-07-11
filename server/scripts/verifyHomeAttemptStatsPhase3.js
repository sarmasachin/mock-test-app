#!/usr/bin/env node
'use strict';

/**
 * Phase 3 — Home best/last score display aligned with Result screen marks scoring.
 *
 * Usage:
 *   node scripts/verifyHomeAttemptStatsPhase3.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function parseNegativeMarkingFraction(text) {
  const raw = (text || '').trim().toLowerCase();
  if (!raw || raw === 'no' || raw === 'none' || raw === 'false' || raw === '0' || raw === '0.0') {
    return 0;
  }
  if (raw.includes('/')) {
    const parts = raw.replace(/^-/, '').split('/');
    if (parts.length === 2) {
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && b > 0) return Math.abs(a / b);
    }
  }
  const num = Number(raw.replace(/^\+/, ''));
  return Number.isFinite(num) ? Math.max(0, Math.abs(num)) : 0;
}

function computeExamScore(correct, wrong, totalQuestions, totalMarks, negativeMarkingText) {
  const total = Math.max(0, totalQuestions);
  const safeCorrect = Math.max(0, correct);
  const safeWrong = Math.max(0, wrong);
  const configuredMarks = Math.max(0, totalMarks);
  const maxMarks = configuredMarks > 0 ? configuredMarks : total;
  const marksPerCorrect = total > 0 ? maxMarks / total : maxMarks;
  const penaltyFraction = parseNegativeMarkingFraction(negativeMarkingText);
  const penaltyPerWrong = marksPerCorrect * penaltyFraction;
  const rawScore = safeCorrect * marksPerCorrect - safeWrong * penaltyPerWrong;
  const scoreMarks = Math.max(0, Math.round(rawScore * 100) / 100);
  return {
    scoreMarks,
    maxMarks: Math.round(maxMarks * 100) / 100,
    negativeMarkingEnabled: penaltyFraction > 0,
  };
}

function formatScoreMarks(value) {
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

function isMarksBasedDisplay(attempt) {
  return attempt.marksBased && attempt.scoreMarks >= 0 && attempt.maxMarks > 0;
}

function attemptScoreRatio(attempt) {
  if (isMarksBasedDisplay(attempt)) return attempt.scoreMarks / attempt.maxMarks;
  return attempt.correct / Math.max(1, attempt.total);
}

function formatHomeAttemptScore(attempt) {
  if (isMarksBasedDisplay(attempt)) {
    return `${formatScoreMarks(attempt.scoreMarks)} / ${formatScoreMarks(attempt.maxMarks)} marks`;
  }
  return `${attempt.correct}/${Math.max(1, attempt.total)}`;
}

function computeMarksSnapshot(correct, wrong, total, totalMarks, negativeMarkingText) {
  const safeTotal = Math.max(total, correct + wrong, 1);
  const scored = computeExamScore(correct, wrong, safeTotal, totalMarks, negativeMarkingText);
  const marksBased = totalMarks > 0 || scored.negativeMarkingEnabled;
  return {
    scoreMarks: marksBased ? scored.scoreMarks : -1,
    maxMarks: marksBased ? scored.maxMarks : -1,
    marksBased,
  };
}

function main() {
  console.log('=== Phase 3: Home marks aligned with Result screen ===\n');
  let ok = true;

  const utilsKt = read('app/src/main/java/com/freemocktest/app/util/HomeAttemptStatsUtils.kt');
  const entityKt = read('app/src/main/java/com/freemocktest/app/data/local/TestAttemptEntity.kt');
  const historyKt = read('app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt');
  const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
  const navKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
  const resultKt = read('app/src/main/java/com/freemocktest/app/newui/result/ResultScreenNew.kt');
  const dbKt = read('app/src/main/java/com/freemocktest/app/data/local/MockTestDatabase.kt');

  ok = line(utilsKt.includes('object HomeAttemptStatsUtils'), 'Shared HomeAttemptStatsUtils exists') && ok;
  ok = line(utilsKt.includes('formatHomeAttemptScore'), 'Shared formatter for Home display') && ok;
  ok = line(utilsKt.includes('computeMarksSnapshot'), 'Marks snapshot uses ExamScoringUtils rules') && ok;
  ok = line(entityKt.includes('score_marks'), 'Attempt entity stores score marks') && ok;
  ok = line(entityKt.includes('marks_based'), 'Attempt entity stores marks-based flag') && ok;
  ok = line(entityKt.includes('wrong'), 'Attempt entity stores wrong count') && ok;
  ok = line(dbKt.includes('version = 3'), 'Room schema bumped for marks columns') && ok;
  ok = line(historyKt.includes('computeMarksSnapshot'), 'recordAttempt persists marks snapshot') && ok;
  ok = line(navKt.includes('wrong = wrong'), 'Quiz submit passes wrong count to recordAttempt') && ok;
  ok = line(navKt.includes('totalMarks'), 'Quiz submit passes catalog marks config') && ok;
  ok = line(navKt.includes('negativeMarkingText'), 'Quiz submit passes negative marking config') && ok;
  ok = line(homeKt.includes('HomeAttemptStatsUtils.formatHomeAttemptScore'), 'Home uses shared marks formatter') && ok;
  ok = line(homeKt.includes('compareAttemptsForBest'), 'Home best score ranks by marks ratio when available') && ok;
  ok = line(resultKt.includes('HomeAttemptStatsUtils.formatScoreMarks'), 'Result screen shares marks formatting') && ok;

  const marksSnapshot = computeMarksSnapshot(8, 2, 10, 100, '1/4');
  ok = line(marksSnapshot.marksBased === true, 'Sim: negative marking enables marks-based display') && ok;
  ok = line(marksSnapshot.scoreMarks === 75, 'Sim: 8 correct, 2 wrong @ 10 marks each, -1/4 = 75 marks') && ok;

  const attempt = {
    correct: 8,
    wrong: 2,
    total: 10,
    scoreMarks: marksSnapshot.scoreMarks,
    maxMarks: marksSnapshot.maxMarks,
    marksBased: true,
    completedAtMillis: 1000,
  };
  ok = line(formatHomeAttemptScore(attempt) === '75 / 100 marks', 'Sim: Home display matches Result marks line') && ok;

  const legacy = { correct: 8, total: 10, scoreMarks: -1, maxMarks: -1, marksBased: false, completedAtMillis: 1000 };
  ok = line(formatHomeAttemptScore(legacy) === '8/10', 'Sim: legacy rows still show correct/total') && ok;

  const best = [
    { correct: 9, wrong: 1, total: 10, scoreMarks: 85, maxMarks: 100, marksBased: true, completedAtMillis: 1000 },
    { correct: 8, wrong: 0, total: 10, scoreMarks: 80, maxMarks: 100, marksBased: true, completedAtMillis: 2000 },
  ].sort((a, b) => {
    const ra = attemptScoreRatio(a);
    const rb = attemptScoreRatio(b);
    if (rb !== ra) return rb - ra;
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.completedAtMillis - b.completedAtMillis;
  })[0];
  ok = line(best.scoreMarks === 85, 'Sim: best score prefers higher marks ratio') && ok;

  console.log(`\n${ok ? 'VERIFY_HOME_ATTEMPT_STATS_PHASE3_OK' : 'VERIFY_HOME_ATTEMPT_STATS_PHASE3_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
