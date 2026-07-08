'use strict';

/**
 * Normalize SMTP / MAIL_FROM lines in server/.env (one KEY=value per line).
 *
 * Fixes the common mistake of pasting:
 *   SMTP_HOST=... SMTP_PORT=587 SMTP_USER=...   (all on one line)
 * which dotenv cannot parse — only SMTP_HOST gets a value.
 *
 * Usage (from server/):
 *   node scripts/applySmtpEnv.js
 *   SMTP_PASS='Commingsoon@123' node scripts/applySmtpEnv.js
 *   npm run fix:smtp-env
 *
 * Optional env overrides (only applied when set):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
 *   MAIL_FROM, MAIL_ADMIN_PANEL_URL
 */

const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '..');
const envPath = path.join(serverDir, '.env');

const MANAGED_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'MAIL_ADMIN_PANEL_URL',
];

const DEFAULTS = {
  SMTP_HOST: 'smtp.hostinger.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'no-reply@govmocktest.com',
  MAIL_FROM: 'Gov Mock Test <no-reply@govmocktest.com>',
  MAIL_ADMIN_PANEL_URL: 'https://admin-admin.govmocktest.com/admin',
};

function stripQuotes(value) {
  const v = String(value || '').trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/** Parse KEY=value segments even when several are space-joined on one line. */
function parseMashedAssignments(text) {
  const found = {};
  const flat = String(text || '').replace(/\r\n/g, '\n').replace(/\n/g, ' ').trim();
  if (!flat) return found;

  const segments = flat.split(/\s+(?=[A-Z][A-Z0-9_]+=)/);
  for (const seg of segments) {
    const eq = seg.indexOf('=');
    if (eq <= 0) continue;
    const key = seg.slice(0, eq).trim().toUpperCase();
    if (!MANAGED_KEYS.includes(key)) continue;
    found[key] = stripQuotes(seg.slice(eq + 1).trim());
  }

  return found;
}

function lineContainsManagedKey(line) {
  return MANAGED_KEYS.some((key) => new RegExp(`(?:^|\\s)${key}=`, 'i').test(line));
}

function buildManagedBlock(values) {
  const lines = [];
  for (const key of MANAGED_KEYS) {
    const fromEnv = String(process.env[key] || '').trim();
    const val = fromEnv || values[key] || DEFAULTS[key] || '';
    if (!val && key === 'SMTP_PASS') continue;
    if (!val) continue;
    lines.push(`${key}=${val}`);
  }
  return lines;
}

function main() {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const parsed = parseMashedAssignments(existing);

  const kept = existing
    .split('\n')
    .filter((line) => !lineContainsManagedKey(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  const block = buildManagedBlock(parsed);
  if (!block.length) {
    console.error('FAIL: no SMTP lines to write. Set SMTP_PASS in env or .env first.');
    process.exit(1);
  }

  let next = kept;
  if (next.length > 0) next += '\n';
  next += `${block.join('\n')}\n`;

  fs.writeFileSync(envPath, next, 'utf8');

  console.log('OK: server/.env SMTP block normalized (one variable per line):');
  for (const line of block) {
    if (line.startsWith('SMTP_PASS=')) {
      console.log('SMTP_PASS=***');
    } else {
      console.log(line);
    }
  }
  console.log('Next: pm2 delete mocktest-api && pm2 start src/index.js --name mocktest-api --cwd /var/www/mocktestapp/server && pm2 save');
}

main();
