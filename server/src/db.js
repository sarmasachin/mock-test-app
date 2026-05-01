'use strict';

const { Pool } = require('pg');

const connectionString = String(process.env.DATABASE_URL || '');
const isRender = String(process.env.RENDER || '').toLowerCase() === 'true';
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const needsSsl =
  process.env.PGSSLMODE === 'require' ||
  connectionString.includes('sslmode=require') ||
  isRender ||
  isProduction;

const poolConfig = {
  connectionString,
  max: Math.max(1, Number(process.env.DB_POOL_MAX || 25)),
  idleTimeoutMillis: Math.max(1000, Number(process.env.DB_IDLE_TIMEOUT_MS || 30000)),
  connectionTimeoutMillis: Math.max(1000, Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000)),
};
if (needsSsl) {
  // Managed Postgres providers (Render/Neon/Supabase/Railway) usually require TLS.
  poolConfig.ssl = { rejectUnauthorized: process.env.PG_REJECT_UNAUTHORIZED !== 'false' };
}

const pool = new Pool(poolConfig);

module.exports = { pool };
