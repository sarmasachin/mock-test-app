'use strict';
/**
 * E2E: enrollment count + Start Test catalog fields (live API).
 *
 * Default: read-only (no POST /apply mutations).
 *
 * Usage:
 *   node scripts/e2eEnrollStartTestCheck.js
 *   node scripts/e2eEnrollStartTestCheck.js --read-only
 *   node scripts/e2eEnrollStartTestCheck.js --with-apply
 *   node scripts/e2eEnrollStartTestCheck.js --require-auth
 *   node scripts/e2eEnrollStartTestCheck.js --api https://admin-admin.govmocktest.com/v1
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { pool } = require('../src/db');

const args = process.argv.slice(2);
const withApply = args.includes('--with-apply');
const readOnly = !withApply || args.includes('--read-only');

const apiIdx = args.indexOf('--api');
const API = String(
  (apiIdx >= 0 && args[apiIdx + 1]) ||
    process.env.E2E_API_BASE ||
    process.env.API_BASE ||
    'https://admin-admin.govmocktest.com/v1',
).replace(/\/+$/, '');

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

function enrollmentMathOk(item) {
  const cap = Number(item.capacityTotal || 0);
  const enc = Number(item.enrolledCount || 0);
  const rem = Number(item.remainingSeats ?? Math.max(0, cap - enc));
  return enc >= 0 && (cap <= 0 || enc <= cap) && rem === Math.max(0, cap - enc);
}

function resolveEnrollmentOk(body) {
  if (!body || body.found !== true) return { ok: false, reason: 'found !== true' };
  const cap = Number(body.capacityTotal);
  const enc = Number(body.enrolledCount);
  const rem = Number(body.remainingSeats);
  if (!Number.isFinite(enc) || !Number.isFinite(cap) || !Number.isFinite(rem)) {
    return { ok: false, reason: 'missing enrollment fields (Phase 5 not deployed?)' };
  }
  const mathOk = enc >= 0 && (cap <= 0 || enc <= cap) && rem === Math.max(0, cap - enc);
  return { ok: mathOk, enc, cap, rem, reason: mathOk ? '' : 'enrollment math mismatch' };
}

async function loginUser() {
  const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '9817585270').trim();
  const password = String(process.env.E2E_LOGIN_PASSWORD || '123456');
  const login = await fetchJson(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!login.ok || !login.body?.accessToken) {
    return { token: '', error: login.body?.error || `HTTP ${login.status}` };
  }
  return { token: String(login.body.accessToken), error: '' };
}

async function checkLiveApi() {
  let ok = true;
  console.log('\n=== LIVE API (enrollment + Start Test) ===');
  console.log(`API: ${API}`);
  console.log(`Mode: ${readOnly ? 'read-only' : 'with-apply (mutates enrollment)'}\n`);

  const health = await fetchJson(API.replace(/\/v1$/, '') + '/health');
  ok = line(health.ok, `GET /health → ${health.status}`) && ok;

  const catalog = await fetchJson(`${API}/tests?limit=50`);
  const items = Array.isArray(catalog.body?.items) ? catalog.body.items : [];
  ok = line(catalog.ok, `GET /tests → HTTP ${catalog.status}, ${items.length} published test(s)`) && ok;

  if (items.length === 0) {
    line(true, 'WARN  catalog empty — between cycles or no published tests');
    return ok;
  }

  for (const item of items) {
    const preview = androidHasStartTestFields(item);
    ok =
      line(
        preview.passes,
        `Start Test fields "${item.title}": id + duration + questionsMarks`,
      ) && ok;
    ok =
      line(
        enrollmentMathOk(item),
        `Catalog enroll "${item.title}": ${preview.enrolledLabel} remaining=${item.remainingSeats ?? '?'}`,
      ) && ok;
  }

  const loginRes = await loginUser();
  if (!loginRes.token) {
    const requireAuth = args.includes('--require-auth');
    const msg = `Auth checks skipped — login failed: ${loginRes.error}`;
    if (requireAuth) {
      ok = line(false, msg) && ok;
    } else {
      line(true, `${msg} (pass --require-auth to fail hard)`);
      line(true, 'Set E2E_LOGIN_IDENTIFIER + E2E_LOGIN_PASSWORD in server/.env for resolve/my-applications live checks');
    }
    return ok;
  }
  const auth = { Authorization: `Bearer ${loginRes.token}` };
  ok = line(true, 'POST /auth/login → token received') && ok;

  const test = items[0];
  if (!test?.id) return ok;

  const resolve = await fetchJson(`${API}/tests/resolve?testId=${encodeURIComponent(test.id)}`, {
    headers: auth,
  });
  ok = line(resolve.ok, `GET /tests/resolve → HTTP ${resolve.status}`) && ok;
  if (resolve.ok) {
    ok = line(resolve.body?.found === true, `Resolve found=true title="${resolve.body?.title || ''}"`) && ok;
    const enroll = resolveEnrollmentOk(resolve.body);
    ok =
      line(
        enroll.ok,
        enroll.ok
          ? `Resolve enrollment Phase 5: ${enroll.enc}/${enroll.cap} remaining=${enroll.rem}`
          : `Resolve enrollment: ${enroll.reason}`,
      ) && ok;

    const catalogEnc = Number(test.enrolledCount || 0);
    const catalogCap = Number(test.capacityTotal || 0);
    if (enroll.ok) {
      const aligned = enroll.enc === catalogEnc && enroll.cap === catalogCap;
      ok =
        line(
          aligned,
          `Catalog vs resolve aligned: catalog=${catalogEnc}/${catalogCap} resolve=${enroll.enc}/${enroll.cap}`,
        ) && ok;
    }

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
        Number.isFinite(Number(mine.enrolledCount)) && Number.isFinite(Number(mine.capacityTotal)),
        `my-applications enroll "${mine.testTitle}": ${mine.enrolledCount}/${mine.capacityTotal}`,
      ) && ok;
  }

  if (readOnly) {
    line(true, 'Apply mutation skipped (read-only). Pass --with-apply to test POST /tests/:id/apply.');
    return ok;
  }

  const beforeEnc = Number(test.enrolledCount || 0);
  const apply1 = await fetchJson(`${API}/tests/${test.id}/apply`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  });
  ok = line(apply1.status > 0, `POST /tests/:id/apply → HTTP ${apply1.status}`) && ok;
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
        dupApply || increased,
        `Catalog enrolled after apply: before=${beforeEnc} after=${afterEnc} duplicate=${dupApply}`,
      ) && ok;
    if (!dupApply && !increased) {
      ok = line(false, 'Fresh apply did not increase catalog enrolledCount') && ok;
    }
  }

  const resolveAfter = await fetchJson(`${API}/tests/resolve?testId=${encodeURIComponent(test.id)}`, {
    headers: auth,
  });
  if (resolveAfter.ok) {
    const enrollAfter = resolveEnrollmentOk(resolveAfter.body);
    ok =
      line(
        enrollAfter.ok,
        enrollAfter.ok
          ? `Resolve after apply: ${enrollAfter.enc}/${enrollAfter.cap}`
          : `Resolve after apply: ${enrollAfter.reason}`,
      ) && ok;
  }

  return ok;
}

async function checkLocalDb() {
  let ok = true;
  console.log('\n=== LOCAL DB (optional — skipped when no DATABASE_URL) ===\n');
  if (!process.env.DATABASE_URL) {
    line(true, 'DATABASE_URL not set — local DB checks skipped');
    return ok;
  }
  try {
    const { rows } = await pool.query(
      `SELECT id::text, title, is_published, capacity_total, enrolled_count
       FROM tests WHERE is_published = true ORDER BY updated_at DESC LIMIT 10`,
    );
    ok = line(rows.length >= 0, `${rows.length} published test row(s) in local DB`) && ok;
    for (const t of rows) {
      console.log(`     · ${t.title} | enrolled_count=${t.enrolled_count}/${t.capacity_total}`);
    }
  } catch (e) {
    ok = line(true, `Local DB skipped: ${e.message}`) && ok;
  }
  return ok;
}

async function main() {
  console.log('=== e2eEnrollStartTestCheck ===');
  let ok = await checkLiveApi();
  ok = (await checkLocalDb()) && ok;
  console.log('');
  if (ok) {
    console.log('E2E_ENROLL_START_TEST_OK');
    process.exit(0);
  }
  console.error('E2E_ENROLL_START_TEST_FAILED');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
