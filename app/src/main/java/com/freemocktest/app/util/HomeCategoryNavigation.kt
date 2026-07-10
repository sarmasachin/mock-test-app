package com.freemocktest.app.util

import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.tests.TestCardNew

/**
 * Resolves Home category chip taps to the shortest safe route (Phase 2+ apply UX).
 */
object HomeCategoryNavigation {

    sealed class OpenTarget {
        data class TestsCatalog(val subcategory: String) : OpenTarget()
        data class Apply(val testTitle: String) : OpenTarget()
        data class StartPreview(val testTitle: String) : OpenTarget()
    }

    suspend fun resolveOpenTarget(subcategory: String): OpenTarget {
        val sub = subcategory.trim().ifBlank { "Topic" }
        val tests = runCatching {
            ContentRepository.loadTestsForSubcategory(sub, forceRefresh = false)
        }.getOrDefault(emptyList())
        val published = tests
            .filter { ContentRepository.hasCatalogDisplayFields(it) }
            .distinctBy { it.title.trim().lowercase() }
        if (published.size != 1) {
            return OpenTarget.TestsCatalog(sub)
        }
        val card = published.first()
        val title = card.title.trim().ifBlank { sub }
        if (hasActiveAppliedEntry(sub, card, title)) {
            return OpenTarget.StartPreview(title)
        }
        return OpenTarget.Apply(title)
    }

    private suspend fun hasActiveAppliedEntry(
        lookupKey: String,
        card: TestCardNew,
        title: String,
    ): Boolean {
        val nowMs = System.currentTimeMillis()
        val fromLookup = AppPreferencesRepository.findAppliedEntryForTestLookup(lookupKey, card)
            ?: AppPreferencesRepository.findAppliedEntryForTestLookup(title, card)
            ?: AppPreferencesRepository.findAppliedEntryNow(title)
        return fromLookup?.isActive(nowMs) == true
    }
}
