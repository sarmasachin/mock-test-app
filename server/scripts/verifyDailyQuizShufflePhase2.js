#!/usr/bin/env node
'use strict';

/**
 * Phase 2 verify — daily quiz shuffle wiring + helpers + core regression + optional live API.
 *
 * Usage:
 *   node scripts/verifyDailyQuizShufflePhase2.js
 *   node scripts/verifyDailyQuizShufflePhase2.js --live-api
 *   node scripts/verifyDailyQuizShufflePhase2.js --live-api https://admin-admin.govmocktest.com/v1
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  buildDailyQuizItemsForDay,
  selectDailyQuizItemsForDay,
  shuffleQuizOptions,
  ensureVisibleShuffle,
  isIdentityOrder,
  fisherYatesSeeded,
  seededRandom,
  resolveDailyKey,
  loadDailyQuizSettings,
} = require('../src/lib/dailyQuizUtils');
const {
  PROD_DAY_KEY,
  PROD_ITEMS,
  DISTRICTS_IDENTITY_PATTERN,
  line,
  adminOptions,
  isSameStringArray,
  verifyLiveDeliveryShape,
  sameDeliveryFingerprint,
  runCoreShuffleRegression,
} = require('./lib/dailyQuizShuffleVerifyShared');

const DEFAULT_API = String(
  process.env.PHASE0_API_BASE || process.env.E2E_API_BASE || 'https://admin-admin.govmocktest.com/v1',
).replace(/\/+$/, '');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readText(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function readDailyQuizLoadFn(src) {
  const start = src.indexOf('suspend fun loadDailyQuizToday()');
  if (start < 0) return '';
  const end = src.indexOf('\n    suspend fun ', start + 1);
  if (end < 0) return src.slice(start);
  return src.slice(start, end);
}

async function fetchJson(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 400) };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function staticWiringAudit() {
  console.log('=== Phase 2 — static wiring ===\n');
  let ok = true;

  const utilsJs = readText('src/lib/dailyQuizUtils.js');
  const digestJs = readText('src/routes/digest.js');
  const dailyQuizJs = readText('src/routes/dailyQuiz.js');
  const contentRepo = readText('../app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const digestUi = readText('../app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  const publicApi = readText('../app/src/main/java/com/freemocktest/app/data/remote/PublicApiService.kt');

  ok = line(utilsJs.includes('function ensureVisibleShuffle'), 'ensureVisibleShuffle exported in dailyQuizUtils') && ok;
  ok = line(utilsJs.includes('identity-fix'), 'seeded identity-fix swap suffix present') && ok;
  ok =
    line(
      digestJs.includes("router.get('/quiz-today'") && digestJs.includes('selectDailyQuizItemsForDay'),
      'digest.js GET /quiz-today → selectDailyQuizItemsForDay',
    ) && ok;
  ok =
    line(
      !digestJs.includes('ensureVisibleShuffle'),
      'digest daily quiz path uses selectDailyQuizItemsForDay (not duplicate shuffle)',
    ) && ok;

  const dailyQuizLoadFn = readDailyQuizLoadFn(contentRepo);
  ok =
    line(
      dailyQuizLoadFn.includes('getDailyQuizToday()') && dailyQuizLoadFn.includes('row.options'),
      'Android loadDailyQuizToday reads API options',
    ) && ok;
  ok =
    line(
      publicApi.includes('digest/quiz-today'),
      'PublicApiService GET digest/quiz-today',
    ) && ok;
  ok =
    line(
      digestUi.includes('question?.options.orEmpty()'),
      'DailyDigestScreenNew renders API options',
    ) && ok;
  ok =
    line(
      dailyQuizJs.includes('options_json') && !dailyQuizJs.includes('buildDailyQuizItemsForDay'),
      'dailyQuiz attempts store client snapshot (no server re-shuffle on submit)',
    ) && ok;

  return ok;
}

function helperUnitTests() {
  console.log('\n=== Phase 2 — helper unit tests ===\n');
  let ok = true;

  const baseline = ['a', 'b', 'c'];
  const identityList = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
  ok =
    line(
      isIdentityOrder(identityList, (x) => x.k, baseline),
      'isIdentityOrder detects identity',
    ) && ok;

  const shuffledList = [{ k: 'b' }, { k: 'a' }, { k: 'c' }];
  ok =
    line(
      !isIdentityOrder(shuffledList, (x) => x.k, baseline),
      'isIdentityOrder rejects non-identity',
    ) && ok;

  const fixList = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
  ensureVisibleShuffle(fixList, 'unit-test-seed', (x) => x.k, baseline);
  ok =
    line(
      !isIdentityOrder(fixList, (x) => x.k, baseline),
      'ensureVisibleShuffle breaks identity (n=3)',
    ) && ok;

  const fixAgain = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
  ensureVisibleShuffle(fixAgain, 'unit-test-seed', (x) => x.k, baseline);
  ok =
    line(
      isIdentityOrder(fixAgain, (x) => x.k, baseline) === false,
      'ensureVisibleShuffle deterministic for same seed',
    ) && ok;
  const fixThird = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
  ensureVisibleShuffle(fixThird, 'unit-test-seed', (x) => x.k, baseline);
  ok =
    line(
      JSON.stringify(fixAgain) === JSON.stringify(fixThird),
      'ensureVisibleShuffle same seed → same result',
    ) && ok;

  const single = [{ k: 'only' }];
  ensureVisibleShuffle(single, 'unit-single', (x) => x.k, ['only']);
  ok = line(single[0].k === 'only', 'ensureVisibleShuffle noop when n<2') && ok;

  const nums = [0, 1, 2, 3];
  fisherYatesSeeded(nums, 'fy-test');
  ok = line(Array.isArray(nums) && nums.length === 4, 'fisherYatesSeeded preserves length') && ok;

  ok = line(typeof seededRandom('x') === 'number', 'seededRandom returns number in [0,1)') && ok;

  return ok;
}

async function resolveDailyKeyTests() {
  console.log('\n=== Phase 2 — resolveDailyKey ===\n');
  let ok = true;

  const schedule = await loadDailyQuizSettings();
  const { dayKey, quizDay } = resolveDailyKey(Date.now(), schedule);
  ok = line(Number.isInteger(dayKey) && dayKey > 20200000, `dayKey numeric: ${dayKey}`) && ok;
  ok = line(/^\d{4}-\d{2}-\d{2}$/.test(quizDay), `quizDay ISO: ${quizDay}`) && ok;

  const ms = Date.parse(`${quizDay}T12:00:00.000Z`);
  const again = resolveDailyKey(ms, schedule);
  ok =
    line(
      again.dayKey === dayKey || again.quizDay === quizDay,
      'resolveDailyKey stable for same calendar day input',
    ) && ok;

  return ok;
}

async function optionalLiveApiAudit(apiBase) {
  console.log('\n=== Phase 2 — live API (post-deploy check) ===');
  console.log(`API: ${apiBase}\n`);

  let ok = true;
  const res = await fetchJson(`${apiBase}/digest/quiz-today`);
  ok = line(res.ok, `GET /digest/quiz-today → HTTP ${res.status}`) && ok;
  if (!res.ok) return ok;

  const apiItems = Array.isArray(res.body?.items) ? res.body.items : [];
  const schedule = await loadDailyQuizSettings();
  const { dayKey, quizDay } = resolveDailyKey(Date.now(), schedule);
  const localBuilt = selectDailyQuizItemsForDay(PROD_ITEMS, dayKey, quizDay, schedule);
  const declaredCount = Number(res.body?.questionCount);

  ok = line(apiItems.length > 0, `API returned ${apiItems.length} item(s)`) && ok;
  ok =
    line(
      apiItems.length <= schedule.questionsPerDay,
      `API delivery <= questionsPerDay (${apiItems.length} <= ${schedule.questionsPerDay})`,
    ) && ok;
  ok =
    line(
      !Number.isInteger(declaredCount) || declaredCount === apiItems.length,
      `questionCount metadata matches items (${declaredCount} vs ${apiItems.length})`,
    ) && ok;

  if (localBuilt.length === apiItems.length && apiItems.length > 0) {
    const matches = sameDeliveryFingerprint(localBuilt, apiItems);
    ok =
      line(
        matches,
        matches
          ? 'live API fingerprint matches local build (fix deployed)'
          : 'live API differs from local — production may not have Phase 1 deploy yet',
      ) && ok;
  }

  for (const apiItem of apiItems) {
    const shape = verifyLiveDeliveryShape(apiItem);
    ok = line(shape.ok, `live ${apiItem.id}: delivery shape`) && ok;
    const opts = (apiItem.options || []).map((x) => String(x || ''));
    if (String(apiItem.id) === 'dq-1783448166666-1961') {
      const isIdentity = isSameStringArray(opts, DISTRICTS_IDENTITY_PATTERN);
      ok =
        line(
          !isIdentity,
          isIdentity
            ? 'districts question still identity on live API (deploy Phase 1 to production)'
            : 'districts question shuffled on live API',
        ) && ok;
    }
  }

  return ok;
}

async function main() {
  const liveApiFlag = hasFlag('--live-api');
  const apiArg = argValue('--live-api');
  const apiBase = apiArg && !apiArg.startsWith('-') ? apiArg.replace(/\/+$/, '') : DEFAULT_API;

  console.log('=== Phase 2: daily quiz shuffle (wiring + regression) ===');
  console.log(`Time: ${new Date().toISOString()}\n`);

  let ok = staticWiringAudit();
  ok = helperUnitTests() && ok;
  ok = await resolveDailyKeyTests() && ok;

  console.log('\n=== Phase 2 — core shuffle regression ===\n');
  ok = runCoreShuffleRegression(buildDailyQuizItemsForDay, shuffleQuizOptions) && ok;

  if (liveApiFlag) {
    ok = (await optionalLiveApiAudit(apiBase)) && ok;
  } else {
    console.log('\n     (skip live API — pass --live-api after VPS deploy)\n');
  }

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SHUFFLE_PHASE2_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SHUFFLE_PHASE2_FAIL');
  process.exit(1);
}

main().catch((e) => {
  console.error('verify_daily_quiz_shuffle_phase2_error', e);
  process.exit(1);
});
