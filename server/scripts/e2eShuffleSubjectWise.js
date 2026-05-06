'use strict';

/**
 * E2E: subject-wise shuffle — subjectKey order must be math,math,bio,bio,hindi,hindi;
 * shuffle only within each block (different users should usually differ inside blocks).
 * Temporarily replaces questions for first listed test, then restores DB.
 *
 * Requires: API on 127.0.0.1:3000, DATABASE_URL in server/.env
 *
 *   node scripts/e2eShuffleSubjectWise.js
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
    displayName: `E2E_SUBJ ${email}`,
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

function assertBlockOrder(items) {
  const keys = (items || []).map((x) => String(x.subjectKey || '').trim().toLowerCase());
  const expectedPrefix = ['math', 'math', 'bio', 'bio', 'hindi', 'hindi'];
  if (keys.length !== 6) {
    return { ok: false, detail: `expected 6 items, got ${keys.length}` };
  }
  if (JSON.stringify(keys) !== JSON.stringify(expectedPrefix)) {
    return { ok: false, detail: `subjectKey order mismatch: ${JSON.stringify(keys)}` };
  }
  return { ok: true };
}

async function restoreQuestionsAndConfig(testId, backupRows, cfgBefore) {
  const c2 = await pool.connect();
  try {
    await c2.query('BEGIN');
    await c2.query(`DELETE FROM questions WHERE test_id = $1::uuid`, [testId]);
    for (const r of backupRows) {
      await c2.query(
        `INSERT INTO questions (
           test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          r.test_id,
          r.position,
          r.stem,
          r.choice_a,
          r.choice_b,
          r.choice_c,
          r.choice_d,
          r.correct_index,
          r.explanation,
          r.is_published !== false,
          r.subject_key || '',
        ],
      );
    }
    await c2.query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by)
       VALUES ('testAdvancedConfigs', $1, NULL)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
      [JSON.stringify(cfgBefore)],
    );
    await c2.query('COMMIT');
  } catch (e) {
    await c2.query('ROLLBACK').catch(() => {});
    console.error('E2E_SUBJ_WARN restore_failed', e.message || e);
  } finally {
    c2.release();
  }
}

async function main() {
  const list = await req('GET', '/v1/tests?limit=10');
  if (list.status !== 200 || !list.json?.items?.length) {
    console.error('E2E_SUBJ_FAIL list_tests', list.status, list.raw || list.json);
    process.exit(1);
  }
  const testId = String(list.json.items[0].id);

  const backupRes = await pool.query(
    `SELECT test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published,
            COALESCE(subject_key, '') AS subject_key
     FROM questions WHERE test_id = $1::uuid ORDER BY position ASC, id ASC`,
    [testId],
  );
  const backupRows = backupRes.rows || [];

  let cfgBefore = {};
  try {
    const cfgRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
    );
    cfgBefore = JSON.parse(String(cfgRes.rows?.[0]?.setting_value || '{}')) || {};
  } catch (_) {
    cfgBefore = {};
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM questions WHERE test_id = $1::uuid`, [testId]);

    const seedRows = [
      ['SUBJ_MATH_A', 'math'],
      ['SUBJ_MATH_B', 'math'],
      ['SUBJ_BIO_A', 'bio'],
      ['SUBJ_BIO_B', 'bio'],
      ['SUBJ_HI_A', 'hindi'],
      ['SUBJ_HI_B', 'hindi'],
    ];
    let pos = 1;
    for (const [stem, sk] of seedRows) {
      await client.query(
        `INSERT INTO questions (
           test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [testId, pos, stem, 'A', 'B', 'C', 'D', 0, '', true, sk],
      );
      pos += 1;
    }

    const nextMap = { ...cfgBefore };
    nextMap[testId] = {
      ...(nextMap[testId] || {}),
      shuffleQuestions: true,
      shuffleOptions: false,
      subjectSections: [
        { key: 'math', label: 'Mathematics' },
        { key: 'bio', label: 'Biology' },
        { key: 'hindi', label: 'Hindi' },
      ],
    };
    await client.query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by)
       VALUES ('testAdvancedConfigs', $1, NULL)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
      [JSON.stringify(nextMap)],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error('E2E_SUBJ_FAIL seed', e);
    await restoreQuestionsAndConfig(testId, backupRows, cfgBefore);
    await pool.end();
    process.exit(1);
  }
  client.release();

  const rnd = () => Math.floor(Math.random() * 900000000) + 100000000;
  const emailA = `e2esubj_a_${Date.now()}@mailinator.com`;
  const emailB = `e2esubj_b_${Date.now()}@mailinator.com`;
  const regA = await register(emailA, `9${rnd()}`);
  const regB = await register(emailB, `9${rnd()}`);

  const fail = async (code, extra) => {
    if (extra) console.error(extra);
    await restoreQuestionsAndConfig(testId, backupRows, cfgBefore);
    await pool.end();
    console.error(code);
    process.exit(1);
  };

  if (regA.status !== 200 && regA.status !== 201) {
    await fail('E2E_SUBJ_FAIL register_a', regA.raw || regA.json);
  }
  if (regB.status !== 200 && regB.status !== 201) {
    await fail('E2E_SUBJ_FAIL register_b', regB.raw || regB.json);
  }

  const h = { Authorization: `Bearer ${regA.json.accessToken}` };
  const h2 = { Authorization: `Bearer ${regB.json.accessToken}` };

  const a1 = await req('GET', `/v1/tests/${testId}/questions-attempt`, h);
  const a2 = await req('GET', `/v1/tests/${testId}/questions-attempt`, h);
  const b1 = await req('GET', `/v1/tests/${testId}/questions-attempt`, h2);

  try {
    if (a1.status !== 200 || a2.status !== 200 || b1.status !== 200) {
      await fail('E2E_SUBJ_FAIL http', { a1: a1.status, a2: a2.status, b1: b1.status });
    }

    const orderCheck = assertBlockOrder(a1.json?.items);
    if (!orderCheck.ok) {
      console.error(JSON.stringify(a1.json?.items?.map((x) => ({ sk: x.subjectKey, p: x.questionPrompt })), null, 2));
      await fail('E2E_SUBJ_FAIL block_order', orderCheck.detail);
    }

    const fp1 = JSON.stringify(
      (a1.json?.items || []).map((x) => ({ p: x.questionPrompt, sk: x.subjectKey })),
    );
    const fp2 = JSON.stringify(
      (a2.json?.items || []).map((x) => ({ p: x.questionPrompt, sk: x.subjectKey })),
    );
    if (fp1 !== fp2) {
      await fail('E2E_SUBJ_FAIL same_user_not_stable');
    }

    const promptsA = (a1.json?.items || []).map((x) => x.questionPrompt);
    const promptsB = (b1.json?.items || []).map((x) => x.questionPrompt);
    const mathOk =
      new Set(promptsA.slice(0, 2)).has('SUBJ_MATH_A') &&
      new Set(promptsA.slice(0, 2)).has('SUBJ_MATH_B') &&
      new Set(promptsB.slice(0, 2)).has('SUBJ_MATH_A') &&
      new Set(promptsB.slice(0, 2)).has('SUBJ_MATH_B');
    if (!mathOk) {
      await fail('E2E_SUBJ_FAIL math_prompts');
    }

    const orderWithinMathA = [promptsA[0], promptsA[1]].join('|');
    const orderWithinMathB = [promptsB[0], promptsB[1]].join('|');
    const usersDifferInsideMath = orderWithinMathA !== orderWithinMathB;

    console.log(
      JSON.stringify(
        {
          testId,
          subjectKeyOrder: (a1.json.items || []).map((x) => x.subjectKey),
          sameUserStable: true,
          userA_mathOrder: orderWithinMathA,
          userB_mathOrder: orderWithinMathB,
          usersDifferInsideMathBlock: usersDifferInsideMath,
        },
        null,
        2,
      ),
    );

    if (!usersDifferInsideMath) {
      console.warn(
        'E2E_SUBJ_WARN: math block order identical for two users (possible RNG collision — re-run).',
      );
    }

    console.log('E2E_SUBJ_OK');
  } finally {
    await restoreQuestionsAndConfig(testId, backupRows, cfgBefore);
    await pool.end();
  }
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
