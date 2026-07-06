'use strict';
/**
 * Phase 3 local admin-data helper — AUDIT by default; writes only with explicit flags.
 *
 * Usage:
 *   node scripts/fixPhase3LocalTestData.js              # audit only (safe)
 *   node scripts/fixPhase3LocalTestData.js --apply      # local DB only, fix capacity=0
 *
 * Never run --apply against production DATABASE_URL.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { pool } = require('../src/db');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function isLocalDatabaseUrl(url) {
  const s = String(url || '').toLowerCase();
  return s.includes('127.0.0.1') || s.includes('localhost');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dbUrl = process.env.DATABASE_URL || '';
  if (apply && !isLocalDatabaseUrl(dbUrl)) {
    console.error('Refusing --apply: DATABASE_URL is not local (127.0.0.1/localhost).');
    process.exit(1);
  }

  const { rows } = await pool.query(
    `SELECT id, title, subcategory, capacity_total, is_published
     FROM tests
     WHERE is_published = true
     ORDER BY title`,
  );

  let ok = true;
  const capacityFixIds = [];
  const missingSub = [];

  for (const row of rows) {
    const title = String(row.title || '');
    const sub = String(row.subcategory || '').trim();
    const cap = Math.max(0, Number(row.capacity_total || 0));
    if (!sub) missingSub.push({ id: row.id, title });
    if (cap <= 0) capacityFixIds.push({ id: row.id, title });
  }

  if (missingSub.length > 0) {
    ok = line(false, `${missingSub.length} published test(s) missing subcategory (fix in admin panel):`) && ok;
    for (const t of missingSub) {
      console.log(`     - ${t.title} (${t.id}) → set Subcategory to match exam category (e.g. Patwari, Math)`);
    }
  } else {
    ok = line(true, 'All published tests have subcategory') && ok;
  }

  if (capacityFixIds.length > 0) {
    ok = line(false, `${capacityFixIds.length} published test(s) have capacity_total=0:`) && ok;
    for (const t of capacityFixIds) {
      console.log(`     - ${t.title} (${t.id})`);
    }
    if (apply) {
      for (const t of capacityFixIds) {
        await pool.query(
          `UPDATE tests SET capacity_total = 100, updated_at = now()
           WHERE id = $1::uuid AND capacity_total = 0`,
          [t.id],
        );
        line(true, `Updated capacity_total=100 for "${t.title}"`);
      }
    } else {
      console.log('     Run with --apply on LOCAL DB to set capacity_total=100 for these rows.');
    }
  } else {
    ok = line(true, 'All published tests have capacity_total > 0') && ok;
  }

  await pool.end().catch(() => {});

  if (!ok && !apply) {
    console.log('\nAudit complete (no writes). Fix subcategory in admin; optional --apply for local capacity.');
    process.exit(1);
  }
  if (!ok && apply) {
    console.error('\nSome issues remain (subcategory must be set manually in admin).');
    process.exit(1);
  }
  console.log('\nPhase 3 local data audit/fix complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
