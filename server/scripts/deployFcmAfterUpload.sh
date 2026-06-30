#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
KEY="fcm-key.json"

if [[ ! -f "$KEY" ]]; then
  echo "FAIL: $KEY not found in $(pwd)"
  echo "Upload fcm-key-upload.json from Desktop to this folder, then rename to fcm-key.json"
  exit 1
fi

node scripts/applyFcmEnv.js "$KEY"
rm -f "$KEY"
node scripts/verifyFcmEnv.js
pm2 restart mocktest-api --update-env
echo "DONE: FCM configured and API restarted."
