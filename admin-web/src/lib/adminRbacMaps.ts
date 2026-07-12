/** PATCH /admin/settings field → RBAC key (mirrors server adminRoutePermissions.js). */
export const SETTINGS_KEY_TO_PERMISSION: Record<string, string> = {
  profileMenuItems: 'tab_profile',
  homeContent: 'tab_home_content',
  examSnapCard: 'tab_exam_snap_card',
  pollSettings: 'tab_poll_settings',
  pushNotificationSettings: 'tab_push_notifications',
  dailyQuizSettings: 'tab_daily_quiz',
  submitApplicationContent: 'tab_submit_application',
  instructionContent: 'tab_instruction_content',
  examCategories: 'tab_exam_categories',
  stateExamSectionTemplates: 'tab_exam_categories',
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
};

export const INBOX_SETTINGS_KEY_TO_PERMISSION: Record<string, string> = {
  feedbackInbox: 'tab_feedback',
  helpSupportInbox: 'tab_help_support',
  reportIssueInbox: 'tab_report_issue',
};
