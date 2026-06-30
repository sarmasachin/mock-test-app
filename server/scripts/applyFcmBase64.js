'use strict';

const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '..');
const envPath = path.join(serverDir, '.env');
const base64Arg = String(process.argv[2] || '').trim();

if (!base64Arg) {
  console.error('Usage: node scripts/applyFcmBase64.js <base64-string>');
  console.error('Tip: paste the full base64 line from fcm-base64.txt (no spaces).');
  process.exit(1);
}

let rawJson = '';
try {
  rawJson = Buffer.from(base64Arg, 'base64').toString('utf8');
} catch (e) {
  console.error('FAIL: invalid base64 input');
  process.exit(1);
}

let j;
try {
  j = JSON.parse(rawJson);
} catch (e) {
  console.error('FAIL: decoded text is not valid JSON:', e.message);
  process.exit(1);
}

if (String(j.type || '') !== 'service_account' || !j.private_key || !j.client_email) {
  console.error('FAIL: not a Firebase service account JSON');
  process.exit(1);
}

const line = 'FCM_SERVICE_ACCOUNT_JSON=' + JSON.stringify(j);
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
env = env.replace(/^FCM_PROJECT_ID=.*\n?/m, '');
env = env.replace(/^FCM_SERVICE_ACCOUNT_JSON=.*\n?/m, '');
if (env.length > 0 && env.slice(-1) !== '\n') env += '\n';
env += 'FCM_PROJECT_ID=' + String(j.project_id || '').trim() + '\n' + line + '\n';
fs.writeFileSync(envPath, env);
console.log('OK: .env updated with FCM_PROJECT_ID=' + String(j.project_id || '').trim());
