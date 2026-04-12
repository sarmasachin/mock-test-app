'use strict';

const { Pool } = require('pg');

const needsSsl =
  process.env.PGSSLMODE === 'require' || String(process.env.DATABASE_URL || '').includes('sslmode=require');

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
};
if (needsSsl) {
  poolConfig.ssl = { rejectUnauthorized: process.env.PG_REJECT_UNAUTHORIZED !== 'false' };
}

const pool = new Pool(poolConfig);

module.exports = { pool };
