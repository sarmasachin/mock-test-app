package com.freemocktest.app.data

import java.util.Locale

data class DailyQuizScopeSelection(
    val mode: String,
    val stateName: String,
) {
    val isAllIndia: Boolean get() = mode == MODE_ALL_INDIA
    val isState: Boolean get() = mode == MODE_STATE && stateName.isNotBlank()

    /** Matches server [buildDailyQuizScopeKey] for cache + picker seed. */
    fun cacheKey(): String {
        if (isAllIndia) return "all-india"
        val slug = stateName.trim().lowercase(Locale.US)
            .replace(Regex("\\s+"), " ")
            .replace(Regex("[^a-z0-9]+"), "-")
            .trim('-')
        return if (slug.isBlank()) "all-india" else "state-$slug"
    }

    companion object {
        const val MODE_ALL_INDIA = "all_india"
        const val MODE_STATE = "state"

        val AllIndia = DailyQuizScopeSelection(MODE_ALL_INDIA, "")

        fun state(name: String): DailyQuizScopeSelection {
            val clean = name.trim()
            return if (clean.isBlank()) AllIndia else DailyQuizScopeSelection(MODE_STATE, clean)
        }
    }
}
