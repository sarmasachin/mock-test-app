#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — Admin POST/PATCH persist daily quiz scope fields (server only).
 *
 * Usage:
 *   node scripts/verifyDailyQuizScopePhase1.js
 */

const fs = require('fs');
const path = require('path');
const {
  DAILY_QUIZ_SCOPE_ALL_INDIA,
  DAILY_QUIZ_SCOPE_STATE,
  normalizeAdminDailyQuizItem,
  getAdminDailyQuizItemScopeError,
  mergeDailyQuizItemScopeFields,
  selectDailyQuizItemsForDay,
  normalizeDailyQuizSettingsFields,
} = require('../src/lib/dailyQuizUtils');

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

function baseBody(overrides = {}) {
  return {
    questionPrompt: 'Sample question?',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 1,
    explanation: 'Because B',
    isPublished: true,
    ...overrides,
  };
}

function main() {
  console.log('=== Phase 1: admin save daily quiz scope fields ===\n');
  let ok = true;

  const admin = read('server/src/routes/admin.js');
  const digest = read('server/src/routes/digest.js');

  ok =
    line(
      admin.includes('normalizeAdminDailyQuizItem') &&
        admin.includes('getAdminDailyQuizItemScopeError') &&
        admin.includes('mergeDailyQuizItemScopeFields'),
      'admin routes import scope normalizers',
    ) && ok;

  ok =
    line(
      admin.includes("router.post('/daily-quiz'") &&
        admin.includes('const scopeError = getAdminDailyQuizItemScopeError(body)') &&
        admin.includes('const normalized = normalizeAdminDailyQuizItem(body)'),
      'POST /daily-quiz validates scope then normalizes',
    ) && ok;

  ok =
    line(
      admin.includes("router.patch('/daily-quiz/:id'") &&
        admin.includes('const scopeError = getAdminDailyQuizItemScopeError(merged)'),
      'PATCH /daily-quiz/:id validates merged scope before save',
    ) && ok;

  ok =
    line(
      admin.includes('rawItems.map((x) => mergeDailyQuizItemScopeFields(x))'),
      'GET /daily-quiz returns normalized scope fields for legacy items',
    ) && ok;

  const legacy = normalizeAdminDailyQuizItem(baseBody({ id: 'legacy-post' }));
  ok =
    line(
      legacy &&
        legacy.scope === DAILY_QUIZ_SCOPE_ALL_INDIA &&
        legacy.targetStates.length === 0 &&
        legacy.categoryId === null,
      'POST without scope fields saves all_india defaults',
    ) && ok;

  const hp = normalizeAdminDailyQuizItem(
    baseBody({
      id: 'hp-post',
      scope: 'state',
      targetStates: ['Himachal Pradesh'],
      categoryId: 'hp-gk',
    }),
  );
  ok =
    line(
      hp &&
        hp.scope === DAILY_QUIZ_SCOPE_STATE &&
        hp.targetStates[0] === 'Himachal Pradesh' &&
        hp.categoryId === 'hp-gk',
      'POST state item persists scope + categoryId',
    ) && ok;

  ok =
    line(
      getAdminDailyQuizItemScopeError({ scope: 'state', targetStates: [] }) !== null &&
        normalizeAdminDailyQuizItem(baseBody({ scope: 'state', targetStates: [] })) === null,
      'state scope without targetStates rejected',
    ) && ok;

  const existing = normalizeAdminDailyQuizItem(
    baseBody({
      id: 'patch-keep',
      scope: 'state',
      targetStates: ['Punjab'],
      categoryId: 'pb-gk',
    }),
  );
  const patched = normalizeAdminDailyQuizItem(
    {
      ...existing,
      questionPrompt: 'Updated prompt?',
    },
    existing.id,
  );
  ok =
    line(
      patched &&
        patched.questionPrompt === 'Updated prompt?' &&
        patched.scope === DAILY_QUIZ_SCOPE_STATE &&
        patched.targetStates[0] === 'Punjab' &&
        patched.categoryId === 'pb-gk',
      'PATCH text-only preserves existing scope fields',
    ) && ok;

  const downgraded = normalizeAdminDailyQuizItem(
    {
      ...existing,
      scope: 'all_india',
    },
    existing.id,
  );
  ok =
    line(
      downgraded &&
        downgraded.scope === DAILY_QUIZ_SCOPE_ALL_INDIA &&
        downgraded.targetStates.length === 0,
      'PATCH scope=all_india clears targetStates',
    ) && ok;

  const mergedLegacy = mergeDailyQuizItemScopeFields({
    id: 'db-legacy',
    questionPrompt: 'Old',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctIndex: 0,
    isPublished: true,
  });
  ok =
    line(
      mergedLegacy.scope === DAILY_QUIZ_SCOPE_ALL_INDIA,
      'GET merge adds all_india to legacy bank rows',
    ) && ok;

  const schedule = normalizeDailyQuizSettingsFields({});
  const bank = Array.from({ length: 25 }, (_, i) =>
    normalizeAdminDailyQuizItem(baseBody({ id: `reg-${i}` })),
  ).filter(Boolean);
  const picked = selectDailyQuizItemsForDay(bank, 20260710, '2026-07-10', schedule);
  ok =
    line(
      picked.length === 20,
      'regression: daily picker still works on scoped bank items',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_PHASE1_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_PHASE1_FAILED');
  process.exit(1);
}

main();
