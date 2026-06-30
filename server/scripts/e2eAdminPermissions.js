'use strict';

/**
 * Phase 1 RBAC sanity checks (no live API required for catalog; optional live with ADMIN_TOKEN).
 * Run: node scripts/e2eAdminPermissions.js
 */

const {
  ALL_ADMIN_PERMISSION_KEYS,
  buildPermissionCatalog,
  isValidAdminPermissionKey,
  normalizePermissionKeys,
} = require('../src/constants/adminPermissions');

function assert(label, ok, detail) {
  const pass = Boolean(ok);
  console.log(`${pass ? 'OK' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  return pass;
}

let ok = true;

ok = assert('permission count is 36', ALL_ADMIN_PERMISSION_KEYS.length === 36, ALL_ADMIN_PERMISSION_KEYS.length) && ok;
ok = assert('catalog groups present', buildPermissionCatalog().groups.length >= 5) && ok;
ok = assert('invalid key rejected', !isValidAdminPermissionKey('tab_not_real')) && ok;
ok = assert('valid key accepted', isValidAdminPermissionKey('tab_dashboard')) && ok;
ok = assert(
  'normalize dedupes',
  normalizePermissionKeys(['tab_dashboard', 'tab_dashboard', 'bad']).length === 1,
) && ok;

const tabKeys = ALL_ADMIN_PERMISSION_KEYS.filter((k) => k.startsWith('tab_'));
const actionKeys = ALL_ADMIN_PERMISSION_KEYS.filter((k) => !k.startsWith('tab_'));
ok = assert('30 tab permissions', tabKeys.length === 30, tabKeys.length) && ok;
ok = assert('6 sensitive permissions', actionKeys.length === 6, actionKeys.length) && ok;

console.log(ok ? '\nAll Phase 1 RBAC catalog checks passed.' : '\nSome checks failed.');
process.exit(ok ? 0 : 1);
