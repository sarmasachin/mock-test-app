const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

async function httpJson(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_e) {
    json = { _nonJson: text };
  }
  return { status: res.status, json };
}

async function main() {
  const identifier = process.argv[2] || 'sharma.sachinctr@gmail.com';
  const password = process.argv[3] || 'Admin@12345';
  const birthdayDate = process.argv[4] || '1998-03-21';
  const apiBase = (process.env.API_BASE || 'http://127.0.0.1:3000/v1').replace(/\/+$/, '');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('API', apiBase);
  console.log('identifier', identifier);
  console.log('birthdayDate', birthdayDate);

  const login = await httpJson('POST', `${apiBase}/auth/login`, { identifier, password });
  console.log('login.status', login.status);
  if (login.status !== 200) {
    console.log('login.body', login.json);
    process.exit(1);
  }
  const accessToken = String(login.json?.accessToken || '');
  const userId = String(login.json?.user?.id || '');
  if (!accessToken || !userId) {
    console.log('login.missing', { accessToken: Boolean(accessToken), userId: Boolean(userId) });
    process.exit(1);
  }

  const beforeDb = await pool.query('SELECT id, email, date_of_birth FROM users WHERE id = $1::uuid', [userId]);
  console.log('db.before', beforeDb.rows[0]);

  const patch = await httpJson(
    'PATCH',
    `${apiBase}/me/profile`,
    { birthdayDate },
    { Authorization: `Bearer ${accessToken}` },
  );
  console.log('patch.status', patch.status);
  console.log('patch.body.user.birthdayDate', patch.json?.user?.birthdayDate);
  if (patch.status !== 200) {
    console.log('patch.body', patch.json);
    process.exit(1);
  }

  const me = await httpJson('GET', `${apiBase}/me`, undefined, { Authorization: `Bearer ${accessToken}` });
  console.log('me.status', me.status);
  console.log('me.body.user.birthdayDate', me.json?.user?.birthdayDate);

  const afterDb = await pool.query('SELECT id, email, date_of_birth FROM users WHERE id = $1::uuid', [userId]);
  console.log('db.after', afterDb.rows[0]);

  await pool.end();
}

main().catch((e) => {
  console.error('FATAL', e && e.message ? e.message : e);
  process.exit(1);
});

