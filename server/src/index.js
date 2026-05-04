'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { requireAuth } = require('./middleware/requireAuth');
const { requireAdmin } = require('./middleware/requireAdmin');
const authRouter = require('./routes/auth');
const meRouter = require('./routes/me');
const attemptsRouter = require('./routes/attempts');
const newsRouter = require('./routes/news');
const digestRouter = require('./routes/digest');
const testsCatalogRouter = require('./routes/tests');
const leaderboardRouter = require('./routes/leaderboard');
const homeRouter = require('./routes/home');
const adminRouter = require('./routes/admin');
const pollsRouter = require('./routes/polls');
const { pool } = require('./db');
const { clampMcqCorrectIndex } = require('./mcqShuffle');
const {
  isMailConfigured,
  sendCompleteProfileReminderEmail,
  sendResultUnlockedEmail,
  sendMockTestStartingSoonEmail,
  sendMissedTestFollowupEmail,
  sendStreakRiskAlertEmail,
  sendWeeklyPerformanceReportEmail,
  sendRankMilestoneEmail,
  sendBirthdayEmail,
  sendNewContentByInterestEmail,
  sendReEngagementEmail,
} = require('./mail');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('FATAL: set JWT_SECRET (min 16 chars) in .env');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: set DATABASE_URL in .env');
  process.exit(1);
}

const app = express();

/** When CORS_ALLOWED_ORIGINS is set (comma-separated), only those browser origins may call the API. */
function buildCorsMiddleware() {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw || !String(raw).trim()) {
    return cors();
  }
  const allowList = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowList.length) return cors();
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowList.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
  });
}

