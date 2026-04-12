-- MockTestApp — news / job / exam feeds, test & quiz catalog, questions, bookmarks
-- Depends on: 001_init.sql (users, test_attempts, set_updated_at)
-- Run after 001: psql ... -f 002_feeds_tests_quizzes.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Feeds (maps ManualNewsItem + FeedKind: news | job | exam)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_articles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_kind           TEXT NOT NULL CHECK (feed_kind IN ('news', 'job', 'exam')),
    external_id         VARCHAR(64),
    headline            VARCHAR(512) NOT NULL,
    summary             TEXT NOT NULL DEFAULT '',
    category            VARCHAR(120) NOT NULL DEFAULT '',
    body                TEXT NOT NULL DEFAULT '',
    link_url            TEXT,
    published_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_published        BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_news_articles_kind_external
    ON news_articles (feed_kind, external_id)
    WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_articles_kind_published
    ON news_articles (feed_kind, published_at DESC)
    WHERE is_published;

DROP TRIGGER IF EXISTS trg_news_articles_updated_at ON news_articles;
CREATE TRIGGER trg_news_articles_updated_at
    BEFORE UPDATE ON news_articles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_news_bookmarks (
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    article_id      UUID NOT NULL REFERENCES news_articles (id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_user_news_bookmarks_user ON user_news_bookmarks (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Mock tests & quizzes — catalog + MCQs (QuizScreenNew / TestsScreenNew)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                VARCHAR(160) NOT NULL,
    title               VARCHAR(512) NOT NULL,
    subcategory         VARCHAR(200) NOT NULL DEFAULT '',
    meta_line           VARCHAR(200) NOT NULL DEFAULT '',
    duration_minutes    INTEGER NOT NULL DEFAULT 12,
    question_count      INTEGER NOT NULL DEFAULT 10,
    test_kind           TEXT NOT NULL CHECK (test_kind IN ('mock', 'quiz')),
    is_published        BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tests_slug_unique UNIQUE (slug),
    CONSTRAINT tests_duration_positive CHECK (duration_minutes > 0),
    CONSTRAINT tests_question_count_positive CHECK (question_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_tests_kind_published ON tests (test_kind, is_published);

DROP TRIGGER IF EXISTS trg_tests_updated_at ON tests;
CREATE TRIGGER trg_tests_updated_at
    BEFORE UPDATE ON tests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS questions (
    id                  BIGSERIAL PRIMARY KEY,
    test_id             UUID NOT NULL REFERENCES tests (id) ON DELETE CASCADE,
    position            INTEGER NOT NULL,
    stem                TEXT NOT NULL,
    choice_a            TEXT NOT NULL,
    choice_b            TEXT NOT NULL,
    choice_c            TEXT NOT NULL,
    choice_d            TEXT NOT NULL,
    correct_index       SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
    explanation         TEXT NOT NULL DEFAULT '',
    CONSTRAINT questions_test_position_unique UNIQUE (test_id, position),
    CONSTRAINT questions_position_positive CHECK (position > 0)
);

CREATE INDEX IF NOT EXISTS idx_questions_test ON questions (test_id, position);

-- Link finished attempts to catalog row when known (test_name still kept for display / legacy)
ALTER TABLE test_attempts
    ADD COLUMN IF NOT EXISTS test_catalog_id UUID REFERENCES tests (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_test_attempts_catalog ON test_attempts (test_catalog_id);

COMMIT;
