'use strict';

const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '..');
const keyPath = process.argv[2] || path.join(serverDir, 'fcm-key.json');
const envPath = path.join(serverDir, '.env');

if (!fs.existsSync(keyPath)) {
  console.error('Missing key file:', keyPath);
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (String(j.type || '') !== 'service_account' || !j.private_key || !j.client_email) {
  console.error('Not a service account JSON. Use Firebase -> Service accounts -> Generate new private key.');
  process.exit(1);
}

const line = 'FCM_SERVICE_ACCOUNT_JSON=' + JSON.stringify(j);
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
env = env.replace(/^FCM_PROJECT_ID=.*\n?/m, '');
env = env.replace(/^FCM_SERVICE_ACCOUNT_JSON=.*\n?/m, '');
if (env.length > 0 && env.slice(-1) !== '\n') env += '\n';
env += 'FCM_PROJECT_ID=' + String(j.project_id || '').trim() + '\n' + line + '\n';
fs.writeFileSync(envPath, env);
console.log('OK: .env updated with FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON');
