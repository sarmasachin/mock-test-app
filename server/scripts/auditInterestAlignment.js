'use strict';

/**
 * Optional admin audit — compares examCategories.level3 vs tests.subcategory.
 * Requires DATABASE_URL / running Postgres. Safe read-only.
 *
 *   cd server
 *   node scripts/auditInterestAlignment.js
 */

require('dotenv').config();
const { pool } = require('../db');
const { auditSubcategoryAlignment } = require('../src/lib/userInterests');

async function main() {
  const settingsRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'examCategories' LIMIT 1`,
  );
  let examCategories = { items: [] };
  try {
    examCategories = JSON.parse(String(settingsRes.rows[0]?.setting_value || '{}'));
  } catch (_e) {
    console.warn('Could not parse examCategories JSON');
  }

  const testsRes = await pool.query(
    `SELECT title, subcategory, is_published
     FROM tests
     ORDER BY title ASC`,
  );

  const report = auditSubcategoryAlignment(examCategories, testsRes.rows || []);
  console.log('Interest alignment audit');
  console.log('  enabled level3:', report.enabledLevel3Count);
  console.log('  tests total:   ', report.testCount);
  console.log('  OK:            ', report.ok ? 'yes' : 'NO — fix admin data');

  if (report.testsWithoutSubcategory.length) {
    console.log('\nTests missing subcategory:');
    for (const t of report.testsWithoutSubcategory) {
      console.log(`  - ${t.title || '(no title)'}`);
    }
  }

  if (report.testsNotInExamCategories.length) {
    console.log('\nTests subcategory not in examCategories (enabled level3):');
    for (const t of report.testsNotInExamCategories) {
      console.log(`  - ${t.title}: "${t.subcategory}"`);
    }
  }

  if (report.categoriesWithoutPublishedTests.length) {
    console.log('\nEnabled level3 with no test subcategory match (informational):');
    for (const l3 of report.categoriesWithoutPublishedTests) {
      console.log(`  - ${l3}`);
    }
  }

  await pool.end();
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('audit failed:', e.message || e);
  pool.end().catch(() => {});
  process.exit(1);
});
