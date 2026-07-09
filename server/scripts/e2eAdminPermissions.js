'use strict';

/**
 * RBAC sanity checks (Phase 1 catalog + Phase 2 route guard).
 * Run: node scripts/e2eAdminPermissions.js
 */

const {
  ALL_ADMIN_PERMISSION_KEYS,
  buildPermissionCatalog,
  isValidAdminPermissionKey,
  normalizePermissionKeys,
  TAB_PERMISSIONS,
} = require('../src/constants/adminPermissions');
const {
  SETTINGS_PATCH_PERMISSION_BY_FIELD,
  resolveAdminRouteRule,
  getSettingsPatchRequiredPermissions,
  evaluateRoutePermissionAccess,
} = require('../src/lib/adminRoutePermissions');
const {
  FRONTEND_TAB_PERMISSION_BY_TAB,
  FRONTEND_ALL_NAV_TABS,
  FRONTEND_SETTINGS_KEY_TO_PERMISSION,
} = require('../src/constants/adminRbacUiAlign');

function assert(label, ok, detail) {
  const pass = Boolean(ok);
  console.log(`${pass ? 'OK' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  return pass;
}

function mockReq({ method, path, body, permissions }) {
  const keys = permissions || [];
  return {
    method,
    path,
    body,
    hasAdminPermission: (key) => keys.includes(key),
  };
}

let ok = true;

console.log('--- Phase 1: catalog ---');
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

console.log('\n--- Phase 2: route guard ---');

const ADMIN_ROUTES = [
  ['GET', '/summary'],
  ['GET', '/settings'],
  ['POST', '/settings/exam-snap-card'],
  ['PATCH', '/settings/exam-snap-card'],
  ['POST', '/uploads/banner'],
  ['POST', '/uploads/article-image'],
  ['PATCH', '/settings'],
  ['GET', '/audit-logs'],
  ['DELETE', '/audit-logs'],
  ['GET', '/tests'],
  ['POST', '/tests/badge/bulk-live'],
  ['POST', '/tests'],
  ['PATCH', '/tests/abc-uuid'],
  ['DELETE', '/tests/abc-uuid'],
  ['GET', '/tests/abc-uuid/questions'],
  ['POST', '/tests/abc-uuid/questions'],
  ['POST', '/tests/abc-uuid/questions/import'],
  ['PATCH', '/tests/abc-uuid/questions/1'],
  ['DELETE', '/tests/abc-uuid/questions/1'],
  ['GET', '/digest'],
  ['POST', '/digest'],
  ['PATCH', '/digest/x'],
  ['DELETE', '/digest/x'],
  ['GET', '/daily-quiz'],
  ['POST', '/daily-quiz'],
  ['PATCH', '/daily-quiz/x'],
  ['DELETE', '/daily-quiz/x'],
  ['GET', '/daily-quiz/stats'],
  ['GET', '/daily-quiz/leaderboard'],
  ['GET', '/daily-quiz/question-analysis'],
  ['GET', '/daily-quiz/answer-review'],
  ['GET', '/daily-quiz/answer-review/session'],
  ['GET', '/articles/feed-kinds'],
  ['PUT', '/articles/feed-kinds'],
  ['GET', '/articles/categories'],
  ['PUT', '/articles/categories'],
  ['GET', '/articles'],
  ['POST', '/articles'],
  ['PATCH', '/articles/x'],
  ['DELETE', '/articles/x'],
  ['GET', '/permissions/catalog'],
  ['GET', '/permissions/me'],
  ['GET', '/users/uuid/permissions'],
  ['PUT', '/users/uuid/permissions'],
  ['GET', '/users'],
  ['GET', '/users/reports'],
  ['GET', '/insights'],
  ['GET', '/analytics'],
  ['PATCH', '/users/uuid/admin'],
  ['PATCH', '/users/uuid/ban'],
  ['POST', '/users/uuid/revoke-sessions'],
  ['DELETE', '/users/uuid'],
  ['GET', '/publish-scheduling'],
  ['POST', '/publish-scheduling'],
  ['PATCH', '/publish-scheduling/x'],
  ['GET', '/notifications/campaigns/latest/item1'],
  ['GET', '/notifications/campaigns/camp1/stats'],
  ['GET', '/notifications/campaigns/camp1/events'],
  ['POST', '/notifications/send'],
];

const uncovered = [];
for (const [method, path] of ADMIN_ROUTES) {
  if (!resolveAdminRouteRule(method, path)) uncovered.push(`${method} ${path}`);
}
ok = assert('all admin routes mapped', uncovered.length === 0, uncovered) && ok;

ok = assert(
  'settings patch maps pollSettings',
  getSettingsPatchRequiredPermissions({ pollSettings: { items: [] } }).includes('tab_poll_settings'),
) && ok;

ok = assert(
  'deny tests without permission',
  !evaluateRoutePermissionAccess(resolveAdminRouteRule('GET', '/tests'), mockReq({
    method: 'GET',
    path: '/tests',
    permissions: ['tab_dashboard'],
  })).allowed,
) && ok;

ok = assert(
  'allow tests with permission',
  evaluateRoutePermissionAccess(resolveAdminRouteRule('GET', '/tests'), mockReq({
    method: 'GET',
    path: '/tests',
    permissions: ['tab_all_tests'],
  })).allowed,
) && ok;

ok = assert(
  'deny audit clear without permission',
  !evaluateRoutePermissionAccess(resolveAdminRouteRule('DELETE', '/audit-logs'), mockReq({
    method: 'DELETE',
    path: '/audit-logs',
    permissions: ['tab_audit_logs'],
  })).allowed,
) && ok;

ok = assert(
  'allow settings patch only for owned fields',
  evaluateRoutePermissionAccess(resolveAdminRouteRule('PATCH', '/settings'), mockReq({
    method: 'PATCH',
    path: '/settings',
    body: { pollSettings: {}, maintenanceMode: true },
    permissions: ['tab_poll_settings'],
  })).allowed === false,
) && ok;

ok = assert(
  'allow settings patch when all fields permitted',
  evaluateRoutePermissionAccess(resolveAdminRouteRule('PATCH', '/settings'), mockReq({
    method: 'PATCH',
    path: '/settings',
    body: { pollSettings: {}, maintenanceMode: true },
    permissions: ['tab_poll_settings', 'settings_global'],
  })).allowed,
) && ok;

console.log('\n--- Phase 5: UI / deploy alignment ---');

for (const entry of TAB_PERMISSIONS.filter((e) => e.tab)) {
  ok =
    assert(
      `frontend tab ${entry.tab}`,
      FRONTEND_TAB_PERMISSION_BY_TAB[entry.tab] === entry.key,
      FRONTEND_TAB_PERMISSION_BY_TAB[entry.tab],
    ) && ok;
}

ok =
  assert(
    'rolesPermissions → rbac_manage',
    FRONTEND_TAB_PERMISSION_BY_TAB.rolesPermissions === 'rbac_manage',
  ) && ok;

ok =
  assert(
    'ALL_NAV_TABS count',
    FRONTEND_ALL_NAV_TABS.length === TAB_PERMISSIONS.filter((e) => e.tab).length + 1,
    FRONTEND_ALL_NAV_TABS.length,
  ) && ok;

const settingsDrift = Object.entries(FRONTEND_SETTINGS_KEY_TO_PERMISSION).filter(
  ([field, perm]) => SETTINGS_PATCH_PERMISSION_BY_FIELD[field] !== perm,
);
ok = assert('settings map matches admin-web', settingsDrift.length === 0, settingsDrift) && ok;

ok =
  assert(
    'catalog version stable',
    buildPermissionCatalog().version === 1,
  ) && ok;

console.log(ok ? '\nAll RBAC Phase 1 + Phase 2 + Phase 5 alignment checks passed.' : '\nSome checks failed.');
console.log('Run live API tests: node scripts/e2eAdminPermissionsLive.js');
console.log('Run deploy checklist: node scripts/rbacDeployChecklist.js');
process.exit(ok ? 0 : 1);
