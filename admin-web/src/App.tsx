import axios from 'axios';
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AdminDialogProvider, useAdminDialog } from './adminDialog';
import { AdminToastProvider, useAdminToast } from './adminToast';
import './App.css';
import {
  AnalyticsInsightsTabImpl,
  ExamCategoriesTabImpl,
  NotificationSchedulingTabImpl,
  PublishSchedulingTabImpl,
  UserManagementAdvancedTabImpl,
} from './tabs/AdvancedAdminTabs';
import { ExamSnapCardTab } from './tabs/ExamSnapCardTab';
import { isProtectedSuperAdminEmail } from './protectedSuperAdmin';
import {
  InstructionContentTabImpl,
  PollSettingsTabImpl,
  PushNotificationSettingsTabImpl,
  ShareContentTabImpl,
  SubmitApplicationContentTabImpl,
} from './tabs/EngagementContentTabs';
import { ArticleBodyEditor } from './components/ArticleBodyEditor';
import {
  DashboardAnalytics,
  normalizeDashboardSummary,
  type AdminDashboardSummary,
  type DashboardRange,
} from './components/DashboardAnalytics';
import { DailyQuizAdminStats } from './components/DailyQuizAdminStats';

const ADMIN_IMAGE_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
] as const;

function isAdminUploadImageMime(mime: string): boolean {
  return (ADMIN_IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
}

type Tab =
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
  | 'analyticsInsights'
  | 'userManagementAdvanced'
  | 'settings'
  | 'auditLogs'
  | 'users';
type TestKind = 'mock' | 'quiz';
type RangeKind = 'weekly' | 'monthly' | 'all';
type SubjectSectionRow = { key: string; label: string };

type TestAdvancedConfig = {
  publishAt: string;
  unpublishAt: string;
  resultVisibility: 'immediate' | 'after_result_time';
  reattemptCooldownMinutes: number;
  lateJoinMinutes: number;
  notifyBeforeMinutes: number;
  resumeEnabled: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  fullscreenRequired: boolean;
  copyPasteBlocked: boolean;
  notifyOnPublish: boolean;
  sendEmailOnPublish: boolean;
  /** Ordered sections — keys match question `subject_key`; used for subject-wise shuffle on the API. */
  subjectSections?: SubjectSectionRow[];
};

type TestItem = {
  id: string;
  slug: string;
  title: string;
  subcategory: string;
  meta_line: string;
  duration_minutes: number;
  question_count: number;
  exam_date?: string | null;
  total_marks?: number;
  slot_label?: string;
  capacity_total?: number;
  enrolled_count?: number;
  attempts_allowed?: number;
  language_mode?: string;
  exam_mode?: string;
  negative_marking_text?: string;
  test_type_label?: string;
  badge_enabled?: boolean;
  badge_text?: string;
  valid_until?: string | null;
  answer_key_release_at?: string | null;
  result_release_at?: string | null;
  dynamic_date_enabled?: boolean;
  date_cycle_days?: number;
  test_kind: TestKind;
  is_published: boolean;
  dynamic_fluctuation_on_publish: boolean;
  advanced_config?: Partial<TestAdvancedConfig> | null;
};

type QuestionItem = {
  id: number;
  test_id: string;
  position: number;
  stem: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_index: number;
  explanation: string;
  is_published?: boolean;
  subject_key?: string;
};

type DailyDigestItem = {
  id: string;
  question_prompt: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_index: number;
  fact_text: string;
  is_published: boolean;
};

type DailyQuizItem = {
  id: string;
  questionPrompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex: number;
  explanation: string;
  isPublished: boolean;
};


/** Until `/admin/articles/feed-kinds` loads; server seeds the same defaults. */
const FALLBACK_ARTICLE_FEED_KINDS = ['news', 'job', 'exam', 'notice', 'tips', 'blog', 'update'];

/** Until `/admin/articles/categories` loads; keep in sync with server `DEFAULT_ARTICLE_CATEGORIES`. */
const FALLBACK_ARTICLE_CATEGORIES = [
  'Medical',
  'Education',
  'Government Jobs',
  'Exam',
  'Admit Card',
  'Results',
  'General',
];

function normalizeClientFeedKindInput(raw: string): string | null {
  const k = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  if (!k || !/^[a-z][a-z0-9_-]{0,62}$/.test(k)) return null;
  return k;
}

function normalizeClientCategoryLabel(raw: string): string | null {
  let s = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s || null;
}

type ArticleItem = {
  id: string;
  feed_kind: string;
  headline: string;
  summary: string;
  category: string;
  body: string;
  link_url: string;
  feature_image_url?: string | null;
  is_published: boolean;
};

function fileToBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const marker = 'base64,';
      const idx = result.indexOf(marker);
      if (idx === -1) {
        reject(new Error('Failed to process selected image'));
        return;
      }
      resolve(result.slice(idx + marker.length));
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

type AdminImageExportFormats = {
  webp: boolean;
  avif: boolean;
  svg: boolean;
  png: boolean;
  jpg: boolean;
  jpeg: boolean;
};

const DEFAULT_ADMIN_IMAGE_EXPORT_FORMATS: AdminImageExportFormats = {
  webp: false,
  avif: false,
  svg: false,
  png: false,
  jpg: false,
  jpeg: false,
};

const ADMIN_IMAGE_EXPORT_CHECKBOXES: Array<{ key: keyof AdminImageExportFormats; label: string }> = [
  { key: 'webp', label: 'WebP' },
  { key: 'avif', label: 'AVIF' },
  { key: 'svg', label: 'SVG (only when the uploaded file is SVG)' },
  { key: 'png', label: 'PNG' },
  { key: 'jpg', label: 'JPG' },
  { key: 'jpeg', label: 'JPEG (.jpeg)' },
];

type AppSettings = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationOpen: boolean;
  /** When true, publishing Job or Exam articles sends announcement emails (create-as-published or first publish). */
  jobExamArticleAnnouncementEmail?: boolean;
  emailEventToggles?: Record<string, boolean>;
  resultUnlockEmailSettings?: {
    enabled: boolean;
    delayHours: number;
  };
  /** When any format is checked, banner and article image uploads also save that format (via server). */
  adminImageExportFormats?: AdminImageExportFormats;
};
const EMAIL_EVENT_TOGGLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'welcome', label: 'Welcome Email' },
  { key: 'security_alert', label: 'Security Alert' },
  { key: 'admin_login_alert', label: 'Admin Login Alert' },
  { key: 'help_support_ack', label: 'Help & Support Acknowledgement' },
  { key: 'feedback_ack', label: 'Feedback Acknowledgement' },
  { key: 'issue_report_ack', label: 'Issue Report Acknowledgement' },
  { key: 'profile_reminder', label: 'Profile Reminder' },
  { key: 'admin_content_alert', label: 'Admin Content Alert' },
  { key: 'result_unlocked', label: 'Result Unlocked' },
  { key: 'mock_test_starting_soon', label: 'Mock Test Starting Soon' },
  { key: 'missed_test_followup', label: 'Missed Test Followup' },
  { key: 'streak_risk_alert', label: 'Streak Risk Alert' },
  { key: 'weekly_performance_report', label: 'Weekly Performance Report' },
  { key: 'rank_milestone', label: 'Rank Milestone' },
  { key: 'new_content_by_interest', label: 'New Content By Interest' },
  { key: 're_engagement', label: 'Re-engagement' },
  { key: 'birthday', label: 'Birthday Wish' },
  { key: 'admin_role_granted', label: 'Admin role invitation email' },
];
const DEFAULT_EMAIL_EVENT_TOGGLES: Record<string, boolean> = EMAIL_EVENT_TOGGLE_FIELDS.reduce((acc, item) => {
  acc[item.key] = true;
  return acc;
}, {} as Record<string, boolean>);
type ProfileMenuItem = {
  id: string;
  title: string;
  subtitle?: string;
  path: string;
  enabled: boolean;
};
type SupportInboxItem = {
  id: string;
  user: string;
  /** App profile public id (users.six_digit_public_id). */
  publicId?: string;
  userId?: string;
  userEmail?: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'new' | 'in_progress' | 'resolved';
};
type SignupRegionItem = {
  state: string;
  districts: string[];
};
type HomeContentSection = {
  id: string;
  title: string;
  items: string[];
};
type HomeQuickActionItem = {
  title: string;
  actionKey: string;
  iconKey?: string;
};
type HomeQuickActionSection = {
  id: string;
  title: string;
  items: HomeQuickActionItem[];
};

function pickGlobalSettingsFields(raw: Record<string, unknown>): AppSettings {
  const resultUnlock = raw.resultUnlockEmailSettings;
  const resultUnlockObj =
    resultUnlock && typeof resultUnlock === 'object'
      ? (resultUnlock as { enabled?: boolean; delayHours?: number })
      : null;
  return {
    maintenanceMode: raw.maintenanceMode === true,
    maintenanceMessage: String(raw.maintenanceMessage || ''),
    registrationOpen: raw.registrationOpen !== false,
    jobExamArticleAnnouncementEmail: raw.jobExamArticleAnnouncementEmail !== false,
    emailEventToggles: {
      ...DEFAULT_EMAIL_EVENT_TOGGLES,
      ...(raw.emailEventToggles && typeof raw.emailEventToggles === 'object'
        ? (raw.emailEventToggles as Record<string, boolean>)
        : {}),
    },
    resultUnlockEmailSettings: {
      enabled: resultUnlockObj?.enabled !== false,
      delayHours: Math.max(1, Number(resultUnlockObj?.delayHours ?? 3) || 3),
    },
    adminImageExportFormats: {
      ...DEFAULT_ADMIN_IMAGE_EXPORT_FORMATS,
      ...(raw.adminImageExportFormats && typeof raw.adminImageExportFormats === 'object'
        ? (raw.adminImageExportFormats as AdminImageExportFormats)
        : {}),
    },
  };
}

function globalSettingsPatchPayload(settings: AppSettings) {
  return {
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    registrationOpen: settings.registrationOpen,
    jobExamArticleAnnouncementEmail: settings.jobExamArticleAnnouncementEmail,
    emailEventToggles: settings.emailEventToggles,
    resultUnlockEmailSettings: settings.resultUnlockEmailSettings,
    adminImageExportFormats: settings.adminImageExportFormats,
  };
}

const DEFAULT_HOME_CONTENT_SECTIONS: HomeContentSection[] = [
  { id: 'category', title: 'Category', items: ['Math', 'Reasoning', 'English', 'GK'] },
];
const DEFAULT_HOME_QUICK_ACTION_SECTIONS: HomeQuickActionSection[] = [
  {
    id: 'quick-actions-default',
    title: 'Quick actions',
    items: [
      { title: 'Start test', actionKey: 'startTest', iconKey: 'play' },
      { title: 'Leaderboard', actionKey: 'leaderboard', iconKey: 'trophy' },
      { title: 'Results', actionKey: 'results', iconKey: 'report' },
      { title: 'Tool', actionKey: 'bookmarks', iconKey: 'bookmark' },
    ],
  },
];

function homeContentPatchWithDefaults(home: Record<string, unknown>) {
  const sections = Array.isArray(home.sections)
    ? (home.sections as HomeContentSection[]).filter(
        (s) => String(s?.title || '').trim() && Array.isArray(s?.items) && s.items.length > 0,
      )
    : [];
  const quickActionSections = Array.isArray(home.quickActionSections)
    ? (home.quickActionSections as HomeQuickActionSection[]).filter(
        (s) =>
          String(s?.title || '').trim() &&
          Array.isArray(s?.items) &&
          s.items.some((x) => String(x?.title || '').trim() && String(x?.actionKey || '').trim()),
      )
    : [];
  return {
    ...home,
    sections: sections.length > 0 ? sections : DEFAULT_HOME_CONTENT_SECTIONS,
    quickActionSections:
      quickActionSections.length > 0 ? quickActionSections : DEFAULT_HOME_QUICK_ACTION_SECTIONS,
  };
}

type HomeBannerItem = {
  id: string;
  imageUrl: string;
  enabled: boolean;
};
type HomeNewsSlideItem = {
  id: string;
  articleId: string;
  headline: string;
  imageUrl: string;
  enabled: boolean;
};
type PromoWidgetChip = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  enabled: boolean;
};
type PromoWidgetCard = {
  id: string;
  title: string;
  subtitle: string;
  buttonText: string;
  bgColor: string;
  enabled: boolean;
};
type StudentUpdateWidgetCard = {
  id: string;
  title: string;
  subtitle: string;
  iconUrl: string;
  enabled: boolean;
};
type StudentUpdateWidgetPill = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  enabled: boolean;
};
type HomeContentSettings = {
  welcomeText: string;
  quickActionsTitle: string;
  autoSaveEnabled: boolean;
  themePreset: 'classic' | 'soft' | 'vibrant' | 'premium';
  promoWidgetEnabled: boolean;
  promoWidgetHtml: string;
  promoWidgetChips: PromoWidgetChip[];
  promoWidgetCards: PromoWidgetCard[];
  studentUpdateWidgetEnabled: boolean;
  studentUpdateWidgetHtml: string;
  studentUpdateWidgetPills: StudentUpdateWidgetPill[];
  studentUpdateWidgetCards: StudentUpdateWidgetCard[];
  newsCategoryMenu: string[];
  jobCategoryMenu: string[];
  examCategoryMenu: string[];
  sections: HomeContentSection[];
  quickActionSections: HomeQuickActionSection[];
  banners: HomeBannerItem[];
  newsSlides: HomeNewsSlideItem[];
  startSeriesLockSeconds: number;
  startSeriesActiveWindowMinutes: number;
};
type AuditLogItem = {
  id: number;
  action_type: string;
  target_type: string;
  target_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  details_json: Record<string, unknown>;
  created_at: string;
};

type UserItem = {
  id: string;
  email: string;
  display_name: string;
  phone: string;
  is_admin: boolean;
  is_super_admin: boolean;
  is_banned: boolean;
  ban_reason: string;
  banned_at: string | null;
};
const TAB_LABELS: Record<Tab, string> = {
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
  analyticsInsights: 'Analytics & Insights',
  userManagementAdvanced: 'User Management Advanced',
  settings: 'Settings',
  auditLogs: 'Audit Logs',
  users: 'Users',
};
const TAB_ICONS: Record<Tab, string> = {
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
  analyticsInsights: 'AN',
  userManagementAdvanced: 'UM',
  settings: 'ST',
  auditLogs: 'LG',
  users: 'US',
};

/** Strip trailing slashes so axios joins paths like `/auth/login` correctly. */
function normalizeApiBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

const envApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
/** Production fallback when `.env.production` omits `VITE_API_BASE_URL` — same host as live API (VPS), not a second deploy. */
const DEFAULT_PRODUCTION_API_BASE = 'https://indiaapk.com/v1';
const apiBase = normalizeApiBaseUrl(
  envApiBase && envApiBase.length > 0
    ? envApiBase
    : import.meta.env.DEV
      ? 'http://127.0.0.1:3000/v1'
      : DEFAULT_PRODUCTION_API_BASE,
);

const ADMIN_AUTH_STORAGE_KEY = 'mocktest_admin_auth_v1';
/** Seconds between admin login OTP sends (matches UX; server has separate rate caps). */
const ADMIN_OTP_RESEND_COOLDOWN_SEC = 60;

const api = axios.create({
  baseURL: apiBase,
  timeout: 15000,
});

/** Avoid showing raw nginx HTML pages in the UI; map common proxy mistakes to a short hint. */
/** Best-effort parse of HTTP Retry-After (seconds) for rate-limit UX. */
function parseRetryAfterSec(err: unknown): number | null {
  const headers = (err as { response?: { headers?: Record<string, unknown> } })?.response?.headers;
  if (!headers) return null;
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(900, Math.round(n));
}

function formatAxiosErr(err: unknown, fallback: string): string {
  const e = err as {
    response?: { status?: number; data?: unknown };
    code?: string;
    message?: string;
  };
  const status = e?.response?.status;
  const data = e?.response?.data;
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const er = (data as { error?: unknown }).error;
    if (typeof er === 'string' && er.trim()) return er.trim();
  }
  if (typeof data === 'string') {
    const s = data.trim();
    if (/^<!DOCTYPE|<html[\s>]/i.test(s)) {
      if (status === 405) {
        return 'HTTP 405 (nginx): POST to /v1 is not allowed — add a proxy for the API. Example: location /v1/ { proxy_pass http://127.0.0.1:3000/v1/; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; } then: sudo nginx -t && sudo systemctl reload nginx';
      }
      if (status === 404) {
        return 'HTTP 404: /v1 not proxied to Node. Fix nginx (location /v1/) and VITE_API_BASE_URL.';
      }
      return `Server returned HTML (HTTP ${status ?? '?'}). Nginx must proxy /v1 to the Node process (e.g. PM2 on port 3000).`;
    }
    return s.length > 280 ? `${s.slice(0, 280)}…` : s;
  }
  if (e?.code === 'ECONNABORTED') return 'Request timed out (15s).';
  if (!e?.response && (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error')) {
    return `Cannot reach API at ${apiBase}. Set admin-web/.env.production VITE_API_BASE_URL and rebuild; ensure PM2 and nginx are correct.`;
  }
  return fallback;
}

function getInitialAdminAuthState() {
  if (typeof window === 'undefined') {
    return { token: '', isAdmin: false, isSuperAdmin: false, identifier: '' };
  }
  try {
    const raw = window.localStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
    if (!raw) return { token: '', isAdmin: false, isSuperAdmin: false, identifier: '' };
    const parsed = JSON.parse(raw) as {
      token?: string;
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
      identifier?: string;
    };
    const token = String(parsed?.token || '');
    if (!token) return { token: '', isAdmin: false, isSuperAdmin: false, identifier: '' };
    return {
      token,
      isAdmin: parsed?.isAdmin !== false,
      isSuperAdmin: Boolean(parsed?.isSuperAdmin),
      identifier: String(parsed?.identifier || ''),
    };
  } catch (_err) {
    return { token: '', isAdmin: false, isSuperAdmin: false, identifier: '' };
  }
}

function normalizeBoolean(value: unknown, fallback = true) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
}

/** Mirrors server `normalizeSubjectSectionsInput` — safe keys only. */
function normalizeSubjectSectionsForSubmit(
  raw: Array<{ key?: string; label?: string } | null | undefined>,
): SubjectSectionRow[] {
  const out: SubjectSectionRow[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    const o = item && typeof item === 'object' ? item : {};
    let key = String(o.key ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!key) continue;
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = String(o.label ?? o.key ?? key)
      .trim()
      .slice(0, 120);
    out.push({ key, label: label || key });
    if (out.length >= 40) break;
  }
  return out;
}

function validateSubjectSectionDraft(raw: Array<{ key?: string; label?: string } | null | undefined>): string | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const seenNorm = new Set<string>();
  let nonEmpty = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    const o = item && typeof item === 'object' ? item : {};
    const keyRaw = String(o.key ?? '').trim();
    const labelRaw = String(o.label ?? '').trim();
    if (!keyRaw && !labelRaw) continue;
    nonEmpty += 1;
    if (!keyRaw && labelRaw) {
      return `Subject sections row ${i + 1}: enter a subject key (e.g. math) when a label is set.`;
    }
    const nk = keyRaw.toLowerCase().replace(/\s+/g, '_');
    if (!/^[a-z0-9_-]{1,40}$/.test(nk)) {
      return `Subject sections row ${i + 1}: key must use only a-z, 0-9, underscore, hyphen (1-40 chars).`;
    }
    if (seenNorm.has(nk)) {
      return `Subject sections: duplicate key "${nk}".`;
    }
    seenNorm.add(nk);
  }
  if (nonEmpty > 40) {
    return 'Subject sections: at most 40 subjects.';
  }
  return null;
}

/** Optional question tag — mirrors server `parseQuestionSubjectKey` for non-empty values. */
function normalizeQuestionSubjectKeyInput(raw: unknown): { value: string; error?: string } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { value: '' };
  }
  const s = String(raw).trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(s)) {
    return {
      value: '',
      error: 'Subject must be 1-40 characters: lowercase letters, digits, underscore, or hyphen.',
    };
  }
  return { value: s };
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function splitDelimitedLine(line: string, delimiter: string) {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function parseQuestionImportText(format: 'csv' | 'excel' | 'json', rawText: string) {
  const text = rawText.trim();
  if (!text) return { error: 'Import text is required' };
  if (format === 'json') {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || !parsed.length) return { error: 'JSON must be a non-empty array' };
      return { value: parsed };
    } catch (_e) {
      return { error: 'Invalid JSON format' };
    }
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { error: 'Provide header and at least one row' };
  const delimiter = format === 'excel' ? '\t' : ',';
  const header = splitDelimitedLine(lines[0], delimiter).map((x) => x.trim().toLowerCase());
  const required = ['stem', 'choicea', 'choiceb', 'choicec', 'choiced', 'correctindex'];
  const missing = required.filter((key) => !header.includes(key));
  if (missing.length) return { error: `Missing headers: ${missing.join(', ')}` };
  const items = lines.slice(1).map((line) => {
    const cols = splitDelimitedLine(line, delimiter);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    return {
      position: row.position,
      stem: row.stem,
      choiceA: row.choicea,
      choiceB: row.choiceb,
      choiceC: row.choicec,
      choiceD: row.choiced,
      correctIndex: row.correctindex,
      explanation: row.explanation || '',
      isPublished: row.ispublished === undefined ? true : !['false', '0', 'no'].includes(String(row.ispublished).trim().toLowerCase()),
    };
  });
  return { value: items };
}

