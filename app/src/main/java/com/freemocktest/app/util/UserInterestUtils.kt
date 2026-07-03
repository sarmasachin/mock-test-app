package com.freemocktest.app.util

import java.util.Locale

/**
 * Mirrors server [userInterests.js] — interest unit is test.subcategory / examCategories.level3.
 */
object UserInterestUtils {
    const val MAX_USER_INTERESTS = 20
    private const val MAX_SUBCATEGORY_LEN = 120

    fun normalizeSubcategoryKey(value: String?): String =
        value?.trim().orEmpty().lowercase(Locale.US)

    fun normalizeInterestSubcategories(input: List<String>?): List<String> {
        val seen = LinkedHashMap<String, String>()
        for (item in input.orEmpty()) {
            val trimmed = item.trim().take(MAX_SUBCATEGORY_LEN)
            if (trimmed.isBlank()) continue
            val key = normalizeSubcategoryKey(trimmed)
            if (key.isBlank()) continue
            if (!seen.containsKey(key)) {
                seen[key] = trimmed
            }
            if (seen.size >= MAX_USER_INTERESTS) break
        }
        return seen.values.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it })
    }

    /** Mirrors SQL `subcategory ILIKE '%filter%'`. */
    fun subcategoryMatchesSqlFilter(testSubcategory: String?, filterSubcategory: String?): Boolean {
        val sub = normalizeSubcategoryKey(testSubcategory)
        val filter = normalizeSubcategoryKey(filterSubcategory)
        if (filter.isBlank()) return true
        if (sub.isBlank()) return false
        return sub.contains(filter)
    }

    fun subcategoryMatchesAnyInterest(testSubcategory: String?, interests: List<String>?): Boolean {
        val list = normalizeInterestSubcategories(interests)
        if (list.isEmpty()) return true
        return list.any { subcategoryMatchesSqlFilter(testSubcategory, it) }
    }

    fun filterTestsByUserInterests(
        tests: List<com.freemocktest.app.newui.tests.TestCardNew>,
        interests: List<String>,
        showAllTests: Boolean,
    ): List<com.freemocktest.app.newui.tests.TestCardNew> {
        if (showAllTests) return tests
        val normalized = normalizeInterestSubcategories(interests)
        if (normalized.isEmpty()) return tests
        return tests.filter { subcategoryMatchesAnyInterest(it.subcategory, normalized) }
    }

    fun filterLevel3Labels(
        labels: List<String>,
        interests: List<String>,
        showAllTests: Boolean,
    ): List<String> {
        if (showAllTests) return labels
        val normalized = normalizeInterestSubcategories(interests)
        if (normalized.isEmpty()) return labels
        return labels.filter { label ->
            val key = normalizeSubcategoryKey(label)
            normalized.any { interest ->
                normalizeSubcategoryKey(interest) == key ||
                    subcategoryMatchesSqlFilter(label, interest)
            }
        }
    }
}
