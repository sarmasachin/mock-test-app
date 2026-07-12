package com.freemocktest.app.util

import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.data.AppPreferencesRepository

/**
 * Phase 4 — boost featured state exams on Home carousel (user signup state).
 * Mirrors server buildFeaturedStateExamsForHome().
 */
object StateExamFeaturedHomeBoost {

    data class FeaturedSuggest(
        val level3: String,
        val itemSortOrder: Int,
    )

    fun featuredTestsForState(
        examCategories: List<ContentRepository.ExamCategoryItemRemote>,
        signupState: String,
        excludeApplied: Set<String> = emptySet(),
        maxItems: Int = 4,
    ): List<FeaturedSuggest> {
        val stateSlug = IndianStateVisualCatalog.resolveSlug(signupState, null) ?: return emptyList()
        val cap = maxItems.coerceIn(1, 12)
        return examCategories
            .asSequence()
            .filter { it.enabled && it.featured && IndianStateVisualCatalog.isStateExamLevel1(it.level1) }
            .filter { IndianStateVisualCatalog.resolveSlug(it.level2, it.iconKey) == stateSlug }
            .filter { row ->
                val name = row.level3.trim()
                name.isNotEmpty() && !excludeApplied.any { it.equals(name, ignoreCase = true) }
            }
            .sortedWith(
                compareByDescending<ContentRepository.ExamCategoryItemRemote> { it.featured }
                    .thenBy { it.itemSortOrder ?: 999 }
                    .thenBy { it.level3.lowercase() },
            )
            .take(cap)
            .map { FeaturedSuggest(level3 = it.level3.trim(), itemSortOrder = it.itemSortOrder ?: 999) }
            .toList()
    }

    fun featuredLevel3Set(
        examCategories: List<ContentRepository.ExamCategoryItemRemote>,
        signupState: String,
    ): Set<String> =
        featuredTestsForState(examCategories, signupState, maxItems = 12)
            .map { it.level3.lowercase() }
            .toSet()

    /**
     * Carousel suggest list: featured state exams first, then pending login interests.
     */
    fun resolveCarouselSuggestTests(
        interests: List<String>,
        activeEntries: List<AppPreferencesRepository.AppliedTestSeriesEntry>,
        examCategories: List<ContentRepository.ExamCategoryItemRemote>,
        signupState: String,
        maxItems: Int = 4,
    ): List<String> {
        val appliedLower = activeEntries
            .map { it.testName.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .toSet()
        val featured = featuredTestsForState(
            examCategories = examCategories,
            signupState = signupState,
            excludeApplied = appliedLower,
            maxItems = maxItems,
        ).map { it.level3 }
        val pending = AppliedTestHomeUi.resolvePendingInterestTests(
            interests = interests,
            activeEntries = activeEntries,
            maxItems = maxItems,
        )
        val merged = linkedSetOf<String>()
        for (name in featured) {
            if (name.isNotBlank()) merged.add(name)
        }
        for (name in pending) {
            if (name.isNotBlank()) merged.add(name)
        }
        return merged.take(maxItems.coerceAtLeast(1))
    }
}
