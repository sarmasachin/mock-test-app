'use strict';

/**
 * Admin RBAC permission catalog (Phase 1).
 * Keys are stable API/DB identifiers; labels map to admin sidebar tabs + sensitive actions.
 */

const TAB_PERMISSIONS = [
  { key: 'tab_dashboard', label: 'Dashboard', tab: 'dashboard', group: 'Overview' },
  { key: 'tab_users', label: 'Users', tab: 'users', group: 'Users & Access' },
  { key: 'tab_user_management_advanced', label: 'User Management Advanced', tab: 'userManagementAdvanced', group: 'Users & Access' },
  { key: 'tab_analytics_insights', label: 'Analytics & Insights', tab: 'analyticsInsights', group: 'Overview' },
  { key: 'tab_all_tests', label: 'All Tests', tab: 'allTests', group: 'Tests & Content' },
  { key: 'tab_question_builder', label: 'Question Builder', tab: 'questionBuilder', group: 'Tests & Content' },
  { key: 'tab_poll_settings', label: 'Poll Settings', tab: 'pollSettings', group: 'Engagement' },
  { key: 'tab_push_notifications', label: 'Push Notification', tab: 'pushNotificationSettings', group: 'Engagement' },
  { key: 'tab_leaderboard', label: 'Leaderboard', tab: 'leaderboard', group: 'Overview' },
  { key: 'tab_profile', label: 'Profile Menu', tab: 'profile', group: 'App Content' },
  { key: 'tab_feedback', label: 'Feedback', tab: 'feedback', group: 'Support' },
  { key: 'tab_help_support', label: 'Help and Support', tab: 'helpSupport', group: 'Support' },
  { key: 'tab_report_issue', label: 'Report Issue', tab: 'reportIssue', group: 'Support' },
  { key: 'tab_achievement', label: 'Achievement', tab: 'achievement', group: 'App Content' },
  { key: 'tab_share_content', label: 'Share Text', tab: 'shareContent', group: 'App Content' },
  { key: 'tab_signup_regions', label: 'State & Distt', tab: 'signupRegions', group: 'App Content' },
  { key: 'tab_privacy_policy', label: 'Privacy Policy', tab: 'privacyPolicy', group: 'Legal' },
  { key: 'tab_terms_of_use', label: 'Terms of Use', tab: 'termsOfUse', group: 'Legal' },
  { key: 'tab_daily_digest', label: 'Daily Digest', tab: 'dailyDigest', group: 'Engagement' },
  { key: 'tab_daily_quiz', label: 'Daily Quiz', tab: 'dailyQuiz', group: 'Engagement' },
  { key: 'tab_articles', label: 'Articles', tab: 'articles', group: 'Tests & Content' },
  { key: 'tab_home_content', label: 'Home Content', tab: 'homeContent', group: 'App Content' },
  { key: 'tab_exam_snap_card', label: 'Card', tab: 'examSnapCard', group: 'App Content' },
  { key: 'tab_notification_scheduling', label: 'Notification Scheduling', tab: 'notificationScheduling', group: 'Engagement' },
  { key: 'tab_publish_scheduling', label: 'Publish Scheduling', tab: 'publishScheduling', group: 'Engagement' },
  { key: 'tab_submit_application', label: 'Submit Application', tab: 'submitApplicationContent', group: 'Tests & Content' },
  { key: 'tab_instruction_content', label: 'Instruction Content', tab: 'instructionContent', group: 'Tests & Content' },
  { key: 'tab_exam_categories', label: 'Exam Categories', tab: 'examCategories', group: 'Tests & Content' },
  { key: 'tab_settings', label: 'Settings (view)', tab: 'settings', group: 'System' },
  { key: 'tab_audit_logs', label: 'Audit Logs (view)', tab: 'auditLogs', group: 'System' },
];

const SENSITIVE_PERMISSIONS = [
  { key: 'users_manage_roles', label: 'Manage admin / super-admin roles', group: 'Users & Access', superOnlyDefault: true },
  { key: 'users_ban', label: 'Ban / unban users', group: 'Users & Access', superOnlyDefault: true },
  { key: 'settings_global', label: 'Edit global settings', group: 'System', superOnlyDefault: true },
  { key: 'audit_clear', label: 'Clear audit logs', group: 'System', superOnlyDefault: true },
  { key: 'uploads_banner', label: 'Upload banners / media', group: 'System', superOnlyDefault: true },
  { key: 'rbac_manage', label: 'Roles & Permissions (RBAC)', group: 'Users & Access', superOnlyDefault: true },
];

const ALL_ENTRIES = [...TAB_PERMISSIONS, ...SENSITIVE_PERMISSIONS];

const ALL_ADMIN_PERMISSION_KEYS = Object.freeze(ALL_ENTRIES.map((e) => e.key));

const ALL_ADMIN_PERMISSION_KEY_SET = new Set(ALL_ADMIN_PERMISSION_KEYS);

const TAB_KEY_BY_TAB_ID = Object.freeze(
  Object.fromEntries(TAB_PERMISSIONS.filter((e) => e.tab).map((e) => [e.tab, e.key])),
);

function isValidAdminPermissionKey(key) {
  return ALL_ADMIN_PERMISSION_KEY_SET.has(String(key || '').trim());
}

function normalizePermissionKeys(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const key = String(raw || '').trim();
    if (!isValidAdminPermissionKey(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function buildPermissionCatalog() {
  const groups = new Map();
  for (const entry of ALL_ENTRIES) {
    const groupName = entry.group || 'Other';
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push({
      key: entry.key,
      label: entry.label,
      tab: entry.tab || null,
      superOnlyDefault: Boolean(entry.superOnlyDefault),
    });
  }
  return {
    version: 1,
    total: ALL_ADMIN_PERMISSION_KEYS.length,
    groups: [...groups.entries()].map(([name, permissions]) => ({ name, permissions })),
  };
}

/** Default grant for newly promoted admins before super admin customizes (Phase 3 UI). */
function defaultPermissionsForNewAdmin() {
  return TAB_PERMISSIONS.map((e) => e.key);
}

/** Full grant used when backfilling existing admins (no behaviour change vs today). */
function fullPermissionsForLegacyAdmin() {
  return [...ALL_ADMIN_PERMISSION_KEYS];
}

module.exports = {
  TAB_PERMISSIONS,
  SENSITIVE_PERMISSIONS,
  ALL_ADMIN_PERMISSION_KEYS,
  ALL_ADMIN_PERMISSION_KEY_SET,
  TAB_KEY_BY_TAB_ID,
  isValidAdminPermissionKey,
  normalizePermissionKeys,
  buildPermissionCatalog,
  defaultPermissionsForNewAdmin,
  fullPermissionsForLegacyAdmin,
};
