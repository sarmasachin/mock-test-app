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
  Body: { "testName", "correct", "total", "completedAtMillis"?, "testCatalogId"? (UUID) }

GET /v1/news?feedKind=news|job|exam&limit=30&offset=0   (public, no auth)
GET /v1/news/:articleId                                 (public)

GET /v1/tests?subcategory=...&testKind=mock|quiz&limit=40   (public)

GET /health

Android emulator uses base URL http://10.0.2.2:3000/v1/ (see app build.gradle.kts).
Physical device: set mocktest.apiBaseUrl in project local.properties, e.g.
  mocktest.apiBaseUrl=http://192.168.1.10:3000/v1/
