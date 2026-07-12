#!/usr/bin/env node
'use strict';

/**
 * Publish guard verify — block publish/attempt without published questions.
 * Run: npm run verify:publish-guard
 */

const fs = require('fs');
const path = require('path');
const {
  assertTestPublishable,
  assertCanRemovePublishedQuestion,
  catalogErrorIfNoPublishedQuestions,
  PUBLISH_GUARD_ERROR,
  START_BLOCK_NO_QUESTIONS,
  DELETE_LAST_PUBLISHED_ERROR,
} = require('../src/lib/testPublishGuard');
const { evaluateTestStartAccess } = require('../src/lib/testStartAccess');
const { buildTestResolvePayload } = require('../src/lib/testResolve');

const root = path.join(__dirname, '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function main() {
  console.log('=== Publish guard (server + app API) ===\n');
  let ok = true;

  const guardLib = path.join(root, 'src/lib/testPublishGuard.js');
  const adminJs = fs.readFileSync(path.join(root, 'src/routes/admin.js'), 'utf8');
  const testsJs = fs.readFileSync(path.join(root, 'src/routes/tests.js'), 'utf8');
  const resolveJs = fs.readFileSync(path.join(root, 'src/lib/testResolve.js'), 'utf8');
  const startJs = fs.readFileSync(path.join(root, 'src/lib/testStartAccess.js'), 'utf8');

  ok = line(fs.existsSync(guardLib), 'testPublishGuard.js exists') && ok;
  ok = line(adminJs.includes('assertTestPublishable'), 'admin blocks publish without questions') && ok;
  ok = line(adminJs.includes('assertCanRemovePublishedQuestion'), 'admin protects last published question') && ok;
  ok = line(testsJs.includes('CATALOG_REQUIRES_PUBLISHED_QUESTIONS_SQL'), 'catalog filters empty tests') && ok;
  ok = line(testsJs.includes('START_BLOCK_NO_QUESTIONS'), 'questions-attempt blocks empty delivery') && ok;
  ok = line(resolveJs.includes('catalogErrorIfNoPublishedQuestions'), 'resolve includes question guard') && ok;
  ok = line(startJs.includes('START_BLOCK_NO_QUESTIONS'), 'start access blocks zero questions') && ok;
  ok = line(PUBLISH_GUARD_ERROR.includes('published question'), 'publish error message present') && ok;

  const mockDb = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes('id <>')) {
        return { rows: [{ c: 0 }] };
      }
      if (text.includes('COUNT(*)') && text.includes('is_published = true')) {
        const testId = params[0];
        if (testId === 'empty-test') return { rows: [{ c: 0 }] };
        if (testId === 'full-test') return { rows: [{ c: 3 }] };
      }
      if (text.includes('SELECT is_published FROM tests')) {
        return { rows: [{ is_published: true }] };
      }
      return { rows: [] };
    },
  };

  const emptyPublish = await assertTestPublishable(mockDb, 'empty-test');
  ok = line(emptyPublish.ok === false && emptyPublish.status === 400, 'assertTestPublishable rejects empty test') && ok;

  const fullPublish = await assertTestPublishable(mockDb, 'full-test');
  ok = line(fullPublish.ok === true && fullPublish.publishedQuestionCount === 3, 'assertTestPublishable allows test with questions') && ok;

  const deleteGuard = await assertCanRemovePublishedQuestion(mockDb, 'full-test', 42);
  ok = line(deleteGuard.ok === false, 'cannot delete last published question on live test') && ok;
  ok = line(String(deleteGuard.error || '') === DELETE_LAST_PUBLISHED_ERROR, 'delete guard error message') && ok;

  const row = { is_published: true, title: 'T', slug: 't' };
  const catalogErr = catalogErrorIfNoPublishedQuestions(row, 0, null);
  ok = line(catalogErr === START_BLOCK_NO_QUESTIONS, 'catalogErrorIfNoPublishedQuestions blocks zero count') && ok;

  const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
  const liveRow = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Live Test',
    slug: 'live-test',
    is_published: true,
    duration_minutes: 60,
    last_cycle_started_at: '2026-07-01T11:30:00.000Z',
    valid_until: null,
    slot_label: '',
  };

  const blockedStart = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
    cyclePhase: 'live',
    catalogError: null,
    examDate: '2026-07-01',
    slotLabel: '',
    lateJoinMinutes: 0,
    attemptAccess: { allowed: true },
    nowMs,
    row: liveRow,
    advancedConfig: {},
    publishedQuestionCount: 0,
  });
  ok = line(blockedStart.canStart === false, 'evaluateTestStartAccess blocks zero questions') && ok;
  ok = line(blockedStart.startBlockReason === START_BLOCK_NO_QUESTIONS, 'start block reason message') && ok;

  const resolvePayload = buildTestResolvePayload({
    row: liveRow,
    advancedConfig: {},
    nowMs,
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
    publishedQuestionCount: 0,
    attemptAccess: { allowed: true },
  });
  ok = line(resolvePayload.canStart === false, 'resolve payload canStart false without questions') && ok;
  ok = line(resolvePayload.canApply === false, 'resolve payload canApply false without questions') && ok;

  console.log(`\n${ok ? 'VERIFY_PUBLISH_GUARD_OK' : 'VERIFY_PUBLISH_GUARD_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
