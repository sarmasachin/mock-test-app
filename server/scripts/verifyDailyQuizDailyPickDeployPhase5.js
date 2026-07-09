#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — static deploy readiness for daily quiz daily-pick (Phases 1–4).
 *
 * Usage:
 *   node scripts/verifyDailyQuizDailyPickDeployPhase5.js
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
  console.log('=== Phase 5: daily quiz daily-pick deploy readiness ===\n');
  let ok = true;

  const pkg = read('server/package.json');
  ok =
    line(
      pkg.includes('verify:daily-quiz-daily-pick-all-phase4') &&
        pkg.includes('verify:daily-quiz-daily-pick-all-phase5'),
      'package.json: phase 4 + phase 5 verify scripts registered',
    ) && ok;

  ok = line(fs.existsSync(path.join(ROOT, 'database/postgres/022_daily_quiz_batch_client_submission.sql')), 'migration 022 present (batch submit fix)') && ok;

  const indexJs = read('server/src/index.js');
  ok =
    line(
      indexJs.includes('idx_daily_quiz_attempts_client_submission_lookup') &&
        indexJs.includes('DROP INDEX IF EXISTS idx_daily_quiz_attempts_client_submission'),
      'server bootstrap: batch client_submission lookup index',
    ) && ok;

  const utils = read('server/src/lib/dailyQuizUtils.js');
  ok =
    line(
      utils.includes('selectDailyQuizItemsForDay') &&
        utils.includes('questionsPerDay') &&
        !utils.includes('maxBankSize'),
      'dailyQuizUtils: daily pick + unlimited bank',
    ) && ok;

  const digest = read('server/src/routes/digest.js');
  ok =
    line(
      digest.includes('selectDailyQuizItemsForDay') &&
        digest.includes('questionCount: quizItems.length'),
      'digest /quiz-today wired for daily pick',
    ) && ok;

  const adminApp = read('admin-web/src/App.tsx');
  ok =
    line(
      adminApp.includes('saveDailyQuizDeliverySettings') &&
        adminApp.includes('questionsPerDay') &&
        adminApp.includes('Question bank size is unlimited') &&
        !adminApp.includes('maxBankSize'),
      'admin-web: delivery settings + dynamic bank count',
    ) && ok;

  const androidRepo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const androidUi = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  ok =
    line(
      androidRepo.includes('val questionCount: Int') &&
        androidUi.includes('dailyQuizQuestionCount') &&
        androidUi.includes("Today's quiz has"),
      'Android: daily pick delivery count wiring',
    ) && ok;

  const gradle = read('app/build.gradle.kts');
  ok =
    line(
      /versionCode\s*=\s*9/.test(gradle) && /versionName\s*=\s*"1\.0\.8"/.test(gradle),
      'Android: release version bumped to 1.0.8 (versionCode 9)',
    ) && ok;

  const deployTxt = read('deploy/DEPLOY.txt');
  ok =
    line(
      deployTxt.includes('pm2 restart mocktest-api') &&
        deployTxt.includes('admin-web') &&
        deployTxt.includes('git pull origin main'),
      'deploy/DEPLOY.txt: standard redeploy steps documented',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_DAILY_PICK_DEPLOY_PHASE5_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_DAILY_PICK_DEPLOY_PHASE5_FAILED');
  process.exit(1);
}

main();
