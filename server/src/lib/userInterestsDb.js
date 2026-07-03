'use strict';

const { normalizeInterestSubcategories } = require('./userInterests');

const USER_TEST_INTERESTS_DDL = `
CREATE TABLE IF NOT EXISTS user_test_interests (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subcategory VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, subcategory)
)`;

async function ensureUserTestInterestsTable(pool) {
  await pool.query(USER_TEST_INTERESTS_DDL);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_test_interests_user
     ON user_test_interests (user_id)`,
  );
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function loadUserTestInterests(pool, userId) {
  const { rows } = await pool.query(
    `SELECT subcategory
     FROM user_test_interests
     WHERE user_id = $1::uuid
     ORDER BY subcategory ASC`,
    [userId],
  );
  return normalizeInterestSubcategories((rows || []).map((row) => row.subcategory));
}

/**
 * Replace all interests for a user (atomic).
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {unknown} subcategories
 * @returns {Promise<string[]>}
 */
async function replaceUserTestInterests(pool, userId, subcategories) {
  const normalized = normalizeInterestSubcategories(subcategories);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM user_test_interests WHERE user_id = $1::uuid`, [userId]);
    for (const subcategory of normalized) {
      await client.query(
        `INSERT INTO user_test_interests (user_id, subcategory)
         VALUES ($1::uuid, $2)
         ON CONFLICT (user_id, subcategory) DO NOTHING`,
        [userId, subcategory],
      );
    }
    await client.query('COMMIT');
    return normalized;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  USER_TEST_INTERESTS_DDL,
  ensureUserTestInterestsTable,
  loadUserTestInterests,
  replaceUserTestInterests,
};