function App() {
  const initialAdminAuth = useMemo(() => getInitialAdminAuthState(), []);
  const [token, setToken] = useState<string>(initialAdminAuth.token);
  const [isAdmin, setIsAdmin] = useState(initialAdminAuth.isAdmin);
  const [isSuperAdmin, setIsSuperAdmin] = useState(initialAdminAuth.isSuperAdmin);
  const [, setAuthBooting] = useState(true);
  const [identifier, setIdentifier] = useState(initialAdminAuth.identifier);
  const [password, setPassword] = useState('');
  const [adminOtpStep, setAdminOtpStep] = useState<'password' | 'otp'>('password');
  const [otpCode, setOtpCode] = useState('');
  const [otpResendSec, setOtpResendSec] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'error' | 'success'>('info');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedQuestionTestId, setSelectedQuestionTestId] = useState<string>('');
  const sideNavRef = useRef<HTMLElement | null>(null);
  const handleAuthExpiredRef = useRef<() => void>(() => {});

  handleAuthExpiredRef.current = () => {
    clearStoredAuth();
    setToken('');
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setAdminOtpStep('password');
    setOtpCode('');
    setPassword('');
    setOtpResendSec(0);
    setMessage('Session expired or revoked. Please sign in again.');
    setMessageType('error');
  };

  const authedApi = useMemo(() => {
    const instance = axios.create({ baseURL: apiBase, timeout: 15000 });
    instance.interceptors.request.use((config) => {
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    instance.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = Number(err?.response?.status || 0);
        if (status === 401) handleAuthExpiredRef.current();
        return Promise.reject(err);
      },
    );
    return instance;
  }, [token]);

  function clearStoredAuth() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  }

  function saveStoredAuth(
    nextToken: string,
    nextIsSuperAdmin: boolean,
    nextIdentifier: string,
    nextIsAdmin = true,
  ) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      ADMIN_AUTH_STORAGE_KEY,
      JSON.stringify({
        token: nextToken,
        isAdmin: nextIsAdmin,
        isSuperAdmin: nextIsSuperAdmin,
        identifier: nextIdentifier,
      }),
    );
  }

  useEffect(() => {
    let isActive = true;
    async function restoreSession() {
      if (typeof window === 'undefined') {
        if (isActive) setAuthBooting(false);
        return;
      }
      const raw = window.localStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
      if (!raw) {
        if (isActive) setAuthBooting(false);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as {
          token?: string;
          isAdmin?: boolean;
          isSuperAdmin?: boolean;
          identifier?: string;
        };
        const persistedToken = String(parsed?.token || '');
        if (!persistedToken) {
          clearStoredAuth();
          if (isActive) setAuthBooting(false);
          return;
        }
        // Restore persisted admin session first; verify against backend afterward.
        setToken(persistedToken);
        setIsAdmin(normalizeBoolean(parsed?.isAdmin, true));
        setIsSuperAdmin(Boolean(parsed?.isSuperAdmin));
        if (parsed?.identifier) setIdentifier(String(parsed.identifier));
        const meRes = await api.get('/me', {
          headers: { Authorization: `Bearer ${persistedToken}` },
        });
        if (!isActive) return;
        if (!meRes.data?.user?.isAdmin) {
          clearStoredAuth();
          setToken('');
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setAuthBooting(false);
          return;
        }
        setToken(persistedToken);
        setIsAdmin(true);
        setIsSuperAdmin(Boolean(meRes.data?.user?.isSuperAdmin));
        if (parsed?.identifier) setIdentifier(String(parsed.identifier));
      } catch (err: any) {
        const status = Number(err?.response?.status || 0);
        if (status === 401 || status === 403) {
          clearStoredAuth();
          if (!isActive) return;
          setToken('');
          setIsAdmin(false);
          setIsSuperAdmin(false);
        }
      } finally {
        if (isActive) setAuthBooting(false);
      }
    }
    restoreSession();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth > 900) return;
    const nav = sideNavRef.current;
    if (!nav) return;
    const activeBtn = nav.querySelector('button.active');
    if (!activeBtn) return;
    activeBtn.scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
      block: 'nearest',
    });
  }, [tab]);

  useEffect(() => {
    // Prevent Question Builder sticky-selection state from affecting All Tests view.
    if (tab === 'allTests' && selectedQuestionTestId) {
      setSelectedQuestionTestId('');
    }
  }, [tab, selectedQuestionTestId]);

  useEffect(() => {
    if (adminOtpStep !== 'otp') {
      setOtpResendSec(0);
      return;
    }
    setOtpResendSec(ADMIN_OTP_RESEND_COOLDOWN_SEC);
  }, [adminOtpStep]);

  useEffect(() => {
    if (otpResendSec <= 0) return;
    const id = window.setTimeout(() => setOtpResendSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [otpResendSec]);

  type LoginUserPayload = { isAdmin?: boolean; isSuperAdmin?: boolean; email?: string } | null;

  async function bootstrapAdminSession(
    accessToken: string,
    identifierLabel: string,
    loginUser: LoginUserPayload,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    let resolvedIsAdmin = Boolean(loginUser?.isAdmin);
    let resolvedIsSuperAdmin = Boolean(loginUser?.isSuperAdmin);
    if (!loginUser || loginUser.isAdmin === undefined) {
      const meRes = await api.get('/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      resolvedIsAdmin = Boolean(meRes.data?.user?.isAdmin);
      resolvedIsSuperAdmin = Boolean(meRes.data?.user?.isSuperAdmin);
    }
    if (!resolvedIsAdmin) {
      return {
        ok: false,
        message: 'No admin registration found for this login. Please check your Gmail account.',
      };
    }
    saveStoredAuth(accessToken, resolvedIsSuperAdmin, identifierLabel, resolvedIsAdmin);
    setIsAdmin(true);
    setIsSuperAdmin(resolvedIsSuperAdmin);
    setToken(accessToken);
    return { ok: true };
  }

  /** Server local-dev bypass: request-otp returns tokens + devPasswordBypass (never in production). */
  async function completeAdminDevBypassLogin(
    resData: { accessToken?: string; user?: LoginUserPayload },
    successMsg: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const accessToken = String(resData?.accessToken || '');
    if (!accessToken) return { ok: false, message: 'Token missing in login response.' };
    const loginUser = (resData?.user || null) as LoginUserPayload;
    const result = await bootstrapAdminSession(accessToken, identifier, loginUser);
    if (!result.ok) return { ok: false, message: result.message };
    setAdminOtpStep('password');
    setOtpCode('');
    setPassword('');
    setOtpResendSec(0);
    setMessageType('success');
    setMessage(successMsg);
    return { ok: true };
  }

  async function handleAdminRequestOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType('info');
    try {
      const res = await api.post('/auth/admin-login/request-otp', {
        identifier,
        password,
      });
      if (res.data?.ok) {
        if (res.data?.devPasswordBypass && res.data?.accessToken) {
          const done = await completeAdminDevBypassLogin(res.data, 'Login successful (local dev: no OTP).');
          if (!done.ok) {
            setMessageType('error');
            setMessage(done.message);
          }
          return;
        }
        setAdminOtpStep('otp');
        setOtpCode('');
        setMessageType('success');
        setMessage(String(res.data?.message || 'Check your email for the login code.'));
      } else {
        setMessageType('error');
        setMessage('Could not send login code.');
      }
    } catch (err: unknown) {
      setMessageType('error');
      setMessage(formatAxiosErr(err, 'Could not send login code. Check ID and password.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminResendOtp() {
    if (loading || otpResendSec > 0) return;
    if (!password) {
      setMessageType('error');
      setMessage('Use Back, then sign in again to resend a code.');
      return;
    }
    setLoading(true);
    setMessage('');
    setMessageType('info');
    try {
      const res = await api.post('/auth/admin-login/request-otp', {
        identifier,
        password,
      });
      if (res.data?.ok) {
        if (res.data?.devPasswordBypass && res.data?.accessToken) {
          const done = await completeAdminDevBypassLogin(res.data, 'Signed in again (local dev: no OTP).');
          if (!done.ok) {
            setMessageType('error');
            setMessage(done.message);
          }
          return;
        }
        setOtpCode('');
        setOtpResendSec(ADMIN_OTP_RESEND_COOLDOWN_SEC);
        setMessageType('success');
        setMessage(String(res.data?.message || 'A new login code was sent to your email.'));
      } else {
        setMessageType('error');
        setMessage('Could not resend login code.');
      }
    } catch (err: unknown) {
      setMessageType('error');
      setMessage(formatAxiosErr(err, 'Could not resend login code.'));
      const ra = parseRetryAfterSec(err);
      if (ra != null) setOtpResendSec((s) => Math.max(s, ra));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminVerifyOtp(e: FormEvent) {
    e.preventDefault();
    const digits = otpCode.replace(/\D/g, '').slice(0, 6);
    if (digits.length !== 6) {
      setMessageType('error');
      setMessage('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    setMessage('');
    setMessageType('info');
    try {
      const loginRes = await api.post('/auth/admin-login/verify-otp', {
        identifier,
        otp: digits,
      });
      const accessToken = String(loginRes.data?.accessToken || '');
      if (!accessToken) throw new Error('Token missing in login response');
      const loginUser = (loginRes.data?.user || null) as LoginUserPayload;
      const result = await bootstrapAdminSession(accessToken, identifier, loginUser);
      if (!result.ok) {
        setMessageType('error');
        setMessage(result.message);
        return;
      }
      setAdminOtpStep('password');
      setOtpCode('');
      setPassword('');
      setOtpResendSec(0);
      setMessageType('success');
      setMessage('Login successful.');
    } catch (err: unknown) {
      setMessageType('error');
      setMessage(formatAxiosErr(err, 'Invalid or expired code.'));
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="page auth-page">
        <div className="mesh-bg" aria-hidden="true">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>
        <div className="auth-shell">
          <div className="auth-card login-card">
            <>
              <p className="auth-login-title">Admin login</p>
              {adminOtpStep === 'password' ? (
                <form onSubmit={handleAdminRequestOtp} className="auth-form auth-float-form">
                  <div className="input-group">
                    <div className="input-box input-box-float">
                      <i aria-hidden="true">✉</i>
                      <input
                        id="admin-login-identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder=" "
                        autoComplete="username"
                        required
                      />
                      <label htmlFor="admin-login-identifier">Email / Mobile</label>
                    </div>
                  </div>
                  <div className="input-group">
                    <div className="input-box input-box-float">
                      <i aria-hidden="true">🔒</i>
                      <input
                        id="admin-login-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder=" "
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                      <label htmlFor="admin-login-password">Password</label>
                    </div>
                  </div>
                  <button type="submit" className="login-btn" disabled={loading}>
                    {loading ? 'Login…' : 'Login'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAdminVerifyOtp} className="auth-form auth-float-form">
                  <p className="auth-message info" style={{ marginBottom: '12px', fontSize: '14px' }}>
                    <span className="auth-otp-sent-label">Code sent for</span>
                    <strong className="auth-otp-sent-id">{identifier}</strong>
                  </p>
                  <div className="input-group">
                    <div className="input-box input-box-float">
                      <i aria-hidden="true">🔢</i>
                      <input
                        id="admin-login-otp"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder=" "
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                      />
                      <label htmlFor="admin-login-otp">6-digit code</label>
                    </div>
                  </div>
                  <button type="submit" className="login-btn" disabled={loading}>
                    {loading ? 'Login…' : 'Login'}
                  </button>
                  <button
                    type="button"
                    className="link-like-btn"
                    disabled={loading || otpResendSec > 0}
                    onClick={() => void handleAdminResendOtp()}
                  >
                    {otpResendSec > 0 ? `Resend code in ${otpResendSec}s` : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    className="login-btn"
                    style={{ marginTop: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.35)' }}
                    disabled={loading}
                    onClick={() => {
                      setAdminOtpStep('password');
                      setOtpCode('');
                      setMessage('');
                      setOtpResendSec(0);
                    }}
                  >
                    Back
                  </button>
                </form>
              )}
              {message && <p className={`auth-message ${messageType} ${messageType === 'error' ? 'error-p' : ''}`}>{message}</p>}
            </>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminToastProvider>
      <AdminDialogProvider>
      <div className="page">
        <div className="admin-shell">
        <aside className="sidebar">
          <div>
            <p className="brand-tag">MockTest</p>
            <h2 className="brand-title">Admin Panel</h2>
          </div>
          <nav ref={sideNavRef} className="side-nav">
            {([
              'dashboard',
              'users',
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
            ] as Tab[]).map(
              (name) => (
              <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
                <span>{TAB_ICONS[name]}</span>
                {TAB_LABELS[name]}
              </button>
              ),
            )}
          </nav>
        </aside>
        <main className="main">
          <header className="topbar">
            <div>
              {tab !== 'pushNotificationSettings' ? <h1>{TAB_LABELS[tab]}</h1> : null}
            </div>
            <button
              type="button"
              aria-label="Logout"
              className="ghost"
              title="Logout"
              onClick={() => {
                clearStoredAuth();
                setIsAdmin(false);
                setIsSuperAdmin(false);
                setToken('');
                setMessage('');
                setIdentifier('');
                setPassword('');
              }}
            />
          </header>
          {tab === 'dashboard' && <DashboardTab apiClient={authedApi} />}
          {tab === 'analyticsInsights' && <AnalyticsInsightsTab apiClient={authedApi} />}
          {tab === 'leaderboard' && <LeaderboardTab />}
          {tab === 'allTests' && (
            <TestsTab
              key="all-tests-tab"
              apiClient={authedApi}
              mode="allTests"
              selectedQuestionTestId={selectedQuestionTestId}
              onNavigateTab={setTab}
              onSelectQuestionTest={(testId) => {
                setSelectedQuestionTestId(testId);
                setTab('questionBuilder');
              }}
            />
          )}
          {tab === 'questionBuilder' && (
            <TestsTab
              key="question-builder-tab"
              apiClient={authedApi}
              mode="questionBuilder"
              selectedQuestionTestId={selectedQuestionTestId}
              onNavigateTab={setTab}
              onSelectQuestionTest={setSelectedQuestionTestId}
            />
          )}
          {tab === 'profile' && <ProfileTab apiClient={authedApi} />}
          {tab === 'feedback' && <SupportInboxSettingsTab apiClient={authedApi} title="Feedback" settingsKey="feedbackInbox" />}
          {tab === 'helpSupport' && <SupportInboxSettingsTab apiClient={authedApi} title="Help and Support" settingsKey="helpSupportInbox" />}
          {tab === 'reportIssue' && <SupportInboxSettingsTab apiClient={authedApi} title="Report Issue" settingsKey="reportIssueInbox" />}
          {tab === 'achievement' && (
            <SimpleContentSettingsTab
              apiClient={authedApi}
              title="Achievement"
              settingsKey="achievementContent"
              showTitleField
            />
          )}
          {tab === 'shareContent' && <ShareContentTab apiClient={authedApi} />}
          {tab === 'signupRegions' && <SignupRegionsSettingsTab apiClient={authedApi} />}
          {tab === 'privacyPolicy' && <SimpleContentSettingsTab apiClient={authedApi} title="Privacy Policy" settingsKey="privacyPolicyContent" />}
          {tab === 'termsOfUse' && <SimpleContentSettingsTab apiClient={authedApi} title="Terms of Use" settingsKey="termsOfUseContent" />}
          {tab === 'dailyDigest' && <DailyDigestTab apiClient={authedApi} />}
          {tab === 'dailyQuiz' && <DailyQuizTab apiClient={authedApi} />}
          {tab === 'articles' && <ArticlesTab apiClient={authedApi} />}
          {tab === 'homeContent' && <HomeContentTab apiClient={authedApi} />}
          {tab === 'examSnapCard' && <ExamSnapCardTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
          {tab === 'pollSettings' && <PollSettingsTab apiClient={authedApi} />}
          {tab === 'pushNotificationSettings' && <PushNotificationSettingsTab apiClient={authedApi} />}
          {tab === 'notificationScheduling' && <NotificationSchedulingTab apiClient={authedApi} />}
          {tab === 'publishScheduling' && <PublishSchedulingTab apiClient={authedApi} />}
          {tab === 'submitApplicationContent' && <SubmitApplicationContentTab apiClient={authedApi} />}
          {tab === 'instructionContent' && <InstructionContentTab apiClient={authedApi} />}
          {tab === 'examCategories' && <ExamCategoriesTab apiClient={authedApi} />}
          {tab === 'settings' && <SettingsTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
          {tab === 'auditLogs' && <AuditLogsTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
          {tab === 'users' && <UsersTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
          {tab === 'userManagementAdvanced' && <UserManagementAdvancedTab apiClient={authedApi} isSuperAdmin={isSuperAdmin} />}
        </main>
      </div>
      </div>
      </AdminDialogProvider>
    </AdminToastProvider>
  );
}

function DashboardTab({ apiClient }: { apiClient: typeof api }) {
  const { pushToast } = useAdminToast();
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashboardRange>('7d');

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/summary', { params: { range } });
      setData(normalizeDashboardSummary(res.data));
    } catch (err: any) {
      setData(null);
      pushToast('error', err?.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <DashboardAnalytics
      data={data}
      loading={loading}
      range={range}
      onRangeChange={setRange}
      onRefresh={() => void load()}
    />
  );
}

function AnalyticsInsightsTab({ apiClient }: { apiClient: typeof api }) {
  return <AnalyticsInsightsTabImpl apiClient={apiClient} />;
}

function LeaderboardTab() {
  const { pushToast } = useAdminToast();
  const [items, setItems] = useState<any[]>([]);
  const [range, setRange] = useState<RangeKind>('weekly');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [query, setQuery] = useState('');
  async function load() {
    try {
      const res = await api.get('/leaderboard', { params: { range, city, state, limit: 80 } });
      setItems(res.data?.items || []);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load leaderboard');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filtered = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.city || '').toLowerCase().includes(q) ||
      String(item.state || '').toLowerCase().includes(q)
    );
  });
  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Leaderboard Insights</h3>
      </div>
      <div className="inline-form">
        <select value={range} onChange={(e) => setRange(e.target.value as RangeKind)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="all">All</option>
        </select>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City filter" />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State filter" />
        <button onClick={load}>Load Leaderboard</button>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in leaderboard" />
      <div className="list table leaderboard-table">
        <div className="row row-head">
          <span>Rank</span>
          <span>Name</span>
          <span>Score</span>
          <span>City</span>
          <span>State</span>
        </div>
        {filtered.map((item) => (
          <div key={item.userId} className="row">
            <span>#{item.rank}</span>
            <span>{item.name}</span>
            <span>{item.score} pts ({item.totalCorrect}/{item.totalQuestions})</span>
            <span>{item.city}</span>
            <span>{item.state}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TestsTab({
  apiClient,
  mode,
  selectedQuestionTestId,
  onNavigateTab,
  onSelectQuestionTest,
}: {
  apiClient: typeof api;
  mode: 'allTests' | 'questionBuilder';
  selectedQuestionTestId: string;
  onNavigateTab?: (tab: Tab) => void;
  onSelectQuestionTest: (testId: string) => void;
}) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm, prompt: adminPrompt } = useAdminDialog();
  const TESTS_PER_PAGE = 20;
  const QUESTIONS_PER_PAGE = 20;
  const [items, setItems] = useState<TestItem[]>([]);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [questionCount, setQuestionCount] = useState('');
  const [totalMarks, setTotalMarks] = useState('');
  const [examDate, setExamDate] = useState('');
  const [slotLabel, setSlotLabel] = useState('');
  const [capacityTotal, setCapacityTotal] = useState('');
  const [enrolledCount, setEnrolledCount] = useState('0');
  const [attemptsAllowed, setAttemptsAllowed] = useState('');
  const [languageMode, setLanguageMode] = useState('');
  const [examMode, setExamMode] = useState('');
  const [negativeMarkingText, setNegativeMarkingText] = useState('');
  const [testTypeLabel, setTestTypeLabel] = useState('');
  const [badgeEnabled, setBadgeEnabled] = useState(true);
  const [badgeText, setBadgeText] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [answerKeyReleaseAt, setAnswerKeyReleaseAt] = useState('');
  const [resultReleaseAt, setResultReleaseAt] = useState('');
  const [dynamicDateEnabled, setDynamicDateEnabled] = useState(false);
  const [dateCycleDays, setDateCycleDays] = useState('0');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [unpublishAt, setUnpublishAt] = useState('');
  const [resultVisibility, setResultVisibility] = useState<'immediate' | 'after_result_time'>('immediate');
  const [reattemptCooldownMinutes, setReattemptCooldownMinutes] = useState('0');
  const [lateJoinMinutes, setLateJoinMinutes] = useState('0');
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState('0');
  const [resumeEnabled, setResumeEnabled] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [fullscreenRequired, setFullscreenRequired] = useState(false);
  const [copyPasteBlocked, setCopyPasteBlocked] = useState(false);
  const [notifyOnPublish, setNotifyOnPublish] = useState(true);
  const [sendEmailOnPublish, setSendEmailOnPublish] = useState(false);
  /** Draft rows for All Tests → Advanced → subject sections (saved with test advancedConfig). */
  const [subjectSectionRows, setSubjectSectionRows] = useState<SubjectSectionRow[]>([]);
  const [opsTestId, setOpsTestId] = useState('');
  const [search, setSearch] = useState('');
  const [questionBuilderSearch, setQuestionBuilderSearch] = useState('');
  /** When set, top “Add / edit test” form is editing this test (inline table edit removed). */
  const [editingTestId, setEditingTestId] = useState('');
  const testFormRef = useRef<HTMLFormElement | null>(null);
  const [kind, setKind] = useState<TestKind>('mock');
  const [isPublished, setIsPublished] = useState(true);
  const [dynamicFluctuationOnPublish, setDynamicFluctuationOnPublish] = useState(true);
  const [isRefreshingTests, setIsRefreshingTests] = useState(false);
  const [selectedTest, setSelectedTest] = useState<TestItem | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionForm, setQuestionForm] = useState({
    stem: '',
    choiceA: '',
    choiceB: '',
    choiceC: '',
    choiceD: '',
    correctIndex: '0',
    explanation: '',
    isPublished: true,
    /** Subject key — must match a configured section key when this test defines subjectSections. */
    subjectKey: '',
  });
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportFormat, setBulkImportFormat] = useState<'csv' | 'excel' | 'json'>('csv');
  const [bulkImportMode, setBulkImportMode] = useState<'append' | 'replace'>('append');
  const [bulkImportText, setBulkImportText] = useState('');
  const [isImportingQuestions, setIsImportingQuestions] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [testsPage, setTestsPage] = useState(1);
  const [questionsPage, setQuestionsPage] = useState(1);
  const TEST_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const SLOT_LABEL_RE = /^(0[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i;

  function nextQuestionPositionFrom(itemsList: QuestionItem[]) {
    const maxPos = itemsList.reduce((max, item) => {
      const p = Number(item.position || 0);
      return Number.isInteger(p) && p > max ? p : max;
    }, 0);
    return String(maxPos + 1);
  }

  function normalizeAndValidateTestPayload(input: {
    title: string;
    slug: string;
    subcategory?: string;
    metaLine?: string;
    durationMinutes: string | number;
    questionCount: string | number;
    totalMarks: string | number;
    examDate?: string;
    slotLabel?: string;
    capacityTotal: string | number;
    enrolledCount: string | number;
    attemptsAllowed: string | number;
    languageMode?: string;
    examMode?: string;
    negativeMarkingText?: string;
    testTypeLabel?: string;
    badgeEnabled: boolean;
    badgeText?: string;
    validUntil?: string;
    answerKeyReleaseAt?: string;
    resultReleaseAt?: string;
    dynamicDateEnabled: boolean;
    dateCycleDays: string | number;
    publishAt?: string;
    unpublishAt?: string;
    resultVisibility?: string;
    reattemptCooldownMinutes?: string | number;
    lateJoinMinutes?: string | number;
    notifyBeforeMinutes?: string | number;
    resumeEnabled?: boolean;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    fullscreenRequired?: boolean;
    copyPasteBlocked?: boolean;
    notifyOnPublish?: boolean;
    sendEmailOnPublish?: boolean;
    testKind: string;
    isPublished: boolean;
    dynamicFluctuationOnPublish: boolean;
    subjectSectionRows?: SubjectSectionRow[];
  }) {
    const titleValue = String(input.title || '').trim().slice(0, 180);
    const slugValue = String(input.slug || '').trim().slice(0, 180).toLowerCase();
    const subcategoryValue = String(input.subcategory || '').trim().slice(0, 120);
    const metaLineValue = String(input.metaLine || '').trim().slice(0, 240);
    const testKindValue = String(input.testKind || '').trim().toLowerCase();
    const durationValue = Number(input.durationMinutes);
    const questionCountValue = Number(input.questionCount);
    const totalMarksValue = Number(input.totalMarks || 0);
    const examDateValue = String(input.examDate || '').trim();
    const slotLabelValue = String(input.slotLabel || '').trim().slice(0, 80);
    const capacityValue = Number(input.capacityTotal || 0);
    const enrolledValue = Number(input.enrolledCount || 0);
    const attemptsValue = Number(input.attemptsAllowed || 1);
    const languageModeValue = String(input.languageMode || 'Bilingual').trim().slice(0, 40) || 'Bilingual';
    const examModeValue = String(input.examMode || 'Practice').trim().slice(0, 40) || 'Practice';
    const negativeMarkingValue = String(input.negativeMarkingText || 'No').trim().slice(0, 40) || 'No';
    const testTypeValue = String(input.testTypeLabel || 'Full Mock').trim().slice(0, 40) || 'Full Mock';
    const badgeTextValue = String(input.badgeText || 'Live').trim().slice(0, 40) || 'Live';
    const validUntilValue = String(input.validUntil || '').trim();
    const answerKeyValue = String(input.answerKeyReleaseAt || '').trim();
    const resultReleaseValue = String(input.resultReleaseAt || '').trim();
    const dateCycleDaysValue = Number(input.dateCycleDays || 0);
    const publishAtValue = String(input.publishAt || '').trim();
    const unpublishAtValue = String(input.unpublishAt || '').trim();
    const resultVisibilityValue = String(input.resultVisibility || 'immediate').trim().toLowerCase();
    const reattemptCooldownValue = Number(input.reattemptCooldownMinutes || 0);
    const lateJoinValue = Number(input.lateJoinMinutes || 0);
    const notifyBeforeValue = Number(input.notifyBeforeMinutes || 0);

    if (!titleValue || !slugValue || !['mock', 'quiz'].includes(testKindValue)) {
      return { error: 'title, slug, and valid testKind are required' };
    }
    if (!TEST_SLUG_RE.test(slugValue)) {
      return { error: 'slug must use lowercase letters, numbers and hyphen only' };
    }
    if (!Number.isFinite(durationValue) || !Number.isInteger(durationValue) || durationValue <= 0 || durationValue > 1440) {
      return { error: 'durationMinutes must be an integer between 1 and 1440' };
    }
    if (!Number.isFinite(questionCountValue) || !Number.isInteger(questionCountValue) || questionCountValue <= 0 || questionCountValue > 500) {
      return { error: 'questionCount must be an integer between 1 and 500' };
    }
    if (!Number.isFinite(totalMarksValue) || totalMarksValue < 0 || totalMarksValue > 10000) {
      return { error: 'totalMarks must be between 0 and 10000' };
    }
    if (!Number.isFinite(capacityValue) || !Number.isInteger(capacityValue) || capacityValue < 0 || capacityValue > 1000000) {
      return { error: 'capacityTotal must be an integer between 0 and 1000000' };
    }
    if (!Number.isFinite(enrolledValue) || !Number.isInteger(enrolledValue) || enrolledValue < 0 || enrolledValue > 1000000) {
      return { error: 'enrolledCount must be an integer between 0 and 1000000' };
    }
    if (enrolledValue > capacityValue) {
      return { error: 'enrolledCount cannot be greater than capacityTotal' };
    }
    if (!Number.isFinite(attemptsValue) || !Number.isInteger(attemptsValue) || attemptsValue < 1 || attemptsValue > 20) {
      return { error: 'attemptsAllowed must be an integer between 1 and 20' };
    }
    if (!Number.isFinite(dateCycleDaysValue) || !Number.isInteger(dateCycleDaysValue) || dateCycleDaysValue < 0 || dateCycleDaysValue > 3650) {
      return { error: 'dateCycleDays must be an integer between 0 and 3650' };
    }
    if (examDateValue && Number.isNaN(Date.parse(`${examDateValue}T00:00:00Z`))) {
      return { error: 'examDate must be a valid date (YYYY-MM-DD)' };
    }
    if (slotLabelValue && !SLOT_LABEL_RE.test(slotLabelValue)) {
      return { error: 'slotLabel must be in HH:MM AM/PM format (example: 09:30 AM)' };
    }
    if (examDateValue && !slotLabelValue) {
      return { error: 'slotLabel is required when examDate is provided (use HH:MM AM/PM)' };
    }
    if (validUntilValue && Number.isNaN(Date.parse(`${validUntilValue}T00:00:00Z`))) {
      return { error: 'validUntil must be a valid date (YYYY-MM-DD)' };
    }
    if (answerKeyValue && Number.isNaN(Date.parse(answerKeyValue))) {
      return { error: 'answerKeyReleaseAt must be a valid datetime' };
    }
    if (resultReleaseValue && Number.isNaN(Date.parse(resultReleaseValue))) {
      return { error: 'resultReleaseAt must be a valid datetime' };
    }
    if (examDateValue && validUntilValue) {
      const examDateMs = Date.parse(`${examDateValue}T00:00:00Z`);
      const validUntilMs = Date.parse(`${validUntilValue}T00:00:00Z`);
      if (validUntilMs < examDateMs) {
        return { error: 'validUntil must be on or after examDate' };
      }
    }
    if (answerKeyValue && resultReleaseValue) {
      const answerKeyMs = Date.parse(answerKeyValue);
      const resultReleaseMs = Date.parse(resultReleaseValue);
      if (resultReleaseMs < answerKeyMs) {
        return { error: 'resultReleaseAt must be on or after answerKeyReleaseAt' };
      }
    }
    if (publishAtValue && Number.isNaN(Date.parse(publishAtValue))) {
      return { error: 'advancedConfig.publishAt must be a valid datetime' };
    }
    if (unpublishAtValue && Number.isNaN(Date.parse(unpublishAtValue))) {
      return { error: 'advancedConfig.unpublishAt must be a valid datetime' };
    }
    if (publishAtValue && unpublishAtValue && Date.parse(unpublishAtValue) < Date.parse(publishAtValue)) {
      return { error: 'advancedConfig.unpublishAt must be on or after publishAt' };
    }
    if (!['immediate', 'after_result_time'].includes(resultVisibilityValue)) {
      return { error: 'advancedConfig.resultVisibility must be immediate or after_result_time' };
    }
    if (!Number.isFinite(reattemptCooldownValue) || !Number.isInteger(reattemptCooldownValue) || reattemptCooldownValue < 0 || reattemptCooldownValue > 10080) {
      return { error: 'advancedConfig.reattemptCooldownMinutes must be an integer between 0 and 10080' };
    }
    if (!Number.isFinite(lateJoinValue) || !Number.isInteger(lateJoinValue) || lateJoinValue < 0 || lateJoinValue > 240) {
      return { error: 'advancedConfig.lateJoinMinutes must be an integer between 0 and 240' };
    }
    if (!Number.isFinite(notifyBeforeValue) || !Number.isInteger(notifyBeforeValue) || notifyBeforeValue < 0 || notifyBeforeValue > 10080) {
      return { error: 'advancedConfig.notifyBeforeMinutes must be an integer between 0 and 10080' };
    }

    const subjectSectionsDraftErr = validateSubjectSectionDraft(input.subjectSectionRows ?? []);
    if (subjectSectionsDraftErr) {
      return { error: subjectSectionsDraftErr };
    }
    const subjectSectionsNormalized = normalizeSubjectSectionsForSubmit(input.subjectSectionRows ?? []);

    return {
      value: {
        title: titleValue,
        slug: slugValue,
        subcategory: subcategoryValue,
        metaLine: metaLineValue,
        durationMinutes: durationValue,
        questionCount: questionCountValue,
        totalMarks: Math.max(0, totalMarksValue),
        examDate: examDateValue,
        slotLabel: slotLabelValue,
        capacityTotal: Math.max(0, capacityValue),
        enrolledCount: Math.max(0, enrolledValue),
        attemptsAllowed: Math.max(1, attemptsValue),
        languageMode: languageModeValue,
        examMode: examModeValue,
        negativeMarkingText: negativeMarkingValue,
        testTypeLabel: testTypeValue,
        badgeEnabled: input.badgeEnabled === true,
        badgeText: badgeTextValue,
        validUntil: validUntilValue,
        answerKeyReleaseAt: answerKeyValue,
        resultReleaseAt: resultReleaseValue,
        dynamicDateEnabled: input.dynamicDateEnabled === true,
        dateCycleDays: Math.max(0, dateCycleDaysValue),
        advancedConfig: {
          publishAt: publishAtValue,
          unpublishAt: unpublishAtValue,
          resultVisibility: resultVisibilityValue as 'immediate' | 'after_result_time',
          reattemptCooldownMinutes: Math.max(0, reattemptCooldownValue),
          lateJoinMinutes: Math.max(0, lateJoinValue),
          notifyBeforeMinutes: Math.max(0, notifyBeforeValue),
          resumeEnabled: input.resumeEnabled !== false,
          shuffleQuestions: input.shuffleQuestions === true,
          shuffleOptions: input.shuffleOptions === true,
          fullscreenRequired: input.fullscreenRequired === true,
          copyPasteBlocked: input.copyPasteBlocked === true,
          notifyOnPublish: input.notifyOnPublish !== false,
          sendEmailOnPublish: input.sendEmailOnPublish === true,
          subjectSections: subjectSectionsNormalized,
        },
        testKind: testKindValue as TestKind,
        isPublished: input.isPublished !== false,
        dynamicFluctuationOnPublish: input.dynamicFluctuationOnPublish !== false,
      },
    };
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedQuestionTestId || !items.length) return;
    const match = items.find((item) => item.id === selectedQuestionTestId);
    if (match) {
      loadQuestions(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuestionTestId, items.length]);

  async function load() {
    try {
      setIsRefreshingTests(true);
      const res = await apiClient.get('/admin/tests');
      const mapped = Array.isArray(res.data?.items)
        ? res.data.items.map((x: any) => ({
            ...x,
            dynamic_fluctuation_on_publish: normalizeBoolean(x.dynamic_fluctuation_on_publish, true),
            exam_date: x.exam_date || '',
            total_marks: Number(x.total_marks || 0),
            slot_label: String(x.slot_label || ''),
            capacity_total: Number(x.capacity_total || 0),
            enrolled_count: Number(x.enrolled_count || 0),
            attempts_allowed: Number(x.attempts_allowed || 1),
            language_mode: String(x.language_mode || 'Bilingual'),
            exam_mode: String(x.exam_mode || 'Practice'),
            negative_marking_text: String(x.negative_marking_text || 'No'),
            test_type_label: String(x.test_type_label || 'Full Mock'),
            badge_enabled: normalizeBoolean(x.badge_enabled, false),
            badge_text: String(x.badge_text || 'Live'),
            valid_until: x.valid_until || '',
            answer_key_release_at: x.answer_key_release_at || '',
            result_release_at: x.result_release_at || '',
            dynamic_date_enabled: normalizeBoolean(x.dynamic_date_enabled, false),
            date_cycle_days: Number(x.date_cycle_days || 0),
            advanced_config:
              x.advanced_config && typeof x.advanced_config === 'object'
                ? {
                    publishAt: String(x.advanced_config.publishAt || ''),
                    unpublishAt: String(x.advanced_config.unpublishAt || ''),
                    resultVisibility:
                      String(x.advanced_config.resultVisibility || 'immediate') === 'after_result_time'
                        ? 'after_result_time'
                        : 'immediate',
                    reattemptCooldownMinutes: Number(x.advanced_config.reattemptCooldownMinutes || 0),
                    lateJoinMinutes: Number(x.advanced_config.lateJoinMinutes || 0),
                    notifyBeforeMinutes: Number(x.advanced_config.notifyBeforeMinutes || 0),
                    resumeEnabled: normalizeBoolean(x.advanced_config.resumeEnabled, true),
                    shuffleQuestions: normalizeBoolean(x.advanced_config.shuffleQuestions, false),
                    shuffleOptions: normalizeBoolean(x.advanced_config.shuffleOptions, false),
                    fullscreenRequired: normalizeBoolean(x.advanced_config.fullscreenRequired, false),
                    copyPasteBlocked: normalizeBoolean(x.advanced_config.copyPasteBlocked, false),
                    notifyOnPublish: normalizeBoolean(x.advanced_config.notifyOnPublish, true),
                    sendEmailOnPublish: normalizeBoolean(x.advanced_config.sendEmailOnPublish, false),
                    subjectSections: Array.isArray(x.advanced_config.subjectSections)
                      ? x.advanced_config.subjectSections
                          .filter((s: unknown) => s && typeof s === 'object')
                          .map((s: any) => ({
                            key: String(s.key || '').trim(),
                            label: String(s.label || s.key || '').trim(),
                          }))
                          .slice(0, 40)
                      : [],
                  }
                : null,
          }))
        : [];
      setItems(mapped);
      setSelectedTest((prev) => {
        if (!prev) return prev;
        const next = mapped.find((x: TestItem) => x.id === prev.id);
        return next ?? prev;
      });
      setTestsPage(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load tests');
    } finally {
      setIsRefreshingTests(false);
    }
  }

  function resetTestFormToCreate() {
    setEditingTestId('');
    setTitle('');
    setSlug('');
    setSubcategory('');
    setDurationMinutes('');
    setQuestionCount('');
    setTotalMarks('');
    setExamDate('');
    setSlotLabel('');
    setCapacityTotal('');
    setEnrolledCount('0');
    setAttemptsAllowed('');
    setLanguageMode('');
    setExamMode('');
    setNegativeMarkingText('');
    setTestTypeLabel('');
    setBadgeEnabled(true);
    setBadgeText('');
    setValidUntil('');
    setAnswerKeyReleaseAt('');
    setResultReleaseAt('');
    setDynamicDateEnabled(false);
    setDateCycleDays('0');
    setPublishAt('');
    setUnpublishAt('');
    setResultVisibility('immediate');
    setReattemptCooldownMinutes('0');
    setLateJoinMinutes('0');
    setNotifyBeforeMinutes('0');
    setResumeEnabled(true);
    setShuffleQuestions(false);
    setShuffleOptions(false);
    setFullscreenRequired(false);
    setCopyPasteBlocked(false);
    setNotifyOnPublish(true);
    setSendEmailOnPublish(false);
    setSubjectSectionRows([]);
    setKind('mock');
    setIsPublished(true);
    setDynamicFluctuationOnPublish(true);
  }

  function applyTestToForm(t: TestItem) {
    setTitle(t.title || '');
    setSlug(t.slug || '');
    setSubcategory(t.subcategory || '');
    setKind(t.test_kind || 'mock');
    setDurationMinutes(String(t.duration_minutes ?? ''));
    setQuestionCount(String(t.question_count ?? ''));
    setTotalMarks(String(t.total_marks ?? ''));
    setExamDate(t.exam_date || '');
    setValidUntil(t.valid_until || '');
    setSlotLabel(t.slot_label || '');
    setCapacityTotal(String(t.capacity_total ?? ''));
    setEnrolledCount(String(t.enrolled_count ?? '0'));
    setAttemptsAllowed(String(t.attempts_allowed ?? ''));
    setLanguageMode(t.language_mode || '');
    setExamMode(t.exam_mode || '');
    setNegativeMarkingText(t.negative_marking_text || '');
    setTestTypeLabel(t.test_type_label || '');
    setBadgeEnabled(normalizeBoolean(t.badge_enabled, false));
    setBadgeText(t.badge_text || '');
    setAnswerKeyReleaseAt(toDateTimeLocal(t.answer_key_release_at));
    setResultReleaseAt(toDateTimeLocal(t.result_release_at));
    setDynamicDateEnabled(normalizeBoolean(t.dynamic_date_enabled, false));
    setDateCycleDays(String(t.date_cycle_days ?? '0'));
    setIsPublished(t.is_published !== false);
    setDynamicFluctuationOnPublish(normalizeBoolean(t.dynamic_fluctuation_on_publish, true));
    const ac = t.advanced_config;
    setPublishAt(ac?.publishAt ? toDateTimeLocal(String(ac.publishAt)) : '');
    setUnpublishAt(ac?.unpublishAt ? toDateTimeLocal(String(ac.unpublishAt)) : '');
    setResultVisibility(ac?.resultVisibility === 'after_result_time' ? 'after_result_time' : 'immediate');
    setReattemptCooldownMinutes(String(ac?.reattemptCooldownMinutes ?? '0'));
    setLateJoinMinutes(String(ac?.lateJoinMinutes ?? '0'));
    setNotifyBeforeMinutes(String(ac?.notifyBeforeMinutes ?? '0'));
    setResumeEnabled(normalizeBoolean(ac?.resumeEnabled, true));
    setShuffleQuestions(normalizeBoolean(ac?.shuffleQuestions, false));
    setShuffleOptions(normalizeBoolean(ac?.shuffleOptions, false));
    setFullscreenRequired(normalizeBoolean(ac?.fullscreenRequired, false));
    setCopyPasteBlocked(normalizeBoolean(ac?.copyPasteBlocked, false));
    setNotifyOnPublish(normalizeBoolean(ac?.notifyOnPublish, true));
    setSendEmailOnPublish(normalizeBoolean(ac?.sendEmailOnPublish, false));
    const secs = ac?.subjectSections;
    setSubjectSectionRows(
      Array.isArray(secs) && secs.length
        ? (secs as SubjectSectionRow[]).map((s) => ({
            key: String(s.key || ''),
            label: String(s.label || s.key || ''),
          }))
        : [],
    );
  }

  function cancelEditTest() {
    resetTestFormToCreate();
  }

  async function handleTestFormSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = normalizeAndValidateTestPayload({
      title,
      slug,
      subcategory,
      durationMinutes,
      questionCount,
      totalMarks,
      examDate,
      slotLabel,
      capacityTotal,
      enrolledCount,
      attemptsAllowed,
      languageMode,
      examMode,
      negativeMarkingText,
      testTypeLabel,
      badgeEnabled,
      badgeText,
      validUntil,
      answerKeyReleaseAt,
      resultReleaseAt,
      dynamicDateEnabled,
      dateCycleDays,
      publishAt,
      unpublishAt,
      resultVisibility,
      reattemptCooldownMinutes,
      lateJoinMinutes,
      notifyBeforeMinutes,
      resumeEnabled,
      shuffleQuestions,
      shuffleOptions,
      fullscreenRequired,
      copyPasteBlocked,
      notifyOnPublish,
      sendEmailOnPublish,
      testKind: kind,
      isPublished,
      dynamicFluctuationOnPublish,
      subjectSectionRows,
    });
    if (parsed.error) {
      pushToast('error', parsed.error);
      return;
    }
    if (!parsed.value) {
      pushToast('error', 'Failed to prepare test payload');
      return;
    }
    const data = parsed.value;
    try {
      if (editingTestId) {
        await apiClient.patch(`/admin/tests/${editingTestId}`, data);
        pushToast('success', `Test "${data.title}" updated successfully.`);
      } else {
        await apiClient.post('/admin/tests', data);
        pushToast('success', `Test "${data.title}" created successfully.`);
      }
      resetTestFormToCreate();
      await load();
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || (editingTestId ? 'Failed to update test' : 'Failed to create test'));
    }
  }

  async function deleteTest(id: string) {
    const ok = await adminConfirm({
      title: 'Delete test?',
      message: 'This test and its configuration will be removed. You can cancel if you are unsure.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const target = items.find((x) => x.id === id);
      await apiClient.delete(`/admin/tests/${id}`);
      if (editingTestId === id) resetTestFormToCreate();
      pushToast('success', `Test "${target?.title || id}" deleted successfully.`);
      await load();
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to delete test');
    }
  }

  async function applyLiveBadgeToPublishedTests() {
    const text = await adminPrompt({
      title: 'Badge text for published tests',
      description: 'Shown on published tests when live badge is enabled.',
      defaultValue: badgeText || 'Live',
      placeholder: 'e.g. Live',
      confirmLabel: 'Apply',
      cancelLabel: 'Cancel',
    });
    if (text === null) return;
    const finalText = text.trim() || 'Live';
    try {
      const res = await apiClient.post('/admin/tests/badge/bulk-live', {
        badgeText: finalText,
        onlyPublished: true,
      });
      const updatedCount = Number(res.data?.updatedCount || 0);
      setBadgeEnabled(true);
      setBadgeText(finalText);
      await load();
      pushToast('success', `Live badge applied to ${updatedCount} published test(s).`);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to apply live badge to published tests');
    }
  }

  async function loadQuestions(test: TestItem) {
    try {
      setSelectedTest(test);
      if (mode === 'questionBuilder') {
        onSelectQuestionTest(test.id);
      }
      const res = await apiClient.get(`/admin/tests/${test.id}/questions`);
      const nextItems = Array.isArray(res.data?.items) ? res.data.items : [];
      setQuestions(nextItems);
      setQuestionsPage(1);
      setEditingQuestionId(null);
      setQuestionForm({
        stem: '',
        choiceA: '',
        choiceB: '',
        choiceC: '',
        choiceD: '',
        correctIndex: '0',
        explanation: '',
        isPublished: true,
        subjectKey: '',
      });
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load questions');
    }
  }

  async function submitQuestion(e: FormEvent) {
    e.preventDefault();
    if (!selectedTest) {
      pushToast('error', 'Select a test first');
      return;
    }
    const stem = questionForm.stem.trim();
    const choiceA = questionForm.choiceA.trim();
    const choiceB = questionForm.choiceB.trim();
    const choiceC = questionForm.choiceC.trim();
    const choiceD = questionForm.choiceD.trim();
    const correctIndex = Number(questionForm.correctIndex);
    const explanation = questionForm.explanation.trim();
    if (!stem) {
      pushToast('error', 'Question statement is required');
      return;
    }
    if (!choiceA || !choiceB || !choiceC || !choiceD) {
      pushToast('error', 'All four options are required');
      return;
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      pushToast('error', 'Please select a valid correct answer');
      return;
    }
    const allowedSubjects = normalizeSubjectSectionsForSubmit(selectedTest.advanced_config?.subjectSections ?? []);
    let subjectKeyOut = '';
    if (allowedSubjects.length > 0) {
      const parsedSk = normalizeQuestionSubjectKeyInput(questionForm.subjectKey);
      if (!parsedSk.value) {
        pushToast('error', 'Select a subject for this question — this test requires subject tags.');
        return;
      }
      subjectKeyOut = parsedSk.value;
    } else {
      const parsedSk = normalizeQuestionSubjectKeyInput(questionForm.subjectKey);
      if (parsedSk.error) {
        pushToast('error', parsedSk.error);
        return;
      }
      subjectKeyOut = parsedSk.value;
    }
    const createPosition = Number(nextQuestionPositionFrom(questions));
    const editingPosition = Number(
      questions.find((item) => item.id === editingQuestionId)?.position || 0,
    );
    const safePosition = editingQuestionId
      ? (Number.isInteger(editingPosition) && editingPosition > 0 ? editingPosition : 1)
      : (Number.isInteger(createPosition) && createPosition > 0 ? createPosition : 1);
    const payload = {
      position: safePosition,
      stem,
      choiceA,
      choiceB,
      choiceC,
      choiceD,
      correctIndex,
      explanation,
      isPublished: questionForm.isPublished,
      subjectKey: subjectKeyOut,
    };
    try {
      if (editingQuestionId) {
        await apiClient.patch(`/admin/tests/${selectedTest.id}/questions/${editingQuestionId}`, payload);
      } else {
        await apiClient.post(`/admin/tests/${selectedTest.id}/questions`, payload);
      }
      await loadQuestions(selectedTest);
      pushToast(
        'success',
        editingQuestionId ? 'Question updated successfully.' : 'Question added to bank successfully.',
      );
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save question');
    }
  }

  function startEditQuestion(item: QuestionItem) {
    if (item.id < 0) return;
    setShowQuestionForm(true);
    setEditingQuestionId(item.id);
    setQuestionForm({
      stem: item.stem,
      choiceA: item.choice_a,
      choiceB: item.choice_b,
      choiceC: item.choice_c,
      choiceD: item.choice_d,
      correctIndex: String(item.correct_index),
      explanation: item.explanation || '',
      isPublished: normalizeBoolean(item.is_published, true),
      subjectKey: String(item.subject_key || '').trim(),
    });
  }

  async function importQuestionsBulk() {
    if (!selectedTest) {
      pushToast('error', 'Please select a test first.');
      return;
    }
    if (!bulkImportText.trim()) {
      const msg = 'Please paste CSV/Excel/JSON data before importing.';
      pushToast('error', msg);
      return;
    }
    const parsed = parseQuestionImportText(bulkImportFormat, bulkImportText);
    if (parsed.error) {
      pushToast('error', parsed.error);
      return;
    }
    try {
      setIsImportingQuestions(true);
      const res = await apiClient.post(`/admin/tests/${selectedTest.id}/questions/import`, {
        mode: bulkImportMode,
        items: parsed.value,
      });
      const inserted = Number(res.data?.inserted || 0);
      setBulkImportText('');
      setBulkImportOpen(false);
      pushToast('success', `Imported ${inserted} question(s) successfully.`);
      await loadQuestions(selectedTest);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to import questions';
      pushToast('error', msg);
    } finally {
      setIsImportingQuestions(false);
    }
  }

  async function deleteQuestion(questionId: number) {
    if (questionId < 0) return;
    if (!selectedTest) return;
    const ok = await adminConfirm({
      title: 'Delete this question?',
      message: `This question will be removed from "${selectedTest.title}".`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/admin/tests/${selectedTest.id}/questions/${questionId}`);
      await loadQuestions(selectedTest);
      pushToast('success', 'Question deleted successfully.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to delete question');
    }
  }
  const displayedQuestions = questions;

  const visibleItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.title.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q);
  });
  const subcategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => String(item.subcategory || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const subcategoryListId = useId();
  const totalTestsPages = Math.max(1, Math.ceil(visibleItems.length / TESTS_PER_PAGE));
  const safeTestsPage = Math.min(testsPage, totalTestsPages);
  const pagedVisibleItems = useMemo(() => {
    const start = (safeTestsPage - 1) * TESTS_PER_PAGE;
    return visibleItems.slice(start, start + TESTS_PER_PAGE);
  }, [safeTestsPage, visibleItems]);

  const totalQuestionsPages = Math.max(1, Math.ceil(displayedQuestions.length / QUESTIONS_PER_PAGE));
  const safeQuestionsPage = Math.min(questionsPage, totalQuestionsPages);
  const pagedQuestions = useMemo(() => {
    const start = (safeQuestionsPage - 1) * QUESTIONS_PER_PAGE;
    return displayedQuestions.slice(start, start + QUESTIONS_PER_PAGE);
  }, [displayedQuestions, safeQuestionsPage]);
  const filteredQuestionBuilderItems = useMemo(() => {
    const q = questionBuilderSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const title = String(item.title || '').toLowerCase();
      const slug = String(item.slug || '').toLowerCase();
      const kindText = String(item.test_kind || '').toLowerCase();
      return title.includes(q) || slug.includes(q) || kindText.includes(q);
    });
  }, [items, questionBuilderSearch]);
  const selectedOpsTest = useMemo(() => items.find((x) => x.id === opsTestId) || null, [items, opsTestId]);
  const questionBuilderSubjectOptions = useMemo(
    () => normalizeSubjectSectionsForSubmit(selectedTest?.advanced_config?.subjectSections ?? []),
    [selectedTest?.advanced_config?.subjectSections],
  );

  return (
    <section className={`panel-card ${mode === 'allTests' ? 'all-tests-panel' : ''}`}>
      <div className="panel-head">
        <h3>{mode === 'allTests' ? 'Manage All Tests' : 'Manage Questions'}</h3>
        {mode === 'allTests' && (
          <button
            type="button"
            className="all-tests-plus-btn"
            onClick={() => setAdvancedOpen((p) => !p)}
            title={advancedOpen ? 'Hide advanced test settings' : 'Show advanced test settings'}
            aria-label={advancedOpen ? 'Hide advanced test settings' : 'Show advanced test settings'}
          >
            {advancedOpen ? '−' : '+'}
          </button>
        )}
      </div>
      {mode === 'allTests' && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Home category mapping tip: keep the same <b>Subcategory</b> for related exams (e.g. Patwari), and keep each
            <b> Test title</b> unique (e.g. Patwari - HP, Patwari - Punjab) so users can choose the correct exam.
          </p>
          <form
            ref={testFormRef}
            onSubmit={handleTestFormSubmit}
            className={`all-tests-create${editingTestId ? ' all-tests-create--editing' : ''}`}
          >
            {editingTestId && (
              <p className="all-tests-edit-banner" role="status">
                Editing test — use <b>Save changes</b> below, or <b>Cancel edit</b> to discard.
              </p>
            )}
            <div className="all-tests-section">
              <h4>Basic</h4>
              <div className="all-tests-grid">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Test title" required />
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="test-slug" required />
                <input
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  placeholder="Subcategory"
                  list={subcategoryListId}
                />
                <datalist id={subcategoryListId}>
                  {subcategoryOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <select value={kind} onChange={(e) => setKind(e.target.value as TestKind)}>
                  <option value="mock">Mock</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>
            </div>

            <div className="all-tests-section">
              <h4>Schedule & Stats</h4>
              <div className="all-tests-grid">
                <label className="all-tests-field">
                  <span>Exam Date</span>
                  <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                </label>
                <label className="all-tests-field">
                  <span>Valid Until</span>
                  <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                </label>
                <input value={slotLabel} onChange={(e) => setSlotLabel(e.target.value)} placeholder="Slot label (e.g. 09:30 AM)" />
                <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="Duration (minutes)" />
                <input type="number" value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} placeholder="Question count" />
                <input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} placeholder="Total marks" />
              </div>
            </div>

            <div className="all-tests-section">
              <h4>Capacity & Rules</h4>
              <div className="all-tests-grid">
                <input type="number" value={capacityTotal} onChange={(e) => setCapacityTotal(e.target.value)} placeholder="Capacity (e.g. 500)" />
                <input
                  type="number"
                  value={enrolledCount}
                  onChange={(e) => setEnrolledCount(e.target.value)}
                  placeholder="Enrolled count (auto)"
                  readOnly
                  title="Auto-managed from user applications"
                />
                <input type="number" value={attemptsAllowed} onChange={(e) => setAttemptsAllowed(e.target.value)} placeholder="Attempts allowed" />
                <input value={languageMode} onChange={(e) => setLanguageMode(e.target.value)} placeholder="Language mode" />
                <input value={examMode} onChange={(e) => setExamMode(e.target.value)} placeholder="Exam mode" />
                <input value={negativeMarkingText} onChange={(e) => setNegativeMarkingText(e.target.value)} placeholder="Negative marking" />
                <input value={testTypeLabel} onChange={(e) => setTestTypeLabel(e.target.value)} placeholder="Test type label" />
                <input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Badge text (e.g. Live)" />
              </div>
            </div>

            {advancedOpen && (
              <div className="all-tests-section">
                <h4>Advanced Controls</h4>
                <div className="all-tests-grid all-tests-advanced-grid">
                  <div
                    id="admin-subject-sections"
                    className="all-tests-subject-sections"
                    style={{ gridColumn: '1 / -1' }}
                  >
                    {subjectSectionRows.map((row, idx) => (
                      <div
                        key={`subj-${idx}-${row.key}`}
                        className="all-tests-grid"
                        style={{ marginBottom: 8, alignItems: 'end' }}
                      >
                        <label className="all-tests-field">
                          <span>Key</span>
                          <input
                            value={row.key}
                            onChange={(e) => {
                              const next = [...subjectSectionRows];
                              next[idx] = { ...next[idx], key: e.target.value };
                              setSubjectSectionRows(next);
                            }}
                            placeholder="e.g. math"
                            maxLength={48}
                            autoComplete="off"
                          />
                        </label>
                        <label className="all-tests-field">
                          <span>Label (shown in Question Builder)</span>
                          <input
                            value={row.label}
                            onChange={(e) => {
                              const next = [...subjectSectionRows];
                              next[idx] = { ...next[idx], label: e.target.value };
                              setSubjectSectionRows(next);
                            }}
                            placeholder="e.g. Mathematics"
                            maxLength={120}
                            autoComplete="off"
                          />
                        </label>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setSubjectSectionRows(subjectSectionRows.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setSubjectSectionRows([...subjectSectionRows, { key: '', label: '' }])}
                      disabled={subjectSectionRows.length >= 40}
                    >
                      + Add subject
                    </button>
                  </div>
                  <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} placeholder="Publish at" />
                  <input type="datetime-local" value={unpublishAt} onChange={(e) => setUnpublishAt(e.target.value)} placeholder="Unpublish at" />
                  <select value={resultVisibility} onChange={(e) => setResultVisibility(e.target.value as 'immediate' | 'after_result_time')}>
                    <option value="immediate">Result visibility: immediate</option>
                    <option value="after_result_time">Result visibility: after result time</option>
                  </select>
                  <input
                    type="number"
                    value={reattemptCooldownMinutes}
                    onChange={(e) => setReattemptCooldownMinutes(e.target.value)}
                    placeholder="Reattempt cooldown (minutes)"
                  />
                  <input type="number" value={lateJoinMinutes} onChange={(e) => setLateJoinMinutes(e.target.value)} placeholder="Late join window (minutes)" />
                  <input
                    type="number"
                    value={notifyBeforeMinutes}
                    onChange={(e) => setNotifyBeforeMinutes(e.target.value)}
                    placeholder="Notify before exam (minutes)"
                  />
                  <label className="all-tests-field">
                    <span>Answer Key Release At</span>
                    <input
                      type="datetime-local"
                      value={answerKeyReleaseAt}
                      onChange={(e) => setAnswerKeyReleaseAt(e.target.value)}
                      placeholder="Answer key release"
                    />
                  </label>
                  <label className="all-tests-field">
                    <span>Result Release At</span>
                    <input
                      type="datetime-local"
                      value={resultReleaseAt}
                      onChange={(e) => setResultReleaseAt(e.target.value)}
                      placeholder="Result release"
                    />
                  </label>
                  <label className="check-wrap">
                    <input type="checkbox" checked={resumeEnabled} onChange={(e) => setResumeEnabled(e.target.checked)} />
                    resume enabled
                  </label>
                  <label className="check-wrap">
                    <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} />
                    shuffle questions
                  </label>
                  <label className="check-wrap">
                    <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} />
                    shuffle options
                  </label>
                  <label className="check-wrap">
                    <input type="checkbox" checked={fullscreenRequired} onChange={(e) => setFullscreenRequired(e.target.checked)} />
                    fullscreen required
                  </label>
                  <label className="check-wrap">
                    <input type="checkbox" checked={copyPasteBlocked} onChange={(e) => setCopyPasteBlocked(e.target.checked)} />
                    block copy/paste
                  </label>
                  <label className="check-wrap">
                    <input type="checkbox" checked={notifyOnPublish} onChange={(e) => setNotifyOnPublish(e.target.checked)} />
                    notify on publish
                  </label>
                  <label className="check-wrap">
                    <input type="checkbox" checked={sendEmailOnPublish} onChange={(e) => setSendEmailOnPublish(e.target.checked)} />
                    send email on publish
                  </label>
                </div>
              </div>
            )}

            <div className="all-tests-actions">
              <label className="check-wrap">
                <input type="checkbox" checked={dynamicDateEnabled} onChange={(e) => setDynamicDateEnabled(e.target.checked)} />
                dynamic date
              </label>
              <input type="number" value={dateCycleDays} onChange={(e) => setDateCycleDays(e.target.value)} placeholder="Date cycle days" />
              <label className="check-wrap">
                <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                published
              </label>
              <label className="check-wrap">
                <input
                  type="checkbox"
                  checked={dynamicFluctuationOnPublish}
                  onChange={(e) => setDynamicFluctuationOnPublish(e.target.checked)}
                />
                dynamic fluctuation
              </label>
              <label className="check-wrap">
                <input type="checkbox" checked={badgeEnabled} onChange={(e) => setBadgeEnabled(e.target.checked)} />
                show badge
              </label>
              {editingTestId ? (
                <>
                  <button type="button" className="ghost" onClick={cancelEditTest}>
                    Cancel edit
                  </button>
                  <button type="submit">Save changes</button>
                </>
              ) : (
                <></>
              )}
            </div>
            {!editingTestId && (
              <div className="all-tests-add-center">
                <button type="submit">Add Test</button>
              </div>
            )}
          </form>
          <div className="inline-form all-tests-tools">
            <button type="button" className="all-tests-refresh" onClick={load}>
              {isRefreshingTests ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Refreshing...
                </>
              ) : (
                'Refresh Tests'
              )}
            </button>
            <button type="button" className="ghost" onClick={applyLiveBadgeToPublishedTests}>
              Apply Live Badge (Published)
            </button>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setTestsPage(1);
              }}
              placeholder="Search tests..."
            />
          </div>
          <div className="all-tests-ops">
            <div className="all-tests-ops-head">
              <h4>Test Operations</h4>
              <p>Use these shortcuts for scheduling, notifications, and reporting workflows.</p>
            </div>
            <div className="all-tests-ops-grid">
              <select value={opsTestId} onChange={(e) => setOpsTestId(e.target.value)}>
                <option value="">Select test context (optional)</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({item.slug})
                  </option>
                ))}
              </select>
              <button type="button" className="ghost" onClick={() => onNavigateTab?.('publishScheduling')}>
                Open Publish Scheduling
              </button>
              <button type="button" className="ghost" onClick={() => onNavigateTab?.('notificationScheduling')}>
                Open Notification Scheduling
              </button>
              <button type="button" className="ghost" onClick={() => onNavigateTab?.('analyticsInsights')}>
                Open Test Insights
              </button>
              <button type="button" className="ghost" onClick={() => onNavigateTab?.('userManagementAdvanced')}>
                Open User Reports
              </button>
              <button
                type="button"
                className="ghost"
                disabled={!selectedOpsTest}
                onClick={() => {
                  if (!selectedOpsTest) return;
                  onSelectQuestionTest(selectedOpsTest.id);
                  onNavigateTab?.('questionBuilder');
                }}
              >
                Open Selected In Question Builder
              </button>
            </div>
            <p className="muted all-tests-ops-note">
              {selectedOpsTest
                ? `Selected: ${selectedOpsTest.title} (${selectedOpsTest.slug}) - use this context while scheduling or reviewing reports.`
                : 'Tip: choose a test above so admins know exactly which test they are operating on.'}
            </p>
          </div>
        </>
      )}

      {mode === 'questionBuilder' && (
        <div className="inline-form">
          <input
            value={questionBuilderSearch}
            onChange={(e) => setQuestionBuilderSearch(e.target.value)}
            placeholder="Search test in question builder..."
          />
          <select
            value={selectedTest?.id || ''}
            onChange={(e) => {
              const test = items.find((x) => x.id === e.target.value);
              if (test) loadQuestions(test);
            }}
          >
            <option value="">Select Test</option>
            {filteredQuestionBuilderItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.test_kind})
              </option>
            ))}
          </select>
          <button onClick={load}>Refresh Tests</button>
        </div>
      )}

      {mode === 'allTests' && (
        <>
          <div className="list table tests-table">
            <div className="row row-head">
              <span>Title</span>
              <span>Slug</span>
              <span>Type</span>
              <span>Status</span>
              <span>Fluctuation</span>
              <span>Actions</span>
              <span />
            </div>
            {pagedVisibleItems.map((item) => (
              <div key={item.id} className="row">
                <span>
                  {item.title}
                  <br />
                  {item.subcategory || '-'}
                </span>
                <span>
                  {item.slug}
                  <br />
                  {item.exam_date || '-'}
                </span>
                <span>
                  {item.test_kind}
                  <br />
                  {item.duration_minutes} min · {item.question_count} Q
                </span>
                <span>
                  {item.is_published ? 'Published' : 'Hidden'}
                  <br />
                  {item.enrolled_count || 0}/{item.capacity_total || 0}
                </span>
                <span>
                  {item.dynamic_fluctuation_on_publish ? 'Fluctuation: On' : 'Fluctuation: Off'}
                  <br />
                  {item.dynamic_date_enabled ? `Date: On (${item.date_cycle_days || 0}d)` : 'Date: Off'}
                  <br />
                  {item.badge_enabled ? `Badge: ${item.badge_text || 'Live'}` : 'Badge: Off'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    applyTestToForm(item);
                    setEditingTestId(item.id);
                    setAdvancedOpen(true);
                    window.setTimeout(() => {
                      testFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 0);
                  }}
                >
                  Edit
                </button>
                <div className="inline-form">
                  <button type="button" onClick={() => loadQuestions(item)}>
                    Open Builder
                  </button>
                  <button type="button" className="danger" onClick={() => deleteTest(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="pagination-wrap">
            <span>
              Page {safeTestsPage} of {totalTestsPages}
            </span>
            <div className="inline-form pagination-controls">
              <button type="button" className="ghost" onClick={() => setTestsPage((p) => Math.max(1, p - 1))} disabled={safeTestsPage === 1}>
                Previous
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setTestsPage((p) => Math.min(totalTestsPages, p + 1))}
                disabled={safeTestsPage === totalTestsPages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {mode === 'questionBuilder' && (
        <div className="question-builder">
          <div className="panel-head">
            <div>
              <h3>Question Builder</h3>
              <span>{selectedTest ? `Selected: ${selectedTest.title}` : ''}</span>
            </div>
          </div>
          <div className="qb-create-card">
            <button
              type="button"
              className="qb-create-toggle"
              onClick={() => {
                setShowQuestionForm((p) => !p);
                setEditingQuestionId(null);
                setQuestionForm((prev) => ({
                  ...prev,
                }));
              }}
            >
              <span className="qb-create-label">Create New Question</span>
              <span className="qb-toggle-icon" aria-hidden="true">
                {showQuestionForm ? 'x' : '+'}
              </span>
            </button>

            {showQuestionForm && (
              <form onSubmit={submitQuestion} className="question-form">
                <label>
                  Target Category / Test
                  <select
                    value={selectedTest?.id || ''}
                    onChange={(e) => {
                      const test = items.find((x) => x.id === e.target.value);
                      if (test) loadQuestions(test);
                    }}
                    required
                  >
                    <option value="">Select Test</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.test_kind})
                      </option>
                    ))}
                  </select>
                </label>
                {selectedTest && questionBuilderSubjectOptions.length > 0 ? (
                  <label>
                    Subject
                    <select
                      value={questionForm.subjectKey}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, subjectKey: e.target.value }))}
                      required
                    >
                      <option value="">Select subject…</option>
                      {questionForm.subjectKey &&
                        editingQuestionId &&
                        !questionBuilderSubjectOptions.some((s) => s.key === questionForm.subjectKey) && (
                          <option value={questionForm.subjectKey}>
                            {questionForm.subjectKey} (update test subjects or change tag)
                          </option>
                        )}
                      {questionBuilderSubjectOptions.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label} ({s.key})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : selectedTest ? (
                  <p className="muted" style={{ margin: '0 0 8px' }}>
                    Optional subject tagging: add subjects under <b>All Tests → Advanced (+)</b>, save the test, then pick a subject here.
                  </p>
                ) : null}
                <label>
                  Question Statement
                  <textarea
                    value={questionForm.stem}
                    onChange={(e) => setQuestionForm((p) => ({ ...p, stem: e.target.value }))}
                    placeholder="Write your question here..."
                    required
                  />
                </label>
                <div className="qb-option-grid">
                  <label>
                    <span className="qb-option-label">A</span>
                    <input
                      value={questionForm.choiceA}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceA: e.target.value }))}
                      placeholder="Option A"
                      required
                    />
                  </label>
                  <label>
                    <span className="qb-option-label">B</span>
                    <input
                      value={questionForm.choiceB}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceB: e.target.value }))}
                      placeholder="Option B"
                      required
                    />
                  </label>
                  <label>
                    <span className="qb-option-label">C</span>
                    <input
                      value={questionForm.choiceC}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceC: e.target.value }))}
                      placeholder="Option C"
                      required
                    />
                  </label>
                  <label>
                    <span className="qb-option-label">D</span>
                    <input
                      value={questionForm.choiceD}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, choiceD: e.target.value }))}
                      placeholder="Option D"
                      required
                    />
                  </label>
                </div>
                <div className="qb-form-bottom">
                  <label>
                    Correct Answer
                    <select
                      value={questionForm.correctIndex}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, correctIndex: e.target.value }))}
                    >
                      <option value="0">Option A</option>
                      <option value="1">Option B</option>
                      <option value="2">Option C</option>
                      <option value="3">Option D</option>
                    </select>
                  </label>
                  <label>
                    Explanation (Optional)
                    <textarea
                      value={questionForm.explanation}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, explanation: e.target.value }))}
                      placeholder="Explanation"
                    />
                  </label>
                  <label className="check-wrap qb-publish-toggle">
                    <input
                      type="checkbox"
                      checked={questionForm.isPublished}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, isPublished: e.target.checked }))}
                    />
                    publish this question
                  </label>
                  <div className="inline-form">
                    <button type="submit" disabled={!selectedTest}>
                      {editingQuestionId ? 'Update Question' : 'Add to Question Bank'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingQuestionId(null);
                        setQuestionForm({
                          stem: '',
                          choiceA: '',
                          choiceB: '',
                          choiceC: '',
                          choiceD: '',
                          correctIndex: '0',
                          explanation: '',
                          isPublished: true,
                          subjectKey: '',
                        });
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          <div className="qb-create-card">
            <button type="button" className="qb-create-toggle" onClick={() => setBulkImportOpen((p) => !p)}>
              <span className="qb-create-label">Bulk Upload / Import</span>
              <span className="qb-toggle-icon" aria-hidden="true">
                {bulkImportOpen ? 'x' : '+'}
              </span>
            </button>
            {bulkImportOpen && (
              <div className="question-form">
                <div className="inline-form">
                  <select value={bulkImportFormat} onChange={(e) => setBulkImportFormat(e.target.value as 'csv' | 'excel' | 'json')}>
                    <option value="csv">CSV</option>
                    <option value="excel">Excel (tab separated paste)</option>
                    <option value="json">JSON array</option>
                  </select>
                  <select value={bulkImportMode} onChange={(e) => setBulkImportMode(e.target.value as 'append' | 'replace')}>
                    <option value="append">Append</option>
                    <option value="replace">Replace Existing</option>
                  </select>
                </div>
                <textarea
                  value={bulkImportText}
                  onChange={(e) => {
                    setBulkImportText(e.target.value);
                  }}
                  placeholder={
                    bulkImportFormat === 'json'
                      ? `JSON array. Optional: subjectKey (or subject_key).

Example (subject-less):
[{"position":1,"stem":"Q?","choiceA":"A","choiceB":"B","choiceC":"C","choiceD":"D","correctIndex":0,"explanation":"","isPublished":true}]

Example (subject-wise):
[{"position":1,"subjectKey":"math","stem":"Q?","choiceA":"A","choiceB":"B","choiceC":"C","choiceD":"D","correctIndex":0,"explanation":"","isPublished":true}]`
                      : 'Headers: position,subjectKey(or subject_key),stem,choiceA,choiceB,choiceC,choiceD,correctIndex,explanation,isPublished'
                  }
                  className="qb-import-textarea"
                />
                <div className="inline-form">
                  <button type="button" disabled={!selectedTest || isImportingQuestions} onClick={importQuestionsBulk}>
                    {isImportingQuestions ? 'Importing...' : 'Import Questions'}
                  </button>
                </div>
              </div>
            )}
          </div>

        <div className="list table questions-table">
          <div className="row row-head">
            <span>Pos</span>
            <span>Subject</span>
            <span>Question</span>
            <span>Status</span>
            <span>Answer</span>
            <span>Option A</span>
            <span>Option B</span>
            <span>Option C</span>
            <span>Option D</span>
            <span>Action</span>
          </div>
          {pagedQuestions.map((q) => (
            <div key={q.id} className="row">
              <span>{q.position}</span>
              <span title={q.subject_key || ''}>{q.subject_key ? String(q.subject_key) : '—'}</span>
              <span>{q.stem}</span>
              <span>{normalizeBoolean(q.is_published, true) ? 'Published' : 'Draft'}</span>
              <span>{['A', 'B', 'C', 'D'][q.correct_index] || '-'}</span>
              <span>{q.choice_a}</span>
              <span>{q.choice_b}</span>
              <span>{q.choice_c}</span>
              <span>{q.choice_d}</span>
              <div className="inline-form qb-action-buttons">
                <button type="button" title={q.id < 0 ? 'Demo entry' : 'Edit'} aria-label={q.id < 0 ? 'Demo entry' : 'Edit'} onClick={() => startEditQuestion(q)} disabled={q.id < 0}>
                  <span aria-hidden="true">✎</span>
                </button>
                <button type="button" className="danger" title={q.id < 0 ? 'Demo entry' : 'Delete'} aria-label={q.id < 0 ? 'Demo entry' : 'Delete'} onClick={() => deleteQuestion(q.id)} disabled={q.id < 0}>
                  <span aria-hidden="true">🗑</span>
                </button>
              </div>
            </div>
          ))}
          {!pagedQuestions.length && (
            <div className="row">
              <span>-</span>
              <span>-</span>
              <span>{selectedTest ? 'No questions found for this test yet.' : 'Select a test to view questions.'}</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
            </div>
          )}
        </div>
        <div className="pagination-wrap">
          <span>
            Page {safeQuestionsPage} of {totalQuestionsPages}
          </span>
          <div className="inline-form pagination-controls">
            <button
              type="button"
              className="ghost"
              onClick={() => setQuestionsPage((p) => Math.max(1, p - 1))}
              disabled={safeQuestionsPage === 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setQuestionsPage((p) => Math.min(totalQuestionsPages, p + 1))}
              disabled={safeQuestionsPage === totalQuestionsPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      )}
    </section>
  );
}

function DailyDigestTab({ apiClient }: { apiClient: typeof api }) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm } = useAdminDialog();
  const [items, setItems] = useState<DailyDigestItem[]>([]);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctIndex, setCorrectIndex] = useState('0');
  const [factText, setFactText] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [notifyUsers, setNotifyUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState('');
  const [dailyReleaseHour, setDailyReleaseHour] = useState('10');
  const [dailyReleaseMinute, setDailyReleaseMinute] = useState('0');
  const [dailyTimezoneOffset, setDailyTimezoneOffset] = useState('330');
  const DIGEST_LIST_PER_PAGE = 15;
  const [digestListPage, setDigestListPage] = useState(1);

  useEffect(() => {
    setDigestListPage(1);
  }, [search]);

  async function load() {
    try {
      const [digestRes, settingsRes] = await Promise.all([
        apiClient.get('/admin/digest'),
        apiClient.get('/admin/settings'),
      ]);
      setItems(digestRes.data?.items || []);
      const schedule = settingsRes.data?.settings?.dailyQuizSettings || {};
      setDailyReleaseHour(String(Math.max(0, Math.min(23, Number(schedule.releaseHour ?? 10)))));
      setDailyReleaseMinute(String(Math.max(0, Math.min(59, Number(schedule.releaseMinute ?? 0)))));
      setDailyTimezoneOffset(String(Math.max(-720, Math.min(840, Number(schedule.timezoneOffsetMinutes ?? 330)))));
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load daily digest items');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saveDailySchedule() {
    try {
      await apiClient.patch('/admin/settings', {
        dailyQuizSettings: {
          releaseHour: Number(dailyReleaseHour || '10'),
          releaseMinute: Number(dailyReleaseMinute || '0'),
          timezoneOffsetMinutes: Number(dailyTimezoneOffset || '330'),
        },
      });
      await load();
      pushToast('success', 'Daily quiz schedule saved.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save daily quiz schedule');
    }
  }
  async function createDigestItem(e: FormEvent) {
    e.preventDefault();
    try {
      await apiClient.post('/admin/digest', {
        questionPrompt,
        optionA,
        optionB,
        optionC,
        optionD,
        correctIndex: Number(correctIndex),
        factText,
        isPublished,
        notifyUsers,
      });
      setQuestionPrompt('');
      setOptionA('');
      setOptionB('');
      setOptionC('');
      setOptionD('');
      setCorrectIndex('0');
      setFactText('');
      setIsPublished(true);
      setNotifyUsers(true);
      await load();
      pushToast('success', 'Digest item added.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to create daily digest item');
    }
  }
  async function saveDigestItem(item: DailyDigestItem) {
    try {
      await apiClient.patch(`/admin/digest/${item.id}`, {
        questionPrompt: item.question_prompt,
        optionA: item.option_a,
        optionB: item.option_b,
        optionC: item.option_c,
        optionD: item.option_d,
        correctIndex: item.correct_index,
        factText: item.fact_text,
        isPublished: item.is_published,
        notifyUsers,
      });
      setEditingId('');
      await load();
      pushToast('success', 'Digest item updated.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to update daily digest item');
    }
  }

  async function deleteDigestItem(id: string) {
    const ok = await adminConfirm({
      title: 'Delete daily digest item?',
      message: 'This question + fact entry will be removed from the digest list.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/admin/digest/${id}`);
      await load();
      pushToast('success', 'Digest item deleted.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to delete daily digest item');
    }
  }

  const visibleItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.question_prompt.toLowerCase().includes(q) || item.fact_text.toLowerCase().includes(q);
  });
  const totalDigestPages = Math.max(1, Math.ceil(visibleItems.length / DIGEST_LIST_PER_PAGE));
  const safeDigestPage = Math.min(digestListPage, totalDigestPages);
  const digestRangeStart = visibleItems.length === 0 ? 0 : (safeDigestPage - 1) * DIGEST_LIST_PER_PAGE + 1;
  const digestRangeEnd = Math.min(safeDigestPage * DIGEST_LIST_PER_PAGE, visibleItems.length);
  const pagedDigestItems = useMemo(() => {
    const start = (safeDigestPage - 1) * DIGEST_LIST_PER_PAGE;
    return visibleItems.slice(start, start + DIGEST_LIST_PER_PAGE);
  }, [safeDigestPage, visibleItems]);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Daily Digest (Question of the Day + Fact of the Day)</h3>
      </div>
      <form onSubmit={createDigestItem} className="question-form">
        <input value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} placeholder="Question prompt" required />
        <input value={optionA} onChange={(e) => setOptionA(e.target.value)} placeholder="Option A" required />
        <input value={optionB} onChange={(e) => setOptionB(e.target.value)} placeholder="Option B" required />
        <input value={optionC} onChange={(e) => setOptionC(e.target.value)} placeholder="Option C" required />
        <input value={optionD} onChange={(e) => setOptionD(e.target.value)} placeholder="Option D" required />
        <select value={correctIndex} onChange={(e) => setCorrectIndex(e.target.value)}>
          <option value="0">Correct: A</option>
          <option value="1">Correct: B</option>
          <option value="2">Correct: C</option>
          <option value="3">Correct: D</option>
        </select>
        <input value={factText} onChange={(e) => setFactText(e.target.value)} placeholder="Fact of the day" required />
        <label className="check-wrap">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          published
        </label>
        <label className="check-wrap">
          <input type="checkbox" checked={notifyUsers} onChange={(e) => setNotifyUsers(e.target.checked)} />
          send auto notification
        </label>
        <div className="inline-form">
          <button type="submit">Add Digest Item</button>
        </div>
      </form>
      <div className="inline-form" style={{ marginBottom: 8 }}>
        <input
          type="number"
          min={0}
          max={23}
          value={dailyReleaseHour}
          onChange={(e) => setDailyReleaseHour(e.target.value)}
          placeholder="Release hour (0-23)"
        />
        <input
          type="number"
          min={0}
          max={59}
          value={dailyReleaseMinute}
          onChange={(e) => setDailyReleaseMinute(e.target.value)}
          placeholder="Release minute (0-59)"
        />
        <input
          type="number"
          min={-720}
          max={840}
          value={dailyTimezoneOffset}
          onChange={(e) => setDailyTimezoneOffset(e.target.value)}
          placeholder="Timezone offset minutes (IST=330)"
        />
        <button type="button" onClick={saveDailySchedule}>Save Daily Quiz Time</button>
      </div>
      <button onClick={load}>Refresh Digest Items</button>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search digest items" />
      <div className="list table questions-table">
        <div className="row row-head">
          <span>Q</span>
          <span>Question</span>
          <span>Answer</span>
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
          <span>Action</span>
        </div>
        {pagedDigestItems.map((item) => (
          <div key={item.id} className="row">
            {editingId === item.id ? (
              <>
                <input
                  value={item.question_prompt}
                  onChange={(e) =>
                    setItems((p) => p.map((x) => (x.id === item.id ? { ...x, question_prompt: e.target.value } : x)))
                  }
                />
                <input
                  value={item.option_a}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_a: e.target.value } : x)))}
                />
                <input
                  value={item.option_b}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_b: e.target.value } : x)))}
                />
                <input
                  value={item.option_c}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_c: e.target.value } : x)))}
                />
                <input
                  value={item.option_d}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, option_d: e.target.value } : x)))}
                />
                <select
                  value={String(item.correct_index)}
                  onChange={(e) =>
                    setItems((p) =>
                      p.map((x) => (x.id === item.id ? { ...x, correct_index: Number(e.target.value) } : x)),
                    )
                  }
                >
                  <option value="0">A</option>
                  <option value="1">B</option>
                  <option value="2">C</option>
                  <option value="3">D</option>
                </select>
                <div className="inline-form">
                  <button onClick={() => saveDigestItem(item)}>Save</button>
                  <button className="ghost" onClick={() => setEditingId('')}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <span title={item.fact_text}>{item.question_prompt.slice(0, 20)}</span>
                <span>{item.question_prompt}</span>
                <span>{['A', 'B', 'C', 'D'][item.correct_index]}</span>
                <span>{item.option_a}</span>
                <span>{item.option_b}</span>
                <span>{item.option_c}</span>
                <span>{item.option_d}</span>
                <div className="inline-form">
                  <button onClick={() => setEditingId(item.id)}>Edit</button>
                  <button className="danger" onClick={() => deleteDigestItem(item.id)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="list table users-table">
        <div className="row row-head">
          <span>Question</span>
          <span>Fact Of The Day</span>
          <span>Status</span>
          <span>Action</span>
          <span>Status</span>
          <span>Toggle</span>
        </div>
        {pagedDigestItems.map((item) => (
          <div key={item.id} className="row">
            <span>{item.question_prompt.slice(0, 40)}</span>
            <span>{item.fact_text.slice(0, 70)}</span>
            <span>{item.is_published ? 'Published' : 'Hidden'}</span>
            <button onClick={() => setEditingId(item.id)}>Edit Question</button>
            <span>{item.is_published ? 'Published' : 'Hidden'}</span>
            <button
              onClick={async () => {
                try {
                  await apiClient.patch(`/admin/digest/${item.id}`, {
                    questionPrompt: item.question_prompt,
                    optionA: item.option_a,
                    optionB: item.option_b,
                    optionC: item.option_c,
                    optionD: item.option_d,
                    correctIndex: item.correct_index,
                    factText: item.fact_text,
                    isPublished: !item.is_published,
                    notifyUsers,
                  });
                  await load();
                  pushToast('success', item.is_published ? 'Digest item unpublished.' : 'Digest item published.');
                } catch (err: any) {
                  pushToast('error', err?.response?.data?.error || 'Failed to update publish status');
                }
              }}
            >
              {item.is_published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        ))}
      </div>
      {visibleItems.length > 0 ? (
        <div className="pagination-wrap">
          <span>
            Page {safeDigestPage} of {totalDigestPages}
          </span>
          <span>
            Showing {digestRangeStart}-{digestRangeEnd} of {visibleItems.length}
          </span>
          <div className="inline-form pagination-controls">
            <button
              type="button"
              className="ghost"
              onClick={() => setDigestListPage((p) => Math.max(1, p - 1))}
              disabled={safeDigestPage <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setDigestListPage((p) => Math.min(totalDigestPages, p + 1))}
              disabled={safeDigestPage >= totalDigestPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DailyQuizTab({ apiClient }: { apiClient: typeof api }) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm } = useAdminDialog();
  const [items, setItems] = useState<DailyQuizItem[]>([]);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctIndex, setCorrectIndex] = useState('0');
  const [explanation, setExplanation] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [notifyUsers, setNotifyUsers] = useState(true);
  const [editingId, setEditingId] = useState('');
  const DAILY_QUIZ_PER_PAGE = 15;
  const [quizListPage, setQuizListPage] = useState(1);

  async function load() {
    try {
      const res = await apiClient.get('/admin/daily-quiz');
      setItems(res.data?.items || []);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load daily quiz items');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDailyQuizItem(e: FormEvent) {
    e.preventDefault();
    try {
      await apiClient.post('/admin/daily-quiz', {
        questionPrompt,
        optionA,
        optionB,
        optionC,
        optionD,
        correctIndex: Number(correctIndex),
        explanation,
        isPublished,
        notifyUsers,
      });
      setQuestionPrompt('');
      setOptionA('');
      setOptionB('');
      setOptionC('');
      setOptionD('');
      setCorrectIndex('0');
      setExplanation('');
      setIsPublished(true);
      setNotifyUsers(true);
      await load();
      pushToast('success', 'Daily quiz item added.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to create daily quiz item');
    }
  }

  async function saveDailyQuizItem(item: DailyQuizItem) {
    try {
      await apiClient.patch(`/admin/daily-quiz/${item.id}`, {
        questionPrompt: item.questionPrompt,
        optionA: item.optionA,
        optionB: item.optionB,
        optionC: item.optionC,
        optionD: item.optionD,
        correctIndex: item.correctIndex,
        explanation: item.explanation,
        isPublished: item.isPublished,
        notifyUsers,
      });
      setEditingId('');
      await load();
      pushToast('success', 'Daily quiz item updated.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to update daily quiz item');
    }
  }

  async function deleteDailyQuizItem(id: string) {
    const ok = await adminConfirm({
      title: 'Delete daily quiz item?',
      message: 'This daily quiz entry will be removed.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/admin/daily-quiz/${id}`);
      await load();
      pushToast('success', 'Daily quiz item deleted.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to delete daily quiz item');
    }
  }

  const totalQuizPages = Math.max(1, Math.ceil(items.length / DAILY_QUIZ_PER_PAGE));
  const safeQuizPage = Math.min(quizListPage, totalQuizPages);
  const quizRangeStart = items.length === 0 ? 0 : (safeQuizPage - 1) * DAILY_QUIZ_PER_PAGE + 1;
  const quizRangeEnd = Math.min(safeQuizPage * DAILY_QUIZ_PER_PAGE, items.length);
  const pagedQuizItems = useMemo(() => {
    const start = (safeQuizPage - 1) * DAILY_QUIZ_PER_PAGE;
    return items.slice(start, start + DAILY_QUIZ_PER_PAGE);
  }, [items, safeQuizPage]);

  return (
    <>
      <DailyQuizAdminStats apiClient={apiClient} />
      <section className="panel-card">
      <div className="panel-head">
        <h3>Daily Quiz (separate from Daily Digest)</h3>
      </div>
      <form onSubmit={createDailyQuizItem} className="question-form">
        <input value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} placeholder="Quiz question prompt" required />
        <input value={optionA} onChange={(e) => setOptionA(e.target.value)} placeholder="Option A" required />
        <input value={optionB} onChange={(e) => setOptionB(e.target.value)} placeholder="Option B" required />
        <input value={optionC} onChange={(e) => setOptionC(e.target.value)} placeholder="Option C" required />
        <input value={optionD} onChange={(e) => setOptionD(e.target.value)} placeholder="Option D" required />
        <select value={correctIndex} onChange={(e) => setCorrectIndex(e.target.value)}>
          <option value="0">Correct: A</option>
          <option value="1">Correct: B</option>
          <option value="2">Correct: C</option>
          <option value="3">Correct: D</option>
        </select>
        <input value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explanation (optional)" />
        <label className="check-wrap">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          published
        </label>
        <label className="check-wrap">
          <input type="checkbox" checked={notifyUsers} onChange={(e) => setNotifyUsers(e.target.checked)} />
          send auto notification
        </label>
        <div className="inline-form">
          <button type="submit">Add Daily Quiz Item</button>
        </div>
      </form>
      <div className="inline-form">
        <button onClick={load}>Refresh Daily Quiz Items</button>
      </div>
      <div className="list table tests-table">
        <div className="row row-head">
          <span>Question</span>
          <span>Correct</span>
          <span>Published</span>
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
          <span>Action</span>
        </div>
        {pagedQuizItems.map((item) => (
          <div key={item.id} className="row">
            {editingId === item.id ? (
              <>
                <input
                  value={item.questionPrompt}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, questionPrompt: e.target.value } : x)))}
                />
                <select
                  value={String(item.correctIndex)}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, correctIndex: Number(e.target.value) } : x)))}
                >
                  <option value="0">A</option>
                  <option value="1">B</option>
                  <option value="2">C</option>
                  <option value="3">D</option>
                </select>
                <label className="check-wrap">
                  <input
                    type="checkbox"
                    checked={item.isPublished}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, isPublished: e.target.checked } : x)))}
                  />
                  published
                </label>
                <input value={item.optionA} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionA: e.target.value } : x)))} />
                <input value={item.optionB} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionB: e.target.value } : x)))} />
                <input value={item.optionC} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionC: e.target.value } : x)))} />
                <input value={item.optionD} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, optionD: e.target.value } : x)))} />
                <div className="inline-form">
                  <button onClick={() => saveDailyQuizItem(item)}>Save</button>
                  <button className="ghost" onClick={() => setEditingId('')}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <span>{item.questionPrompt}</span>
                <span>{['A', 'B', 'C', 'D'][item.correctIndex]}</span>
                <span>{item.isPublished ? 'Published' : 'Hidden'}</span>
                <span>{item.optionA}</span>
                <span>{item.optionB}</span>
                <span>{item.optionC}</span>
                <span>{item.optionD}</span>
                <div className="inline-form">
                  <button onClick={() => setEditingId(item.id)}>Edit</button>
                  <button className="danger" onClick={() => deleteDailyQuizItem(item.id)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="list table users-table">
        <div className="row row-head">
          <span>Question</span>
          <span>Explanation</span>
          <span>Status</span>
          <span>Toggle</span>
        </div>
        {pagedQuizItems.map((item) => (
          <div key={item.id} className="row">
            <span>{item.questionPrompt.slice(0, 60)}</span>
            <span>{item.explanation.slice(0, 80)}</span>
            <span>{item.isPublished ? 'Published' : 'Hidden'}</span>
            <button
              onClick={async () => {
                try {
                  await apiClient.patch(`/admin/daily-quiz/${item.id}`, { ...item, isPublished: !item.isPublished });
                  await load();
                  pushToast('success', item.isPublished ? 'Daily quiz item unpublished.' : 'Daily quiz item published.');
                } catch (err: any) {
                  pushToast('error', err?.response?.data?.error || 'Failed to update daily quiz publish status');
                }
              }}
            >
              {item.isPublished ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        ))}
      </div>
      {items.length > 0 ? (
        <div className="pagination-wrap">
          <span>
            Page {safeQuizPage} of {totalQuizPages}
          </span>
          <span>
            Showing {quizRangeStart}-{quizRangeEnd} of {items.length}
          </span>
          <div className="inline-form pagination-controls">
            <button
              type="button"
              className="ghost"
              onClick={() => setQuizListPage((p) => Math.max(1, p - 1))}
              disabled={safeQuizPage <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setQuizListPage((p) => Math.min(totalQuizPages, p + 1))}
              disabled={safeQuizPage >= totalQuizPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
    </>
  );
}

function ArticlesTab({ apiClient }: { apiClient: typeof api }) {
  const { pushToast, clearToasts } = useAdminToast();
  const { confirm: adminConfirm } = useAdminDialog();
  const featureImageInputIdBase = useId().replace(/:/g, '');
  const ARTICLES_PER_PAGE = 20;
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [feedKindOptions, setFeedKindOptions] = useState<string[]>(FALLBACK_ARTICLE_FEED_KINDS);
  const [newFeedKind, setNewFeedKind] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>(FALLBACK_ARTICLE_CATEGORIES);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
  const [feedKind, setFeedKind] = useState('news');
  const [listFeedFilter, setListFeedFilter] = useState<'all' | string>('all');
  const [feedKindsSaving, setFeedKindsSaving] = useState(false);
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [featureImageUrl, setFeatureImageUrl] = useState('');
  const [articleImageUploading, setArticleImageUploading] = useState(false);
  const [articleCreating, setArticleCreating] = useState(false);
  const [isPublished, setIsPublished] = useState(true);
  const [addToHomeSliderOnPublish, setAddToHomeSliderOnPublish] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState('');
  const [showArticleForm, setShowArticleForm] = useState(false);
  const [articlesPage, setArticlesPage] = useState(1);

  async function load() {
    try {
      clearToasts();
      const [articlesOutcome, kindsOutcome, categoriesOutcome] = await Promise.allSettled([
        apiClient.get('/admin/articles', { params: { limit: 2000 } }),
        apiClient.get('/admin/articles/feed-kinds'),
        apiClient.get('/admin/articles/categories'),
      ]);
      let articlesErr = '';
      let kindsErr = '';
      let categoriesErr = '';
      if (articlesOutcome.status === 'fulfilled') {
        setItems(articlesOutcome.value.data?.items || []);
      } else {
        setItems([]);
        articlesErr = formatAxiosErr(articlesOutcome.reason, 'Failed to load articles');
      }
      if (kindsOutcome.status === 'fulfilled') {
        const kinds = kindsOutcome.value.data?.kinds;
        if (Array.isArray(kinds) && kinds.length) {
          setFeedKindOptions(kinds);
          setFeedKind((prev) => (kinds.includes(prev) ? prev : kinds[0]));
          setListFeedFilter((prev) => (prev === 'all' || kinds.includes(prev) ? prev : 'all'));
        }
      } else {
        kindsErr = formatAxiosErr(kindsOutcome.reason, 'Failed to load content types');
      }
      if (categoriesOutcome.status === 'fulfilled') {
        const cats = categoriesOutcome.value.data?.categories;
        if (Array.isArray(cats) && cats.length) {
          setCategoryOptions(cats);
        }
      } else {
        categoriesErr = formatAxiosErr(categoriesOutcome.reason, 'Failed to load category list');
      }
      setArticlesPage(1);
      const msgs = [articlesErr, kindsErr, categoriesErr].filter(Boolean);
      if (msgs.length >= 2) pushToast('error', msgs.join(' · '));
      else if (articlesErr) pushToast('error', articlesErr);
      else if (kindsErr) pushToast('warning', kindsErr);
      else if (categoriesErr) pushToast('warning', categoriesErr);
    } catch (err: any) {
      pushToast('error',err?.response?.data?.error || 'Failed to load articles');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFeedKind() {
    const slug = normalizeClientFeedKindInput(newFeedKind);
    if (!slug) {
      pushToast('error','Invalid type: use lowercase letters, start with a letter, optional numbers/hyphen/underscore.');
      return;
    }
    if (feedKindOptions.includes(slug)) {
      setNewFeedKind('');
      return;
    }
    try {
      clearToasts();
      setFeedKindsSaving(true);
      const res = await apiClient.put('/admin/articles/feed-kinds', { kinds: [...feedKindOptions, slug] });
      const next = res.data?.kinds as string[] | undefined;
      if (next?.length) setFeedKindOptions(next);
      setNewFeedKind('');
      pushToast('success',`Content type "${slug}" saved.`);
    } catch (err: any) {
      pushToast('error',err?.response?.data?.error || 'Failed to add content type');
    } finally {
      setFeedKindsSaving(false);
    }
  }

  async function removeFeedKind(k: string) {
    if (feedKindOptions.length <= 1) {
      pushToast('error','Keep at least one content type.');
      return;
    }
    const previousKinds = feedKindOptions;
    const previousFeedKind = feedKind;
    const previousListFeedFilter = listFeedFilter;
    const next = feedKindOptions.filter((x) => x !== k);
    try {
      clearToasts();
      setFeedKindsSaving(true);
      setFeedKindOptions(next);
      if (feedKind === k) setFeedKind(next[0]);
      if (listFeedFilter === k) setListFeedFilter('all');
      const res = await apiClient.put('/admin/articles/feed-kinds', { kinds: next });
      const saved = res.data?.kinds as string[] | undefined;
      if (saved?.length) {
        setFeedKindOptions(saved);
        if (feedKind === k) setFeedKind(saved[0]);
        if (listFeedFilter === k) setListFeedFilter('all');
      }
      pushToast('success',`Content type "${k}" removed.`);
    } catch (err: any) {
      setFeedKindOptions(previousKinds);
      setFeedKind(previousFeedKind);
      setListFeedFilter(previousListFeedFilter);
      pushToast('error',err?.response?.data?.error || 'Failed to update content types');
    } finally {
      setFeedKindsSaving(false);
    }
  }

  async function addArticleCategory() {
    const label = normalizeClientCategoryLabel(newCategoryInput);
    if (!label) {
      pushToast('error', 'Enter a category name (letters/words, max 120 characters).');
      return;
    }
    if (categoryOptions.some((c) => c.toLowerCase() === label.toLowerCase())) {
      setNewCategoryInput('');
      return;
    }
    try {
      clearToasts();
      setCategorySaving(true);
      const res = await apiClient.put('/admin/articles/categories', { categories: [...categoryOptions, label] });
      const next = res.data?.categories as string[] | undefined;
      if (next?.length) setCategoryOptions(next);
      setNewCategoryInput('');
      setCategory(label);
      pushToast('success', `Category "${label}" saved.`);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to add category');
    } finally {
      setCategorySaving(false);
    }
  }

  async function removeArticleCategory(cat: string) {
    if (categoryOptions.length <= 1) {
      pushToast('error', 'Keep at least one category.');
      return;
    }
    const previous = categoryOptions;
    const next = categoryOptions.filter((x) => x !== cat);
    try {
      clearToasts();
      setCategorySaving(true);
      setCategoryOptions(next);
      if (category === cat) setCategory('');
      const res = await apiClient.put('/admin/articles/categories', { categories: next });
      const saved = res.data?.categories as string[] | undefined;
      if (saved?.length) {
        setCategoryOptions(saved);
        if (category === cat) setCategory('');
      }
      pushToast('success', `Category "${cat}" removed from list.`);
    } catch (err: any) {
      setCategoryOptions(previous);
      pushToast('error', err?.response?.data?.error || 'Failed to update categories');
    } finally {
      setCategorySaving(false);
    }
  }

  async function postArticleImageFile(file: File): Promise<string> {
    if (!isAdminUploadImageMime(file.type)) {
      throw new Error('Unsupported image type (use JPEG, PNG, WebP, GIF, AVIF, or SVG).');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be 5MB or less');
    }
    const dataBase64 = await fileToBase64Data(file);
    const res = await apiClient.post('/admin/uploads/article-image', {
      fileName: file.name,
      contentType: file.type,
      dataBase64,
    });
    const url = String(res.data?.imageUrl || '').trim();
    if (!url) throw new Error('Upload response missing image URL');
    return url;
  }

  async function uploadArticleFeatureImage(file: File, onDone: (url: string) => void) {
    try {
      clearToasts();
      setArticleImageUploading(true);
      const url = await postArticleImageFile(file);
      onDone(url);
      pushToast('success','Feature image uploaded.');
    } catch (err: any) {
      pushToast('error',err?.response?.data?.error || err?.message || 'Failed to upload image');
    } finally {
      setArticleImageUploading(false);
    }
  }

  async function uploadArticleBodyImageForEditor(file: File): Promise<string> {
    try {
      clearToasts();
      const url = await postArticleImageFile(file);
      pushToast('success','Image inserted in article body.');
      return url;
    } catch (err: any) {
      pushToast('error',err?.response?.data?.error || err?.message || 'Failed to upload image');
      throw err;
    }
  }

  async function appendArticleToHomeSlider(createdArticle: ArticleItem) {
    const articleId = String(createdArticle.id || '').trim();
    if (!articleId) return;
    try {
      const settingsRes = await apiClient.get('/admin/settings');
      const currentHome = settingsRes.data?.settings?.homeContent;
      const safeHome = currentHome && typeof currentHome === 'object' ? currentHome : {};
      const currentSlides: HomeNewsSlideItem[] = Array.isArray(safeHome.newsSlides) ? safeHome.newsSlides : [];
      if (currentSlides.some((x) => String(x?.articleId || '').trim() === articleId)) return;
      const nextSlides: HomeNewsSlideItem[] = [
        ...currentSlides,
        {
          id: `news-slide-${Date.now()}-${articleId.slice(0, 8)}`,
          articleId,
          headline: String(createdArticle.headline || '').trim(),
          imageUrl: String(createdArticle.feature_image_url || '').trim(),
          enabled: true,
        },
      ];
      await apiClient.patch('/admin/settings', {
        homeContent: homeContentPatchWithDefaults({
          ...safeHome,
          newsSlides: nextSlides,
        }),
      });
    } catch (_err) {
      pushToast('warning', 'Article created, but auto add to Home slider failed. Add it manually from Home Content.');
    }
  }

  async function createArticle(e: FormEvent) {
    e.preventDefault();
    if (articleCreating) return;
    try {
      clearToasts();
      setArticleCreating(true);
      const createRes = await apiClient.post('/admin/articles', {
        feedKind,
        headline,
        summary,
        category,
        body,
        linkUrl,
        featureImageUrl: featureImageUrl.trim() || null,
        isPublished,
      });
      const createdArticle = createRes.data?.item as ArticleItem | undefined;
      if (createdArticle && isPublished && addToHomeSliderOnPublish) {
        await appendArticleToHomeSlider(createdArticle);
      }
      setHeadline('');
      setSummary('');
      setCategory('');
      setBody('');
      setLinkUrl('');
      setFeatureImageUrl('');
      setIsPublished(true);
      setAddToHomeSliderOnPublish(false);
      setShowArticleForm(false);
      await load();
      pushToast('success','Article created successfully.');
    } catch (err: any) {
      pushToast('error',err?.response?.data?.error || 'Failed to create article');
    } finally {
      setArticleCreating(false);
    }
  }

  async function saveArticle(item: ArticleItem) {
    try {
      clearToasts();
      await apiClient.patch(`/admin/articles/${item.id}`, {
        feedKind: item.feed_kind,
        headline: item.headline,
        summary: item.summary,
        category: item.category,
        body: item.body,
        linkUrl: item.link_url,
        featureImageUrl: item.feature_image_url != null && item.feature_image_url !== '' ? item.feature_image_url : null,
        isPublished: item.is_published,
      });
      setEditingId('');
      await load();
      pushToast('success','Article saved successfully.');
    } catch (err: any) {
      pushToast('error',err?.response?.data?.error || 'Failed to update article');
    }
  }

  async function deleteArticle(id: string) {
    const ok = await adminConfirm({
      title: 'Delete article?',
      message: 'This article will be permanently removed from the feed.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      clearToasts();
      await apiClient.delete(`/admin/articles/${id}`);
      await load();
      pushToast('success','Article deleted.');
    } catch (err: any) {
      pushToast('error',err?.response?.data?.error || 'Failed to delete article');
    }
  }

  const visibleItems = items.filter((item) => {
    if (listFeedFilter !== 'all' && item.feed_kind !== listFeedFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.headline.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      String(item.body || '')
        .toLowerCase()
        .includes(q) ||
      String(item.link_url || '')
        .toLowerCase()
        .includes(q)
    );
  });
  const totalArticlesPages = Math.max(1, Math.ceil(visibleItems.length / ARTICLES_PER_PAGE));
  const safeArticlesPage = Math.min(articlesPage, totalArticlesPages);
  const rangeStart = visibleItems.length === 0 ? 0 : (safeArticlesPage - 1) * ARTICLES_PER_PAGE + 1;
  const rangeEnd = Math.min(safeArticlesPage * ARTICLES_PER_PAGE, visibleItems.length);
  const pagedArticles = useMemo(() => {
    const start = (safeArticlesPage - 1) * ARTICLES_PER_PAGE;
    return visibleItems.slice(start, start + ARTICLES_PER_PAGE);
  }, [safeArticlesPage, visibleItems]);

  return (
    <section className="panel-card articles-panel">
      <div className="panel-head">
        <h3>Articles</h3>
      </div>
      <div className="article-create-card">
        <button type="button" className="article-create-toggle" onClick={() => setShowArticleForm((p) => !p)}>
          <span className="article-create-label">Articles Control</span>
          <span className="article-toggle-icon" aria-hidden="true">
            {showArticleForm ? 'x' : '+'}
          </span>
        </button>
        {showArticleForm && (
          <>
            <div className="article-feed-kinds-panel">
              <h4>Content types</h4>
              <p className="muted article-feed-kinds-hint">
                Apni list banayein — ye labels &quot;Content Type&quot; dropdown mein dikhenge. List se hataane se purane articles delete
                nahi hote.
              </p>
              <div className="inline-form article-feed-kind-add">
                <input
                  value={newFeedKind}
                  onChange={(e) => setNewFeedKind(e.target.value)}
                  placeholder="e.g. announcement"
                  aria-label="New content type id"
                  disabled={feedKindsSaving}
                />
                <button type="button" onClick={() => void addFeedKind()} disabled={feedKindsSaving}>
                  {feedKindsSaving ? 'Saving...' : 'Add type'}
                </button>
              </div>
              <div className="feed-kind-chips-wrap" aria-label="Content types list">
                {feedKindOptions.map((k) => (
                  <span key={k} className="feed-kind-chip">
                    <code>{k}</code>
                    <button
                      type="button"
                      className="feed-kind-chip-remove"
                      disabled={feedKindOptions.length <= 1 || feedKindsSaving}
                      aria-label={`Remove ${k}`}
                      onClick={() => void removeFeedKind(k)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="article-feed-kinds-panel">
              <h4>Categories</h4>
              <p className="muted article-feed-kinds-hint">
                Ye list &quot;Category&quot; dropdown mein dikhegi — naye naam yahan add karein. List se hataane se purane articles
                delete nahi hote; unka category purana text ban kar dropdown mein dikhega jab tak aap change na karein.
              </p>
              <div className="inline-form article-feed-kind-add">
                <input
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  placeholder="e.g. Rajasthan GK"
                  aria-label="New category name"
                  disabled={categorySaving}
                />
                <button type="button" onClick={() => void addArticleCategory()} disabled={categorySaving}>
                  {categorySaving ? 'Saving...' : 'Add category'}
                </button>
              </div>
              <div className="feed-kind-chips-wrap" aria-label="Categories list">
                {categoryOptions.map((c) => (
                  <span key={c} className="feed-kind-chip">
                    <span>{c}</span>
                    <button
                      type="button"
                      className="feed-kind-chip-remove"
                      disabled={categoryOptions.length <= 1 || categorySaving}
                      aria-label={`Remove ${c}`}
                      onClick={() => void removeArticleCategory(c)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <form onSubmit={createArticle} className="article-form">
            <label>
              Content Type
              <select
                value={feedKindOptions.includes(feedKind) ? feedKind : feedKindOptions[0]}
                onChange={(e) => {
                  const v = e.target.value;
                  setFeedKind(v);
                }}
              >
                {feedKindOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <div className="article-form-field-span article-feature-upload-block">
              <span className="article-field-label">Feature image</span>
              <div className="article-feature-upload-row">
                <input
                  id={`${featureImageInputIdBase}-create-feature-file`}
                  type="file"
                  accept={ADMIN_IMAGE_UPLOAD_MIME_TYPES.join(',')}
                  disabled={articleImageUploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadArticleFeatureImage(f, setFeatureImageUrl);
                  }}
                />
                {articleImageUploading ? <span className="muted">Uploading…</span> : null}
              </div>
              {featureImageUrl ? (
                <div className="article-feature-preview">
                  <img src={featureImageUrl} alt="" />
                  <button type="button" className="ghost" onClick={() => setFeatureImageUrl('')}>
                    Clear image
                  </button>
                </div>
              ) : null}
              <input
                id={`${featureImageInputIdBase}-create-feature-url`}
                type="url"
                value={featureImageUrl}
                onChange={(e) => setFeatureImageUrl(e.target.value)}
                placeholder="Or paste image URL (optional)"
                aria-label="Feature image URL (optional)"
              />
            </div>
            <label>
              Headline
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Enter headline" required />
            </label>
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— Select category —</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {category && !categoryOptions.includes(category) ? (
                  <option value={category}>{category} (not in list)</option>
                ) : null}
              </select>
            </label>
            <label>
              Link URL
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="URL here" />
            </label>
            <label className="article-form-field-span">
              Summary
              <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Brief summary" />
            </label>
            <div className="article-form-field-span article-rich-field">
              <span className="article-field-label">Article body (rich text)</span>
              <ArticleBodyEditor
                value={body}
                onChange={setBody}
                placeholder="Headings, lists, links — saved as HTML for the app."
                persistenceKey="article-compose"
                uploadBodyImage={uploadArticleBodyImageForEditor}
              />
            </div>
            <div className="article-form-field-span">
              <div className="inline-form article-form-actions">
                <label className="check-wrap">
                  <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                  published
                </label>
                <label className="check-wrap">
                  <input
                    type="checkbox"
                    checked={addToHomeSliderOnPublish}
                    onChange={(e) => setAddToHomeSliderOnPublish(e.target.checked)}
                    disabled={!isPublished}
                  />
                  add to home slider
                </label>
                <button type="submit" disabled={articleCreating || articleImageUploading}>
                  {articleCreating ? 'Adding...' : 'Add Article'}
                </button>
              </div>
            </div>
          </form>
          </>
        )}
      </div>
      <div className="inline-form articles-tools">
        <button type="button" className="all-tests-refresh" onClick={load}>
          Refresh Articles
        </button>
        <select
          value={listFeedFilter}
          onChange={(e) => {
            setListFeedFilter(e.target.value);
            setArticlesPage(1);
          }}
        >
          <option value="all">All types</option>
          {feedKindOptions.map((k) => (
            <option key={k} value={k}>
              {k} only
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setArticlesPage(1);
          }}
          placeholder="Search articles..."
        />
      </div>
      <div className="list table articles-table">
        <div className="row row-head">
          <span>Type</span>
          <span>Headline</span>
          <span>Category</span>
          <span>Status</span>
          <span>Actions</span>
          <span />
        </div>
        {pagedArticles.map((item) =>
          editingId === item.id ? (
            <div key={item.id} className="articles-edit-fullwidth">
              <div className="articles-edit-grid">
                <label>
                  Content Type
                  <select
                    value={item.feed_kind}
                    onChange={(e) => {
                      const v = e.target.value;
                      setItems((p) => p.map((x) => (x.id === item.id ? { ...x, feed_kind: v } : x)));
                    }}
                  >
                    {feedKindOptions.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                    {!feedKindOptions.includes(item.feed_kind) && item.feed_kind ? (
                      <option value={item.feed_kind}>{item.feed_kind} (not in list)</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  Headline
                  <input
                    value={item.headline}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, headline: e.target.value } : x)))}
                  />
                </label>
                <label>
                  Category
                  <select
                    value={item.category}
                    onChange={(e) =>
                      setItems((p) => p.map((x) => (x.id === item.id ? { ...x, category: e.target.value } : x)))
                    }
                  >
                    <option value="">— Select category —</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {item.category && !categoryOptions.includes(item.category) ? (
                      <option value={item.category}>{item.category} (not in list)</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  Link URL
                  <input
                    value={item.link_url}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, link_url: e.target.value } : x)))}
                  />
                </label>
                <div className="articles-edit-span article-feature-upload-block">
                  <span className="article-field-label">Feature image</span>
                  <div className="article-feature-upload-row">
                    <input
                      id={`${featureImageInputIdBase}-edit-${item.id}-feature-file`}
                      type="file"
                      accept={ADMIN_IMAGE_UPLOAD_MIME_TYPES.join(',')}
                      disabled={articleImageUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) {
                          void uploadArticleFeatureImage(f, (url) =>
                            setItems((p) => p.map((x) => (x.id === item.id ? { ...x, feature_image_url: url } : x))),
                          );
                        }
                      }}
                    />
                    {articleImageUploading ? <span className="muted">Uploading…</span> : null}
                  </div>
                  {item.feature_image_url ? (
                    <div className="article-feature-preview">
                      <img src={item.feature_image_url} alt="" />
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          setItems((p) => p.map((x) => (x.id === item.id ? { ...x, feature_image_url: null } : x)))
                        }
                      >
                        Clear image
                      </button>
                    </div>
                  ) : null}
                  <input
                    id={`${featureImageInputIdBase}-edit-${item.id}-feature-url`}
                    type="url"
                    value={item.feature_image_url ?? ''}
                    onChange={(e) =>
                      setItems((p) =>
                        p.map((x) => (x.id === item.id ? { ...x, feature_image_url: e.target.value || null } : x)),
                      )
                    }
                    placeholder="Or paste image URL"
                    aria-label="Feature image URL (optional)"
                  />
                </div>
                <label className="articles-edit-span">
                  Summary
                  <input
                    value={item.summary}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, summary: e.target.value } : x)))}
                  />
                </label>
                <div className="articles-edit-span articles-edit-rich">
                  <span className="article-field-label">Article body (rich text)</span>
                  <ArticleBodyEditor
                    key={item.id}
                    value={item.body}
                    onChange={(html) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, body: html } : x)))}
                    persistenceKey={`article-edit-${item.id}`}
                    uploadBodyImage={uploadArticleBodyImageForEditor}
                  />
                </div>
                <div className="articles-edit-actions">
                  <label className="check-wrap">
                    <input
                      type="checkbox"
                      checked={item.is_published}
                      onChange={(e) =>
                        setItems((p) => p.map((x) => (x.id === item.id ? { ...x, is_published: e.target.checked } : x)))
                      }
                    />
                    published
                  </label>
                  <div className="inline-form">
                    <button type="button" onClick={() => saveArticle(item)}>
                      Save
                    </button>
                    <button type="button" className="ghost" onClick={() => setEditingId('')}>
                      Cancel
                    </button>
                    <button type="button" className="danger" onClick={() => deleteArticle(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div key={item.id} className="row">
              <span>{item.feed_kind}</span>
              <span title={item.summary || item.body}>{item.headline}</span>
              <span>{item.category || '-'}</span>
              <span>{item.is_published ? 'Published' : 'Hidden'}</span>
              <button title="Edit" aria-label="Edit" onClick={() => setEditingId(item.id)}>
                <span aria-hidden="true">✎</span>
              </button>
              <button className="danger" title="Delete" aria-label="Delete" onClick={() => deleteArticle(item.id)}>
                <span aria-hidden="true">🗑</span>
              </button>
            </div>
          ),
        )}
      </div>
      <div className="pagination-wrap">
        <span>
          Page {safeArticlesPage} of {totalArticlesPages}
        </span>
        <span>
          Showing {rangeStart}-{rangeEnd} of {visibleItems.length}
        </span>
        <div className="inline-form pagination-controls">
          <button
            type="button"
            className="ghost"
            onClick={() => setArticlesPage((p) => Math.max(1, p - 1))}
            disabled={safeArticlesPage === 1}
          >
            Previous
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setArticlesPage((p) => Math.min(totalArticlesPages, p + 1))}
            disabled={safeArticlesPage === totalArticlesPages}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}


