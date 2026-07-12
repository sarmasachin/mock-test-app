'use strict';

/**
 * E2E diagnostic: exam categories save path (normalize + RBAC + optional live DB/API).
 * Run: cd server && node scripts/e2eExamCategoriesSave.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  getSettingsPatchRequiredPermissions,
  evaluateRoutePermissionAccess,
  resolveAdminRouteRule,
} = require('../src/lib/adminRoutePermissions');

// Copy of admin.js normalize path (Phase 1 — uses examCategoriesAdmin)
const {
  normalizeExamCategoriesValue,
  validateExamCategoriesCollisions,
} = require('../src/lib/examCategoriesAdmin');

function normalizeExamCategories(value, options = {}) {
  return normalizeExamCategoriesValue(value, options);
}

function validateExamCategoriesPatch({
  rawItemCount,
  normalizedItemCount,
  existingItemCount,
  confirmClear,
}) {
  if (rawItemCount > 0 && normalizedItemCount === 0) {
    return { ok: false, status: 400 };
  }
  if (rawItemCount === 0 && existingItemCount > 0 && !confirmClear) {
    return { ok: false, status: 409 };
  }
  return { ok: true };
}

function normalizeExamCategoryIconOptions(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const items = rawItems
    .map((item, index) => {
      const x = item || {};
      return {
        id: String(x.id || `exam-icon-${index + 1}`).trim().slice(0, 60),
        value: String(x.value || '').trim().slice(0, 40).toLowerCase(),
        label: String(x.label || '').trim().slice(0, 80),
      };
    })
    .filter((x) => x.value && x.label);
  return { value: { items } };
}

let ok = true;
function assert(label, cond, detail) {
  const pass = Boolean(cond);
  console.log(`${pass ? 'OK' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!pass) ok = false;
  return pass;
}

const API_BASE = String(process.env.E2E_API_BASE || 'http://127.0.0.1:3000/v1').replace(/\/+$/, '');
const PROD_API = 'https://admin-admin.govmocktest.com/v1';

async function api(method, base, route, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function main() {
  console.log('=== Exam Categories Save E2E Diagnostic ===\n');

  console.log('--- 1) RBAC: PATCH /admin/settings requires tab_exam_categories ---');
  const patchBody = {
    examCategories: {
      items: [{ id: 'exam-cat-test', level1: 'State', level2: 'HP', level3: 'Patwari', iconKey: 'math', enabled: true }],
    },
    examCategoryIconOptions: { items: [{ id: 'math', value: 'math', label: 'Math' }] },
  };
  const required = getSettingsPatchRequiredPermissions(patchBody);
  assert('requires tab_exam_categories only', required.length === 1 && required[0] === 'tab_exam_categories', required);
  const rule = resolveAdminRouteRule('PATCH', '/settings');
  const deniedArticlesOnly = evaluateRoutePermissionAccess(rule, {
    body: patchBody,
    hasAdminPermission: (k) => k === 'tab_articles',
  });
  assert('denied with tab_articles only (common mis-grant)', !deniedArticlesOnly.allowed, deniedArticlesOnly);
  const allowedExam = evaluateRoutePermissionAccess(rule, {
    body: patchBody,
    hasAdminPermission: (k) => k === 'tab_exam_categories',
  });
  assert('allowed with tab_exam_categories', allowedExam.allowed, allowedExam);

  console.log('\n--- 2) Server normalize: valid hierarchy saves ---');
  const valid = normalizeExamCategories({
    items: [{ level1: ' State ', level2: 'HP Govt', level3: 'Patwari', iconKey: 'railway' }],
  });
  assert('valid item kept', valid.value.items.length === 1, valid.value.items);
  assert('levels trimmed', valid.value.items[0].level1 === 'State', valid.value.items[0]);

  console.log('\n--- 3) Server validate: invalid rows blocked ---');
  const missingL3 = normalizeExamCategories({
    items: [{ level1: 'State', level2: 'HP', level3: '  ', iconKey: 'math' }],
  });
  assert('empty level3 row filtered out', missingL3.value.items.length === 0, missingL3.value.items);
  assert(
    'invalid rows -> 400 rule',
    !validateExamCategoriesPatch({
      rawItemCount: missingL3.rawCount,
      normalizedItemCount: missingL3.value.items.length,
      existingItemCount: 5,
      confirmClear: false,
    }).ok,
  );

  console.log('\n--- 4) Server validate: empty overwrite needs confirm ---');
  assert(
    'empty without confirm -> 409 rule',
    !validateExamCategoriesPatch({
      rawItemCount: 0,
      normalizedItemCount: 0,
      existingItemCount: 3,
      confirmClear: false,
    }).ok,
  );
  assert(
    'empty with confirm allowed',
    validateExamCategoriesPatch({
      rawItemCount: 0,
      normalizedItemCount: 0,
      existingItemCount: 3,
      confirmClear: true,
    }).ok,
  );

  console.log('\n--- 5) Server normalize: uploaded icon URL kept (up to 800 chars) ---');
  const uploadedUrl =
    'https://admin-admin.govmocktest.com/uploads/articles/exam-icon-1730000000000.webp';
  const withUrl = normalizeExamCategories({
    items: [{ level1: 'A', level2: 'B', level3: 'C', iconKey: uploadedUrl }],
  });
  const outKey = withUrl.value.items[0]?.iconKey || '';
  assert('icon URL input > 40 chars', uploadedUrl.length > 40, uploadedUrl.length);
  assert('iconKey saved full URL', outKey === uploadedUrl, outKey);

  console.log('\n--- 6) Icon options: empty value stripped on save ---');
  const icons = normalizeExamCategoryIconOptions({
    items: [
      { value: '', label: 'Default (star)' },
      { value: 'math', label: 'Math' },
    ],
  });
  assert('default empty value option removed', icons.value.items.length === 1, icons.value.items);

  if (process.env.DATABASE_URL) {
    console.log('\n--- 7) Live DB round-trip (if Postgres reachable) ---');
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4000 });
    try {
      const before = await pool.query(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'examCategories' LIMIT 1`,
      );
      const prev = before.rows[0]?.setting_value || null;
      const testPayload = JSON.stringify(valid.value);
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ('examCategories', $1, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [testPayload],
      );
      const after = await pool.query(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'examCategories' LIMIT 1`,
      );
      const parsed = JSON.parse(after.rows[0].setting_value);
      assert('DB write/read round-trip', Array.isArray(parsed.items) && parsed.items.length >= 1, parsed);
      if (prev !== null) {
        await pool.query(`UPDATE app_settings SET setting_value = $1 WHERE setting_key = 'examCategories'`, [prev]);
        console.log('OK  restored previous examCategories DB value');
      }
    } catch (e) {
      console.log(`SKIP  DB — ${e.message}`);
    } finally {
      await pool.end().catch(() => {});
    }
  } else {
    console.log('\nSKIP  DATABASE_URL not set');
  }

  console.log('\n--- 7) Live API reachability ---');
  for (const [label, base] of [
    ['local', API_BASE],
    ['production', PROD_API],
  ]) {
    try {
      const health = await api('GET', base, '/health');
      console.log(`${label} /health → HTTP ${health.status}`, typeof health.data === 'object' ? health.data : health.data?._raw);
    } catch (e) {
      console.log(`${label} /health → unreachable (${e.message})`);
    }
  }

  const noAuthPatch = await api('PATCH', PROD_API, '/admin/settings', {
    body: patchBody,
  }).catch((e) => ({ status: 0, data: { error: e.message } }));
  assert(
    'production PATCH without token is rejected (not open)',
    noAuthPatch.status === 401 || noAuthPatch.status === 403,
    noAuthPatch.status,
  );

  console.log('\n=== Summary ===');
  if (!ok) {
    console.log('Some checks FAILED — see FAIL lines above.');
    process.exit(1);
  }
  console.log('All automated checks passed.');
  console.log('\nMost likely user-facing causes when save "does not work":');
  console.log('  A) Admin lacks tab_exam_categories → UI toast "Permission denied" / HTTP 403');
  console.log('  B) Custom uploaded icon URL truncated to 40 chars → icon looks lost after reload');
  console.log('  C) Level 1/2/3 not all filled → row dropped by server normalize');
  console.log('  D) No success toast on save — user must click Load to verify');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
