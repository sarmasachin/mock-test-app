package com.freemocktest.app.util

import com.freemocktest.app.data.AppPreferencesRepository.AppliedTestSeriesEntry
import java.util.Locale

/**
 * Phase 2 — merge GET /tests/my-applications into local applied list without wiping
 * active local rows when the server returns empty or omits a current-cycle apply.
 */
object AppliedTestSeriesSync {
    fun entriesMatchSameTest(
        a: AppliedTestSeriesEntry,
        b: AppliedTestSeriesEntry,
    ): Boolean {
        val aId = a.testId.trim()
        val bId = b.testId.trim()
        if (aId.isNotBlank() && bId.isNotBlank() && aId == bId) return true
        val aTitle = a.testName.trim()
        val bTitle = b.testName.trim()
        if (aTitle.isNotBlank() && bTitle.isNotBlank() && aTitle.equals(bTitle, ignoreCase = true)) {
            return true
        }
        return false
    }

    fun isLocalCoveredByServer(
        local: AppliedTestSeriesEntry,
        serverEntries: List<AppliedTestSeriesEntry>,
    ): Boolean = serverEntries.any { entriesMatchSameTest(local, it) }

    /**
     * @param localActive Active local rows before sync (expired rows already filtered out).
     * @param serverEntries Rows built from GET /tests/my-applications.
     */
    fun merge(
        localActive: List<AppliedTestSeriesEntry>,
        serverEntries: List<AppliedTestSeriesEntry>,
    ): List<AppliedTestSeriesEntry> {
        if (serverEntries.isEmpty()) {
            return localActive
        }
        val localOnly = localActive.filter { local -> !isLocalCoveredByServer(local, serverEntries) }
        return serverEntries + localOnly
    }
}
