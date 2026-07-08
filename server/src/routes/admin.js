'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { normalizeFeedKindSlug, FEED_KIND_INVALID_HINT } = require('../constants/articleFeeds');
const { getArticleFeedKindList, setArticleFeedKindList } = require('../lib/articleFeedKindOptions');
const { getArticleCategoryList, setArticleCategoryList } = require('../lib/articleCategoryOptions');
const {
  buildCampaignDedupeKey,
  sendPushToAudience,
} = require('../lib/pushAudienceDelivery');
const {
  hashDeviceToken,
  createCampaign,
  finalizeCampaignCounts,
  insertDeliveryEventsBatch,
  getCampaignSummary,
  getLatestCampaignForPushItem,
  listCampaignEvents,
} = require('../lib/pushCampaignAnalytics');
const {
  isMailConfigured,
  sendSupportJourneyEmail,
  sendAdminRoleGrantedEmail,
} = require('../mail');
const {
  syncTestPublishScheduleFromAdvancedConfig,
  savePublishSchedulingItems,
} = require('../lib/testVisibility');
const {
  buildTestPublishNotificationPayload,
} = require('../lib/notificationScheduling');
const { enqueueNotificationSchedulingItem } = require('../lib/notificationSchedulingQueue');
const {
  triggerTestPublishAnnouncementEmail,
  mergePublishEmailDedupeKey,
  preserveServerAdvancedFields,
  queueContentAnnouncementEmails,
} = require('../lib/publishAnnouncementEmail');
const {
  trimNotificationSchedulingPayload,
  trimPublishSchedulingItems,
} = require('../lib/schedulingQueueLimits');
const { runSchedulingQueueCleanup } = require('../lib/schedulingQueueCleanup');
const { syncTestQuestionCount } = require('../lib/syncTestQuestionCount');
const {
  INPUT_MIME_TO_EXT,
  normalizeAdminImageExportFormats,
  processAdminImageUpload,
} = require('../lib/adminImageUpload');
const { clampMcqCorrectIndex, verifyDbRowMcqInvariant } = require('../mcqShuffle');
const {
  normalizeSubjectSectionsInput,
  parseQuestionSubjectKey,
} = require('../util/subjectSections');
const { selectQuestionsFromSubcategoryPool } = require('../lib/subcategoryPoolSelection');
const {
  PROTECTED_SUPER_ADMIN_EMAILS,
  isProtectedSuperAdminDbEmail,
} = require('../constants/protectedSuperAdminEmails');
const {
  getPermissionCatalogResponse,
  loadStoredPermissionKeys,
  getEffectiveAdminPermissions,
  replaceAdminUserPermissions,
  clearAdminPermissions,
} = require('../lib/adminPermissions');
const { adminPermissionGuard } = require('../middleware/adminPermissionGuard');
const { buildAdminTestCycleFields } = require('../lib/adminTestCycleStatus');
const { resolveAdminCycleStartUpdate } = require('../lib/testCycleWindow');
const { loadPublishScheduleItemsSafe } = require('../lib/testResolve');
const { republishTestNow } = require('../lib/testRepublishNow');
const { buildPublishSchedulingDiagnostics } = require('../lib/publishScheduleDiagnostics');

const router = express.Router();
router.use(adminPermissionGuard);

/** Rolling cap for DB audit trail (Admin → Audit Logs). Oldest rows deleted once count exceeds this. */
function getAdminAuditLogMaxRows() {
  const raw = Number(process.env.ADMIN_AUDIT_LOG_MAX_ROWS);
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
  return Math.min(10_000, Math.max(10, n));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const BANNERS_DIR = path.join(UPLOADS_DIR, 'banners');
const ARTICLES_IMAGES_DIR = path.join(UPLOADS_DIR, 'articles');

function ensureBannerDir() {
  if (!fs.existsSync(BANNERS_DIR)) {
    fs.mkdirSync(BANNERS_DIR, { recursive: true });
  }
}

function ensureArticleImagesDir() {
  if (!fs.existsSync(ARTICLES_IMAGES_DIR)) {
    fs.mkdirSync(ARTICLES_IMAGES_DIR, { recursive: true });
  }
}

function toPublicBannerUrl(req, fileName) {
  const explicitBase = String(process.env.PUBLIC_BASE_URL || '').trim();
  const base = explicitBase || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/banners/${fileName}`;
}

function toPublicArticleImageUrl(req, fileName) {
  const explicitBase = String(process.env.PUBLIC_BASE_URL || '').trim();
  const base = explicitBase || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/articles/${fileName}`;
}

const SETTINGS_KEYS = [
  'maintenanceMode',
  'maintenanceMessage',
  'registrationOpen',
  'profileMenuItems',
  'homeContent',
  'examSnapCard',
  'pollSettings',
  'pushNotificationSettings',
  'dailyQuizSettings',
  'submitApplicationContent',
  'instructionContent',
  'examCategories',
  'signupRegions',
  'examCategoryIconOptions',
  'notificationScheduling',
  'publishScheduling',
  'helpSupportInbox',
  'feedbackInbox',
  'reportIssueInbox',
  'helpSupportContent',
  'achievementContent',
  'shareContent',
  'dailyDigestShareContent',
  'dailyQuizShareContent',
  'privacyPolicyContent',
  'termsOfUseContent',
  'testAdvancedConfigs',
  'resultUnlockEmailSettings',
  'emailEventToggles',
  'jobExamArticleAnnouncementEmail',
  'adminImageExportFormats',
];

const DEFAULT_EMAIL_EVENT_TOGGLES = {
  welcome: true,
  security_alert: true,
  admin_login_alert: true,
  help_support_ack: true,
  feedback_ack: true,
  issue_report_ack: true,
  profile_reminder: true,
  admin_content_alert: true,
  result_unlocked: true,
  mock_test_starting_soon: true,
  missed_test_followup: true,
  streak_risk_alert: true,
  weekly_performance_report: true,
  rank_milestone: true,
  new_content_by_interest: true,
  re_engagement: true,
  birthday: true,
  admin_role_granted: true,
};

function normalizeProfileMenuItems(value) {
  if (!Array.isArray(value)) return { error: 'profileMenuItems must be an array' };
  const items = value.map((item, index) => {
    const safe = item || {};
    const id = String(safe.id || `item-${index + 1}`).trim().slice(0, 60);
    const title = String(safe.title || '').trim().slice(0, 80);
    const subtitle = String(safe.subtitle || '').trim().slice(0, 180);
    const path = String(safe.path || '').trim().slice(0, 180);
    const enabled = safe.enabled !== false;
    return { id, title, subtitle, path, enabled };
  });
  if (items.some((x) => !x.title || !x.path)) {
    return { error: 'Each profile menu item requires title and path' };
  }
  return { value: items };
}

const DEFAULT_HOME_CONTENT_SECTIONS = [
  { id: 'category', title: 'Category', items: ['Math', 'Reasoning', 'English', 'GK'] },
];
const DEFAULT_HOME_QUICK_ACTION_SECTIONS = [
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

/** Global Settings save used to include `homeContent: {}` from GET — ignore empty accidental patches. */
function isMeaningfulHomeContentPatch(value) {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).length > 0;
}

function applyHomeContentDefaults(home) {
  const safe = home && typeof home === 'object' ? { ...home } : {};
  const rawSections = Array.isArray(safe.sections) ? safe.sections : [];
  const validSections = rawSections.filter((section) => {
    const s = section || {};
    const title = String(s.title || '').trim();
    const items = Array.isArray(s.items) ? s.items.map((x) => String(x || '').trim()).filter(Boolean) : [];
    return title && items.length > 0;
  });
  if (validSections.length === 0) {
    safe.sections = DEFAULT_HOME_CONTENT_SECTIONS;
  }
  const rawQuick = Array.isArray(safe.quickActionSections) ? safe.quickActionSections : [];
  const validQuick = rawQuick.filter((section) => {
    const s = section || {};
    const title = String(s.title || '').trim();
    const items = Array.isArray(s.items)
      ? s.items.filter((item) => String(item?.title || '').trim() && String(item?.actionKey || '').trim())
      : [];
    return title && items.length > 0;
  });
  if (validQuick.length === 0) {
    safe.quickActionSections = DEFAULT_HOME_QUICK_ACTION_SECTIONS;
  }
  return safe;
}

function normalizeHomeContent(value) {
  const safe = value || {};
  // Keep header personalization stable across all devices.
  // Admin cannot override this with hardcoded names.
  const welcomeText = 'Welcome {name}';
  const quickActionsTitle = String(safe.quickActionsTitle || '').trim().slice(0, 80);
  const autoSaveEnabled = safe.autoSaveEnabled === true;
  const themePresetRaw = String(safe.themePreset || 'premium').trim().toLowerCase();
  const themePreset = ['classic', 'soft', 'vibrant', 'premium'].includes(themePresetRaw) ? themePresetRaw : 'premium';
  const promoWidgetEnabled = safe.promoWidgetEnabled === true;
  const promoWidgetHtml = String(safe.promoWidgetHtml || '').slice(0, 50000);
  const studentUpdateWidgetEnabled = safe.studentUpdateWidgetEnabled === true || safe.billWidgetEnabled === true;
  const studentUpdateWidgetHtml = String(safe.studentUpdateWidgetHtml || safe.billWidgetHtml || '').slice(0, 50000);
  const rawPromoWidgetChips = Array.isArray(safe.promoWidgetChips) ? safe.promoWidgetChips : [];
  const rawPromoWidgetCards = Array.isArray(safe.promoWidgetCards) ? safe.promoWidgetCards : [];
  const rawStudentUpdateWidgetCards = Array.isArray(safe.studentUpdateWidgetCards)
    ? safe.studentUpdateWidgetCards
    : Array.isArray(safe.billWidgetCards)
    ? safe.billWidgetCards
    : [];
  const rawStudentUpdateWidgetPills = Array.isArray(safe.studentUpdateWidgetPills) ? safe.studentUpdateWidgetPills : [];
  const rawNewsCategoryMenu = Array.isArray(safe.newsCategoryMenu) ? safe.newsCategoryMenu : [];
  const rawJobCategoryMenu = Array.isArray(safe.jobCategoryMenu) ? safe.jobCategoryMenu : [];
  const rawExamCategoryMenu = Array.isArray(safe.examCategoryMenu) ? safe.examCategoryMenu : [];
  const promoWidgetChips = rawPromoWidgetChips
    .map((chip, index) => {
      const x = chip || {};
      return {
        id: String(x.id || `promo-chip-${index + 1}`).trim().slice(0, 60),
        title: String(x.title || '').trim().slice(0, 80),
        subtitle: String(x.subtitle || '').trim().slice(0, 120),
        icon: String(x.icon || '').trim().slice(0, 40),
        enabled: x.enabled !== false,
      };
    })
    .filter((x) => x.title);
  const promoWidgetCards = rawPromoWidgetCards
    .map((card, index) => {
      const x = card || {};
      return {
        id: String(x.id || `promo-card-${index + 1}`).trim().slice(0, 60),
        title: String(x.title || '').trim().slice(0, 120),
        subtitle: String(x.subtitle || '').trim().slice(0, 240),
        buttonText: String(x.buttonText || '').trim().slice(0, 60),
        bgColor: String(x.bgColor || '').trim().slice(0, 20),
        enabled: x.enabled !== false,
      };
    })
    .filter((x) => x.title);
  const studentUpdateWidgetCards = rawStudentUpdateWidgetCards
    .map((card, index) => {
      const x = card || {};
      return {
        id: String(x.id || `student-update-card-${index + 1}`).trim().slice(0, 60),
        title: String(x.title || '').trim().slice(0, 120),
        subtitle: String(x.subtitle || '').trim().slice(0, 160),
        iconUrl: String(x.iconUrl || '').trim().slice(0, 800),
        enabled: x.enabled !== false,
      };
    })
    .filter((x) => x.title);
  const studentUpdateWidgetPills = rawStudentUpdateWidgetPills
    .map((pill, index) => {
      const x = pill || {};
      return {
        id: String(x.id || `student-update-pill-${index + 1}`).trim().slice(0, 60),
        title: String(x.title || '').trim().slice(0, 80),
        subtitle: String(x.subtitle || '').trim().slice(0, 120),
        icon: String(x.icon || '').trim().slice(0, 40),
        enabled: x.enabled !== false,
      };
    })
    .filter((x) => x.title);
  const newsCategoryMenu = rawNewsCategoryMenu
    .map((x) => String(x || '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
  const jobCategoryMenu = rawJobCategoryMenu
    .map((x) => String(x || '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
  const examCategoryMenu = rawExamCategoryMenu
    .map((x) => String(x || '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
  const rawSections = Array.isArray(safe.sections) ? safe.sections : [];
  const rawQuickActionSections = Array.isArray(safe.quickActionSections) ? safe.quickActionSections : [];
  const rawBanners = Array.isArray(safe.banners) ? safe.banners : [];
  /** When true, applied tests unlock only at exam date/slot; when false, start immediately after apply. */
  const startSeriesScheduleTimerEnabled = safe.startSeriesScheduleTimerEnabled === true;
  const sections = rawSections.map((section, index) => {
    const s = section || {};
    const title = String(s.title || '').trim().slice(0, 80);
    const items = Array.isArray(s.items)
      ? s.items.map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 12)
      : [];
    return {
      id: String(s.id || `section-${index + 1}`).trim().slice(0, 60),
      title,
      items,
    };
  });
  if (sections.some((x) => !x.title)) {
    return { error: 'Each section requires a title' };
  }
  if (sections.length === 0) {
    return { error: 'At least one section is required' };
  }
  if (sections.some((x) => x.items.length === 0)) {
    return { error: 'Each section requires at least one item' };
  }
  const quickActionSections = rawQuickActionSections.map((section, index) => {
    const s = section || {};
    const title = String(s.title || '').trim().slice(0, 80);
    const rawItems = Array.isArray(s.items) ? s.items : [];
    const items = rawItems
      .map((item) => ({
        title: String((item || {}).title || '').trim().slice(0, 60),
        actionKey: String((item || {}).actionKey || '').trim().slice(0, 50),
        iconKey: String((item || {}).iconKey || '').trim().slice(0, 40),
      }))
      .filter((x) => x.title && x.actionKey)
      .slice(0, 20);
    return {
      id: String(s.id || `qa-section-${index + 1}`).trim().slice(0, 60),
      title,
      items,
    };
  });
  if (quickActionSections.some((x) => !x.title)) {
    return { error: 'Each quick action section requires a title' };
  }
  if (quickActionSections.length === 0) {
    return { error: 'At least one quick action section is required' };
  }
  if (quickActionSections.some((x) => x.items.length === 0)) {
    return { error: 'Each quick action section requires at least one valid action' };
  }
  const banners = rawBanners
    .map((banner, index) => {
      const b = banner || {};
      return {
        id: String(b.id || `banner-${index + 1}`).trim().slice(0, 60),
        imageUrl: String(b.imageUrl || '').trim().slice(0, 800),
        enabled: b.enabled !== false,
      };
    })
    .filter((x) => x.imageUrl);
  const rawNewsSlides = Array.isArray(safe.newsSlides) ? safe.newsSlides : [];
  const newsSlides = rawNewsSlides
    .map((slide, index) => {
      const x = slide || {};
      return {
        id: String(x.id || `news-slide-${index + 1}`).trim().slice(0, 60),
        articleId: String(x.articleId || '').trim().slice(0, 120),
        headline: String(x.headline || '').trim().slice(0, 220),
        imageUrl: String(x.imageUrl || '').trim().slice(0, 800),
        enabled: x.enabled !== false,
      };
    })
    .filter((x) => x.articleId && x.imageUrl);
  return {
    value: {
      welcomeText,
      quickActionsTitle,
      autoSaveEnabled,
      themePreset,
      promoWidgetEnabled,
      promoWidgetHtml,
      promoWidgetChips,
      promoWidgetCards,
      studentUpdateWidgetEnabled,
      studentUpdateWidgetHtml,
      studentUpdateWidgetPills,
      studentUpdateWidgetCards,
      newsCategoryMenu,
      jobCategoryMenu,
      examCategoryMenu,
      sections,
      quickActionSections,
      banners,
      newsSlides,
      startSeriesScheduleTimerEnabled,
    },
  };
}

function DEFAULT_EXAM_SNAP_CARD() {
  return {
    registrationLeft: '● Registration: Open',
    registrationRight: '● Last Date: 20 May 2026',
    sessionInfo: 'ADMISSION SESSION: 2026-27',
    examTitle: 'CUET (UG) 2026',
    conductingBody: 'National Testing Agency (NTA)',
    courseLabel: 'कोर्स (Courses)',
    courseValue: 'BA, B.Sc, B.Com',
    eligLabel: 'योग्यता (Elig.)',
    eligValue: '12th Pass/App.',
    examModeLabel: 'एग्जाम मोड',
    examModeValue: 'Hybrid (CBT/Pen)',
    feeLabel: 'आवेदन शुल्क',
    feeValue: '₹750 (Gen/OBC)',
    examDateLabel: 'परीक्षा तिथि (Exam Date)',
    examDateValue: '15 मई - 31 मई 2026',
    universitiesLabel: 'कुल यूनिवर्सिटी',
    universitiesValue: '250+ Universities',
    markingLabel: 'मार्किंग स्कीम',
    markingValue: '+5 Correct | -1 Wrong',
    patternLabel: 'Exam Pattern',
    patternValue: 'Sec 1: Lang | Sec 2: Domain | Sec 3: Gen. Test',
    brandName: 'Entrance Master',
    brandSubtitle: 'Get App on Play Store',
    qrImageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://nta.ac.in',
  };
}

function sliceStr(raw, fallback, maxLen) {
  const s = String(raw !== undefined && raw !== null ? raw : fallback).trim();
  return s.slice(0, maxLen);
}

function normalizeExamSnapCard(value) {
  const d = DEFAULT_EXAM_SNAP_CARD();
  const safe = value && typeof value === 'object' ? value : {};
  const qrRaw = sliceStr(safe.qrImageUrl, d.qrImageUrl, 800);
  const qrImageUrl = /^https:\/\//i.test(qrRaw) ? qrRaw : d.qrImageUrl;
  return {
    value: {
      registrationLeft: sliceStr(safe.registrationLeft, d.registrationLeft, 160),
      registrationRight: sliceStr(safe.registrationRight, d.registrationRight, 160),
      sessionInfo: sliceStr(safe.sessionInfo, d.sessionInfo, 120),
      examTitle: sliceStr(safe.examTitle, d.examTitle, 120),
      conductingBody: sliceStr(safe.conductingBody, d.conductingBody, 160),
      courseLabel: sliceStr(safe.courseLabel, d.courseLabel, 80),
      courseValue: sliceStr(safe.courseValue, d.courseValue, 120),
      eligLabel: sliceStr(safe.eligLabel, d.eligLabel, 80),
      eligValue: sliceStr(safe.eligValue, d.eligValue, 120),
      examModeLabel: sliceStr(safe.examModeLabel, d.examModeLabel, 80),
      examModeValue: sliceStr(safe.examModeValue, d.examModeValue, 120),
      feeLabel: sliceStr(safe.feeLabel, d.feeLabel, 80),
      feeValue: sliceStr(safe.feeValue, d.feeValue, 120),
      examDateLabel: sliceStr(safe.examDateLabel, d.examDateLabel, 100),
      examDateValue: sliceStr(safe.examDateValue, d.examDateValue, 120),
      universitiesLabel: sliceStr(safe.universitiesLabel, d.universitiesLabel, 100),
      universitiesValue: sliceStr(safe.universitiesValue, d.universitiesValue, 120),
      markingLabel: sliceStr(safe.markingLabel, d.markingLabel, 100),
      markingValue: sliceStr(safe.markingValue, d.markingValue, 120),
      patternLabel: sliceStr(safe.patternLabel, d.patternLabel, 80),
      patternValue: sliceStr(safe.patternValue, d.patternValue, 240),
      brandName: sliceStr(safe.brandName, d.brandName, 80),
      brandSubtitle: sliceStr(safe.brandSubtitle, d.brandSubtitle, 120),
      qrImageUrl,
    },
  };
}

function normalizePollSettings(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items)
    ? safe.items
    : safe.question
    ? [
        {
          id: String(safe.id || `poll-${Date.now()}`),
          question: safe.question,
          options: safe.options,
          allowMultiple: safe.allowMultiple,
          durationMinutes: safe.durationMinutes,
          enabled: safe.enabled,
          createdAt: safe.createdAt || new Date().toISOString(),
        },
      ]
    : [];
  const items = rawItems
    .map((item, index) => {
      const x = item || {};
      const options = Array.isArray(x.options)
        ? x.options.map((v) => String(v || '').trim().slice(0, 80)).filter(Boolean).slice(0, 8)
        : [];
      return {
        id: String(x.id || `poll-${index + 1}`).trim().slice(0, 60),
        question: String(x.question || '').trim().slice(0, 240),
        options,
        allowMultiple: Boolean(x.allowMultiple),
        durationMinutes: Math.max(1, Math.min(10080, Number(x.durationMinutes || 1440))),
        enabled: x.enabled !== false,
        createdAt: String(x.createdAt || new Date().toISOString()).slice(0, 40),
      };
    })
    .filter((x) => x.question);
  return {
    value: {
      showHomePopup: safe.showHomePopup !== false,
      items,
    },
  };
}

function normalizePushNotificationSettings(value) {
  const safe = value || {};
  const allowedTargets = ['all', 'new_users', 'active_users'];
  const rawItems = Array.isArray(safe.items)
    ? safe.items
    : safe.title || safe.message
    ? [
        {
          id: String(safe.id || `push-${Date.now()}`),
          title: safe.title,
          message: safe.message,
          target: safe.target,
          deepLink: safe.deepLink,
          scheduledAt: safe.scheduledAt,
          enabled: safe.enabled,
          status: safe.status || 'draft',
          resendCount: safe.resendCount,
          lastSentAt: safe.lastSentAt,
          createdAt: safe.createdAt || new Date().toISOString(),
        },
      ]
    : [];
  const items = rawItems
    .map((item, index) => {
      const x = item || {};
      const target = String(x.target || 'all').trim().toLowerCase();
      const status = String(x.status || 'draft').trim().toLowerCase();
      return {
        id: String(x.id || `push-${index + 1}`).trim().slice(0, 60),
        title: String(x.title || '').trim().slice(0, 100),
        message: String(x.message || '').trim().slice(0, 300),
        target: allowedTargets.includes(target) ? target : 'all',
        deepLink: String(x.deepLink || '').trim().slice(0, 300),
        scheduledAt: String(x.scheduledAt || '').trim().slice(0, 40),
        enabled: x.enabled !== false,
        status: ['draft', 'sent'].includes(status) ? status : 'draft',
        resendCount: Math.max(0, Number(x.resendCount || 0)),
        lastSentAt: String(x.lastSentAt || '').trim().slice(0, 40),
        createdAt: String(x.createdAt || new Date().toISOString()).slice(0, 40),
      };
    })
    .filter((x) => x.title || x.message);
  return {
    value: {
      items,
    },
  };
}

function normalizeDailyQuizSettings(value) {
  const safe = value || {};
  return {
    value: {
      releaseHour: Math.max(0, Math.min(23, Number(safe.releaseHour ?? 10))),
      releaseMinute: Math.max(0, Math.min(59, Number(safe.releaseMinute ?? 0))),
      timezoneOffsetMinutes: Math.max(-720, Math.min(840, Number(safe.timezoneOffsetMinutes ?? 330))),
    },
  };
}

function normalizeSubmitApplicationContent(value) {
  const safe = value || {};
  const title = String(safe.title || 'Apply').trim().slice(0, 80);
  const benefitsTitle = String(safe.benefitsTitle || 'What you’ll get').trim().slice(0, 120);
  const submitButtonLabel = String(safe.submitButtonLabel || 'Submit Application').trim().slice(0, 80);
  const successMessage = String(safe.successMessage || 'Your application was submitted successfully.').trim().slice(0, 280);
  const rawBulletItems = Array.isArray(safe.bulletItems) ? safe.bulletItems : [];
  const bulletItems = rawBulletItems
    .map((x) => String(x || '').trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, 30);
  return {
    value: {
      title,
      benefitsTitle,
      submitButtonLabel,
      successMessage,
      bulletItems,
    },
  };
}

function normalizeInstructionContent(value) {
  const safe = value || {};
  const pageTitle = String(safe.pageTitle || 'Instructions').trim().slice(0, 80);
  const cardTitle = String(safe.cardTitle || 'Please read carefully').trim().slice(0, 120);
  const startButtonLabel = String(safe.startButtonLabel || 'Start Test').trim().slice(0, 80);
  const submitDialogBrand = String(safe.submitDialogBrand || 'Mockers').trim().slice(0, 60);
  const submitDialogTitle = String(safe.submitDialogTitle || 'Are you sure want to submit test').trim().slice(0, 120);
  const submitDialogSubtitle = String(safe.submitDialogSubtitle || "After submitting test you won't be able to re-attempt").trim().slice(0, 180);
  const postSubmitCardTitle = String(safe.postSubmitCardTitle || 'Result Pending').trim().slice(0, 80);
  const postSubmitCardReadyTitle = String(safe.postSubmitCardReadyTitle || 'Result Ready').trim().slice(0, 80);
  const postSubmitCardDateLabel = String(safe.postSubmitCardDateLabel || 'Result date/time').trim().slice(0, 120);
  const postSubmitCardPendingMessage = String(safe.postSubmitCardPendingMessage || 'Result will be available in').trim().slice(0, 180);
  const postSubmitCardReadyMessage = String(safe.postSubmitCardReadyMessage || 'Result is now available.').trim().slice(0, 180);
  const postSubmitCardButtonLabel = String(safe.postSubmitCardButtonLabel || 'Show Result').trim().slice(0, 80);
  const postSubmitCardRawLines = Array.isArray(safe.postSubmitCardLines) ? safe.postSubmitCardLines : [];
  const postSubmitCardLines = postSubmitCardRawLines
    .map((x) => String(x || '').trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 20);
  const navigationModeRaw = String(safe.questionNavigationMode || 'sequential').trim().toLowerCase();
  const questionNavigationMode = navigationModeRaw === 'free' ? 'free' : 'sequential';
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const items = rawItems
    .map((x) => String(x || '').trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 40);
  return {
    value: {
      pageTitle,
      cardTitle,
      startButtonLabel,
      submitDialogBrand,
      submitDialogTitle,
      submitDialogSubtitle,
      postSubmitCardTitle,
      postSubmitCardReadyTitle,
      postSubmitCardDateLabel,
      postSubmitCardPendingMessage,
      postSubmitCardReadyMessage,
      postSubmitCardButtonLabel,
      postSubmitCardLines,
      questionNavigationMode,
      items,
    },
  };
}

function normalizeExamCategories(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const items = rawItems
    .map((item, index) => {
      const x = item || {};
      return {
        id: String(x.id || `exam-cat-${index + 1}`).trim().slice(0, 60),
        level1: String(x.level1 || '').trim().slice(0, 80),
        level2: String(x.level2 || '').trim().slice(0, 80),
        level3: String(x.level3 || '').trim().slice(0, 80),
        iconKey: String(x.iconKey || '').trim().slice(0, 40),
        enabled: x.enabled !== false,
      };
    })
    .filter((x) => x.level1 && x.level2 && x.level3);
  return { value: { items } };
}

function normalizeSignupRegions(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const normalizedByState = new Map();
  for (let index = 0; index < rawItems.length; index += 1) {
    const x = rawItems[index] || {};
    const state = String(x.state || '').trim().slice(0, 80);
    if (!state) continue;
    const rawDistricts = Array.isArray(x.districts) ? x.districts : [];
    const districtSet = new Set(
      rawDistricts.map((d) => String(d || '').trim().slice(0, 80)).filter(Boolean),
    );
    if (!districtSet.size) {
      districtSet.add('Other / Not listed');
    }
    const existing = normalizedByState.get(state.toLowerCase());
    if (existing) {
      for (const d of districtSet) existing.districts.add(d);
    } else {
      normalizedByState.set(state.toLowerCase(), {
        state,
        districts: districtSet,
      });
    }
  }
  const items = Array.from(normalizedByState.values())
    .map((row) => ({
      state: row.state,
      districts: Array.from(row.districts).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.state.localeCompare(b.state))
    .slice(0, 200);
  return { value: { items } };
}

function normalizeExamCategoryIconOptions(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const items = rawItems
    .map((item, index) => {
      const x = item || {};
      return {
        id: String(x.id || `exam-icon-${index + 1}`).trim().slice(0, 60),
        value: String(x.value || '').trim().slice(0, 40).toLowerCase(),
        label: String(x.label || '').trim().slice(0, 80),
      };
    })
    .filter((x) => x.value && x.label);
  return { value: { items } };
}

function normalizeNotificationScheduling(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const allowedTargets = ['all', 'new_users', 'active_users'];
  const allowedStatus = ['scheduled', 'sent', 'failed', 'cancelled'];
  const allowedRepeat = ['none', 'daily', 'weekly', 'monthly'];
  const items = rawItems
    .map((item, index) => {
      const x = item || {};
      const target = String(x.target || 'all').trim().toLowerCase();
      const status = String(x.status || 'scheduled').trim().toLowerCase();
      const repeatType = String(x.repeatType || 'none').trim().toLowerCase();
      const dayOfWeek = Math.max(0, Math.min(6, Number(x.dayOfWeek || 1)));
      const dayOfMonth = Math.max(1, Math.min(31, Number(x.dayOfMonth || 1)));
      return {
        id: String(x.id || `schedule-${index + 1}`).trim().slice(0, 60),
        title: String(x.title || '').trim().slice(0, 100),
        message: String(x.message || '').trim().slice(0, 300),
        target: allowedTargets.includes(target) ? target : 'all',
        segmentKey: String(x.segmentKey || '').trim().slice(0, 120),
        scheduleAt: String(x.scheduleAt || '').trim().slice(0, 80),
        repeatType: allowedRepeat.includes(repeatType) ? repeatType : 'none',
        dayOfWeek,
        dayOfMonth,
        repeatUntil: String(x.repeatUntil || '').trim().slice(0, 80),
        status: allowedStatus.includes(status) ? status : 'scheduled',
        createdAt: String(x.createdAt || new Date().toISOString()).slice(0, 40),
        sentAt: String(x.sentAt || '').trim().slice(0, 40),
        deepLink: String(x.deepLink || '').trim().slice(0, 300),
        dedupeKey: String(x.dedupeKey || '').trim().slice(0, 200),
      };
    })
    .filter((x) => x.title && x.message);
  return { value: { items } };
}

function normalizeSupportInbox(value) {
  const safe = value || {};
  const rawItems = Array.isArray(safe.items) ? safe.items : Array.isArray(value) ? value : [];
  const allowedStatus = ['new', 'in_progress', 'resolved'];
  const items = rawItems
    .map((item, index) => {
      const x = item || {};
      const status = String(x.status || 'new').trim().toLowerCase();
      return {
        id: String(x.id || `inbox-${index + 1}`).trim().slice(0, 80),
        userId: String(x.userId || '').trim().slice(0, 60),
        userEmail: String(x.userEmail || '').trim().slice(0, 320).toLowerCase(),
        user: String(x.user || '').trim().slice(0, 80),
        publicId: String(x.publicId != null && x.publicId !== '' ? x.publicId : x.sixDigitPublicId || '')
          .trim()
          .slice(0, 32),
        subject: String(x.subject || '').trim().slice(0, 180),
        message: String(x.message || '').trim().slice(0, 600),
        createdAt: String(x.createdAt || new Date().toISOString()).trim().slice(0, 40),
        status: allowedStatus.includes(status) ? status : 'new',
      };
    })
    .filter((x) => x.user && x.subject && x.message);
  return { value: { items } };
}

function normalizeSimpleContent(value, fallbackTitle) {
  const safe = value || {};
  return {
    value: {
      title: String(safe.title || fallbackTitle).trim().slice(0, 120),
      body: String(safe.body || '').trim().slice(0, 10000),
    },
  };
}

function normalizeResultUnlockEmailSettings(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const enabled = safe.enabled !== false;
  const delayHours = Number(safe.delayHours ?? 3);
  if (!Number.isFinite(delayHours) || !Number.isInteger(delayHours) || delayHours < 0 || delayHours > 168) {
    return { error: 'resultUnlockEmailSettings.delayHours must be an integer between 0 and 168' };
  }
  return { value: { enabled, delayHours } };
}

function normalizeEmailEventToggles(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_EMAIL_EVENT_TOGGLES)) {
    out[key] = safe[key] !== false;
  }
  return { value: out };
}

function normalizeAdminImageExportFormatsPatch(body) {
  if (body === undefined) return null;
  return { value: normalizeAdminImageExportFormats(body) };
}

/** Keep newest N rows by created_at (then id); delete older rows. Best-effort after each audit insert. */
async function pruneAdminAuditLogsRolling() {
  const cap = getAdminAuditLogMaxRows();
  try {
    await pool.query(
      `DELETE FROM admin_audit_logs
       WHERE id IN (
         SELECT id FROM (
           SELECT id
           FROM admin_audit_logs
           ORDER BY created_at DESC NULLS LAST, id DESC
           OFFSET $1
         ) AS doomed
       )`,
      [cap],
    );
  } catch (e) {
    console.error('audit_log_prune_failed', e.message || e);
  }
}

async function logAdminAction(req, actionType, targetType, targetId, details) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (
         actor_user_id, action_type, target_type, target_id, details_json, request_ip, user_agent
       ) VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        req.userId,
        actionType,
        targetType,
        targetId ? String(targetId) : null,
        JSON.stringify(details || {}),
        String(req.ip || ''),
        String(req.headers['user-agent'] || ''),
      ],
    );
  } catch (e) {
    console.error('audit_log_failed', e.message || e);
    return;
  }
  await pruneAdminAuditLogsRolling();
}

async function getJsonSetting(settingKey, fallback) {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
    [settingKey],
  );
  if (!rows[0]) return fallback;
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || ''));
    return parsed ?? fallback;
  } catch (_e) {
    return fallback;
  }
}

