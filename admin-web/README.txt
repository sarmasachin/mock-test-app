MockTestApp Admin Web
=====================

Run
---
1. cd admin-web
2. npm install
3. npm run dev

Environment
-----------
Create .env with:
VITE_API_BASE_URL=http://127.0.0.1:3000/v1

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
