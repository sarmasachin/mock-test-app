import type { Tab } from '../tabTypes';

/** Maps admin sidebar tab id → RBAC permission key (server Phase 1 catalog). */
export const TAB_PERMISSION_BY_TAB: Record<Tab, string | null> = {
  dashboard: 'tab_dashboard',
  leaderboard: 'tab_leaderboard',
  allTests: 'tab_all_tests',
  questionBuilder: 'tab_question_builder',
  profile: 'tab_profile',
  feedback: 'tab_feedback',
  helpSupport: 'tab_help_support',
  reportIssue: 'tab_report_issue',
  achievement: 'tab_achievement',
  shareContent: 'tab_share_content',
  signupRegions: 'tab_signup_regions',
  privacyPolicy: 'tab_privacy_policy',
  termsOfUse: 'tab_terms_of_use',
  dailyDigest: 'tab_daily_digest',
  dailyQuiz: 'tab_daily_quiz',
  articles: 'tab_articles',
  homeContent: 'tab_home_content',
  examSnapCard: 'tab_exam_snap_card',
  pollSettings: 'tab_poll_settings',
  pushNotificationSettings: 'tab_push_notifications',
  notificationScheduling: 'tab_notification_scheduling',
  publishScheduling: 'tab_publish_scheduling',
  submitApplicationContent: 'tab_submit_application',
  instructionContent: 'tab_instruction_content',
  examCategories: 'tab_exam_categories',
  analyticsInsights: 'tab_analytics_insights',
  userManagementAdvanced: 'tab_user_management_advanced',
  settings: 'tab_settings',
  auditLogs: 'tab_audit_logs',
  users: 'tab_users',
  rolesPermissions: 'rbac_manage',
};

export type PermissionCatalogEntry = {
  key: string;
  label: string;
  tab: string | null;
  superOnlyDefault?: boolean;
};

export type PermissionCatalogGroup = {
  name: string;
  permissions: PermissionCatalogEntry[];
};

export type PermissionCatalog = {
  version: number;
  total: number;
  groups: PermissionCatalogGroup[];
};

export function hasAdminPermission(
  permissionKeys: string[],
  implicitFullAccess: boolean,
  isSuperAdmin: boolean,
  permission: string,
): boolean {
  if (isSuperAdmin || implicitFullAccess) return true;
  return permissionKeys.includes(permission);
}

export function canAccessAdminTab(
  tab: Tab,
  permissionKeys: string[],
  implicitFullAccess: boolean,
  isSuperAdmin: boolean,
): boolean {
  const required = TAB_PERMISSION_BY_TAB[tab];
  if (!required) return true;
  return hasAdminPermission(permissionKeys, implicitFullAccess, isSuperAdmin, required);
}

export const ALL_NAV_TABS: Tab[] = [
  'dashboard',
  'users',
  'rolesPermissions',
  'userManagementAdvanced',
  'analyticsInsights',
  'allTests',
  'questionBuilder',
  'pollSettings',
  'pushNotificationSettings',
  'leaderboard',
  'profile',
  'feedback',
  'helpSupport',
  'reportIssue',
  'achievement',
  'shareContent',
  'signupRegions',
  'privacyPolicy',
  'termsOfUse',
  'dailyDigest',
  'dailyQuiz',
  'articles',
  'homeContent',
  'examSnapCard',
  'notificationScheduling',
  'publishScheduling',
  'submitApplicationContent',
  'instructionContent',
  'examCategories',
  'settings',
  'auditLogs',
];

export function filterNavTabsForPermissions(
  tabs: Tab[],
  permissionKeys: string[],
  implicitFullAccess: boolean,
  isSuperAdmin: boolean,
): Tab[] {
  return tabs.filter((name) => canAccessAdminTab(name, permissionKeys, implicitFullAccess, isSuperAdmin));
}
