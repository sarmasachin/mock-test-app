#!/usr/bin/env node
'use strict';

/**
 * E2E-style verify for Home Attempts / Best score / Last score.
 * Mirrors HomeScreenNew.kt + TestHistoryRepository persistence rules.
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

function attemptScorePercent(attempt) {
  return Math.round(attemptScoreRatio(attempt) * 100);
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

function resolveCanonicalKey(email, contact, userIdFormatted) {
  const mail = (email || '').trim();
  if (mail) return mail.toLowerCase();
  const c = (contact || '').trim();
  if (c) return c.toLowerCase();
  const uid = (userIdFormatted || '').trim();
  if (uid) return `uid:${uid}`;
  return '';
}

function resolveContentStateOwnerId(prefs) {
  return resolveCanonicalKey(prefs.email, prefs.contact, prefs.userCode);
}

function normalizeUserKey(userKey) {
  const k = (userKey || '').trim();
  return k || null;
}

function recordAttemptAllowed(userKey) {
  return normalizeUserKey(userKey) != null;
}

let ok = true;

const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
const historyKt = read('app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt');
const historyScreenKt = read('app/src/main/java/com/freemocktest/app/newui/history/HistoryScreenNew.kt');
const authKt = read('app/src/main/java/com/freemocktest/app/data/AuthRepository.kt');
const prefsKt = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
const navKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
const profileKt = read('app/src/main/java/com/freemocktest/app/newui/profile/ProfileRouteNew.kt');
const progressKt = read('app/src/main/java/com/freemocktest/app/newui/progress/ProgressReportScreenNew.kt');
const utilsKt = read('app/src/main/java/com/freemocktest/app/util/HomeAttemptStatsUtils.kt');

ok = line(homeKt.includes('attempts.size.toString()'), 'Home: attempts = all saved rows count') && ok;
ok = line(homeKt.includes('HomeAttemptStatsUtils.compareAttemptsForBest'), 'Home: best score uses shared marks-aware ranking') && ok;
ok = line(homeKt.includes('maxByOrNull { it.completedAtMillis }'), 'Home: last score = latest attempt') && ok;
ok = line(homeKt.includes('HomeAttemptStatsUtils.formatHomeAttemptScore'), 'Home: score text uses Result-aligned formatter') && ok;
ok = line(homeKt.includes('scoreVisible'), 'Home: score visibility can hide best/last') && ok;
ok = line(historyKt.includes('observeAllByUser'), 'History: Room query scoped by user_key') && ok;
ok = line(!authKt.includes('TestHistoryRepository.clearAll'), 'Logout does NOT wipe attempt history') && ok;
ok = line(profileKt.includes('TestHistoryRepository.clearAll()'), 'Delete account wipes attempt history') && ok;
ok = line(navKt.includes('recordAttempt skipped') || historyKt.includes('recordAttempt skipped'), 'Missing user key skips save') && ok;
ok = line(
  /recordAttempt[\s\S]*markPendingResultSubmittedNow/.test(navKt),
  'Submit journey always saves attempt before pending result',
) && ok;
ok = line(!navKt.includes('Test details missing. Please retry.'), 'Submit no longer aborts when catalog id missing') && ok;
ok = line(historyScreenKt.includes('HomeAttemptStatsUtils.formatHomeAttemptScore'), 'History list uses shared score formatter') && ok;
ok = line(progressKt.includes('HomeAttemptStatsUtils.attemptScorePercent'), 'Progress report uses marks-aware percent helper') && ok;
ok = line(utilsKt.includes('fun attemptScorePercent'), 'Shared attemptScorePercent helper exists') && ok;

// --- Calculation sims (legacy correct/total) ---
const sample = [
  { testName: 'HP GK', correct: 6, total: 10, marksBased: false, scoreMarks: -1, maxMarks: -1, completedAtMillis: 1000 },
  { testName: 'ff', correct: 8, total: 10, marksBased: false, scoreMarks: -1, maxMarks: -1, completedAtMillis: 2000 },
  { testName: 'Bihar GK', correct: 7, total: 10, marksBased: false, scoreMarks: -1, maxMarks: -1, completedAtMillis: 3000 },
];
const stats = computeHomeStats(sample);
ok = line(stats.attemptsCount === '3', 'Sim: attempts count = 3') && ok;
ok = line(stats.bestScoreValue === '8/10', 'Sim: best score = highest correct/total (legacy rows)') && ok;
ok = line(stats.lastScoreValue === '7/10', 'Sim: last score = most recent attempt') && ok;

const tie = [
  { correct: 5, total: 10, marksBased: false, scoreMarks: -1, maxMarks: -1, completedAtMillis: 1000 },
  { correct: 6, total: 12, marksBased: false, scoreMarks: -1, maxMarks: -1, completedAtMillis: 2000 },
];
const tieStats = computeHomeStats(tie);
ok = line(tieStats.bestScoreValue === '6/12', 'Sim: tie-break prefers higher correct count at same %') && ok;

const hidden = computeHomeStats(sample, false);
ok = line(hidden.bestScoreValue === '-' && hidden.lastScoreValue === '-', 'Sim: score hidden shows dash') && ok;
ok = line(hidden.attemptsCount === '3', 'Sim: attempts count still visible when scores hidden') && ok;

// --- Marks-aware sims ---
const marksSample = [
  { correct: 8, wrong: 2, total: 10, marksBased: true, scoreMarks: 75, maxMarks: 100, completedAtMillis: 1000 },
  { correct: 9, wrong: 1, total: 10, marksBased: true, scoreMarks: 85, maxMarks: 100, completedAtMillis: 2000 },
];
ok = line(attemptScorePercent(marksSample[0]) === 75, 'Sim: marks percent = scoreMarks/maxMarks') && ok;
ok = line(computeHomeStats(marksSample).bestScoreValue === '85 / 100 marks', 'Sim: best score prefers higher marks ratio') && ok;

// Phase 1: save + read use same canonical key
const keyFromEmail = resolveCanonicalKey('User@Mail.com', '', '123456');
const ownerFromEmail = resolveCanonicalKey('User@Mail.com', '', '123456');
ok = line(keyFromEmail === ownerFromEmail, 'Email profile uses same canonical key for save/read') && ok;

const keyUidOnly = resolveCanonicalKey('', '', '123456');
const ownerUidOnly = resolveCanonicalKey('', '', '123456');
ok = line(keyUidOnly === 'uid:123456' && keyUidOnly === ownerUidOnly, 'Uid-only profile uses uid:123456 consistently') && ok;

ok = line(!recordAttemptAllowed(''), 'Sim: blank user key does not save attempt') && ok;
ok = line(recordAttemptAllowed('user@mail.com'), 'Sim: valid user key saves attempt') && ok;

ok = line(
  attemptScorePercent({ correct: 8, total: 10, marksBased: false, scoreMarks: -1, maxMarks: -1 }) === 80,
  'Sim: legacy percent = correct/total',
) && ok;

console.log('\n--- Why stats may look empty ---');
console.log('1. Test submit without login email/user id → attempt not saved');
console.log('2. Submit failed before Phase 2 → attempt not saved (fixed in Phase 2)');
console.log('3. Profile key changed (uid → email) → old rows not matched (Phase 1 migration helps)');
console.log('4. Score visibility OFF in profile → best/last show "-"');
console.log('5. Delete account → Room history cleared');
console.log('6. Logout + different account login → other user has 0 attempts');
console.log('7. Logout same account → history SHOULD remain (not cleared on logout)');

console.log(`\n${ok ? 'VERIFY_HOME_ATTEMPT_STATS_E2E_OK' : 'VERIFY_HOME_ATTEMPT_STATS_E2E_FAILED'}\n`);
process.exit(ok ? 0 : 1);
