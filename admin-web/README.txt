MockTestApp Admin Web
=====================

Live admin panel (production)
-----------------------------
Public URL: https://indiaapk.com/admin/
(Vite is built with base path `/admin/` — deploy the `dist/` output so nginx (or your host) serves it under `/admin/`.)

Run
---
1. cd admin-web
2. npm install
3. npm run dev

Environment
-----------
Create .env with:
VITE_API_BASE_URL=http://127.0.0.1:3000/v1

Production build (.env.production) example:
VITE_API_BASE_URL=https://indiaapk.com/v1
(or your real API base; must match where `/v1` is exposed)

If you omit VITE_API_BASE_URL in production, the admin bundle still defaults to https://indiaapk.com/v1
(same as Android release default in app/build.gradle.kts) so you do not accidentally hit a second host.

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
