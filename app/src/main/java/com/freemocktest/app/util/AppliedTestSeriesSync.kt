package com.freemocktest.app.util



import com.freemocktest.app.data.AppPreferencesRepository.AppliedTestSeriesEntry

import java.util.Locale



/**

 * Merge GET /tests/my-applications into local applied list.

 *

 * - Empty server response: keep active local rows (offline / apply→sync race).

 * - Non-empty server: server rows are authoritative; drop local ghosts without [testId].

 * - Local rows with [testId] not yet on the server are kept (apply just succeeded).

 * - Prior-cycle re-apply rows must never remain in local appliedSeries (Phase 3).

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

     * Drop stale local rows for tests the server marks as prior-cycle / re-apply eligible.

     */

    fun filterLocalsEvictingMayReapply(

        localActive: List<AppliedTestSeriesEntry>,

        evictTestIds: Set<String>,

        evictTestTitles: Set<String>,

    ): List<AppliedTestSeriesEntry> {

        if (evictTestIds.isEmpty() && evictTestTitles.isEmpty()) return localActive

        val ids = evictTestIds.map { it.trim().lowercase(Locale.US) }.filter { it.isNotBlank() }.toSet()

        val titles = evictTestTitles.map { it.trim().lowercase(Locale.US) }.filter { it.isNotBlank() }.toSet()

        return localActive.filter { entry ->

            val id = entry.testId.trim().lowercase(Locale.US)

            val title = entry.testName.trim().lowercase(Locale.US)

            id !in ids && title !in titles

        }

    }



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

        val pendingOnServer = localActive.filter { local ->

            !isLocalCoveredByServer(local, serverEntries) &&

                local.testId.trim().isNotBlank()

        }

        return serverEntries + pendingOnServer

    }

}


