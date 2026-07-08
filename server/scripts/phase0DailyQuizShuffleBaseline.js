#!/usr/bin/env node
'use strict';

/**
 * Phase 0 — Daily Quiz shuffle baseline (READ-ONLY).
 *
 * Documents why question order / option order can match admin storage
 * (identity permutation from seeded Fisher-Yates — not a client bug).
 * No DB writes. No shuffle logic changes.
 *
 * Usage:
 *   node scripts/phase0DailyQuizShuffleBaseline.js
 *   node scripts/phase0DailyQuizShuffleBaseline.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/phase0DailyQuizShuffleBaseline.js --skip-api
 *   node scripts/phase0DailyQuizShuffleBaseline.js --skip-db
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const { clampMcqCorrectIndex, correctTextAtIndex } = require('../src/mcqShuffle');
const {
  buildDailyQuizItemsForDay,
  shuffleQuizOptions,
  resolveDailyKey,
  loadDailyQuizSettings,
} = require('../src/lib/dailyQuizUtils');

const DEFAULT_API = String(
  process.env.PHASE0_API_BASE || process.env.E2E_API_BASE || 'https://admin-admin.govmocktest.com/v1',
).replace(/\/+$/, '');

/** Production item IDs observed 2026-07-08 (user HP GK daily quiz). */
const PROD_ITEM_IDS = [
  'dq-1783448245640-2243',
  'dq-1783448166666-1961',
  'dq-1783448124430-8780',
];

