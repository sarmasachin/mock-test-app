#!/usr/bin/env node
'use strict';

/**
 * question_count auto-sync — server + admin UI.
 * Run: npm run verify:question-count-auto-sync
 */

const fs = require('fs');
const path = require('path');
const {
  resolveSyncedQuestionCount,
  syncTestQuestionCount,
  loadQuestionCountsForTest,
} = require('../src/lib/syncTestQuestionCount');

const root = path.join(__dirname, '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function main() {
  console.log('=== question_count auto-sync ===\n');
  let ok = true;

  const adminJs = fs.readFileSync(path.join(root, 'src/routes/admin.js'), 'utf8');
  const appTsx = fs.readFileSync(path.join(root, '..', 'admin-web/src/App.tsx'), 'utf8');
  const syncTs = fs.readFileSync(path.join(root, '..', 'admin-web/src/lib/questionCountSync.ts'), 'utf8');

  ok = line(adminJs.includes('syncTestQuestionCount'), 'server sync helper wired in admin routes') && ok;
  ok = line(adminJs.includes('...sync'), 'question mutations return questionCount payload') && ok;
  ok = line(appTsx.includes('applyQuestionCountSync'), 'admin UI applies synced count') && ok;
  ok = line(appTsx.includes('readOnly={Boolean(editingTestId)}'), 'saved test count is read-only in form') && ok;
  ok = line(syncTs.includes('parseQuestionCountSyncPayload'), 'client parse helper exists') && ok;

  ok = line(
    resolveSyncedQuestionCount({ total: 5, published: 0, currentQuestionCount: 1 }) === 5,
    'draft: total questions drive count when none published',
  ) && ok;
  ok = line(
    resolveSyncedQuestionCount({ total: 13, published: 10, currentQuestionCount: 1 }) === 10,
    'live: published questions drive count',
  ) && ok;
  ok = line(
    resolveSyncedQuestionCount({ total: 0, published: 0, currentQuestionCount: 3 }) === 3,
    'empty bank preserves current count (never 0)',
  ) && ok;

  const store = { total: 0, published: 0, question_count: 2 };
  const mockDb = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes('COUNT(*)') && text.includes('FILTER')) {
        return { rows: [{ total: store.total, published: store.published }] };
      }
      if (text.includes('SELECT question_count FROM tests')) {
        return { rows: [{ question_count: store.question_count }] };
      }
      if (text.startsWith('UPDATE tests')) {
        store.question_count = params[1];
        return { rows: [{ question_count: params[1] }] };
      }
      return { rows: [] };
    },
  };

  store.total = 8;
  store.published = 0;
  const draftSync = await syncTestQuestionCount(mockDb, 'test-1');
  ok = line(draftSync.questionCount === 8 && draftSync.totalQuestionCount === 8, 'sync writes draft total to tests.question_count') && ok;

  store.published = 6;
  const liveSync = await syncTestQuestionCount(mockDb, 'test-1');
  ok = line(liveSync.questionCount === 6 && liveSync.publishedQuestionCount === 6, 'sync writes published count when live') && ok;

  const counts = await loadQuestionCountsForTest(mockDb, 'test-1');
  ok = line(counts.total === 8 && counts.published === 6, 'loadQuestionCountsForTest reads bank') && ok;

  console.log(`\n${ok ? 'VERIFY_QUESTION_COUNT_AUTO_SYNC_OK' : 'VERIFY_QUESTION_COUNT_AUTO_SYNC_FAILED'}\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
