#!/usr/bin/env node
'use strict';

/**
 * Phase 8 — server login-only daily quiz (public digest/quiz-today deprecated).
 *
 * Usage:
 *   node scripts/verifyDailyQuizLoginOnlyServerPhase8.js
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
  console.log('=== Phase 8: server login-only daily quiz ===\n');
  let ok = true;

  const index = read('server/src/index.js');
  const digest = read('server/src/routes/digest.js');
  const dailyQuiz = read('server/src/routes/dailyQuiz.js');
  const publicApi = read('app/src/main/java/com/freemocktest/app/data/remote/PublicApiService.kt');

  ok =
    line(
      index.includes("app.use('/v1/daily-quiz', requireAuth") &&
        index.includes("app.use('/v1/digest', digestRouter)"),
      'index: daily-quiz auth-mounted; digest remains public for /today only',
    ) && ok;

  ok =
    line(
      digest.includes("router.get('/quiz-today'") &&
        digest.includes('res.status(410)') &&
        digest.includes('loginRequired: true') &&
        digest.includes('/v1/daily-quiz/today') &&
        !digest.includes('selectDailyQuizItemsForDay'),
      'digest /quiz-today returns 410 Gone (no public quiz delivery)',
    ) && ok;

  ok =
    line(
      dailyQuiz.includes("router.get('/today'") &&
        dailyQuiz.includes('selectScopedDailyQuizItemsForDay') &&
        dailyQuiz.includes('parseDailyQuizScopeQueryInput'),
      'auth GET /v1/daily-quiz/today: scoped delivery for signed-in users',
    ) && ok;

  ok =
    line(
      !publicApi.includes('digest/quiz-today'),
      'Android PublicApiService: no guest daily quiz client',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_LOGIN_ONLY_SERVER_PHASE8_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_LOGIN_ONLY_SERVER_PHASE8_FAILED');
  process.exit(1);
}

main();
