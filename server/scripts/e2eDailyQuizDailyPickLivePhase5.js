#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — live API smoke for daily quiz daily-pick (read-only, post-deploy).
 *
 * Usage:
 *   node scripts/e2eDailyQuizDailyPickLivePhase5.js
 *   node scripts/e2eDailyQuizDailyPickLivePhase5.js --api https://admin-admin.govmocktest.com/v1
 *
 * Env:
 *   E2E_API_BASE / API_BASE / PHASE0_API_BASE
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { verifyLiveDeliveryShape } = require('./lib/dailyQuizShuffleVerifyShared');

const DEFAULT_API = String(
  process.env.E2E_API_BASE || process.env.API_BASE || process.env.PHASE0_API_BASE || 'https://admin-admin.govmocktest.com/v1',
).replace(/\/+$/, '');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body, requestFailed: false };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String(e.message || e) }, requestFailed: true };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const apiBase = argValue('--api') || DEFAULT_API;
  console.log('=== Phase 5: live daily quiz daily-pick smoke ===');
  console.log(`API: ${apiBase}\n`);
  let ok = true;

  const res = await fetchJson(`${apiBase}/digest/quiz-today`);
  if (res.requestFailed) {
    console.log(`LIVE_SMOKE_SKIPPED: API unreachable (${res.body?.error || 'network error'})`);
    process.exit(0);
  }
  if (res.status === 404) {
    console.log('LIVE_SMOKE_SKIPPED: no daily quiz published (HTTP 404)');
    process.exit(0);
  }

  ok = line(res.ok, `GET /digest/quiz-today → HTTP ${res.status}`) && ok;
  if (!res.ok) {
    console.error('VERIFY_DAILY_QUIZ_DAILY_PICK_LIVE_PHASE5_FAILED');
    process.exit(1);
  }

  const quizDay = String(res.body?.quizDay || '').trim();
  ok = line(/^\d{4}-\d{2}-\d{2}$/.test(quizDay), `quizDay ISO present (${quizDay || 'missing'})`) && ok;

  const items = Array.isArray(res.body?.items) ? res.body.items : [];
  const declaredCount = Number(res.body?.questionCount);
  ok = line(items.length > 0, `items delivered: ${items.length}`) && ok;
  ok = line(items.length <= 50, `items.length <= 50 (daily cap) → ${items.length}`) && ok;
  ok =
    line(
      Number.isInteger(declaredCount) && declaredCount === items.length,
      `questionCount matches items.length (${declaredCount} vs ${items.length})`,
    ) && ok;

  const ids = items.map((x) => String(x?.id || '')).filter(Boolean);
  ok = line(new Set(ids).size === ids.length, 'all delivered item ids unique') && ok;

  for (const item of items) {
    const shape = verifyLiveDeliveryShape(item);
    ok = line(shape.ok, `shape ${item.id}: ${shape.reason || 'ok'}`) && ok;
  }

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_DAILY_PICK_LIVE_PHASE5_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_DAILY_PICK_LIVE_PHASE5_FAILED');
  process.exit(1);
}

main();
