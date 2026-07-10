#!/usr/bin/env node
'use strict';

/**
 * Phase 6 — login-only user scoping (no guest local storage keys).
 *
 * Usage:
 *   node scripts/verifyDailyQuizLoginOnlyPhase6.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function main() {
  console.log('=== Phase 6: login-only user scoping ===\n');
  let ok = true;

  const auth = read('app/src/main/java/com/freemocktest/app/data/AuthRepository.kt');
  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
  const history = read('app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt');
  const content = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const review = read('app/src/main/java/com/freemocktest/app/data/AttemptReviewLoader.kt');
  const nav = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
  const quiz = read('app/src/main/java/com/freemocktest/app/newui/quiz/QuizScreenNew.kt');
  const digest = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  const publicApi = read('app/src/main/java/com/freemocktest/app/data/remote/PublicApiService.kt');
  const dashboard = read('admin-web/src/components/dailyQuiz/DailyQuizDashboard.tsx');
  const dashVerify = read('server/scripts/verifyDailyQuizDashboardPhase1.js');

  ok =
    line(
      auth.includes('resolveLoggedInUserScopeKey') &&
        auth.includes('fun isLoggedIn()'),
      'AuthRepository: logged-in user scope helper',
    ) && ok;

  ok =
    line(
      prefs.includes('peekContentStateOwnerIdNow') &&
        prefs.includes('normalizeOwnerUserKey') &&
        !prefs.includes('else -> "guest"') &&
        prefs.includes('ownerStored.equals("guest"'),
      'AppPreferencesRepository: no guest owner id + legacy guest purge',
    ) && ok;

  ok =
    line(
      history.includes('normalizeUserKey') &&
        !history.includes('"guest"'),
      'TestHistoryRepository: skip writes without user key',
    ) && ok;

  ok =
    line(
      content.includes('resolveQuizCacheUserScope') &&
        content.includes('AuthRepository.isLoggedIn()') &&
        !content.match(/resolveQuizCacheUserScope[\s\S]{0,500}return "guest"/),
      'ContentRepository: quiz cache requires login',
    ) && ok;

  ok =
    line(
      review.includes('AuthRepository.resolveLoggedInUserScopeKey') &&
        !review.includes('return "guest"'),
      'AttemptReviewLoader: login-only owner scope',
    ) && ok;

  ok =
    line(
      nav.includes('attemptsUserKey') &&
        !nav.includes('"guest"'),
      'MainBottomNavHost: no guest attempts key',
    ) && ok;

  ok =
    line(
      quiz.includes('attemptsUserKey.trim()') &&
        !quiz.includes('"guest"'),
      'QuizScreenNew: no guest quiz owner',
    ) && ok;

  ok =
    line(
      digest.includes('!DailyQuizRepository.isLoggedIn()') &&
        digest.includes('"User"'),
      'DailyDigestScreenNew: login gate + User display fallback',
    ) && ok;

  ok =
    line(
      !publicApi.includes('digest/quiz-today') &&
        !content.includes('publicApi.getDailyQuizToday()'),
      'PublicApiService: no guest daily quiz endpoint on Android',
    ) && ok;

  ok =
    line(
      dashboard.includes('DAILY_QUIZ_ANALYTICS_TABS') &&
        dashboard.includes('dq-tab-panel-open') &&
        dashVerify.includes('activeAnalyticsTab') &&
        !dashVerify.includes("activeTab === 'overview'"),
      'admin dashboard verify matches expandable tabs UX',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_LOGIN_ONLY_PHASE6_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_LOGIN_ONLY_PHASE6_FAILED');
  process.exit(1);
}

main();
