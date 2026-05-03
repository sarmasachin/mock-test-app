MockTestApp API (Node.js + PostgreSQL)
=====================================

Prerequisites
-------------
- Node.js 18+
- PostgreSQL with migrations 001–004 applied (see ../database/README.txt)

Setup
-----
1. cd server
2. npm install
3. Copy .env.example to .env and set DATABASE_URL and JWT_SECRET (16+ chars).
4. npm run dev   (or npm start)

Email OTP branding (optional)
-----------------------------
- MAIL_BRAND_NAME: brand name shown in OTP emails (default: Free Mock Test App)
- MAIL_LOGO_URL: public HTTPS image URL shown as top circular logo in OTP emails
- MAIL_SUPPORT_EMAIL: support line shown in email footer
- MAIL_SUBJECT_RESET: custom subject for password reset OTP emails
- MAIL_SUBJECT_EMAIL_VERIFY: custom subject for email verification OTP emails

Default URL: http://127.0.0.1:3000

Endpoints (JSON)
------------------
POST /v1/auth/register
  Body: { "displayName", "email", "phone", "password", "state"?, "district"? }
POST /v1/auth/login
  Body: { "identifier": "email or 10-digit mobile", "password" }
POST /v1/auth/refresh
  Body: { "refreshToken" }

GET  /v1/me          Authorization: Bearer <access>
PATCH /v1/me/profile Authorization: Bearer <access>
  Body (any subset): { "displayName"?, "email"?, "phone"? (10 digits) }
  If email_verified_at is set, email cannot be changed to a different address (403).
  Unique email/phone conflict → 409.
PATCH /v1/me/password Authorization: Bearer <access>
  Body: { "currentPassword", "newPassword" } (min length 4 for newPassword)
DELETE /v1/me        Authorization: Bearer <access>   (204 = account removed; cascades related rows)
POST /v1/attempts    Authorization: Bearer <access>
  Body: { "testName", "correct", "total", "testCatalogId" (UUID), "clientSubmissionId", "completedAtMillis"? }
  Notes:
  - testCatalogId and clientSubmissionId are required.
  - Duplicate submit replay with same clientSubmissionId is idempotent (returns same attempt).
  - Endpoint is protected by per-user and global burst limits.

GET /v1/news?feedKind=news|job|exam&limit=30&offset=0   (public, no auth)
GET /v1/news/:articleId                                 (public)
GET /v1/digest/today                                    (public)

GET /v1/tests?subcategory=...&testKind=mock|quiz&limit=40   (public)
GET /v1/leaderboard?range=weekly|monthly|all&testCatalogId=<uuid>&state=<text>&city=<text>&limit=100  (public)
GET /v1/leaderboard/filters   (public)
GET /v1/admin/summary         (admin auth)
GET /v1/admin/tests           (admin auth)
POST /v1/admin/tests          (admin auth)
GET /v1/admin/tests/:id/questions                 (admin auth)
POST /v1/admin/tests/:id/questions                (admin auth)
PATCH /v1/admin/tests/:id/questions/:questionId   (admin auth)
DELETE /v1/admin/tests/:id/questions/:questionId  (admin auth)
GET /v1/admin/digest                               (admin auth)
POST /v1/admin/digest                              (admin auth)
PATCH /v1/admin/digest/:id                         (admin auth)
DELETE /v1/admin/digest/:id                        (admin auth)
GET /v1/admin/articles        (admin auth)
POST /v1/admin/articles       (admin auth)
GET /v1/admin/articles/categories   (admin auth)
PUT /v1/admin/articles/categories   (admin auth)

GET /health

Submit burst protection (Phase-3/4)
-----------------------------------
- ATTEMPT_SUBMIT_WINDOW_MS (default 10000)
- ATTEMPT_SUBMIT_MAX_PER_WINDOW (default 8)
- ATTEMPT_SUBMIT_GLOBAL_MAX_PER_WINDOW (default 500)

DB pool tuning (Phase-2)
------------------------
- DB_POOL_MAX (default 25)
- DB_IDLE_TIMEOUT_MS (default 30000)
- DB_CONNECT_TIMEOUT_MS (default 10000)

Headers from attempts endpoint
------------------------------
- Retry-After: present when 429 is returned
- X-RateLimit-Remaining: remaining per-user quota in current window
- X-Idempotent-Replay: "true" when duplicate submission is replayed safely

Admin role note:
- users.is_admin must be true for /v1/admin/* endpoints.
- users.is_super_admin is required to change admin/super-admin roles from /v1/admin/users/:id/admin.

Android emulator uses base URL http://10.0.2.2:3000/v1/ (see app build.gradle.kts).
Physical device: set mocktest.apiBaseUrl in project local.properties, e.g.
  mocktest.apiBaseUrl=http://192.168.1.10:3000/v1/

