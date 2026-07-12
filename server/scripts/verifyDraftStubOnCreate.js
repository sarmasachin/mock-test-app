#!/usr/bin/env node
'use strict';

/**
 * Draft stub question on state-exam test create.
 * Run: npm run verify:draft-stub-on-create
 */

const fs = require('fs');
const path = require('path');
const {
  DRAFT_STUB_STEM,
  buildDraftStubQuestionFields,
  shouldAddDraftStubOnTestCreate,
  insertDraftStubQuestionIfEmpty,
} = require('../src/lib/draftStubQuestion');
const { assertTestPublishable } = require('../src/lib/testPublishGuard');

const root = path.join(__dirname, '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function main() {
  console.log('=== Draft stub question on create (safe) ===\n');
  let ok = true;

  const adminJs = fs.readFileSync(path.join(root, 'src/routes/admin.js'), 'utf8');
  ok = line(fs.existsSync(path.join(root, 'src/lib/draftStubQuestion.js')), 'draftStubQuestion.js exists') && ok;
  ok = line(adminJs.includes('insertDraftStubQuestionIfEmpty'), 'admin create inserts draft stub') && ok;
  ok = line(adminJs.includes('shouldAddDraftStubOnTestCreate'), 'admin gates stub on state exam sync') && ok;
  ok = line(adminJs.includes('draftStubQuestion'), 'create API returns draftStubQuestion flag') && ok;

  const fields = buildDraftStubQuestionFields('HP Patwari');
  ok = line(fields.isPublished === false, 'stub is unpublished (safe)') && ok;
  ok = line(fields.stem.includes(DRAFT_STUB_STEM), 'stub stem is Hindi placeholder') && ok;
  ok = line(fields.stem.includes('HP Patwari'), 'stub stem includes test title hint') && ok;
  ok = line(fields.choiceA.length > 0 && fields.correctIndex === 0, 'stub has valid MCQ shape') && ok;

  ok = line(
    shouldAddDraftStubOnTestCreate({
      isPublished: false,
      syncParsed: { mode: 'upsert', stateName: 'Himachal Pradesh' },
      body: {},
    }) === true,
    'state exam sync draft → add stub',
  ) && ok;
  ok = line(
    shouldAddDraftStubOnTestCreate({
      isPublished: true,
      syncParsed: { mode: 'upsert', stateName: 'Himachal Pradesh' },
      body: {},
    }) === false,
    'published create → no stub',
  ) && ok;
  ok = line(
    shouldAddDraftStubOnTestCreate({
      isPublished: false,
      syncParsed: { mode: 'off' },
      body: {},
    }) === false,
    'non-sync draft → no stub unless explicit flag',
  ) && ok;
  ok = line(
    shouldAddDraftStubOnTestCreate({
      isPublished: false,
      syncParsed: { mode: 'off' },
      body: { addDraftStubQuestion: true },
    }) === true,
    'explicit addDraftStubQuestion flag works',
  ) && ok;

  const store = new Map();
  const mockDb = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes('COUNT(*)') && text.includes('is_published = true')) {
        return { rows: [{ c: 0 }] };
      }
      if (text.includes('COUNT(*)') && text.includes('FROM questions')) {
        const testId = params[0];
        return { rows: [{ c: store.get(testId) || 0 }] };
      }
      if (text.startsWith('INSERT INTO questions')) {
        const testId = params[0];
        store.set(testId, (store.get(testId) || 0) + 1);
        return {
          rows: [{
            id: 101,
            test_id: testId,
            position: 1,
            stem: params[1],
            is_published: false,
          }],
        };
      }
      return { rows: [] };
    },
  };

  const first = await insertDraftStubQuestionIfEmpty(mockDb, 'test-a', { testTitle: 'Bihar Police' });
  ok = line(first.inserted === true, 'inserts stub when test has zero questions') && ok;
  const second = await insertDraftStubQuestionIfEmpty(mockDb, 'test-a', { testTitle: 'Bihar Police' });
  ok = line(second.inserted === false && second.reason === 'has_questions', 'does not duplicate stub') && ok;

  const publishCheck = await assertTestPublishable(mockDb, 'test-a');
  ok = line(publishCheck.ok === false, 'publish guard still blocks (stub is unpublished)') && ok;

  console.log(`\n${ok ? 'VERIFY_DRAFT_STUB_ON_CREATE_OK' : 'VERIFY_DRAFT_STUB_ON_CREATE_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
