export type Tab =
  | 'dashboard'
  | 'leaderboard'
  | 'allTests'
  | 'questionBuilder'
  | 'profile'
  | 'feedback'
  | 'helpSupport'
  | 'reportIssue'
  | 'achievement'
  | 'shareContent'
  | 'signupRegions'
  | 'privacyPolicy'
  | 'termsOfUse'
  | 'dailyDigest'
  | 'dailyQuiz'
  | 'articles'
  | 'homeContent'
  | 'examSnapCard'
  | 'pollSettings'
  | 'pushNotificationSettings'
  | 'notificationScheduling'
  | 'publishScheduling'
  | 'submitApplicationContent'
  | 'instructionContent'
  | 'examCategories'
  | 'stateExamManager'
  | 'analyticsInsights'
  | 'userManagementAdvanced'
  | 'settings'
  | 'auditLogs'
  | 'users'
  | 'rolesPermissions';

export const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  leaderboard: 'Leaderboard',
  allTests: 'All Tests',
  questionBuilder: 'Question Builder',
  profile: 'Profile',
  feedback: 'Feedback',
  helpSupport: 'Help and Support',
  reportIssue: 'Report Issue',
  achievement: 'Achievement',
  shareContent: 'Share Text',
  signupRegions: 'State & Distt',
  privacyPolicy: 'Privacy Policy',
  termsOfUse: 'Terms of Use',
  dailyDigest: 'Daily Digest',
  dailyQuiz: 'Daily Quiz',
  articles: 'Articles',
  homeContent: 'Home Content',
  examSnapCard: 'Card',
  pollSettings: 'Poll Settings',
  pushNotificationSettings: 'Push Notification',
  notificationScheduling: 'Notification Scheduling',
  publishScheduling: 'Publish Scheduling',
  submitApplicationContent: 'Submit Application',
  instructionContent: 'Instruction Content',
  examCategories: 'Exam Categories',
  stateExamManager: 'State Exam Manager',
  analyticsInsights: 'Analytics & Insights',
  userManagementAdvanced: 'User Management Advanced',
  settings: 'Settings',
  auditLogs: 'Audit Logs',
  users: 'Users',
  rolesPermissions: 'Roles & Permissions',
};

export const TAB_ICONS: Record<Tab, string> = {
  dashboard: 'DB',
  leaderboard: 'LB',
  allTests: 'TS',
  questionBuilder: 'QB',
  profile: 'PR',
  feedback: 'FB',
  helpSupport: 'HS',
  reportIssue: 'RI',
  achievement: 'AC',
  shareContent: 'SH',
  signupRegions: 'SD',
  privacyPolicy: 'PP',
  termsOfUse: 'TU',
  dailyDigest: 'DD',
  dailyQuiz: 'DQ',
  articles: 'AR',
  homeContent: 'HC',
  examSnapCard: 'CD',
  pollSettings: 'PL',
  pushNotificationSettings: 'PN',
  notificationScheduling: 'NS',
  publishScheduling: 'PS',
  submitApplicationContent: 'SA',
  instructionContent: 'IN',
  examCategories: 'EX',
  stateExamManager: 'SE',
  analyticsInsights: 'AN',
  userManagementAdvanced: 'UM',
  settings: 'ST',
  auditLogs: 'LG',
  users: 'US',
  rolesPermissions: 'RB',
};
