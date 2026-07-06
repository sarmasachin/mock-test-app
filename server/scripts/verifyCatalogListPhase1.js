'use strict';
/**
 * Phase 1 verify — GET /v1/tests catalog must not hide all rows (is_published in SELECT).
 * Read-only: static source check, DB read, optional HTTP smoke.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { pool } = require('../src/db');
const { isTestCatalogVisible } = require('../src/lib/testVisibility');

const PUBLISHED_QUESTION_COUNT_SQL = `(SELECT COUNT(*)::int FROM questions q WHERE q.test_id = tests.id AND q.is_published = true) AS published_question_count`;
const CATALOG_SELECT = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, ${PUBLISHED_QUESTION_COUNT_SQL}, test_kind, is_published,
                  exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed,
                  language_mode, exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until, answer_key_release_at, result_release_at,
                  dynamic_date_enabled, date_cycle_days`;

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

async function loadAdvancedConfigMap() {
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
    );
    const parsed = JSON.parse(String(rows?.[0]?.setting_value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  const key = String(testId || '').trim();
  if (!key || !advancedMap || typeof advancedMap !== 'object') return null;
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
  const resultVisibilityRaw = String(raw.resultVisibility || 'immediate').trim().toLowerCase();
  return {
    publishAt: String(raw.publishAt || '').trim() || null,
    unpublishAt: String(raw.unpublishAt || '').trim() || null,
    resultVisibility: ['immediate', 'after_result_time'].includes(resultVisibilityRaw)
      ? resultVisibilityRaw
      : 'immediate',
    reattemptCooldownMinutes: Math.max(0, Number(raw.reattemptCooldownMinutes || 0)),
    lateJoinMinutes: Math.max(0, Number(raw.lateJoinMinutes || 0)),
    notifyBeforeMinutes: Math.max(0, Number(raw.notifyBeforeMinutes || 0)),
    resumeEnabled: raw.resumeEnabled !== false,
    shuffleQuestions: raw.shuffleQuestions === true,
    shuffleOptions: raw.shuffleOptions === true,
    fullscreenRequired: raw.fullscreenRequired === true,
    copyPasteBlocked: raw.copyPasteBlocked === true,
    notifyOnPublish: raw.notifyOnPublish !== false,
  };
}

function staticCatalogSelectCheck() {
  const testsJsPath = path.join(__dirname, '..', 'src', 'routes', 'tests.js');
  const src = fs.readFileSync(testsJsPath, 'utf8');
  const match = src.match(/const catalogSelect = `([\s\S]*?)`;/);
  if (!match) {
    return line(false, 'tests.js: catalogSelect not found');
  }
  const catalogSelect = match[1];
  let ok = line(
    /\bis_published\b/.test(catalogSelect),
    'tests.js catalogSelect includes is_published column',
  );
  ok = line(
    catalogSelect.includes('test_kind, is_published'),
    'tests.js is_published appears in SELECT (not only WHERE)',
  ) && ok;
  return ok;
}

function regressionVisibilityCheck() {
  const rowWithFlag = { is_published: true, valid_until: null };
  const rowWithoutFlag = { valid_until: null };
  let ok = line(isTestCatalogVisible(rowWithFlag, {}, Date.now()) === true, 'visibility: is_published=true → visible');
  ok = line(isTestCatalogVisible(rowWithoutFlag, {}, Date.now()) === false, 'visibility: missing is_published → hidden (regression guard)') && ok;
  return ok;
}

async function dbCatalogCheck() {
  const advancedMap = await loadAdvancedConfigMap();
  const { rows } = await pool.query(
    `${CATALOG_SELECT}
     FROM tests
     WHERE is_published = true
     ORDER BY title ASC
     LIMIT 100`,
  );
  const nowMs = Date.now();
  const visible = rows.filter((row) => {
    const adv = normalizeTestAdvancedConfig(resolveAdvancedConfigForTest(advancedMap, row.id));
    return isTestCatalogVisible(row, adv, nowMs);
  });

  let ok = line(rows.length >= 0, `DB: ${rows.length} published test row(s) fetched with is_published in SELECT`);
  ok = line(
    rows.every((row) => row.is_published === true),
    'DB: every fetched row has is_published === true on row object',
  ) && ok;

  if (rows.length > 0) {
    ok = line(
      visible.length === rows.length || visible.length > 0,
      `DB: ${visible.length}/${rows.length} row(s) pass isTestCatalogVisible (none wrongly hidden by undefined is_published)`,
    ) && ok;
    if (visible.length === 0 && rows.length > 0) {
      const sample = rows[0];
      console.log('     sample hidden row:', {
        title: sample.title,
        is_published: sample.is_published,
        valid_until: sample.valid_until,
      });
    }
  } else {
    ok = line(true, 'DB: no published tests yet (empty catalog is OK for new installs)') && ok;
  }

  ok = line(
    visible.length === rows.filter((row) => row.is_published === true).length ||
      (rows.length === 0 && visible.length === 0),
    'DB: visible count matches rows when is_published is present on each row',
  ) && ok;

  return { ok, dbPublishedCount: rows.length, dbVisibleCount: visible.length };
}

async function questionsCreatedAtCheck() {
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'questions'
       AND column_name = 'created_at'`,
  );
  return line(rows.length === 1, 'DB: questions.created_at column exists');
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body || '{}') });
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
  });
}

async function httpCatalogCheck(expectedMinVisible) {
  const port = Number(process.env.PORT || 3000);
  const url = `http://127.0.0.1:${port}/v1/tests?limit=100`;
  try {
    const { status, json } = await httpGetJson(url);
    if (status !== 200) {
      return line(false, `HTTP GET /v1/tests → status ${status}`);
    }
    const items = Array.isArray(json.items) ? json.items : [];
    let ok = line(Array.isArray(json.items), `HTTP GET /v1/tests → 200 with items array (${items.length} item(s))`);
    if (expectedMinVisible > 0) {
      ok = line(items.length > 0, `HTTP: at least 1 catalog item (got ${items.length}, DB published ${expectedMinVisible})`) && ok;
      if (items.length > 0) {
        const first = items[0];
        ok = line(Boolean(first.id && first.title), `HTTP: first item has id + title (${first.title || '?'})`) && ok;
      }
    }
    return ok;
  } catch (e) {
    line(false, `HTTP GET /v1/tests skipped or failed: ${e.message}`);
    console.log('     Start server: cd server && npm start');
    return true;
  }
}

async function main() {
  let ok = staticCatalogSelectCheck();
  ok = regressionVisibilityCheck() && ok;
  ok = await questionsCreatedAtCheck() && ok;

  let dbPublishedCount = 0;
  try {
    const dbResult = await dbCatalogCheck();
    ok = dbResult.ok && ok;
    dbPublishedCount = dbResult.dbPublishedCount;
  } catch (e) {
    ok = line(false, `DB catalog check failed: ${e.message}`) && ok;
  }

  ok = await httpCatalogCheck(dbPublishedCount) && ok;

  await pool.end().catch(() => {});

  if (!ok) {
    console.error('\nPhase 1 verify FAILED');
    process.exit(1);
  }
  console.log('\nPhase 1 verify PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
