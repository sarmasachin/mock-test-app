-- MockTestApp — MySQL 8+ initial schema (multi-user)
-- Run as: mysql -u root -p < 001_init.sql
-- Or: mysql -u root -p -e "CREATE DATABASE mocktestapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
--      mysql -u root -p mocktestapp < 001_init.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS mocktestapp
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE mocktestapp;

CREATE TABLE IF NOT EXISTS users (
    id                      CHAR(36) NOT NULL,
    email                   VARCHAR(320) NOT NULL,
    email_normalized        VARCHAR(320) AS (lower(trim(email))) STORED,
    password_hash           VARCHAR(255) NOT NULL,
    display_name            VARCHAR(120) NOT NULL DEFAULT '',
    phone                   VARCHAR(20) NOT NULL DEFAULT '',
    six_digit_public_id     INT NOT NULL,
    email_verified_at       DATETIME(6) NULL,
    phone_verified_at       DATETIME(6) NULL,
    created_at              DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    updated_at              DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)) ON UPDATE UTC_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email_normalized (email_normalized),
    UNIQUE KEY uq_users_six_digit (six_digit_public_id),
    CONSTRAINT chk_six_digit CHECK (six_digit_public_id BETWEEN 100000 AND 999999),
    CONSTRAINT chk_phone CHECK (phone = '' OR phone REGEXP '^[0-9]{10}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_created_at ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS test_attempts (
    id                  BIGINT NOT NULL AUTO_INCREMENT,
    user_id             CHAR(36) NOT NULL,
    test_name           VARCHAR(512) NOT NULL,
    correct             INT NOT NULL,
    total               INT NOT NULL,
    completed_at        DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    PRIMARY KEY (id),
    CONSTRAINT fk_test_attempts_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_correct_nonneg CHECK (correct >= 0),
    CONSTRAINT chk_total_positive CHECK (total > 0),
    CONSTRAINT chk_correct_lte_total CHECK (correct <= total)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_test_attempts_user_completed ON test_attempts (user_id, completed_at DESC);
CREATE INDEX idx_test_attempts_user_test ON test_attempts (user_id, test_name(191));

SET FOREIGN_KEY_CHECKS = 1;
