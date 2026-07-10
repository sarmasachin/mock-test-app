#!/usr/bin/env node
'use strict';

/**
 * Phase 5 hardening — scopeKey in submit responses, rank preserve on sync,
 * network fallback, login-only daily quiz, 401 session handling.
 *
 * Usage:
 *   node scripts/verifyDailyQuizHardeningPhase5.js
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
  console.log('=== Phase 5 hardening: rank scope + session safety ===\n');
  let ok = true;

  const serverRoute = read('server/src/routes/dailyQuiz.js');
  const apiModels = read('app/src/main/java/com/freemocktest/app/data/remote/ApiModels.kt');
  const quizRepo = read('app/src/main/java/com/freemocktest/app/data/DailyQuizRepository.kt');
  const contentRepo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const ui = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');

  ok =
    line(
      serverRoute.includes('buildBatchSuccessResponse') &&
        serverRoute.includes('scopeKey: buildDailyQuizScopeKey(userScope)') &&
        serverRoute.match(/buildBatchSuccessResponse[\s\S]{0,400}scopeKey/),
      'server batch response includes scopeKey',
    ) && ok;

  ok =
    line(
      serverRoute.match(/return res\.status\(201\)\.json\([\s\S]{0,120}\.\.\.scopeFields/) &&
        serverRoute.match(/X-Idempotent-Replay[\s\S]{0,120}\.\.\.scopeFields/),
      'server single-submit + idempotent replay include scopeKey',
    ) && ok;

  ok =
    line(
      apiModels.includes('DailyQuizBatchSubmitResponse') &&
        apiModels.match(/DailyQuizBatchSubmitResponse[\s\S]{0,300}scopeKey/) &&
        apiModels.match(/DailyQuizDayAttemptResponse[\s\S]{0,300}scopeKey/),
      'Android API models carry scopeKey',
    ) && ok;

  ok =
    line(
      quizRepo.includes('prior.rank') &&
        quizRepo.includes('prior.scopeKey') &&
        quizRepo.includes('fallbackScopeKey = scope.cacheKey()') &&
        quizRepo.includes('res.scopeKey'),
      'sync preserves rank/scopeKey; responses use server scopeKey',
    ) && ok;

  ok =
    line(
      quizRepo.match(/loadDayFromServer[\s\S]{0,2500}loadDailyQuizDayResult\(day\)/),
      'loadDayFromServer falls back to local cache on network error',
    ) && ok;

  ok =
    line(
      quizRepo.includes('e.code() == 401') &&
        quizRepo.includes('AuthRepository.clearSession()'),
      'repository clears session on 401',
    ) && ok;

  ok =
    line(
      contentRepo.includes('DailyQuizRepository.isLoggedIn()') &&
        !contentRepo.includes('publicApi.getDailyQuizToday()'),
      'ContentRepository: login-only daily quiz (no guest public API)',
    ) && ok;

  ok =
    line(
      ui.includes('dayResultLoading') &&
        ui.includes('isDayResultLoading') &&
        ui.includes('loadDayResultForCurrentUser(selectedDate, selectedQuizScope)'),
      'UI: scope-aware day result load without TAKE TEST blink',
    ) && ok;

  ok =
    line(
      ui.includes('AuthRepository.clearSession()') &&
        ui.includes('serverResult.httpCode == 401'),
      'UI: 401 on quiz load / batch submit clears session',
    ) && ok;

  ok =
    line(
      prefs.match(/DailyQuizDayResult[\s\S]{0,500}scopeKey/) &&
        ui.includes('!DailyQuizRepository.isLoggedIn()'),
      'login gate + scopeKey on cached day results',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_HARDENING_PHASE5_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_HARDENING_PHASE5_FAILED');
  process.exit(1);
}

main();
