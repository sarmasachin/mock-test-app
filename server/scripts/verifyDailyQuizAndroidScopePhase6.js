#!/usr/bin/env node
'use strict';

/**
 * Phase 6 — Android scoped daily-quiz/today API + per-scope cache.
 *
 * Usage:
 *   node scripts/verifyDailyQuizAndroidScopePhase6.js
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
  console.log('=== Phase 6: Android scoped API + cache ===\n');
  let ok = true;

  const appApi = read('app/src/main/java/com/freemocktest/app/data/remote/AppApiService.kt');
  const repo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
  const ui = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  const scopeModel = read('app/src/main/java/com/freemocktest/app/data/DailyQuizScopeSelection.kt');

  ok =
    line(
      appApi.includes('@GET("daily-quiz/today")') &&
        appApi.includes('getDailyQuizTodayScoped') &&
        appApi.includes('@Query("scope")') &&
        appApi.includes('@Query("state")'),
      'AppApiService: scoped GET /daily-quiz/today',
    ) && ok;

  ok =
    line(
      repo.includes('getDailyQuizTodayScoped') &&
        repo.includes('DailyQuizRepository.isLoggedIn()') &&
        !repo.includes('publicApi.getDailyQuizToday()'),
      'ContentRepository: login-only scoped API (no guest fallback)',
    ) && ok;

  ok =
    line(
      repo.includes('peekCachedDailyQuizToday') &&
        repo.includes('saveCachedDailyQuizToday') &&
        repo.includes('dailyQuizScopeCacheKey') &&
        prefs.includes('keyDailyQuizTodayByScopeJson'),
      'per-scope disk cache wired',
    ) && ok;

  ok =
    line(
      scopeModel.includes('fun cacheKey()') &&
        repo.includes('scope.cacheKey()'),
      'cache keys align with server scopeKey slugs',
    ) && ok;

  ok =
    line(
      ui.includes('LaunchedEffect(quizReloadTick, selectedQuizScope, dailyQuizSessionKey)') &&
        ui.includes('ContentRepository.loadDailyQuizToday(selectedQuizScope)') &&
        ui.includes('peekCachedDailyQuizToday(selectedQuizScope)'),
      'UI reloads on scope change with SWR cache',
    ) && ok;

  ok =
    line(
      prefs.includes('keyDailyQuizTodayByScopeJson') &&
        prefs.match(/clearAuthSessionPrefs[\s\S]{0,2200}keyDailyQuizTodayByScopeJson/),
      'scope quiz cache cleared on logout',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_ANDROID_SCOPE_PHASE6_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_ANDROID_SCOPE_PHASE6_FAILED');
  process.exit(1);
}

main();
