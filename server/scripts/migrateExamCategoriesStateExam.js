#!/usr/bin/env node
'use strict';

/**
 * Migrate legacy examCategories rows to Phase 1 extended schema.
 *
 * Usage:
 *   node scripts/migrateExamCategoriesStateExam.js           # dry-run (default)
 *   node scripts/migrateExamCategoriesStateExam.js --apply   # write DB
 *
 * Requires DATABASE_URL in server/.env
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const {
  buildExamCategoriesSettingsForApi,
  normalizeStateExamSectionTemplates,
  parseJsonObject,
} = require('../src/lib/examCategoriesAdmin');

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

async function loadSettings(client) {
  const { rows } = await client.query(
    `SELECT setting_key, setting_value
     FROM app_settings
     WHERE setting_key IN ('examCategories', 'stateExamSectionTemplates')`,
  );
  const map = {};
  for (const row of rows) map[row.setting_key] = row.setting_value;
  return map;
}

function summarizeDiff(beforeItems, afterItems) {
  const beforeById = new Map(beforeItems.map((r) => [r.id, r]));
  let extended = 0;
  let iconChanged = 0;
  for (const row of afterItems) {
    const prev = beforeById.get(row.id) || {};
    if (
      prev.sectionSlug === undefined &&
      row.sectionSlug
    ) {
      extended += 1;
    }
    if (String(prev.iconKey || '') !== String(row.iconKey || '')) {
      iconChanged += 1;
    }
  }
  return { extended, iconChanged, total: afterItems.length };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  console.log(`=== Migrate examCategories → Phase 1 schema (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const client = await pool.connect();
  try {
    const map = await loadSettings(client);
    const rawExam = parseJsonObject(map.examCategories, { items: [] });
    const rawTemplates = map.stateExamSectionTemplates
      ? parseJsonObject(map.stateExamSectionTemplates, null)
      : null;
    const beforeItems = Array.isArray(rawExam.items) ? rawExam.items : [];

    const built = buildExamCategoriesSettingsForApi(rawExam, rawTemplates);
    const afterItems = built.examCategories.items || [];
    const templates = built.stateExamSectionTemplates.items || [];

    const diff = summarizeDiff(beforeItems, afterItems);
    console.log(`Rows before: ${beforeItems.length}`);
    console.log(`Rows after:  ${diff.total}`);
    console.log(`Rows gaining section/sort fields: ${diff.extended}`);
    console.log(`Rows with iconKey change: ${diff.iconChanged}`);
    console.log(`Section templates: ${templates.length}`);

    if (afterItems.length > 0) {
      console.log('\nSample normalized row:');
      console.log(JSON.stringify(afterItems[0], null, 2));
    }

    if (!apply) {
      console.log('\nDRY-RUN only. Re-run with --apply to write app_settings.');
      console.log('MIGRATE_STATE_EXAM_DRY_RUN_OK');
      return;
    }

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by)
       VALUES ('examCategories', $1, NULL)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
      [JSON.stringify({ items: afterItems })],
    );
    if (!map.stateExamSectionTemplates) {
      await client.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ('stateExamSectionTemplates', $1, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [JSON.stringify({ items: templates })],
      );
      console.log('\nWrote default stateExamSectionTemplates.');
    }
    await client.query('COMMIT');
    console.log('\nMIGRATE_STATE_EXAM_APPLY_OK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('MIGRATE_STATE_EXAM_FAILED', e.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  pool.end().catch(() => {});
  process.exit(1);
});
