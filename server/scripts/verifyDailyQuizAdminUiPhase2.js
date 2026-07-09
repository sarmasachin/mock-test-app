#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — admin-web Daily Quiz delivery settings UI.
 *
 * Usage:
 *   node scripts/verifyDailyQuizAdminUiPhase2.js
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

function extractDailyQuizTab(source) {
  const start = source.indexOf('function DailyQuizTab(');
  if (start < 0) return '';
  const next = source.indexOf('\nfunction ', start + 1);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

function extractDailyDigestTab(source) {
  const start = source.indexOf('function DailyDigestTab(');
  if (start < 0) return '';
  const next = source.indexOf('\nfunction ', start + 1);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

function main() {
  console.log('=== Phase 2: daily quiz admin delivery UI ===\n');
  let ok = true;

  const app = read('admin-web/src/App.tsx');
  const quizTab = extractDailyQuizTab(app);
  const digestTab = extractDailyDigestTab(app);

  ok = line(quizTab.includes('function DailyQuizTab('), 'DailyQuizTab component present') && ok;

  ok =
    line(
      quizTab.includes('questionsPerDay') &&
        quizTab.includes('saveDailyQuizDeliverySettings') &&
        !quizTab.includes('maxBankSize'),
      'DailyQuizTab: questionsPerDay only (no fixed bank cap field)',
    ) && ok;

  ok =
    line(
      quizTab.includes('Question bank size is unlimited') &&
        quizTab.includes('Bank size:'),
      'DailyQuizTab: shows dynamic bank count to admin',
    ) && ok;

  ok =
    line(
      quizTab.match(/saveDailyQuizDeliverySettings[\s\S]{0,900}questionsPerDay:\s*qpd/) &&
        !quizTab.match(/saveDailyQuizDeliverySettings[\s\S]{0,900}maxBankSize:/),
      'DailyQuizTab: PATCH sends questionsPerDay only',
    ) && ok;

  ok =
    line(
      quizTab.match(/saveDailyQuizDeliverySettings[\s\S]{0,1200}releaseHour:/) &&
        quizTab.match(/saveDailyQuizDeliverySettings[\s\S]{0,1200}timezoneOffsetMinutes:/),
      'DailyQuizTab: PATCH preserves schedule fields (no wipe)',
    ) && ok;

  ok =
    line(
      quizTab.includes("apiClient.get('/admin/settings')") &&
        quizTab.match(/load\([\s\S]{0,1200}schedule\.questionsPerDay/),
      'DailyQuizTab: load reads settings from server',
    ) && ok;

  ok =
    line(
      digestTab.includes('dailyQuestionsPerDay') &&
        digestTab.match(/saveDailySchedule[\s\S]{0,700}questionsPerDay:/) &&
        !digestTab.includes('maxBankSize'),
      'DailyDigestTab: schedule save preserves questionsPerDay only',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_ADMIN_UI_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_ADMIN_UI_PHASE2_FAILED');
  process.exit(1);
}

main();