app.use(buildCorsMiddleware());
app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(async (req, res, next) => {
  const path = String(req.path || '');
  if (
    path === '/health' ||
    path.startsWith('/v1/admin') ||
    path.startsWith('/v1/auth/')
  ) {
    return next();
  }
  try {
    const { rows } = await pool.query(
      `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('maintenanceMode', 'maintenanceMessage')`,
    );
    const map = {};
    for (const row of rows) map[row.setting_key] = row.setting_value;
    const maintenanceMode = String(map.maintenanceMode || 'false').toLowerCase() === 'true';
    if (!maintenanceMode) return next();
    return res.status(503).json({
      error: String(map.maintenanceMessage || 'Service is temporarily under maintenance'),
      maintenanceMode: true,
    });
  } catch (e) {
    if (e.code === '42P01') return next();
    console.error(e);
    return res.status(500).json({ error: 'Service state check failed' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/v1/auth', authRouter);
app.use('/v1/me', requireAuth, meRouter);
app.use('/v1/attempts', requireAuth, attemptsRouter);
app.use('/v1/news', newsRouter);
app.use('/v1/digest', digestRouter);
app.use('/v1/tests', testsCatalogRouter);
app.use('/v1/leaderboard', leaderboardRouter);
app.use('/v1/home', homeRouter);
app.use('/v1/polls', requireAuth, pollsRouter);
app.use('/v1/admin', requireAuth, requireAdmin, adminRouter);

async function ensureOptionalColumns() {
  try {
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS dynamic_fluctuation_on_publish BOOLEAN NOT NULL DEFAULT true`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS answer_key_release_at TIMESTAMPTZ`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS result_release_at TIMESTAMPTZ`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS capacity_total INTEGER NOT NULL DEFAULT 0`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS enrolled_count INTEGER NOT NULL DEFAULT 0`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS badge_enabled BOOLEAN NOT NULL DEFAULT false`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS badge_text VARCHAR(40) NOT NULL DEFAULT 'Live'`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS last_cycle_started_at TIMESTAMPTZ`,
    );
    await pool.query(
      `UPDATE tests
       SET last_cycle_started_at = now()
       WHERE is_published = true AND last_cycle_started_at IS NULL`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS test_applications (
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (user_id, test_id)
       )`,
    );
    await pool.query(
      `ALTER TABLE test_attempts
       ADD COLUMN IF NOT EXISTS client_submission_id VARCHAR(120)`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_submission_unique
       ON test_attempts (user_id, test_catalog_id, client_submission_id)
       WHERE test_catalog_id IS NOT NULL AND client_submission_id IS NOT NULL`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_submission_unique_all
       ON test_attempts (user_id, test_catalog_id, client_submission_id)`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS test_waitlist (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
         status TEXT NOT NULL DEFAULT 'waiting',
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         promoted_at TIMESTAMPTZ NULL,
         CONSTRAINT test_waitlist_status_check CHECK (status IN ('waiting', 'promoted', 'cancelled'))
       )`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_test_waitlist_unique_waiting
       ON test_waitlist (user_id, test_id)
       WHERE status = 'waiting'`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_test_waitlist_test_status_created
       ON test_waitlist (test_id, status, created_at)`,
    );
    await pool.query(
      `ALTER TABLE questions
       ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true`,
    );
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS date_of_birth DATE`,
    );
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)`);
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub_nonempty
       ON users (google_sub)
       WHERE google_sub IS NOT NULL AND trim(google_sub) <> ''`,
    );
    await pool.query(
      `ALTER TABLE news_articles
       ADD COLUMN IF NOT EXISTS feature_image_url TEXT`,
    );
    await pool.query(
      `ALTER TABLE news_articles
       DROP CONSTRAINT IF EXISTS news_articles_feed_kind_check`,
    );
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('optional_columns_init_error', e);
  }
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
    return {
      stem: row.stem,
      choice_a: row.choice_a,
      choice_b: row.choice_b,
      choice_c: row.choice_c,
      choice_d: row.choice_d,
      correct_index: sourceOld,
      explanation: row.explanation || '',
    };
  }
  return {
    stem: row.stem,
    choice_a: shuffled[0]?.text || '',
    choice_b: shuffled[1]?.text || '',
    choice_c: shuffled[2]?.text || '',
    choice_d: shuffled[3]?.text || '',
    correct_index: newCorrectIndex,
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
  if (!base || base.dynamic_fluctuation_on_publish === false) return;
  if (!String(base.subcategory || '').trim()) return;
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
  if (!poolRows.length) return;
  const selected = shuffleArray(poolRows).slice(0, Math.min(needed, poolRows.length));
  if (!selected.length) return;
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
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function promoteWaitlistForTest(testId) {
  const id = String(testId || '').trim();
  if (!id) return { promotedCount: 0, waitingLeft: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const testRes = await client.query(
      `SELECT id, capacity_total, enrolled_count
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1
       FOR UPDATE`,
      [id],
    );
    const test = testRes.rows[0];
    if (!test) {
      await client.query('COMMIT');
      return { promotedCount: 0, waitingLeft: 0 };
    }
    const capacity = Math.max(0, Number(test.capacity_total || 0));
    const currentEnrolled = Math.max(0, Number(test.enrolled_count || 0));
    let availableSeats = capacity > 0 ? Math.max(0, capacity - currentEnrolled) : Number.MAX_SAFE_INTEGER;
    if (availableSeats <= 0) {
      await client.query('COMMIT');
      return { promotedCount: 0, waitingLeft: 0 };
    }

    const waitRes = await client.query(
      `SELECT id, user_id
       FROM test_waitlist
       WHERE test_id = $1::uuid AND status = 'waiting'
       ORDER BY created_at ASC, id ASC
       FOR UPDATE`,
      [id],
    );
    const waitingRows = waitRes.rows || [];
    if (!waitingRows.length) {
      await client.query('COMMIT');
      return { promotedCount: 0, waitingLeft: 0 };
    }

    const toPromote = waitingRows.slice(0, Math.min(availableSeats, waitingRows.length));
    let promotedCount = 0;
    const promotedIds = [];
    for (const row of toPromote) {
      const insertRes = await client.query(
        `INSERT INTO test_applications (user_id, test_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT (user_id, test_id) DO NOTHING`,
        [String(row.user_id), id],
      );
      if (insertRes.rowCount > 0) {
        promotedCount += 1;
        promotedIds.push(Number(row.id));
      }
      availableSeats -= 1;
      if (availableSeats <= 0) break;
    }

    if (promotedIds.length > 0) {
      await client.query(
        `UPDATE test_waitlist
         SET status = 'promoted', promoted_at = now()
         WHERE id = ANY($1::bigint[])`,
        [promotedIds],
      );
    }
    if (promotedCount > 0) {
      await client.query(
        `UPDATE tests
         SET enrolled_count = enrolled_count + $2, updated_at = now()
         WHERE id = $1::uuid`,
        [id, promotedCount],
      );
    }
    const leftRes = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM test_waitlist
       WHERE test_id = $1::uuid AND status = 'waiting'`,
      [id],
    );
    const waitingLeft = Number(leftRes.rows?.[0]?.total || 0);
    await client.query('COMMIT');
    return { promotedCount, waitingLeft };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function processPublishSchedules() {
  try {
    const settingsRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'publishScheduling' LIMIT 1`,
    );
    if (!settingsRes.rows[0]) return;
    let payload = { items: [] };
    try {
      payload = JSON.parse(String(settingsRes.rows[0].setting_value || '{}')) || { items: [] };
    } catch (_e) {
      return;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) return;
    const nowMs = Date.now();
    let changed = false;
    const nextItems = [];
    for (const raw of items) {
      const item = raw || {};
      if (item.status !== 'scheduled') {
        nextItems.push(item);
        continue;
      }
      const scheduleMs = new Date(String(item.scheduleAt || '')).getTime();
      if (!Number.isFinite(scheduleMs) || scheduleMs > nowMs) {
        nextItems.push(item);
        continue;
      }
      if (item.entityType === 'test') {
        await regenerateTestFromSubcategoryPool(String(item.entityId || ''));
        await pool.query(
          `UPDATE tests
           SET is_published = true, last_cycle_started_at = now(), updated_at = now()
           WHERE id = $1::uuid`,
          [String(item.entityId || '')],
        );
        await promoteWaitlistForTest(String(item.entityId || ''));
      } else if (item.entityType === 'article') {
        await pool.query(`UPDATE news_articles SET is_published = true WHERE id = $1::uuid`, [String(item.entityId || '')]);
      }
      if (item.notifyOnPublish) {
        // Push notification dispatch removed.
      }
      nextItems.push({
        ...item,
        status: 'published',
        processedAt: new Date().toISOString(),
      });
      changed = true;
    }
    if (changed) {
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ('publishScheduling', $1, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [JSON.stringify({ items: nextItems })],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('publish_scheduler_error', e);
  }
}

async function processTestCycleAutoReschedule() {
  try {
    const settingsRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'publishScheduling' LIMIT 1`,
    );
    let payload = { items: [] };
    if (settingsRes.rows[0]) {
      try {
        payload = JSON.parse(String(settingsRes.rows[0].setting_value || '{}')) || { items: [] };
      } catch (_e) {
        payload = { items: [] };
      }
    }
    const items = Array.isArray(payload.items) ? [...payload.items] : [];
    const nowMs = Date.now();
    let changedSettings = false;

    const testsRes = await pool.query(
      `SELECT id, duration_minutes, last_cycle_started_at
       FROM tests
       WHERE is_published = true
         AND COALESCE(duration_minutes, 0) > 0
         AND last_cycle_started_at IS NOT NULL`,
    );

    for (const row of testsRes.rows || []) {
      const testId = String(row.id || '').trim();
      if (!testId) continue;
      const startedMs = Date.parse(String(row.last_cycle_started_at || ''));
      if (!Number.isFinite(startedMs)) continue;
      const durationMinutes = Math.max(1, Number(row.duration_minutes || 0));
      const cycleEndMs = startedMs + durationMinutes * 60 * 1000;
      if (nowMs < cycleEndMs) continue;
      const scheduleAtIso = new Date(cycleEndMs + 30 * 60 * 1000).toISOString();

      const hasPendingSchedule = items.some(
        (x) =>
          String((x || {}).entityType || '').toLowerCase() === 'test' &&
          String((x || {}).entityId || '') === testId &&
          String((x || {}).status || '') === 'scheduled',
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lockedRes = await client.query(
          `SELECT id, is_published, duration_minutes, last_cycle_started_at
           FROM tests
           WHERE id = $1::uuid
           LIMIT 1
           FOR UPDATE`,
          [testId],
        );
        const locked = lockedRes.rows[0];
        if (!locked || locked.is_published !== true) {
          await client.query('COMMIT');
          continue;
        }
        const lockedStartedMs = Date.parse(String(locked.last_cycle_started_at || ''));
        const lockedDurationMinutes = Math.max(1, Number(locked.duration_minutes || 0));
        const lockedCycleEndMs = Number.isFinite(lockedStartedMs)
          ? lockedStartedMs + lockedDurationMinutes * 60 * 1000
          : Number.NaN;
        if (!Number.isFinite(lockedCycleEndMs) || Date.now() < lockedCycleEndMs) {
          await client.query('COMMIT');
          continue;
        }

        await client.query(
          `UPDATE tests
           SET is_published = false, enrolled_count = 0, updated_at = now()
           WHERE id = $1::uuid`,
          [testId],
        );
        await client.query(`DELETE FROM test_applications WHERE test_id = $1::uuid`, [testId]);
        await client.query(
          `UPDATE test_waitlist
           SET status = 'cancelled'
           WHERE test_id = $1::uuid AND status = 'waiting'`,
          [testId],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      if (!hasPendingSchedule) {
        items.unshift({
          id: `publish-${Date.now()}-${testId.slice(0, 8)}`,
          entityType: 'test',
          entityId: testId,
          scheduleAt: scheduleAtIso,
          notifyOnPublish: true,
          status: 'scheduled',
          createdAt: new Date().toISOString(),
          processedAt: '',
        });
        changedSettings = true;
      }
    }

    if (changedSettings) {
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ('publishScheduling', $1, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [JSON.stringify({ items })],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    if (e && e.code === '42703') return;
    console.error('test_cycle_auto_reschedule_error', e);
  }
}

async function processProfileReminderEmails() {
  if (!isMailConfigured()) return;
  try {
    const settingKey = 'profileReminderEmailState';
    const stateRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
      [settingKey],
    );
    let state = { sentUserIds: [] };
    if (stateRes.rows[0]) {
      try {
        state = JSON.parse(String(stateRes.rows[0].setting_value || '{}')) || { sentUserIds: [] };
      } catch (_e) {
        state = { sentUserIds: [] };
      }
    }
    const sent = new Set(Array.isArray(state.sentUserIds) ? state.sentUserIds.map((x) => String(x || '').trim()) : []);
    const { rows } = await pool.query(
      `SELECT id, email, display_name
       FROM users
       WHERE is_banned = false
         AND created_at <= (now() - interval '10 minutes')
         AND (
           length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) <> 10
           OR trim(COALESCE(signup_state, '')) = ''
           OR trim(COALESCE(signup_district, '')) = ''
         )
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    let changed = false;
    for (const row of rows || []) {
      const userId = String(row.id || '').trim();
      const email = String(row.email || '').trim();
      if (!userId || !email || sent.has(userId)) continue;
      try {
        await sendCompleteProfileReminderEmail({
          to: email,
          displayName: String(row.display_name || '').trim(),
        });
        sent.add(userId);
        changed = true;
      } catch (mailErr) {
        console.error('profile_reminder_email_failed', userId, mailErr && (mailErr.message || mailErr));
      }
    }
    if (changed) {
      const next = { sentUserIds: Array.from(sent).slice(-10000) };
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [settingKey, JSON.stringify(next)],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('profile_reminder_scheduler_error', e);
  }
}

async function processUnlockedResultEmails() {
  if (!isMailConfigured()) return;
  try {
    const settingsRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'resultUnlockEmailSettings' LIMIT 1`,
    );
    let settings = { enabled: true, delayHours: 3 };
    if (settingsRes.rows[0]) {
      try {
        const parsed = JSON.parse(String(settingsRes.rows[0].setting_value || '{}')) || {};
        settings = {
          enabled: parsed.enabled !== false,
          delayHours: Math.max(0, Math.min(168, Number(parsed.delayHours ?? 3))),
        };
      } catch (_e) {
        settings = { enabled: true, delayHours: 3 };
      }
    }
    if (!settings.enabled) return;
    const delayHours = settings.delayHours;
    const stateKey = 'resultUnlockEmailState';
    const stateRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
      [stateKey],
    );
    let state = { sentAttemptIds: [] };
    if (stateRes.rows[0]) {
      try {
        state = JSON.parse(String(stateRes.rows[0].setting_value || '{}')) || { sentAttemptIds: [] };
      } catch (_e) {
        state = { sentAttemptIds: [] };
      }
    }
    const sent = new Set(
      Array.isArray(state.sentAttemptIds) ? state.sentAttemptIds.map((x) => String(x || '').trim()) : [],
    );
    const { rows } = await pool.query(
      `WITH base AS (
         SELECT
           ta.id,
           ta.user_id,
           ta.correct,
           ta.total,
           ta.completed_at,
           u.email,
           u.display_name,
           COALESCE(t.title, ta.test_name) AS test_title,
           COALESCE(
             t.result_release_at,
             ta.completed_at + make_interval(hours => $1::int)
           ) AS unlock_at,
           COALESCE(ta.test_catalog_id::text, lower(trim(ta.test_name))) AS test_key
         FROM test_attempts ta
         INNER JOIN users u ON u.id = ta.user_id
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
         WHERE u.is_banned = false
           AND trim(COALESCE(u.email, '')) <> ''
       ),
       ranked AS (
         SELECT
           b.*,
           ROW_NUMBER() OVER (
             PARTITION BY b.test_key
             ORDER BY b.correct DESC, b.total DESC, b.completed_at ASC, b.id ASC
           ) AS rank,
           COUNT(*) OVER (PARTITION BY b.test_key) AS participants
         FROM base b
       )
       SELECT
         id::text AS attempt_id,
         user_id::text AS user_id,
         email,
         display_name,
         test_title,
         correct,
         total,
         rank,
         participants,
         unlock_at
       FROM ranked
       WHERE unlock_at <= now()
       ORDER BY unlock_at DESC
       LIMIT 200`,
      [delayHours],
    );

    let changed = false;
    for (const row of rows || []) {
      const attemptId = String(row.attempt_id || '').trim();
      if (!attemptId || sent.has(attemptId)) continue;
      try {
        await sendResultUnlockedEmail({
          to: String(row.email || '').trim(),
          displayName: String(row.display_name || '').trim(),
          testTitle: String(row.test_title || '').trim() || 'Mock Test',
          correct: Number(row.correct || 0),
          total: Number(row.total || 0),
          rank: Number(row.rank || 0),
          participants: Number(row.participants || 0),
          unlockAtIso: row.unlock_at ? new Date(row.unlock_at).toISOString() : new Date().toISOString(),
        });
        sent.add(attemptId);
        changed = true;
      } catch (mailErr) {
        console.error('result_unlock_email_failed', attemptId, mailErr && (mailErr.message || mailErr));
      }
    }

    if (changed) {
      const next = { sentAttemptIds: Array.from(sent).slice(-20000) };
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [stateKey, JSON.stringify(next)],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('result_unlock_email_scheduler_error', e);
  }
}

function parseHourMinuteFromSlotLabel(slotLabel) {
  const raw = String(slotLabel || '').trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const meridiem = String(m[3] || '').toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return { hour, minute };
}

function buildExamStartIso(examDate, slotLabel) {
  const date = String(examDate || '').trim();
  if (!date) return null;
  const hm = parseHourMinuteFromSlotLabel(slotLabel);
  if (!hm) return null;
  const tzOffsetMinutes = Number(process.env.EXAM_TIMEZONE_OFFSET_MINUTES || 330);
  const sign = tzOffsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMinutes);
  const tzH = String(Math.floor(abs / 60)).padStart(2, '0');
  const tzM = String(abs % 60).padStart(2, '0');
  const hh = String(hm.hour).padStart(2, '0');
  const mm = String(hm.minute).padStart(2, '0');
  const iso = `${date}T${hh}:${mm}:00${sign}${tzH}:${tzM}`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

async function processMockTestStartReminderEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'mockTestStartReminderEmailState';
    const stateRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
      [stateKey],
    );
    let state = { sentTestIds: [] };
    if (stateRes.rows[0]) {
      try {
        state = JSON.parse(String(stateRes.rows[0].setting_value || '{}')) || { sentTestIds: [] };
      } catch (_e) {
        state = { sentTestIds: [] };
      }
    }
    const sentTestIds = new Set(
      Array.isArray(state.sentTestIds) ? state.sentTestIds.map((x) => String(x || '').trim()) : [],
    );
    const testsRes = await pool.query(
      `SELECT id::text AS id, title, exam_date, slot_label
       FROM tests
       WHERE is_published = true
         AND exam_date IS NOT NULL
         AND trim(COALESCE(slot_label, '')) <> ''
         AND exam_date BETWEEN (now()::date - interval '1 day') AND (now()::date + interval '2 days')
       ORDER BY exam_date ASC
       LIMIT 120`,
    );
    const usersRes = await pool.query(
      `SELECT id::text AS user_id, email, display_name
       FROM users
       WHERE is_banned = false
         AND trim(COALESCE(email, '')) <> ''
       ORDER BY created_at DESC
       LIMIT 8000`,
    );
    const nowMs = Date.now();
    let changed = false;

    for (const testRow of testsRes.rows || []) {
      const testId = String(testRow.id || '').trim();
      if (!testId || sentTestIds.has(testId)) continue;
      const startAtIso = buildExamStartIso(testRow.exam_date, testRow.slot_label);
      if (!startAtIso) continue;
      const diffMin = (Date.parse(startAtIso) - nowMs) / 60000;
      if (diffMin < 55 || diffMin > 65) continue;

      for (const userRow of usersRes.rows || []) {
        const email = String(userRow.email || '').trim();
        if (!email) continue;
        try {
          await sendMockTestStartingSoonEmail({
            to: email,
            displayName: String(userRow.display_name || '').trim(),
            testTitle: String(testRow.title || '').trim() || 'Mock Test',
            examDate: String(testRow.exam_date || '').trim(),
            slotLabel: String(testRow.slot_label || '').trim(),
            startAtIso,
          });
        } catch (mailErr) {
          console.error('mocktest_start_reminder_email_failed', testId, email, mailErr && (mailErr.message || mailErr));
        }
      }
      sentTestIds.add(testId);
      changed = true;
    }

    if (changed) {
      const next = { sentTestIds: Array.from(sentTestIds).slice(-10000) };
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [stateKey, JSON.stringify(next)],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('mocktest_start_reminder_scheduler_error', e);
  }
}

async function getSettingJson(settingKey, fallback) {
  const res = await pool.query(`SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`, [settingKey]);
  if (!res.rows[0]) return fallback;
  try {
    return JSON.parse(String(res.rows[0].setting_value || 'null')) ?? fallback;
  } catch (_e) {
    return fallback;
  }
}

async function setSettingJson(settingKey, value) {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, NULL)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
    [settingKey, JSON.stringify(value)],
  );
}

async function processMissedTestFollowupEmails() {
  if (!isMailConfigured()) return;
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const stateKey = 'missedTestFollowupState';
    const state = await getSettingJson(stateKey, { dayKey: '', sentUserIds: [] });
    let sent = new Set(Array.isArray(state.sentUserIds) && state.dayKey === todayKey ? state.sentUserIds : []);
    const testsRes = await pool.query(
      `SELECT id::text AS id, title FROM tests WHERE is_published = true AND exam_date = now()::date ORDER BY created_at DESC LIMIT 1`,
    );
    const todayTest = testsRes.rows[0];
    if (!todayTest) return;
    const usersRes = await pool.query(
      `SELECT u.id::text AS user_id, u.email, u.display_name
       FROM users u
       WHERE u.is_banned = false
         AND trim(COALESCE(u.email, '')) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM test_attempts ta
           WHERE ta.user_id = u.id AND ta.test_catalog_id = $1::uuid AND ta.completed_at::date = now()::date
         )
       LIMIT 4000`,
      [todayTest.id],
    );
    let changed = false;
    for (const row of usersRes.rows || []) {
      const userId = String(row.user_id || '');
      if (!userId || sent.has(userId)) continue;
      await sendMissedTestFollowupEmail({
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        testTitle: String(todayTest.title || 'Today Mock Test'),
      }).catch((e) => console.error('missed_test_followup_email_failed', userId, e && (e.message || e)));
      sent.add(userId);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { dayKey: todayKey, sentUserIds: Array.from(sent).slice(-20000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('missed_test_followup_scheduler_error', e);
  }
}

async function processStreakRiskEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'streakRiskEmailState';
    const state = await getSettingJson(stateKey, { sentAtByUser: {} });
    const sentMap = state.sentAtByUser && typeof state.sentAtByUser === 'object' ? state.sentAtByUser : {};
    const rowsRes = await pool.query(
      `SELECT
         u.id::text AS user_id,
         u.email,
         u.display_name,
         COALESCE(MAX(ta.completed_at), u.created_at) AS last_active
       FROM users u
       LEFT JOIN test_attempts ta ON ta.user_id = u.id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
       GROUP BY u.id, u.email, u.display_name, u.created_at
       HAVING (now() - COALESCE(MAX(ta.completed_at), u.created_at)) BETWEEN interval '2 days' AND interval '3 days'
       LIMIT 3000`,
    );
    let changed = false;
    for (const row of rowsRes.rows || []) {
      const userId = String(row.user_id || '');
      const lastSent = String(sentMap[userId] || '');
      if (lastSent && Date.now() - Date.parse(lastSent) < 36 * 60 * 60 * 1000) continue;
      const days = Math.max(2, Math.floor((Date.now() - Date.parse(String(row.last_active || new Date().toISOString()))) / 86400000));
      await sendStreakRiskAlertEmail({
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        inactiveDays: days,
      }).catch((e) => console.error('streak_risk_email_failed', userId, e && (e.message || e)));
      sentMap[userId] = new Date().toISOString();
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentAtByUser: sentMap });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('streak_risk_scheduler_error', e);
  }
}

function weekKeyUtc(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((x - yearStart) / 86400000) + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function processWeeklyPerformanceReportEmails() {
  if (!isMailConfigured()) return;
  try {
    const key = weekKeyUtc();
    const stateKey = 'weeklyPerformanceEmailState';
    const state = await getSettingJson(stateKey, { weekKey: '', sentUserIds: [] });
    const sent = new Set(Array.isArray(state.sentUserIds) && state.weekKey === key ? state.sentUserIds : []);
    const metricsRes = await pool.query(
      `WITH recent AS (
         SELECT ta.user_id, ta.correct, ta.total, ta.completed_at, t.subcategory
         FROM test_attempts ta
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
         WHERE ta.completed_at >= now() - interval '7 days'
       ),
       user_summary AS (
         SELECT user_id, COUNT(*)::int AS attempts, ROUND(AVG((correct::numeric / NULLIF(total,0))*100), 0)::int AS avg_percent
         FROM recent
         GROUP BY user_id
       ),
       weak AS (
         SELECT DISTINCT ON (r.user_id)
           r.user_id,
           COALESCE(NULLIF(trim(r.subcategory), ''), 'General Practice') AS weak_topic
         FROM recent r
         GROUP BY r.user_id, weak_topic
         ORDER BY r.user_id, AVG((r.correct::numeric / NULLIF(r.total,0))*100) ASC
       )
       SELECT u.id::text AS user_id, u.email, u.display_name, us.attempts, us.avg_percent, w.weak_topic
       FROM user_summary us
       INNER JOIN users u ON u.id = us.user_id
       LEFT JOIN weak w ON w.user_id = us.user_id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
       LIMIT 4000`,
    );
    let changed = false;
    for (const row of metricsRes.rows || []) {
      const userId = String(row.user_id || '');
      if (!userId || sent.has(userId)) continue;
      await sendWeeklyPerformanceReportEmail({
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        attempts: Number(row.attempts || 0),
        avgPercent: Number(row.avg_percent || 0),
        weakTopic: String(row.weak_topic || 'General Practice'),
      }).catch((e) => console.error('weekly_report_email_failed', userId, e && (e.message || e)));
      sent.add(userId);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { weekKey: key, sentUserIds: Array.from(sent).slice(-20000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('weekly_report_scheduler_error', e);
  }
}

async function processRankMilestoneEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'rankMilestoneEmailState';
    const state = await getSettingJson(stateKey, { sentAttemptIds: [] });
    const sent = new Set(Array.isArray(state.sentAttemptIds) ? state.sentAttemptIds.map((x) => String(x)) : []);
    const res = await pool.query(
      `WITH ranked AS (
         SELECT
           ta.id,
           ta.user_id,
           ta.correct,
           ta.total,
           ta.completed_at,
           COALESCE(t.title, ta.test_name) AS test_title,
           COALESCE(ta.test_catalog_id::text, lower(trim(ta.test_name))) AS test_key,
           ROW_NUMBER() OVER (PARTITION BY COALESCE(ta.test_catalog_id::text, lower(trim(ta.test_name))) ORDER BY ta.correct DESC, ta.total DESC, ta.completed_at ASC, ta.id ASC) AS rank
         FROM test_attempts ta
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
       ),
       trend AS (
         SELECT
           r.*,
           LAG(r.rank) OVER (PARTITION BY r.user_id, r.test_key ORDER BY r.completed_at ASC, r.id ASC) AS prev_rank
         FROM ranked r
       )
       SELECT
         tr.id::text AS attempt_id,
         tr.user_id::text AS user_id,
         u.email,
         u.display_name,
         tr.test_title,
         tr.rank,
         COALESCE(tr.prev_rank, tr.rank) AS prev_rank
       FROM trend tr
       INNER JOIN users u ON u.id = tr.user_id
       WHERE u.is_banned = false
         AND trim(COALESCE(u.email, '')) <> ''
         AND tr.completed_at >= now() - interval '2 days'
         AND (tr.rank <= 100 OR (COALESCE(tr.prev_rank, tr.rank) - tr.rank) >= 20)
       ORDER BY tr.completed_at DESC
       LIMIT 500`,
    );
    let changed = false;
    for (const row of res.rows || []) {
      const attemptId = String(row.attempt_id || '');
      if (!attemptId || sent.has(attemptId)) continue;
      const improvedBy = Math.max(0, Number(row.prev_rank || row.rank) - Number(row.rank || 0));
      const reason = Number(row.rank || 0) <= 100 ? 'You entered Top 100.' : `You improved by ${improvedBy} ranks.`;
      await sendRankMilestoneEmail({
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        testTitle: String(row.test_title || 'Mock Test'),
        rank: Number(row.rank || 0),
        improvedBy,
        reason,
      }).catch((e) => console.error('rank_milestone_email_failed', attemptId, e && (e.message || e)));
      sent.add(attemptId);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentAttemptIds: Array.from(sent).slice(-30000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('rank_milestone_scheduler_error', e);
  }
}

async function processInterestContentEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'interestContentEmailState';
    const state = await getSettingJson(stateKey, { sentPairs: [] });
    const sent = new Set(Array.isArray(state.sentPairs) ? state.sentPairs.map((x) => String(x)) : []);
    const usersRes = await pool.query(
      `WITH test_interest AS (
         SELECT ta.user_id, t.subcategory, COUNT(*) AS c
         FROM test_attempts ta
         INNER JOIN tests t ON t.id = ta.test_catalog_id
         WHERE trim(COALESCE(t.subcategory, '')) <> ''
         GROUP BY ta.user_id, t.subcategory
       ),
       top_interest AS (
         SELECT DISTINCT ON (user_id) user_id, subcategory
         FROM test_interest
         ORDER BY user_id, c DESC
       )
       SELECT u.id::text AS user_id, u.email, u.display_name, ti.subcategory
       FROM users u
       LEFT JOIN top_interest ti ON ti.user_id = u.id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
       LIMIT 4000`,
    );
    const testsRes = await pool.query(
      `SELECT id::text AS id, title, subcategory
       FROM tests
       WHERE is_published = true AND created_at >= now() - interval '24 hours'
       ORDER BY created_at DESC
       LIMIT 60`,
    );
    let changed = false;
    for (const user of usersRes.rows || []) {
      const interest = String(user.subcategory || '').trim().toLowerCase();
      if (!interest) continue;
      const matched = (testsRes.rows || []).find((t) => String(t.subcategory || '').trim().toLowerCase() === interest);
      if (!matched) continue;
      const pair = `${String(user.user_id)}:${String(matched.id)}`;
      if (sent.has(pair)) continue;
      await sendNewContentByInterestEmail({
        to: String(user.email || ''),
        displayName: String(user.display_name || ''),
        interestLabel: `Interest: ${String(matched.subcategory || '').trim()}`,
        title: String(matched.title || 'New Mock Test'),
        message: 'New content matching your preferred category is now available.',
      }).catch((e) => console.error('interest_content_email_failed', pair, e && (e.message || e)));
      sent.add(pair);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentPairs: Array.from(sent).slice(-30000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('interest_content_scheduler_error', e);
  }
}

async function processReEngagementEmails() {
  if (!isMailConfigured()) return;
  try {
    const milestones = [7, 14, 30];
    const stateKey = 'reengagementEmailState';
    const state = await getSettingJson(stateKey, { sentByUser: {} });
    const sentByUser = state.sentByUser && typeof state.sentByUser === 'object' ? state.sentByUser : {};
    const usersRes = await pool.query(
      `SELECT u.id::text AS user_id, u.email, u.display_name, COALESCE(MAX(ta.completed_at), u.created_at) AS last_active
       FROM users u
       LEFT JOIN test_attempts ta ON ta.user_id = u.id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
       GROUP BY u.id, u.email, u.display_name, u.created_at
       LIMIT 6000`,
    );
    let changed = false;
    for (const row of usersRes.rows || []) {
      const userId = String(row.user_id || '');
      const inactiveDays = Math.floor((Date.now() - Date.parse(String(row.last_active || new Date().toISOString()))) / 86400000);
      const targetMilestone = milestones.find((m) => inactiveDays >= m && inactiveDays < m + 1);
      if (!targetMilestone) continue;
      const sentMilestones = new Set(Array.isArray(sentByUser[userId]) ? sentByUser[userId].map((x) => Number(x)) : []);
      if (sentMilestones.has(targetMilestone)) continue;
      await sendReEngagementEmail({
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        inactiveDays: targetMilestone,
      }).catch((e) => console.error('reengagement_email_failed', userId, e && (e.message || e)));
      sentMilestones.add(targetMilestone);
      sentByUser[userId] = Array.from(sentMilestones).sort((a, b) => a - b);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentByUser });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('reengagement_scheduler_error', e);
  }
}

async function processBirthdayEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'birthdayEmailState';
    const currentYear = String(new Date().getUTCFullYear());
    const state = await getSettingJson(stateKey, { sentByUserYear: {} });
    const sentByUserYear = state.sentByUserYear && typeof state.sentByUserYear === 'object' ? state.sentByUserYear : {};
    const rowsRes = await pool.query(
      `SELECT id::text AS user_id, email, display_name
       FROM users
       WHERE is_banned = false
         AND trim(COALESCE(email, '')) <> ''
         AND date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM now())
         AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM now())
       LIMIT 4000`,
    );
    let changed = false;
    for (const row of rowsRes.rows || []) {
      const userId = String(row.user_id || '');
      if (!userId) continue;
      if (String(sentByUserYear[userId] || '') === currentYear) continue;
      await sendBirthdayEmail({
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
      }).catch((e) => console.error('birthday_email_failed', userId, e && (e.message || e)));
      sentByUserYear[userId] = currentYear;
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentByUserYear });
  } catch (e) {
    if (e && e.code === '42P01') return;
    if (e && e.code === '42703') return;
    console.error('birthday_scheduler_error', e);
  }
}

setInterval(() => {
  processPublishSchedules();
}, 60000);
setInterval(() => {
  processTestCycleAutoReschedule();
}, 60000);
setInterval(() => {
  processProfileReminderEmails();
}, 60000);
setInterval(() => {
  processUnlockedResultEmails();
}, 60000);
setInterval(() => {
  processMockTestStartReminderEmails();
}, 60000);
setInterval(() => {
  processMissedTestFollowupEmails();
}, 60000);
setInterval(() => {
  processStreakRiskEmails();
}, 60000);
setInterval(() => {
  processWeeklyPerformanceReportEmails();
}, 60000);
setInterval(() => {
  processRankMilestoneEmails();
}, 60000);
setInterval(() => {
  processInterestContentEmails();
}, 60000);
setInterval(() => {
  processReEngagementEmails();
}, 60000);
setInterval(() => {
  processBirthdayEmails();
}, 60000);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = parseInt(process.env.PORT || '3000', 10);
ensureOptionalColumns().finally(() => {
  app.listen(port, () => {
    console.log(`MockTestApp API listening on http://0.0.0.0:${port}`);
  });
});