const DEFAULT_PROFILE_MENU_ITEMS: ProfileMenuItem[] = [
  { id: 'edit-username', title: 'Username', subtitle: '{value}', path: '/edit-username', enabled: true },
  { id: 'edit-email', title: 'Email', subtitle: '{value}', path: '/edit-email', enabled: true },
  { id: 'edit-mobile', title: 'Mobile number', subtitle: '{value}', path: '/edit-mobile', enabled: true },
  { id: 'edit-dob', title: 'Date of birth', subtitle: '{value}', path: '/edit-dob', enabled: true },
  { id: 'edit-gender', title: 'Gender', subtitle: '{value}', path: '/edit-gender', enabled: true },
  { id: 'edit-password', title: 'Password', subtitle: 'Change password (current + new + confirm)', path: '/edit-password', enabled: true },
  { id: 'verify-email', title: 'Email verification', subtitle: 'Not verified', path: '/verify-email', enabled: true },
  { id: 'verify-phone', title: 'Phone verification', subtitle: 'Not verified', path: '/verify-phone', enabled: true },
  { id: 'notifications', title: 'Notifications', subtitle: 'Notification settings (on/off)', path: '/notifications', enabled: true },
  { id: 'help-support', title: 'Help & support', subtitle: 'Need help? Open support page', path: '/help-support', enabled: true },
  { id: 'feedback', title: 'Feedback', subtitle: 'Share your app feedback', path: '/feedback', enabled: true },
  { id: 'report-issue', title: 'Report issue', subtitle: 'Report a bug or problem', path: '/report-issue', enabled: true },
  { id: 'achievement', title: 'Achievements', subtitle: 'Streaks, badges, full marks', path: '/achievement', enabled: true },
  { id: 'privacy-policy', title: 'Privacy policy', subtitle: 'How data is handled', path: '/privacy-policy', enabled: true },
  { id: 'terms-of-use', title: 'Terms of use', subtitle: 'Conditions of use', path: '/terms-of-use', enabled: true },
  { id: 'export-data', title: 'Export my data', subtitle: 'JSON snapshot via share sheet', path: '/export-data', enabled: true },
  { id: 'logout', title: 'Log out', subtitle: 'Sign out on this device', path: '/logout', enabled: true },
  { id: 'delete-account', title: 'Delete account', subtitle: 'Remove account and clear this device', path: '/delete-account', enabled: true },
];

function todayIsoDateLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ProfileTab({ apiClient }: { apiClient: typeof api }) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm } = useAdminDialog();
  const PROFILE_ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<ProfileMenuItem[]>(DEFAULT_PROFILE_MENU_ITEMS);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>(DEFAULT_PROFILE_MENU_ITEMS[0].id);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [path, setPath] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState('');
  const [page, setPage] = useState(1);
  const [adminMeLoading, setAdminMeLoading] = useState(true);
  const [adminBirthdaySaving, setAdminBirthdaySaving] = useState(false);
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminBirthdayDraft, setAdminBirthdayDraft] = useState('');

  useEffect(() => {
    load();
    void loadAdminAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAdminAccount() {
    setAdminMeLoading(true);
    try {
      const res = await apiClient.get('/me');
      const user = res.data?.user as
        | { displayName?: string; email?: string; birthdayDate?: string | null }
        | undefined;
      const name = String(user?.displayName || '').trim();
      const mail = String(user?.email || '').trim();
      setAdminDisplayName(name);
      setAdminEmail(mail);
      const dob = user?.birthdayDate != null && String(user.birthdayDate).trim() ? String(user.birthdayDate).slice(0, 10) : '';
      setAdminBirthdayDraft(dob);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load admin account');
    } finally {
      setAdminMeLoading(false);
    }
  }

  async function saveAdminBirthday(e: FormEvent) {
    e.preventDefault();
    const trimmed = adminBirthdayDraft.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      pushToast('error', 'Use a valid date.');
      return;
    }
    if (trimmed && trimmed > todayIsoDateLocal()) {
      pushToast('error', 'Date of birth cannot be in the future.');
      return;
    }
    setAdminBirthdaySaving(true);
    try {
      await apiClient.patch('/me/profile', {
        birthdayDate: trimmed === '' ? null : trimmed,
      });
      pushToast('success', trimmed === '' ? 'Date of birth cleared.' : 'Date of birth saved.');
      await loadAdminAccount();
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Could not save date of birth.');
    } finally {
      setAdminBirthdaySaving(false);
    }
  }

  async function load() {
    try {
      const res = await apiClient.get('/admin/settings');
      const rawItems = res.data?.settings?.profileMenuItems;
      if (Array.isArray(rawItems) && rawItems.length) {
        const mapped = rawItems.map((item: any, index: number) => ({
            id: String(item.id || `item-${index + 1}`),
            title: String(item.title || '').trim(),
            subtitle: String(item.subtitle || '').trim(),
            path: String(item.path || '').trim(),
            enabled: item.enabled !== false,
          }));
        setItems(mapped);
        if (!mapped.some((x) => x.id === selectedMenuItemId)) {
          setSelectedMenuItemId(mapped[0].id);
        }
      } else {
        setItems(DEFAULT_PROFILE_MENU_ITEMS);
        if (!DEFAULT_PROFILE_MENU_ITEMS.some((x) => x.id === selectedMenuItemId)) {
          setSelectedMenuItemId(DEFAULT_PROFILE_MENU_ITEMS[0].id);
        }
      }
      setPage(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load profile menu');
    }
  }

  async function saveAll(nextItems: ProfileMenuItem[]): Promise<boolean> {
    try {
      const res = await apiClient.patch('/admin/settings', { profileMenuItems: nextItems });
      const savedItems = res.data?.settings?.profileMenuItems || nextItems;
      setItems(savedItems);
      if (!savedItems.some((x: ProfileMenuItem) => x.id === selectedMenuItemId) && savedItems.length) {
        setSelectedMenuItemId(savedItems[0].id);
      }
      return true;
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save profile menu');
      return false;
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanPath = path.trim();
    if (!cleanTitle || !cleanPath) {
      pushToast('error', 'Title and path are required');
      return;
    }
    const id = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `item-${Date.now()}`;
    const nextItems = [{ id, title: cleanTitle, subtitle: subtitle.trim(), path: cleanPath, enabled }, ...items];
    const ok = await saveAll(nextItems);
    if (!ok) return;
    pushToast('success', 'Menu item added.');
    setTitle('');
    setSubtitle('');
    setPath('');
    setEnabled(true);
    setPage(1);
  }

  async function updateItem(item: ProfileMenuItem) {
    const nextItems = items.map((x) => (x.id === item.id ? item : x));
    const ok = await saveAll(nextItems);
    if (!ok) return;
    setEditingId('');
    pushToast('success', 'Menu item updated.');
  }

  async function removeItem(id: string) {
    const ok = await adminConfirm({
      title: 'Delete profile menu item?',
      message: 'This entry will be removed from the profile menu list.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    const nextItems = items.filter((x) => x.id !== id);
    const saved = await saveAll(nextItems);
    if (!saved) return;
    pushToast('success', 'Menu item deleted.');
    setPage(1);
  }

  async function toggleItem(item: ProfileMenuItem) {
    const nextItems = items.map((x) => (x.id === item.id ? { ...x, enabled: !x.enabled } : x));
    const ok = await saveAll(nextItems);
    if (ok) pushToast('success', item.enabled ? 'Menu item disabled.' : 'Menu item enabled.');
  }

  async function moveItem(id: string, direction: -1 | 1) {
    const index = items.findIndex((x) => x.id === id);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    const temp = nextItems[targetIndex];
    nextItems[targetIndex] = nextItems[index];
    nextItems[index] = temp;
    void saveAll(nextItems);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PROFILE_ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * PROFILE_ITEMS_PER_PAGE;
    return items.slice(start, start + PROFILE_ITEMS_PER_PAGE);
  }, [items, safePage]);
  const selectedItem = items.find((x) => x.id === selectedMenuItemId) || items[0] || null;

  return (
    <section className="panel-card profile-panel">
      <div className="admin-account-strip">
        <div className="panel-head" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Your admin account</h3>
        </div>
        {adminMeLoading ? (
          <p className="account-meta">Loading account…</p>
        ) : (
          <>
            {adminDisplayName ? <p className="account-meta">Name: {adminDisplayName}</p> : null}
            {adminEmail ? (
              <p className="account-meta" title={adminEmail}>
                Email: {adminEmail}
              </p>
            ) : (
              <p className="account-meta">Email: —</p>
            )}
            <form className="inline-form admin-dob-form" onSubmit={(ev) => void saveAdminBirthday(ev)}>
              <label htmlFor="admin-profile-dob" className="account-meta account-meta-strong">
                Date of birth
              </label>
              <input
                id="admin-profile-dob"
                type="date"
                min="1900-01-01"
                max={todayIsoDateLocal()}
                value={adminBirthdayDraft}
                onChange={(e) => setAdminBirthdayDraft(e.target.value)}
                disabled={adminBirthdaySaving}
              />
              <button type="submit" disabled={adminBirthdaySaving}>
                {adminBirthdaySaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={adminBirthdaySaving || adminBirthdayDraft.trim() === ''}
                onClick={() => setAdminBirthdayDraft('')}
              >
                Clear
              </button>
            </form>
            <p className="account-meta account-meta-hint">Stored as YYYY-MM-DD. Same field as mobile app profile / birthday reminders.</p>
          </>
        )}
      </div>
      <div className="panel-head">
        <h3>Profile Menu Control</h3>
      </div>
      <div className="profile-preview">
        <div className="profile-preview-menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`profile-preview-item ${selectedItem?.id === item.id ? 'active' : ''}`}
              onClick={() => setSelectedMenuItemId(item.id)}
              disabled={!item.enabled}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="profile-preview-content">
          <h4>{selectedItem?.title || 'Select item'}</h4>
          <p>{selectedItem?.subtitle || (selectedItem ? `This section opens in same page panel for: ${selectedItem.title}` : 'No item selected')}</p>
          {selectedItem && <code>{selectedItem.path}</code>}
        </div>
      </div>
      <form onSubmit={addItem} className="inline-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Menu title (e.g. Feedback)" required />
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" />
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="Open path (e.g. /feedback)" required />
        <label className="check-wrap">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          enabled
        </label>
        <button type="submit">Add Menu Item</button>
      </form>
      <div className="inline-form">
        <button type="button" onClick={load}>Load Profile Items</button>
      </div>
      <div className="list table">
        <div className="row row-head profile-menu-row">
          <span>Title</span>
          <span>Subtitle</span>
          <span>Path</span>
          <span>Toggle</span>
          <span>Open</span>
          <span>Up</span>
          <span>Down</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {pagedItems.map((item) => (
          <div key={item.id} className="row profile-menu-row">
            {editingId === item.id ? (
              <>
                <input
                  value={item.title}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)))}
                />
                <input
                  value={item.subtitle || ''}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, subtitle: e.target.value } : x)))}
                />
                <input
                  value={item.path}
                  onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, path: e.target.value } : x)))}
                />
                <label className="check-wrap">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, enabled: e.target.checked } : x)))}
                  />
                  enabled
                </label>
                <button type="button" onClick={() => setSelectedMenuItemId(item.id)}>Open</button>
                <button type="button" className="ghost" onClick={() => moveItem(item.id, -1)} disabled={items.findIndex((x) => x.id === item.id) === 0}>
                  Up
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => moveItem(item.id, 1)}
                  disabled={items.findIndex((x) => x.id === item.id) === items.length - 1}
                >
                  Down
                </button>
                <button type="button" onClick={() => updateItem(item)}>Save</button>
                <button type="button" className="ghost" onClick={() => setEditingId('')}>Cancel</button>
              </>
            ) : (
              <>
                <span>{item.title}</span>
                <span>{item.subtitle || '-'}</span>
                <span>{item.path}</span>
                <label className="check-wrap">
                  <input type="checkbox" checked={item.enabled} onChange={() => toggleItem(item)} />
                  {item.enabled ? 'on' : 'off'}
                </label>
                <button type="button" onClick={() => setSelectedMenuItemId(item.id)} disabled={!item.enabled}>
                  Open
                </button>
                <button type="button" className="ghost" onClick={() => moveItem(item.id, -1)} disabled={items.findIndex((x) => x.id === item.id) === 0}>
                  Up
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => moveItem(item.id, 1)}
                  disabled={items.findIndex((x) => x.id === item.id) === items.length - 1}
                >
                  Down
                </button>
                <button type="button" onClick={() => setEditingId(item.id)}>Update</button>
                <button type="button" className="danger" onClick={() => removeItem(item.id)}>Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="pagination-wrap">
        <span>
          Page {safePage} of {totalPages}
        </span>
        <div className="inline-form pagination-controls">
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
            Previous
          </button>
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function SimpleContentSettingsTab({
  apiClient,
  title,
  settingsKey,
  showTitleField,
}: {
  apiClient: typeof api;
  title: string;
  settingsKey: 'helpSupportContent' | 'achievementContent' | 'shareContent' | 'privacyPolicyContent' | 'termsOfUseContent';
  /** When set, load/save `title` from API and show a heading field (used for Achievement). */
  showTitleField?: boolean;
}) {
  const { pushToast } = useAdminToast();
  const [body, setBody] = useState('');
  const [contentTitle, setContentTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  async function load() {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/settings');
      const block = res.data?.settings?.[settingsKey] as { body?: string; title?: string } | undefined;
      const value = String(block?.body || '');
      setBody(value);
      if (showTitleField) {
        setContentTitle(String(block?.title || title).trim().slice(0, 120));
      }
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || `Failed to load ${title}`);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setSaving(true);
      const resolvedTitle = showTitleField ? String(contentTitle || '').trim() || title : title;
      await apiClient.patch('/admin/settings', {
        [settingsKey]: {
          title: resolvedTitle,
          body,
        },
      });
      await load();
      pushToast('success', `${title} saved.`);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || `Failed to save ${title}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      {loading ? (
        <p className="sub">Loading...</p>
      ) : (
        <>
          {showTitleField && (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                <b>App par card heading</b> (optional). Neeche wala box poora message hai jo Achievements screen par dikhega.
              </p>
              <label className="simple-content-field">
                <span>Heading (title)</span>
                <input
                  className="simple-content-title-input"
                  value={contentTitle}
                  onChange={(e) => setContentTitle(e.target.value.slice(0, 120))}
                  placeholder="e.g. How achievements work"
                  maxLength={120}
                  aria-label="Achievement section title"
                />
              </label>
            </>
          )}
          {showTitleField ? (
            <label className="simple-content-field simple-content-field-spaced">
              <span>Message (body)</span>
              <textarea
                className="simple-content-editor"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Yahan likho jo users ko Achievements page par dikhana hai…"
                rows={14}
              />
            </label>
          ) : (
            <textarea
              className="simple-content-editor"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Write ${title} content`}
              rows={16}
            />
          )}
          <div className="inline-form">
            <button type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Content'}
            </button>
            <button type="button" className="ghost" onClick={load} disabled={saving}>
              Reload
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SignupRegionsSettingsTab({ apiClient }: { apiClient: typeof api }) {
  const { pushToast } = useAdminToast();
  const [items, setItems] = useState<SignupRegionItem[]>([]);
  const [stateInput, setStateInput] = useState('');
  const [districtInput, setDistrictInput] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/settings');
      const raw = res.data?.settings?.signupRegions?.items;
      const mapped: SignupRegionItem[] = Array.isArray(raw)
        ? raw
            .map((row: any) => ({
              state: String(row?.state || '').trim(),
              districts: (Array.isArray(row?.districts) ? row.districts : [])
                .map((x: any) => String(x || '').trim())
                .filter(Boolean),
            }))
            .filter((row) => row.state)
        : [];
      setItems(mapped);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load signup regions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(nextItems: SignupRegionItem[], successMessage: string) {
    try {
      setSaving(true);
      const payload = nextItems
        .map((row) => ({
          state: String(row.state || '').trim(),
          districts: (Array.isArray(row.districts) ? row.districts : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean),
        }))
        .filter((row) => row.state);
      await apiClient.patch('/admin/settings', { signupRegions: { items: payload } });
      setItems(payload);
      pushToast('success', successMessage);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save signup regions');
    } finally {
      setSaving(false);
    }
  }

  async function addState() {
    const cleanState = stateInput.trim();
    if (!cleanState) {
      pushToast('error', 'State is required');
      return;
    }
    if (items.some((row) => row.state.toLowerCase() === cleanState.toLowerCase())) {
      pushToast('warning', 'State already exists');
      return;
    }
    const next = [...items, { state: cleanState, districts: ['Other / Not listed'] }];
    await save(next, `State "${cleanState}" added.`);
    setStateInput('');
    setSelectedState(cleanState);
  }

  async function addDistrict() {
    const state = selectedState.trim();
    const district = districtInput.trim();
    if (!state) {
      pushToast('error', 'Select state first');
      return;
    }
    if (!district) {
      pushToast('error', 'District is required');
      return;
    }
    const next = items.map((row) => {
      if (row.state !== state) return row;
      const exists = row.districts.some((d) => d.toLowerCase() === district.toLowerCase());
      if (exists) return row;
      return { ...row, districts: [...row.districts, district] };
    });
    await save(next, `District "${district}" added in ${state}.`);
    setDistrictInput('');
  }

  async function removeState(state: string) {
    const next = items.filter((row) => row.state !== state);
    await save(next, `State "${state}" removed.`);
    if (selectedState === state) setSelectedState('');
  }

  async function removeDistrict(state: string, district: string) {
    const next = items.map((row) => {
      if (row.state !== state) return row;
      const remaining = row.districts.filter((d) => d !== district);
      return { ...row, districts: remaining.length ? remaining : ['Other / Not listed'] };
    });
    await save(next, `District "${district}" removed from ${state}.`);
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>State & Distt (Signup Form)</h3>
      </div>
      <p className="muted">Yahan se signup ke State aur District list manage karein. App form me ye list use hogi.</p>
      <div className="inline-form">
        <input
          value={stateInput}
          onChange={(e) => setStateInput(e.target.value)}
          placeholder="Add new State"
          disabled={saving}
        />
        <button type="button" onClick={() => void addState()} disabled={saving}>
          Add State
        </button>
      </div>
      <div className="inline-form">
        <select value={selectedState} onChange={(e) => setSelectedState(e.target.value)} disabled={saving || !items.length}>
          <option value="">Select state</option>
          {items.map((row) => (
            <option key={row.state} value={row.state}>
              {row.state}
            </option>
          ))}
        </select>
        <input
          value={districtInput}
          onChange={(e) => setDistrictInput(e.target.value)}
          placeholder="Add new District"
          disabled={saving || !selectedState}
        />
        <button type="button" onClick={() => void addDistrict()} disabled={saving || !selectedState}>
          Add Distt
        </button>
      </div>
      <div className="inline-form">
        <button type="button" className="ghost" onClick={() => void load()} disabled={saving || loading}>
          {loading ? 'Loading...' : 'Reload'}
        </button>
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 2fr 120px' }}>
          <span>State</span>
          <span>Districts</span>
          <span>Action</span>
        </div>
        {items.map((row) => (
          <div key={row.state} className="row" style={{ gridTemplateColumns: '1fr 2fr 120px' }}>
            <span>{row.state}</span>
            <span>
              {row.districts.map((d) => (
                <button
                  key={`${row.state}-${d}`}
                  type="button"
                  className="ghost"
                  style={{ marginRight: 6, marginBottom: 6 }}
                  onClick={() => void removeDistrict(row.state, d)}
                  disabled={saving}
                  title="Remove district"
                >
                  {d} ×
                </button>
              ))}
            </span>
            <button type="button" className="danger" onClick={() => void removeState(row.state)} disabled={saving}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SupportInboxSettingsTab({
  apiClient,
  title,
  settingsKey,
}: {
  apiClient: typeof api;
  title: string;
  settingsKey: 'feedbackInbox' | 'helpSupportInbox' | 'reportIssueInbox';
}) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm } = useAdminDialog();
  const ITEMS_PER_PAGE = 20;
  const [items, setItems] = useState<SupportInboxItem[]>([]);
  const [user, setUser] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<SupportInboxItem['status']>('new');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  async function load(announceSuccess = false) {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/settings');
      const rawItems = res.data?.settings?.[settingsKey]?.items;
      const mapped = Array.isArray(rawItems)
        ? rawItems.map((item: any, index: number) => ({
            id: String(item.id || `${settingsKey}-${index + 1}`),
            user: String(item.user || ''),
            publicId: String(
              item.publicId != null && item.publicId !== ''
                ? item.publicId
                : item.sixDigitPublicId != null
                  ? item.sixDigitPublicId
                  : '',
            ),
            userId: String(item.userId || ''),
            userEmail: String(item.userEmail || ''),
            subject: String(item.subject || ''),
            message: String(item.message || ''),
            createdAt: String(item.createdAt || ''),
            status: (['new', 'in_progress', 'resolved'].includes(String(item.status)) ? item.status : 'new') as SupportInboxItem['status'],
          }))
        : [];
      setItems(mapped);
      setPage(1);
      if (announceSuccess) {
        pushToast('success', `${title} records refreshed successfully.`);
      }
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || `Failed to load ${title}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveAll(nextItems: SupportInboxItem[], successText: string): Promise<boolean> {
    try {
      setSaving(true);
      await apiClient.patch('/admin/settings', {
        [settingsKey]: {
          items: nextItems,
        },
      });
      setItems(nextItems);
      pushToast('success', successText);
      return true;
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || `Failed to save ${title}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    const cleanUser = user.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanUser || !cleanSubject || !cleanMessage) {
      pushToast('error', 'User, subject and message are required');
      return;
    }
    const nextItems: SupportInboxItem[] = [
      {
        id: `${settingsKey}-${Date.now()}`,
        user: cleanUser,
        publicId: '',
        userId: '',
        userEmail: '',
        subject: cleanSubject,
        message: cleanMessage,
        createdAt: new Date().toISOString(),
        status,
      },
      ...items,
    ];
    const ok = await saveAll(nextItems, `${title} record added successfully.`);
    if (!ok) return;
    setUser('');
    setSubject('');
    setMessage('');
    setStatus('new');
    setPage(1);
  }

  async function removeItem(id: string) {
    const ok = await adminConfirm({
      title: `Delete ${title} record?`,
      message: 'This demo / seed inbox row will be removed from the list.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    const nextItems = items.filter((x) => x.id !== id);
    await saveAll(nextItems, `${title} record deleted successfully.`);
  }

  async function updateStatus(id: string, nextStatus: SupportInboxItem['status']) {
    const nextItems = items.map((x) => (x.id === id ? { ...x, status: nextStatus } : x));
    await saveAll(nextItems, `${title} status updated successfully.`);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return items.slice(start, start + ITEMS_PER_PAGE);
  }, [items, safePage]);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      <form onSubmit={addItem} className="inline-form">
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="User" required />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required />
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message" required />
        <select value={status} onChange={(e) => setStatus(e.target.value as SupportInboxItem['status'])}>
          <option value="new">new</option>
          <option value="in_progress">in_progress</option>
          <option value="resolved">resolved</option>
        </select>
        <button type="submit" className="support-inbox-btn" disabled={loading || saving}>
          {saving ? 'Saving...' : 'Add'}
        </button>
        <button type="button" className="ghost support-inbox-btn" onClick={() => load(true)} disabled={loading || saving}>
          {loading ? 'Reloading...' : 'Reload'}
        </button>
      </form>
      <div className="list table support-table">
        <div className="row row-head">
          <span>User</span>
          <span>Public ID</span>
          <span>Subject</span>
          <span>Message</span>
          <span>Time</span>
          <span>Status</span>
        </div>
        {pagedItems.map((item) => (
          <div key={item.id} className="row">
            <span>{item.user}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted, #5f6b7a)' }}>
              {item.publicId?.trim() ? item.publicId : '—'}
            </span>
            <span>{item.subject}</span>
            <span>{item.message}</span>
            <span>{item.createdAt}</span>
            <div className="inline-form">
              <select value={item.status} onChange={(e) => updateStatus(item.id, e.target.value as SupportInboxItem['status'])}>
                <option value="new">new</option>
                <option value="in_progress">in_progress</option>
                <option value="resolved">resolved</option>
              </select>
              <button type="button" className="danger" onClick={() => removeItem(item.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="pagination-wrap">
        <span>
          Page {safePage} of {totalPages}
        </span>
        <div className="inline-form pagination-controls">
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
            Previous
          </button>
          <button type="button" className="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function HomeContentTab({ apiClient }: { apiClient: typeof api }) {
  const { pushToast } = useAdminToast();
  const [settings, setSettings] = useState<HomeContentSettings>({
    welcomeText: 'Welcome {name}',
    quickActionsTitle: 'Quick actions',
    autoSaveEnabled: false,
    themePreset: 'premium',
    promoWidgetEnabled: false,
    promoWidgetHtml: '',
    promoWidgetChips: [],
    promoWidgetCards: [],
    studentUpdateWidgetEnabled: false,
    studentUpdateWidgetHtml: '',
    studentUpdateWidgetPills: [],
    studentUpdateWidgetCards: [],
    newsCategoryMenu: [],
    jobCategoryMenu: [],
    examCategoryMenu: [],
    sections: [{ id: 'category', title: 'Category', items: ['Math', 'Reasoning', 'English', 'GK'] }],
    quickActionSections: [
      {
        id: 'quick-actions-default',
        title: 'Quick actions',
        items: [
          { title: 'Start test', actionKey: 'startTest', iconKey: 'play' },
          { title: 'Leaderboard', actionKey: 'leaderboard', iconKey: 'trophy' },
          { title: 'Results', actionKey: 'results', iconKey: 'report' },
          { title: 'Tool', actionKey: 'bookmarks', iconKey: 'bookmark' },
        ],
      },
    ],
    banners: [],
    newsSlides: [],
    startSeriesLockSeconds: 20,
    startSeriesActiveWindowMinutes: 30,
  });
  const [newsItems, setNewsItems] = useState<ArticleItem[]>([]);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionItems, setNewSectionItems] = useState('');
  // Keep raw comma-separated text while typing; parse into array only on blur/save.
  // Otherwise, typing a trailing comma gets "eaten" (split+filter removes empty tail).
  const [sectionItemsDraft, setSectionItemsDraft] = useState<Record<string, string>>({});
  const [newQuickSectionTitle, setNewQuickSectionTitle] = useState('');
  const [newQuickSectionItems, setNewQuickSectionItems] = useState('');
  const [newPromoChipTitle, setNewPromoChipTitle] = useState('');
  const [newPromoChipSubtitle, setNewPromoChipSubtitle] = useState('');
  const [newPromoChipIcon, setNewPromoChipIcon] = useState('');
  const [newPromoCardTitle, setNewPromoCardTitle] = useState('');
  const [newPromoCardSubtitle, setNewPromoCardSubtitle] = useState('');
  const [newPromoCardButtonText, setNewPromoCardButtonText] = useState('');
  const [newPromoCardBgColor, setNewPromoCardBgColor] = useState('#1d59b2');
  const [newStudentUpdateCardTitle, setNewStudentUpdateCardTitle] = useState('');
  const [newStudentUpdateCardSubtitle, setNewStudentUpdateCardSubtitle] = useState('');
  const [newStudentUpdateCardIconUrl, setNewStudentUpdateCardIconUrl] = useState('');
  const [newStudentUpdatePillTitle, setNewStudentUpdatePillTitle] = useState('');
  const [newStudentUpdatePillSubtitle, setNewStudentUpdatePillSubtitle] = useState('');
  const [newStudentUpdatePillIcon, setNewStudentUpdatePillIcon] = useState('');
  const [newNewsCategoryMenuTitle, setNewNewsCategoryMenuTitle] = useState('');
  const [newJobCategoryMenuTitle, setNewJobCategoryMenuTitle] = useState('');
  const [newExamCategoryMenuTitle, setNewExamCategoryMenuTitle] = useState('');
  const [previewColumns, setPreviewColumns] = useState<2 | 3 | 4>(3);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const autoSaveReadyRef = useRef(false);
  const homeContentLoadedRef = useRef(false);

  function validateHomeContentDraft(currentSettings: HomeContentSettings): string | null {
    const invalidSection = currentSettings.sections.find(
      (section) =>
        !String(section.title || '').trim() ||
        !Array.isArray(section.items) ||
        section.items.map((item) => String(item || '').trim()).filter(Boolean).length === 0,
    );
    if (invalidSection) {
      return 'Each category section must have a title and at least one item';
    }
    const invalidQuickActionSection = currentSettings.quickActionSections.find(
      (section) =>
        !String(section.title || '').trim() ||
        !Array.isArray(section.items) ||
        section.items.filter((item) => String(item?.title || '').trim() && String(item?.actionKey || '').trim()).length === 0,
    );
    if (invalidQuickActionSection) {
      return 'Each quick action section must have a title and at least one valid action';
    }
    return null;
  }

  async function persistHomeContent(currentSettings: HomeContentSettings, opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    try {
      const draftValidationError = validateHomeContentDraft(currentSettings);
      if (draftValidationError) {
        if (!silent) pushToast('error', draftValidationError);
        return;
      }
      const normalizedSections = currentSettings.sections
        .map((section, idx) => ({
          id: String(section.id || `section-${idx + 1}`),
          title: String(section.title || '').trim(),
          items: (Array.isArray(section.items) ? section.items : [])
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        }))
        .filter((section) => section.title && section.items.length > 0);
      const normalizedQuickActionSections = currentSettings.quickActionSections
        .map((section, idx) => ({
          id: String(section.id || `qa-section-${idx + 1}`),
          title: String(section.title || '').trim(),
          items: (Array.isArray(section.items) ? section.items : [])
            .map((item) => ({
              title: String(item?.title || '').trim(),
              actionKey: String(item?.actionKey || '').trim(),
              iconKey: String(item?.iconKey || '').trim(),
            }))
            .filter((item) => item.title && item.actionKey),
        }))
        .filter((section) => section.title && section.items.length > 0);
      if (normalizedSections.length === 0) {
        if (!silent) pushToast('error', 'At least one Category section with one or more items is required');
        return;
      }
      if (normalizedQuickActionSections.length === 0) {
        if (!silent) pushToast('error', 'At least one Quick actions section with valid actions is required');
        return;
      }
      setSaving(true);
      const enabledChips = currentSettings.promoWidgetChips.filter((x) => x.enabled && x.title.trim());
      const enabledCards = currentSettings.promoWidgetCards.filter((x) => x.enabled && x.title.trim());
      const chipHtml = enabledChips
        .map((chip) => {
          const subtitle = chip.subtitle.trim();
          const icon = chip.icon.trim() || 'tag';
          return `<div style="display:inline-flex;align-items:center;gap:8px;background:#fff;padding:8px 12px;border-radius:12px;border:1px solid #e5e7eb;white-space:nowrap;margin-right:8px;">
            <span style="font-size:12px;color:#1f2937;">${icon}</span>
            <span style="font-size:12px;color:#374151;font-weight:600;">${chip.title}${subtitle ? `: <b>${subtitle}</b>` : ''}</span>
          </div>`;
        })
        .join('');
      const cardHtml = enabledCards
        .map(
          (card) => `<div style="min-width:90%;scroll-snap-align:center;background:${card.bgColor || '#1d59b2'};border-radius:16px;padding:20px;min-height:120px;color:white;">
            <p style="opacity:0.9;font-size:11px;margin:0 0 6px 0;">${card.subtitle || ''}</p>
            <p style="font-size:18px;font-weight:800;margin:0 0 14px 0;">${card.title}</p>
            <button style="background:white;color:${card.bgColor || '#1d59b2'};border:none;border-radius:999px;padding:6px 14px;font-size:11px;font-weight:700;">${card.buttonText || 'Open'}</button>
          </div>`,
        )
        .join('');
      const generatedPromoHtml = `<div style="background:#f5f7f9;padding:10px;">
        <div style="display:flex;overflow:auto;-ms-overflow-style:none;scrollbar-width:none;gap:8px;margin-bottom:12px;">${chipHtml}</div>
        <div style="display:flex;overflow:auto;gap:12px;scroll-snap-type:x mandatory;">${cardHtml}</div>
      </div>`;
      const enabledStudentUpdatePills = currentSettings.studentUpdateWidgetPills.filter((x) => x.enabled && x.title.trim());
      const studentUpdatePillHtml = enabledStudentUpdatePills
        .map((pill) => {
          const subtitle = pill.subtitle.trim();
          const icon = pill.icon.trim() || 'tag';
          return `<div style="display:inline-flex;align-items:center;gap:8px;background:#fff;padding:8px 12px;border-radius:12px;border:1px solid #e5e7eb;white-space:nowrap;margin-right:8px;">
            <span style="font-size:12px;color:#1f2937;">${icon}</span>
            <span style="font-size:12px;color:#374151;font-weight:600;">${pill.title}${subtitle ? `: <b>${subtitle}</b>` : ''}</span>
          </div>`;
        })
        .join('');
      const enabledStudentUpdateCards = currentSettings.studentUpdateWidgetCards.filter((x) => x.enabled && x.title.trim());
      const studentUpdateCardHtml = enabledStudentUpdateCards
        .map((card) => {
          const subtitle = card.subtitle.trim();
          const iconPart = card.iconUrl.trim()
            ? `<img src="${card.iconUrl.trim()}" alt="logo" style="width:32px;height:32px;object-fit:contain;" />`
            : `<div style="width:24px;height:24px;background:#e5e7eb;border-radius:999px;"></div>`;
          return `<div style="min-width:92%;scroll-snap-align:center;background:#ffffff;border-radius:20px;padding:12px 16px;display:flex;align-items:center;border:1px solid #f3f4f6;box-shadow:0 4px 20px -2px rgba(0,0,0,0.05);">
            <div style="flex-shrink:0;margin-right:12px;">
              <div style="width:44px;height:44px;border-radius:999px;border:1px solid #f3f4f6;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f9fafb;">
                ${iconPart}
              </div>
            </div>
            <div style="flex-grow:1;">
              <h3 style="color:#1d2939;font-size:14px;line-height:1.2;font-weight:700;margin:0;">${card.title}</h3>
              <p style="color:#667085;font-size:12px;margin:4px 0 0 0;font-weight:500;">${subtitle}</p>
            </div>
          </div>`;
        })
        .join('');
      const generatedStudentUpdateHtml = `<div style="background:#f5f7f9;padding:10px;">
        <div style="display:flex;overflow:auto;-ms-overflow-style:none;scrollbar-width:none;gap:8px;margin-bottom:12px;">${studentUpdatePillHtml}</div>
        <div style="display:flex;overflow:auto;gap:12px;scroll-snap-type:x mandatory;">${studentUpdateCardHtml}</div>
        <div style="display:flex;justify-content:center;margin-top:12px;gap:4px;">
          <div style="width:16px;height:4px;background:#9ca3af;border-radius:999px;"></div>
          <div style="width:4px;height:4px;background:#e5e7eb;border-radius:999px;"></div>
          <div style="width:4px;height:4px;background:#e5e7eb;border-radius:999px;"></div>
        </div>
      </div>`;
      await apiClient.patch('/admin/settings', {
        homeContent: {
          ...currentSettings,
          sections: normalizedSections,
          quickActionSections: normalizedQuickActionSections,
          promoWidgetHtml: generatedPromoHtml,
          studentUpdateWidgetHtml: generatedStudentUpdateHtml,
        },
      });
      if (!silent) pushToast('success', 'Home content saved.');
    } catch (err: any) {
      if (!silent) pushToast('error', err?.response?.data?.error || 'Failed to save home content');
    } finally {
      setSaving(false);
    }
  }

  async function load() {
    try {
      const [settingsRes, articleRes] = await Promise.all([apiClient.get('/admin/settings'), apiClient.get('/admin/articles')]);
      const res = settingsRes;
      const home = res.data?.settings?.homeContent;
      const allArticles: ArticleItem[] = articleRes.data?.items || [];
      setNewsItems(allArticles.filter((item) => item.feed_kind === 'news' && item.is_published));
      if (home && typeof home === 'object') {
        const loadedSections: HomeContentSection[] = Array.isArray(home.sections)
          ? home.sections.map((s: any, idx: number) => ({
              id: String(s.id || `section-${idx + 1}`),
              title: String(s.title || ''),
              items: Array.isArray(s.items) ? s.items.map((x: any) => String(x)) : [],
            }))
          : [];
        const validSections = loadedSections
          .map((s) => ({
            ...s,
            title: String(s.title || '').trim(),
            items: (Array.isArray(s.items) ? s.items : []).map((x) => String(x || '').trim()).filter(Boolean),
          }))
          .filter((s) => s.title && s.items.length > 0);

        const loadedQuickActionSections: HomeQuickActionSection[] = Array.isArray(home.quickActionSections)
          ? home.quickActionSections.map((s: any, idx: number) => ({
              id: String(s.id || `qa-section-${idx + 1}`),
              title: String(s.title || ''),
              items: Array.isArray(s.items)
                ? s.items.map((x: any) => ({
                    title: String(x.title || ''),
                    actionKey: String(x.actionKey || ''),
                    iconKey: String(x.iconKey || ''),
                  }))
                : [],
            }))
          : [];
        const validQuickActionSections = loadedQuickActionSections
          .map((s) => ({
            ...s,
            title: String(s.title || '').trim(),
            items: (Array.isArray(s.items) ? s.items : [])
              .map((x) => ({
                title: String(x?.title || '').trim(),
                actionKey: String(x?.actionKey || '').trim(),
                iconKey: String(x?.iconKey || '').trim(),
              }))
              .filter((x) => x.title && x.actionKey),
          }))
          .filter((s) => s.title && s.items.length > 0);

        const nextSections: HomeContentSection[] =
          validSections.length > 0
            ? validSections
            : [{ id: 'category', title: 'Category', items: ['Math', 'Reasoning', 'English', 'GK'] }];

        const nextQuickActionSections: HomeQuickActionSection[] =
          validQuickActionSections.length > 0
            ? validQuickActionSections
            : [
                {
                  id: 'quick-actions-default',
                  title: 'Quick actions',
                  items: [
                    { title: 'Start test', actionKey: 'startTest', iconKey: 'play' },
                    { title: 'Leaderboard', actionKey: 'leaderboard', iconKey: 'trophy' },
                    { title: 'Results', actionKey: 'results', iconKey: 'report' },
                    { title: 'Tool', actionKey: 'bookmarks', iconKey: 'bookmark' },
                  ],
                },
              ];

        setSettings({
          welcomeText: String(home.welcomeText || 'Welcome {name}'),
          quickActionsTitle: String(home.quickActionsTitle || 'Quick actions'),
          autoSaveEnabled: home.autoSaveEnabled === true,
          themePreset:
            String(home.themePreset || 'premium').toLowerCase() === 'classic'
              ? 'classic'
              : String(home.themePreset || 'premium').toLowerCase() === 'soft'
              ? 'soft'
              : String(home.themePreset || 'premium').toLowerCase() === 'vibrant'
              ? 'vibrant'
              : 'premium',
          promoWidgetEnabled: home.promoWidgetEnabled === true,
          promoWidgetHtml: String(home.promoWidgetHtml || ''),
          promoWidgetChips: Array.isArray(home.promoWidgetChips)
            ? home.promoWidgetChips.map((chip: any, idx: number) => ({
                id: String(chip.id || `promo-chip-${idx + 1}`),
                title: String(chip.title || ''),
                subtitle: String(chip.subtitle || ''),
                icon: String(chip.icon || ''),
                enabled: chip.enabled !== false,
              }))
            : [],
          promoWidgetCards: Array.isArray(home.promoWidgetCards)
            ? home.promoWidgetCards.map((card: any, idx: number) => ({
                id: String(card.id || `promo-card-${idx + 1}`),
                title: String(card.title || ''),
                subtitle: String(card.subtitle || ''),
                buttonText: String(card.buttonText || ''),
                bgColor: String(card.bgColor || '#1d59b2'),
                enabled: card.enabled !== false,
              }))
            : [],
          studentUpdateWidgetEnabled: home.studentUpdateWidgetEnabled === true || home.billWidgetEnabled === true,
          studentUpdateWidgetHtml: String(home.studentUpdateWidgetHtml || home.billWidgetHtml || ''),
          studentUpdateWidgetPills: Array.isArray(home.studentUpdateWidgetPills)
            ? home.studentUpdateWidgetPills.map((pill: any, idx: number) => ({
                id: String(pill.id || `student-update-pill-${idx + 1}`),
                title: String(pill.title || ''),
                subtitle: String(pill.subtitle || ''),
                icon: String(pill.icon || ''),
                enabled: pill.enabled !== false,
              }))
            : [],
          studentUpdateWidgetCards: Array.isArray(home.studentUpdateWidgetCards)
            ? home.studentUpdateWidgetCards.map((card: any, idx: number) => ({
                id: String(card.id || `student-update-card-${idx + 1}`),
                title: String(card.title || ''),
                subtitle: String(card.subtitle || ''),
                iconUrl: String(card.iconUrl || ''),
                enabled: card.enabled !== false,
              }))
            : Array.isArray(home.billWidgetCards)
            ? home.billWidgetCards.map((card: any, idx: number) => ({
                id: String(card.id || `student-update-card-${idx + 1}`),
                title: String(card.title || ''),
                subtitle: String(card.subtitle || ''),
                iconUrl: String(card.iconUrl || ''),
                enabled: card.enabled !== false,
              }))
            : [],
          newsCategoryMenu: Array.isArray(home.newsCategoryMenu) ? home.newsCategoryMenu.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
          jobCategoryMenu: Array.isArray(home.jobCategoryMenu) ? home.jobCategoryMenu.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
          examCategoryMenu: Array.isArray(home.examCategoryMenu) ? home.examCategoryMenu.map((x: any) => String(x || '').trim()).filter(Boolean) : [],
          sections: nextSections,
          quickActionSections: nextQuickActionSections,
          banners: Array.isArray(home.banners)
            ? home.banners.map((b: any, idx: number) => ({
                id: String(b.id || `banner-${idx + 1}`),
                imageUrl: String(b.imageUrl || ''),
                enabled: b.enabled !== false,
              }))
            : [],
          newsSlides: Array.isArray(home.newsSlides)
            ? home.newsSlides.map((slide: any, idx: number) => ({
                id: String(slide.id || `news-slide-${idx + 1}`),
                articleId: String(slide.articleId || ''),
                headline: String(slide.headline || ''),
                imageUrl: String(slide.imageUrl || ''),
                enabled: slide.enabled !== false,
              }))
            : [],
          startSeriesLockSeconds: Number(home.startSeriesLockSeconds || 20),
          startSeriesActiveWindowMinutes: Number(home.startSeriesActiveWindowMinutes || 30),
        });
        setSectionItemsDraft({});
      }
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load home content');
    } finally {
      homeContentLoadedRef.current = true;
    }
  }

  async function save() {
    await persistHomeContent(settings);
  }

  useEffect(() => {
    homeContentLoadedRef.current = false;
    autoSaveReadyRef.current = false;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!homeContentLoadedRef.current) return;
    if (!autoSaveReadyRef.current) {
      autoSaveReadyRef.current = true;
      return;
    }
    if (!settings.autoSaveEnabled) return;
    if (validateHomeContentDraft(settings)) return;
    const timer = window.setTimeout(() => {
      void persistHomeContent(settings, { silent: true });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [settings]);

  function addSection() {
    const title = newSectionTitle.trim();
    if (!title) return;
    const items = newSectionItems
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    setSettings((p) => ({
      ...p,
      sections: [...p.sections, { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `section-${Date.now()}`, title, items }],
    }));
    setNewSectionTitle('');
    setNewSectionItems('');
  }

  function parseQuickItems(value: string): HomeQuickActionItem[] {
    return value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((pair) => {
        const [title, actionKey, iconKey] = pair.split(':').map((v) => v.trim());
        return { title: title || '', actionKey: actionKey || '', iconKey: iconKey || '' };
      })
      .filter((x) => x.title && x.actionKey);
  }

  function formatQuickItems(items: HomeQuickActionItem[]): string {
    return items
      .map((x) => (x.iconKey ? `${x.title}:${x.actionKey}:${x.iconKey}` : `${x.title}:${x.actionKey}`))
      .join(', ');
  }

  function addQuickActionSection() {
    const title = newQuickSectionTitle.trim();
    if (!title) return;
    const items = parseQuickItems(newQuickSectionItems);
    setSettings((p) => ({
      ...p,
      quickActionSections: [
        ...p.quickActionSections,
        {
          id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `qa-section-${Date.now()}`,
          title,
          items,
        },
      ],
    }));
    setNewQuickSectionTitle('');
    setNewQuickSectionItems('');
  }

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const marker = 'base64,';
        const idx = result.indexOf(marker);
        if (idx === -1) {
          reject(new Error('Failed to process selected image'));
          return;
        }
        resolve(result.slice(idx + marker.length));
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadAndAddBanner() {
    if (!bannerFile) return;
    if (!isAdminUploadImageMime(bannerFile.type)) {
      pushToast('error', 'Unsupported image type (use JPEG, PNG, WebP, GIF, AVIF, or SVG).');
      return;
    }
    if (bannerFile.size > 5 * 1024 * 1024) {
      pushToast('error', 'Image size must be 5MB or less');
      return;
    }
    try {
      setUploadingBanner(true);
      const dataBase64 = await toBase64(bannerFile);
      const res = await apiClient.post('/admin/uploads/banner', {
        fileName: bannerFile.name,
        contentType: bannerFile.type,
        dataBase64,
      });
      const imageUrl = String(res.data?.imageUrl || '').trim();
      if (!imageUrl) throw new Error('Upload response missing image URL');
      const nextSettings: HomeContentSettings = {
        ...settings,
        banners: [...settings.banners, { id: `banner-${Date.now()}`, imageUrl, enabled: true }],
      };
      setSettings(nextSettings);
      await persistHomeContent(nextSettings, { silent: false });
      setBannerFile(null);
      pushToast('success', 'Banner uploaded.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || err?.message || 'Failed to upload banner');
    } finally {
      setUploadingBanner(false);
    }
  }

  function addNewsSlide(article: ArticleItem) {
    const featureImage = String(article.feature_image_url || '').trim();
    if (!featureImage) {
      pushToast('error', 'Add a Feature Image to this news article first (required for slider).');
      return;
    }
    if (settings.newsSlides.some((x) => x.articleId === article.id)) return;
    const nextSettings: HomeContentSettings = {
      ...settings,
      newsSlides: [
        ...settings.newsSlides,
        {
          id: `news-slide-${Date.now()}-${article.id.slice(0, 8)}`,
          articleId: article.id,
          headline: article.headline,
          imageUrl: featureImage,
          enabled: true,
        },
      ],
    };
    setSettings(nextSettings);
    void persistHomeContent(nextSettings, { silent: false });
  }

  function addPromoChip() {
    const title = newPromoChipTitle.trim();
    if (!title) return;
    setSettings((p) => ({
      ...p,
      promoWidgetChips: [
        ...p.promoWidgetChips,
        {
          id: `promo-chip-${Date.now()}`,
          title,
          subtitle: newPromoChipSubtitle.trim(),
          icon: newPromoChipIcon.trim(),
          enabled: true,
        },
      ],
    }));
    setNewPromoChipTitle('');
    setNewPromoChipSubtitle('');
    setNewPromoChipIcon('');
  }

  function addPromoCard() {
    const title = newPromoCardTitle.trim();
    if (!title) return;
    setSettings((p) => ({
      ...p,
      promoWidgetCards: [
        ...p.promoWidgetCards,
        {
          id: `promo-card-${Date.now()}`,
          title,
          subtitle: newPromoCardSubtitle.trim(),
          buttonText: newPromoCardButtonText.trim() || 'Open',
          bgColor: newPromoCardBgColor.trim() || '#1d59b2',
          enabled: true,
        },
      ],
    }));
    setNewPromoCardTitle('');
    setNewPromoCardSubtitle('');
    setNewPromoCardButtonText('');
    setNewPromoCardBgColor('#1d59b2');
  }

  function addStudentUpdateCard() {
    const title = newStudentUpdateCardTitle.trim();
    if (!title) return;
    setSettings((p) => ({
      ...p,
      studentUpdateWidgetCards: [
        ...p.studentUpdateWidgetCards,
        {
          id: `student-update-card-${Date.now()}`,
          title,
          subtitle: newStudentUpdateCardSubtitle.trim(),
          iconUrl: newStudentUpdateCardIconUrl.trim(),
          enabled: true,
        },
      ],
    }));
    setNewStudentUpdateCardTitle('');
    setNewStudentUpdateCardSubtitle('');
    setNewStudentUpdateCardIconUrl('');
  }

  function addStudentUpdatePill() {
    const title = newStudentUpdatePillTitle.trim();
    if (!title) return;
    setSettings((p) => ({
      ...p,
      studentUpdateWidgetPills: [
        ...p.studentUpdateWidgetPills,
        {
          id: `student-update-pill-${Date.now()}`,
          title,
          subtitle: newStudentUpdatePillSubtitle.trim(),
          icon: newStudentUpdatePillIcon.trim(),
          enabled: true,
        },
      ],
    }));
    setNewStudentUpdatePillTitle('');
    setNewStudentUpdatePillSubtitle('');
    setNewStudentUpdatePillIcon('');
  }

  function addNewsCategoryMenuItem() {
    const title = newNewsCategoryMenuTitle.trim();
    if (!title) return;
    setSettings((p) => ({
      ...p,
      newsCategoryMenu: [...p.newsCategoryMenu, title],
    }));
    setNewNewsCategoryMenuTitle('');
  }

  function addJobCategoryMenuItem() {
    const title = newJobCategoryMenuTitle.trim();
    if (!title) return;
    setSettings((p) => ({
      ...p,
      jobCategoryMenu: [...p.jobCategoryMenu, title],
    }));
    setNewJobCategoryMenuTitle('');
  }

  function addExamCategoryMenuItem() {
    const title = newExamCategoryMenuTitle.trim();
    if (!title) return;
    setSettings((p) => ({
      ...p,
      examCategoryMenu: [...p.examCategoryMenu, title],
    }));
    setNewExamCategoryMenuTitle('');
  }

  function toRows<T>(items: T[], columns: number): T[][] {
    const safe = Math.max(1, columns);
    const rows: T[][] = [];
    for (let i = 0; i < items.length; i += safe) rows.push(items.slice(i, i + safe));
    return rows;
  }

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Home Content</h3>
      </div>
      <div className="settings-form">
        <input
          value={'Welcome {name}'}
          readOnly
          disabled
          placeholder="Welcome text"
        />
        <input
          value={settings.quickActionsTitle}
          onChange={(e) => setSettings((p) => ({ ...p, quickActionsTitle: e.target.value }))}
          placeholder="Quick actions title"
        />
        <select
          value={settings.themePreset}
          onChange={(e) => setSettings((p) => ({ ...p, themePreset: e.target.value as 'classic' | 'soft' | 'vibrant' | 'premium' }))}
        >
          <option value="classic">Theme preset: Classic (old default)</option>
          <option value="soft">Theme preset: Soft</option>
          <option value="vibrant">Theme preset: Vibrant</option>
          <option value="premium">Theme preset: Premium</option>
        </select>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.autoSaveEnabled}
            onChange={(e) => setSettings((p) => ({ ...p, autoSaveEnabled: e.target.checked }))}
          />
          Auto save changes (without Save All button)
        </label>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.promoWidgetEnabled}
            onChange={(e) => setSettings((p) => ({ ...p, promoWidgetEnabled: e.target.checked }))}
          />
          Promo section active (show on app home)
        </label>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.studentUpdateWidgetEnabled}
            onChange={(e) => setSettings((p) => ({ ...p, studentUpdateWidgetEnabled: e.target.checked }))}
          />
          Student updates widget active (show on app home)
        </label>
        <input value={newPromoChipTitle} onChange={(e) => setNewPromoChipTitle(e.target.value)} placeholder="Promo pill title" />
        <input value={newPromoChipSubtitle} onChange={(e) => setNewPromoChipSubtitle(e.target.value)} placeholder="Promo pill subtitle (optional)" />
        <input value={newPromoChipIcon} onChange={(e) => setNewPromoChipIcon(e.target.value)} placeholder="Promo pill icon label (e.g. qr, bolt)" />
        <button type="button" onClick={addPromoChip}>Add Promo Pill</button>
        <input value={newPromoCardTitle} onChange={(e) => setNewPromoCardTitle(e.target.value)} placeholder="Color tab title" />
        <input value={newPromoCardSubtitle} onChange={(e) => setNewPromoCardSubtitle(e.target.value)} placeholder="Color tab subtitle" />
        <input value={newPromoCardButtonText} onChange={(e) => setNewPromoCardButtonText(e.target.value)} placeholder="Color tab button text" />
        <input value={newPromoCardBgColor} onChange={(e) => setNewPromoCardBgColor(e.target.value)} placeholder="Color tab background color (e.g. #1d59b2)" />
        <button type="button" onClick={addPromoCard}>Add Color Tab</button>
        <input value={newStudentUpdateCardTitle} onChange={(e) => setNewStudentUpdateCardTitle(e.target.value)} placeholder="Student update card title" />
        <input value={newStudentUpdateCardSubtitle} onChange={(e) => setNewStudentUpdateCardSubtitle(e.target.value)} placeholder="Student update subtitle (optional)" />
        <input value={newStudentUpdateCardIconUrl} onChange={(e) => setNewStudentUpdateCardIconUrl(e.target.value)} placeholder="Student update icon URL (optional)" />
        <button type="button" onClick={addStudentUpdateCard}>Add Student Update Card</button>
        <input value={newStudentUpdatePillTitle} onChange={(e) => setNewStudentUpdatePillTitle(e.target.value)} placeholder="Student update pill title" />
        <input value={newStudentUpdatePillSubtitle} onChange={(e) => setNewStudentUpdatePillSubtitle(e.target.value)} placeholder="Student update pill subtitle (optional)" />
        <input value={newStudentUpdatePillIcon} onChange={(e) => setNewStudentUpdatePillIcon(e.target.value)} placeholder="Student update pill icon label (e.g. new, hot)" />
        <button type="button" onClick={addStudentUpdatePill}>Add Student Update Pill</button>
        <input value={newNewsCategoryMenuTitle} onChange={(e) => setNewNewsCategoryMenuTitle(e.target.value)} placeholder="News menu category (e.g. Education)" />
        <button type="button" onClick={addNewsCategoryMenuItem}>Add News Menu Category</button>
        <input value={newJobCategoryMenuTitle} onChange={(e) => setNewJobCategoryMenuTitle(e.target.value)} placeholder="Job menu category (e.g. Govt Jobs)" />
        <button type="button" onClick={addJobCategoryMenuItem}>Add Job Menu Category</button>
        <input value={newExamCategoryMenuTitle} onChange={(e) => setNewExamCategoryMenuTitle(e.target.value)} placeholder="Exam menu category (e.g. Admit Card)" />
        <button type="button" onClick={addExamCategoryMenuItem}>Add Exam Menu Category</button>
        <input
          type="number"
          min={0}
          max={86400}
          value={settings.startSeriesLockSeconds}
          onChange={(e) => setSettings((p) => ({ ...p, startSeriesLockSeconds: Number(e.target.value || 0) }))}
          placeholder="Start lock seconds"
        />
        <input
          type="number"
          min={1}
          max={10080}
          value={settings.startSeriesActiveWindowMinutes}
          onChange={(e) => setSettings((p) => ({ ...p, startSeriesActiveWindowMinutes: Number(e.target.value || 1) }))}
          placeholder="Active window minutes"
        />
      </div>
      <div className="inline-form">
        <input
          value={newSectionTitle}
          onChange={(e) => setNewSectionTitle(e.target.value)}
          placeholder="New category section title (e.g. Category, Exams, Jobs)"
        />
        <input
          value={newSectionItems}
          onChange={(e) => setNewSectionItems(e.target.value)}
          placeholder="Section items (comma-separated). Example: SSC, Railway, Police, GK"
        />
        <button type="button" onClick={addSection}>
          Add Section
        </button>
      </div>
      <div className="inline-form">
        <input
          value={newQuickSectionTitle}
          onChange={(e) => setNewQuickSectionTitle(e.target.value)}
          placeholder="New quick action section title (e.g. Quick actions)"
        />
        <input
          value={newQuickSectionItems}
          onChange={(e) => setNewQuickSectionItems(e.target.value)}
          placeholder="Quick actions (comma-separated). Format: Label:actionKey:iconKey. Example: Start test:startTest:bolt, Leaderboard:leaderboard:chart"
        />
        <button type="button" onClick={addQuickActionSection}>
          Add Quick Action Section
        </button>
      </div>
      <div className="panel-head">
        <h3>Responsive Preview</h3>
      </div>
      <div className="inline-form">
        <span>Columns preview:</span>
        <button type="button" className={previewColumns === 2 ? '' : 'ghost'} onClick={() => setPreviewColumns(2)}>
          2
        </button>
        <button type="button" className={previewColumns === 3 ? '' : 'ghost'} onClick={() => setPreviewColumns(3)}>
          3
        </button>
        <button type="button" className={previewColumns === 4 ? '' : 'ghost'} onClick={() => setPreviewColumns(4)}>
          4
        </button>
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr' }}>
          <span>Category preview ({previewColumns} columns)</span>
        </div>
        {settings.sections.map((section) => (
          <div key={`preview-cat-${section.id}`} className="row" style={{ gridTemplateColumns: '1fr' }}>
            <div style={{ width: '100%' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{section.title || 'Untitled section'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${previewColumns}, minmax(0,1fr))`, gap: 8 }}>
                {toRows(section.items, previewColumns).flat().map((item, idx) => (
                  <span key={`${section.id}-cat-${idx}`} className="badge">{item}</span>
                ))}
                <span className="badge">See All</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr' }}>
          <span>Quick action preview ({previewColumns} columns)</span>
        </div>
        {settings.quickActionSections.map((section) => (
          <div key={`preview-qa-${section.id}`} className="row" style={{ gridTemplateColumns: '1fr' }}>
            <div style={{ width: '100%' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{section.title || 'Untitled quick section'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${previewColumns}, minmax(0,1fr))`, gap: 8 }}>
                {toRows(section.items, previewColumns).flat().map((item, idx) => (
                  <span key={`${section.id}-qa-${idx}`} className="badge">{item.title || item.actionKey || 'Action'}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <input
          type="file"
          accept={ADMIN_IMAGE_UPLOAD_MIME_TYPES.join(',')}
          onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
        />
        <button type="button" onClick={uploadAndAddBanner} disabled={uploadingBanner || !bannerFile}>
          {uploadingBanner ? 'Uploading...' : 'Upload Banner'}
        </button>
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
          <span>Section</span>
          <span>Items</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.sections.map((section) => (
          <div key={section.id} className="row" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
            <input
              value={section.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  sections: p.sections.map((x) => (x.id === section.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={sectionItemsDraft[section.id] ?? section.items.join(', ')}
              onChange={(e) => setSectionItemsDraft((p) => ({ ...p, [section.id]: e.target.value }))}
              onBlur={() => {
                const raw = String(sectionItemsDraft[section.id] ?? section.items.join(', '));
                const nextItems = raw
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean);
                setSettings((p) => ({
                  ...p,
                  sections: p.sections.map((x) => (x.id === section.id ? { ...x, items: nextItems } : x)),
                }));
                setSectionItemsDraft((p) => {
                  const copy = { ...p };
                  delete copy[section.id];
                  return copy;
                });
              }}
            />
            <button type="button" onClick={save}>
              Save
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => {
                  if (p.sections.length <= 1) {
                    pushToast('error', 'At least one Category section is required.');
                    return p;
                  }
                  return {
                    ...p,
                    sections: p.sections.filter((x) => x.id !== section.id),
                  };
                })
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 120px 120px' }}>
          <span>Published News (Add to slider)</span>
          <span>Add</span>
          <span>Open</span>
        </div>
        {newsItems.map((article) => (
          <div key={article.id} className="row" style={{ gridTemplateColumns: '2fr 120px 120px' }}>
            <span title={article.summary || ''}>{article.headline}</span>
            <button
              type="button"
              onClick={() => addNewsSlide(article)}
              disabled={settings.newsSlides.some((x) => x.articleId === article.id) || !String(article.feature_image_url || '').trim()}
              title={!String(article.feature_image_url || '').trim() ? 'Add a feature image first' : undefined}
            >
              {settings.newsSlides.some((x) => x.articleId === article.id) ? 'Added' : 'Add'}
            </button>
            <button type="button" className="ghost" onClick={() => window.open(article.link_url || '', '_blank')} disabled={!article.link_url}>
              Link
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1.4fr 1.4fr 120px 90px 90px 90px' }}>
          <span>News headline</span>
          <span>Banner Image URL</span>
          <span>Enabled</span>
          <span>Up</span>
          <span>Down</span>
          <span>Delete</span>
        </div>
        {settings.newsSlides.map((slide, index) => (
          <div key={slide.id} className="row" style={{ gridTemplateColumns: '1.4fr 1.4fr 120px 90px 90px 90px' }}>
            <input
              value={slide.headline}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  newsSlides: p.newsSlides.map((x) => (x.id === slide.id ? { ...x, headline: e.target.value } : x)),
                }))
              }
            />
            <input
              value={slide.imageUrl}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  newsSlides: p.newsSlides.map((x) => (x.id === slide.id ? { ...x, imageUrl: e.target.value } : x)),
                }))
              }
              placeholder="Paste news image URL"
            />
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={slide.enabled}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    newsSlides: p.newsSlides.map((x) => (x.id === slide.id ? { ...x, enabled: e.target.checked } : x)),
                  }))
                }
              />
              on
            </label>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setSettings((p) => {
                  if (index === 0) return p;
                  const next = [...p.newsSlides];
                  const tmp = next[index - 1];
                  next[index - 1] = next[index];
                  next[index] = tmp;
                  return { ...p, newsSlides: next };
                })
              }
              disabled={index === 0}
            >
              Up
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setSettings((p) => {
                  if (index >= p.newsSlides.length - 1) return p;
                  const next = [...p.newsSlides];
                  const tmp = next[index + 1];
                  next[index + 1] = next[index];
                  next[index] = tmp;
                  return { ...p, newsSlides: next };
                })
              }
              disabled={index >= settings.newsSlides.length - 1}
            >
              Down
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  newsSlides: p.newsSlides.filter((x) => x.id !== slide.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '2fr 120px 90px 90px' }}>
          <span>Banner Image</span>
          <span>Enabled</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.banners.map((banner) => (
          <div key={banner.id} className="row" style={{ gridTemplateColumns: '2fr 120px 90px 90px' }}>
            <input
              value={banner.imageUrl}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  banners: p.banners.map((x) => (x.id === banner.id ? { ...x, imageUrl: e.target.value } : x)),
                }))
              }
            />
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={banner.enabled}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    banners: p.banners.map((x) => (x.id === banner.id ? { ...x, enabled: e.target.checked } : x)),
                  }))
                }
              />
              on
            </label>
            <button type="button" onClick={save}>
              Save
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  banners: p.banners.filter((x) => x.id !== banner.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
          <span>Quick Action Section</span>
          <span>Items (title:key:icon)</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.quickActionSections.map((section) => (
          <div key={section.id} className="row" style={{ gridTemplateColumns: '1fr 2fr 90px 90px' }}>
            <input
              value={section.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  quickActionSections: p.quickActionSections.map((x) => (x.id === section.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={formatQuickItems(section.items)}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  quickActionSections: p.quickActionSections.map((x) =>
                    x.id === section.id
                      ? {
                          ...x,
                          items: parseQuickItems(e.target.value),
                        }
                      : x,
                  ),
                }))
              }
            />
            <button type="button" onClick={save}>
              Save
            </button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => {
                  if (p.quickActionSections.length <= 1) {
                    pushToast('error', 'At least one Quick actions section is required.');
                    return p;
                  }
                  return {
                    ...p,
                    quickActionSections: p.quickActionSections.filter((x) => x.id !== section.id),
                  };
                })
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1fr 120px 90px 90px' }}>
          <span>Promo Pill Title</span>
          <span>Subtitle / Icon</span>
          <span>Enabled</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.promoWidgetChips.map((chip) => (
          <div key={chip.id} className="row" style={{ gridTemplateColumns: '1fr 1fr 120px 90px 90px' }}>
            <input
              value={chip.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetChips: p.promoWidgetChips.map((x) => (x.id === chip.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={`${chip.subtitle}${chip.icon ? ` | ${chip.icon}` : ''}`}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetChips: p.promoWidgetChips.map((x) =>
                    x.id === chip.id
                      ? {
                          ...x,
                          subtitle: e.target.value.split('|')[0]?.trim() || '',
                          icon: e.target.value.split('|')[1]?.trim() || '',
                        }
                      : x,
                  ),
                }))
              }
            />
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={chip.enabled}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    promoWidgetChips: p.promoWidgetChips.map((x) => (x.id === chip.id ? { ...x, enabled: e.target.checked } : x)),
                  }))
                }
              />
              on
            </label>
            <button type="button" onClick={save}>Save</button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetChips: p.promoWidgetChips.filter((x) => x.id !== chip.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1fr 120px 120px 90px 90px' }}>
          <span>Color Tab Title</span>
          <span>Subtitle</span>
          <span>Button</span>
          <span>BG Color</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.promoWidgetCards.map((card) => (
          <div key={card.id} className="row" style={{ gridTemplateColumns: '1fr 1fr 120px 120px 90px 90px' }}>
            <input
              value={card.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetCards: p.promoWidgetCards.map((x) => (x.id === card.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={card.subtitle}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetCards: p.promoWidgetCards.map((x) => (x.id === card.id ? { ...x, subtitle: e.target.value } : x)),
                }))
              }
            />
            <input
              value={card.buttonText}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetCards: p.promoWidgetCards.map((x) => (x.id === card.id ? { ...x, buttonText: e.target.value } : x)),
                }))
              }
            />
            <input
              value={card.bgColor}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetCards: p.promoWidgetCards.map((x) => (x.id === card.id ? { ...x, bgColor: e.target.value } : x)),
                }))
              }
            />
            <button type="button" onClick={save}>Save</button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  promoWidgetCards: p.promoWidgetCards.filter((x) => x.id !== card.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
          <span>News Menu Category</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.newsCategoryMenu.map((title, index) => (
          <div key={`${title}-${index}`} className="row" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
            <input
              value={title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  newsCategoryMenu: p.newsCategoryMenu.map((x, i) => (i === index ? e.target.value : x)),
                }))
              }
            />
            <button type="button" onClick={save}>Save</button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  newsCategoryMenu: p.newsCategoryMenu.filter((_, i) => i !== index),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
          <span>Job Menu Category</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.jobCategoryMenu.map((title, index) => (
          <div key={`${title}-${index}`} className="row" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
            <input
              value={title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  jobCategoryMenu: p.jobCategoryMenu.map((x, i) => (i === index ? e.target.value : x)),
                }))
              }
            />
            <button type="button" onClick={save}>Save</button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  jobCategoryMenu: p.jobCategoryMenu.filter((_, i) => i !== index),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
          <span>Exam Menu Category</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.examCategoryMenu.map((title, index) => (
          <div key={`${title}-${index}`} className="row" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
            <input
              value={title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  examCategoryMenu: p.examCategoryMenu.map((x, i) => (i === index ? e.target.value : x)),
                }))
              }
            />
            <button type="button" onClick={save}>Save</button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  examCategoryMenu: p.examCategoryMenu.filter((_, i) => i !== index),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1fr 120px 90px 90px' }}>
          <span>Student Update Pill</span>
          <span>Subtitle / Icon</span>
          <span>Enabled</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.studentUpdateWidgetPills.map((pill) => (
          <div key={pill.id} className="row" style={{ gridTemplateColumns: '1fr 1fr 120px 90px 90px' }}>
            <input
              value={pill.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  studentUpdateWidgetPills: p.studentUpdateWidgetPills.map((x) => (x.id === pill.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={`${pill.subtitle}${pill.icon ? ` | ${pill.icon}` : ''}`}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  studentUpdateWidgetPills: p.studentUpdateWidgetPills.map((x) =>
                    x.id === pill.id
                      ? {
                          ...x,
                          subtitle: e.target.value.split('|')[0]?.trim() || '',
                          icon: e.target.value.split('|')[1]?.trim() || '',
                        }
                      : x,
                  ),
                }))
              }
            />
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={pill.enabled}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    studentUpdateWidgetPills: p.studentUpdateWidgetPills.map((x) => (x.id === pill.id ? { ...x, enabled: e.target.checked } : x)),
                  }))
                }
              />
              on
            </label>
            <button type="button" onClick={save}>Save</button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  studentUpdateWidgetPills: p.studentUpdateWidgetPills.filter((x) => x.id !== pill.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="list table">
        <div className="row row-head" style={{ gridTemplateColumns: '1fr 1fr 1fr 120px 90px 90px' }}>
          <span>Student Update Title</span>
          <span>Subtitle</span>
          <span>Icon URL</span>
          <span>Enabled</span>
          <span>Update</span>
          <span>Delete</span>
        </div>
        {settings.studentUpdateWidgetCards.map((card) => (
          <div key={card.id} className="row" style={{ gridTemplateColumns: '1fr 1fr 1fr 120px 90px 90px' }}>
            <input
              value={card.title}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  studentUpdateWidgetCards: p.studentUpdateWidgetCards.map((x) => (x.id === card.id ? { ...x, title: e.target.value } : x)),
                }))
              }
            />
            <input
              value={card.subtitle}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  studentUpdateWidgetCards: p.studentUpdateWidgetCards.map((x) => (x.id === card.id ? { ...x, subtitle: e.target.value } : x)),
                }))
              }
            />
            <input
              value={card.iconUrl}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  studentUpdateWidgetCards: p.studentUpdateWidgetCards.map((x) => (x.id === card.id ? { ...x, iconUrl: e.target.value } : x)),
                }))
              }
            />
            <label className="check-wrap">
              <input
                type="checkbox"
                checked={card.enabled}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    studentUpdateWidgetCards: p.studentUpdateWidgetCards.map((x) => (x.id === card.id ? { ...x, enabled: e.target.checked } : x)),
                  }))
                }
              />
              on
            </label>
            <button type="button" onClick={save}>Save</button>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSettings((p) => ({
                  ...p,
                  studentUpdateWidgetCards: p.studentUpdateWidgetCards.filter((x) => x.id !== card.id),
                }))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <button type="button" className="ghost" onClick={load}>
          Load
        </button>
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save All'}
        </button>
      </div>
    </section>
  );
}

