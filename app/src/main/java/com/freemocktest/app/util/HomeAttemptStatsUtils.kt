package com.freemocktest.app.util

import com.freemocktest.app.data.local.TestAttemptEntity
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Home Attempts / Best / Last score display — aligned with Result screen scoring rules.
 */
object HomeAttemptStatsUtils {
    fun formatScoreMarks(value: Double): String {
        return if (value % 1.0 == 0.0) {
            value.toInt().toString()
        } else {
            String.format(Locale.US, "%.2f", value)
        }
    }

    fun isMarksBasedDisplay(attempt: TestAttemptEntity): Boolean =
        attempt.marksBased && attempt.scoreMarks >= 0.0 && attempt.maxMarks > 0.0

    /** Comparable ratio for best-score ranking (marks-based or correct/total). */
    fun attemptScoreRatio(attempt: TestAttemptEntity): Float {
        if (isMarksBasedDisplay(attempt)) {
            return (attempt.scoreMarks / attempt.maxMarks).toFloat()
        }
        return attempt.correct.toFloat() / attempt.total.coerceAtLeast(1).toFloat()
    }

    /** Same display shape as ResultScreenNew score line. */
    fun formatHomeAttemptScore(attempt: TestAttemptEntity): String {
        if (isMarksBasedDisplay(attempt)) {
            return "${formatScoreMarks(attempt.scoreMarks)} / ${formatScoreMarks(attempt.maxMarks)} marks"
        }
        return "${attempt.correct}/${attempt.total.coerceAtLeast(1)}"
    }

    /** 0–100 percent for charts / progress report (marks-aware when stored). */
    fun attemptScorePercent(attempt: TestAttemptEntity): Int =
        (attemptScoreRatio(attempt) * 100f).roundToInt().coerceIn(0, 100)

    fun compareAttemptsForBest(): Comparator<TestAttemptEntity> =
        compareBy<TestAttemptEntity> { attemptScoreRatio(it) }
            .thenBy { it.correct }
            .thenBy { it.completedAtMillis }

    fun computeMarksSnapshot(
        correct: Int,
        wrong: Int,
        totalQuestions: Int,
        totalMarks: Int,
        negativeMarkingText: String?,
    ): AttemptMarksSnapshot {
        val safeTotal = totalQuestions.coerceAtLeast(correct + wrong).coerceAtLeast(1)
        val scored = ExamScoringUtils.computeExamScore(
            correct = correct,
            wrong = wrong,
            totalQuestions = safeTotal,
            totalMarks = totalMarks,
            negativeMarkingText = negativeMarkingText,
        )
        val marksBased = totalMarks > 0 || scored.negativeMarkingEnabled
        return AttemptMarksSnapshot(
            scoreMarks = if (marksBased) scored.scoreMarks else -1.0,
            maxMarks = if (marksBased) scored.maxMarks else -1.0,
            marksBased = marksBased,
        )
    }
}

data class AttemptMarksSnapshot(
    val scoreMarks: Double,
    val maxMarks: Double,
    val marksBased: Boolean,
)
