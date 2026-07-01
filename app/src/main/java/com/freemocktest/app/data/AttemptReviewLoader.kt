package com.freemocktest.app.data

import com.freemocktest.app.util.McqScoring

/**
 * Loads question rows for answer key / review using the same delivery order as the user's attempt.
 *
 * Priority (Phase 5):
 * 1. [AppPreferencesRepository.SubmittedAttemptSnapshot] — frozen at quiz submit.
 * 2. Cycle-aware quiz cache ([ContentRepository.loadCachedQuizQuestionsBundleForTest]).
 * 3. Soft network load without forceRefresh (never re-shuffle for post-attempt views).
 */
object AttemptReviewLoader {

    enum class Source {
        SUBMITTED_SNAPSHOT,
        QUIZ_CACHE,
        NETWORK_SOFT,
    }

    data class ReviewRow(
        val title: String,
        val options: List<String>,
        val correctIndex: Int,
        val correctOptionText: String,
        val explanation: String,
        val selectedIndex: Int?,
    ) {
        fun correctAnswerText(): String {
            return McqScoring.resolveCorrectText(options, correctIndex, correctOptionText)
                .ifBlank { "Not available" }
        }

        fun yourAnswerText(): String {
            val idx = selectedIndex ?: return "Not attempted"
            return options.getOrNull(idx)?.trim()?.takeIf { it.isNotBlank() } ?: "Not attempted"
        }

        fun isCorrect(): Boolean {
            val idx = selectedIndex ?: return false
            return McqScoring.isAnswerCorrect(options, correctIndex, correctOptionText, idx)
        }
    }

    data class LoadResult(
        val rows: List<ReviewRow>,
        val source: Source,
    )

    suspend fun load(testName: String, cacheUserScope: String?): LoadResult {
        val safeName = testName.trim().ifBlank { return LoadResult(emptyList(), Source.NETWORK_SOFT) }
        val owner = resolveUserScope(cacheUserScope)

        AppPreferencesRepository.peekSubmittedAttemptSnapshot(owner, safeName)?.let { snap ->
            return LoadResult(
                rows = snap.questions.mapIndexed { index, q ->
                    q.toReviewRow(selectedIndex = snap.answers[index])
                },
                source = Source.SUBMITTED_SNAPSHOT,
            )
        }

        val cached = ContentRepository.loadCachedQuizQuestionsBundleForTest(safeName, cacheUserScope)
        if (cached.items.isNotEmpty()) {
            return LoadResult(
                rows = cached.items.map { it.toReviewRow(selectedIndex = null) },
                source = Source.QUIZ_CACHE,
            )
        }

        val bundle = runCatching {
            ContentRepository.loadQuizQuestionsBundleForTest(
                testName = safeName,
                forceRefresh = false,
                cacheUserScope = cacheUserScope,
            )
        }.getOrElse { ContentRepository.QuizQuestionsCacheBundle(emptyList(), ContentRepository.QuizQuestionsCacheMeta("no_cycle", false, false)) }

        return LoadResult(
            rows = bundle.items.map { it.toReviewRow(selectedIndex = null) },
            source = Source.NETWORK_SOFT,
        )
    }

    private suspend fun resolveUserScope(explicit: String?): String {
        val direct = explicit?.trim().orEmpty()
        if (direct.isNotBlank()) return direct.lowercase(java.util.Locale.US)
        val email = AppPreferencesRepository.peekEditableProfileNow().email.trim()
        if (email.isNotBlank()) return email.lowercase(java.util.Locale.US)
        return "guest"
    }

    private fun AppPreferencesRepository.QuizQuestionSnapshot.toReviewRow(selectedIndex: Int?): ReviewRow {
        val cot = correctOptionText.trim().ifBlank { options.getOrNull(correctIndex).orEmpty() }
        return ReviewRow(
            title = title,
            options = options,
            correctIndex = correctIndex,
            correctOptionText = cot,
            explanation = explanation,
            selectedIndex = selectedIndex,
        )
    }

    private fun ContentRepository.QuizQuestionRemote.toReviewRow(selectedIndex: Int?): ReviewRow {
        val cot = correctOptionText.trim().ifBlank { options.getOrNull(correctIndex).orEmpty() }
        return ReviewRow(
            title = title,
            options = options,
            correctIndex = correctIndex,
            correctOptionText = cot,
            explanation = explanation,
            selectedIndex = selectedIndex,
        )
    }
}