function PollSettingsTab({ apiClient }: { apiClient: typeof api }) {
  return <PollSettingsTabImpl apiClient={apiClient} />;
}

function PushNotificationSettingsTab({ apiClient }: { apiClient: typeof api }) {
  return <PushNotificationSettingsTabImpl apiClient={apiClient} />;
}

function NotificationSchedulingTab({ apiClient }: { apiClient: typeof api }) {
  return <NotificationSchedulingTabImpl apiClient={apiClient} />;
}

function PublishSchedulingTab({ apiClient }: { apiClient: typeof api }) {
  return <PublishSchedulingTabImpl apiClient={apiClient} />;
}

function SubmitApplicationContentTab({ apiClient }: { apiClient: typeof api }) {
  return <SubmitApplicationContentTabImpl apiClient={apiClient} />;
}

function ShareContentTab({ apiClient }: { apiClient: typeof api }) {
  return <ShareContentTabImpl apiClient={apiClient} />;
}

function InstructionContentTab({ apiClient }: { apiClient: typeof api }) {
  return <InstructionContentTabImpl apiClient={apiClient} />;
}

function ExamCategoriesTab({ apiClient }: { apiClient: typeof api }) {
  return <ExamCategoriesTabImpl apiClient={apiClient} />;
}

function SettingsTab({ apiClient, isSuperAdmin }: { apiClient: typeof api; isSuperAdmin: boolean }) {
  const { pushToast } = useAdminToast();
  const [settings, setSettings] = useState<AppSettings>({
    maintenanceMode: false,
    maintenanceMessage: '',
    registrationOpen: true,
    jobExamArticleAnnouncementEmail: true,
    emailEventToggles: { ...DEFAULT_EMAIL_EVENT_TOGGLES },
    resultUnlockEmailSettings: { enabled: true, delayHours: 3 },
    adminImageExportFormats: { ...DEFAULT_ADMIN_IMAGE_EXPORT_FORMATS },
  });
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/settings');
      const incoming = res.data?.settings || {};
      setSettings(pickGlobalSettingsFields(incoming));
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!isSuperAdmin) return;
    try {
      setLoading(true);
      const res = await apiClient.patch('/admin/settings', globalSettingsPatchPayload(settings));
      setSettings(pickGlobalSettingsFields(res.data?.settings || settings));
      pushToast('success', 'Settings saved.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Global Settings</h3>
      </div>
      <div className="inline-form">
        <button onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Load Settings'}</button>
      </div>
      <div className="settings-form">
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.maintenanceMode}
            onChange={(e) => setSettings((p) => ({ ...p, maintenanceMode: e.target.checked }))}
            disabled={!isSuperAdmin}
          />
          Maintenance mode
        </label>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.registrationOpen}
            onChange={(e) => setSettings((p) => ({ ...p, registrationOpen: e.target.checked }))}
            disabled={!isSuperAdmin}
          />
          Registration open
        </label>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.resultUnlockEmailSettings?.enabled !== false}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                resultUnlockEmailSettings: {
                  enabled: e.target.checked,
                  delayHours: Number(p.resultUnlockEmailSettings?.delayHours ?? 3),
                },
              }))
            }
            disabled={!isSuperAdmin}
          />
          Result unlock emails enabled
        </label>
        <label className="check-wrap">
          <input
            type="checkbox"
            checked={settings.jobExamArticleAnnouncementEmail !== false}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                jobExamArticleAnnouncementEmail: e.target.checked,
              }))
            }
            disabled={!isSuperAdmin}
          />
          Job / Exam article announcement emails
        </label>
        {EMAIL_EVENT_TOGGLE_FIELDS.map((item) => (
          <label key={item.key} className="check-wrap">
            <input
              type="checkbox"
              checked={settings.emailEventToggles?.[item.key] !== false}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  emailEventToggles: {
                    ...DEFAULT_EMAIL_EVENT_TOGGLES,
                    ...(p.emailEventToggles || {}),
                    [item.key]: e.target.checked,
                  },
                }))
              }
              disabled={!isSuperAdmin}
            />
            {item.label}
          </label>
        ))}
        <p className="muted" style={{ margin: '12px 0 6px', fontSize: '0.9rem', fontWeight: 600 }}>
          Admin image uploads (banners and article images)
        </p>
        {ADMIN_IMAGE_EXPORT_CHECKBOXES.map((item) => (
          <label key={item.key} className="check-wrap">
            <input
              type="checkbox"
              checked={settings.adminImageExportFormats?.[item.key] === true}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  adminImageExportFormats: {
                    ...DEFAULT_ADMIN_IMAGE_EXPORT_FORMATS,
                    ...(p.adminImageExportFormats || {}),
                    [item.key]: e.target.checked,
                  },
                }))
              }
              disabled={!isSuperAdmin}
            />
            {item.label}
          </label>
        ))}
        <input
          type="number"
          min={0}
          max={168}
          value={String(settings.resultUnlockEmailSettings?.delayHours ?? 3)}
          onChange={(e) =>
            setSettings((p) => ({
              ...p,
              resultUnlockEmailSettings: {
                enabled: p.resultUnlockEmailSettings?.enabled !== false,
                delayHours: Number(e.target.value || '0'),
              },
            }))
          }
          placeholder="Result unlock delay (hours)"
          disabled={!isSuperAdmin || settings.resultUnlockEmailSettings?.enabled === false}
        />
        <input
          value={settings.maintenanceMessage}
          onChange={(e) => setSettings((p) => ({ ...p, maintenanceMessage: e.target.value }))}
          placeholder="Maintenance message"
          disabled={!isSuperAdmin}
        />
      </div>
      {isSuperAdmin ? (
        <button onClick={save} disabled={loading}>Save Settings</button>
      ) : (
        <button disabled title="Only super admin can update settings">Restricted</button>
      )}
    </section>
  );
}

