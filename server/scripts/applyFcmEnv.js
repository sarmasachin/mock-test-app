'use strict';

const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '..');
const keyPath = process.argv[2] || path.join(serverDir, 'fcm-key.json');
const envPath = path.join(serverDir, '.env');

function readKeyText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
}

function parseFirebaseServiceAccount(raw) {
  try {
    return JSON.parse(raw);
  } catch (firstErr) {
    // Hostinger / editor uploads often turn private_key \n escapes into real newlines.
    const repaired = raw.replace(
      /("private_key"\s*:\s*")([\s\S]*?)("\s*,\s*"client_email")/,
      (_match, prefix, keyBody, suffix) => {
        let body = keyBody;
        if (!body.includes('\\n') && body.includes('\n')) {
          body = body.replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
        }
        return prefix + body + suffix;
      },
    );
    try {
      return JSON.parse(repaired);
    } catch (_secondErr) {
      console.error('FAIL: Firebase JSON is invalid:', firstErr.message);
      console.error('hint: re-upload the original file from Downloads without opening in Notepad.');
      process.exit(1);
    }
  }
}

if (!fs.existsSync(keyPath)) {
  console.error('Missing key file:', keyPath);
  process.exit(1);
}

const j = parseFirebaseServiceAccount(readKeyText(keyPath));
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
console.log('OK: .env updated with FCM_PROJECT_ID=' + String(j.project_id || '').trim());
