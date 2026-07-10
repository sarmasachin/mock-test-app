'use strict';

/**
 * Live API e2e: exam categories save via PATCH /admin/settings
 * Run: cd server && node scripts/e2eExamCategoriesSaveLive.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = String(process.env.E2E_API_BASE || 'http://127.0.0.1:3000/v1').replace(/\/+$/, '');
const ADMIN_EMAIL = String(process.env.E2E_ADMIN_EMAIL || 'admin@mocktest.com').trim();
const ADMIN_PASSWORD = String(process.env.E2E_ADMIN_PASSWORD || 'commingsoon@123');
const LIMITED_EMAIL = 'rbac-e2e-limited@mocktest.local';
const LIMITED_PASSWORD = 'RbacE2eTest!99';

let ok = true;
function assert(label, cond, detail) {
  const pass = Boolean(cond);
  console.log(`${pass ? 'OK' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!pass) ok = false;
}

async function api(method, route, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 300) };
  }
  return { status: res.status, data };
}

async function loginAdmin(identifier, password) {
  const res = await api('POST', '/auth/admin-login/request-otp', {
    body: { identifier, password },
  });
  if (!res.data?.accessToken) {
    throw new Error(res.data?.error || `login failed HTTP ${res.status}`);
  }
  return res.data.accessToken;
}

const testItem = {
  id: `exam-cat-e2e-${Date.now()}`,
  level1: 'State Exams',
  level2: 'HP Govt',
  level3: 'Patwari E2E',
  iconKey: 'railway',
  enabled: true,
};

const uploadedIconUrl =
  'https://admin-admin.govmocktest.com/uploads/articles/exam-icon-e2e-test-1234567890.webp';

async function main() {
  console.log('=== Live API: Exam Categories Save ===\n');

  let fullAdminToken;
  try {
    fullAdminToken = await loginAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert('login full admin', Boolean(fullAdminToken));
  } catch (e) {
    console.log('FAIL  login full admin —', e.message);
    process.exit(1);
  }

  let r = await api('GET', '/admin/permissions/me', { token: fullAdminToken });
  assert('full admin has tab_exam_categories', r.data?.permissionKeys?.includes('tab_exam_categories') || r.data?.implicitFullAccess, r.data);

  r = await api('PATCH', '/admin/settings', {
    token: fullAdminToken,
    body: {
      examCategories: { items: [testItem] },
      examCategoryIconOptions: { items: [{ id: 'railway', value: 'railway', label: 'Railway Exams' }] },
    },
  });
  assert('PATCH exam categories HTTP 200', r.status === 200, { status: r.status, error: r.data?.error });
  const savedItems = r.data?.settings?.examCategories?.items;
  assert('response contains saved item', Array.isArray(savedItems) && savedItems.some((x) => x.level3 === testItem.level3), savedItems);

  r = await api('GET', '/admin/settings', { token: fullAdminToken });
  const loaded = r.data?.settings?.examCategories?.items;
  assert('GET after PATCH persists item', Array.isArray(loaded) && loaded.some((x) => x.level3 === testItem.level3), loaded);

  // Uploaded URL icon test — reproduces truncation bug
  const urlItem = {
    ...testItem,
    id: `exam-cat-url-${Date.now()}`,
    level3: 'Patwari URL Icon',
    iconKey: uploadedIconUrl,
  };
  r = await api('PATCH', '/admin/settings', {
    token: fullAdminToken,
    body: { examCategories: { items: [testItem, urlItem] } },
  });
  assert('PATCH with uploaded URL icon HTTP 200', r.status === 200, r.status);
  const urlSaved = (r.data?.settings?.examCategories?.items || []).find((x) => x.level3 === urlItem.level3);
  assert('uploaded URL icon stored in full', urlSaved?.iconKey === uploadedIconUrl, urlSaved?.iconKey);

  r = await api('PATCH', '/admin/settings', {
    token: fullAdminToken,
    body: { examCategories: { items: [{ level1: 'A', level2: 'B', level3: ' ' }] } },
  });
  assert('invalid rows rejected HTTP 400', r.status === 400, { status: r.status, error: r.data?.error });

  r = await api('PATCH', '/admin/settings', {
    token: fullAdminToken,
    body: { examCategories: { items: [] } },
  });
  assert('empty overwrite without confirm HTTP 409', r.status === 409, { status: r.status, error: r.data?.error });

  r = await api('PATCH', '/admin/settings', {
    token: fullAdminToken,
    body: { examCategories: { items: [] }, confirmClearExamCategories: true },
  });
  assert('empty overwrite with confirm HTTP 200', r.status === 200, r.status);

  r = await api('PATCH', '/admin/settings', {
    token: fullAdminToken,
    body: { examCategories: { items: [testItem] } },
  });
  assert('restore seed item after clear test', r.status === 200, r.status);

  let limitedToken;
  try {
    limitedToken = await loginAdmin(LIMITED_EMAIL, LIMITED_PASSWORD);
  } catch (e) {
    console.log('SKIP  limited admin login —', e.message);
    limitedToken = '';
  }

  if (limitedToken) {
    r = await api('PATCH', '/admin/settings', {
      token: limitedToken,
      body: { examCategories: { items: [testItem] } },
    });
    assert('limited admin (no tab_exam_categories) denied HTTP 403', r.status === 403, {
      status: r.status,
      error: r.data?.error,
      missing: r.data?.missingPermissions,
    });
  }

  console.log(ok ? '\nLive API exam categories e2e PASSED.' : '\nLive API exam categories e2e FAILED.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