async function setJsonSetting(settingKey, value, userId) {
  let payload = value;
  if (settingKey === 'notificationScheduling') {
    payload = trimNotificationSchedulingPayload(value);
  } else if (settingKey === 'publishScheduling') {
    const items = Array.isArray(value?.items) ? value.items : [];
    payload = {
      ...(value && typeof value === 'object' ? value : {}),
      items: trimPublishSchedulingItems(items),
    };
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, $3::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [settingKey, JSON.stringify(payload), userId],
  );
}

async function loadSubjectSectionsForTest(testId) {
  const advancedMap = await getJsonSetting('testAdvancedConfigs', {});
  return normalizeSubjectSectionsInput((resolveAdvancedConfigForTest(advancedMap, testId) || {}).subjectSections || []);
}

/** Returns error message string or null when OK. */
async function assertQuestionSubjectAllowed(testId, subjectKey) {
  const sections = await loadSubjectSectionsForTest(testId);
  if (!sections.length) {
    return null;
  }
  const sk = String(subjectKey || '').trim();
  if (!sk) {
    return 'This test defines subject sections — each question must include subjectKey matching one of those keys.';
  }
  const allowed = new Set(sections.map((s) => s.key));
  if (!allowed.has(sk)) {
    return `subjectKey must be one of: ${[...allowed].sort().join(', ')}`;
  }
  return null;
}

function normalizeDailyQuizItem(raw, fallbackId) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = String(src.id || fallbackId || '').trim() || `dq-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const questionPrompt = String(src.questionPrompt || '').trim().slice(0, 500);
  const optionA = String(src.optionA || '').trim().slice(0, 180);
  const optionB = String(src.optionB || '').trim().slice(0, 180);
  const optionC = String(src.optionC || '').trim().slice(0, 180);
  const optionD = String(src.optionD || '').trim().slice(0, 180);
  const correctIndex = Number(src.correctIndex);
  const explanation = String(src.explanation || '').trim().slice(0, 1500);
  const isPublished = src.isPublished !== false;
  if (!questionPrompt || !optionA || !optionB || !optionC || !optionD) return null;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;
  return {
    id,
    questionPrompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correctIndex,
    explanation,
    isPublished,
    createdAt: String(src.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };
}

async function enqueueNotification(userId, payload) {
  return enqueueNotificationSchedulingItem(payload, userId);
}

async function appendPushNotificationItem(userId, payload) {
  const current = await getJsonSetting('pushNotificationSettings', { items: [] });
  const existing = Array.isArray(current.items) ? current.items : [];
  const nowIso = new Date().toISOString();
  const item = {
    id: `push-manual-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    title: String(payload.title || '').trim().slice(0, 100),
    message: String(payload.message || '').trim().slice(0, 300),
    target: ['all', 'new_users', 'active_users'].includes(String(payload.target || '').trim().toLowerCase())
      ? String(payload.target || '').trim().toLowerCase()
      : 'all',
    deepLink: String(payload.deepLink || '').trim().slice(0, 300),
    scheduledAt: '',
    enabled: true,
    status: 'sent',
    resendCount: 0,
    lastSentAt: nowIso,
    createdAt: nowIso,
  };
  await setJsonSetting(
    'pushNotificationSettings',
    { items: [item, ...existing].slice(0, 200) },
    userId,
  );
}

