'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const sql = `
ALTER TABLE user_one_time_tokens
DROP CONSTRAINT IF EXISTS user_one_time_tokens_purpose_check;

ALTER TABLE user_one_time_tokens
ADD CONSTRAINT user_one_time_tokens_purpose_check
CHECK (
  purpose IN (
    'email_verify',
    'password_reset',
    'phone_verify',
    'admin_password_reset',
    'admin_login'
  )
);
`;

async function main() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing in environment.');
  }
  const pool = new Pool({ connectionString });
  try {
    await pool.query(sql);
    console.log('admin_password_reset purpose constraint fix applied');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('failed to apply admin password reset purpose fix:', error.message);
  process.exitCode = 1;
});

