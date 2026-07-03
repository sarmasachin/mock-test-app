MockTestApp Admin Web
=====================

Live admin panel (production)
-----------------------------
Public URL: https://admin-admin.govmocktest.com/admin/
(Vite is built with base path `/admin/` — deploy dist/ to /var/www/admin-admin.govmocktest.com/site/admin/ — see deploy/DEPLOY.txt)

Run
---
1. cd admin-web
2. npm install
3. npm run dev

Environment
-----------
Create .env with:
VITE_API_BASE_URL=http://127.0.0.1:3000/v1

Production build (.env.production):
VITE_API_BASE_URL=https://admin-admin.govmocktest.com/v1

If you omit VITE_API_BASE_URL in production, App.tsx defaults to the same URL (see DEFAULT_PRODUCTION_API_BASE).

Login
-----
- Use existing /v1/auth/login credentials.
- Only users with users.is_admin = true can access admin APIs.

Main tabs
---------
- Dashboard summary
- Leaderboard (weekly)
- Tests (list + create)
- Articles (list + create)
