package com.freemocktest.app.util

import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.tests.TestCardNew

/**
 * Load catalog snapshots for Home carousel cards (applied + suggest-apply interests).
 */
object AppliedTestCatalogLoader {

    const val HOME_CAROUSEL_MAX_VISIBLE = 5

    suspend fun loadSnapshotsForAppliedTests(
        testNames: List<String>,
        forceRefresh: Boolean,
        existing: Map<String, TestCardNew?>,
    ): Map<String, TestCardNew?> = loadSnapshotsForHomeCarousel(
        testNames = testNames,
        forceRefresh = forceRefresh,
        existing = existing,
    )

    suspend fun loadSnapshotsForHomeCarousel(
        testNames: List<String>,
        forceRefresh: Boolean,
        existing: Map<String, TestCardNew?>,
    ): Map<String, TestCardNew?> {
        val names = testNames.map { it.trim() }.filter { it.isNotBlank() }.distinct()
        if (names.isEmpty()) return emptyMap()

        val result = mutableMapOf<String, TestCardNew?>()
        names.forEach { name ->
            val cached = resolveCachedSnapshot(name, existing)
            if (cached != null && !forceRefresh) {
                indexSnapshotAliases(result, name, cached)
                return@forEach
            }
            val loaded = loadCardForCarouselName(name, forceRefresh)
            if (loaded != null) {
                indexSnapshotAliases(result, name, loaded)
            } else {
                result[name] = cached
            }
        }
        names.forEach { name ->
            if (!result.containsKey(name)) {
                result[name] = null
            }
        }
        return result
    }

    private fun resolveCachedSnapshot(
        name: String,
        existing: Map<String, TestCardNew?>,
    ): TestCardNew? {
        val trimmed = name.trim()
        if (trimmed.isBlank()) return null
        existing[trimmed]?.let { return it }
        return existing.entries.firstOrNull { (key, value) ->
            value != null && key.equals(trimmed, ignoreCase = true)
        }?.value
    }

    private suspend fun loadCardForCarouselName(
        name: String,
        forceRefresh: Boolean,
    ): TestCardNew? {
        val fromApply = runCatching {
            ContentRepository.loadTestForApplyScreen(name, forceRefresh = forceRefresh).effectiveCard
        }.getOrNull()?.takeIf { ContentRepository.hasCatalogDisplayFields(it) }
        if (fromApply != null) return fromApply

        val fromSubcategory = runCatching {
            ContentRepository.loadTestsForSubcategory(name, forceRefresh = forceRefresh)
        }.getOrDefault(emptyList())
            .firstOrNull { ContentRepository.hasCatalogDisplayFields(it) }
        if (fromSubcategory != null) return fromSubcategory

        return runCatching {
            ContentRepository.loadTestsForSubcategory(name, forceRefresh = false)
        }.getOrDefault(emptyList())
            .firstOrNull { ContentRepository.hasCatalogDisplayFields(it) }
    }

    private fun indexSnapshotAliases(
        target: MutableMap<String, TestCardNew?>,
        lookupName: String,
        card: TestCardNew,
    ) {
        val trimmedLookup = lookupName.trim()
        if (trimmedLookup.isNotBlank()) {
            target[trimmedLookup] = card
        }
        card.title.trim().takeIf { it.isNotBlank() }?.let { title ->
            target[title] = card
        }
        card.subcategory.trim().takeIf { it.isNotBlank() }?.let { subcategory ->
            target[subcategory] = card
        }
        card.slug.trim().takeIf { it.isNotBlank() }?.let { slug ->
            target[slug] = card
        }
    }
}
