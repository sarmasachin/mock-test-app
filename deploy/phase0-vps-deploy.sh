#!/usr/bin/env bash
# Phase 0 — Exam categories fix deploy (run ON VPS as root or deploy user)
# Usage: bash phase0-vps-deploy.sh
set -euo pipefail

APP_DIR="/var/www/mocktestapp"
ADMIN_SITE="/var/www/admin-admin.govmocktest.com/site/admin"

echo "==> Phase 0: pull server fix"
cd "$APP_DIR"
git fetch origin main
git checkout main
git pull origin main
test -f server/src/routes/admin.js
grep -q 'validateExamCategoriesPatch' server/src/routes/admin.js
grep -q 'confirmClearExamCategories' server/src/routes/admin.js
echo "OK  server patch present"

echo "==> Install server deps (if needed) and restart API"
cd "$APP_DIR/server"
npm install --omit=dev 2>/dev/null || npm install
pm2 restart mocktest-api
sleep 2
pm2 status mocktest-api
curl -sf "http://127.0.0.1:3000/health" >/dev/null && echo "OK  API health" || echo "WARN  check /health manually"

echo "==> Build admin-web on VPS"
cd "$APP_DIR/admin-web"
echo 'VITE_API_BASE_URL=https://admin-admin.govmocktest.com/v1' > .env.production
npm install
npm run build
test -d dist

echo "==> Deploy admin static"
mkdir -p "$ADMIN_SITE"
cp -r dist/* "$ADMIN_SITE/"
echo "OK  admin static copied to $ADMIN_SITE"

echo "==> Reload nginx"
nginx -t
systemctl reload nginx

echo ""
echo "PHASE0_DEPLOY_OK"
echo "Verify: admin panel Exam Categories -> add row -> Save -> success toast -> reload persists"
echo "Verify: PATCH empty categories without confirm returns HTTP 409 (server guard)"
