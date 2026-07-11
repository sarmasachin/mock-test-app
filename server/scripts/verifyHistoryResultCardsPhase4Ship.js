#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — History menu full ship: Phases 1–3 suites + E2E mirror + APK.
 *
 * Usage:
 *   node scripts/verifyHistoryResultCardsPhase4Ship.js
 *   node scripts/verifyHistoryResultCardsPhase4Ship.js --require-apk
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const appRoot = path.join(scriptsDir, '..', '..');

const phaseScripts = [
  'verifyHistoryAttemptCapPhase1.js',
  'verifyHistoryResultCardsPhase2.js',
  'verifyHistoryResultCardsPhase3.js',
];

const requiredAppFiles = [
  'app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt',
  'app/src/main/java/com/freemocktest/app/data/local/TestAttemptDao.kt',
  'app/src/main/java/com/freemocktest/app/data/local/TestAttemptEntity.kt',
  'app/src/main/java/com/freemocktest/app/util/HistoryAttemptUi.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeAttemptStatsUtils.kt',
  'app/src/main/java/com/freemocktest/app/newui/history/HistoryScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/history/HistoryResultCard.kt',
  'app/src/main/java/com/freemocktest/app/newui/history/HistoryProgressStrip.kt',
  'app/src/main/java/com/freemocktest/app/newui/result/ResultScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt',
];

const MAX = 50;

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(appRoot, rel), 'utf8');
}

function attemptScoreRatio(attempt) {
  if (attempt.marksBased && attempt.scoreMarks >= 0 && attempt.maxMarks > 0) {
    return attempt.scoreMarks / attempt.maxMarks;
  }
  return attempt.correct / Math.max(1, attempt.total);
}

function formatScore(attempt) {
  if (attempt.marksBased && attempt.scoreMarks >= 0 && attempt.maxMarks > 0) {
    return `${attempt.scoreMarks} / ${attempt.maxMarks} marks`;
  }
  return `${attempt.correct}/${Math.max(1, attempt.total)}`;
}

function simulateInsertAndCap(existing, newRow) {
  const rows = [...existing, newRow];
  rows.sort((a, b) => {
    if (a.completedAtMillis !== b.completedAtMillis) {
      return a.completedAtMillis - b.completedAtMillis;
    }
    return a.id - b.id;
  });
  while (rows.length > MAX) {
    rows.shift();
  }
  return rows;
}

function toResultCard(attempt, scoreVisible = true) {
  const answered = Math.max(0, attempt.correct + attempt.wrong);
  const total = Math.max(attempt.total, answered, 1);
  return {
    id: attempt.id,
    testName: (attempt.testName || 'Test').trim() || 'Test',
    answered,
    correct: Math.max(0, attempt.correct),
    wrong: Math.max(0, attempt.wrong),
    total,
    scoreText: scoreVisible ? formatScore(attempt) : '-',
    percent: scoreVisible ? Math.round(attemptScoreRatio(attempt) * 100) : 0,
    scoreHidden: !scoreVisible,
  };
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
  const uniqueTests = new Set(
    attempts.map((a) => (a.testName || '').trim().toLowerCase()).filter(Boolean),
  ).size;
  return {
    attemptsCount: attempts.length,
    uniqueTestsCount: uniqueTests,
    bestScoreText: scoreVisible ? formatScore(best) : '-',
    lastScoreText: scoreVisible ? formatScore(last) : '-',
    avgPercentText: scoreVisible
      ? `${Math.round(percents.reduce((s, p) => s + p, 0) / percents.length)}%`
      : '-',
  };
}

function buildHistoryResultNav(card) {
  const safeName = (card.testName || 'Test').trim() || 'Test';
  const encoded = encodeURIComponent(safeName);
  const correct = Math.max(0, card.correct);
  const wrong = Math.max(0, card.wrong);
  const answered = Math.max(card.answered, correct + wrong);
  const total = Math.max(card.total, answered, correct + wrong, 1);
  return `result/${encoded}?answered=${answered}&correct=${correct}&wrong=${wrong}&total=${total}&publishAt=0`;
}

function simulateHistoryJourney() {
  let rows = [];
  let nextId = 1;
  const add = (testName, correct, wrong, total, completedAtMillis, marksBased = false, scoreMarks = -1, maxMarks = -1) => {
    rows = simulateInsertAndCap(rows, {
      id: nextId++,
      testName,
      correct,
      wrong,
      total,
      marksBased,
      scoreMarks,
      maxMarks,
      completedAtMillis,
    });
  };

  add('Bihar GK', 6, 4, 10, 1000);
  add('Bihar GK', 8, 2, 10, 2000, true, 75, 100);
  add('HP GK', 7, 3, 10, 3000);

  const cards = rows.map((r) => toResultCard(r));
  const summary = computeProgressSummary(rows);
  const hidden = computeProgressSummary(rows, false);
  const tapNav = buildHistoryResultNav(cards[0]);

  const sameTestCards = cards.filter((c) => c.testName === 'Bihar GK');
  const biharAttempts = rows.filter((r) => r.testName === 'Bihar GK');

  return {
    ok:
      rows.length === 3 &&
      sameTestCards.length === 2 &&
      biharAttempts.length === 2 &&
      summary.attemptsCount === 3 &&
      summary.uniqueTestsCount === 2 &&
      summary.bestScoreText === '75 / 100 marks' &&
      summary.lastScoreText === '7/10' &&
      summary.avgPercentText === '68%' &&
      hidden.bestScoreText === '-' &&
      hidden.lastScoreText === '-' &&
      cards.every((c) => c.id > 0) &&
      tapNav.includes('answered=10') &&
      tapNav.includes('correct=6') &&
      tapNav.includes('wrong=4') &&
      tapNav.includes('publishAt=0'),
    rows,
    cards,
    summary,
    hidden,
    tapNav,
  };
}

