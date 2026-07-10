'use strict';

const { isValidAdminPermissionKey } = require('../constants/adminPermissions');

/**
 * Maps PATCH /admin/settings body fields to RBAC permission keys.
 * Global/system toggles require settings_global; content tabs use tab_* keys.
 */
const SETTINGS_PATCH_PERMISSION_BY_FIELD = Object.freeze({
  maintenanceMode: 'settings_global',
  maintenanceMessage: 'settings_global',
  registrationOpen: 'settings_global',
  jobExamArticleAnnouncementEmail: 'settings_global',
  resultUnlockEmailSettings: 'settings_global',
  emailEventToggles: 'settings_global',
  adminImageExportFormats: 'settings_global',
  profileMenuItems: 'tab_profile',
  homeContent: 'tab_home_content',
  examSnapCard: 'tab_exam_snap_card',
  pollSettings: 'tab_poll_settings',
  pushNotificationSettings: 'tab_push_notifications',
  dailyQuizSettings: 'tab_daily_quiz',
  submitApplicationContent: 'tab_submit_application',
  instructionContent: 'tab_instruction_content',
  examCategories: 'tab_exam_categories',
  signupRegions: 'tab_signup_regions',
  examCategoryIconOptions: 'tab_exam_categories',
  notificationScheduling: 'tab_notification_scheduling',
  feedbackInbox: 'tab_feedback',
  helpSupportInbox: 'tab_help_support',
  reportIssueInbox: 'tab_report_issue',
  helpSupportContent: 'tab_help_support',
  achievementContent: 'tab_achievement',
  shareContent: 'tab_share_content',
  dailyDigestShareContent: 'tab_daily_digest',
  dailyQuizShareContent: 'tab_daily_quiz',
  privacyPolicyContent: 'tab_privacy_policy',
  termsOfUseContent: 'tab_terms_of_use',
});

/** @typedef {{ permission?: string, anyOf?: string[], anyAdmin?: boolean, settingsPatch?: boolean }} RoutePermissionRule */

