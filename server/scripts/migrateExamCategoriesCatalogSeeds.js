#!/usr/bin/env node
'use strict';

/**
 * Phase 6 — migrate HP + All India hardcoded catalog into examCategories (idempotent).
 *
 * Usage:
 *   node scripts/migrateExamCategoriesCatalogSeeds.js           # dry-run
 *   node scripts/migrateExamCategoriesCatalogSeeds.js --apply   # write DB
 *
 * Run AFTER migrateExamCategoriesStateExam.js (schema fields).
 * Requires DATABASE_URL in server/.env
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const {
  buildExamCategoriesSettingsForApi,
  parseJsonObject,
  validateExamCategoriesCollisions,
} = require('../src/lib/examCategoriesAdmin');
const { mergeCatalogSeedsIntoExamCategories } = require('../src/lib/catalogExamCategorySeeds');

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

async function loadTests(client) {
  const { rows } = await client.query(
    `SELECT id, title, subcategory FROM tests ORDER BY created_at ASC`,
  );
  return rows;
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  console.log(`=== Migrate catalog seeds → examCategories (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const client = await pool.connect();
  try {
    const mapRows = await client.query(
      `SELECT setting_key, setting_value
       FROM app_settings
       WHERE setting_key IN ('examCategories', 'stateExamSectionTemplates')`,
    );
    const map = {};
    for (const row of mapRows.rows) map[row.setting_key] = row.setting_value;

    const rawExam = parseJsonObject(map.examCategories, { items: [] });
    const rawTemplates = map.stateExamSectionTemplates
      ? parseJsonObject(map.stateExamSectionTemplates, null)
      : null;
    const beforeItems = Array.isArray(rawExam.items) ? rawExam.items : [];

    const tests = await loadTests(client);
    const merged = mergeCatalogSeedsIntoExamCategories(beforeItems, { tests });

    const built = buildExamCategoriesSettingsForApi(
      { items: merged.items },
      rawTemplates,
    );
    const afterItems = built.examCategories.items || [];

    const collisionCheck = validateExamCategoriesCollisions(afterItems);
    if (!collisionCheck.ok) {
      console.error('COLLISION after merge:', collisionCheck.error);
      process.exit(1);
    }

    console.log(`Rows before:     ${beforeItems.length}`);
    console.log(`Catalog seeds:   ${merged.stats.seedTotal} (${merged.stats.himachalSeeds} HP + ${merged.stats.allIndiaSeeds} All India)`);
    console.log(`Rows added:      ${merged.stats.added}`);
    console.log(`Rows skipped:    ${merged.stats.skipped} (already present)`);
    console.log(`Rows after:      ${afterItems.length}`);

    const linked = afterItems.filter((r) => r.linkedTestId).length;
    console.log(`Rows linkedTestId: ${linked}`);

    if (merged.addedRows.length > 0) {
      console.log('\nSample added row:');
      console.log(JSON.stringify(merged.addedRows[0], null, 2));
    }

    if (!apply) {
      console.log('\nDRY-RUN only. Re-run with --apply to write app_settings.');
      console.log('MIGRATE_CATALOG_SEEDS_DRY_RUN_OK');
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
    await client.query('COMMIT');
    console.log('\nMIGRATE_CATALOG_SEEDS_APPLY_OK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('MIGRATE_CATALOG_SEEDS_FAILED', e.message || e);
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