function simulateCapOverflow() {
  let rows = [];
  let nextId = 1;
  for (let i = 0; i < 51; i++) {
    rows = simulateInsertAndCap(rows, {
      id: nextId++,
      testName: `Test ${i}`,
      correct: 5,
      wrong: 5,
      total: 10,
      marksBased: false,
      scoreMarks: -1,
      maxMarks: -1,
      completedAtMillis: 1000 + i,
    });
  }
  return {
    ok: rows.length === MAX && rows[0].testName === 'Test 1' && rows[49].testName === 'Test 50',
    count: rows.length,
    oldest: rows[0]?.testName,
    newest: rows[49]?.testName,
  };
}

function main() {
  const requireApk = process.argv.includes('--require-apk');
  console.log('=== Phase 4: History menu full ship ===\n');
  let ok = true;

  for (const rel of requiredAppFiles) {
    ok = line(fs.existsSync(path.join(appRoot, rel)), `App file: ${rel}`) && ok;
  }

  const navKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
  const historyKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryScreenNew.kt');
  const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
  const resultKt = read('app/src/main/java/com/freemocktest/app/newui/result/ResultScreenNew.kt');
  const repoKt = read('app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt');

  ok = line(
    homeKt.includes('label = "History"') && homeKt.includes('onOpenHistory()'),
    'Drawer menu item History opens history callback',
  ) && ok;
  ok = line(
    homeKt.includes('label = "Activity"') && homeKt.includes('onOpenActivity()'),
    'Drawer Activity is separate from History',
  ) && ok;
  ok = line(
    /onOpenHistory\s*=\s*\{[^}]*RoutesNew\.HISTORY/.test(navKt),
    'Nav host routes drawer History → HISTORY screen',
  ) && ok;
  ok = line(
    /onOpenActivity\s*=\s*\{[^}]*RoutesNew\.RESULTS_HISTORY/.test(navKt),
    'Nav host routes drawer Activity → RESULTS_HISTORY (leaderboard)',
  ) && ok;
  ok = line(
    historyKt.includes('observeAttemptsForLoggedInUser'),
    'History screen observes mock-test attempts for logged-in user',
  ) && ok;
  ok = line(
    historyKt.includes('AppPreferencesRepository.scoreVisibilityEnabled'),
    'History respects profile score visibility toggle',
  ) && ok;
  ok = line(
    navKt.includes('navigateToHistoryAttemptResult') && navKt.includes('onOpenResult = { card ->'),
    'History card tap wired to Result navigation',
  ) && ok;
  ok = line(resultKt.includes('Share score'), 'Result screen supports Share') && ok;
  ok = line(resultKt.includes('Answer Key'), 'Result screen supports Answer Key') && ok;
  ok = line(resultKt.includes('Review'), 'Result screen supports Review') && ok;
  ok = line(
    (navKt.match(/recordAttempt/g) || []).length === 1,
    'recordAttempt only from mock-test submit (not daily quiz)',
  ) && ok;
  ok = line(
    repoKt.includes('MAX_STORED_ATTEMPTS_PER_USER = 50'),
    'Repository keeps 50-attempt device cap',
  ) && ok;

  const journey = simulateHistoryJourney();
  ok = line(journey.ok, 'Sim: full history journey (cards/progress/tap nav/hidden scores)') && ok;
  if (!journey.ok) {
    console.log('  summary:', JSON.stringify(journey.summary));
    console.log('  hidden:', JSON.stringify(journey.hidden));
    console.log('  tapNav:', journey.tapNav);
  }

  const cap = simulateCapOverflow();
  ok = line(cap.ok, `Sim: 51 inserts → ${cap.count} rows, FIFO oldest=${cap.oldest}, newest=${cap.newest}`) && ok;

  const apkCandidates = [
    path.join(appRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-HISTORY-PHASE4.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-HISTORY-PHASE3.apk'),
  ];
  const apkFound = apkCandidates.find((p) => fs.existsSync(p));
  ok = line(!requireApk || !!apkFound, requireApk ? 'Debug APK present' : 'Debug APK check optional') && ok;
  if (apkFound) {
    ok = line(true, `APK: ${apkFound}`) && ok;
  }

  console.log('\n--- Running phase scripts ---\n');
  for (const script of phaseScripts) {
    const scriptPath = path.join(scriptsDir, script);
    try {
      execSync(`node "${scriptPath}"`, { stdio: 'inherit', cwd: path.join(scriptsDir, '..') });
      ok = line(true, `${script} passed`) && ok;
    } catch {
      ok = line(false, `${script} FAILED`) && ok;
    }
  }

  console.log('\n--- Manual QA checklist ---');
  console.log('1. Drawer → History (NOT Activity) → result cards list appears');
  console.log('2. Same mock test 2–3 times → separate cards (newest first)');
  console.log('3. Progress strip shows attempts, unique tests, best, last, avg %');
  console.log('4. Tap any card → full Result screen with that attempt scores');
  console.log('5. Result screen: Share, Answer Key, Review all work');
  console.log('6. Profile score visibility OFF → History scores show "-", counts remain');
  console.log('7. Complete 51+ tests → only latest 50 cards kept (oldest removed)');

  console.log(`\n${ok ? 'VERIFY_HISTORY_RESULT_CARDS_PHASE4_OK' : 'VERIFY_HISTORY_RESULT_CARDS_PHASE4_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
