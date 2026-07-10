package com.freemocktest.app.util

import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.tests.TestCardNew

/**
 * Phase 4 — load catalog snapshots for Home applied-test cards (server + disk cache).
 */
object AppliedTestCatalogLoader {

    suspend fun loadSnapshotsForAppliedTests(
        testNames: List<String>,
        forceRefresh: Boolean,
        existing: Map<String, TestCardNew?>,
    ): Map<String, TestCardNew?> {
        val names = testNames.map { it.trim() }.filter { it.isNotBlank() }.distinct()
        if (names.isEmpty()) return emptyMap()
        val next = existing.toMutableMap()
        names.forEach { name ->
            if (existing.containsKey(name) && existing[name] != null && !forceRefresh) {
                return@forEach
            }
            val loaded = runCatching {
                ContentRepository.loadTestForApplyScreen(name, forceRefresh = forceRefresh).effectiveCard
            }.getOrNull()
            next[name] = loaded?.takeIf { ContentRepository.hasCatalogDisplayFields(it) }
                ?: existing[name]
        }
        names.forEach { name ->
            if (!next.containsKey(name)) next[name] = null
        }
        return next.filterKeys { it in names }
    }
}