/** First matching rule wins. Patterns are matched against req.path (no query string). */
const ADMIN_ROUTE_RULES = [
  { method: 'GET', pattern: /^\/permissions\/catalog$/, anyAdmin: true },
  { method: 'GET', pattern: /^\/permissions\/me$/, anyAdmin: true },
  { method: 'GET', pattern: /^\/users\/[^/]+\/permissions$/, permission: 'rbac_manage' },
  { method: 'PUT', pattern: /^\/users\/[^/]+\/permissions$/, permission: 'rbac_manage' },

  { method: 'GET', pattern: /^\/summary$/, permission: 'tab_dashboard' },
  { method: 'GET', pattern: /^\/analytics$/, permission: 'tab_analytics_insights' },
  { method: 'GET', pattern: /^\/insights$/, permission: 'tab_analytics_insights' },

  { method: 'GET', pattern: /^\/settings$/, anyAdmin: true },
  { method: 'PATCH', pattern: /^\/settings$/, settingsPatch: true },
  { method: 'POST', pattern: /^\/settings\/exam-snap-card$/, permission: 'tab_exam_snap_card' },
  { method: 'PATCH', pattern: /^\/settings\/exam-snap-card$/, permission: 'tab_exam_snap_card' },

  { method: 'POST', pattern: /^\/uploads\/banner$/, permission: 'uploads_banner' },
  {
    method: 'POST',
    pattern: /^\/uploads\/article-image$/,
    anyOf: ['tab_articles', 'tab_exam_categories', 'tab_home_content'],
  },

  { method: 'GET', pattern: /^\/audit-logs$/, permission: 'tab_audit_logs' },
  { method: 'DELETE', pattern: /^\/audit-logs$/, permission: 'audit_clear' },

  { method: 'GET', pattern: /^\/tests$/, permission: 'tab_all_tests' },
  { method: 'GET', pattern: /^\/tests\/[^/]+\/cycle-diagnostics$/, permission: 'tab_all_tests' },
  { method: 'POST', pattern: /^\/tests\/badge\/bulk-live$/, permission: 'tab_all_tests' },
  { method: 'POST', pattern: /^\/tests$/, permission: 'tab_all_tests' },
  { method: 'PATCH', pattern: /^\/tests\/[^/]+$/, permission: 'tab_all_tests' },
  { method: 'POST', pattern: /^\/tests\/[^/]+\/republish-now$/, permission: 'tab_all_tests' },
  { method: 'DELETE', pattern: /^\/tests\/[^/]+$/, permission: 'tab_all_tests' },
  {
    method: 'GET',
    pattern: /^\/tests\/[^/]+\/questions$/,
    anyOf: ['tab_all_tests', 'tab_question_builder'],
  },
  {
    method: 'POST',
    pattern: /^\/tests\/[^/]+\/questions$/,
    anyOf: ['tab_all_tests', 'tab_question_builder'],
  },
  {
    method: 'POST',
    pattern: /^\/tests\/[^/]+\/questions\/import$/,
    anyOf: ['tab_all_tests', 'tab_question_builder'],
  },
  {
    method: 'PATCH',
    pattern: /^\/tests\/[^/]+\/questions\/[^/]+$/,
    anyOf: ['tab_all_tests', 'tab_question_builder'],
  },
  {
    method: 'DELETE',
    pattern: /^\/tests\/[^/]+\/questions\/[^/]+$/,
    anyOf: ['tab_all_tests', 'tab_question_builder'],
  },

  { method: 'GET', pattern: /^\/digest$/, permission: 'tab_daily_digest' },
  { method: 'POST', pattern: /^\/digest$/, permission: 'tab_daily_digest' },
  { method: 'PATCH', pattern: /^\/digest\/[^/]+$/, permission: 'tab_daily_digest' },
  { method: 'DELETE', pattern: /^\/digest\/[^/]+$/, permission: 'tab_daily_digest' },

  { method: 'GET', pattern: /^\/daily-quiz\/categories$/, permission: 'tab_daily_quiz' },
  { method: 'PUT', pattern: /^\/daily-quiz\/categories$/, permission: 'tab_daily_quiz' },
  { method: 'GET', pattern: /^\/daily-quiz$/, permission: 'tab_daily_quiz' },
  { method: 'POST', pattern: /^\/daily-quiz$/, permission: 'tab_daily_quiz' },
  { method: 'PATCH', pattern: /^\/daily-quiz\/[^/]+$/, permission: 'tab_daily_quiz' },
  { method: 'DELETE', pattern: /^\/daily-quiz\/[^/]+$/, permission: 'tab_daily_quiz' },
  { method: 'GET', pattern: /^\/daily-quiz\/stats$/, permission: 'tab_daily_quiz' },
  { method: 'GET', pattern: /^\/daily-quiz\/leaderboard$/, permission: 'tab_daily_quiz' },
  { method: 'GET', pattern: /^\/daily-quiz\/question-analysis$/, permission: 'tab_daily_quiz' },
  { method: 'GET', pattern: /^\/daily-quiz\/answer-review$/, permission: 'tab_daily_quiz' },
  { method: 'GET', pattern: /^\/daily-quiz\/answer-review\/session$/, permission: 'tab_daily_quiz' },

  { method: 'GET', pattern: /^\/articles\/feed-kinds$/, permission: 'tab_articles' },
  { method: 'PUT', pattern: /^\/articles\/feed-kinds$/, permission: 'tab_articles' },
  { method: 'GET', pattern: /^\/articles\/categories$/, permission: 'tab_articles' },
  { method: 'PUT', pattern: /^\/articles\/categories$/, permission: 'tab_articles' },
  { method: 'GET', pattern: /^\/articles$/, permission: 'tab_articles' },
  { method: 'POST', pattern: /^\/articles$/, permission: 'tab_articles' },
  { method: 'PATCH', pattern: /^\/articles\/[^/]+$/, permission: 'tab_articles' },
  { method: 'DELETE', pattern: /^\/articles\/[^/]+$/, permission: 'tab_articles' },

  { method: 'GET', pattern: /^\/users$/, permission: 'tab_users' },
  { method: 'GET', pattern: /^\/users\/reports$/, permission: 'tab_user_management_advanced' },
  { method: 'PATCH', pattern: /^\/users\/[^/]+\/admin$/, permission: 'users_manage_roles' },
  { method: 'PATCH', pattern: /^\/users\/[^/]+\/ban$/, permission: 'users_ban' },
  { method: 'POST', pattern: /^\/users\/[^/]+\/revoke-sessions$/, permission: 'tab_user_management_advanced' },
  { method: 'DELETE', pattern: /^\/users\/[^/]+$/, permission: 'tab_user_management_advanced' },

  { method: 'GET', pattern: /^\/publish-scheduling$/, permission: 'tab_publish_scheduling' },
  { method: 'POST', pattern: /^\/publish-scheduling$/, permission: 'tab_publish_scheduling' },
  { method: 'PATCH', pattern: /^\/publish-scheduling\/[^/]+$/, permission: 'tab_publish_scheduling' },
  { method: 'POST', pattern: /^\/scheduling-queues\/cleanup$/, permission: 'tab_publish_scheduling' },

  {
    method: 'GET',
    pattern: /^\/notifications\/campaigns\//,
    permission: 'tab_push_notifications',
  },
  { method: 'POST', pattern: /^\/notifications\/send$/, permission: 'tab_push_notifications' },
];

