package com.freemocktest.app.util

/**
 * Text-based MCQ scoring per [SHUFFLE_AND_ATTEMPT_RULES.txt] §6.
 *
 * Compares the selected option **text** to the admin correct **text**, not screen letter.
 * Index fallback is used only when correct text cannot be resolved.
 */
object McqScoring {

    fun isAnswerCorrect(
        options: List<String>,
        correctIndex: Int,
        correctOptionText: String,
        selectedIndex: Int,
    ): Boolean {
        if (selectedIndex !in options.indices) return false
        val selectedText = options[selectedIndex].trim()
        if (selectedText.isBlank()) return false
        val correctText = resolveCorrectText(options, correctIndex, correctOptionText)
        return if (correctText.isNotBlank()) {
            selectedText == correctText
        } else {
            selectedIndex == correctIndex
        }
    }

    fun resolveCorrectText(
        options: List<String>,
        correctIndex: Int,
        correctOptionText: String,
    ): String {
        val fromField = correctOptionText.trim()
        if (fromField.isNotBlank()) return fromField
        return options.getOrNull(correctIndex)?.trim().orEmpty()
    }
}