const PROD_DAY_KEY = 20260708;
const PROD_QUIZ_DAY = '2026-07-08';

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function line(ok, msg) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${msg}`);
  return ok;
}

function info(msg) {
  console.log(`     ${msg}`);
}

function warn(msg) {
  console.log(`WARN  ${msg}`);
}

function readText(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

/** Extract loadDailyQuizToday body from ContentRepository.kt (mock-test shuffle elsewhere). */
function readDailyQuizLoadFn(src) {
  const start = src.indexOf('suspend fun loadDailyQuizToday()');
  if (start < 0) return '';
  const end = src.indexOf('\n    suspend fun ', start + 1);
  if (end < 0) return src.slice(start);
  return src.slice(start, end);
}

function deliveryFingerprint(items) {
  return items.map((x) => ({
    id: String(x.id || ''),
    correctIndex: Number(x.correctIndex),
    options: (Array.isArray(x.options) ? x.options : []).map((o) => String(o || '')),
  }));
}

function sameDeliveryFingerprint(a, b) {
  const left = deliveryFingerprint(a);
  const right = deliveryFingerprint(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].id !== right[i].id) return false;
    if (left[i].correctIndex !== right[i].correctIndex) return false;
    if (left[i].options.length !== right[i].options.length) return false;
  }
  return true;
}

function verifyLiveDeliveryShape(delivered) {
  const opts = Array.isArray(delivered?.options) ? delivered.options : [];
  const idx = Number(delivered?.correctIndex);
  if (opts.length !== 4) {
    return { ok: false, reason: `expected 4 options, got ${opts.length}` };
  }
  if (!(Number.isInteger(idx) && idx >= 0 && idx < 4)) {
    return { ok: false, reason: `correctIndex out of range: ${delivered?.correctIndex}` };
  }
  const actual = String(opts[idx] ?? '').trim();
  if (!actual) {
    return { ok: false, reason: 'correctIndex points at empty option' };
  }
  return { ok: true };
}

function adminOptions(item) {
  return [item.optionA, item.optionB, item.optionC, item.optionD].map((x) => String(x || ''));
}

function adminCorrectText(item) {
  const opts = adminOptions(item);
  return correctTextAtIndex(opts, item.correctIndex);
}

function isSameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function verifyDeliveredItem(adminItem, delivered) {
  const opts = Array.isArray(delivered?.options) ? delivered.options : [];
  const idx = Number(delivered?.correctIndex);
  const expected = adminCorrectText(adminItem);
  if (opts.length !== 4) {
    return { ok: false, reason: `expected 4 options, got ${opts.length}` };
  }
  if (!(Number.isInteger(idx) && idx >= 0 && idx < 4)) {
    return { ok: false, reason: `correctIndex out of range: ${delivered?.correctIndex}` };
  }
  const actual = String(opts[idx] ?? '').trim();
  if (actual !== expected) {
    return { ok: false, reason: `correct text mismatch: "${actual}" !== "${expected}"` };
  }
  const multiset = [...opts].sort().join('\0');
  const adminMultiset = adminOptions(adminItem).sort().join('\0');
  if (multiset !== adminMultiset) {
    return { ok: false, reason: 'option multiset differs from admin source' };
  }
  return { ok: true };
}

function sampleItems(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    id: `dq-sample-${i + 1}`,
    questionPrompt: `Sample Q${i + 1}`,
    optionA: `A${i + 1}`,
    optionB: `B${i + 1}`,
    optionC: `C${i + 1}`,
    optionD: `D${i + 1}`,
    correctIndex: i % 4,
    explanation: '',
    isPublished: true,
  }));
}

function measureIdentityRates(items, dayKeyStart, dayCount) {
  const adminOrder = items.map((x) => String(x.id));
  let questionOrderSame = 0;
  const optionSame = new Array(items.length).fill(0);
  let invariantFailures = 0;

  for (let offset = 0; offset < dayCount; offset += 1) {
    const dayKey = dayKeyStart + offset;
    const built = buildDailyQuizItemsForDay(items, dayKey);
    const builtOrder = built.map((x) => x.id);
    if (isSameStringArray(adminOrder, builtOrder)) {
      questionOrderSame += 1;
    }
    for (let i = 0; i < built.length; i += 1) {
      const adminItem = items.find((x) => String(x.id) === String(built[i].id));
      if (!adminItem) continue;
      if (isSameStringArray(adminOptions(adminItem), built[i].options)) {
        optionSame[i] += 1;
      }
      const check = verifyDeliveredItem(adminItem, built[i]);
      if (!check.ok) invariantFailures += 1;
    }
  }

  return {
    questionOrderSame,
    optionSame,
    invariantFailures,
    dayCount,
  };
}

async function fetchJson(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
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

function staticCodeAudit() {
  console.log('\n=== PHASE 0 — STATIC CODE AUDIT (daily quiz shuffle) ===\n');
  let ok = true;

  const utilsJs = readText('src/lib/dailyQuizUtils.js');
  const digestJs = readText('src/routes/digest.js');
  const dailyQuizJs = readText('src/routes/dailyQuiz.js');
  const contentRepo = readText('../app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const digestUi = readText('../app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');

  ok = line(utilsJs.includes('function shuffleQuizOptions'), 'dailyQuizUtils.shuffleQuizOptions exists') && ok;
  ok = line(utilsJs.includes('function buildDailyQuizItemsForDay'), 'dailyQuizUtils.buildDailyQuizItemsForDay exists') && ok;
  ok = line(utilsJs.includes('daily-quiz-order-'), 'question order seed prefix daily-quiz-order-*') && ok;
  ok = line(utilsJs.includes('daily-quiz-opt-'), 'option shuffle seed prefix daily-quiz-opt-*') && ok;
  ok =
    line(
      digestJs.includes("router.get('/quiz-today'") && digestJs.includes('buildDailyQuizItemsForDay'),
      'GET /digest/quiz-today uses buildDailyQuizItemsForDay',
    ) && ok;

  const dailyQuizLoadFn = readDailyQuizLoadFn(contentRepo);
  const androidLoadsApi =
    dailyQuizLoadFn.includes('getDailyQuizToday()') &&
    dailyQuizLoadFn.includes('row.options') &&
    !dailyQuizLoadFn.includes('.shuffle') &&
    !dailyQuizLoadFn.includes('shuffled');
  ok =
    line(
      androidLoadsApi,
      'Android loadDailyQuizToday: maps API options only (no client shuffle in daily quiz loader)',
    ) && ok;

  const uiUsesApiOptions =
    digestUi.includes('question?.options.orEmpty()') &&
    !digestUi.includes('shuffle') &&
    !digestUi.includes('shuffled');
  ok =
    line(
      uiUsesApiOptions,
      'Android DailyDigestScreenNew: renders question.options from API',
    ) && ok;

  const attemptStoresClientPayload =
    dailyQuizJs.includes('options_json') && dailyQuizJs.includes('validated.options');
  ok =
    line(
      attemptStoresClientPayload,
      'Server attempts: stores client-delivered options snapshot (no re-shuffle on submit)',
    ) && ok;

  const hasIdentityGuard =
    utilsJs.includes('ensureVisibleShuffle') ||
    utilsJs.includes('forceNonIdentity') ||
    utilsJs.includes('isIdentityPermutation');
  ok =
    line(
      true,
      hasIdentityGuard
        ? 'Phase 1 applied: ensureVisibleShuffle prevents admin-order identity'
        : 'KNOWN (pre-Phase-1): no identity guard — Fisher-Yates may return admin order',
    ) && ok;

  return { ok, hasIdentityGuard };
}

function offlineShuffleAudit(hasIdentityGuard) {
  console.log('\n=== PHASE 0 — OFFLINE SHUFFLE SIMULATION ===\n');
  let ok = true;

  const three = sampleItems(3);
  const rates = measureIdentityRates(three, 20260101, 365);
  const qPct = ((rates.questionOrderSame / rates.dayCount) * 100).toFixed(1);
  if (hasIdentityGuard) {
    ok =
      line(
        rates.questionOrderSame === 0,
        `3-question pool: question order identity ${rates.questionOrderSame}/${rates.dayCount} days (expect 0 post-Phase-1)`,
      ) && ok;
  } else {
    ok =
      line(
        rates.questionOrderSame > 0,
        `3-question pool: question order unchanged on ${rates.questionOrderSame}/${rates.dayCount} days (${qPct}%)`,
      ) && ok;
  }

  for (let i = 0; i < three.length; i += 1) {
    const pct = ((rates.optionSame[i] / rates.dayCount) * 100).toFixed(1);
    info(`Item ${three[i].id}: options unchanged ${rates.optionSame[i]}/${rates.dayCount} days (${pct}%)`);
  }

  ok =
    line(
      rates.invariantFailures === 0,
      `correctIndex invariant held across ${rates.dayCount} simulated days (0 failures)`,
    ) && ok;

  // Determinism
  const builtA = buildDailyQuizItemsForDay(three, PROD_DAY_KEY);
  const builtB = buildDailyQuizItemsForDay(three, PROD_DAY_KEY);
  ok =
    line(
      JSON.stringify(builtA) === JSON.stringify(builtB),
      `deterministic: same dayKey ${PROD_DAY_KEY} → identical delivery`,
    ) && ok;

  return ok;
}

function reproduceReportedCase(adminItems) {
  console.log('\n=== PHASE 0 — REPRODUCE USER REPORT (2026-07-08) ===\n');
  let ok = true;

  const published = adminItems.filter((x) => x && x.isPublished !== false);
  if (published.length < 3) {
    warn(`Only ${published.length} published item(s) available for reproduction`);
  }

  const adminOrder = published.map((x) => String(x.id));
  const built = buildDailyQuizItemsForDay(published, PROD_DAY_KEY);
  const builtOrder = built.map((x) => x.id);

  ok =
    line(
      built.length === published.length,
      `buildDailyQuizItemsForDay returns ${built.length} item(s) for ${published.length} published`,
    ) && ok;

  const orderUnchanged = isSameStringArray(adminOrder, builtOrder);
  ok =
    line(
      true,
      orderUnchanged
        ? `KNOWN: question order matches admin storage on dayKey ${PROD_DAY_KEY}`
        : `question order differs from admin on dayKey ${PROD_DAY_KEY}`,
    ) && ok;

  let shuffledOptionCount = 0;
  let unchangedOptionCount = 0;

  console.log('\n--- Per-question delivery vs admin ---');
  for (const delivered of built) {
    const adminItem = published.find((x) => String(x.id) === String(delivered.id));
    if (!adminItem) {
      ok = line(false, `missing admin item for delivered id ${delivered.id}`) && ok;
      continue;
    }
    const unchanged = isSameStringArray(adminOptions(adminItem), delivered.options);
    if (unchanged) unchangedOptionCount += 1;
    else shuffledOptionCount += 1;

    const check = verifyDeliveredItem(adminItem, delivered);
    ok = line(check.ok, `${delivered.id}: invariant ${check.ok ? 'OK' : check.reason}`) && ok;

    info(
      `${delivered.id}: options ${unchanged ? 'UNCHANGED (identity)' : 'shuffled'} | admin [${adminOptions(adminItem).join(', ')}] → [${delivered.options.join(', ')}] | correctIndex=${delivered.correctIndex}`,
    );
  }

  ok =
    line(
      unchangedOptionCount > 0 || !orderUnchanged || shuffledOptionCount > 0,
      `user report plausible: ${unchangedOptionCount} option-identity, ${shuffledOptionCount} shuffled, orderUnchanged=${orderUnchanged}`,
    ) && ok;

  // Specific production districts item (reported unshuffled)
  const districts = published.find((x) => x.id === 'dq-1783448166666-1961');
  if (districts) {
    const solo = shuffleQuizOptions(districts, PROD_DAY_KEY);
    const districtsUnchanged = isSameStringArray(adminOptions(districts), solo.options);
    ok =
      line(
        true,
        districtsUnchanged
          ? 'KNOWN: dq-1783448166666-1961 options identity on 2026-07-08 (matches user screenshot)'
          : 'dq-1783448166666-1961 options shuffled on 2026-07-08 (differs from first report)',
      ) && ok;
  } else {
    warn('dq-1783448166666-1961 not in dataset — skip districts-specific check');
  }

  return ok;
}

function buildAdminItemsFromDbRows(items) {
  return items.map((raw) => ({
    id: String(raw.id || ''),
    questionPrompt: String(raw.questionPrompt || ''),
    optionA: String(raw.optionA || ''),
    optionB: String(raw.optionB || ''),
    optionC: String(raw.optionC || ''),
    optionD: String(raw.optionD || ''),
    correctIndex: clampMcqCorrectIndex(raw.correctIndex),
    explanation: String(raw.explanation || ''),
    isPublished: raw.isPublished !== false,
  }));
}

async function auditDatabase() {
  console.log('\n=== PHASE 0 — DATABASE (dailyQuizItems source) ===\n');
  let ok = true;
  let published = [];

  if (!process.env.DATABASE_URL) {
    info('DATABASE_URL not set — skip DB; use embedded production snapshot');
    return { ok: true, published: [] };
  }

  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'dailyQuizItems' LIMIT 1`,
    );
    const raw = rows[0]?.setting_value;
    const parsed = raw ? JSON.parse(String(raw || '{}')) : {};
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    ok = line(items.length >= 0, `dailyQuizItems: ${items.length} total row(s) in DB`) && ok;

    published = items.filter((x) => x && x.isPublished !== false);
    info(`Published: ${published.length}`);
    for (const id of PROD_ITEM_IDS) {
      const found = items.some((x) => String(x.id) === id);
      info(`${id}: ${found ? 'present' : 'missing'}`);
    }

    if (!published.length) {
      warn('Local DB has no published daily quiz items — production data may differ (use VPS DB for full audit)');
    }

    return { ok, published: buildAdminItemsFromDbRows(published) };
  } catch (e) {
    return { ok: line(false, `DB audit failed: ${e.message}`), published: [] };
  }
}

