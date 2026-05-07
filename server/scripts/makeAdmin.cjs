const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
  const mode = process.argv[2];
  const identifier = process.argv[3];
  const newPass = process.argv[4];
  if (!mode || !identifier || (mode !== '--find' && !newPass)) {
    console.error('Usage:');
    console.error('  node scripts/makeAdmin.cjs --find <emailOrPhoneFragment>');
    console.error('  node scripts/makeAdmin.cjs --set <exactEmail> <newPassword>');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in server/.env');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (mode === '--find') {
      const q = String(identifier).trim();
      const u = await client.query(
        `SELECT id, email, phone, is_admin, is_banned
           FROM users
          WHERE (email ILIKE $1 OR phone ILIKE $1)
          ORDER BY created_at DESC
          LIMIT 10`,
        [`%${q}%`],
      );
      await client.query('COMMIT');
      console.log(u.rows);
      return;
    }

    const email = String(identifier).trim();
    const u = await client.query('SELECT id, email, phone, is_admin FROM users WHERE email = $1', [email]);
    if (!u.rows[0]) throw new Error(`User not found: ${email}`);
    const hash = await bcrypt.hash(String(newPass), 10);
    await client.query('UPDATE users SET is_admin = true, password_hash = $1 WHERE id = $2', [hash, u.rows[0].id]);
    await client.query('COMMIT');
    console.log(`OK: is_admin=true + password reset for ${email}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('FAILED:', e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FATAL:', e && e.message ? e.message : e);
  process.exit(1);
});

