'use strict';

const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '..');
const envPath = path.join(serverDir, '.env');

if (!fs.existsSync(envPath)) {
  console.error('FAIL: missing', envPath);
  process.exit(1);
}

require('dotenv').config({ path: envPath });
const fromFile = require('dotenv').parse(fs.readFileSync(envPath, 'utf8'));

if (fromFile.FCM_PROJECT_ID) process.env.FCM_PROJECT_ID = fromFile.FCM_PROJECT_ID;
if (fromFile.FCM_SERVICE_ACCOUNT_JSON) {
  process.env.FCM_SERVICE_ACCOUNT_JSON = fromFile.FCM_SERVICE_ACCOUNT_JSON;
}

const projectId = String(process.env.FCM_PROJECT_ID || '').trim();
const raw = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim();

console.log('env file:', envPath);
console.log('FCM_PROJECT_ID:', projectId || '(empty)');
console.log('FCM_SERVICE_ACCOUNT_JSON chars:', raw.length);

if (!projectId) {
  console.error('FAIL: FCM_PROJECT_ID missing in server/.env');
  process.exit(1);
}
if (!raw) {
  console.error('FAIL: FCM_SERVICE_ACCOUNT_JSON missing in server/.env');
  process.exit(1);
}

function readExpectedAndroidProjectId() {
  const gsPath = path.join(serverDir, '..', 'app', 'google-services.json');
  if (!fs.existsSync(gsPath)) return '';
  try {
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    return String(gs?.project_info?.project_id || '').trim();
  } catch (_e) {
    return '';
  }
}

try {
  const j = JSON.parse(raw);
  if (String(j.type || '') !== 'service_account' || !j.private_key || !j.client_email) {
    console.error('FAIL: JSON is not a Firebase service account');
    process.exit(1);
  }
  const jsonProjectId = String(j.project_id || '').trim();
  if (!jsonProjectId) {
    console.error('FAIL: service account JSON missing project_id');
    process.exit(1);
  }
  if (jsonProjectId !== projectId) {
    console.error(
      'FAIL: FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON project_id mismatch',
      { FCM_PROJECT_ID: projectId, json_project_id: jsonProjectId },
    );
    process.exit(1);
  }
  const androidProjectId = readExpectedAndroidProjectId();
  if (androidProjectId && projectId !== androidProjectId) {
    console.error(
      'FAIL: FCM_PROJECT_ID must match app/google-services.json project_id',
      { FCM_PROJECT_ID: projectId, android_project_id: androidProjectId },
    );
    process.exit(1);
  }
  console.log('JSON parse: OK');
  console.log('client_email:', j.client_email);
  if (androidProjectId) {
    console.log('android project_id match:', androidProjectId);
  }
  console.log('OK: FCM env is valid — restart API if you just fixed .env');
} catch (e) {
  console.error('FAIL: FCM_SERVICE_ACCOUNT_JSON is not valid JSON:', e.message);
  console.error('hint: re-run: node scripts/applyFcmEnv.js path/to-firebase-key.json');
  process.exit(1);
}
