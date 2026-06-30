package com.freemocktest.app.util

import kotlin.math.max
import kotlin.math.round

data class ExamScoreResult(
    val scoreMarks: Double,
    val maxMarks: Double,
    val marksPerCorrect: Double,
    val penaltyPerWrong: Double,
    val negativeMarkingEnabled: Boolean,
)

object ExamScoringUtils {
    fun parseNegativeMarkingFraction(text: String?): Double {
        val raw = text?.trim()?.lowercase().orEmpty()
        if (raw.isBlank() || raw == "no" || raw == "none" || raw == "false" || raw == "0" || raw == "0.0") {
            return 0.0
        }
        if (raw.contains('/')) {
            val parts = raw.removePrefix("-").split('/')
            if (parts.size == 2) {
                val a = parts[0].trim().toDoubleOrNull()
                val b = parts[1].trim().toDoubleOrNull()
                if (a != null && b != null && b > 0.0) return kotlin.math.abs(a / b)
            }
        }
        if (raw.contains(':')) {
            val parts = raw.removePrefix("-").split(':')
            if (parts.size == 2) {
                val a = parts[0].trim().toDoubleOrNull()
                val b = parts[1].trim().toDoubleOrNull()
                if (a != null && b != null && b > 0.0) return kotlin.math.abs(a / b)
            }
        }
        val num = raw.removePrefix("+").toDoubleOrNull() ?: return 0.0
        return max(0.0, kotlin.math.abs(num))
    }

    fun computeExamScore(
        correct: Int,
        wrong: Int,
        totalQuestions: Int,
        totalMarks: Int,
        negativeMarkingText: String?,
    ): ExamScoreResult {
        val total = max(0, totalQuestions)
        val safeCorrect = max(0, correct)
        val safeWrong = max(0, wrong)
        val configuredMarks = max(0, totalMarks)
        val maxMarks = if (configuredMarks > 0) configuredMarks.toDouble() else total.toDouble()
        val marksPerCorrect = if (total > 0) maxMarks / total else maxMarks
        val penaltyFraction = parseNegativeMarkingFraction(negativeMarkingText)
        val penaltyPerWrong = marksPerCorrect * penaltyFraction
        val rawScore = safeCorrect * marksPerCorrect - safeWrong * penaltyPerWrong
        val scoreMarks = round(max(0.0, rawScore) * 100.0) / 100.0
        return ExamScoreResult(
            scoreMarks = scoreMarks,
            maxMarks = round(maxMarks * 100.0) / 100.0,
            marksPerCorrect = round(marksPerCorrect * 1000.0) / 1000.0,
            penaltyPerWrong = round(penaltyPerWrong * 1000.0) / 1000.0,
            negativeMarkingEnabled = penaltyFraction > 0.0,
        )
    }
}
