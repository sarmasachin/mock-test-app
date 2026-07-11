#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — Home mock test stats full ship: Phases 1–3 suites + E2E mirror + APK.
 *
 * Usage:
 *   node scripts/verifyHomeAttemptStatsPhase4Ship.js
 *   node scripts/verifyHomeAttemptStatsPhase4Ship.js --require-apk
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const appRoot = path.join(scriptsDir, '..', '..');

const phaseScripts = [
  'verifyHomeAttemptStatsPhase1.js',
  'verifyQuizSubmitCatalogIdFallback.js',
  'verifyHomeAttemptStatsPhase3.js',
  'verifyHomeAttemptStatsE2e.js',
];

const requiredAppFiles = [
  'app/src/main/java/com/freemocktest/app/util/UserScopeKeys.kt',
  'app/src/main/java/com/freemocktest/app/util/HomeAttemptStatsUtils.kt',
  'app/src/main/java/com/freemocktest/app/data/local/TestAttemptEntity.kt',
  'app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt',
  'app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/history/HistoryScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/progress/ProgressReportScreenNew.kt',
  'app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt',
  'app/src/main/java/com/freemocktest/app/data/ContentRepository.kt',
];

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

function formatHomeAttemptScore(attempt) {
  if (attempt.marksBased && attempt.scoreMarks >= 0 && attempt.maxMarks > 0) {
    const fmt = (v) => (v % 1 === 0 ? String(v) : v.toFixed(2));
    return `${fmt(attempt.scoreMarks)} / ${fmt(attempt.maxMarks)} marks`;
  }
  return `${attempt.correct}/${Math.max(1, attempt.total)}`;
}

function computeHomeStats(attempts, scoreVisible = true) {
  const attemptsCount = attempts.length.toString();
  let bestScoreValue = '--';
  let lastScoreValue = '--';
  if (!scoreVisible) {
    bestScoreValue = '-';
    lastScoreValue = '-';
  } else if (attempts.length > 0) {
    const best = [...attempts].sort((a, b) => {
      const ra = attemptScoreRatio(a);
      const rb = attemptScoreRatio(b);
      if (rb !== ra) return rb - ra;
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.completedAtMillis - b.completedAtMillis;
    })[0];
    bestScoreValue = formatHomeAttemptScore(best);
    const latest = [...attempts].sort((a, b) => b.completedAtMillis - a.completedAtMillis)[0];
    lastScoreValue = formatHomeAttemptScore(latest);
  }
  return { attemptsCount, bestScoreValue, lastScoreValue };
}

function simulateMockTestJourney() {
  const attempts = [];
  const userKey = 'user@mail.com';

  if (!userKey.trim()) return { ok: false, reason: 'login required' };

  attempts.push({
    testName: 'HP GK',
    correct: 6,
    wrong: 4,
    total: 10,
    scoreMarks: -1,
    maxMarks: -1,
    marksBased: false,
    completedAtMillis: 1000,
  });

  attempts.push({
    testName: 'Bihar GK',
    correct: 8,
    wrong: 2,
    total: 10,
    scoreMarks: 75,
    maxMarks: 100,
    marksBased: true,
    completedAtMillis: 2000,
  });

  attempts.push({
    testName: 'ff',
    correct: 7,
    wrong: 3,
    total: 10,
    scoreMarks: -1,
    maxMarks: -1,
    marksBased: false,
    completedAtMillis: 3000,
  });

  const stats = computeHomeStats(attempts);
  const hidden = computeHomeStats(attempts, false);

  return {
    ok:
      stats.attemptsCount === '3' &&
      stats.bestScoreValue === '75 / 100 marks' &&
      stats.lastScoreValue === '7/10' &&
      hidden.attemptsCount === '3' &&
      hidden.bestScoreValue === '-' &&
      hidden.lastScoreValue === '-',
    stats,
    hidden,
  };
}

function main() {
  const requireApk = process.argv.includes('--require-apk');
  console.log('=== Phase 4: Home mock test stats full ship ===\n');
  let ok = true;

  for (const rel of requiredAppFiles) {
    ok = line(fs.existsSync(path.join(appRoot, rel)), `App file: ${rel}`) && ok;
  }

  const navKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
  const progressKt = read('app/src/main/java/com/freemocktest/app/newui/progress/ProgressReportScreenNew.kt');
  const historyKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryScreenNew.kt');
  const appKt = read('app/src/main/java/com/freemocktest/app/MockTestApp.kt');

  ok = line(
    /recordAttempt[\s\S]*markPendingResultSubmittedNow/.test(navKt),
    'Submit journey always saves attempt + pending result',
  ) && ok;
  ok = line(navKt.includes('resolveCatalogIdForQuizSubmit(testTitle)'), 'Submit uses catalog id fallback resolver') && ok;
  ok = line(navKt.includes('wrong = wrong'), 'Submit passes wrong count for marks snapshot') && ok;
  ok = line(progressKt.includes('HomeAttemptStatsUtils.attemptScorePercent'), 'Progress report uses marks-aware percent') && ok;
  ok = line(historyKt.includes('HomeAttemptStatsUtils.formatHomeAttemptScore'), 'History uses Result-aligned score text') && ok;
  ok = line(appKt.includes('migrateLegacyUserKeysIfNeeded'), 'App startup migrates legacy attempt keys') && ok;

  const journey = simulateMockTestJourney();
  ok = line(journey.ok, 'Sim: full mock-test journey stats (attempts/best/last/hidden)') && ok;
  if (!journey.ok) {
    console.log('  journey stats:', JSON.stringify(journey.stats));
    console.log('  hidden stats:', JSON.stringify(journey.hidden));
  }

  const apkCandidates = [
    path.join(appRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-HOME-STATS-PHASE4.apk'),
    path.join(appRoot, '..', 'MockTestApp-debug-v1.0.9-HOME-STATS-PHASE3.apk'),
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
  console.log('1. Complete 1st mock test → Home Attempts = 1, Last score updates');
  console.log('2. Complete 2nd test with better score → Best score updates');
  console.log('3. Negative-marking test → Home Best/Last show marks like Result screen');
  console.log('4. Logout + login same account → stats unchanged');
  console.log('5. Profile score visibility OFF → Best/Last show "-", Attempts count remains');

  console.log(`\n${ok ? 'VERIFY_HOME_ATTEMPT_STATS_PHASE4_OK' : 'VERIFY_HOME_ATTEMPT_STATS_PHASE4_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main();