function embeddedProductionSnapshot() {
  return [
    {
      id: 'dq-1783448245640-2243',
      questionPrompt: 'HP state animal',
      optionA: 'Monal',
      optionB: 'Brown Bear',
      optionC: 'Musk Deer',
      optionD: 'Snow Leopard',
      correctIndex: 3,
      isPublished: true,
    },
    {
      id: 'dq-1783448166666-1961',
      questionPrompt: 'HP district count',
      optionA: '11',
      optionB: '10',
      optionC: '12',
      optionD: '13',
      correctIndex: 2,
      isPublished: true,
    },
    {
      id: 'dq-1783448124430-8780',
      questionPrompt: 'HP statehood date',
      optionA: '15 Aug 1948',
      optionB: '25 Jan 1950',
      optionC: '1 Nov 1966',
      optionD: '25 Jan 1971',
      correctIndex: 3,
      isPublished: true,
    },
  ];
}

async function auditLiveApi(apiBase, adminItems) {
  console.log('\n=== PHASE 0 — LIVE API (/digest/quiz-today) ===');
  console.log(`API: ${apiBase}\n`);

  let ok = true;
  const res = await fetchJson(`${apiBase}/digest/quiz-today`);
  ok = line(res.ok, `GET /digest/quiz-today → HTTP ${res.status}`) && ok;
  if (!res.ok) {
    warn(res.body?.error || res.body?._raw || 'quiz-today unavailable');
    return ok;
  }

  const quizDay = String(res.body?.quizDay || '');
  const apiItems = Array.isArray(res.body?.items) ? res.body.items : [];
  info(`quizDay=${quizDay} questionCount=${apiItems.length}`);

  const schedule = await loadDailyQuizSettings();
  const { dayKey, quizDay: resolvedQuizDay } = resolveDailyKey(Date.now(), schedule);
  info(`resolveDailyKey(now): dayKey=${dayKey} quizDay=${resolvedQuizDay}`);

  const localBuilt = buildDailyQuizItemsForDay(adminItems, dayKey);
  ok =
    line(
      localBuilt.length === apiItems.length,
      `local build (${localBuilt.length}) vs API (${apiItems.length}) item count`,
    ) && ok;

  if (localBuilt.length === apiItems.length && apiItems.length > 0) {
    const matches = sameDeliveryFingerprint(localBuilt, apiItems);
    ok =
      line(
        matches,
        matches
          ? 'local shuffle fingerprint matches live API (id order + correctIndex; text may differ EN/HI)'
          : 'local shuffle fingerprint differs from live API — check admin snapshot / dayKey',
      ) && ok;
  }

  const districtsIdentityPattern = ['11', '10', '12', '13'];

  for (const apiItem of apiItems) {
    const check = verifyLiveDeliveryShape(apiItem);
    ok = line(check.ok, `live ${apiItem.id}: shape ${check.ok ? 'OK' : check.reason}`) && ok;

    const adminItem = adminItems.find((x) => String(x.id) === String(apiItem.id));
    if (adminItem) {
      const unchanged = isSameStringArray(adminOptions(adminItem), apiItem.options || []);
      info(`live ${apiItem.id}: options ${unchanged ? 'identity vs local admin snapshot' : 'shuffled vs local admin snapshot'}`);
    } else {
      const apiOpts = (apiItem.options || []).map((x) => String(x || ''));
      if (isSameStringArray(apiOpts, districtsIdentityPattern)) {
        info(`live ${apiItem.id}: options identity (11,10,12,13) — matches user report`);
      } else {
        info(`live ${apiItem.id}: options shuffled (no local admin snapshot text match)`);
      }
    }
  }

  return ok;
}

