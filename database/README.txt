MockTestApp — PostgreSQL (production database)
==============================================

Stack: use PostgreSQL only for this app. The MySQL folder is not kept in sync
with 002/003; use PostgreSQL for a full schema.

What postgres/*.sql creates (run in order: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013)
----------------------------------------------------------------
001_init.sql
  - users: unique case-insensitive email (email_normalized), password_hash,
    display_name, phone, six_digit_public_id (100000–999999, unique),
    verification timestamps, created_at / updated_at (trigger).
  - test_attempts: test_name, correct, total, completed_at, FK user_id CASCADE.
  - set_updated_at(): shared trigger helper.

002_feeds_tests_quizzes.sql
  - news_articles: feed_kind news|job|exam (matches FeedKind + ManualNewsItem).
  - user_news_bookmarks.
  - tests + questions (mock|quiz catalog, MCQs).
  - test_attempts.test_catalog_id → tests (optional).

003_sessions_tokens_stats.sql
  - attempt_question_responses: per-question answers (needs test_catalog_id).
  - user_refresh_sessions: refresh token hash + expiry + revoke.
  - user_one_time_tokens: email_verify | password_reset | phone_verify (hashes).
  - user_app_preferences: streak, digest day, last test, cached feed URLs
    (DataStore-equivalent for server sync).
  - user_achievements: unlocked badge slugs per user.
  - user_stats: totals + best % + points (leaderboard-oriented); auto-updated
    on each INSERT into test_attempts.
  - user_devices: FCM token per device (unique token).
  - Triggers: new user → default prefs + stats rows; validate attempt/question
    test match.

004_user_signup_region.sql
  - users.signup_state, users.signup_district (from app registration form).
  - Partial unique index on phone when non-empty (mobile login).

005_seed_qa_login.sql (optional)
  - Dev-only QA user for device testing.

006_google_sub.sql
  - users.google_sub (Google account id) + unique index for Sign-In with Google.

007_leaderboard_indexes.sql
  - Indexes for leaderboard filters/sorting (time range, testCatalogId, city/state).

008_admin_role.sql
  - users.is_admin flag + index for admin-only API access.

009_seed_default_admin.sql
  - Creates/updates default admin user for local fresh setup.

010_super_admin_role.sql
  - Adds users.is_super_admin flag + index for super-admin-only controls.

011_daily_digest_content.sql
  - Adds Daily Digest store for Question of the Day + Fact of the Day.

012_admin_controls.sql
  - Adds app_settings table, admin_audit_logs table, and user soft-ban fields.

013_admin_password_reset_token_purpose.sql
  - Expands user_one_time_tokens purpose CHECK to include admin_password_reset.

Quick local database (Docker)
-----------------------------
From the database/ folder:

  docker compose up -d

First container start runs every .sql in postgres/ in alphabetical order
(001 … 004). Change POSTGRES_PASSWORD in docker-compose.yml before sharing
the machine or going beyond local dev.

If you already had an older volume, either run missing files by hand:

  psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/002_feeds_tests_quizzes.sql
  psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/003_sessions_tokens_stats.sql

or reset the volume once:

  docker compose down -v && docker compose up -d

JDBC / connection URL (example):

  jdbc:postgresql://127.0.0.1:5432/mocktestapp?user=mocktestapp_rw&password=CHANGE_ME&sslmode=disable

Use sslmode=require (or verify-full) against real hosts (RDS, Neon, Supabase,
etc.).

Manual install (no Docker)
--------------------------
1. PostgreSQL 14+.
2. Apply all migrations in order:

   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/001_init.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/002_feeds_tests_quizzes.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/003_sessions_tokens_stats.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/004_user_signup_region.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/005_seed_qa_login.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/006_google_sub.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/007_leaderboard_indexes.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/008_admin_role.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/009_seed_default_admin.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/010_super_admin_role.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/011_daily_digest_content.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/012_admin_controls.sql
   psql -h HOST -U mocktestapp_rw -d mocktestapp -f postgres/013_admin_password_reset_token_purpose.sql

3. Backend rules:
   - password_hash = bcrypt/argon2 only (never store plain passwords).
   - Store only hashes in refresh_token_hash / token_hash (e.g. SHA-256 of random token).
   - On signup, pick six_digit_public_id at random; on unique violation, retry
     inside a transaction.
   - Per-question rows: set test_catalog_id on the attempt, then insert responses.

Going live (short checklist)
----------------------------
- TLS to the database (sslmode=require minimum).
- Dedicated DB user with least privilege; restrict network (security groups).
- Automated backups + occasional restore test.
- Schema is complete for the listed domains; you still wire your API + Android.

What is intentionally out of scope
----------------------------------
- HTTP API code, JWT signing keys, and Android Retrofit/Ktor clients (not SQL).
- CMS admin UI for news/tests (data model is ready; build admin as you like).
- MySQL parity for 002/003 (not maintained).

