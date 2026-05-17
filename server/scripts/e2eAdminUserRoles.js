#!/usr/bin/env node
'use strict';

/**
 * E2E-style checks for PATCH /v1/admin/users/:id/admin role transitions.
 * Simulates the same flags the admin UI sends (no browser).
 *
 *   cd server && node scripts/e2eAdminUserRoles.js
 *
 * Requires local API + DB + a super-admin JWT in E2E_SUPER_ADMIN_TOKEN, or uses
 * logic-only simulation when E2E_LOGIC_ONLY=1.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function resolveFlags(body) {
  let isAdmin = Boolean(body.isAdmin);
  const hasSuperAdminUpdate = body.isSuperAdmin !== undefined;
  let isSuperAdmin = hasSuperAdminUpdate ? Boolean(body.isSuperAdmin) : undefined;
  if (hasSuperAdminUpdate) {
    if (!isAdmin) {
      isSuperAdmin = false;
    } else if (isSuperAdmin) {
      isAdmin = true;
    }
  } else if (!isAdmin) {
    isSuperAdmin = false;
  }
  return { isAdmin, isSuperAdmin, hasSuperAdminUpdate };
}

function assert(name, cond, detail) {
  if (cond) {
    console.log(`[e2e:admin-roles] OK: ${name}`);
    return true;
  }
  console.error(`[e2e:admin-roles] FAIL: ${name}`, detail || '');
  return false;
}

function logicSuite() {
  let ok = true;
  // Make Super Admin (UI toggleSuperAdmin)
  let r = resolveFlags({ isAdmin: true, isSuperAdmin: true });
  ok = assert('make super → admin+super', r.isAdmin && r.isSuperAdmin, r) && ok;

  // Remove Super Admin only (UI toggleSuperAdmin on super user)
  r = resolveFlags({ isAdmin: true, isSuperAdmin: false });
  ok = assert('remove super → admin only', r.isAdmin && !r.isSuperAdmin, r) && ok;

  // Remove Admin from super (OLD UI bug: preserved isSuperAdmin)
  r = resolveFlags({ isAdmin: false, isSuperAdmin: true });
  ok = assert('remove admin clears super (server guard)', r.isAdmin === false && r.isSuperAdmin === false, r) && ok;

  // Remove Admin from admin-only
  r = resolveFlags({ isAdmin: false, isSuperAdmin: false });
  ok = assert('remove admin → plain user', !r.isAdmin && !r.isSuperAdmin, r) && ok;

  // Make Admin only
  r = resolveFlags({ isAdmin: true, isSuperAdmin: false });
  ok = assert('make admin only', r.isAdmin && !r.isSuperAdmin, r) && ok;

  return ok;
}

async function livePatch(apiBase, token, userId, body) {
  const res = await fetch(`${apiBase}/admin/users/${userId}/admin`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_e) {
    data = { _raw: text };
  }
  return { status: res.status, data, item: data?.item };
}

async function main() {
  const logicOnly = String(process.env.E2E_LOGIC_ONLY || '').trim() === '1';
  const logicOk = logicSuite();
  if (logicOnly) {
    process.exit(logicOk ? 0 : 1);
  }

  const apiBase = String(process.env.API_BASE || process.env.E2E_API_BASE || 'http://127.0.0.1:3000/v1').replace(
    /\/+$/,
    '',
  );
  const token = String(process.env.E2E_SUPER_ADMIN_TOKEN || '').trim();
  const testUserId = String(process.env.E2E_TEST_USER_ID || '').trim();

  if (!token || !testUserId) {
    console.log(
      '[e2e:admin-roles] Skip live API (set E2E_SUPER_ADMIN_TOKEN + E2E_TEST_USER_ID). Logic suite:',
      logicOk ? 'passed' : 'failed',
    );
    process.exit(logicOk ? 0 : 1);
  }

  let ok = logicOk;

  // Reset to plain user
  let r = await livePatch(apiBase, token, testUserId, { isAdmin: false, isSuperAdmin: false });
  ok = assert('live reset user', r.status === 200 && !r.item?.is_admin && !r.item?.is_super_admin, r) && ok;

  r = await livePatch(apiBase, token, testUserId, { isAdmin: true, isSuperAdmin: true });
  ok =
    assert('live make super', r.status === 200 && r.item?.is_admin && r.item?.is_super_admin, r) && ok;

  r = await livePatch(apiBase, token, testUserId, { isAdmin: false, isSuperAdmin: true });
  ok =
    assert(
      'live remove admin clears both (old bug would keep super)',
      r.status === 200 && !r.item?.is_admin && !r.item?.is_super_admin,
      r,
    ) && ok;

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('[e2e:admin-roles] Failed:', e.message || e);
  process.exit(1);
});
