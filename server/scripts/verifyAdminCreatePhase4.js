'use strict';
/**
 * Phase 4 verify — admin create/update hardening (static + optional DB rollback smoke).
 * Read-only unless --rollback-smoke (local DB only, creates then verifies rollback path).
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function isLocalDatabaseUrl(url) {
  const s = String(url || '').toLowerCase();
  return s.includes('127.0.0.1') || s.includes('localhost');
}

function staticSourceChecks() {
  const adminPath = path.join(__dirname, '..', 'src', 'routes', 'admin.js');
  const resolvePath = path.join(__dirname, '..', 'src', 'lib', 'testResolve.js');
  const appPath = path.join(__dirname, '..', '..', 'admin-web', 'src', 'App.tsx');
  const adminSrc = fs.readFileSync(adminPath, 'utf8');
  const resolveSrc = fs.readFileSync(resolvePath, 'utf8');
  const appSrc = fs.readFileSync(appPath, 'utf8');

  let ok = line(adminSrc.includes('async function withPgTransaction'), 'admin.js: withPgTransaction helper') && true;
  ok = line(
    adminSrc.includes('await withPgTransaction(async (client) => {') &&
      adminSrc.includes('await regenerateTestFromSubcategoryPool(createdRow.id, { client })'),
    'admin.js: POST /tests uses transaction + in-tx pool regenerate',
  ) && ok;
  ok = line(
    adminSrc.includes('FOR UPDATE') &&
      adminSrc.includes('await regenerateTestFromSubcategoryPool(rows[0].id, { client })'),
    'admin.js: PATCH /tests publish path uses FOR UPDATE transaction',
  ) && ok;
  ok = line(
    adminSrc.includes('async function regenerateTestFromSubcategoryPool(testId, options = {})'),
    'admin.js: regenerate accepts optional client (no nested commit when in tx)',
  ) && ok;
  ok = line(
    resolveSrc.includes('OR lower(trim(subcategory)) = lower(trim($1))'),
    'testResolve.js: resolve lookup includes subcategory',
  ) && ok;
  ok = line(
    appSrc.includes('status === 409') && appSrc.includes('Slug updated'),
    'admin-web: duplicate slug auto-suggests new slug on 409',
  ) && ok;
  ok = line(
    appSrc.includes('No test was saved'),
    'admin-web: create 500 shows clear no-save message',
  ) && ok;
  return ok;
}

async function rollbackSmokeTest() {
  if (!process.argv.includes('--rollback-smoke')) {
    line(true, 'Rollback smoke skipped (pass --rollback-smoke on local DB to enable)');
    return true;
  }
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    return line(false, '--rollback-smoke refused: DATABASE_URL is not local');
  }

  const { pool } = require('../src/db');
  const slug = `phase4-smoke-${Date.now()}`;
  const title = `Phase4 Smoke ${Date.now()}`;
  let ok = true;

  try {
    await pool.query('BEGIN');
    await pool.query(
      `INSERT INTO tests (slug, title, subcategory, duration_minutes, question_count, test_kind, is_published)
       VALUES ($1, $2, $3, 60, 5, 'mock', false)`,
      [slug, title, 'Phase4Smoke'],
    );
    await pool.query('ROLLBACK');
    const stillThere = await pool.query(`SELECT id FROM tests WHERE slug = $1 LIMIT 1`, [slug]);
    ok = line(stillThere.rows.length === 0, 'Rollback smoke: INSERT rolled back (no orphan row)') && ok;
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    ok = line(false, `Rollback smoke error: ${e.message}`) && ok;
  }
  await pool.end().catch(() => {});
  return ok;
}

async function main() {
  let ok = staticSourceChecks();
  ok = await rollbackSmokeTest() && ok;
  if (!ok) {
    console.error('\nPhase 4 verify FAILED');
    process.exit(1);
  }
  console.log('\nPhase 4 verify PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
