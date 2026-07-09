#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — admin-web Active Target sticky bar for daily quiz bulk add.
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopePhase2.js
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

function main() {
  console.log('=== Phase 2: admin Active Target sticky bar ===\n');
  let ok = true;

  const app = read('admin-web/src/App.tsx');
  const scopeUi = read('admin-web/src/components/dailyQuiz/dailyQuizScopeUi.ts');
  const quizTab = extractDailyQuizTab(app);

  ok =
    line(
      scopeUi.includes('loadDailyQuizActiveTarget') &&
        scopeUi.includes('saveDailyQuizActiveTarget') &&
        scopeUi.includes('buildDailyQuizScopePostBody'),
      'dailyQuizScopeUi helpers present',
    ) && ok;

  ok =
    line(
      app.includes("from './components/dailyQuiz/dailyQuizScopeUi'") &&
        quizTab.includes('Active Target') &&
        quizTab.includes('activeTargetScope') &&
        quizTab.includes('activeTargetState') &&
        quizTab.includes('activeCategoryId'),
      'DailyQuizTab: Active Target sticky state wired',
    ) && ok;

  ok =
    line(
      quizTab.includes('saveDailyQuizActiveTarget') &&
        quizTab.includes('loadDailyQuizActiveTarget'),
      'Active Target persisted in localStorage',
    ) && ok;

  ok =
    line(
      quizTab.includes('signupStateOptions') &&
        quizTab.includes('signupRegions?.items'),
      'State dropdown loads from signupRegions settings',
    ) && ok;

  ok =
    line(
      quizTab.match(/createDailyQuizItem[\s\S]{0,1800}scope:\s*scopeBody\.scope/) &&
        quizTab.match(/createDailyQuizItem[\s\S]{0,1800}targetStates:\s*scopeBody\.targetStates/),
      'POST /daily-quiz sends scope from Active Target bar',
    ) && ok;

  ok =
    line(
      quizTab.match(/createDailyQuizItem[\s\S]{0,2200}setQuestionPrompt\(''\)/) &&
        !quizTab.match(/createDailyQuizItem[\s\S]{0,2200}setActiveTargetScope\(/) &&
        !quizTab.match(/createDailyQuizItem[\s\S]{0,2200}setActiveTargetState\(/),
      'Add clears question fields only — Active Target stays sticky',
    ) && ok;

  ok =
    line(
      quizTab.includes('formatDailyQuizScopeLabel') &&
        quizTab.includes('<span>Scope</span>'),
      'Question list shows scope column',
    ) && ok;

  const addFormStart = quizTab.indexOf('className="question-form"');
  const addFormEnd = quizTab.indexOf('</form>', addFormStart);
  const addForm =
    addFormStart >= 0 && addFormEnd > addFormStart
      ? quizTab.slice(addFormStart, addFormEnd)
      : '';

  ok =
    line(
      !addForm.includes('targetStates') && !addForm.includes('activeTargetState'),
      'No per-question state dropdown in add form',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_PHASE2_FAILED');
  process.exit(1);
}

main();
