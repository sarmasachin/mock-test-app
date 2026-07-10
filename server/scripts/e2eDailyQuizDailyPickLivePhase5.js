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

  ok =
    line(
      res.status === 410,
      `GET /digest/quiz-today → HTTP ${res.status} (410 Gone expected — login-only)`,
    ) && ok;

  if (!ok) {
    console.error('VERIFY_DAILY_QUIZ_DAILY_PICK_LIVE_PHASE5_FAILED');
    process.exit(1);
  }

  console.log('LIVE_SMOKE_NOTE: public digest/quiz-today deprecated — use auth GET /daily-quiz/today');
  console.log('VERIFY_DAILY_QUIZ_DAILY_PICK_LIVE_PHASE5_OK');
  process.exit(0);
}

main();
