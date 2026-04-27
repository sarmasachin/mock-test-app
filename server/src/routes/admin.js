'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { publishAppNotification } = require('../notificationDispatch');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const BANNERS_DIR = path.join(UPLOADS_DIR, 'banners');
const ALLOWED_BANNER_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function ensureBannerDir() {
  if (!fs.existsSync(BANNERS_DIR)) {
    fs.mkdirSync(BANNERS_DIR, { recursive: true });
  }
}

function toPublicBannerUrl(req, fileName) {
  const explicitBase = String(process.env.PUBLIC_BASE_URL || '').trim();
  const base = explicitBase || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/banners/${fileName}`;
}

const SETTINGS_KEYS = [
  'maintenanceMode',
  'maintenanceMessage',
  'registrationOpen',
  'profileMenuItems',
  'homeContent',
  'pollSettings',
  'pushNotificationSettings',
  'dailyQuizSettings',
  'submitApplicationContent',
  'instructionContent',
  'examCategories',
  'examCategoryIconOptions',
  'notificationScheduling',
  'publishScheduling',
  'feedbackInbox',
  'reportIssueInbox',
  'helpSupportContent',
  'achievementContent',
  'privacyPolicyContent',
  'termsOfUseContent',
  'testAdvancedConfigs',
];

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
  const startSeriesLockSeconds = Math.max(0, Math.min(86_400, Number(safe.startSeriesLockSeconds || 20)));
  const startSeriesActiveWindowMinutes = Math.max(1, Math.min(10_080, Number(safe.startSeriesActiveWindowMinutes || 30)));
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
      startSeriesLockSeconds,
      startSeriesActiveWindowMinutes,
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
        scheduleAt: String(x.scheduleAt || '').trim().slice(0, 40),
        repeatType: allowedRepeat.includes(repeatType) ? repeatType : 'none',
        dayOfWeek,
        dayOfMonth,
        repeatUntil: String(x.repeatUntil || '').trim().slice(0, 40),
        status: allowedStatus.includes(status) ? status : 'scheduled',
        createdAt: String(x.createdAt || new Date().toISOString()).slice(0, 40),
        sentAt: String(x.sentAt || '').trim().slice(0, 40),
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
        user: String(x.user || '').trim().slice(0, 80),
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
  }
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
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, $3::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [settingKey, JSON.stringify(value), userId],
  );
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
  const current = await getJsonSetting('notificationScheduling', { items: [] });
  const items = Array.isArray(current.items) ? current.items : [];
  const next = {
    ...current,
    items: [
      {
        id: `schedule-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        title: String(payload.title || '').slice(0, 100),
        message: String(payload.message || '').slice(0, 300),
        target: String(payload.target || 'all'),
        segmentKey: String(payload.segmentKey || ''),
        scheduleAt: String(payload.scheduleAt || new Date().toISOString()),
        repeatType: 'none',
        dayOfWeek: 1,
        dayOfMonth: 1,
        repeatUntil: '',
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        sentAt: '',
      },
      ...items,
    ],
  };
  await setJsonSetting('notificationScheduling', next, userId);
  await publishAppNotification(
    {
      title: payload.title,
      message: payload.message,
      target: payload.target || 'all',
      scheduleAt: payload.scheduleAt,
    },
    userId || null,
  ).catch((e) => {
    console.error('publish_app_notification_error', e);
  });
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

function shuffleQuestionOptions(row) {
  const options = [
    { text: row.choice_a, oldIndex: 0 },
    { text: row.choice_b, oldIndex: 1 },
    { text: row.choice_c, oldIndex: 2 },
    { text: row.choice_d, oldIndex: 3 },
  ];
  const shuffled = shuffleArray(options);
  const newCorrectIndex = shuffled.findIndex((x) => x.oldIndex === Number(row.correct_index));
  return {
    stem: row.stem,
    choice_a: shuffled[0]?.text || '',
    choice_b: shuffled[1]?.text || '',
    choice_c: shuffled[2]?.text || '',
    choice_d: shuffled[3]?.text || '',
    correct_index: Math.max(0, newCorrectIndex),
    explanation: row.explanation || '',
  };
}

