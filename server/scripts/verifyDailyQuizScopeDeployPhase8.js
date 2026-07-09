#!/usr/bin/env node
'use strict';

/**
 * Phase 8 — deploy readiness for state + category scoped daily quiz (Phases 0–7).
 * Offline only — no DB or network required.
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopeDeployPhase8.js
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
  console.log('=== Phase 8: daily quiz scope deploy readiness ===\n');
  let ok = true;

  const pkg = read('server/package.json');
  ok =
    line(
      pkg.includes('verify:daily-quiz-scope-all') &&
        pkg.includes('verify:daily-quiz-scope-phase7') &&
        pkg.includes('verify:daily-quiz-scope-deploy-phase8') &&
        pkg.includes('verify:daily-quiz-scope-all-phase8'),
      'package.json: scope phase 0–8 verify scripts registered',
    ) && ok;

  const phaseScripts = [
    'verifyDailyQuizScopePhase0.js',
    'verifyDailyQuizScopePhase1.js',
    'verifyDailyQuizScopePhase2.js',
    'verifyDailyQuizScopePhase3.js',
    'verifyDailyQuizScopePhase4.js',
    'verifyDailyQuizScopePhase7.js',
    'verifyDailyQuizAndroidScopePhase5.js',
    'verifyDailyQuizAndroidScopePhase6.js',
    'verifyDailyQuizScopeDeployPhase8.js',
    'e2eDailyQuizScopeLivePhase8.js',
    'verifyDailyQuizScopeAllPhase8.js',
  ];
  for (const script of phaseScripts) {
    ok = line(fs.existsSync(path.join(ROOT, 'server/scripts', script)), `script present: ${script}`) && ok;
  }

  ok =
    line(
      fs.existsSync(path.join(ROOT, 'database/postgres/017_daily_quiz_attempts.sql')) &&
        fs.existsSync(path.join(ROOT, 'database/postgres/018_daily_quiz_multi_question.sql')) &&
        fs.existsSync(path.join(ROOT, 'database/postgres/022_daily_quiz_batch_client_submission.sql')),
      'daily quiz DB migrations present (no new migration for scope — JSON in app_settings)',
    ) && ok;

  const utils = read('server/src/lib/dailyQuizUtils.js');
  ok =
    line(
      utils.includes('parseOptionalDailyQuizDeliveryScope') &&
        utils.includes('resolveDailyQuizScopedItemIds') &&
        utils.includes('selectScopedDailyQuizItemsForDay') &&
        utils.includes('loadDailyQuizRankForUserOnDay'),
      'dailyQuizUtils: full scope delivery + analytics stack',
    ) && ok;

  const admin = read('server/src/routes/admin.js');
  ok =
    line(
      admin.includes('deliveryScope:') &&
        admin.includes('parseOptionalDailyQuizDeliveryScope') &&
        admin.includes("router.get('/daily-quiz/categories'"),
      'admin routes: scoped analytics + category API',
    ) && ok;

  const dailyQuiz = read('server/src/routes/dailyQuiz.js');
  ok =
    line(
      dailyQuiz.includes("router.get('/today'") &&
        dailyQuiz.includes('parseDailyQuizScopeQueryInput') &&
        dailyQuiz.includes('loadDailyQuizRankForUserOnDay'),
      'user routes: scoped /today + scoped leaderboard rank',
    ) && ok;

  const digest = read('server/src/routes/digest.js');
  ok =
    line(
      digest.includes('filterEligibleDailyQuizItems') &&
        digest.includes('DAILY_QUIZ_SCOPE_ALL_INDIA'),
      'digest /quiz-today: public all_india fallback only',
    ) && ok;

  const scopeUi = read('admin-web/src/components/dailyQuiz/dailyQuizScopeUi.ts');
  const filterUi = read('admin-web/src/components/dailyQuiz/DailyQuizDeliveryScopeFilter.tsx');
  ok =
    line(
      scopeUi.includes('buildDailyQuizAnalyticsScopeParams') &&
        filterUi.includes('DailyQuizDeliveryScopeFilter'),
      'admin-web: analytics delivery scope filter UI',
    ) && ok;

  const androidScope = read('app/src/main/java/com/freemocktest/app/data/DailyQuizScopeSelection.kt');
  const androidDigest = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  ok =
    line(
      androidScope.includes('fun cacheKey()') &&
        androidDigest.includes('DailyQuizScopeSelectorCard') &&
        androidDigest.includes('loadDailyQuizToday(selectedQuizScope)'),
      'Android: scope selector + scoped API + cache',
    ) && ok;

  const gradle = read('app/build.gradle.kts');
  ok =
    line(
      /versionCode\s*=\s*10/.test(gradle) && /versionName\s*=\s*"1\.0\.9"/.test(gradle),
      'Android: release version bumped to 1.0.9 (versionCode 10) for scope release',
    ) && ok;

  const deployTxt = read('deploy/DEPLOY.txt');
  ok =
    line(
      deployTxt.includes('pm2 restart mocktest-api') &&
        deployTxt.includes('admin-web') &&
        deployTxt.includes('git pull origin main') &&
        deployTxt.includes('verify:daily-quiz-scope-all-phase8'),
      'deploy/DEPLOY.txt: redeploy steps + scope release note',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_DEPLOY_PHASE8_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_DEPLOY_PHASE8_FAILED');
  process.exit(1);
}

main();
