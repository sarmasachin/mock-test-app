#!/usr/bin/env node
'use strict';

/**
 * Phase 3 — dynamic daily quiz category list + sticky category dropdown.
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopePhase3.js
 */

const fs = require('fs');
const path = require('path');
const {
  normalizeDailyQuizCategoryId,
} = require('../src/lib/dailyQuizUtils');
const {
  normalizeDailyQuizCategorySlug,
  DEFAULT_DAILY_QUIZ_CATEGORIES,
} = require('../src/lib/dailyQuizCategoryOptions');

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

function main() {
  console.log('=== Phase 3: dynamic daily quiz categories ===\n');
  let ok = true;

  const admin = read('server/src/routes/admin.js');
  const rbac = read('server/src/lib/adminRoutePermissions.js');
  const scopeUi = read('admin-web/src/components/dailyQuiz/dailyQuizScopeUi.ts');
  const app = read('admin-web/src/App.tsx');
  const quizTab = extractDailyQuizTab(app);
  const categoryLib = read('server/src/lib/dailyQuizCategoryOptions.js');

  ok =
    line(
      categoryLib.includes('dailyQuizCategoryOptions') &&
        categoryLib.includes('getDailyQuizCategoryList') &&
        categoryLib.includes('setDailyQuizCategoryList'),
      'dailyQuizCategoryOptions lib present',
    ) && ok;

  ok =
    line(
      admin.includes("router.get('/daily-quiz/categories'") &&
        admin.includes("router.put('/daily-quiz/categories'") &&
        admin.includes('getDailyQuizCategoryList'),
      'admin GET/PUT /daily-quiz/categories wired',
    ) && ok;

  ok =
    line(
      (rbac.includes('daily-quiz\\/categories') || rbac.includes('daily-quiz/categories')) &&
        rbac.includes("'tab_daily_quiz'"),
      'RBAC rules for daily quiz categories',
    ) && ok;

  ok =
    line(
      normalizeDailyQuizCategorySlug(' HP GK ') === 'hp-gk' &&
        normalizeDailyQuizCategorySlug('!!!') === null &&
        Array.isArray(DEFAULT_DAILY_QUIZ_CATEGORIES) &&
        DEFAULT_DAILY_QUIZ_CATEGORIES.length === 0,
      'category slug normalization + empty default list',
    ) && ok;

  ok =
    line(
      normalizeDailyQuizCategorySlug('hp-gk') === normalizeDailyQuizCategoryId('hp-gk'),
      'category lib uses same slug rules as dailyQuizUtils',
    ) && ok;

  ok =
    line(
      scopeUi.includes('mergeDailyQuizCategoryOptions'),
      'admin UI merges API categories with bank item slugs',
    ) && ok;

  ok =
    line(
      quizTab.includes("apiClient.get('/admin/daily-quiz/categories')") &&
        quizTab.includes('categoryOptions') &&
        quizTab.includes('addDailyQuizCategory') &&
        quizTab.includes('removeDailyQuizCategory'),
      'DailyQuizTab loads and manages category list',
    ) && ok;

  ok =
    line(
      quizTab.includes('No category') &&
        quizTab.includes('aria-label="Active target category"') &&
        !quizTab.includes('placeholder="Category slug (optional'),
      'Active Target uses sticky category dropdown (not free-text input)',
    ) && ok;

  ok =
    line(
      quizTab.match(/createDailyQuizItem[\s\S]{0,2200}setActiveCategoryId\(/) === null &&
        quizTab.match(/createDailyQuizItem[\s\S]{0,2200}setCategoryOptions\(/) === null,
      'Add still preserves sticky category selection',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_PHASE3_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_PHASE3_FAILED');
  process.exit(1);
}

main();