async function regenerateTestFromSubcategoryPool(testId) {
  const baseRes = await pool.query(
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
  const poolRes = await pool.query(
    `SELECT q.id, q.stem, q.choice_a, q.choice_b, q.choice_c, q.choice_d, q.correct_index, q.explanation
     FROM questions q
     INNER JOIN tests t ON t.id = q.test_id
     WHERE t.subcategory = $1
     ORDER BY q.id DESC`,
    [String(base.subcategory)],
  );
  const poolRows = poolRes.rows || [];
  if (!poolRows.length) return { regenerated: false, reason: 'empty_pool' };
  const selected = shuffleArray(poolRows).slice(0, Math.min(needed, poolRows.length));
  if (!selected.length) return { regenerated: false, reason: 'no_selection' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM questions WHERE test_id = $1::uuid`, [testId]);
    let position = 1;
    for (const row of selected) {
      const randomized = shuffleQuestionOptions(row);
      await client.query(
        `INSERT INTO questions (
           test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
        ],
      );
      position += 1;
    }
    await client.query('COMMIT');
    return { regenerated: true, count: selected.length };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
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
    feedbackInbox: (() => {
      try {
        const parsed = JSON.parse(String(map.feedbackInbox || '{}'));
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

function normalizeQuestionPayload(body) {
  const payload = body || {};
  const position = Number(payload.position);
  const stem = String(payload.stem || '').trim();
  const choiceA = String(payload.choiceA || '').trim();
  const choiceB = String(payload.choiceB || '').trim();
  const choiceC = String(payload.choiceC || '').trim();
  const choiceD = String(payload.choiceD || '').trim();
  const correctIndex = Number(payload.correctIndex);
  const explanation = String(payload.explanation || '').trim();
  const isPublished = payload.isPublished !== false;

  if (!Number.isInteger(position) || position <= 0) {
    return { error: 'position must be a positive integer' };
  }
  if (!stem) return { error: 'stem is required' };
  if (!choiceA || !choiceB || !choiceC || !choiceD) {
    return { error: 'All four choices are required' };
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return { error: 'correctIndex must be 0, 1, 2, or 3' };
  }
  return {
    value: { position, stem, choiceA, choiceB, choiceC, choiceD, correctIndex, explanation, isPublished },
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
    };
  });
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
    },
  };
}

