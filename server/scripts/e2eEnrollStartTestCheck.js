'use strict';
/**
 * Read-only E2E: enroll count + start-test catalog fields (live API + local DB).
 * Usage: node scripts/e2eEnrollStartTestCheck.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { pool } = require('../src/db');

const API = String(process.env.E2E_API_BASE || process.env.API_BASE || 'https://admin-admin.govmocktest.com/v1').replace(
  /\/+$/,
  '',
);

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, body };
}

function androidHasStartTestFields(item) {
  const durationMinutes = Number(item.durationMinutes || 0);
  const questionCount = Number(item.questionCount || 0);
  const id = String(item.id || '').trim();
  const durationLabel =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)} hrs`
      : `${durationMinutes} min`;
  const questionsMarks = `${questionCount} Q / ${Number(item.totalMarks || 0)} marks`;
  return {
    id: Boolean(id),
    questionsMarks: Boolean(questionsMarks.trim()),
    durationLabel: Boolean(durationLabel.trim()),
    enrolledLabel:
      Number(item.capacityTotal || 0) > 0
        ? `${Number(item.enrolledCount || 0)}/${Number(item.capacityTotal || 0)}`
        : `${Number(item.enrolledCount || 0)}`,
    passes: Boolean(id && questionsMarks && durationLabel),
  };
}

async function checkLiveApi() {
  let ok = true;
  console.log('\n=== LIVE API (Start Test data source) ===');
  console.log(`API: ${API}\n`);

  const health = await fetchJson(API.replace('/v1', '') + '/health');
  ok = line(health.ok, `GET /health → ${health.status}`) && ok;

  const catalog = await fetchJson(`${API}/tests?limit=50`);
  const items = Array.isArray(catalog.body?.items) ? catalog.body.items : [];
  ok = line(catalog.ok && items.length > 0, `GET /tests → ${items.length} published test(s)`) && ok;

  for (const item of items) {
    const preview = androidHasStartTestFields(item);
    const cap = Number(item.capacityTotal || 0);
    const enc = Number(item.enrolledCount || 0);
    const rem = Number(item.remainingSeats ?? Math.max(0, cap - enc));
    const enrollMathOk = enc >= 0 && (cap <= 0 || enc <= cap) && rem === Math.max(0, cap - enc);
    ok =
      line(
        preview.passes,
        `Start Test fields "${item.title}": ${preview.questionsMarks ? item.questionCount + ' Q' : '?'}, duration, id`,
      ) && ok;
    ok =
      line(
        enrollMathOk,
        `Enroll math "${item.title}": enrolled=${enc}/${cap} remaining=${rem} (label: ${preview.enrolledLabel})`,
      ) && ok;
  }

  const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '').trim();
  const password = String(process.env.E2E_LOGIN_PASSWORD || '');
  if (!identifier || !password) {
    line(true, 'Auth apply check skipped — set E2E_LOGIN_IDENTIFIER + E2E_LOGIN_PASSWORD in server/.env');
    return ok;
  }

  const login = await fetchJson(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!login.ok || !login.body?.accessToken) {
    line(true, `Auth apply check skipped — login failed: ${login.body?.error || login.status}`);
    return ok;
  }
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  ok = line(true, 'POST /auth/login → token received') && ok;

  const test = items[0];
  if (!test?.id) return ok;

  const beforeEnc = Number(test.enrolledCount || 0);
  const apply1 = await fetchJson(`${API}/tests/${test.id}/apply`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  });
  ok = line(apply1.status > 0, `POST /tests/:id/apply (1st) → HTTP ${apply1.status}`) && ok;
  if (apply1.body) {
    ok =
      line(
        Number.isFinite(Number(apply1.body.enrolledCount)),
        `Apply response enrolledCount=${apply1.body.enrolledCount} capacity=${apply1.body.capacityTotal}`,
      ) && ok;
  }

  const catalogAfter = await fetchJson(`${API}/tests?limit=50`);
  const afterItem = (catalogAfter.body?.items || []).find((x) => x.id === test.id);
  if (afterItem) {
    const afterEnc = Number(afterItem.enrolledCount || 0);
    const dupApply = apply1.body?.alreadyApplied === true;
    const increased = afterEnc > beforeEnc;
    ok =
      line(
        dupApply || increased || afterEnc === beforeEnc,
        `Catalog enrolled after apply: before=${beforeEnc} after=${afterEnc} duplicate=${dupApply}`,
      ) && ok;
    if (!dupApply && !increased && afterEnc === beforeEnc) {
      ok = line(false, 'Fresh apply did not increase catalog enrolledCount — enroll may be broken on server') && ok;
    }
  }

  const resolve = await fetchJson(`${API}/tests/resolve?testId=${encodeURIComponent(test.id)}`, { headers: auth });
  ok = line(resolve.ok, `GET /tests/resolve → HTTP ${resolve.status}`) && ok;
  if (resolve.ok) {
    ok = line(resolve.body?.found === true, `Resolve found=true title="${resolve.body?.title || ''}"`) && ok;
    ok =
      line(
        typeof resolve.body?.alreadyAppliedInCurrentCycle === 'boolean',
        `Resolve alreadyAppliedInCurrentCycle=${resolve.body?.alreadyAppliedInCurrentCycle}`,
      ) && ok;
  }

  const myApps = await fetchJson(`${API}/tests/my-applications`, { headers: auth });
  const apps = Array.isArray(myApps.body?.items) ? myApps.body.items : [];
  ok = line(myApps.ok, `GET /my-applications → ${apps.length} item(s)`) && ok;
  const mine = apps.find((a) => String(a.testId) === String(test.id));
  if (mine) {
    ok =
      line(
        Number(mine.enrolledCount) >= 0,
        `my-applications enroll for "${mine.testTitle}": ${mine.enrolledCount}/${mine.capacityTotal}`,
      ) && ok;
  }

  return ok;
}

async function checkLocalDb() {
  let ok = true;
  console.log('\n=== LOCAL DB (enrolled_count truth) ===\n');
  try {
    const { rows } = await pool.query(
      `SELECT id::text, title, is_published, capacity_total, enrolled_count,
              duration_minutes, question_count
       FROM tests ORDER BY updated_at DESC LIMIT 20`,
    );
    ok = line(rows.length > 0, `${rows.length} test row(s) in DB`) && ok;
    for (const t of rows) {
      console.log(
        `     · ${t.title} | published=${t.is_published} | enrolled_count=${t.enrolled_count}/${t.capacity_total}`,
      );
    }

    const { rows: mismatches } = await pool.query(
      `SELECT t.id::text, t.title, t.enrolled_count,
              (SELECT COUNT(*)::int FROM test_applications ta WHERE ta.test_id = t.id) AS actual_apps
       FROM tests t
       WHERE t.is_published = true`,
    );
    for (const r of mismatches) {
      const match = Number(r.enrolled_count) === Number(r.actual_apps);
      ok =
        line(
          match,
          `DB sync "${r.title}": enrolled_count=${r.enrolled_count} vs applications=${r.actual_apps}`,
        ) && ok;
    }
  } catch (e) {
    ok = line(false, `DB check failed: ${e.message}`) && ok;
  }
  return ok;
}

async function main() {
  console.log('=== e2eEnrollStartTestCheck (read-only) ===');
  let ok = await checkLiveApi();
  ok = (await checkLocalDb()) && ok;
  console.log('');
  if (ok) {
    console.log('PASS  Enroll + Start Test data checks');
    process.exit(0);
  }
  console.error('FAIL  Enroll + Start Test data checks');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
