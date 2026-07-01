package com.freemocktest.app.util

/**
 * Phase 1 design lock — documentation only; no runtime logic here.
 *
 * Full specification: repo root [SHUFFLE_AND_ATTEMPT_RULES.txt] (sibling of `app/` and `server/`).
 *
 * ## Admin source of truth
 * - Question Builder stores four option strings + [correctIndex] 0=A … 3=D.
 * - The correct **text** admin chose is what must stay correct after any shuffle.
 *
 * ## shuffleQuestions / shuffleOptions (per-test advancedConfig)
 * - **shuffleQuestions**: permute question sequence (within subject buckets when sections exist).
 * - **shuffleOptions**: permute all four option texts per question; remap [correctIndex].
 * - Flags are independent; either, both, or neither may be enabled.
 *
 * ## Catalog cycle vs attempt vs resume
 * - **New cycle** ([tests.last_cycle_started_at] changes, user re-applies): new server shuffle seed
 *   → new question/option order. Previous cycle order must not repeat.
 * - **Attempt** ([attemptsAllowed] per test id, default 1): scored tries within a cycle; same cycle
 *   shares the same delivery seed (second allowed try keeps same order).
 * - **Resume** (in-progress timer): freezes exact [options] + [correctIndex] + correctOptionText
 *   in [InProgressQuizState.questionsSnapshot] — no re-shuffle on resume (Phase 4).
 *
 * ## Scoring
 * - [McqScoring] compares selected option text to admin correct text (not screen letter).
 *
 * ## Post-attempt views (Phase 5)
 * - [AttemptReviewLoader]: submitted snapshot → cycle cache → soft load (never forceRefresh).
 * - [SubmittedAttemptSnapshot] saved at quiz submit with user answer indices.
 *
 * @see TestAttemptPolicy for client-side attempt/cooldown checks
 */
object ShuffleAttemptRules
