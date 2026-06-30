'use strict';

/**
 * Frontend admin-web RBAC maps (Phase 5 QA).
 * Keep in sync with:
 *   admin-web/src/lib/adminRbac.ts          → TAB_PERMISSION_BY_TAB, ALL_NAV_TABS
 *   admin-web/src/lib/adminRbacMaps.ts      → SETTINGS_KEY_TO_PERMISSION, INBOX_SETTINGS_KEY_TO_PERMISSION
 */

/** Sidebar tab id → permission key (includes rolesPermissions → rbac_manage). */
const FRONTEND_TAB_PERMISSION_BY_TAB = Object.freeze({
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
});

const FRONTEND_ALL_NAV_TABS = Object.freeze([
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
]);

const FRONTEND_SETTINGS_KEY_TO_PERMISSION = Object.freeze({
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

const FRONTEND_INBOX_SETTINGS_KEY_TO_PERMISSION = Object.freeze({
  feedbackInbox: 'tab_feedback',
  helpSupportInbox: 'tab_help_support',
  reportIssueInbox: 'tab_report_issue',
});

module.exports = {
  FRONTEND_TAB_PERMISSION_BY_TAB,
  FRONTEND_ALL_NAV_TABS,
  FRONTEND_SETTINGS_KEY_TO_PERMISSION,
  FRONTEND_INBOX_SETTINGS_KEY_TO_PERMISSION,
};