function shuffleArray(arr) {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/**
 * Publish-time / pool-regenerate option shuffle — WRITES to DB.
 * Permutes all four choice columns and remaps correct_index to the same option text.
 * Not the same as per-user delivery shuffle in tests.js (read-only JSON).
 * See /SHUFFLE_AND_ATTEMPT_RULES.txt §3A.
 */
function shuffleQuestionOptions(row) {
  const sourceOld = clampMcqCorrectIndex(row.correct_index);
  const options = [
    { text: row.choice_a, oldIndex: 0 },
    { text: row.choice_b, oldIndex: 1 },
    { text: row.choice_c, oldIndex: 2 },
    { text: row.choice_d, oldIndex: 3 },
  ];
  const shuffled = shuffleArray(options);
  const newCorrectIndex = shuffled.findIndex((x) => x.oldIndex === sourceOld);
  if (newCorrectIndex < 0) {
    const fallback = {
      stem: row.stem,
      choice_a: row.choice_a,
      choice_b: row.choice_b,
      choice_c: row.choice_c,
      choice_d: row.choice_d,
      correct_index: sourceOld,
      explanation: row.explanation || '',
    };
    const invariant = verifyDbRowMcqInvariant(fallback);
    if (!invariant.ok) {
      console.error('shuffleQuestionOptions_invariant_failed', invariant);
    }
    return fallback;
  }
  const out = {
    stem: row.stem,
    choice_a: shuffled[0]?.text || '',
    choice_b: shuffled[1]?.text || '',
    choice_c: shuffled[2]?.text || '',
    choice_d: shuffled[3]?.text || '',
    correct_index: newCorrectIndex,
    explanation: row.explanation || '',
  };
  const invariant = verifyDbRowMcqInvariant(out);
  if (!invariant.ok) {
    console.error('shuffleQuestionOptions_invariant_failed', invariant);
  }
  return out;
}

async function withPgTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Rebuilds a published test's question rows from the subcategory pool.
 * Deletes existing rows for this test_id, then inserts pool picks with shuffleQuestionOptions.
 * Runs on first publish (justPublished). See SHUFFLE_AND_ATTEMPT_RULES.txt §3A.
 *
 * When [options.client] is provided, runs inside the caller's transaction (no nested BEGIN/COMMIT).
 */
async function regenerateTestFromSubcategoryPool(testId, options = {}) {
  const db = options.client || pool;
  const manageTransaction = !options.client;
  const baseRes = await db.query(
    `SELECT id, subcategory, question_count, dynamic_fluctuation_on_publish
     FROM tests
     WHERE id = $1::uuid
     LIMIT 1`,
    [testId],
  );
  const base = baseRes.rows[0];
  if (!base || base.dynamic_fluctuation_on_publish === false) {
    return { regenerated: false, reason: 'disabled' };
  }
  if (!base || !String(base.subcategory || '').trim()) return { regenerated: false, reason: 'missing_subcategory' };
  const needed = Math.max(1, Number(base.question_count || 0));
  const poolRes = await db.query(
    `SELECT q.id, q.stem, q.choice_a, q.choice_b, q.choice_c, q.choice_d, q.correct_index, q.explanation, q.created_at,
            COALESCE(q.subject_key, '') AS subject_key
     FROM questions q
     INNER JOIN tests t ON t.id = q.test_id
     WHERE t.subcategory = $1
     ORDER BY q.id DESC`,
    [String(base.subcategory)],
  );
  const poolRows = poolRes.rows || [];
  if (!poolRows.length) return { regenerated: false, reason: 'empty_pool' };
  /** Default 80% from last 7d ("new"), 20% older; env REGENERATE_NEW_RATIO / REGENERATE_NEW_WINDOW_DAYS override. */
  const selected = selectQuestionsFromSubcategoryPool(poolRows, needed, {
    newRatio: 0.8,
    newWindowDays: 7,
  });

  if (!selected.length) return { regenerated: false, reason: 'no_selection' };
  const ownClient = manageTransaction ? await pool.connect() : null;
  const writeClient = options.client || ownClient;
  try {
    if (manageTransaction) await writeClient.query('BEGIN');
    await writeClient.query(`DELETE FROM questions WHERE test_id = $1::uuid`, [testId]);
    let position = 1;
    for (const row of selected) {
      const randomized = shuffleQuestionOptions(row);
      const subjectKey = String(row.subject_key || '')
        .trim()
        .slice(0, 64);
      await writeClient.query(
        `INSERT INTO questions (
           test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          testId,
          position,
          randomized.stem,
          randomized.choice_a,
          randomized.choice_b,
          randomized.choice_c,
          randomized.choice_d,
          randomized.correct_index,
          randomized.explanation,
          true,
          subjectKey,
        ],
      );
      position += 1;
    }
    if (manageTransaction) await writeClient.query('COMMIT');
    return { regenerated: true, count: selected.length };
  } catch (e) {
    if (manageTransaction) await writeClient.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    if (ownClient) ownClient.release();
  }
}

async function getSettingsMap() {
  const { rows } = await pool.query(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key = ANY($1::text[])`,
    [SETTINGS_KEYS],
  );
  const map = {};
  for (const row of rows) map[row.setting_key] = row.setting_value;
  return {
    maintenanceMode: String(map.maintenanceMode || 'false') === 'true',
    maintenanceMessage: String(map.maintenanceMessage || ''),
    registrationOpen: String(map.registrationOpen || 'true') === 'true',
    profileMenuItems: (() => {
      try {
        const parsed = JSON.parse(String(map.profileMenuItems || '[]'));
        return Array.isArray(parsed) ? parsed : [];
      } catch (_e) {
        return [];
      }
    })(),
    homeContent: (() => {
      try {
        const parsed = JSON.parse(String(map.homeContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    examSnapCard: (() => {
      try {
        const parsed = JSON.parse(String(map.examSnapCard || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    pollSettings: (() => {
      try {
        const parsed = JSON.parse(String(map.pollSettings || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    pushNotificationSettings: (() => {
      try {
        const parsed = JSON.parse(String(map.pushNotificationSettings || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    dailyQuizSettings: (() => {
      try {
        const parsed = JSON.parse(String(map.dailyQuizSettings || '{}'));
        if (!parsed || typeof parsed !== 'object') {
          return { releaseHour: 10, releaseMinute: 0, timezoneOffsetMinutes: 330 };
        }
        return {
          releaseHour: Math.max(0, Math.min(23, Number(parsed.releaseHour ?? 10))),
          releaseMinute: Math.max(0, Math.min(59, Number(parsed.releaseMinute ?? 0))),
          timezoneOffsetMinutes: Math.max(-720, Math.min(840, Number(parsed.timezoneOffsetMinutes ?? 330))),
        };
      } catch (_e) {
        return { releaseHour: 10, releaseMinute: 0, timezoneOffsetMinutes: 330 };
      }
    })(),
    submitApplicationContent: (() => {
      try {
        const parsed = JSON.parse(String(map.submitApplicationContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    instructionContent: (() => {
      try {
        const parsed = JSON.parse(String(map.instructionContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    examCategories: (() => {
      try {
        const parsed = JSON.parse(String(map.examCategories || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    signupRegions: (() => {
      try {
        const parsed = JSON.parse(String(map.signupRegions || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { items: [] };
      } catch (_e) {
        return { items: [] };
      }
    })(),
    examCategoryIconOptions: (() => {
      try {
        const parsed = JSON.parse(String(map.examCategoryIconOptions || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { items: [] };
      } catch (_e) {
        return { items: [] };
      }
    })(),
    notificationScheduling: (() => {
      try {
        const parsed = JSON.parse(String(map.notificationScheduling || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    })(),
    resultUnlockEmailSettings: (() => {
      try {
        const parsed = JSON.parse(String(map.resultUnlockEmailSettings || '{}'));
        if (!parsed || typeof parsed !== 'object') return { enabled: true, delayHours: 3 };
        return {
          enabled: parsed.enabled !== false,
          delayHours: Math.max(0, Math.min(168, Number(parsed.delayHours ?? 3))),
        };
      } catch (_e) {
        return { enabled: true, delayHours: 3 };
      }
    })(),
    emailEventToggles: (() => {
      try {
        const parsed = JSON.parse(String(map.emailEventToggles || '{}'));
        const normalized = normalizeEmailEventToggles(parsed);
        return normalized.value;
      } catch (_e) {
        return { ...DEFAULT_EMAIL_EVENT_TOGGLES };
      }
    })(),
    jobExamArticleAnnouncementEmail: String(map.jobExamArticleAnnouncementEmail ?? 'true') === 'true',
    adminImageExportFormats: (() => {
      try {
        const parsed = JSON.parse(String(map.adminImageExportFormats || '{}'));
        return normalizeAdminImageExportFormats(parsed);
      } catch (_e) {
        return normalizeAdminImageExportFormats({});
      }
    })(),
    feedbackInbox: (() => {
      try {
        const parsed = JSON.parse(String(map.feedbackInbox || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { items: [] };
      } catch (_e) {
        return { items: [] };
      }
    })(),
    helpSupportInbox: (() => {
      try {
        const parsed = JSON.parse(String(map.helpSupportInbox || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { items: [] };
      } catch (_e) {
        return { items: [] };
      }
    })(),
    reportIssueInbox: (() => {
      try {
        const parsed = JSON.parse(String(map.reportIssueInbox || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { items: [] };
      } catch (_e) {
        return { items: [] };
      }
    })(),
    helpSupportContent: (() => {
      try {
        const parsed = JSON.parse(String(map.helpSupportContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { title: 'Help and Support', body: '' };
      } catch (_e) {
        return { title: 'Help and Support', body: '' };
      }
    })(),
    achievementContent: (() => {
      try {
        const parsed = JSON.parse(String(map.achievementContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { title: 'Achievement', body: '' };
      } catch (_e) {
        return { title: 'Achievement', body: '' };
      }
    })(),
    shareContent: (() => {
      try {
        const parsed = JSON.parse(String(map.shareContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { title: 'Share', body: '' };
      } catch (_e) {
        return { title: 'Share', body: '' };
      }
    })(),
    dailyDigestShareContent: (() => {
      try {
        const parsed = JSON.parse(String(map.dailyDigestShareContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { title: 'Daily Digest Share', body: '' };
      } catch (_e) {
        return { title: 'Daily Digest Share', body: '' };
      }
    })(),
    dailyQuizShareContent: (() => {
      try {
        const parsed = JSON.parse(String(map.dailyQuizShareContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { title: 'Daily Quiz Share', body: '' };
      } catch (_e) {
        return { title: 'Daily Quiz Share', body: '' };
      }
    })(),
    privacyPolicyContent: (() => {
      try {
        const parsed = JSON.parse(String(map.privacyPolicyContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { title: 'Privacy Policy', body: '' };
      } catch (_e) {
        return { title: 'Privacy Policy', body: '' };
      }
    })(),
    termsOfUseContent: (() => {
      try {
        const parsed = JSON.parse(String(map.termsOfUseContent || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : { title: 'Terms of Use', body: '' };
      } catch (_e) {
        return { title: 'Terms of Use', body: '' };
      }
    })(),
  };
}

function normalizeQuestionPayload(body, options = {}) {
  const payload = body || {};
  const requirePosition = options.requirePosition !== false;
  const position = Number(payload.position);
  const stem = String(payload.stem || '').trim();
  const choiceA = String(payload.choiceA || '').trim();
  const choiceB = String(payload.choiceB || '').trim();
  const choiceC = String(payload.choiceC || '').trim();
  const choiceD = String(payload.choiceD || '').trim();
  const correctIndex = Number(payload.correctIndex);
  const explanation = String(payload.explanation || '').trim();
  const isPublished = payload.isPublished !== false;

  if (requirePosition && (!Number.isInteger(position) || position <= 0)) {
    return { error: 'position must be a positive integer' };
  }
  if (!stem) return { error: 'stem is required' };
  if (!choiceA || !choiceB || !choiceC || !choiceD) {
    return { error: 'All four choices are required' };
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return { error: 'correctIndex must be 0, 1, 2, or 3' };
  }
  const subjectKeyRaw =
    payload.subjectKey !== undefined ? payload.subjectKey : payload.subject_key;
  const skParsed = parseQuestionSubjectKey(subjectKeyRaw);
  if (skParsed.error) {
    return { error: skParsed.error };
  }
  return {
    value: {
      position,
      stem,
      choiceA,
      choiceB,
      choiceC,
      choiceD,
      correctIndex,
      explanation,
      isPublished,
      subjectKey: skParsed.value,
    },
  };
}

function normalizeStemKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function hasDuplicateStemInTest(testId, stem, excludeQuestionId) {
  const normalized = normalizeStemKey(stem);
  if (!normalized) return false;
  const params = [testId];
  let where = `WHERE test_id = $1::uuid`;
  if (excludeQuestionId !== undefined && excludeQuestionId !== null) {
    params.push(Number(excludeQuestionId));
    where += ` AND id <> $2`;
  }
  const { rows } = await pool.query(
    `SELECT stem
     FROM questions
     ${where}`,
    params,
  );
  return rows.some((row) => normalizeStemKey(row.stem) === normalized);
}

function parseBulkQuestionRows(rawRows) {
  if (!Array.isArray(rawRows) || !rawRows.length) return { error: 'items array is required' };
  const rows = rawRows.map((raw, idx) => {
    const x = raw || {};
    const options = Array.isArray(x.options) ? x.options : [x.choiceA, x.choiceB, x.choiceC, x.choiceD];
    const choiceA = String(options[0] || x.choiceA || '').trim();
    const choiceB = String(options[1] || x.choiceB || '').trim();
    const choiceC = String(options[2] || x.choiceC || '').trim();
    const choiceD = String(options[3] || x.choiceD || '').trim();
    const stem = String(x.stem || x.questionPrompt || '').trim();
    const positionRaw = x.position === undefined || x.position === null || x.position === '' ? null : Number(x.position);
    const correctIndex = Number(
      x.correctIndex !== undefined && x.correctIndex !== null && x.correctIndex !== ''
        ? x.correctIndex
        : x.correct_option !== undefined
        ? Number(x.correct_option) - 1
        : 0,
    );
    const explanation = String(x.explanation || '').trim();
    const isPublished = x.isPublished !== false && x.is_published !== false;
    const skSrc = x.subjectKey !== undefined ? x.subjectKey : x.subject_key;
    const skParsed = parseQuestionSubjectKey(skSrc === undefined ? '' : skSrc);
    if (skParsed.error) {
      return { error: `Row ${idx + 1}: ${skParsed.error}` };
    }
    return {
      rowNo: idx + 1,
      position: positionRaw,
      stem,
      choiceA,
      choiceB,
      choiceC,
      choiceD,
      correctIndex,
      explanation,
      isPublished,
      subjectKey: skParsed.value,
    };
  });
  const bulkParseErr = rows.find((r) => r && typeof r.error === 'string');
  if (bulkParseErr) {
    return { error: bulkParseErr.error };
  }
  const invalid = rows.find(
    (r) =>
      !r.stem ||
      !r.choiceA ||
      !r.choiceB ||
      !r.choiceC ||
      !r.choiceD ||
      !Number.isInteger(r.correctIndex) ||
      r.correctIndex < 0 ||
      r.correctIndex > 3 ||
      (r.position !== null && (!Number.isInteger(r.position) || r.position <= 0)),
  );
  if (invalid) {
    return { error: `Invalid row at ${invalid.rowNo}. Ensure stem/options/correctIndex (0-3) are valid.` };
  }
  return { value: rows };
}

function testSettingKey(testId) {
  return String(testId || '').trim();
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  if (!advancedMap || typeof advancedMap !== 'object') return null;
  const key = testSettingKey(testId);
  if (!key) return null;
  const direct = advancedMap[key];
  if (direct && typeof direct === 'object') return direct;
  const lower = key.toLowerCase();
  for (const [mapKey, value] of Object.entries(advancedMap)) {
    if (String(mapKey).trim().toLowerCase() === lower && value && typeof value === 'object') {
      return value;
    }
  }
  return null;
}

function normalizeTestAdvancedConfig(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const publishAt = String(raw.publishAt || '').trim();
  const unpublishAt = String(raw.unpublishAt || '').trim();
  const resultVisibilityRaw = String(raw.resultVisibility || 'immediate').trim().toLowerCase();
  const resultVisibility = ['immediate', 'after_result_time'].includes(resultVisibilityRaw)
    ? resultVisibilityRaw
    : 'immediate';
  const reattemptCooldownMinutes = Number(raw.reattemptCooldownMinutes || 0);
  const lateJoinMinutes = Number(raw.lateJoinMinutes || 0);
  const notifyBeforeMinutes = Number(raw.notifyBeforeMinutes || 0);

  if (publishAt && Number.isNaN(Date.parse(publishAt))) {
    return { error: 'advancedConfig.publishAt must be a valid datetime' };
  }
  if (unpublishAt && Number.isNaN(Date.parse(unpublishAt))) {
    return { error: 'advancedConfig.unpublishAt must be a valid datetime' };
  }
  if (publishAt && unpublishAt && Date.parse(unpublishAt) < Date.parse(publishAt)) {
    return { error: 'advancedConfig.unpublishAt must be on or after publishAt' };
  }
  if (
    !Number.isFinite(reattemptCooldownMinutes) ||
    !Number.isInteger(reattemptCooldownMinutes) ||
    reattemptCooldownMinutes < 0 ||
    reattemptCooldownMinutes > 10080
  ) {
    return { error: 'advancedConfig.reattemptCooldownMinutes must be an integer between 0 and 10080' };
  }
  if (!Number.isFinite(lateJoinMinutes) || !Number.isInteger(lateJoinMinutes) || lateJoinMinutes < 0 || lateJoinMinutes > 240) {
    return { error: 'advancedConfig.lateJoinMinutes must be an integer between 0 and 240' };
  }
  if (!Number.isFinite(notifyBeforeMinutes) || !Number.isInteger(notifyBeforeMinutes) || notifyBeforeMinutes < 0 || notifyBeforeMinutes > 10080) {
    return { error: 'advancedConfig.notifyBeforeMinutes must be an integer between 0 and 10080' };
  }

  let cycleRepublishGapMinutes = null;
  if (
    raw.cycleRepublishGapMinutes !== undefined &&
    raw.cycleRepublishGapMinutes !== null &&
    String(raw.cycleRepublishGapMinutes).trim() !== ''
  ) {
    const gapValue = Number(raw.cycleRepublishGapMinutes);
    if (!Number.isFinite(gapValue) || !Number.isInteger(gapValue) || gapValue < 0 || gapValue > 10080) {
      return { error: 'advancedConfig.cycleRepublishGapMinutes must be an integer between 0 and 10080' };
    }
    cycleRepublishGapMinutes = gapValue;
  }

  let subjectSections = [];
  if (raw.subjectSections !== undefined && raw.subjectSections !== null) {
    if (!Array.isArray(raw.subjectSections)) {
      return { error: 'advancedConfig.subjectSections must be an array' };
    }
    if (raw.subjectSections.length > 40) {
      return { error: 'advancedConfig.subjectSections allows at most 40 entries' };
    }
    for (let i = 0; i < raw.subjectSections.length; i += 1) {
      const entry = raw.subjectSections[i];
      if (!entry || typeof entry !== 'object') {
        return { error: `advancedConfig.subjectSections[${i}] must be an object` };
      }
      const keyRaw = String(entry.key ?? '').trim();
      if (!keyRaw) {
        return { error: `advancedConfig.subjectSections[${i}].key is required` };
      }
    }
    subjectSections = normalizeSubjectSectionsInput(raw.subjectSections);
    if (subjectSections.length !== raw.subjectSections.length) {
      return {
        error:
          'Each subject section needs a valid key (lowercase letters, digits, underscore, hyphen; max 40 chars). Keys must be unique.',
      };
    }
  }

  return {
    value: {
      publishAt,
      unpublishAt,
      resultVisibility,
      reattemptCooldownMinutes,
      lateJoinMinutes,
      notifyBeforeMinutes,
      resumeEnabled: raw.resumeEnabled !== false,
      shuffleQuestions: raw.shuffleQuestions === true,
      shuffleOptions: raw.shuffleOptions === true,
      fullscreenRequired: raw.fullscreenRequired === true,
      copyPasteBlocked: raw.copyPasteBlocked === true,
      notifyOnPublish: raw.notifyOnPublish !== false,
      notifyOnCycleRepublish: raw.notifyOnCycleRepublish === true,
      sendEmailOnPublish: raw.sendEmailOnPublish === true,
      /** Minutes after cycle end before auto-republish; null = server env default (30). */
      cycleRepublishGapMinutes,
      subjectSections,
    },
  };
}

function normalizeDateOnlyField(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeTestPayload(body, options = {}) {
  const payload = body || {};
  const skipEnrolledCapacityCheck = options.skipEnrolledCapacityCheck === true;
  const title = String(payload.title || '').trim().slice(0, 180);
  const slug = String(payload.slug || '').trim().slice(0, 180).toLowerCase();
  const subcategory = String(payload.subcategory || '').trim().slice(0, 120);
  const metaLine = String(payload.metaLine || '').trim().slice(0, 240);
  const testKind = String(payload.testKind || '').trim().toLowerCase();
  const durationMinutes = Number(payload.durationMinutes);
  const questionCount = Number(payload.questionCount);
  const totalMarks = Number(payload.totalMarks || 0);
  const slotLabel = String(payload.slotLabel || '').trim().slice(0, 80);
  const capacityTotal = Number(payload.capacityTotal || 0);
  const enrolledCount = Number(payload.enrolledCount || 0);
  const attemptsAllowed = Number(payload.attemptsAllowed || 1);
  const languageMode = String(payload.languageMode || 'Bilingual').trim().slice(0, 40) || 'Bilingual';
  const examMode = String(payload.examMode || 'Practice').trim().slice(0, 40) || 'Practice';
  const negativeMarkingText = String(payload.negativeMarkingText || 'No').trim().slice(0, 40) || 'No';
  const testTypeLabel = String(payload.testTypeLabel || 'Full Mock').trim().slice(0, 40) || 'Full Mock';
  const badgeTextRaw = String(payload.badgeText || '').trim().slice(0, 40);
  const badgeEnabled = payload.badgeEnabled === true;
  const badgeText = badgeEnabled ? (badgeTextRaw || 'Live') : '';
  const examDate = normalizeDateOnlyField(payload.examDate);
  const validUntil = normalizeDateOnlyField(payload.validUntil);
  const answerKeyReleaseAt = String(payload.answerKeyReleaseAt || '').trim();
  const resultReleaseAt = String(payload.resultReleaseAt || '').trim();
  const dynamicDateEnabled = payload.dynamicDateEnabled === true;
  const dateCycleDays = Number(payload.dateCycleDays || 0);
  const slotLabelPattern = /^(0[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i;

  if (!title || !slug || !['mock', 'quiz'].includes(testKind)) {
    return { error: 'title, slug, and valid testKind are required' };
  }
  if (!Number.isFinite(durationMinutes) || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
    return { error: 'durationMinutes must be an integer between 1 and 1440' };
  }
  if (!Number.isFinite(questionCount) || !Number.isInteger(questionCount) || questionCount <= 0 || questionCount > 500) {
    return { error: 'questionCount must be an integer between 1 and 500' };
  }
  if (!Number.isFinite(totalMarks) || totalMarks < 0 || totalMarks > 10000) {
    return { error: 'totalMarks must be between 0 and 10000' };
  }
  if (!Number.isFinite(capacityTotal) || !Number.isInteger(capacityTotal) || capacityTotal < 0 || capacityTotal > 1000000) {
    return { error: 'capacityTotal must be an integer between 0 and 1000000' };
  }
  if (!Number.isFinite(enrolledCount) || !Number.isInteger(enrolledCount) || enrolledCount < 0 || enrolledCount > 1000000) {
    return { error: 'enrolledCount must be an integer between 0 and 1000000' };
  }
  if (!skipEnrolledCapacityCheck && enrolledCount > capacityTotal) {
    return { error: 'enrolledCount cannot be greater than capacityTotal' };
  }
  if (!Number.isFinite(attemptsAllowed) || !Number.isInteger(attemptsAllowed) || attemptsAllowed < 1 || attemptsAllowed > 20) {
    return { error: 'attemptsAllowed must be an integer between 1 and 20' };
  }
  if (!Number.isFinite(dateCycleDays) || !Number.isInteger(dateCycleDays) || dateCycleDays < 0 || dateCycleDays > 3650) {
    return { error: 'dateCycleDays must be an integer between 0 and 3650' };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: 'slug must use lowercase letters, numbers and hyphen only' };
  }
  if (examDate && Number.isNaN(Date.parse(`${examDate}T00:00:00Z`))) {
    return { error: 'examDate must be a valid date (YYYY-MM-DD)' };
  }
  if (slotLabel && !slotLabelPattern.test(slotLabel)) {
    return { error: 'slotLabel must be in HH:MM AM/PM format (example: 09:30 AM)' };
  }
  if (examDate && !slotLabel) {
    return { error: 'slotLabel is required when examDate is provided (use HH:MM AM/PM)' };
  }
  if (validUntil && Number.isNaN(Date.parse(`${validUntil}T00:00:00Z`))) {
    return { error: 'validUntil must be a valid date (YYYY-MM-DD)' };
  }
  if (answerKeyReleaseAt && Number.isNaN(Date.parse(answerKeyReleaseAt))) {
    return { error: 'answerKeyReleaseAt must be a valid datetime' };
  }
  if (resultReleaseAt && Number.isNaN(Date.parse(resultReleaseAt))) {
    return { error: 'resultReleaseAt must be a valid datetime' };
  }
  if (examDate && validUntil) {
    const examDateMs = Date.parse(`${examDate}T00:00:00Z`);
    const validUntilMs = Date.parse(`${validUntil}T00:00:00Z`);
    if (validUntilMs < examDateMs) {
      return { error: 'validUntil must be on or after examDate' };
    }
  }
  if (answerKeyReleaseAt && resultReleaseAt) {
    const answerKeyMs = Date.parse(answerKeyReleaseAt);
    const resultMs = Date.parse(resultReleaseAt);
    if (resultMs < answerKeyMs) {
      return { error: 'resultReleaseAt must be on or after answerKeyReleaseAt' };
    }
  }

  return {
    value: {
      title,
      slug,
      subcategory,
      metaLine,
      testKind,
      durationMinutes,
      questionCount,
      totalMarks: Math.max(0, totalMarks),
      slotLabel,
      capacityTotal: Math.max(0, capacityTotal),
      enrolledCount: Math.max(0, enrolledCount),
      attemptsAllowed: Math.max(1, attemptsAllowed),
      languageMode,
      examMode,
      negativeMarkingText,
      testTypeLabel,
      badgeEnabled,
      badgeText,
      examDate,
      validUntil,
      answerKeyReleaseAt,
      resultReleaseAt,
      dynamicDateEnabled,
      dateCycleDays: Math.max(0, dateCycleDays),
      isPublished: payload.isPublished !== false,
      dynamicFluctuationOnPublish: payload.dynamicFluctuationOnPublish !== false,
    },
  };
}

function parseSummaryRangeDays(req) {
  const raw = String(req.query?.range || '7d')
    .trim()
    .toLowerCase();
  if (raw === '30d') return 30;
  if (raw === '90d') return 90;
  return 7;
}

router.get('/summary', async (req, res) => {
  try {
    const rangeDays = parseSummaryRangeDays(req);
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS user_device_tokens (
           id BIGSERIAL PRIMARY KEY,
           user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           device_token TEXT NOT NULL,
           platform VARCHAR(20) NOT NULL DEFAULT 'android',
           app_version VARCHAR(40) NOT NULL DEFAULT '',
           device_model VARCHAR(120) NOT NULL DEFAULT '',
           is_active BOOLEAN NOT NULL DEFAULT true,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           UNIQUE (device_token)
         )`,
      )
      .catch(() => {});
    const [
      users,
      attempts,
      tests,
      articles,
      attemptsToday,
      activeRecent,
      userGrowthRows,
      attemptsByDayRows,
      hourlyRows,
      trendingRows,
      funnelAgg,
      feedRows,
      auditAgg,
      topTestsRows,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS value FROM users`),
      pool.query(`SELECT COUNT(*)::int AS value FROM test_attempts`),
      pool.query(`SELECT COUNT(*)::int AS value FROM tests WHERE is_published = true`),
      pool.query(`SELECT COUNT(*)::int AS value FROM news_articles WHERE is_published = true`),
      pool.query(
        `SELECT COUNT(*)::int AS value FROM test_attempts
         WHERE (completed_at AT TIME ZONE 'UTC')::date = (timezone('UTC', now()))::date`,
      ),
      pool.query(
        `SELECT COUNT(DISTINCT user_id)::int AS value FROM test_attempts
         WHERE completed_at > now() - interval '45 minutes'`,
      ),
      pool.query(
        `SELECT (created_at AT TIME ZONE 'UTC')::date AS d, COUNT(*)::int AS c
         FROM users
         WHERE (created_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))
         GROUP BY 1 ORDER BY 1`,
        [rangeDays],
      ),
      pool.query(
        `SELECT (completed_at AT TIME ZONE 'UTC')::date AS d, COUNT(*)::int AS c
         FROM test_attempts
         WHERE (completed_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))
         GROUP BY 1 ORDER BY 1`,
        [rangeDays],
      ),
      pool.query(
        `SELECT (EXTRACT(HOUR FROM completed_at AT TIME ZONE 'UTC'))::int AS h, COUNT(*)::int AS c
         FROM test_attempts
         WHERE (completed_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))
         GROUP BY 1 ORDER BY 1`,
        [rangeDays],
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(trim(test_name), ''), 'Unknown') AS topic, COUNT(*)::int AS c
         FROM test_attempts
         WHERE (completed_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))
         GROUP BY 1
         ORDER BY c DESC
         LIMIT 8`,
        [rangeDays],
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS opened,
           COUNT(DISTINCT user_id)::int AS started,
           COUNT(*) FILTER (
             WHERE total > 0 AND (correct::numeric / NULLIF(total, 0)) >= 0.5
           )::int AS completed
         FROM test_attempts
         WHERE (completed_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))`,
        [rangeDays],
      ),
      pool.query(
        `SELECT
           COALESCE(NULLIF(trim(u.display_name), ''), LEFT(trim(u.email), 40), 'User') AS student,
           COALESCE(NULLIF(trim(ta.test_name), ''), 'Test') AS topic,
           CASE
             WHEN ta.total > 0 THEN ROUND(100.0 * ta.correct / NULLIF(ta.total, 0))::int
             ELSE 0
           END AS accuracy_pct,
           ta.completed_at,
           EXISTS (SELECT 1 FROM user_device_tokens udt WHERE udt.user_id = ta.user_id) AS has_app_token
         FROM test_attempts ta
         INNER JOIN users u ON u.id = ta.user_id
         WHERE (ta.completed_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))
         ORDER BY ta.completed_at DESC
         LIMIT 12`,
        [rangeDays],
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN user_agent ~* '(iphone|ipad|ipod|android.*mobile|mobile)' THEN 1 ELSE 0 END), 0)::int AS mobile,
           COALESCE(SUM(CASE
             WHEN user_agent IS NULL THEN 0
             WHEN user_agent ~* '(iphone|ipad|ipod|android.*mobile|mobile)' THEN 0
             ELSE 1
           END), 0)::int AS desktop,
           COUNT(*)::int AS total
         FROM admin_audit_logs
         WHERE (created_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))`,
        [rangeDays],
      ),
      pool.query(
        `SELECT
           COALESCE(NULLIF(trim(test_name), ''), 'Unknown') AS title,
           COUNT(*)::int AS attempts_count,
           ROUND(COALESCE(AVG(CASE WHEN total > 0 THEN 100.0 * correct / total END), 0)::numeric, 1)::float AS avg_accuracy,
           MAX(completed_at) AS last_attempt_at
         FROM test_attempts
         WHERE (completed_at AT TIME ZONE 'UTC')::date >= (timezone('UTC', now())::date - ($1::int - 1))
         GROUP BY 1
         ORDER BY attempts_count DESC
         LIMIT 10`,
        [rangeDays],
      ),
    ]);

    const dayKey = (row) => {
      if (row.d instanceof Date) return row.d.toISOString().slice(0, 10);
      return String(row.d).replace(/T.*/, '').slice(0, 10);
    };
    const byDayUsers = new Map();
    for (const row of userGrowthRows.rows || []) {
      byDayUsers.set(dayKey(row), Number(row.c || 0));
    }
    const byDayAttempts = new Map();
    for (const row of attemptsByDayRows.rows || []) {
      byDayAttempts.set(dayKey(row), Number(row.c || 0));
    }

    const growthLabels = [];
    const growthValues = [];
    const attemptsPerDay = [];
    for (let i = rangeDays - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (rangeDays <= 14) {
        growthLabels.push(d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }));
      } else {
        growthLabels.push(
          d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        );
      }
      growthValues.push(byDayUsers.get(key) || 0);
      attemptsPerDay.push(byDayAttempts.get(key) || 0);
    }

    const hourly = Array(24).fill(0);
    for (const row of hourlyRows.rows || []) {
      const h = Number(row.h);
      if (Number.isFinite(h) && h >= 0 && h <= 23) hourly[h] = Number(row.c || 0);
    }
    const hMax = Math.max(1, ...hourly);
    const heatmapCells = hourly.map((c) => {
      if (c <= 0) return { count: c, tier: 'low' };
      if (c >= hMax * 0.65) return { count: c, tier: 'peak' };
      if (c >= hMax * 0.25) return { count: c, tier: 'mid' };
      return { count: c, tier: 'low' };
    });

    const fr = funnelAgg.rows[0] || {};
    const opened = Math.max(0, Number(fr.opened || 0));
    const started = Math.max(0, Number(fr.started || 0));
    const completed = Math.max(0, Number(fr.completed || 0));
    const funnelMax = Math.max(opened, started, completed, 1);
    const funnelPercents = {
      opened: Math.round((100 * opened) / funnelMax),
      started: Math.round((100 * started) / funnelMax),
      completed: Math.round((100 * completed) / funnelMax),
    };
    const dropoffPct = opened > 0 ? Math.max(0, Math.min(100, Math.round(100 - (100 * completed) / opened))) : 0;

    const ar = auditAgg.rows[0] || {};
    let mobile = Number(ar.mobile || 0);
    let desktop = Number(ar.desktop || 0);
    const auditTotal = Number(ar.total || 0);
    if (auditTotal === 0) {
      mobile = 0;
      desktop = 0;
    }
    const otherDevices = Math.max(0, auditTotal - mobile - desktop);
    const deviceSplit = { mobile, desktop, other: otherDevices, source: auditTotal > 0 ? 'audit' : 'empty' };

    const topTests = (topTestsRows.rows || []).map((r) => ({
      title: String(r.title || '').trim().slice(0, 120),
      attemptsCount: Number(r.attempts_count || 0),
      avgAccuracy: r.avg_accuracy == null ? null : Number(r.avg_accuracy),
      lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at).toISOString() : null,
    }));

    return res.json({
      users: users.rows[0].value,
      attempts: attempts.rows[0].value,
      tests: tests.rows[0].value,
      articles: articles.rows[0].value,
      attemptsToday: attemptsToday.rows[0].value,
      activeRecent: activeRecent.rows[0].value,
      platformHealthPct: 100,
      rangeDays,
      userGrowth7d: { labels: growthLabels, values: growthValues },
      attemptsPerDay,
      deviceSplit,
      hourlyHeatmap: heatmapCells,
      funnel: {
        opened,
        started,
        completed,
        percents: funnelPercents,
        dropoffPct,
      },
      activityFeed: (feedRows.rows || []).map((r) => ({
        student: String(r.student || ''),
        topic: String(r.topic || ''),
        accuracyPct: Number(r.accuracy_pct || 0),
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : new Date(0).toISOString(),
        device: r.has_app_token ? 'Mobile' : 'Web',
      })),
      trendingTopics: (trendingRows.rows || [])
        .map((r) => String(r.topic || '').trim().slice(0, 48))
        .filter((t) => t && t.toLowerCase() !== 'unknown')
        .slice(0, 6),
      topTests,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load admin summary' });
  }
});

/** Shared: save exam_snap_card row only. POST preferred (some proxies strip PATCH bodies). */
async function handleExamSnapCardSettingsSave(req, res) {
  try {
    const raw = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const payload =
      raw.examSnapCard !== undefined && raw.examSnapCard !== null && typeof raw.examSnapCard === 'object'
        ? raw.examSnapCard
        : raw;
    const normalized = normalizeExamSnapCard(payload);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ('examSnapCard', $1, $2::uuid)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify(normalized.value), req.userId],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    try {
      await logAdminAction(req, 'settings_update', 'app_settings', null, {
        examSnapCardUpdated: true,
      });
    } catch (logErr) {
      console.error('exam_snap_card_settings_audit_log_failed', logErr && (logErr.message || logErr));
    }
    const settings = await getSettingsMap();
    return res.json({ settings });
  } catch (e) {
    console.error('exam_snap_card_save_failed', e);
    return res.status(500).json({ error: e && e.message ? String(e.message) : 'Failed to save exam snap card' });
  }
}

router.get('/settings', async (_req, res) => {
  try {
    const settings = await getSettingsMap();
    return res.json({ settings });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/settings/exam-snap-card', handleExamSnapCardSettingsSave);
router.patch('/settings/exam-snap-card', handleExamSnapCardSettingsSave);

router.post('/uploads/banner', async (req, res) => {
  try {
    const body = req.body || {};
    const fileNameRaw = String(body.fileName || '').trim();
    const contentType = String(body.contentType || '').trim().toLowerCase();
    const dataBase64 = String(body.dataBase64 || '').trim();
    if (!fileNameRaw || !contentType || !dataBase64) {
      return res.status(400).json({ error: 'fileName, contentType and dataBase64 are required' });
    }
    if (!INPUT_MIME_TO_EXT[contentType]) {
      return res.status(400).json({
        error:
          'Unsupported image type. Allowed: JPEG, PNG, WebP, GIF, AVIF, SVG.',
      });
    }
    const fileBuffer = Buffer.from(dataBase64, 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image size must be <= 5MB' });
    }
    const safeBase = path
      .basename(fileNameRaw)
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .slice(0, 40) || 'banner';
    const stamp = Date.now();
    ensureBannerDir();
    const settings = await getSettingsMap();
    const { imageUrl, variants } = await processAdminImageUpload({
      fileBuffer,
      contentType,
      stamp,
      safeBase,
      destDir: BANNERS_DIR,
      toPublicUrl: (fn) => toPublicBannerUrl(req, fn),
      exportFormats: settings.adminImageExportFormats,
    });
    return res.status(201).json({ imageUrl, variants });
  } catch (e) {
    console.error(e);
    if (e && e.code === 'UNSUPPORTED_TYPE') {
      return res.status(400).json({ error: 'Unsupported image type' });
    }
    return res.status(500).json({ error: 'Failed to upload banner image' });
  }
});

router.post('/uploads/article-image', async (req, res) => {
  try {
    const body = req.body || {};
    const fileNameRaw = String(body.fileName || '').trim();
    const contentType = String(body.contentType || '').trim().toLowerCase();
    const dataBase64 = String(body.dataBase64 || '').trim();
    if (!fileNameRaw || !contentType || !dataBase64) {
      return res.status(400).json({ error: 'fileName, contentType and dataBase64 are required' });
    }
    if (!INPUT_MIME_TO_EXT[contentType]) {
      return res.status(400).json({
        error:
          'Unsupported image type. Allowed: JPEG, PNG, WebP, GIF, AVIF, SVG.',
      });
    }
    const fileBuffer = Buffer.from(dataBase64, 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image size must be <= 5MB' });
    }
    const safeBase = path
      .basename(fileNameRaw)
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .slice(0, 40) || 'article';
    const stamp = Date.now();
    ensureArticleImagesDir();
    const settings = await getSettingsMap();
    const { imageUrl, variants } = await processAdminImageUpload({
      fileBuffer,
      contentType,
      stamp,
      safeBase,
      destDir: ARTICLES_IMAGES_DIR,
      toPublicUrl: (fn) => toPublicArticleImageUrl(req, fn),
      exportFormats: settings.adminImageExportFormats,
    });
    return res.status(201).json({ imageUrl, variants });
  } catch (e) {
    console.error(e);
    if (e && e.code === 'UNSUPPORTED_TYPE') {
      return res.status(400).json({ error: 'Unsupported image type' });
    }
    return res.status(500).json({ error: 'Failed to upload article image' });
  }
});

router.patch('/settings', async (req, res) => {
  const body = req.body || {};
  const maintenanceMode = body.maintenanceMode === undefined ? null : Boolean(body.maintenanceMode);
  const maintenanceMessage =
    body.maintenanceMessage === undefined ? null : String(body.maintenanceMessage || '').trim().slice(0, 240);
  const registrationOpen = body.registrationOpen === undefined ? null : Boolean(body.registrationOpen);
  const jobExamArticleAnnouncementEmail =
    body.jobExamArticleAnnouncementEmail === undefined ? null : Boolean(body.jobExamArticleAnnouncementEmail);
  const normalizedProfileItems =
    body.profileMenuItems === undefined ? null : normalizeProfileMenuItems(body.profileMenuItems);
  if (normalizedProfileItems && normalizedProfileItems.error) {
    return res.status(400).json({ error: normalizedProfileItems.error });
  }
  let normalizedHomeContent = null;
  if (isMeaningfulHomeContentPatch(body.homeContent)) {
    const existingHome = await getJsonSetting('homeContent', {});
    const mergedHome =
      existingHome && typeof existingHome === 'object'
        ? { ...existingHome, ...body.homeContent }
        : body.homeContent;
    normalizedHomeContent = normalizeHomeContent(applyHomeContentDefaults(mergedHome));
  }
  if (normalizedHomeContent && normalizedHomeContent.error) {
    return res.status(400).json({ error: normalizedHomeContent.error });
  }
  const normalizedExamSnapCard =
    body.examSnapCard === undefined ? null : normalizeExamSnapCard(body.examSnapCard);
  const normalizedPollSettings =
    body.pollSettings === undefined ? null : normalizePollSettings(body.pollSettings);
  const normalizedPushNotificationSettings =
    body.pushNotificationSettings === undefined ? null : normalizePushNotificationSettings(body.pushNotificationSettings);
  const normalizedDailyQuizSettings =
    body.dailyQuizSettings === undefined ? null : normalizeDailyQuizSettings(body.dailyQuizSettings);
  const normalizedSubmitApplicationContent =
    body.submitApplicationContent === undefined ? null : normalizeSubmitApplicationContent(body.submitApplicationContent);
  const normalizedInstructionContent =
    body.instructionContent === undefined ? null : normalizeInstructionContent(body.instructionContent);
  const normalizedExamCategories =
    body.examCategories === undefined ? null : normalizeExamCategories(body.examCategories);
  const normalizedSignupRegions =
    body.signupRegions === undefined ? null : normalizeSignupRegions(body.signupRegions);
  const normalizedExamCategoryIconOptions =
    body.examCategoryIconOptions === undefined ? null : normalizeExamCategoryIconOptions(body.examCategoryIconOptions);
  const normalizedNotificationScheduling =
    body.notificationScheduling === undefined ? null : normalizeNotificationScheduling(body.notificationScheduling);
  const normalizedResultUnlockEmailSettings =
    body.resultUnlockEmailSettings === undefined ? null : normalizeResultUnlockEmailSettings(body.resultUnlockEmailSettings);
  if (normalizedResultUnlockEmailSettings && normalizedResultUnlockEmailSettings.error) {
    return res.status(400).json({ error: normalizedResultUnlockEmailSettings.error });
  }
  const normalizedEmailEventToggles =
    body.emailEventToggles === undefined ? null : normalizeEmailEventToggles(body.emailEventToggles);
  const normalizedAdminImageExportFormats =
    body.adminImageExportFormats === undefined ? null : normalizeAdminImageExportFormatsPatch(body.adminImageExportFormats);
  const normalizedFeedbackInbox =
    body.feedbackInbox === undefined ? null : normalizeSupportInbox(body.feedbackInbox);
  const normalizedHelpSupportInbox =
    body.helpSupportInbox === undefined ? null : normalizeSupportInbox(body.helpSupportInbox);
  const normalizedReportIssueInbox =
    body.reportIssueInbox === undefined ? null : normalizeSupportInbox(body.reportIssueInbox);
  const normalizedHelpSupportContent =
    body.helpSupportContent === undefined ? null : normalizeSimpleContent(body.helpSupportContent, 'Help and Support');
  const normalizedAchievementContent =
    body.achievementContent === undefined ? null : normalizeSimpleContent(body.achievementContent, 'Achievement');
  const normalizedShareContent =
    body.shareContent === undefined ? null : normalizeSimpleContent(body.shareContent, 'Share');
  const normalizedDailyDigestShareContent =
    body.dailyDigestShareContent === undefined ? null : normalizeSimpleContent(body.dailyDigestShareContent, 'Daily Digest Share');
  const normalizedDailyQuizShareContent =
    body.dailyQuizShareContent === undefined ? null : normalizeSimpleContent(body.dailyQuizShareContent, 'Daily Quiz Share');
  const normalizedPrivacyPolicyContent =
    body.privacyPolicyContent === undefined ? null : normalizeSimpleContent(body.privacyPolicyContent, 'Privacy Policy');
  const normalizedTermsOfUseContent =
    body.termsOfUseContent === undefined ? null : normalizeSimpleContent(body.termsOfUseContent, 'Terms of Use');
  if (
    maintenanceMode === null &&
    maintenanceMessage === null &&
    registrationOpen === null &&
    jobExamArticleAnnouncementEmail === null &&
    normalizedProfileItems === null &&
    normalizedHomeContent === null &&
    normalizedExamSnapCard === null &&
    normalizedPollSettings === null &&
    normalizedPushNotificationSettings === null &&
    normalizedDailyQuizSettings === null &&
    normalizedSubmitApplicationContent === null &&
    normalizedInstructionContent === null &&
    normalizedExamCategories === null &&
    normalizedSignupRegions === null &&
    normalizedExamCategoryIconOptions === null &&
    normalizedNotificationScheduling === null &&
    normalizedResultUnlockEmailSettings === null &&
    normalizedEmailEventToggles === null &&
    normalizedAdminImageExportFormats === null &&
    normalizedFeedbackInbox === null &&
    normalizedHelpSupportInbox === null &&
    normalizedReportIssueInbox === null &&
    normalizedHelpSupportContent === null &&
    normalizedAchievementContent === null &&
    normalizedShareContent === null &&
    normalizedDailyDigestShareContent === null &&
    normalizedDailyQuizShareContent === null &&
    normalizedPrivacyPolicyContent === null &&
    normalizedTermsOfUseContent === null
  ) {
    return res.status(400).json({
      error: 'No settings provided',
      receivedKeys: Object.keys(body || {}),
    });
  }
  try {
    const previousFeedbackInbox = normalizedFeedbackInbox !== null
      ? await getJsonSetting('feedbackInbox', { items: [] })
      : null;
    const previousHelpSupportInbox = normalizedHelpSupportInbox !== null
      ? await getJsonSetting('helpSupportInbox', { items: [] })
      : null;
    const previousReportIssueInbox = normalizedReportIssueInbox !== null
      ? await getJsonSetting('reportIssueInbox', { items: [] })
      : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (maintenanceMode !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('maintenanceMode', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [String(maintenanceMode), req.userId],
        );
      }
      if (maintenanceMessage !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('maintenanceMessage', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [maintenanceMessage, req.userId],
        );
      }
      if (registrationOpen !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('registrationOpen', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [String(registrationOpen), req.userId],
        );
      }
      if (jobExamArticleAnnouncementEmail !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('jobExamArticleAnnouncementEmail', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [String(jobExamArticleAnnouncementEmail), req.userId],
        );
      }
      if (normalizedProfileItems !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('profileMenuItems', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedProfileItems.value), req.userId],
        );
      }
      if (normalizedHomeContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('homeContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedHomeContent.value), req.userId],
        );
      }
      if (normalizedExamSnapCard !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('examSnapCard', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedExamSnapCard.value), req.userId],
        );
      }
      if (normalizedPollSettings !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('pollSettings', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedPollSettings.value), req.userId],
        );
      }
      if (normalizedPushNotificationSettings !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('pushNotificationSettings', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedPushNotificationSettings.value), req.userId],
        );
      }
      if (normalizedDailyQuizSettings !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('dailyQuizSettings', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedDailyQuizSettings.value), req.userId],
        );
      }
      if (normalizedSubmitApplicationContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('submitApplicationContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedSubmitApplicationContent.value), req.userId],
        );
      }
      if (normalizedInstructionContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('instructionContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedInstructionContent.value), req.userId],
        );
      }
      if (normalizedShareContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('shareContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedShareContent.value), req.userId],
        );
      }
      if (normalizedDailyDigestShareContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('dailyDigestShareContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedDailyDigestShareContent.value), req.userId],
        );
      }
      if (normalizedDailyQuizShareContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('dailyQuizShareContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedDailyQuizShareContent.value), req.userId],
        );
      }
      if (normalizedExamCategories !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('examCategories', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedExamCategories.value), req.userId],
        );
      }
      if (normalizedSignupRegions !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('signupRegions', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedSignupRegions.value), req.userId],
        );
      }
      if (normalizedExamCategoryIconOptions !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('examCategoryIconOptions', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedExamCategoryIconOptions.value), req.userId],
        );
      }
      if (normalizedNotificationScheduling !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('notificationScheduling', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(trimNotificationSchedulingPayload(normalizedNotificationScheduling.value)), req.userId],
        );
      }
      if (normalizedResultUnlockEmailSettings !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('resultUnlockEmailSettings', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedResultUnlockEmailSettings.value), req.userId],
        );
      }
      if (normalizedEmailEventToggles !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('emailEventToggles', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedEmailEventToggles.value), req.userId],
        );
      }
      if (normalizedAdminImageExportFormats !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('adminImageExportFormats', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedAdminImageExportFormats.value), req.userId],
        );
      }
      if (normalizedFeedbackInbox !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('feedbackInbox', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedFeedbackInbox.value), req.userId],
        );
      }
      if (normalizedHelpSupportInbox !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('helpSupportInbox', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedHelpSupportInbox.value), req.userId],
        );
      }
      if (normalizedReportIssueInbox !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('reportIssueInbox', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedReportIssueInbox.value), req.userId],
        );
      }
      if (normalizedHelpSupportContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('helpSupportContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedHelpSupportContent.value), req.userId],
        );
      }
      if (normalizedAchievementContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('achievementContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedAchievementContent.value), req.userId],
        );
      }
      if (normalizedPrivacyPolicyContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('privacyPolicyContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedPrivacyPolicyContent.value), req.userId],
        );
      }
      if (normalizedTermsOfUseContent !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('termsOfUseContent', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedTermsOfUseContent.value), req.userId],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    await logAdminAction(req, 'settings_update', 'app_settings', null, {
      maintenanceMode,
      hasMaintenanceMessage: maintenanceMessage !== null,
      registrationOpen,
      jobExamArticleAnnouncementEmailUpdated: jobExamArticleAnnouncementEmail !== null,
      profileMenuItemsUpdated: normalizedProfileItems !== null,
      homeContentUpdated: normalizedHomeContent !== null,
      examSnapCardUpdated: normalizedExamSnapCard !== null,
      pollSettingsUpdated: normalizedPollSettings !== null,
      pushNotificationSettingsUpdated: normalizedPushNotificationSettings !== null,
      dailyQuizSettingsUpdated: normalizedDailyQuizSettings !== null,
      submitApplicationContentUpdated: normalizedSubmitApplicationContent !== null,
      instructionContentUpdated: normalizedInstructionContent !== null,
      examCategoriesUpdated: normalizedExamCategories !== null,
      signupRegionsUpdated: normalizedSignupRegions !== null,
      examCategoryIconOptionsUpdated: normalizedExamCategoryIconOptions !== null,
      notificationSchedulingUpdated: normalizedNotificationScheduling !== null,
      resultUnlockEmailSettingsUpdated: normalizedResultUnlockEmailSettings !== null,
      emailEventTogglesUpdated: normalizedEmailEventToggles !== null,
      adminImageExportFormatsUpdated: normalizedAdminImageExportFormats !== null,
      feedbackInboxUpdated: normalizedFeedbackInbox !== null,
      helpSupportInboxUpdated: normalizedHelpSupportInbox !== null,
      reportIssueInboxUpdated: normalizedReportIssueInbox !== null,
      helpSupportContentUpdated: normalizedHelpSupportContent !== null,
      achievementContentUpdated: normalizedAchievementContent !== null,
      shareContentUpdated: normalizedShareContent !== null,
      dailyDigestShareContentUpdated: normalizedDailyDigestShareContent !== null,
      dailyQuizShareContentUpdated: normalizedDailyQuizShareContent !== null,
      privacyPolicyContentUpdated: normalizedPrivacyPolicyContent !== null,
      termsOfUseContentUpdated: normalizedTermsOfUseContent !== null,
    });
    if (isMailConfigured()) {
      const notifyStatusUpdate = async (beforePayload, afterPayload, eventKeyOverride) => {
        const beforeItems = Array.isArray(beforePayload?.items) ? beforePayload.items : [];
        const afterItems = Array.isArray(afterPayload?.items) ? afterPayload.items : [];
        const beforeMap = new Map(beforeItems.map((x) => [String(x.id || ''), String(x.status || 'new')]));
        for (const item of afterItems) {
          const id = String(item.id || '');
          const status = String(item.status || '').toLowerCase();
          const prev = String(beforeMap.get(id) || 'new').toLowerCase();
          const email = String(item.userEmail || '').trim();
          if (!email) continue;
          if (status === 'in_progress' && prev !== 'in_progress') {
            await sendSupportJourneyEmail({
              userId: String(item.userId || '').trim(),
              to: email,
              status: 'in_progress',
              subject: String(item.subject || 'Support Request'),
              message: 'Your request is now in progress. Our team is actively working on it, and we expect the next update within 24-48 hours.',
              eventKeyOverride,
            }).catch((mailErr) => {
              console.error('support_in_progress_email_failed', id, mailErr && (mailErr.message || mailErr));
            });
          }
          if (status === 'resolved' && prev !== 'resolved') {
            await sendSupportJourneyEmail({
              userId: String(item.userId || '').trim(),
              to: email,
              status: 'resolved',
              subject: String(item.subject || 'Support Request'),
              message: 'Your request has been marked resolved. If anything is still pending, reply with details.',
              eventKeyOverride,
            }).catch((mailErr) => {
              console.error('support_resolved_email_failed', id, mailErr && (mailErr.message || mailErr));
            });
          }
        }
      };
      if (normalizedFeedbackInbox !== null) {
        await notifyStatusUpdate(previousFeedbackInbox, normalizedFeedbackInbox.value, 'feedback_ack');
      }
      if (normalizedHelpSupportInbox !== null) {
        await notifyStatusUpdate(previousHelpSupportInbox, normalizedHelpSupportInbox.value, 'help_support_ack');
      }
      if (normalizedReportIssueInbox !== null) {
        await notifyStatusUpdate(previousReportIssueInbox, normalizedReportIssueInbox.value, 'issue_report_ack');
      }
    }
    if (normalizedDailyQuizSettings !== null) {
      await enqueueNotification(req.userId, {
        title: 'Daily Quiz Rescheduled',
        message: 'Daily quiz schedule has been updated by admin.',
        target: 'all',
        deepLink: 'menu_quiz',
        scheduleAt: new Date().toISOString(),
      });
    }
    if (normalizedPollSettings !== null) {
      const pollItems = Array.isArray(normalizedPollSettings.value?.items)
        ? normalizedPollSettings.value.items
        : [];
      const activeCount = pollItems.filter((x) => x && x.enabled !== false).length;
      if (activeCount > 0) {
        await enqueueNotification(req.userId, {
          title: 'New Poll Available',
          message: activeCount === 1
            ? 'A new poll is available. Share your opinion now.'
            : `${activeCount} active polls are available. Share your opinion now.`,
          target: 'all',
          deepLink: 'poll',
          scheduleAt: new Date().toISOString(),
        });
      }
    }
    if (normalizedExamCategories !== null) {
      await enqueueNotification(req.userId, {
        title: 'Exam Alerts Updated',
        message: 'New exam alert categories are available.',
        target: 'all',
        deepLink: 'exam_alert',
        scheduleAt: new Date().toISOString(),
      });
    }
    const settings = await getSettingsMap();
    return res.json({ settings });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/audit-logs', async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Math.min(100, Math.max(10, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50));
  const offsetRaw = Number(req.query.offset);
  const offset = Math.max(0, Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0);
  try {
    const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM admin_audit_logs`);
    const total = Number(countRes.rows[0]?.c || 0);
    const { rows } = await pool.query(
      `SELECT l.id, l.action_type, l.target_type, l.target_id, l.details_json, l.request_ip, l.user_agent, l.created_at,
              u.email AS actor_email, u.display_name AS actor_name
       FROM admin_audit_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return res.json({ items: rows, total });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

/** Super admin only: remove every row from audit log table (cannot be undone). No DB row retained for “who cleared”—use server logs / backups for forensics. */
router.delete('/audit-logs', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM admin_audit_logs`);
    const deleted = Number(result.rowCount || 0);
    console.warn('[audit_logs] cleared by super_admin', { actorUserId: req.userId, deleted });
    return res.json({ ok: true, deleted });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to clear audit logs' });
  }
});
router.get('/tests', async (_req, res) => {
  try {
    const advancedMap = await getJsonSetting('testAdvancedConfigs', {});
    const publishScheduleItems = await loadPublishScheduleItemsSafe(pool);
    const nowMs = Date.now();
    const { rows } = await pool.query(
      `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
              exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
              language_mode, exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until,
              answer_key_release_at, result_release_at,
              dynamic_date_enabled, date_cycle_days, last_cycle_started_at,
              COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish
       FROM tests
       ORDER BY created_at DESC`,
    );
    const mapped = rows.map((row) => {
      const advanced_config = resolveAdvancedConfigForTest(advancedMap, row.id);
      const cycleFields = buildAdminTestCycleFields(row, advanced_config, publishScheduleItems, nowMs);
      return {
        ...row,
        advanced_config,
        ...cycleFields,
      };
    });
    return res.json({ items: mapped });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list tests' });
  }
});

router.post('/tests/:id/republish-now', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  try {
    const advancedMap = await getJsonSetting('testAdvancedConfigs', {});
    const publishScheduleItems = await loadPublishScheduleItemsSafe(pool);
    const nowMs = Date.now();
    const existing = await pool.query(
      `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
              exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
              language_mode, exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until,
              answer_key_release_at, result_release_at,
              dynamic_date_enabled, date_cycle_days, last_cycle_started_at,
              COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ error: 'Test not found' });

    const advanced_config = resolveAdvancedConfigForTest(advancedMap, id);
    const cycleFields = buildAdminTestCycleFields(row, advanced_config, publishScheduleItems, nowMs);
    if (!cycleFields.can_republish_now) {
      return res.status(409).json({
        error: 'Test is not eligible for republish now',
        cycle_status: cycleFields.cycle_status,
        cycle_phase: cycleFields.cycle_phase,
      });
    }

    const republishResult = await republishTestNow({
      pool,
      testId: id,
      regenerateTestFromSubcategoryPool,
    });

    const refreshed = await pool.query(
      `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
              exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
              language_mode, exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until,
              answer_key_release_at, result_release_at,
              dynamic_date_enabled, date_cycle_days, last_cycle_started_at,
              COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );
    const savedRow = refreshed.rows[0] || row;
    const nextCycleFields = buildAdminTestCycleFields(
      savedRow,
      advanced_config,
      await loadPublishScheduleItemsSafe(pool),
      Date.now(),
    );

    const emailResult = triggerTestPublishAnnouncementEmail({
      testId: id,
      testTitle: savedRow.title,
      isPublished: savedRow.is_published === true,
      lastCycleStartedAt: savedRow.last_cycle_started_at,
      advancedConfig: advanced_config || {},
      previousAdvancedConfig: advanced_config || {},
      justPublished: false,
      cycleRenewed: true,
    });
    if (emailResult.updateDedupeKey) {
      const nextAdvancedMap =
        advancedMap && typeof advancedMap === 'object' ? { ...advancedMap } : {};
      nextAdvancedMap[testSettingKey(id)] = mergePublishEmailDedupeKey(
        advanced_config || {},
        emailResult.updateDedupeKey,
      );
      await setJsonSetting('testAdvancedConfigs', nextAdvancedMap, req.userId);
    }

    return res.json({
      ok: true,
      item: {
        ...savedRow,
        advanced_config,
        ...nextCycleFields,
      },
      republish: republishResult,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to republish test' });
  }
});

router.post('/tests/badge/bulk-live', async (req, res) => {
  const onlyPublished = (req.body || {}).onlyPublished !== false;
  const badgeText = String((req.body || {}).badgeText || 'Live').trim().slice(0, 40) || 'Live';
  try {
    const query = onlyPublished
      ? `UPDATE tests
         SET badge_enabled = true,
             badge_text = $1,
             updated_at = now()
         WHERE is_published = true`
      : `UPDATE tests
         SET badge_enabled = true,
             badge_text = $1,
             updated_at = now()`;
    const result = await pool.query(query, [badgeText]);
    return res.json({
      ok: true,
      updatedCount: Number(result.rowCount || 0),
      badgeText,
      onlyPublished,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to bulk update test badges' });
  }
});

router.post('/tests', async (req, res) => {
  const parsed = normalizeTestPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const data = parsed.value;
  const advancedParsed = normalizeTestAdvancedConfig((req.body || {}).advancedConfig);
  if (advancedParsed.error) return res.status(400).json({ error: advancedParsed.error });
  const advancedConfig = advancedParsed.value;
  const storedPublished = data.isPublished !== false;
  try {
    const { createdRow } = await withPgTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO tests (
           slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
           dynamic_fluctuation_on_publish, exam_date, total_marks, slot_label, capacity_total, enrolled_count,
           attempts_allowed, language_mode, exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until,
           answer_key_release_at, result_release_at, dynamic_date_enabled, date_cycle_days
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::date, $23::timestamptz, $24::timestamptz, $25, $26)
         RETURNING id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
                   exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed, language_mode,
                   exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until, answer_key_release_at, result_release_at, dynamic_date_enabled, date_cycle_days,
                   COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish`,
        [
          data.slug,
          data.title,
          data.subcategory,
          data.metaLine,
          data.durationMinutes,
          data.questionCount,
          data.testKind,
          storedPublished,
          data.dynamicFluctuationOnPublish,
          data.examDate || null,
          data.totalMarks,
          data.slotLabel,
          data.capacityTotal,
          data.enrolledCount,
          data.attemptsAllowed,
          data.languageMode,
          data.examMode,
          data.negativeMarkingText,
          data.testTypeLabel,
          data.badgeEnabled,
          data.badgeText,
          data.validUntil || null,
          data.answerKeyReleaseAt || null,
          data.resultReleaseAt || null,
          data.dynamicDateEnabled,
          data.dateCycleDays,
        ],
      );
      const createdRow = rows[0];
      if (storedPublished) {
        const cycleAction = resolveAdminCycleStartUpdate(createdRow, null, { justPublished: true });
        if (cycleAction.setCycleStart) {
          await client.query(
            `UPDATE tests
             SET last_cycle_started_at = now(), updated_at = now()
             WHERE id = $1::uuid`,
            [createdRow.id],
          );
        }
        await regenerateTestFromSubcategoryPool(createdRow.id, { client });
      }
      return { createdRow };
    });

    let advancedConfigToSave = advancedConfig;
    if (storedPublished) {
      const cycleRes = await pool.query(
        `SELECT last_cycle_started_at FROM tests WHERE id = $1::uuid LIMIT 1`,
        [createdRow.id],
      );
      const cycleIso = cycleRes.rows[0]?.last_cycle_started_at;
      if (advancedConfig.notifyOnPublish !== false) {
        const publishPayload = buildTestPublishNotificationPayload({
          testId: createdRow.id,
          testTitle: data.title,
          cycleStartedAt: cycleIso,
        });
        if (publishPayload) {
          await enqueueNotification(req.userId, publishPayload);
        }
      }
      const emailResult = triggerTestPublishAnnouncementEmail({
        testId: createdRow.id,
        testTitle: data.title,
        isPublished: true,
        lastCycleStartedAt: cycleIso,
        advancedConfig,
        previousAdvancedConfig: {},
        justPublished: true,
        cycleRenewed: false,
      });
      advancedConfigToSave = mergePublishEmailDedupeKey(advancedConfig, emailResult.updateDedupeKey);
    }
    const currentAdvancedMap = await getJsonSetting('testAdvancedConfigs', {});
    const nextAdvancedMap =
      currentAdvancedMap && typeof currentAdvancedMap === 'object' ? { ...currentAdvancedMap } : {};
    nextAdvancedMap[testSettingKey(createdRow.id)] = advancedConfigToSave;
    await setJsonSetting('testAdvancedConfigs', nextAdvancedMap, req.userId);
    await syncTestPublishScheduleFromAdvancedConfig(createdRow.id, advancedConfigToSave, req.userId);
    return res.status(201).json({ item: { ...createdRow, advanced_config: advancedConfigToSave } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    console.error('admin_create_test_error', e);
    return res.status(500).json({ error: 'Failed to create test' });
  }
});

router.patch('/tests/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  const parsed = normalizeTestPayload(req.body, { skipEnrolledCapacityCheck: true });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const data = parsed.value;
  const advancedParsed = normalizeTestAdvancedConfig((req.body || {}).advancedConfig);
  if (advancedParsed.error) return res.status(400).json({ error: advancedParsed.error });
  const advancedMapBefore = await getJsonSetting('testAdvancedConfigs', {});
  const previousAdvancedConfig = resolveAdvancedConfigForTest(advancedMapBefore, id) || {};
  let advancedConfig = preserveServerAdvancedFields(advancedParsed.value, previousAdvancedConfig);
  const storedPublished = data.isPublished !== false;
  const body = req.body || {};
  const hasDynamicFluctuationValue = Object.prototype.hasOwnProperty.call(body, 'dynamicFluctuationOnPublish');
  try {
    const txResult = await withPgTransaction(async (client) => {
      const before = await client.query(
        `SELECT id, title, is_published, last_cycle_started_at, enrolled_count,
                COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish
         FROM tests
         WHERE id = $1::uuid
         LIMIT 1
         FOR UPDATE`,
        [id],
      );
      const beforeRow = before.rows[0];
      if (!beforeRow) {
        const err = new Error('Test not found');
        err.statusCode = 404;
        throw err;
      }
      const dynamicFluctuationOnPublish = hasDynamicFluctuationValue
        ? data.dynamicFluctuationOnPublish
        : beforeRow.dynamic_fluctuation_on_publish !== false;
      const { rows } = await client.query(
        `UPDATE tests
         SET slug = $1, title = $2, subcategory = $3, meta_line = $4, duration_minutes = $5,
             question_count = $6, test_kind = $7, is_published = $8, dynamic_fluctuation_on_publish = $9,
             exam_date = $10::date, total_marks = $11, slot_label = $12, capacity_total = $13, enrolled_count = $14,
             attempts_allowed = $15, language_mode = $16, exam_mode = $17, negative_marking_text = $18,
             test_type_label = $19, badge_enabled = $20, badge_text = $21, valid_until = $22::date, answer_key_release_at = $23::timestamptz, result_release_at = $24::timestamptz, dynamic_date_enabled = $25, date_cycle_days = $26
         WHERE id = $27::uuid
         RETURNING id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
                   exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed, language_mode,
                   exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until, answer_key_release_at, result_release_at, dynamic_date_enabled, date_cycle_days,
                   COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish`,
        [
          data.slug,
          data.title,
          data.subcategory,
          data.metaLine,
          data.durationMinutes,
          data.questionCount,
          data.testKind,
          storedPublished,
          dynamicFluctuationOnPublish,
          data.examDate || null,
          data.totalMarks,
          data.slotLabel,
          data.capacityTotal,
          Math.max(0, Number(beforeRow.enrolled_count || 0)),
          data.attemptsAllowed,
          data.languageMode,
          data.examMode,
          data.negativeMarkingText,
          data.testTypeLabel,
          data.badgeEnabled,
          data.badgeText,
          data.validUntil || null,
          data.answerKeyReleaseAt || null,
          data.resultReleaseAt || null,
          data.dynamicDateEnabled,
          data.dateCycleDays,
          id,
        ],
      );
      if (!rows[0]) {
        const err = new Error('Test not found');
        err.statusCode = 404;
        throw err;
      }
      const justPublished = !beforeRow.is_published && rows[0].is_published;
      const cycleRenewed = false;
      if (rows[0].is_published) {
        const cycleAction = resolveAdminCycleStartUpdate(rows[0], beforeRow, { justPublished });
        if (cycleAction.setCycleStart) {
          await client.query(
            `UPDATE tests
             SET last_cycle_started_at = now(), updated_at = now()
             WHERE id = $1::uuid`,
            [id],
          );
        }
      }
      if (justPublished) {
        await regenerateTestFromSubcategoryPool(rows[0].id, { client });
      }
      return { savedRow: rows[0], justPublished, cycleRenewed };
    });

    const { savedRow, justPublished, cycleRenewed } = txResult;
    const cycleRes = await pool.query(
      `SELECT last_cycle_started_at FROM tests WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    const cycleIso = cycleRes.rows[0]?.last_cycle_started_at;
    if (justPublished && advancedConfig.notifyOnPublish !== false) {
      const publishPayload = buildTestPublishNotificationPayload({
        testId: id,
        testTitle: savedRow.title,
        cycleStartedAt: cycleIso,
        title: 'Test Published',
        message: `${savedRow.title} is now live.`,
      });
      if (publishPayload) {
        await enqueueNotification(req.userId, publishPayload);
      }
    }
    const emailResult = triggerTestPublishAnnouncementEmail({
      testId: id,
      testTitle: savedRow.title,
      isPublished: savedRow.is_published === true,
      lastCycleStartedAt: cycleIso,
      advancedConfig,
      previousAdvancedConfig,
      justPublished,
      cycleRenewed,
    });
    advancedConfig = mergePublishEmailDedupeKey(advancedConfig, emailResult.updateDedupeKey);
    const currentAdvancedMap = await getJsonSetting('testAdvancedConfigs', {});
    const nextAdvancedMap =
      currentAdvancedMap && typeof currentAdvancedMap === 'object' ? { ...currentAdvancedMap } : {};
    nextAdvancedMap[testSettingKey(id)] = advancedConfig;
    await setJsonSetting('testAdvancedConfigs', nextAdvancedMap, req.userId);
    await syncTestPublishScheduleFromAdvancedConfig(id, advancedConfig, req.userId);
    await syncTestQuestionCount(pool, id);
    const refreshed = await pool.query(
      `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
              exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed, language_mode,
              exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until, answer_key_release_at, result_release_at, dynamic_date_enabled, date_cycle_days,
              COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );
    const refreshedRow = refreshed.rows[0] || savedRow;
    return res.json({ item: { ...refreshedRow, advanced_config: advancedConfig } });
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: 'Test not found' });
    if (e.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    console.error('admin_update_test_error', e);
    return res.status(500).json({ error: 'Failed to update test' });
  }
});

router.delete('/tests/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  try {
    const del = await pool.query(`DELETE FROM tests WHERE id = $1::uuid`, [id]);
    if (!del.rowCount) return res.status(404).json({ error: 'Test not found' });
    const currentAdvancedMap = await getJsonSetting('testAdvancedConfigs', {});
    if (currentAdvancedMap && typeof currentAdvancedMap === 'object') {
      const nextAdvancedMap = { ...currentAdvancedMap };
      const key = testSettingKey(id);
      let removed = false;
      if (nextAdvancedMap[key]) {
        delete nextAdvancedMap[key];
        removed = true;
      } else {
        const lower = key.toLowerCase();
        for (const mapKey of Object.keys(nextAdvancedMap)) {
          if (String(mapKey).trim().toLowerCase() === lower) {
            delete nextAdvancedMap[mapKey];
            removed = true;
            break;
          }
        }
      }
      if (removed) {
        await setJsonSetting('testAdvancedConfigs', nextAdvancedMap, req.userId);
      }
    }
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete test' });
  }
});

router.get('/tests/:id/questions', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  try {
    const { rows } = await pool.query(
      `SELECT id, test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published,
              COALESCE(subject_key, '') AS subject_key
       FROM questions
       WHERE test_id = $1::uuid
       ORDER BY position ASC`,
      [id],
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list questions' });
  }
});

router.post('/tests/:id/questions', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  const parsed = normalizeQuestionPayload(req.body, { requirePosition: false });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const q = parsed.value;
  try {
    const subjectErr = await assertQuestionSubjectAllowed(id, q.subjectKey);
    if (subjectErr) return res.status(400).json({ error: subjectErr });
    if (await hasDuplicateStemInTest(id, q.stem)) {
      return res.status(409).json({ error: 'Duplicate question detected for this test' });
    }
    let created = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const posRes = await pool.query(`SELECT COALESCE(MAX(position), 0) AS max_pos FROM questions WHERE test_id = $1::uuid`, [id]);
      const finalPosition = Number(posRes.rows[0]?.max_pos || 0) + 1;
      try {
        const { rows } = await pool.query(
          `INSERT INTO questions (
             test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key`,
          [
            id,
            finalPosition,
            q.stem,
            q.choiceA,
            q.choiceB,
            q.choiceC,
            q.choiceD,
            q.correctIndex,
            q.explanation,
            q.isPublished,
            q.subjectKey || '',
          ],
        );
        created = rows[0];
        break;
      } catch (insertErr) {
        if (insertErr && insertErr.code === '23505') continue;
        throw insertErr;
      }
    }
    if (!created) {
      return res.status(409).json({ error: 'Please retry. Could not assign question position safely.' });
    }
    await syncTestQuestionCount(pool, id);
    return res.status(201).json({ item: created });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create question' });
  }
});

router.post('/tests/:id/questions/import', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  const mode = String((req.body || {}).mode || 'append').trim().toLowerCase();
  if (!['append', 'replace'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be append or replace' });
  }
  const parsedRows = parseBulkQuestionRows((req.body || {}).items);
  if (parsedRows.error) return res.status(400).json({ error: parsedRows.error });
  const rows = parsedRows.value;
  try {
    const existingRes = await pool.query(`SELECT id, stem, position FROM questions WHERE test_id = $1::uuid`, [id]);
    const existingStemSet = new Set(existingRes.rows.map((r) => normalizeStemKey(r.stem)).filter(Boolean));
    const incomingStemSet = new Set();
    for (const row of rows) {
      const key = normalizeStemKey(row.stem);
      if (!key) return res.status(400).json({ error: `Invalid stem at row ${row.rowNo}` });
      if (incomingStemSet.has(key)) {
        return res.status(409).json({ error: `Duplicate stem inside import file at row ${row.rowNo}` });
      }
      incomingStemSet.add(key);
      if (mode === 'append' && existingStemSet.has(key)) {
        return res.status(409).json({ error: `Duplicate question exists in this test at row ${row.rowNo}` });
      }
      const skErr = await assertQuestionSubjectAllowed(id, row.subjectKey);
      if (skErr) return res.status(400).json({ error: `${skErr} (row ${row.rowNo})` });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (mode === 'replace') {
        await client.query(`DELETE FROM questions WHERE test_id = $1::uuid`, [id]);
      }
      const basePosRes = await client.query(`SELECT COALESCE(MAX(position), 0) AS max_pos FROM questions WHERE test_id = $1::uuid`, [id]);
      let nextPosition = Number(basePosRes.rows[0]?.max_pos || 0) + 1;
      const usedPositions = new Set(
        (mode === 'replace' ? [] : existingRes.rows)
          .map((r) => Number(r.position || 0))
          .filter((p) => Number.isInteger(p) && p > 0),
      );
      let inserted = 0;
      for (const row of rows) {
        let finalPosition = row.position;
        if (!Number.isInteger(finalPosition) || finalPosition <= 0 || usedPositions.has(finalPosition)) {
          while (usedPositions.has(nextPosition)) nextPosition += 1;
          finalPosition = nextPosition;
          nextPosition += 1;
        }
        usedPositions.add(finalPosition);
        await client.query(
          `INSERT INTO questions (
             test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            finalPosition,
            row.stem,
            row.choiceA,
            row.choiceB,
            row.choiceC,
            row.choiceD,
            row.correctIndex,
            row.explanation,
            row.isPublished,
            row.subjectKey || '',
          ],
        );
        inserted += 1;
      }
      await client.query('COMMIT');
      await syncTestQuestionCount(pool, id);
      return res.status(201).json({ ok: true, inserted, mode });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to import questions' });
  }
});

router.patch('/tests/:id/questions/:questionId', async (req, res) => {
  const { id, questionId } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  const qid = Number(questionId);
  if (!Number.isInteger(qid) || qid <= 0) return res.status(400).json({ error: 'Invalid question id' });
  const parsed = normalizeQuestionPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const q = parsed.value;
  try {
    const subjectErr = await assertQuestionSubjectAllowed(id, q.subjectKey);
    if (subjectErr) return res.status(400).json({ error: subjectErr });
    if (await hasDuplicateStemInTest(id, q.stem, qid)) {
      return res.status(409).json({ error: 'Duplicate question detected for this test' });
    }
    const { rows } = await pool.query(
      `UPDATE questions
       SET stem = $1, choice_a = $2, choice_b = $3, choice_c = $4, choice_d = $5, correct_index = $6, explanation = $7, is_published = $8, subject_key = $9
       WHERE id = $10 AND test_id = $11::uuid
       RETURNING id, test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key`,
      [
        q.stem,
        q.choiceA,
        q.choiceB,
        q.choiceC,
        q.choiceD,
        q.correctIndex,
        q.explanation,
        q.isPublished,
        q.subjectKey || '',
        qid,
        id,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Question not found' });
    await syncTestQuestionCount(pool, id);
    return res.json({ item: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update question' });
  }
});

router.delete('/tests/:id/questions/:questionId', async (req, res) => {
  const { id, questionId } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  const qid = Number(questionId);
  if (!Number.isInteger(qid) || qid <= 0) return res.status(400).json({ error: 'Invalid question id' });
  try {
    const del = await pool.query(`DELETE FROM questions WHERE id = $1 AND test_id = $2::uuid`, [qid, id]);
    if (!del.rowCount) return res.status(404).json({ error: 'Question not found' });
    await syncTestQuestionCount(pool, id);
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete question' });
  }
});

router.get('/digest', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, question_prompt, option_a, option_b, option_c, option_d, correct_index, fact_text, is_published, created_at
       FROM daily_digest_items
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily digest items' });
  }
});

router.post('/digest', async (req, res) => {
  const body = req.body || {};
  const questionPrompt = String(body.questionPrompt || '').trim();
  const optionA = String(body.optionA || '').trim();
  const optionB = String(body.optionB || '').trim();
  const optionC = String(body.optionC || '').trim();
  const optionD = String(body.optionD || '').trim();
  const correctIndex = Number(body.correctIndex);
  const factText = String(body.factText || '').trim();
  const isPublished = body.isPublished !== false;
  const notifyUsers = body.notifyUsers === true;

  if (!questionPrompt || !optionA || !optionB || !optionC || !optionD || !factText) {
    return res.status(400).json({ error: 'Question, all options, and fact are required' });
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return res.status(400).json({ error: 'correctIndex must be 0, 1, 2, or 3' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO daily_digest_items (
         question_prompt, option_a, option_b, option_c, option_d, correct_index, fact_text, is_published
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, question_prompt, option_a, option_b, option_c, option_d, correct_index, fact_text, is_published, created_at`,
      [questionPrompt, optionA, optionB, optionC, optionD, correctIndex, factText, isPublished],
    );
    if (isPublished && notifyUsers) {
      await enqueueNotification(req.userId, {
        title: 'Daily Digest Updated',
        message: 'A new daily digest has been published.',
        target: 'all',
        scheduleAt: new Date().toISOString(),
      });
    }
    return res.status(201).json({ item: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create daily digest item' });
  }
});

router.patch('/digest/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid digest item id' });
  const body = req.body || {};
  const questionPrompt = String(body.questionPrompt || '').trim();
  const optionA = String(body.optionA || '').trim();
  const optionB = String(body.optionB || '').trim();
  const optionC = String(body.optionC || '').trim();
  const optionD = String(body.optionD || '').trim();
  const correctIndex = Number(body.correctIndex);
  const factText = String(body.factText || '').trim();
  const isPublished = body.isPublished !== false;
  const notifyUsers = body.notifyUsers === true;

  if (!questionPrompt || !optionA || !optionB || !optionC || !optionD || !factText) {
    return res.status(400).json({ error: 'Question, all options, and fact are required' });
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return res.status(400).json({ error: 'correctIndex must be 0, 1, 2, or 3' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE daily_digest_items
       SET question_prompt = $1, option_a = $2, option_b = $3, option_c = $4, option_d = $5,
           correct_index = $6, fact_text = $7, is_published = $8
       WHERE id = $9::uuid
       RETURNING id, question_prompt, option_a, option_b, option_c, option_d, correct_index, fact_text, is_published, created_at`,
      [questionPrompt, optionA, optionB, optionC, optionD, correctIndex, factText, isPublished, id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Daily digest item not found' });
    if (isPublished && notifyUsers) {
      await enqueueNotification(req.userId, {
        title: 'Daily Digest Updated',
        message: 'Daily digest has been refreshed by admin.',
        target: 'all',
        scheduleAt: new Date().toISOString(),
      });
    }
    return res.json({ item: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update daily digest item' });
  }
});

router.delete('/digest/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid digest item id' });
  try {
    const del = await pool.query(`DELETE FROM daily_digest_items WHERE id = $1::uuid`, [id]);
    if (!del.rowCount) return res.status(404).json({ error: 'Daily digest item not found' });
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete daily digest item' });
  }
});

router.get('/daily-quiz', async (_req, res) => {
  try {
    const payload = await getJsonSetting('dailyQuizItems', { items: [] });
    const items = Array.isArray(payload.items) ? payload.items : [];
    return res.json({ items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily quiz items' });
  }
});

router.post('/daily-quiz', async (req, res) => {
  try {
    const body = req.body || {};
    const normalized = normalizeDailyQuizItem(body);
    const notifyUsers = body.notifyUsers === true;
    if (!normalized) {
      return res.status(400).json({ error: 'Question, four options, and valid correctIndex are required' });
    }
    const current = await getJsonSetting('dailyQuizItems', { items: [] });
    const items = Array.isArray(current.items) ? current.items : [];
    const next = { items: [normalized, ...items].slice(0, 500) };
    await setJsonSetting('dailyQuizItems', next, req.userId);
    if (normalized.isPublished && notifyUsers) {
      await enqueueNotification(req.userId, {
        title: 'Daily Quiz Updated',
        message: 'Today\'s daily quiz is now available.',
        target: 'all',
        deepLink: 'menu_quiz',
        scheduleAt: new Date().toISOString(),
      });
    }
    return res.status(201).json({ item: normalized });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create daily quiz item' });
  }
});

router.patch('/daily-quiz/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const notifyUsers = (req.body || {}).notifyUsers === true;
    if (!id) return res.status(400).json({ error: 'Invalid daily quiz item id' });
    const current = await getJsonSetting('dailyQuizItems', { items: [] });
    const items = Array.isArray(current.items) ? current.items : [];
    const idx = items.findIndex((x) => String(x.id || '') === id);
    if (idx < 0) return res.status(404).json({ error: 'Daily quiz item not found' });
    const normalized = normalizeDailyQuizItem(
      {
        ...items[idx],
        ...(req.body || {}),
        id,
        createdAt: items[idx].createdAt,
      },
      id,
    );
    if (!normalized) {
      return res.status(400).json({ error: 'Question, four options, and valid correctIndex are required' });
    }
    const nextItems = [...items];
    nextItems[idx] = normalized;
    await setJsonSetting('dailyQuizItems', { items: nextItems }, req.userId);
    if (normalized.isPublished && notifyUsers) {
      await enqueueNotification(req.userId, {
        title: 'Daily Quiz Updated',
        message: 'Daily quiz has been refreshed by admin.',
        target: 'all',
        deepLink: 'menu_quiz',
        scheduleAt: new Date().toISOString(),
      });
    }
    return res.json({ item: normalized });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update daily quiz item' });
  }
});

router.delete('/daily-quiz/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Invalid daily quiz item id' });
    const current = await getJsonSetting('dailyQuizItems', { items: [] });
    const items = Array.isArray(current.items) ? current.items : [];
    const nextItems = items.filter((x) => String(x.id || '') !== id);
    if (nextItems.length === items.length) {
      return res.status(404).json({ error: 'Daily quiz item not found' });
    }
    await setJsonSetting('dailyQuizItems', { items: nextItems }, req.userId);
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete daily quiz item' });
  }
});

function buildUtcRangeLabels(rangeDays) {
  const n = Math.max(1, Math.min(120, Math.floor(rangeDays)));
  const labels = [];
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${day}`);
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
  }
  return { labels, keys };
}

function emptyDailyQuizStatsPayload(rangeDays) {
  const { labels, keys } = buildUtcRangeLabels(rangeDays);
  return {
    rangeDays,
    tableReady: false,
    kpis: {
      totalAttempts: 0,
      uniqueUsers: 0,
      attemptsToday: 0,
      correctRatePct: 0,
      avgTimeSeconds: 0,
      publishedItems: 0,
    },
    attemptsPerDay: {
      labels,
      attempts: keys.map(() => 0),
      uniqueUsers: keys.map(() => 0),
    },
    outcomeSplit: { correct: 0, wrong: 0, skipped: 0 },
    recentActivity: [],
  };
}

/** Daily Quiz analytics only — not mock-test test_attempts. */
router.get('/daily-quiz/stats', async (req, res) => {
  const rangeDays = parseSummaryRangeDays(req);
  const { labels, keys } = buildUtcRangeLabels(rangeDays);
  try {
    const publishedPayload = await getJsonSetting('dailyQuizItems', { items: [] });
    const publishedItems = Array.isArray(publishedPayload.items)
      ? publishedPayload.items.filter((x) => x && x.isPublished !== false).length
      : 0;

    const [
      kpiRow,
      todayRow,
      byDayRows,
      outcomeRow,
      recentRows,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_attempts,
                COUNT(DISTINCT user_id)::int AS unique_users,
                ROUND(AVG(time_taken_seconds))::int AS avg_time_seconds,
                ROUND(100.0 * COUNT(*) FILTER (WHERE is_correct = true) / NULLIF(COUNT(*), 0))::int AS correct_rate_pct
         FROM daily_quiz_attempts
         WHERE quiz_day >= (timezone('UTC', now())::date - ($1::int - 1))`,
        [rangeDays],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c,
                COUNT(DISTINCT user_id)::int AS u
         FROM daily_quiz_attempts
         WHERE quiz_day = (timezone('UTC', now())::date)`,
      ),
      pool.query(
        `SELECT quiz_day::text AS d,
                COUNT(*)::int AS attempts,
                COUNT(DISTINCT user_id)::int AS unique_users
         FROM daily_quiz_attempts
         WHERE quiz_day >= (timezone('UTC', now())::date - ($1::int - 1))
         GROUP BY quiz_day
         ORDER BY quiz_day`,
        [rangeDays],
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE is_correct = true)::int AS correct,
           COUNT(*) FILTER (WHERE is_correct = false AND selected_option_index IS NOT NULL)::int AS wrong,
           COUNT(*) FILTER (WHERE selected_option_index IS NULL)::int AS skipped
         FROM daily_quiz_attempts
         WHERE quiz_day >= (timezone('UTC', now())::date - ($1::int - 1))`,
        [rangeDays],
      ),
      pool.query(
        `SELECT
           COALESCE(NULLIF(trim(u.display_name), ''), LEFT(trim(u.email::text), 40), 'User') AS student,
           dqa.quiz_day::text AS quiz_day,
           dqa.is_correct,
           dqa.time_taken_seconds,
           LEFT(COALESCE(NULLIF(trim(dqa.question_prompt), ''), 'Question'), 80) AS question_prompt,
           dqa.submitted_at
         FROM daily_quiz_attempts dqa
         JOIN users u ON u.id = dqa.user_id
         ORDER BY dqa.submitted_at DESC
         LIMIT 30`,
      ),
    ]);

    const byDayMap = new Map();
    byDayRows.rows.forEach((row) => {
      const key = String(row.d || '').slice(0, 10);
      byDayMap.set(key, {
        attempts: Number(row.attempts) || 0,
        uniqueUsers: Number(row.unique_users) || 0,
      });
    });

    const kpi = kpiRow.rows[0] || {};
    const today = todayRow.rows[0] || {};
    const outcome = outcomeRow.rows[0] || {};

    return res.json({
      rangeDays,
      tableReady: true,
      kpis: {
        totalAttempts: Number(kpi.total_attempts) || 0,
        uniqueUsers: Number(kpi.unique_users) || 0,
        attemptsToday: Number(today.c) || 0,
        uniqueUsersToday: Number(today.u) || 0,
        correctRatePct: Number(kpi.correct_rate_pct) || 0,
        avgTimeSeconds: Number(kpi.avg_time_seconds) || 0,
        publishedItems,
      },
      attemptsPerDay: {
        labels,
        attempts: keys.map((k) => byDayMap.get(k)?.attempts ?? 0),
        uniqueUsers: keys.map((k) => byDayMap.get(k)?.uniqueUsers ?? 0),
      },
      outcomeSplit: {
        correct: Number(outcome.correct) || 0,
        wrong: Number(outcome.wrong) || 0,
        skipped: Number(outcome.skipped) || 0,
      },
      recentActivity: recentRows.rows.map((row) => ({
        student: String(row.student || 'User'),
        quizDay: String(row.quiz_day || '').slice(0, 10),
        isCorrect: Boolean(row.is_correct),
        timeTakenSeconds: Number(row.time_taken_seconds) || 0,
        questionPrompt: String(row.question_prompt || ''),
        submittedAt: row.submitted_at,
      })),
    });
  } catch (e) {
    if (e && e.code === '42P01') {
      const empty = emptyDailyQuizStatsPayload(rangeDays);
      try {
        const publishedPayload = await getJsonSetting('dailyQuizItems', { items: [] });
        empty.kpis.publishedItems = Array.isArray(publishedPayload.items)
          ? publishedPayload.items.filter((x) => x && x.isPublished !== false).length
          : 0;
      } catch (_inner) {
        empty.kpis.publishedItems = 0;
      }
      return res.json(empty);
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily quiz stats' });
  }
});

router.get('/articles/feed-kinds', async (_req, res) => {
  try {
    const kinds = await getArticleFeedKindList();
    return res.json({ kinds });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load content types' });
  }
});

router.put('/articles/feed-kinds', async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.kinds)) {
    return res.status(400).json({ error: 'kinds must be an array of strings' });
  }
  try {
    const result = await setArticleFeedKindList(body.kinds, req.userId);
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({ kinds: result.kinds });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to save content types' });
  }
});

router.get('/articles/categories', async (_req, res) => {
  try {
    const categories = await getArticleCategoryList();
    return res.json({ categories });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load article categories' });
  }
});

router.put('/articles/categories', async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.categories)) {
    return res.status(400).json({ error: 'categories must be an array of strings' });
  }
  try {
    const result = await setArticleCategoryList(body.categories, req.userId);
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({ categories: result.categories });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to save article categories' });
  }
});

router.get('/articles', async (req, res) => {
  const kindRaw = String(req.query.feedKind || '').trim().toLowerCase();
  const kind = kindRaw ? normalizeFeedKindSlug(kindRaw) : null;
  if (kindRaw && !kind) {
    return res.status(400).json({ error: FEED_KIND_INVALID_HINT });
  }
  const limitRaw = parseInt(String(req.query.limit || ''), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(5000, Math.max(1, limitRaw)) : 1000;
  const filters = [];
  const params = [];
  if (kind) {
    filters.push(`feed_kind = $${params.length + 1}`);
    params.push(kind);
  }
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(
      `SELECT id, feed_kind, headline, summary, category, body, link_url, feature_image_url, published_at, is_published
       FROM news_articles
       ${whereSql}
       ORDER BY updated_at DESC
       LIMIT ${limitPlaceholder}`,
      params,
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list articles' });
  }
});

router.post('/articles', async (req, res) => {
  const body = req.body || {};
  const feedKind = normalizeFeedKindSlug(body.feedKind);
  const headline = String(body.headline || '').trim();
  if (!feedKind || !headline) {
    return res.status(400).json({
      error: `feedKind is invalid or headline is missing. ${FEED_KIND_INVALID_HINT}`,
    });
  }
  const summary = String(body.summary || '');
  const category = String(body.category || '');
  const articleBody = String(body.body || '');
  const linkUrl = String(body.linkUrl || '');
  const featureImageUrl = String(body.featureImageUrl || '').trim() || null;
  const isPublished = body.isPublished !== false;
  try {
    // Guard against accidental double-submit of the exact same article payload.
    const duplicate = await pool.query(
      `SELECT id, feed_kind, headline, summary, category, body, link_url, feature_image_url, published_at, is_published
       FROM news_articles
       WHERE feed_kind = $1
         AND headline = $2
         AND summary = $3
         AND category = $4
         AND body = $5
         AND link_url = $6
         AND COALESCE(feature_image_url, '') = COALESCE($7, '')
         AND is_published = $8
         AND published_at >= (now() - interval '10 minutes')
       ORDER BY published_at DESC
       LIMIT 1`,
      [feedKind, headline, summary, category, articleBody, linkUrl, featureImageUrl, isPublished],
    );
    if (duplicate.rows[0]) {
      return res.status(200).json({ item: duplicate.rows[0], duplicate: true });
    }
    const { rows } = await pool.query(
      `INSERT INTO news_articles (
         feed_kind, headline, summary, category, body, link_url, feature_image_url, published_at, is_published
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
       RETURNING id, feed_kind, headline, summary, category, body, link_url, feature_image_url, published_at, is_published`,
      [
        feedKind,
        headline,
        summary,
        category,
        articleBody,
        linkUrl,
        featureImageUrl,
        isPublished,
      ],
    );
    if (isPublished) {
      const announcementOn = (await getSettingsMap()).jobExamArticleAnnouncementEmail === true;
      await enqueueNotification(req.userId, {
        title: 'New Update',
        message: `${headline} has been published.`,
        target: 'all',
        scheduleAt: new Date().toISOString(),
      });
      if (announcementOn) {
        const kind = feedKind === 'job' ? 'job' : feedKind === 'exam' ? 'exam' : null;
        if (kind) {
          queueContentAnnouncementEmails({
            kind,
            title: headline,
            message: String(summary || category || 'A new update is now available for you.'),
            ctaUrl: String(linkUrl || process.env.MAIL_APP_URL || '').trim(),
            ctaLabel: kind === 'job' ? 'View Job Alert' : 'View Exam Alert',
          });
        }
      }
    }
    return res.status(201).json({ item: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create article' });
  }
});

router.patch('/articles/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid article id' });
  const body = req.body || {};
  const feedKind = normalizeFeedKindSlug(body.feedKind);
  const headline = String(body.headline || '').trim();
  if (!feedKind || !headline) {
    return res.status(400).json({
      error: `feedKind is invalid or headline is missing. ${FEED_KIND_INVALID_HINT}`,
    });
  }
  const hasFeatureImage = Object.prototype.hasOwnProperty.call(body, 'featureImageUrl');
  const featureImageUrl = hasFeatureImage ? String(body.featureImageUrl || '').trim() || null : undefined;
  try {
    const before = await pool.query(`SELECT id, headline, is_published FROM news_articles WHERE id = $1::uuid LIMIT 1`, [id]);
    const beforeRow = before.rows[0];
    if (!beforeRow) return res.status(404).json({ error: 'Article not found' });
    const { rows } = hasFeatureImage
      ? await pool.query(
          `UPDATE news_articles
           SET feed_kind = $1, headline = $2, summary = $3, category = $4, body = $5, link_url = $6,
               feature_image_url = $7, is_published = $8
           WHERE id = $9::uuid
           RETURNING id, feed_kind, headline, summary, category, body, link_url, feature_image_url, published_at, is_published`,
          [
            feedKind,
            headline,
            String(body.summary || ''),
            String(body.category || ''),
            String(body.body || ''),
            String(body.linkUrl || ''),
            featureImageUrl,
            body.isPublished !== false,
            id,
          ],
        )
      : await pool.query(
          `UPDATE news_articles
           SET feed_kind = $1, headline = $2, summary = $3, category = $4, body = $5, link_url = $6, is_published = $7
           WHERE id = $8::uuid
           RETURNING id, feed_kind, headline, summary, category, body, link_url, feature_image_url, published_at, is_published`,
          [
            feedKind,
            headline,
            String(body.summary || ''),
            String(body.category || ''),
            String(body.body || ''),
            String(body.linkUrl || ''),
            body.isPublished !== false,
            id,
          ],
        );
    if (!rows[0]) return res.status(404).json({ error: 'Article not found' });
    if (!beforeRow.is_published && rows[0].is_published) {
      const announcementOn = (await getSettingsMap()).jobExamArticleAnnouncementEmail === true;
      await enqueueNotification(req.userId, {
        title: 'News Published',
        message: `${rows[0].headline} is now available.`,
        target: 'all',
        deepLink: 'main/news',
        scheduleAt: new Date().toISOString(),
      });
      if (announcementOn) {
        const kind = feedKind === 'job' ? 'job' : feedKind === 'exam' ? 'exam' : null;
        if (kind) {
          queueContentAnnouncementEmails({
            kind,
            title: rows[0].headline,
            message: String(body.summary || body.category || 'A new update is now available for you.'),
            ctaUrl: String(body.linkUrl || process.env.MAIL_APP_URL || '').trim(),
            ctaLabel: kind === 'job' ? 'Open Job Alert' : 'Open Exam Alert',
          });
        }
      }
    }
    return res.json({ item: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update article' });
  }
});

router.delete('/articles/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid article id' });
  try {
    const del = await pool.query(`DELETE FROM news_articles WHERE id = $1::uuid`, [id]);
    if (!del.rowCount) return res.status(404).json({ error: 'Article not found' });
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete article' });
  }
});

router.get('/permissions/catalog', async (_req, res) => {
  try {
    return res.json({ ok: true, catalog: getPermissionCatalogResponse() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load permission catalog' });
  }
});

router.get('/permissions/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT email, is_admin, is_super_admin FROM users WHERE id = $1::uuid LIMIT 1`,
      [req.userId],
    );
    const user = rows[0];
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const effective = await getEffectiveAdminPermissions({
      userId: req.userId,
      isAdmin: Boolean(user.is_admin),
      isSuperAdmin: Boolean(user.is_super_admin),
      email: user.email,
    });
    const stored = user.is_super_admin ? [] : await loadStoredPermissionKeys(req.userId);
    return res.json({
      ok: true,
      isSuperAdmin: Boolean(user.is_super_admin),
      implicitFullAccess: effective.isImplicitFullAccess,
      permissionKeys: effective.keys,
      storedPermissionKeys: stored,
      total: effective.keys.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load admin permissions' });
  }
});

router.get('/users/:id/permissions', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const { rows } = await pool.query(
      `SELECT id, email, display_name, is_admin, is_super_admin
       FROM users WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.is_admin) {
      return res.status(400).json({ error: 'User is not an admin' });
    }
    const effective = await getEffectiveAdminPermissions({
      userId: id,
      isAdmin: Boolean(user.is_admin),
      isSuperAdmin: Boolean(user.is_super_admin),
      email: user.email,
    });
    const stored = user.is_super_admin ? [] : await loadStoredPermissionKeys(id);
    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: Boolean(user.is_admin),
        isSuperAdmin: Boolean(user.is_super_admin),
      },
      implicitFullAccess: effective.isImplicitFullAccess,
      permissionKeys: effective.keys,
      storedPermissionKeys: stored,
      total: effective.keys.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load user permissions' });
  }
});

router.put('/users/:id/permissions', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  const keys = (req.body && req.body.permissionKeys) || (req.body && req.body.permissions) || [];
  try {
    const result = await replaceAdminUserPermissions({
      targetUserId: id,
      permissionKeys: keys,
      grantedByUserId: req.userId,
      actorCanManageRbac: req.hasAdminPermission('rbac_manage'),
    });
    await logAdminAction(req, 'admin_permissions_updated', 'user', id, {
      permissionKeys: result.permissionKeys,
      total: result.total,
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    if (e && e.status) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to update user permissions' });
  }
});

router.get('/users', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limitRaw = Number(req.query.limit);
  const limit = Math.min(100, Math.max(5, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 30));
  const offsetRaw = Number(req.query.offset);
  const offset = Math.max(0, Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0);
  const params = [];
  let whereSql = '';
  if (q) {
    whereSql = `WHERE email ILIKE $1 OR display_name ILIKE $1 OR phone ILIKE $1 OR id::text ILIKE $1`;
    params.push(`%${q}%`);
  }
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  try {
    const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM users ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.c || 0);
    const { rows } = await pool.query(
      `SELECT id, email, display_name, phone, is_admin, is_super_admin, is_banned, ban_reason, banned_at, created_at
       FROM users
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, limit, offset],
    );
    return res.json({ items: rows, total });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

router.get('/users/reports', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(100, Math.max(10, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const params = [];
  let whereSql = '';
  if (q) {
    whereSql = `WHERE (u.email ILIKE $1 OR u.display_name ILIKE $1 OR u.phone ILIKE $1 OR u.id::text ILIKE $1
                OR CAST(u.six_digit_public_id AS TEXT) ILIKE $1)`;
    params.push(`%${q}%`);
  }
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.phone, u.six_digit_public_id, u.is_banned, u.ban_reason, u.created_at,
              COUNT(ta.id)::int AS attempts_count,
              MAX(ta.completed_at) AS last_attempt_at
       FROM users u
       LEFT JOIN test_attempts ta ON ta.user_id = u.id
       ${whereSql}
       GROUP BY u.id, u.email, u.display_name, u.phone, u.six_digit_public_id, u.is_banned, u.ban_reason, u.created_at
       ORDER BY attempts_count DESC, u.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, limit, offset],
    );
    return res.json({ items: rows, limit, offset });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load user reports' });
  }
});

router.get('/insights', async (req, res) => {
  const months = Math.min(24, Math.max(3, Number(req.query.months || 12)));
  try {
    const [topTests, growth] = await Promise.all([
      pool.query(
        `SELECT COALESCE(t.title, ta.test_name) AS test_name, COUNT(*)::int AS attempts_count
         FROM test_attempts ta
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
         GROUP BY COALESCE(t.title, ta.test_name)
         ORDER BY attempts_count DESC
         LIMIT 10`,
      ),
      pool.query(
        `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_key,
                COUNT(*)::int AS users_count
         FROM users
         WHERE created_at >= date_trunc('month', now()) - ($1::int - 1) * interval '1 month'
         GROUP BY date_trunc('month', created_at)
         ORDER BY date_trunc('month', created_at) ASC`,
        [months],
      ),
    ]);
    return res.json({
      mostAttemptedTests: topTests.rows,
      userGrowth: growth.rows,
      months,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load insights' });
  }
});

/** UTC calendar-day window (same semantics as /admin/summary `range`). */
router.get('/analytics', async (req, res) => {
  try {
    const rangeDays = parseSummaryRangeDays(req);
    const attemptDay = `(completed_at AT TIME ZONE 'UTC')::date`;
    const userCreatedDay = `(created_at AT TIME ZONE 'UTC')::date`;
    const windowStart = `(timezone('UTC', now())::date - ($1::int - 1))`;

    const [
      kpiAttempts,
      kpiUniqueUsers,
      kpiAvgAcc,
      kpiSignups,
      attemptsByDayRows,
      uniqueUsersByDayRows,
      signupsByDayRows,
      topTestsRows,
      bucketRow,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c FROM test_attempts WHERE ${attemptDay} >= ${windowStart}`,
        [rangeDays],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT user_id)::int AS c FROM test_attempts WHERE ${attemptDay} >= ${windowStart}`,
        [rangeDays],
      ),
      pool.query(
        `SELECT ROUND(AVG(100.0 * correct / NULLIF(total, 0)))::int AS a
         FROM test_attempts WHERE total > 0 AND ${attemptDay} >= ${windowStart}`,
        [rangeDays],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE ${userCreatedDay} >= ${windowStart}`,
        [rangeDays],
      ),
      pool.query(
        `SELECT ${attemptDay} AS d, COUNT(*)::int AS c
         FROM test_attempts WHERE ${attemptDay} >= ${windowStart}
         GROUP BY 1 ORDER BY 1`,
        [rangeDays],
      ),
      pool.query(
        `SELECT ${attemptDay} AS d, COUNT(DISTINCT user_id)::int AS c
         FROM test_attempts WHERE ${attemptDay} >= ${windowStart}
         GROUP BY 1 ORDER BY 1`,
        [rangeDays],
      ),
      pool.query(
        `SELECT ${userCreatedDay} AS d, COUNT(*)::int AS c
         FROM users WHERE ${userCreatedDay} >= ${windowStart}
         GROUP BY 1 ORDER BY 1`,
        [rangeDays],
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(trim(COALESCE(t.title, ta.test_name)), ''), 'Unknown') AS title,
                COUNT(*)::int AS attempts_count,
                ROUND(AVG(CASE WHEN ta.total > 0 THEN 100.0 * ta.correct / ta.total END), 1)::float AS avg_accuracy
         FROM test_attempts ta
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
         WHERE ${attemptDay} >= ${windowStart}
         GROUP BY 1
         ORDER BY attempts_count DESC
         LIMIT 8`,
        [rangeDays],
      ),
      pool.query(
        `SELECT
           SUM(CASE
             WHEN total > 0 AND (100.0 * correct / NULLIF(total, 0)) <= 20 THEN 1 ELSE 0
           END)::int AS b1,
           SUM(CASE
             WHEN total > 0 AND (100.0 * correct / NULLIF(total, 0)) > 20
               AND (100.0 * correct / NULLIF(total, 0)) <= 40 THEN 1 ELSE 0
           END)::int AS b2,
           SUM(CASE
             WHEN total > 0 AND (100.0 * correct / NULLIF(total, 0)) > 40
               AND (100.0 * correct / NULLIF(total, 0)) <= 60 THEN 1 ELSE 0
           END)::int AS b3,
           SUM(CASE
             WHEN total > 0 AND (100.0 * correct / NULLIF(total, 0)) > 60
               AND (100.0 * correct / NULLIF(total, 0)) <= 80 THEN 1 ELSE 0
           END)::int AS b4,
           SUM(CASE
             WHEN total > 0 AND (100.0 * correct / NULLIF(total, 0)) > 80 THEN 1 ELSE 0
           END)::int AS b5
         FROM test_attempts
         WHERE ${attemptDay} >= ${windowStart}`,
        [rangeDays],
      ),
    ]);

    const dayKey = (row) => {
      if (row.d instanceof Date) return row.d.toISOString().slice(0, 10);
      return String(row.d).replace(/T.*/, '').slice(0, 10);
    };
    const byDayAttempts = new Map();
    for (const row of attemptsByDayRows.rows || []) {
      byDayAttempts.set(dayKey(row), Number(row.c || 0));
    }
    const byDayUnique = new Map();
    for (const row of uniqueUsersByDayRows.rows || []) {
      byDayUnique.set(dayKey(row), Number(row.c || 0));
    }
    const byDaySignups = new Map();
    for (const row of signupsByDayRows.rows || []) {
      byDaySignups.set(dayKey(row), Number(row.c || 0));
    }

    const labels = [];
    const attemptsPerDay = [];
    const uniqueUsersPerDay = [];
    const signupsPerDay = [];
    for (let i = rangeDays - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (rangeDays <= 14) {
        labels.push(d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }));
      } else {
        labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }));
      }
      attemptsPerDay.push(byDayAttempts.get(key) || 0);
      uniqueUsersPerDay.push(byDayUnique.get(key) || 0);
      signupsPerDay.push(byDaySignups.get(key) || 0);
    }

    const br = bucketRow.rows[0] || {};
    const scoreBuckets = [
      { label: '0–20%', count: Number(br.b1 || 0) },
      { label: '21–40%', count: Number(br.b2 || 0) },
      { label: '41–60%', count: Number(br.b3 || 0) },
      { label: '61–80%', count: Number(br.b4 || 0) },
      { label: '81–100%', count: Number(br.b5 || 0) },
    ];

    const topTests = (topTestsRows.rows || []).map((r) => ({
      title: String(r.title || '').trim().slice(0, 120),
      attemptsCount: Number(r.attempts_count || 0),
      avgAccuracy: r.avg_accuracy == null ? null : Number(r.avg_accuracy),
    }));

    const avgA = kpiAvgAcc.rows[0]?.a;
    const avgAccuracyPct = avgA == null || Number.isNaN(Number(avgA)) ? null : Number(avgA);

    return res.json({
      rangeDays,
      kpis: {
        attemptsInRange: Number(kpiAttempts.rows[0]?.c || 0),
        uniqueUsersInRange: Number(kpiUniqueUsers.rows[0]?.c || 0),
        avgAccuracyPct,
        signupsInRange: Number(kpiSignups.rows[0]?.c || 0),
      },
      labels,
      attemptsPerDay,
      uniqueUsersPerDay,
      signupsPerDay,
      topTests,
      scoreBuckets,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.patch('/users/:id/admin', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  let isAdmin = Boolean((req.body || {}).isAdmin);
  const makeSuperAdmin = (req.body || {}).isSuperAdmin;
  const hasSuperAdminUpdate = makeSuperAdmin !== undefined;
  let isSuperAdmin = hasSuperAdminUpdate ? Boolean(makeSuperAdmin) : undefined;
  // Super-admin requires admin; removing admin must clear super-admin (even if client sent stale flags).
  if (hasSuperAdminUpdate) {
    if (!isAdmin) {
      isSuperAdmin = false;
    } else if (isSuperAdmin) {
      isAdmin = true;
    }
  } else if (!isAdmin) {
    isSuperAdmin = false;
  }
  if (String(req.userId) === String(id) && !isAdmin) {
    return res.status(400).json({ error: 'You cannot remove your own admin access' });
  }
  if (String(req.userId) === String(id) && hasSuperAdminUpdate && !isSuperAdmin) {
    return res.status(400).json({ error: 'You cannot remove your own super admin access' });
  }
  try {
    const existing = await pool.query(
      `SELECT lower(trim(email::text)) AS email_key, is_admin, is_super_admin FROM users WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    const emailKey = String(existing.rows[0].email_key || '').trim().toLowerCase();
    if (PROTECTED_SUPER_ADMIN_EMAILS.has(emailKey)) {
      const nextIsAdmin = isAdmin;
      const nextIsSuper = hasSuperAdminUpdate ? Boolean(makeSuperAdmin) : Boolean(existing.rows[0].is_super_admin);
      if (!nextIsAdmin || !nextIsSuper) {
        return res.status(403).json({
          error: 'This account is a protected super admin and cannot lose admin privileges.',
        });
      }
    }
    const sql = hasSuperAdminUpdate
      ? `UPDATE users SET is_admin = $1, is_super_admin = $2 WHERE id = $3::uuid
         RETURNING id, email, display_name, phone, is_admin, is_super_admin, is_banned, ban_reason, banned_at, created_at`
      : `UPDATE users SET is_admin = $1 WHERE id = $2::uuid
         RETURNING id, email, display_name, phone, is_admin, is_super_admin, is_banned, ban_reason, banned_at, created_at`;
    const params = hasSuperAdminUpdate ? [isAdmin, isSuperAdmin, id] : [isAdmin, id];
    const { rows } = await pool.query(sql, params);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, 'user_role_updated', 'user', id, {
      isAdmin: rows[0].is_admin,
      isSuperAdmin: rows[0].is_super_admin,
    });
    const wasAdmin = Boolean(existing.rows[0].is_admin);
    const wasSuper = Boolean(existing.rows[0].is_super_admin);
    const nowAdmin = Boolean(rows[0].is_admin);
    const nowSuper = Boolean(rows[0].is_super_admin);
    if (!nowAdmin) {
      await clearAdminPermissions(id);
    }
    const grantEmail = String(rows[0].email || '').trim();
    if (grantEmail && isMailConfigured()) {
      if (nowAdmin && !wasAdmin) {
        const variant = nowSuper ? 'admin_and_super' : 'admin_only';
        sendAdminRoleGrantedEmail({
          to: grantEmail,
          displayName: rows[0].display_name,
          variant,
        }).catch((mailErr) =>
          console.error('admin_role_granted_email_failed', id, mailErr && (mailErr.message || mailErr)),
        );
      } else if (nowAdmin && wasAdmin && hasSuperAdminUpdate && nowSuper && !wasSuper) {
        sendAdminRoleGrantedEmail({
          to: grantEmail,
          displayName: rows[0].display_name,
          variant: 'super_only',
        }).catch((mailErr) =>
          console.error('admin_role_granted_email_failed', id, mailErr && (mailErr.message || mailErr)),
        );
      }
    }
    return res.json({ item: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update admin role' });
  }
});

router.patch('/users/:id/ban', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  if (String(req.userId) === String(id)) {
    return res.status(400).json({ error: 'You cannot ban your own account' });
  }
  const isBanned = Boolean((req.body || {}).isBanned);
  const banReason = String((req.body || {}).banReason || '').trim().slice(0, 200);
  if (isBanned && !banReason) {
    return res.status(400).json({ error: 'banReason is required when banning a user' });
  }
  try {
    const victim = await pool.query(
      `SELECT lower(trim(email::text)) AS email_key FROM users WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!victim.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    const emailKey = String(victim.rows[0].email_key || '').trim().toLowerCase();
    if (isBanned && isProtectedSuperAdminDbEmail(emailKey)) {
      return res.status(403).json({ error: 'This account cannot be banned.' });
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET is_banned = $1,
           ban_reason = CASE WHEN $1 THEN $2 ELSE '' END,
           banned_at = CASE WHEN $1 THEN now() ELSE NULL END,
           updated_at = now()
       WHERE id = $3::uuid
       RETURNING id, email, display_name, phone, is_admin, is_super_admin, is_banned, ban_reason, banned_at, created_at`,
      [isBanned, banReason, id],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (isBanned) {
      await pool.query(
        `UPDATE user_refresh_sessions SET revoked_at = now()
         WHERE user_id = $1::uuid AND revoked_at IS NULL AND expires_at > now()`,
        [id],
      );
    }
    await logAdminAction(req, isBanned ? 'user_banned' : 'user_unbanned', 'user', id, {
      banReason: isBanned ? banReason : '',
    });
    return res.json({ item: user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update ban status' });
  }
});
router.post('/users/:id/revoke-sessions', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  if (String(req.userId) === String(id)) {
    return res.status(400).json({ error: 'You cannot revoke your own active sessions from here' });
  }
  try {
    const exists = await pool.query(
      `SELECT id, lower(trim(email::text)) AS e FROM users WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!exists.rows[0]) return res.status(404).json({ error: 'User not found' });
    if (isProtectedSuperAdminDbEmail(exists.rows[0].e)) {
      return res.status(403).json({ error: 'Sessions for this protected super admin account cannot be revoked from here.' });
    }
    const result = await pool.query(
      `UPDATE user_refresh_sessions
       SET revoked_at = now()
       WHERE user_id = $1::uuid AND revoked_at IS NULL AND expires_at > now()`,
      [id],
    );
    await logAdminAction(req, 'user_sessions_revoked', 'user', id, { revokedSessions: result.rowCount || 0 });
    return res.json({ ok: true, revokedSessions: result.rowCount || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  if (String(req.userId) === String(id)) {
    return res.status(400).json({ error: 'You cannot delete your own account from admin panel' });
  }
  try {
    const victim = await pool.query(
      `SELECT lower(trim(email::text)) AS email_key FROM users WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!victim.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (isProtectedSuperAdminDbEmail(victim.rows[0].email_key)) {
      return res.status(403).json({ error: 'This protected super admin account cannot be deleted.' });
    }

    const del = await pool.query(`DELETE FROM users WHERE id = $1::uuid`, [id]);
    if (!del.rowCount) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, 'user_deleted', 'user', id, {});
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/publish-scheduling', async (_req, res) => {
  try {
    const data = await getJsonSetting('publishScheduling', { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];
    const nowMs = Date.now();
    const testIds = [
      ...new Set(
        items
          .filter((x) => String(x?.entityType || '').toLowerCase() === 'test')
          .map((x) => String(x?.entityId || '').trim())
          .filter(Boolean),
      ),
    ];
    const entityLabels = {};
    if (testIds.length) {
      const titlesRes = await pool.query(
        `SELECT id::text AS id, title FROM tests WHERE id = ANY($1::uuid[])`,
        [testIds],
      );
      for (const row of titlesRes.rows || []) {
        entityLabels[String(row.id)] = String(row.title || '');
      }
    }
    const articleIds = [
      ...new Set(
        items
          .filter((x) => String(x?.entityType || '').toLowerCase() === 'article')
          .map((x) => String(x?.entityId || '').trim())
          .filter(Boolean),
      ),
    ];
    if (articleIds.length) {
      try {
        const headlinesRes = await pool.query(
          `SELECT id::text AS id, headline FROM news_articles WHERE id = ANY($1::uuid[])`,
          [articleIds],
        );
        for (const row of headlinesRes.rows || []) {
          entityLabels[String(row.id)] = String(row.headline || '');
        }
      } catch (articleErr) {
        if (!articleErr || articleErr.code !== '42P01') {
          console.warn('publish_scheduling_article_labels', articleErr);
        }
      }
    }
    const { enrichedItems, diagnostics } = buildPublishSchedulingDiagnostics(items, nowMs, entityLabels);
    return res.json({ items: enrichedItems, diagnostics });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load publish scheduling' });
  }
});

router.post('/publish-scheduling', async (req, res) => {
  const body = req.body || {};
  const entityType = String(body.entityType || '').trim().toLowerCase();
  const entityId = String(body.entityId || '').trim();
  const scheduleAt = String(body.scheduleAt || '').trim();
  const notifyOnPublish = body.notifyOnPublish !== false;
  if (!['test', 'article'].includes(entityType) || !isUuid(entityId) || !scheduleAt) {
    return res.status(400).json({ error: 'entityType, entityId and scheduleAt are required' });
  }
  const scheduleMs = Date.parse(scheduleAt);
  if (!Number.isFinite(scheduleMs)) {
    return res.status(400).json({ error: 'scheduleAt must be a valid date/time (e.g. ISO 8601 from the date picker)' });
  }
  try {
    const data = await getJsonSetting('publishScheduling', { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];
    const item = {
      id: `publish-${Date.now()}`,
      entityType,
      entityId,
      scheduleAt,
      notifyOnPublish,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      processedAt: '',
    };
    await savePublishSchedulingItems([item, ...items], req.userId);
    return res.status(201).json({ item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create publish schedule' });
  }
});

router.patch('/publish-scheduling/:id', async (req, res) => {
  const { id } = req.params;
  const status = String((req.body || {}).status || '').trim().toLowerCase();
  if (!['scheduled', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'status must be scheduled or cancelled' });
  }
  try {
    const data = await getJsonSetting('publishScheduling', { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];
    const next = items.map((x) => (String(x.id) === String(id) ? { ...x, status } : x));
    await savePublishSchedulingItems(next, req.userId);
    return res.json({ items: next });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update publish schedule' });
  }
});

router.post('/scheduling-queues/cleanup', async (req, res) => {
  const apply = (req.body || {}).apply === true;
  try {
    const result = await runSchedulingQueueCleanup({ apply, userId: req.userId });
    if (apply) {
      await logAdminAction(req, 'scheduling_queues_cleanup', 'app_settings', null, {
        summary: result.summary,
      });
    }
    return res.json({
      ok: true,
      applied: result.applied,
      summary: result.summary,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to clean scheduling queues' });
  }
});

router.get('/notifications/campaigns/latest/:pushItemId', async (req, res) => {
  try {
    const pushItemId = String(req.params.pushItemId || '').trim().slice(0, 60);
    if (!pushItemId) return res.status(400).json({ error: 'pushItemId is required' });
    const row = await getLatestCampaignForPushItem(pushItemId);
    if (!row) return res.json({ ok: true, campaign: null });
    const summary = await getCampaignSummary(row.id);
    return res.json({ ok: true, campaign: summary });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load campaign stats' });
  }
});

router.get('/notifications/campaigns/:campaignId/stats', async (req, res) => {
  try {
    const campaignId = String(req.params.campaignId || '').trim();
    const summary = await getCampaignSummary(campaignId);
    if (!summary) return res.status(404).json({ error: 'Campaign not found' });
    return res.json({ ok: true, campaign: summary });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load campaign stats' });
  }
});

router.get('/notifications/campaigns/:campaignId/events', async (req, res) => {
  try {
    const campaignId = String(req.params.campaignId || '').trim();
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const summary = await getCampaignSummary(campaignId);
    if (!summary) return res.status(404).json({ error: 'Campaign not found' });
    const page = await listCampaignEvents(campaignId, { status, q, limit, offset });
    return res.json({ ok: true, ...page });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load campaign events' });
  }
});

router.post('/notifications/send', async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim().slice(0, 120);
  const message = String(body.message || '').trim().slice(0, 500);
  const target = String(body.target || 'all').trim().toLowerCase();
  const deepLink = String(body.deepLink || '').trim().slice(0, 120);
  const pushItemId = String(body.pushItemId || '').trim().slice(0, 60);
  if (!title || !message) return res.status(400).json({ error: 'title and message are required' });
  if (!['all', 'new_users', 'active_users'].includes(target)) {
    return res.status(400).json({ error: 'target must be all, new_users or active_users' });
  }
  try {
    const campaignId = await createCampaign({
      pushItemId,
      title,
      message,
      target,
      deepLink,
      sentByUserId: req.userId,
    });
    const campaignIdStr = campaignId ? String(campaignId) : '';
    const dedupeKey = buildCampaignDedupeKey(campaignIdStr);
    const pushResult = await sendPushToAudience({
      title,
      message,
      target,
      deepLink,
      dedupeKey,
      campaignId: campaignIdStr,
      collectDeliveries: Boolean(campaignId),
    });
    const sent = Number(pushResult.sent || 0);
    const failed = Number(pushResult.failed || 0);
    const deactivated = Number(pushResult.deactivated || 0);
    const skipped = Number(pushResult.skipped || 0);
    const rows = pushResult.deliveries || [];
    const deliveryEvents = [];
    const now = new Date();
    if (campaignId) {
      for (const entry of rows) {
        const currentToken = String(entry.token || '').trim();
        const userId = entry.userId || null;
        const platform = String(entry.platform || 'android').slice(0, 20);
        const deviceModel = String(entry.deviceModel || '').slice(0, 120);
        if (!currentToken) {
          deliveryEvents.push({
            userId,
            deviceTokenHash: hashDeviceToken(`empty-${userId}-${deliveryEvents.length}`),
            platform,
            deviceModel,
            deliveryStatus: 'failed',
            failCode: 'EMPTY_TOKEN',
            failDetail: '',
            deliveredAt: null,
          });
          continue;
        }
        if (entry.ok) {
          deliveryEvents.push({
            userId,
            deviceTokenHash: hashDeviceToken(currentToken),
            platform,
            deviceModel,
            deliveryStatus: 'delivered',
            failCode: '',
            failDetail: '',
            deliveredAt: now,
          });
        } else {
          if (entry.code && entry.code !== 'EXCEPTION') {
            console.error(
              'fcm_push_token_failed',
              entry.code || 'unknown',
              (entry.detail && String(entry.detail).slice(0, 400)) || '',
            );
          }
          deliveryEvents.push({
            userId,
            deviceTokenHash: hashDeviceToken(currentToken),
            platform,
            deviceModel,
            deliveryStatus: 'failed',
            failCode: String(entry.code || 'unknown').slice(0, 40),
            failDetail: String(entry.detail || '').slice(0, 500),
            deliveredAt: null,
          });
        }
      }
      await insertDeliveryEventsBatch(campaignId, deliveryEvents);
      await finalizeCampaignCounts(campaignId, {
        total: Number(pushResult.total || 0),
        delivered: sent,
        failed,
        deactivated,
      });
    }
    // Keep app bell/inbox feed in sync only when FCM actually delivered to at least one device.
    // Do not write inbox entries when sent=0 (no tokens / all failed) — that made app show
    // notifications the phone never received.
    if (sent > 0) {
      await appendPushNotificationItem(req.userId, { title, message, target, deepLink });
    }
    await logAdminAction(req, 'push_notification_manual_send', 'notification', null, {
      target,
      sent,
      failed,
      deactivated,
      skipped,
      total: Number(pushResult.total || 0),
      campaignId: campaignIdStr,
    });
    return res.json({
      ok: true,
      total: Number(pushResult.total || 0),
      eligible: Number(pushResult.eligible || pushResult.total || 0),
      sent,
      failed,
      deactivated,
      skipped,
      campaignId: campaignIdStr || null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to send push notification' });
  }
});

module.exports = router;