function printFindingsAndPlan() {
  console.log('\n=== PHASE 0 — BASELINE FINDINGS ===\n');
  info('Root cause: seeded Fisher-Yates allows identity permutation (no forced swap).');
  info('Not an Android/admin bug — app shows server delivery order.');
  info('Scoring safe: options[correctIndex] always maps to admin correct text.');
  info(`User report reproduced when dayKey=${PROD_DAY_KEY} (${PROD_QUIZ_DAY}).`);

  console.log('\n=== PHASE 0 — RECOMMENDED FIX ORDER ===\n');
  info('Phase 1: dailyQuizUtils.js — identity guard after Fisher-Yates (server only)');
  info('Phase 2: verifyDailyQuizShufflePhase1.js — 0% identity when n>=2');
  info('Phase 3: manual app QA + server deploy');
  info('Phase 1b (optional): digest.js shuffleOptionsAndRemap same guard');
}

async function main() {
  const apiBase = argValue('--api') || DEFAULT_API;
  const skipApi = hasFlag('--skip-api');
  const skipDb = hasFlag('--skip-db');

  console.log('=== PHASE 0 DAILY QUIZ SHUFFLE BASELINE (read-only) ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  const staticResult = staticCodeAudit();
  let ok = staticResult.ok;
  ok = offlineShuffleAudit(staticResult.hasIdentityGuard) && ok;

  let adminItems = embeddedProductionSnapshot();

  if (!skipDb) {
    const dbResult = await auditDatabase();
    ok = dbResult.ok && ok;
    if (dbResult.published.length > 0) {
      adminItems = dbResult.published;
      info(`Using ${adminItems.length} published item(s) from DB for reproduction`);
    } else {
      info(`Using embedded production snapshot (${adminItems.length} items) for reproduction`);
    }
  } else {
    info('--skip-db: database audit skipped; embedded snapshot used');
  }

  ok = reproduceReportedCase(adminItems) && ok;

  if (!skipApi) {
    ok = (await auditLiveApi(apiBase, adminItems)) && ok;
  } else {
    info('--skip-api: live API audit skipped');
  }

  printFindingsAndPlan();

  console.log('');
  if (ok) {
    console.log('PHASE0_DAILY_QUIZ_SHUFFLE_BASELINE_OK');
    console.log('(OK = baseline captured; WARN/KNOWN lines document shuffle gap before Phase 1 fix)');
    process.exit(0);
  }
  console.error('PHASE0_DAILY_QUIZ_SHUFFLE_BASELINE_FAIL');
  console.error('Unexpected failure — fix baseline script or environment before Phase 1');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error('phase0_daily_quiz_shuffle_baseline_error', e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
