'use strict';

const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { sha256Hex, randomRefreshToken } = require('../cryptoUtil');

const ACCESS_TTL = () => parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '86400', 10);
const REFRESH_DAYS = () => parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '14', 10);

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL() });
}

async function insertRefreshSession(client, userId, plainRefresh) {
  const hash = sha256Hex(plainRefresh);
  const expires = new Date();
  expires.setDate(expires.getDate() + REFRESH_DAYS());
  await client.query(
    `INSERT INTO user_refresh_sessions (user_id, refresh_token_hash, expires_at)
     VALUES ($1::uuid, $2, $3)`,
    [userId, hash, expires.toISOString()],
  );
}

async function issueTokens(userId) {
  const accessToken = signAccessToken(userId);
  const refreshToken = randomRefreshToken();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertRefreshSession(client, userId, refreshToken);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { accessToken, refreshToken, expiresInSeconds: ACCESS_TTL() };
}

module.exports = {
  ACCESS_TTL,
  REFRESH_DAYS,
  signAccessToken,
  insertRefreshSession,
  issueTokens,
};
