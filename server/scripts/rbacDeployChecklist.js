#!/usr/bin/env node
'use strict';

/**
 * RBAC Phase 5 — pre-deploy / post-deploy verification.
 * Run on VPS or locally before go-live:
 *   cd server && node scripts/rbacDeployChecklist.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { ALL_ADMIN_PERMISSION_KEYS, TAB_PERMISSIONS } = require('../src/constants/adminPermissions');
const { SETTINGS_PATCH_PERMISSION_BY_FIELD } = require('../src/lib/adminRoutePermissions');
const {
  FRONTEND_TAB_PERMISSION_BY_TAB,
  FRONTEND_ALL_NAV_TABS,
  FRONTEND_SETTINGS_KEY_TO_PERMISSION,
} = require('../src/constants/adminRbacUiAlign');

function line(ok, label, detail) {
  const mark = ok ? '✓' : '✗';
  const extra = detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '';
  console.log(`${mark} ${label}${extra}`);
  return Boolean(ok);
}

async function main() {
  let ok = true;
  console.log('=== RBAC Deploy Checklist (Phase 5) ===\n');

  const migrationPath = path.join(__dirname, '..', '..', 'database', 'postgres', '019_admin_permissions.sql');
  ok = line(fs.existsSync(migrationPath), 'Migration file 019_admin_permissions.sql on disk') && ok;

  if (!process.env.DATABASE_URL) {
    ok = line(false, 'DATABASE_URL set in server/.env') && ok;
    console.log('\nFix DATABASE_URL and re-run.');
    process.exit(1);
  }
  ok = line(true, 'DATABASE_URL set in server/.env') && ok;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tbl = await pool.query("SELECT to_regclass('public.admin_user_permissions') AS tbl");
    ok = line(Boolean(tbl.rows[0]?.tbl), 'Table admin_user_permissions exists', tbl.rows[0]?.tbl) && ok;

    const superRows = await pool.query(
      `SELECT count(*)::int AS n FROM users WHERE is_admin = true AND is_super_admin = true`,
    );
    ok = line(Number(superRows.rows[0]?.n || 0) >= 1, 'At least one super admin user exists', superRows.rows[0]?.n) && ok;

    const keyRows = await pool.query(
      `SELECT count(DISTINCT permission_key)::int AS n FROM admin_user_permissions`,
    );
    const distinctKeys = Number(keyRows.rows[0]?.n || 0);
    ok =
      line(
        distinctKeys === 0 || distinctKeys <= ALL_ADMIN_PERMISSION_KEYS.length,
        'Stored permission keys are valid catalog subset',
        distinctKeys,
      ) && ok;

    const orphan = await pool.query(
      `SELECT permission_key FROM admin_user_permissions
       WHERE permission_key NOT IN (SELECT unnest($1::text[]))
       LIMIT 5`,
      [ALL_ADMIN_PERMISSION_KEYS],
    );
    ok = line(orphan.rows.length === 0, 'No orphan permission keys in DB', orphan.rows) && ok;
  } catch (e) {
    ok = line(false, 'Database checks', e.message || String(e)) && ok;
  } finally {
    await pool.end();
  }

  console.log('\n--- UI / API alignment ---');
  const serverTabIds = TAB_PERMISSIONS.filter((e) => e.tab).map((e) => e.tab);
  for (const tabId of serverTabIds) {
    const fe = FRONTEND_TAB_PERMISSION_BY_TAB[tabId];
    const serverKey = TAB_PERMISSIONS.find((e) => e.tab === tabId)?.key;
    ok = line(fe === serverKey, `Tab map: ${tabId}`, fe || 'MISSING') && ok;
  }
  ok =
    line(
      FRONTEND_TAB_PERMISSION_BY_TAB.rolesPermissions === 'rbac_manage',
      'rolesPermissions tab maps to rbac_manage',
    ) && ok;
  ok =
    line(
      FRONTEND_ALL_NAV_TABS.length === serverTabIds.length + 1,
      'ALL_NAV_TABS count (30 server tabs + rolesPermissions)',
      FRONTEND_ALL_NAV_TABS.length,
    ) && ok;

  const settingsDrift = [];
  for (const [field, perm] of Object.entries(FRONTEND_SETTINGS_KEY_TO_PERMISSION)) {
    if (SETTINGS_PATCH_PERMISSION_BY_FIELD[field] !== perm) {
      settingsDrift.push({ field, frontend: perm, server: SETTINGS_PATCH_PERMISSION_BY_FIELD[field] });
    }
  }
  ok = line(settingsDrift.length === 0, 'Settings PATCH map matches admin-web', settingsDrift) && ok;

  console.log('\n--- Production safety ---');
  const devBypass = String(process.env.ADMIN_DEV_PASSWORD_LOGIN || '').trim().toLowerCase() === 'true';
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (devBypass) {
    line(
      false,
      'WARN: ADMIN_DEV_PASSWORD_LOGIN=true — disable before public production deploy',
    );
  } else {
    line(true, 'ADMIN_DEV_PASSWORD_LOGIN is not true (OTP required for admin login)');
  }
  if (nodeEnv === 'production' && devBypass) {
    ok = false;
  }

  console.log('\n--- Automated tests (run manually on deploy host) ---');
  console.log('  cd server && node scripts/e2eAdminPermissions.js');
  console.log('  cd server && node scripts/e2eAdminPermissionsLive.js   # live API auto-skips on prod OTP');
  console.log('  cd admin-web && npm run build');

  console.log('\n--- VPS deploy sequence ---');
  console.log('  cd /var/www/mocktestapp && git pull origin main');
  console.log('  psql "$DATABASE_URL" -f database/postgres/019_admin_permissions.sql');
  console.log('  cd server && npm install --omit=dev');
  console.log('  cd admin-web && npm ci && npm run build');
  console.log('  pm2 restart mocktest-api --update-env');
  console.log('  node server/scripts/rbacDeployChecklist.js');
  console.log('  node server/scripts/e2eAdminPermissionsLive.js');

  console.log(ok ? '\nChecklist PASSED.' : '\nChecklist FAILED — fix items above before deploy.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e.message || e);
  process.exit(1);
});
