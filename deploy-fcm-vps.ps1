$ErrorActionPreference = 'Stop'
$hostAddr = '187.127.158.228'
$remoteDir = '/var/www/mocktestapp/server'
$localKey = 'C:\Users\DELL\Downloads\mock-86f57-firebase-adminsdk-fbsvc-f2f7088719.json'
$localScript = 'C:\Users\DELL\Desktop\mocktestapp\server\scripts\applyFcmEnv.js'

if (-not (Test-Path $localKey)) {
  Write-Host 'JSON not found:' $localKey
  Write-Host 'Download from Firebase -> Service accounts -> Generate new private key'
  exit 1
}

Write-Host 'Step 1/3: Upload JSON + script (enter VPS password when asked)...'
scp $localKey "root@${hostAddr}:${remoteDir}/fcm-key.json"
scp $localScript "root@${hostAddr}:${remoteDir}/scripts/applyFcmEnv.js"

Write-Host 'Step 2/3: Update .env on VPS (password again if asked)...'
ssh "root@${hostAddr}" "cd ${remoteDir} && node scripts/applyFcmEnv.js fcm-key.json && rm -f fcm-key.json && grep '^FCM_PROJECT_ID=' .env && grep '^FCM_SERVICE_ACCOUNT_JSON=' .env | head -c 55"

Write-Host 'Step 3/3: Restart API...'
ssh "root@${hostAddr}" 'pm2 restart mocktest-api --update-env && pm2 status mocktest-api'

Write-Host 'Done. Now: phone login -> Admin -> Send push.'
