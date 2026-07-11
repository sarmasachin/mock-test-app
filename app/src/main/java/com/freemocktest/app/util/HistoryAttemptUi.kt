package com.freemocktest.app.util

import com.freemocktest.app.data.local.TestAttemptEntity
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Maps persisted mock-test attempts to History result card rows (menu → History).
 */
object HistoryAttemptUi {

    data class ResultCardModel(
        val id: Long,
        val testName: String,
        val dateText: String,
        val timeText: String,
        val scoreText: String,
        val answered: Int,
        val correct: Int,
        val wrong: Int,
        val total: Int,
        val percent: Int,
        val scoreHidden: Boolean,
    )

    data class ProgressSummary(
        val attemptsCount: Int,
        val uniqueTestsCount: Int,
        val bestScoreText: String,
        val lastScoreText: String,
        val avgPercentText: String,
    )

    fun computeProgressSummary(
        attempts: List<TestAttemptEntity>,
        scoreVisible: Boolean,
    ): ProgressSummary {
        if (attempts.isEmpty()) {
            return ProgressSummary(
                attemptsCount = 0,
                uniqueTestsCount = 0,
                bestScoreText = "--",
                lastScoreText = "--",
                avgPercentText = "--",
            )
        }
        val best = attempts.maxWithOrNull(HomeAttemptStatsUtils.compareAttemptsForBest())
        val last = attempts.maxByOrNull { it.completedAtMillis }
        val percents = attempts.map { HomeAttemptStatsUtils.attemptScorePercent(it) }
        val uniqueTests = attempts
            .map { it.testName.trim().lowercase(Locale.US) }
            .filter { it.isNotBlank() }
            .distinct()
            .size
        return ProgressSummary(
            attemptsCount = attempts.size,
            uniqueTestsCount = uniqueTests,
            bestScoreText = if (scoreVisible) {
                best?.let { HomeAttemptStatsUtils.formatHomeAttemptScore(it) } ?: "--"
            } else {
                "-"
            },
            lastScoreText = if (scoreVisible) {
                last?.let { HomeAttemptStatsUtils.formatHomeAttemptScore(it) } ?: "--"
            } else {
                "-"
            },
            avgPercentText = if (scoreVisible && percents.isNotEmpty()) {
                "${percents.average().roundToInt()}%"
            } else {
                "-"
            },
        )
    }

    fun toResultCard(attempt: TestAttemptEntity, scoreVisible: Boolean): ResultCardModel {
        val zone = ZoneId.systemDefault()
        val zoned = Instant.ofEpochMilli(attempt.completedAtMillis).atZone(zone)
        val answered = (attempt.correct + attempt.wrong).coerceAtLeast(0)
        val total = attempt.total.coerceAtLeast(answered).coerceAtLeast(1)
        return ResultCardModel(
            id = attempt.id,
            testName = attempt.testName.trim().ifBlank { "Test" },
            dateText = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH).format(zoned.toLocalDate()),
            timeText = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH).format(zoned.toLocalTime()),
            scoreText = if (scoreVisible) {
                HomeAttemptStatsUtils.formatHomeAttemptScore(attempt)
            } else {
                "-"
            },
            answered = answered,
            correct = attempt.correct.coerceAtLeast(0),
            wrong = attempt.wrong.coerceAtLeast(0),
            total = total,
            percent = if (scoreVisible) HomeAttemptStatsUtils.attemptScorePercent(attempt) else 0,
            scoreHidden = !scoreVisible,
        )
    }
}
