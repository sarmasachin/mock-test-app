#!/usr/bin/env node
'use strict';

/**
 * RBAC Phase 5 — live API + DB integration tests.
 *
 * Requires:
 *   - API running (default http://127.0.0.1:3000)
 *   - DATABASE_URL in server/.env
 *   - ADMIN_DEV_PASSWORD_LOGIN=true for password-only login (local), OR set E2E_SUPER_ADMIN_TOKEN
 *
 *   cd server && node scripts/e2eAdminPermissionsLive.js
 *
 * Env:
 *   E2E_API_BASE              default http://127.0.0.1:3000/v1
 *   E2E_SUPER_ADMIN_EMAIL     default sharma.sachinctr@gmail.com
 *   E2E_SUPER_ADMIN_PASSWORD  default from seed (commingsoon@123)
 *   E2E_SUPER_ADMIN_TOKEN     skip login if set
 *   E2E_LIMITED_ADMIN_EMAIL   default rbac-e2e-limited@mocktest.local
 *   E2E_LIMITED_ADMIN_PASSWORD default RbacE2eTest!99
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const {
  ALL_ADMIN_PERMISSION_KEYS,
  buildPermissionCatalog,
} = require('../src/constants/adminPermissions');
const {
  FRONTEND_TAB_PERMISSION_BY_TAB,
  FRONTEND_ALL_NAV_TABS,
} = require('../src/constants/adminRbacUiAlign');
const { TAB_PERMISSIONS } = require('../src/constants/adminPermissions');

const API_BASE = String(process.env.E2E_API_BASE || 'http://127.0.0.1:3000/v1').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.E2E_SUPER_ADMIN_EMAIL || 'sharma.sachinctr@gmail.com').trim();
const SUPER_PASSWORD = String(process.env.E2E_SUPER_ADMIN_PASSWORD || 'commingsoon@123');
const LIMITED_EMAIL = String(process.env.E2E_LIMITED_ADMIN_EMAIL || 'rbac-e2e-limited@mocktest.local').trim();
const LIMITED_PASSWORD = String(process.env.E2E_LIMITED_ADMIN_PASSWORD || 'RbacE2eTest!99');

let ok = true;

function assert(label, cond, detail) {
  const pass = Boolean(cond);
  console.log(`${pass ? 'OK' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!pass) ok = false;
  return pass;
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
    data = { _raw: text };
  }
  return { status: res.status, data };
}

async function loginAdmin(identifier, password) {
  const preToken = String(process.env.E2E_SUPER_ADMIN_TOKEN || '').trim();
  if (preToken && identifier === SUPER_EMAIL) return preToken;

  const res = await api('POST', '/auth/admin-login/request-otp', {
    body: { identifier, password },
  });
  if (!res.data?.accessToken) {
    throw new Error(
      res.data?.error ||
        'Login failed — set ADMIN_DEV_PASSWORD_LOGIN=true locally or provide E2E_SUPER_ADMIN_TOKEN',
    );
  }
  return res.data.accessToken;
}

async function ensureLimitedAdminUser(pool) {
  const hash = await bcrypt.hash(LIMITED_PASSWORD, 10);
  const existing = await pool.query(`SELECT id::text AS id FROM users WHERE lower(trim(email)) = lower($1) LIMIT 1`, [
    LIMITED_EMAIL,
  ]);
  let userId = existing.rows[0]?.id;
  if (!userId) {
    let chosenId = 100000 + Math.floor(Math.random() * 900000);
    for (let i = 0; i < 20; i += 1) {
      try {
        const ins = await pool.query(
          `INSERT INTO users (email, password_hash, display_name, phone, six_digit_public_id, is_admin, is_super_admin)
           VALUES ($1, $2, 'RBAC E2E Limited', '', $3, true, false)
           RETURNING id::text AS id`,
          [LIMITED_EMAIL, hash, chosenId],
        );
        userId = ins.rows[0].id;
        break;
      } catch (e) {
        if (e && e.code === '23505') {
          chosenId = 100000 + Math.floor(Math.random() * 900000);
          continue;
        }
        throw e;
      }
    }
  } else {
    await pool.query(
      `UPDATE users SET password_hash = $1, is_admin = true, is_super_admin = false, is_banned = false WHERE id = $2::uuid`,
      [hash, userId],
    );
  }
  if (!userId) throw new Error('Failed to create limited admin test user');
  return userId;
}

async function setStoredPermissions(pool, userId, keys) {
  await pool.query(`DELETE FROM admin_user_permissions WHERE user_id = $1::uuid`, [userId]);
  for (const key of keys) {
    await pool.query(
      `INSERT INTO admin_user_permissions (user_id, permission_key) VALUES ($1::uuid, $2)`,
      [userId, key],
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('--- Phase 5: UI alignment (static) ---');
  const serverTabs = TAB_PERMISSIONS.filter((e) => e.tab);
  for (const entry of serverTabs) {
    assert(
      `frontend tab ${entry.tab}`,
      FRONTEND_TAB_PERMISSION_BY_TAB[entry.tab] === entry.key,
      FRONTEND_TAB_PERMISSION_BY_TAB[entry.tab],
    );
  }
  assert('ALL_NAV_TABS has rolesPermissions', FRONTEND_ALL_NAV_TABS.includes('rolesPermissions'));
  assert('catalog total 36', buildPermissionCatalog().total === 36, buildPermissionCatalog().total);

  console.log('\n--- Phase 5: live API (super admin) ---');
  let superToken;
  try {
    superToken = await loginAdmin(SUPER_EMAIL, SUPER_PASSWORD);
  } catch (e) {
    console.error('FAIL  super admin login —', e.message || e);
    await pool.end();
    process.exit(1);
  }
  assert('super admin login', Boolean(superToken));

  let r = await api('GET', '/admin/permissions/catalog', { token: superToken });
  assert('GET /admin/permissions/catalog', r.status === 200 && r.data?.catalog?.total === 36, r.status);

  r = await api('GET', '/admin/permissions/me', { token: superToken });
  assert(
    'GET /admin/permissions/me super implicit full',
    r.status === 200 && r.data?.implicitFullAccess === true && r.data?.total === 36,
    r.data,
  );

  console.log('\n--- Phase 5: limited admin user ---');
  const limitedUserId = await ensureLimitedAdminUser(pool);
  const limitedKeys = ['tab_dashboard', 'tab_articles'];
  await setStoredPermissions(pool, limitedUserId, limitedKeys);

  let limitedToken;
  try {
    limitedToken = await loginAdmin(LIMITED_EMAIL, LIMITED_PASSWORD);
  } catch (e) {
    assert('limited admin login', false, e.message);
    limitedToken = '';
  }

  if (limitedToken) {
    r = await api('GET', '/admin/permissions/me', { token: limitedToken });
    assert(
      'limited /permissions/me keys',
      r.status === 200 &&
        r.data?.implicitFullAccess === false &&
        Array.isArray(r.data?.permissionKeys) &&
        r.data.permissionKeys.length === 2 &&
        r.data.permissionKeys.includes('tab_dashboard') &&
        r.data.permissionKeys.includes('tab_articles'),
      r.data?.permissionKeys,
    );

    r = await api('GET', '/admin/summary', { token: limitedToken });
    assert('allowed: GET /admin/summary (dashboard)', r.status === 200, r.status);

    r = await api('GET', '/admin/articles', { token: limitedToken });
    assert('allowed: GET /admin/articles', r.status === 200, r.status);

    r = await api('GET', '/admin/tests', { token: limitedToken });
    assert('denied: GET /admin/tests without tab_all_tests', r.status === 403, r.status);

    r = await api('DELETE', '/admin/audit-logs', { token: limitedToken });
    assert('denied: DELETE /admin/audit-logs without audit_clear', r.status === 403, r.status);

    r = await api('PATCH', '/admin/settings', {
      token: limitedToken,
      body: { maintenanceMode: true },
    });
    assert('denied: PATCH settings global without settings_global', r.status === 403, r.status);

    r = await api('GET', `/admin/users/${limitedUserId}/permissions`, { token: limitedToken });
    assert('denied: GET user permissions without rbac_manage', r.status === 403, r.status);

    r = await api('PUT', `/admin/users/${limitedUserId}/permissions`, {
      token: limitedToken,
      body: { permissionKeys: ['tab_dashboard'] },
    });
    assert('denied: PUT user permissions without rbac_manage', r.status === 403, r.status);
  }

  console.log('\n--- Phase 5: super admin RBAC management ---');
  r = await api('GET', `/admin/users/${limitedUserId}/permissions`, { token: superToken });
  assert('super can GET user permissions', r.status === 200, r.status);

  const newKeys = ['tab_dashboard', 'tab_users', 'tab_all_tests'];
  r = await api('PUT', `/admin/users/${limitedUserId}/permissions`, {
    token: superToken,
    body: { permissionKeys: newKeys },
  });
  assert('super can PUT user permissions', r.status === 200 && r.data?.total === 3, r.data);

  const stored = await pool.query(
    `SELECT permission_key FROM admin_user_permissions WHERE user_id = $1::uuid ORDER BY permission_key`,
    [limitedUserId],
  );
  assert(
    'DB reflects PUT permissions',
    stored.rows.length === 3 && stored.rows.every((row) => newKeys.includes(row.permission_key)),
    stored.rows.map((x) => x.permission_key),
  );

  // Restore limited keys for repeat runs
  await setStoredPermissions(pool, limitedUserId, limitedKeys);

  const protectedEmail = SUPER_EMAIL;
  const protectedRow = await pool.query(`SELECT id::text AS id FROM users WHERE lower(trim(email)) = lower($1)`, [
    protectedEmail,
  ]);
  if (protectedRow.rows[0]?.id) {
    r = await api('PUT', `/admin/users/${protectedRow.rows[0].id}/permissions`, {
      token: superToken,
      body: { permissionKeys: ['tab_dashboard'] },
    });
    assert('denied: PUT permissions on protected super admin', r.status === 403, r.status);
  }

  console.log('\n--- Phase 5: demote clears permissions ---');
  const demoteTarget = limitedUserId;
  r = await api('PATCH', `/admin/users/${demoteTarget}/admin`, {
    token: superToken,
    body: { isAdmin: false, isSuperAdmin: false },
  });
  assert('demote limited admin to user', r.status === 200 && !r.data?.item?.is_admin, r.status);
  const afterDemote = await pool.query(
    `SELECT count(*)::int AS n FROM admin_user_permissions WHERE user_id = $1::uuid`,
    [demoteTarget],
  );
  assert('permissions cleared after demote', afterDemote.rows[0]?.n === 0, afterDemote.rows[0]?.n);

  r = await api('PATCH', `/admin/users/${demoteTarget}/admin`, {
    token: superToken,
    body: { isAdmin: true, isSuperAdmin: false },
  });
  assert('re-promote limited admin', r.status === 200 && r.data?.item?.is_admin, r.status);
  const afterPromote = await pool.query(
    `SELECT count(DISTINCT permission_key)::int AS n FROM admin_user_permissions WHERE user_id = $1::uuid`,
    [demoteTarget],
  );
  assert(
    'no permissions seeded on promote',
    afterPromote.rows[0]?.n === 0,
    afterPromote.rows[0]?.n,
  );
  await setStoredPermissions(pool, demoteTarget, limitedKeys);

  await pool.end();

  console.log(ok ? '\nAll RBAC Phase 5 live checks passed.' : '\nSome Phase 5 live checks failed.');
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('FATAL:', e.message || e);
  process.exit(1);
});