function normalizeAdminPath(pathValue) {
  const raw = String(pathValue || '').split('?')[0].trim();
  if (!raw || raw === '/') return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function resolveAdminRouteRule(method, pathValue) {
  const path = normalizeAdminPath(pathValue);
  const verb = String(method || 'GET').toUpperCase();
  for (const rule of ADMIN_ROUTE_RULES) {
    if (rule.method !== verb) continue;
    if (!rule.pattern.test(path)) continue;
    return rule;
  }
  return null;
}

function getSettingsPatchRequiredPermissions(body) {
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const required = [];
  for (const [field, permissionKey] of Object.entries(SETTINGS_PATCH_PERMISSION_BY_FIELD)) {
    if (payload[field] === undefined) continue;
    if (!isValidAdminPermissionKey(permissionKey)) continue;
    if (!required.includes(permissionKey)) required.push(permissionKey);
  }
  return required;
}

function evaluateRoutePermissionAccess(rule, req) {
  if (!rule) {
    return { allowed: false, missing: ['unknown_route'], reason: 'unknown_route' };
  }
  if (rule.anyAdmin) {
    return { allowed: true, missing: [] };
  }
  if (rule.settingsPatch) {
    const required = getSettingsPatchRequiredPermissions(req.body);
    if (!required.length) {
      return { allowed: false, missing: [], reason: 'empty_settings_patch' };
    }
    const missing = required.filter((key) => !req.hasAdminPermission(key));
    return { allowed: missing.length === 0, missing, required };
  }
  if (rule.anyOf && rule.anyOf.length) {
    const allowed = rule.anyOf.some((key) => req.hasAdminPermission(key));
    return {
      allowed,
      missing: allowed ? [] : rule.anyOf,
      required: rule.anyOf,
      match: 'anyOf',
    };
  }
  const key = String(rule.permission || '').trim();
  if (!key) {
    return { allowed: false, missing: [], reason: 'invalid_rule' };
  }
  const allowed = req.hasAdminPermission(key);
  return { allowed, missing: allowed ? [] : [key], required: [key] };
}

function forbiddenPermissionResponse(res, result) {
  if (result.reason === 'empty_settings_patch') {
    return res.status(400).json({ error: 'No supported settings fields in request body' });
  }
  if (result.reason === 'unknown_route') {
    return res.status(403).json({ error: 'Admin route is not registered for RBAC', code: 'unknown_route' });
  }
  const missing = result.missing || [];
  const primary = missing[0] || 'permission_denied';
  return res.status(403).json({
    error: 'Permission denied',
    permission: primary,
    missingPermissions: missing,
  });
}

module.exports = {
  SETTINGS_PATCH_PERMISSION_BY_FIELD,
  ADMIN_ROUTE_RULES,
  normalizeAdminPath,
  resolveAdminRouteRule,
  getSettingsPatchRequiredPermissions,
  evaluateRoutePermissionAccess,
  forbiddenPermissionResponse,
};