function AuditLogsTab({ apiClient, isSuperAdmin }: { apiClient: typeof api; isSuperAdmin: boolean }) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm } = useAdminDialog();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(50);
  const [auditTotal, setAuditTotal] = useState(0);
  const [clearing, setClearing] = useState(false);

  async function fetchLogs(page: number) {
    const p = Math.max(1, page);
    try {
      const offset = (p - 1) * auditPageSize;
      const res = await apiClient.get('/admin/audit-logs', {
        params: { limit: auditPageSize, offset },
      });
      const total = Number(res.data?.total ?? 0);
      const rows = res.data?.items || [];
      const totalPages = Math.max(1, Math.ceil(total / auditPageSize));
      const clampedPage = Math.min(p, totalPages);
      if (clampedPage !== p && total > 0) {
        const offset2 = (clampedPage - 1) * auditPageSize;
        const res2 = await apiClient.get('/admin/audit-logs', {
          params: { limit: auditPageSize, offset: offset2 },
        });
        setAuditPage(clampedPage);
        setItems(res2.data?.items || []);
        setAuditTotal(Number(res2.data?.total ?? total));
        return;
      }
      setAuditPage(clampedPage);
      setItems(rows);
      setAuditTotal(total);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load audit logs');
    }
  }

  useEffect(() => {
    void fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditPageSize]);

  async function clearAllLogs() {
    const ok = await adminConfirm({
      title: 'Clear all audit logs?',
      message: 'This permanently deletes every audit log row in the database. This cannot be undone. Only proceed if you are sure.',
      confirmLabel: 'Clear all',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      setClearing(true);
      const res = await apiClient.delete('/admin/audit-logs');
      const deleted = Number(res.data?.deleted ?? 0);
      pushToast('success', deleted > 0 ? `Cleared ${deleted} audit log row(s).` : 'Audit log table was already empty.');
      setAuditPage(1);
      await fetchLogs(1);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to clear audit logs');
    } finally {
      setClearing(false);
    }
  }

  const totalAuditPages = Math.max(1, Math.ceil(auditTotal / auditPageSize) || 1);
  const safeAuditPage = Math.min(auditPage, totalAuditPages);
  const auditRangeStart = auditTotal === 0 ? 0 : (safeAuditPage - 1) * auditPageSize + 1;
  const auditRangeEnd = Math.min(safeAuditPage * auditPageSize, auditTotal);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>Audit Logs</h3>
      </div>
      <div className="inline-form">
        <label className="check-wrap" style={{ gap: 8 }}>
          Rows per page
          <select
            value={auditPageSize}
            onChange={(e) => {
              setAuditPageSize(Number(e.target.value) || 50);
              setAuditPage(1);
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button type="button" onClick={() => void fetchLogs(safeAuditPage)}>
          Refresh
        </button>
        {isSuperAdmin ? (
          <button type="button" className="danger" onClick={() => void clearAllLogs()} disabled={clearing || auditTotal === 0}>
            {clearing ? 'Clearing…' : 'Clear all logs'}
          </button>
        ) : (
          <button type="button" className="ghost" disabled title="Only super admin can clear audit logs">
            Clear all logs
          </button>
        )}
      </div>
      <div className="list table audit-table">
        <div className="row row-head">
          <span>Time</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Target</span>
          <span>Details</span>
        </div>
        {items.map((item) => (
          <div key={item.id} className="row">
            <span>{new Date(item.created_at).toLocaleString()}</span>
            <span>{item.actor_name || item.actor_email || '-'}</span>
            <span>{item.action_type}</span>
            <span>{item.target_type}:{item.target_id || '-'}</span>
            <span>{JSON.stringify(item.details_json || {})}</span>
          </div>
        ))}
      </div>
      <div className="pagination-wrap">
        <span>
          Page {safeAuditPage} of {totalAuditPages}
        </span>
        <span>
          Showing {auditRangeStart}-{auditRangeEnd} of {auditTotal}
        </span>
        <div className="inline-form pagination-controls">
          <button
            type="button"
            className="ghost"
            onClick={() => void fetchLogs(safeAuditPage - 1)}
            disabled={safeAuditPage <= 1}
          >
            Previous
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void fetchLogs(safeAuditPage + 1)}
            disabled={safeAuditPage >= totalAuditPages}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
const USERS_PAGE_SIZE = 50;

function UsersTab({ apiClient, isSuperAdmin }: { apiClient: typeof api; isSuperAdmin: boolean }) {
  const { pushToast } = useAdminToast();
  const { confirm: adminConfirm, prompt: adminPrompt } = useAdminDialog();
  const [items, setItems] = useState<UserItem[]>([]);
  const [query, setQuery] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    void fetchUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUsers(page: number) {
    const p = Math.max(1, page);
    setUsersLoading(true);
    try {
      const offset = (p - 1) * USERS_PAGE_SIZE;
      const res = await apiClient.get('/admin/users', {
        params: { q: query, limit: USERS_PAGE_SIZE, offset },
      });
      const total = Number(res.data?.total ?? 0);
      const rows = res.data?.items || [];
      const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
      const clampedPage = Math.min(p, totalPages);
      if (clampedPage !== p && total > 0) {
        const offset2 = (clampedPage - 1) * USERS_PAGE_SIZE;
        const res2 = await apiClient.get('/admin/users', {
          params: { q: query, limit: USERS_PAGE_SIZE, offset: offset2 },
        });
        setUsersPage(clampedPage);
        setItems(res2.data?.items || []);
        setUsersTotal(Number(res2.data?.total ?? total));
        return;
      }
      setUsersPage(clampedPage);
      setItems(rows);
      setUsersTotal(total);
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }

  async function toggleAdmin(user: UserItem) {
    try {
      const nextIsAdmin = !user.is_admin;
      await apiClient.patch(`/admin/users/${user.id}/admin`, {
        isAdmin: nextIsAdmin,
        // Dropping admin must clear super-admin too (one step back to normal user).
        isSuperAdmin: nextIsAdmin ? user.is_super_admin : false,
      });
      await fetchUsers(usersPage);
      pushToast('success', 'Admin role updated.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to update admin role');
    }
  }

  async function toggleSuperAdmin(user: UserItem) {
    try {
      await apiClient.patch(`/admin/users/${user.id}/admin`, {
        isAdmin: true,
        isSuperAdmin: !user.is_super_admin,
      });
      await fetchUsers(usersPage);
      pushToast('success', 'Super admin role updated.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to update admin role');
    }
  }

  async function toggleBan(user: UserItem) {
    const shouldBan = !user.is_banned;
    let reason = '';
    if (shouldBan) {
      const entered = await adminPrompt({
        title: `Ban user — ${user.email}`,
        description: 'This reason may be shown to the user or in admin logs.',
        defaultValue: user.ban_reason || 'Policy violation',
        placeholder: 'Ban reason',
        confirmLabel: 'Ban user',
        cancelLabel: 'Cancel',
        required: true,
        multiline: true,
        rows: 3,
      });
      if (entered === null) return;
      reason = entered;
    }
    try {
      await apiClient.patch(`/admin/users/${user.id}/ban`, {
        isBanned: shouldBan,
        banReason: reason.trim(),
      });
      await fetchUsers(usersPage);
      pushToast('success', shouldBan ? 'User banned.' : 'User unbanned.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to update ban status');
    }
  }

  async function revokeSessions(user: UserItem) {
    const ok = await adminConfirm({
      title: 'Revoke all sessions?',
      message: `All active logins for ${user.email} will be signed out.`,
      confirmLabel: 'Revoke',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.post(`/admin/users/${user.id}/revoke-sessions`);
      await fetchUsers(usersPage);
      pushToast('success', 'Sessions revoked.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to revoke sessions');
    }
  }

  async function deleteUser(user: UserItem) {
    const ok = await adminConfirm({
      title: 'Delete user permanently?',
      message: `Account ${user.email} will be removed. This cannot be undone.`,
      confirmLabel: 'Delete user',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/admin/users/${user.id}`);
      await fetchUsers(usersPage);
      pushToast('success', 'User deleted.');
    } catch (err: any) {
      pushToast('error', err?.response?.data?.error || 'Failed to delete user');
    }
  }

  const totalUsersPages = Math.max(1, Math.ceil(usersTotal / USERS_PAGE_SIZE));
  const safeUsersPage = Math.min(usersPage, totalUsersPages);
  const usersRangeStart = usersTotal === 0 ? 0 : (safeUsersPage - 1) * USERS_PAGE_SIZE + 1;
  const usersRangeEnd = Math.min(safeUsersPage * USERS_PAGE_SIZE, usersTotal);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h3>User Access Control</h3>
      </div>
      <div className="inline-form">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email, phone, or user id" />
        <button type="button" onClick={() => void fetchUsers(1)} disabled={usersLoading}>
          {usersLoading ? 'Loading…' : 'Search / refresh'}
        </button>
      </div>
      <div className="list table users-table">
        <div className="row row-head">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Ban Status</span>
          <span>Actions</span>
        </div>
        {usersLoading && items.length === 0 ? (
          <div className="row" style={{ gridColumn: '1 / -1', padding: '16px', color: 'var(--text-muted, #5f6b7a)' }}>
            Loading users…
          </div>
        ) : null}
        {!usersLoading && items.length === 0 ? (
          <div className="row" style={{ gridColumn: '1 / -1', padding: '16px', color: 'var(--text-muted, #5f6b7a)' }}>
            {query.trim() ? 'No users match this search.' : 'No users yet.'}
          </div>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="row">
            <span>{item.display_name || '-'}</span>
            <span>{item.email}</span>
            <span>{item.is_super_admin ? 'Super Admin' : item.is_admin ? 'Admin' : 'User'}</span>
            <span>{item.is_banned ? `Banned: ${item.ban_reason || 'No reason'}` : 'Active'}</span>
            {isSuperAdmin ? (
              <div className="inline-form users-table-actions">
                {isProtectedSuperAdminEmail(item.email) ? (
                  <span
                    title="Permanent super admin — admin, ban, delete and session revoke controls are disabled"
                    style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}
                  >
                    Protected super admin
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={() => toggleAdmin(item)}>
                      {item.is_admin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    <button type="button" onClick={() => toggleSuperAdmin(item)}>
                      {item.is_super_admin ? 'Remove Super Admin' : 'Make Super Admin'}
                    </button>
                    <button type="button" className="ghost" onClick={() => toggleBan(item)}>
                      {item.is_banned ? 'Unban User' : 'Ban User'}
                    </button>
                    <button type="button" className="ghost" onClick={() => revokeSessions(item)}>
                      Revoke sessions
                    </button>
                    <button type="button" className="danger" onClick={() => deleteUser(item)}>
                      Delete user
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button disabled title="Only super admin can change roles and user access">
                Restricted
              </button>
            )}
          </div>
        ))}
      </div>
      {usersTotal > 0 ? (
        <div className="pagination-wrap users-pagination-wrap">
          <span>
            Page {safeUsersPage} of {totalUsersPages} ({USERS_PAGE_SIZE} / page)
          </span>
          <span>
            Showing {usersRangeStart}–{usersRangeEnd} of {usersTotal}
          </span>
          <div className="inline-form pagination-controls">
            <button
              type="button"
              className="ghost"
              onClick={() => void fetchUsers(safeUsersPage - 1)}
              disabled={usersLoading || safeUsersPage <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void fetchUsers(safeUsersPage + 1)}
              disabled={usersLoading || safeUsersPage >= totalUsersPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function UserManagementAdvancedTab({ apiClient, isSuperAdmin }: { apiClient: typeof api; isSuperAdmin: boolean }) {
  return <UserManagementAdvancedTabImpl apiClient={apiClient} isSuperAdmin={isSuperAdmin} />;
}

export default App;

