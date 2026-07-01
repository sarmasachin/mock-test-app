'use strict';

/**
 * E2E: per-user /questions-attempt determinism + uniqueness (no guess — prints bodies).
 * Requires: API on localhost:3000, DATABASE_URL in .env
 */
require('dotenv').config();
const http = require('http');
const { pool } = require('../src/db');

function req(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, 'http://127.0.0.1:3000');
    const opts = {
      hostname: u.hostname,
      port: u.port || 3000,
      path: u.pathname + u.search,
      method,
      headers: { ...headers },
    };
    const reqHttp = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(buf) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    reqHttp.on('error', reject);
    reqHttp.end();
  });
}

async function register(email, phone) {
  const body = JSON.stringify({
    displayName: `E2E ${email}`,
    email,
    phone,
    password: 'Pass@12345',
    state: 'HP',
    district: 'Shimla',
  });
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/v1/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(buf) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

function fingerprint(items) {
  return (items || []).map((x) => ({
    prompt: String(x.questionPrompt || '').slice(0, 80),
    opts: (x.options || []).join('|'),
  }));
}

async function main() {
  const list = await req('GET', '/v1/tests?limit=10');
  if (list.status !== 200 || !list.json?.items?.length) {
    console.error('E2E_FAIL list_tests', list.status, list.raw || list.json);
    process.exit(1);
  }
  const testId = String(list.json.items[0].id);
  const title = String(list.json.items[0].title || '');

  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ('testAdvancedConfigs', '{}', NULL)
     ON CONFLICT (setting_key) DO NOTHING`,
  );
  const cfgRes = await pool.query(`SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`);
  let map = {};
  try {
    map = JSON.parse(String(cfgRes.rows?.[0]?.setting_value || '{}')) || {};
  } catch (_) {
    map = {};
  }
  map[testId] = { ...(map[testId] || {}), shuffleQuestions: true, shuffleOptions: true };
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ('testAdvancedConfigs', $1, NULL)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
    [JSON.stringify(map)],
  );

  const rnd = () => Math.floor(Math.random() * 900000000) + 100000000;
  const emailA = `e2eshuffle_a_${Date.now()}@mailinator.com`;
  const emailB = `e2eshuffle_b_${Date.now()}@mailinator.com`;
  const regA = await register(emailA, `9${rnd()}`);
  const regB = await register(emailB, `9${rnd()}`);
  if (regA.status !== 200 && regA.status !== 201) {
    console.error('E2E_FAIL register_a', regA.status, regA.raw || regA.json);
    process.exit(1);
  }
  if (regB.status !== 200 && regB.status !== 201) {
    console.error('E2E_FAIL register_b', regB.status, regB.raw || regB.json);
    process.exit(1);
  }
  const tokenA = regA.json.accessToken;
  const tokenB = regB.json.accessToken;

  const h = { Authorization: `Bearer ${tokenA}` };
  const h2 = { Authorization: `Bearer ${tokenB}` };

  const a1 = await req('GET', `/v1/tests/${testId}/questions-attempt`, h);
  const a2 = await req('GET', `/v1/tests/${testId}/questions-attempt`, h);
  const b1 = await req('GET', `/v1/tests/${testId}/questions-attempt`, h2);

  const fpA1 = fingerprint(a1.json?.items);
  const fpA2 = fingerprint(a2.json?.items);
  const fpB1 = fingerprint(b1.json?.items);

  const sameUserStable = JSON.stringify(fpA1) === JSON.stringify(fpA2);
  const differentUsers = JSON.stringify(fpA1) !== JSON.stringify(fpB1);

  console.log(
    JSON.stringify(
      {
        testId,
        title,
        attemptStatus_userA_call1: a1.status,
        attemptStatus_userA_call2: a2.status,
        attemptStatus_userB: b1.status,
        cycleKey: a1.json?.cycleKey,
        shuffleQuestions: a1.json?.shuffleQuestions,
        shuffleOptions: a1.json?.shuffleOptions,
        itemCountA: (a1.json?.items || []).length,
        itemCountB: (b1.json?.items || []).length,
        sameUserTwice_identical: sameUserStable,
        userA_vs_userB_different: differentUsers,
        fingerprint_userA: fpA1,
        fingerprint_userB: fpB1,
      },
      null,
      2,
    ),
  );

  if (a1.status !== 200 || a2.status !== 200 || b1.status !== 200) {
    console.error('E2E_FAIL non_200');
    process.exit(1);
  }
  if (!sameUserStable) {
    console.error('E2E_FAIL same_user_not_stable');
    process.exit(1);
  }
  if ((a1.json?.items || []).length >= 2 && !differentUsers) {
    console.error('E2E_FAIL expected_different_users_when_2plus_questions');
    process.exit(1);
  }
  if ((a1.json?.items || []).length === 1 && differentUsers) {
    // With 1 question, order same; options shuffle should still differ — check options string
    const optA = (a1.json.items[0].options || []).join('|');
    const optB = (b1.json.items[0].options || []).join('|');
    if (optA === optB) {
      console.error('E2E_FAIL single_question_options_should_differ');
      process.exit(1);
    }
  }

  if ((a1.json?.items || []).length >= 1) {
    for (const it of a1.json.items) {
      const text = String(it.correctOptionText || '').trim();
      const idx = Number(it.correctIndex);
      const opts = it.options || [];
      if (!text || !(idx >= 0 && idx < opts.length) || opts[idx] !== text) {
        console.error('E2E_FAIL correctOptionText_invariant', { id: it.id, text, idx, opts });
        process.exit(1);
      }
    }
  }
  if (a1.json?.cycleKey === undefined) {
    console.error('E2E_FAIL missing_cycleKey_in_response');
    process.exit(1);
  }

  console.log('E2E_OK');
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
