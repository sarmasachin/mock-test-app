'use strict';

const { pool } = require('../db');
const {
  ALL_ADMIN_PERMISSION_KEYS,
  isValidAdminPermissionKey,
  normalizePermissionKeys,
  buildPermissionCatalog,
  fullPermissionsForLegacyAdmin,
} = require('../constants/adminPermissions');
const { isProtectedSuperAdminDbEmail } = require('../constants/protectedSuperAdminEmails');

let schemaReadyPromise = null;

async function ensureAdminPermissionsSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS admin_user_permissions (
           user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           permission_key VARCHAR(64) NOT NULL,
           granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
           granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           PRIMARY KEY (user_id, permission_key),
           CONSTRAINT admin_user_permissions_key_nonempty CHECK (char_length(trim(permission_key)) > 0)
         )`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_user
         ON admin_user_permissions (user_id)`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_key
         ON admin_user_permissions (permission_key)`,
      );
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

/**
 * Idempotent: grant full tab+action permissions to every non-super admin who has none yet.
 * Keeps existing deployments working until Phase 4 enforces menu hiding.
 */
const LEGACY_BACKFILL_SETTING_KEY = 'rbac_legacy_admin_backfill_done';

async function isLegacyAdminBackfillComplete() {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
    [LEGACY_BACKFILL_SETTING_KEY],
  );
  return String(rows[0]?.setting_value || '').trim() === '1';
}

async function markLegacyAdminBackfillComplete() {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, '1', NULL)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = '1', updated_at = now()`,
    [LEGACY_BACKFILL_SETTING_KEY],
  );
}

/**
 * One-time: grant full permissions to admins who existed before RBAC.
 * Newly promoted admins stay empty until super admin saves checkboxes in Roles tab.
 */
async function backfillLegacyAdminPermissions() {
  await ensureAdminPermissionsSchema();
  if (await isLegacyAdminBackfillComplete()) {
    return { backfilledUsers: 0, grantedRows: 0, skipped: true };
  }
  const keys = fullPermissionsForLegacyAdmin();
  const admins = await pool.query(
    `SELECT u.id::text AS id
     FROM users u
     WHERE u.is_admin = true
       AND COALESCE(u.is_super_admin, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM admin_user_permissions p WHERE p.user_id = u.id
       )`,
  );
  if (!admins.rows.length) {
    await markLegacyAdminBackfillComplete();
    return { backfilledUsers: 0, grantedRows: 0 };
  }
  let grantedRows = 0;
  for (const row of admins.rows) {
    for (const permissionKey of keys) {
      const ins = await pool.query(
        `INSERT INTO admin_user_permissions (user_id, permission_key, granted_by)
         VALUES ($1::uuid, $2, NULL)
         ON CONFLICT (user_id, permission_key) DO NOTHING`,
        [row.id, permissionKey],
      );
      grantedRows += Number(ins.rowCount || 0);
    }
  }
  await markLegacyAdminBackfillComplete();
  return { backfilledUsers: admins.rows.length, grantedRows };
}

async function loadStoredPermissionKeys(userId) {
  await ensureAdminPermissionsSchema();
  const { rows } = await pool.query(
    `SELECT permission_key
     FROM admin_user_permissions
     WHERE user_id = $1::uuid
     ORDER BY permission_key ASC`,
    [userId],
  );
  return rows.map((r) => String(r.permission_key || '').trim()).filter(isValidAdminPermissionKey);
}

/**
 * Effective permissions for an admin session.
 * Super admin (or protected email) → all keys without reading DB.
 */
async function getEffectiveAdminPermissions({ userId, isAdmin, isSuperAdmin, email }) {
  if (!isAdmin) {
    return { keys: [], isImplicitFullAccess: false };
  }
  if (isSuperAdmin || isProtectedSuperAdminDbEmail(email)) {
    return { keys: [...ALL_ADMIN_PERMISSION_KEYS], isImplicitFullAccess: true };
  }
  const stored = await loadStoredPermissionKeys(userId);
  if (!stored.length) {
    return { keys: [], isImplicitFullAccess: false };
  }
  return { keys: stored, isImplicitFullAccess: false };
}

async function getAdminUserRoleRow(userId) {
  const { rows } = await pool.query(
    `SELECT id::text AS id, email, is_admin, is_super_admin
     FROM users
     WHERE id = $1::uuid
     LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function replaceAdminUserPermissions({
  targetUserId,
  permissionKeys,
  grantedByUserId,
  actorCanManageRbac,
}) {
  if (!actorCanManageRbac) {
    const err = new Error('Permission denied: rbac_manage');
    err.status = 403;
    throw err;
  }
  const target = await getAdminUserRoleRow(targetUserId);
  if (!target) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (!target.is_admin) {
    const err = new Error('Target user is not an admin');
    err.status = 400;
    throw err;
  }
  if (isProtectedSuperAdminDbEmail(target.email)) {
    const err = new Error('Permissions for protected super admin accounts cannot be changed.');
    err.status = 403;
    throw err;
  }
  if (target.is_super_admin) {
    const err = new Error('Super admin accounts have full access; use role change instead.');
    err.status = 400;
    throw err;
  }

  const normalized = normalizePermissionKeys(permissionKeys);
  await ensureAdminPermissionsSchema();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM admin_user_permissions WHERE user_id = $1::uuid`, [targetUserId]);
    for (const permissionKey of normalized) {
      await client.query(
        `INSERT INTO admin_user_permissions (user_id, permission_key, granted_by)
         VALUES ($1::uuid, $2, $3::uuid)`,
        [targetUserId, permissionKey, grantedByUserId],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    userId: targetUserId,
    permissionKeys: normalized,
    total: normalized.length,
  };
}

function getPermissionCatalogResponse() {
  return buildPermissionCatalog();
}

async function seedFullPermissionsForAdmin(userId, grantedByUserId = null) {
  await ensureAdminPermissionsSchema();
  const keys = fullPermissionsForLegacyAdmin();
  for (const permissionKey of keys) {
    await pool.query(
      `INSERT INTO admin_user_permissions (user_id, permission_key, granted_by)
       VALUES ($1::uuid, $2, $3::uuid)
       ON CONFLICT (user_id, permission_key) DO NOTHING`,
      [userId, permissionKey, grantedByUserId],
    );
  }
}

async function clearAdminPermissions(userId) {
  await ensureAdminPermissionsSchema();
  await pool.query(`DELETE FROM admin_user_permissions WHERE user_id = $1::uuid`, [userId]);
}

module.exports = {
  ensureAdminPermissionsSchema,
  backfillLegacyAdminPermissions,
  loadStoredPermissionKeys,
  getEffectiveAdminPermissions,
  replaceAdminUserPermissions,
  getPermissionCatalogResponse,
  getAdminUserRoleRow,
  seedFullPermissionsForAdmin,
  clearAdminPermissions,
};