function normalizeTestPayload(body) {
  const payload = body || {};
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
  const badgeEnabled = payload.badgeEnabled === true;
  const badgeText = String(payload.badgeText || 'Live').trim().slice(0, 40) || 'Live';
  const examDate = String(payload.examDate || '').trim();
  const validUntil = String(payload.validUntil || '').trim();
  const answerKeyReleaseAt = String(payload.answerKeyReleaseAt || '').trim();
  const resultReleaseAt = String(payload.resultReleaseAt || '').trim();
  const dynamicDateEnabled = payload.dynamicDateEnabled === true;
  const dateCycleDays = Number(payload.dateCycleDays || 0);

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
  if (enrolledCount > capacityTotal) {
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

router.get('/summary', async (_req, res) => {
  try {
    const [users, attempts, tests, articles] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS value FROM users`),
      pool.query(`SELECT COUNT(*)::int AS value FROM test_attempts`),
      pool.query(`SELECT COUNT(*)::int AS value FROM tests WHERE is_published = true`),
      pool.query(`SELECT COUNT(*)::int AS value FROM news_articles WHERE is_published = true`),
    ]);

    return res.json({
      users: users.rows[0].value,
      attempts: attempts.rows[0].value,
      tests: tests.rows[0].value,
      articles: articles.rows[0].value,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load admin summary' });
  }
});

router.get('/settings', async (_req, res) => {
  try {
    const settings = await getSettingsMap();
    return res.json({ settings });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/uploads/banner', async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  try {
    const body = req.body || {};
    const fileNameRaw = String(body.fileName || '').trim();
    const contentType = String(body.contentType || '').trim().toLowerCase();
    const dataBase64 = String(body.dataBase64 || '').trim();
    if (!fileNameRaw || !contentType || !dataBase64) {
      return res.status(400).json({ error: 'fileName, contentType and dataBase64 are required' });
    }
    const ext = ALLOWED_BANNER_TYPES[contentType];
    if (!ext) {
      return res.status(400).json({ error: 'Only jpg, png or webp images are allowed' });
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
    const fileName = `${Date.now()}-${safeBase}.${ext}`;
    ensureBannerDir();
    fs.writeFileSync(path.join(BANNERS_DIR, fileName), fileBuffer);
    const imageUrl = toPublicBannerUrl(req, fileName);
    return res.status(201).json({ imageUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to upload banner image' });
  }
});

router.patch('/settings', async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  const body = req.body || {};
  const maintenanceMode = body.maintenanceMode === undefined ? null : Boolean(body.maintenanceMode);
  const maintenanceMessage =
    body.maintenanceMessage === undefined ? null : String(body.maintenanceMessage || '').trim().slice(0, 240);
  const registrationOpen = body.registrationOpen === undefined ? null : Boolean(body.registrationOpen);
  const normalizedProfileItems =
    body.profileMenuItems === undefined ? null : normalizeProfileMenuItems(body.profileMenuItems);
  if (normalizedProfileItems && normalizedProfileItems.error) {
    return res.status(400).json({ error: normalizedProfileItems.error });
  }
  const normalizedHomeContent =
    body.homeContent === undefined ? null : normalizeHomeContent(body.homeContent);
  if (normalizedHomeContent && normalizedHomeContent.error) {
    return res.status(400).json({ error: normalizedHomeContent.error });
  }
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
  const normalizedExamCategoryIconOptions =
    body.examCategoryIconOptions === undefined ? null : normalizeExamCategoryIconOptions(body.examCategoryIconOptions);
  const normalizedNotificationScheduling =
    body.notificationScheduling === undefined ? null : normalizeNotificationScheduling(body.notificationScheduling);
  const normalizedFeedbackInbox =
    body.feedbackInbox === undefined ? null : normalizeSupportInbox(body.feedbackInbox);
  const normalizedReportIssueInbox =
    body.reportIssueInbox === undefined ? null : normalizeSupportInbox(body.reportIssueInbox);
  const normalizedHelpSupportContent =
    body.helpSupportContent === undefined ? null : normalizeSimpleContent(body.helpSupportContent, 'Help and Support');
  const normalizedAchievementContent =
    body.achievementContent === undefined ? null : normalizeSimpleContent(body.achievementContent, 'Achievement');
  const normalizedPrivacyPolicyContent =
    body.privacyPolicyContent === undefined ? null : normalizeSimpleContent(body.privacyPolicyContent, 'Privacy Policy');
  const normalizedTermsOfUseContent =
    body.termsOfUseContent === undefined ? null : normalizeSimpleContent(body.termsOfUseContent, 'Terms of Use');
  if (
    maintenanceMode === null &&
    maintenanceMessage === null &&
    registrationOpen === null &&
    normalizedProfileItems === null &&
    normalizedHomeContent === null &&
    normalizedPollSettings === null &&
    normalizedPushNotificationSettings === null &&
    normalizedDailyQuizSettings === null &&
    normalizedSubmitApplicationContent === null &&
    normalizedInstructionContent === null &&
    normalizedExamCategories === null &&
    normalizedExamCategoryIconOptions === null &&
    normalizedNotificationScheduling === null &&
    normalizedFeedbackInbox === null &&
    normalizedReportIssueInbox === null &&
    normalizedHelpSupportContent === null &&
    normalizedAchievementContent === null &&
    normalizedPrivacyPolicyContent === null &&
    normalizedTermsOfUseContent === null
  ) {
    return res.status(400).json({ error: 'No settings provided' });
  }
  try {
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
      if (normalizedExamCategories !== null) {
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('examCategories', $1, $2::uuid)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [JSON.stringify(normalizedExamCategories.value), req.userId],
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
          [JSON.stringify(normalizedNotificationScheduling.value), req.userId],
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
      profileMenuItemsUpdated: normalizedProfileItems !== null,
      homeContentUpdated: normalizedHomeContent !== null,
      pollSettingsUpdated: normalizedPollSettings !== null,
      pushNotificationSettingsUpdated: normalizedPushNotificationSettings !== null,
      dailyQuizSettingsUpdated: normalizedDailyQuizSettings !== null,
      submitApplicationContentUpdated: normalizedSubmitApplicationContent !== null,
      instructionContentUpdated: normalizedInstructionContent !== null,
      examCategoriesUpdated: normalizedExamCategories !== null,
      examCategoryIconOptionsUpdated: normalizedExamCategoryIconOptions !== null,
      notificationSchedulingUpdated: normalizedNotificationScheduling !== null,
      feedbackInboxUpdated: normalizedFeedbackInbox !== null,
      reportIssueInboxUpdated: normalizedReportIssueInbox !== null,
      helpSupportContentUpdated: normalizedHelpSupportContent !== null,
      achievementContentUpdated: normalizedAchievementContent !== null,
      privacyPolicyContentUpdated: normalizedPrivacyPolicyContent !== null,
      termsOfUseContentUpdated: normalizedTermsOfUseContent !== null,
    });
    if (normalizedDailyQuizSettings !== null) {
      await enqueueNotification(req.userId, {
        title: 'Daily Quiz Rescheduled',
        message: 'Daily quiz schedule has been updated by admin.',
        target: 'all',
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
          scheduleAt: new Date().toISOString(),
        });
      }
    }
    if (normalizedExamCategories !== null) {
      await enqueueNotification(req.userId, {
        title: 'Exam Alerts Updated',
        message: 'New exam alert categories are available.',
        target: 'all',
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
  const limit = Math.min(300, Math.max(20, Number(req.query.limit || 120)));
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.action_type, l.target_type, l.target_id, l.details_json, l.request_ip, l.user_agent, l.created_at,
              u.email AS actor_email, u.display_name AS actor_name
       FROM admin_audit_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load audit logs' });
  }
});
router.get('/tests', async (_req, res) => {
  try {
    const advancedMap = await getJsonSetting('testAdvancedConfigs', {});
    const { rows } = await pool.query(
      `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind, is_published,
              exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
              language_mode, exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until,
              answer_key_release_at, result_release_at,
              dynamic_date_enabled, date_cycle_days,
              COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish
       FROM tests
       ORDER BY created_at DESC`,
    );
    const mapped = rows.map((row) => ({
      ...row,
      advanced_config:
        advancedMap && typeof advancedMap === 'object' && advancedMap[row.id] && typeof advancedMap[row.id] === 'object'
          ? advancedMap[row.id]
          : null,
    }));
    return res.json({ items: mapped });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list tests' });
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
  try {
    const { rows } = await pool.query(
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
        data.isPublished,
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
    if (data.isPublished) {
      await regenerateTestFromSubcategoryPool(rows[0].id);
      await enqueueNotification(req.userId, {
        title: 'New Test Published',
        message: `${data.title} is now available.`,
        target: 'all',
        scheduleAt: new Date().toISOString(),
      });
    }
    const currentAdvancedMap = await getJsonSetting('testAdvancedConfigs', {});
    const nextAdvancedMap =
      currentAdvancedMap && typeof currentAdvancedMap === 'object' ? { ...currentAdvancedMap } : {};
    nextAdvancedMap[rows[0].id] = advancedConfig;
    await setJsonSetting('testAdvancedConfigs', nextAdvancedMap, req.userId);
    return res.status(201).json({ item: { ...rows[0], advanced_config: advancedConfig } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    console.error(e);
    return res.status(500).json({ error: 'Failed to create test' });
  }
});

router.patch('/tests/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid test id' });
  const parsed = normalizeTestPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const data = parsed.value;
  const advancedParsed = normalizeTestAdvancedConfig((req.body || {}).advancedConfig);
  if (advancedParsed.error) return res.status(400).json({ error: advancedParsed.error });
  const advancedConfig = advancedParsed.value;
  const body = req.body || {};
  const hasDynamicFluctuationValue = Object.prototype.hasOwnProperty.call(body, 'dynamicFluctuationOnPublish');
  try {
    const before = await pool.query(
      `SELECT id, title, is_published, COALESCE(dynamic_fluctuation_on_publish, true) AS dynamic_fluctuation_on_publish
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );
    const beforeRow = before.rows[0];
    if (!beforeRow) return res.status(404).json({ error: 'Test not found' });
    const dynamicFluctuationOnPublish = hasDynamicFluctuationValue
      ? data.dynamicFluctuationOnPublish
      : beforeRow.dynamic_fluctuation_on_publish !== false;
    const { rows } = await pool.query(
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
        data.isPublished,
        dynamicFluctuationOnPublish,
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
        id,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Test not found' });
    if (!beforeRow.is_published && rows[0].is_published) {
      await regenerateTestFromSubcategoryPool(rows[0].id);
      await enqueueNotification(req.userId, {
        title: 'Test Published',
        message: `${rows[0].title} is now live.`,
        target: 'all',
        scheduleAt: new Date().toISOString(),
      });
    }
    const currentAdvancedMap = await getJsonSetting('testAdvancedConfigs', {});
    const nextAdvancedMap =
      currentAdvancedMap && typeof currentAdvancedMap === 'object' ? { ...currentAdvancedMap } : {};
    nextAdvancedMap[id] = advancedConfig;
    await setJsonSetting('testAdvancedConfigs', nextAdvancedMap, req.userId);
    return res.json({ item: { ...rows[0], advanced_config: advancedConfig } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    console.error(e);
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
    if (currentAdvancedMap && typeof currentAdvancedMap === 'object' && currentAdvancedMap[id]) {
      const nextAdvancedMap = { ...currentAdvancedMap };
      delete nextAdvancedMap[id];
      await setJsonSetting('testAdvancedConfigs', nextAdvancedMap, req.userId);
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
      `SELECT id, test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published
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
  const parsed = normalizeQuestionPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const q = parsed.value;
  try {
    if (await hasDuplicateStemInTest(id, q.stem)) {
      return res.status(409).json({ error: 'Duplicate question detected for this test' });
    }
    const { rows } = await pool.query(
      `INSERT INTO questions (
         test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published`,
      [id, q.position, q.stem, q.choiceA, q.choiceB, q.choiceC, q.choiceD, q.correctIndex, q.explanation, q.isPublished],
    );
    return res.status(201).json({ item: rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Position already used in this test' });
    }
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
             test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
          ],
        );
        inserted += 1;
      }
      await client.query('COMMIT');
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
    if (await hasDuplicateStemInTest(id, q.stem, qid)) {
      return res.status(409).json({ error: 'Duplicate question detected for this test' });
    }
    const { rows } = await pool.query(
      `UPDATE questions
       SET position = $1, stem = $2, choice_a = $3, choice_b = $4, choice_c = $5, choice_d = $6, correct_index = $7, explanation = $8, is_published = $9
       WHERE id = $10 AND test_id = $11::uuid
       RETURNING id, test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published`,
      [q.position, q.stem, q.choiceA, q.choiceB, q.choiceC, q.choiceD, q.correctIndex, q.explanation, q.isPublished, qid, id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Question not found' });
    return res.json({ item: rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Position already used in this test' });
    }
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
    if (isPublished) {
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
    if (isPublished) {
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
    if (!normalized) {
      return res.status(400).json({ error: 'Question, four options, and valid correctIndex are required' });
    }
    const current = await getJsonSetting('dailyQuizItems', { items: [] });
    const items = Array.isArray(current.items) ? current.items : [];
    const next = { items: [normalized, ...items].slice(0, 500) };
    await setJsonSetting('dailyQuizItems', next, req.userId);
    if (normalized.isPublished) {
      await enqueueNotification(req.userId, {
        title: 'Daily Quiz Updated',
        message: 'Today\'s daily quiz is now available.',
        target: 'all',
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
    if (normalized.isPublished) {
      await enqueueNotification(req.userId, {
        title: 'Daily Quiz Updated',
        message: 'Daily quiz has been refreshed by admin.',
        target: 'all',
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

router.get('/articles', async (req, res) => {
  const kind = String(req.query.feedKind || '').trim().toLowerCase();
  const filters = [];
  const params = [];
  if (kind) {
    filters.push(`feed_kind = $1`);
    params.push(kind);
  }
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(
      `SELECT id, feed_kind, headline, summary, category, body, link_url, published_at, is_published
       FROM news_articles
       ${whereSql}
       ORDER BY published_at DESC
       LIMIT 300`,
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
  const feedKind = String(body.feedKind || '').trim().toLowerCase();
  const headline = String(body.headline || '').trim();
  if (!['news', 'job', 'exam'].includes(feedKind) || !headline) {
    return res.status(400).json({ error: 'feedKind and headline are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO news_articles (
         feed_kind, headline, summary, category, body, link_url, published_at, is_published
       ) VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
       RETURNING id, feed_kind, headline, summary, category, body, link_url, published_at, is_published`,
      [
        feedKind,
        headline,
        String(body.summary || ''),
        String(body.category || ''),
        String(body.body || ''),
        String(body.linkUrl || ''),
        body.isPublished !== false,
      ],
    );
    if (body.isPublished !== false) {
      await enqueueNotification(req.userId, {
        title: 'New Update',
        message: `${headline} has been published.`,
        target: 'all',
        scheduleAt: new Date().toISOString(),
      });
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
  const feedKind = String(body.feedKind || '').trim().toLowerCase();
  const headline = String(body.headline || '').trim();
  if (!['news', 'job', 'exam'].includes(feedKind) || !headline) {
    return res.status(400).json({ error: 'feedKind and headline are required' });
  }
  try {
    const before = await pool.query(`SELECT id, headline, is_published FROM news_articles WHERE id = $1::uuid LIMIT 1`, [id]);
    const beforeRow = before.rows[0];
    if (!beforeRow) return res.status(404).json({ error: 'Article not found' });
    const { rows } = await pool.query(
      `UPDATE news_articles
       SET feed_kind = $1, headline = $2, summary = $3, category = $4, body = $5, link_url = $6, is_published = $7
       WHERE id = $8::uuid
       RETURNING id, feed_kind, headline, summary, category, body, link_url, published_at, is_published`,
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
      await enqueueNotification(req.userId, {
        title: 'News Published',
        message: `${rows[0].headline} is now available.`,
        target: 'all',
        scheduleAt: new Date().toISOString(),
      });
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

router.get('/users', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [];
  let whereSql = '';
  if (q) {
    whereSql = `WHERE email ILIKE $1 OR display_name ILIKE $1 OR phone ILIKE $1`;
    params.push(`%${q}%`);
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, email, display_name, phone, is_admin, is_super_admin, is_banned, ban_reason, banned_at, created_at
       FROM users
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT 200`,
      params,
    );
    return res.json({ items: rows });
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
    whereSql = `WHERE (u.email ILIKE $1 OR u.display_name ILIKE $1 OR u.phone ILIKE $1)`;
    params.push(`%${q}%`);
  }
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.phone, u.is_banned, u.ban_reason, u.created_at,
              COUNT(ta.id)::int AS attempts_count,
              MAX(ta.completed_at) AS last_attempt_at
       FROM users u
       LEFT JOIN test_attempts ta ON ta.user_id = u.id
       ${whereSql}
       GROUP BY u.id, u.email, u.display_name, u.phone, u.is_banned, u.ban_reason, u.created_at
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

router.patch('/users/:id/admin', async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  const isAdmin = Boolean((req.body || {}).isAdmin);
  const makeSuperAdmin = (req.body || {}).isSuperAdmin;
  const hasSuperAdminUpdate = makeSuperAdmin !== undefined;
  const isSuperAdmin = hasSuperAdminUpdate ? Boolean(makeSuperAdmin) : undefined;
  if (String(req.userId) === String(id) && !isAdmin) {
    return res.status(400).json({ error: 'You cannot remove your own admin access' });
  }
  if (String(req.userId) === String(id) && hasSuperAdminUpdate && !isSuperAdmin) {
    return res.status(400).json({ error: 'You cannot remove your own super admin access' });
  }
  try {
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
    return res.json({ item: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update admin role' });
  }
});

router.patch('/users/:id/ban', async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
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
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  if (String(req.userId) === String(id)) {
    return res.status(400).json({ error: 'You cannot revoke your own active sessions from here' });
  }
  try {
    const exists = await pool.query(`SELECT id FROM users WHERE id = $1::uuid LIMIT 1`, [id]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'User not found' });
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
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid user id' });
  if (String(req.userId) === String(id)) {
    return res.status(400).json({ error: 'You cannot delete your own account from admin panel' });
  }
  try {
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
    return res.json({ items: Array.isArray(data.items) ? data.items : [] });
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
    await setJsonSetting('publishScheduling', { items: [item, ...items] }, req.userId);
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
    await setJsonSetting('publishScheduling', { items: next }, req.userId);
    return res.json({ items: next });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update publish schedule' });
  }
});

module.exports = router;








