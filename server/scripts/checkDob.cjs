const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/checkDob.cjs <email>');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      'SELECT id, email, is_admin, date_of_birth, updated_at FROM users WHERE email = $1',
      [String(email).trim()],
    );
    console.log(r.rows);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAILED:', e && e.message ? e.message : e);
  process.exit(1);
});

