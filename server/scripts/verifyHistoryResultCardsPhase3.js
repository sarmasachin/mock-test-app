#!/usr/bin/env node
'use strict';

/**
 * Phase 3 — History progress strip + tap card → full Result screen.
 *
 * Usage:
 *   node scripts/verifyHistoryResultCardsPhase3.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function attemptScoreRatio(attempt) {
  if (attempt.marksBased && attempt.scoreMarks >= 0 && attempt.maxMarks > 0) {
    return attempt.scoreMarks / attempt.maxMarks;
  }
  return attempt.correct / Math.max(1, attempt.total);
}

function computeProgressSummary(attempts, scoreVisible = true) {
  if (attempts.length === 0) {
    return { attemptsCount: 0, uniqueTestsCount: 0, bestScoreText: '--', lastScoreText: '--', avgPercentText: '--' };
  }
  const best = [...attempts].sort((a, b) => {
    const ra = attemptScoreRatio(a);
    const rb = attemptScoreRatio(b);
    if (rb !== ra) return rb - ra;
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.completedAtMillis - b.completedAtMillis;
  })[0];
  const last = [...attempts].sort((a, b) => b.completedAtMillis - a.completedAtMillis)[0];
  const percents = attempts.map((a) => Math.round(attemptScoreRatio(a) * 100));
  const uniqueTests = new Set(attempts.map((a) => a.testName.trim().toLowerCase()).filter(Boolean)).size;
  const fmt = (a) => {
    if (a.marksBased && a.scoreMarks >= 0 && a.maxMarks > 0) {
      return `${a.scoreMarks} / ${a.maxMarks} marks`;
    }
    return `${a.correct}/${Math.max(1, a.total)}`;
  };
  return {
    attemptsCount: attempts.length,
    uniqueTestsCount: uniqueTests,
    bestScoreText: scoreVisible ? fmt(best) : '-',
    lastScoreText: scoreVisible ? fmt(last) : '-',
    avgPercentText: scoreVisible ? `${Math.round(percents.reduce((s, p) => s + p, 0) / percents.length)}%` : '-',
  };
}

function main() {
  console.log('=== Phase 3: History progress + tap → Result ===\n');
  let ok = true;

  const uiKt = read('app/src/main/java/com/freemocktest/app/util/HistoryAttemptUi.kt');
  const historyKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryScreenNew.kt');
  const stripKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryProgressStrip.kt');
  const cardKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryResultCard.kt');
  const navKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');

  ok = line(uiKt.includes('computeProgressSummary'), 'Progress summary helper exists') && ok;
  ok = line(uiKt.includes('uniqueTestsCount'), 'Progress tracks unique test names') && ok;
  ok = line(stripKt.includes('HistoryProgressStrip'), 'Progress strip composable exists') && ok;
  ok = line(stripKt.includes('Best'), 'Progress strip shows best score') && ok;
  ok = line(stripKt.includes('Last'), 'Progress strip shows last score') && ok;
  ok = line(historyKt.includes('HistoryProgressStrip'), 'History screen renders progress strip') && ok;
  ok = line(historyKt.includes('onOpenResult'), 'History screen exposes result navigation callback') && ok;
  ok = line(cardKt.includes('clickable'), 'Result cards are tappable') && ok;
  ok = line(cardKt.includes('Answer key'), 'Card hints full result actions') && ok;
  ok = line(navKt.includes('navigateToHistoryAttemptResult'), 'Nav host has history → result helper') && ok;
  ok = line(navKt.includes('onOpenResult = { card ->'), 'History route wires tap to Result navigation') && ok;
  ok = line(
    /navigateToHistoryAttemptResult[\s\S]*RoutesNew\.RESULT/.test(navKt),
    'History navigation opens Result route with attempt params',
  ) && ok;
  ok = line(navKt.includes('publishAt=0'), 'History result opens immediate Result view') && ok;

  const attempts = [
    { testName: 'Bihar GK', correct: 6, wrong: 4, total: 10, marksBased: false, scoreMarks: -1, maxMarks: -1, completedAtMillis: 1000 },
    { testName: 'Bihar GK', correct: 8, wrong: 2, total: 10, marksBased: true, scoreMarks: 75, maxMarks: 100, completedAtMillis: 2000 },
    { testName: 'HP GK', correct: 7, wrong: 3, total: 10, marksBased: false, scoreMarks: -1, maxMarks: -1, completedAtMillis: 3000 },
  ];
  const summary = computeProgressSummary(attempts);
  ok = line(summary.attemptsCount === 3, 'Sim: attempts count = 3') && ok;
  ok = line(summary.uniqueTestsCount === 2, 'Sim: unique tests = 2 (same test counted once)') && ok;
  ok = line(summary.bestScoreText === '75 / 100 marks', 'Sim: best uses marks-aware ranking') && ok;
  ok = line(summary.lastScoreText === '7/10', 'Sim: last = most recent attempt') && ok;
  ok = line(summary.avgPercentText === '68%', 'Sim: avg percent across attempts') && ok;

  const tapped = attempts[0];
  const answered = tapped.correct + tapped.wrong;
  ok = line(answered === 10, 'Sim: tap passes answered = correct + wrong') && ok;

  console.log(`\n${ok ? 'VERIFY_HISTORY_RESULT_CARDS_PHASE3_OK' : 'VERIFY_HISTORY_RESULT_CARDS_PHASE3_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
