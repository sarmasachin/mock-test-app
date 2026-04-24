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
const { pool } = require('./db');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('FATAL: set JWT_SECRET (min 16 chars) in .env');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: set DATABASE_URL in .env');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(async (req, res, next) => {
  const path = String(req.path || '');
  if (
    path === '/health' ||
    path.startsWith('/v1/admin') ||
    path === '/v1/auth/login' ||
    path === '/v1/auth/refresh'
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
app.use('/v1/admin', requireAuth, requireAdmin, adminRouter);

async function ensureOptionalColumns() {
  try {
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS dynamic_fluctuation_on_publish BOOLEAN NOT NULL DEFAULT true`,
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
        await pool.query(`UPDATE tests SET is_published = true WHERE id = $1::uuid`, [String(item.entityId || '')]);
      } else if (item.entityType === 'article') {
        await pool.query(`UPDATE news_articles SET is_published = true WHERE id = $1::uuid`, [String(item.entityId || '')]);
      }
      if (item.notifyOnPublish) {
        const notifRes = await pool.query(
          `SELECT setting_value FROM app_settings WHERE setting_key = 'notificationScheduling' LIMIT 1`,
        );
        let notifPayload = { items: [] };
        if (notifRes.rows[0]) {
          try {
            notifPayload = JSON.parse(String(notifRes.rows[0].setting_value || '{}')) || { items: [] };
          } catch (_e) {
            notifPayload = { items: [] };
          }
        }
        const notifItems = Array.isArray(notifPayload.items) ? notifPayload.items : [];
        notifItems.unshift({
          id: `schedule-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
          title: item.entityType === 'test' ? 'Test Published' : 'News Published',
          message: item.entityType === 'test' ? 'A scheduled test is now live.' : 'A scheduled news update is now live.',
          target: 'all',
          segmentKey: '',
          scheduleAt: new Date().toISOString(),
          repeatType: 'none',
          dayOfWeek: 1,
          dayOfMonth: 1,
          repeatUntil: '',
          status: 'scheduled',
          createdAt: new Date().toISOString(),
          sentAt: '',
        });
        await pool.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES ('notificationScheduling', $1, NULL)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
          [JSON.stringify({ items: notifItems })],
        );
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

setInterval(() => {
  processPublishSchedules();
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

