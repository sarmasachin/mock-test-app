package com.freemocktest.app.util



import com.freemocktest.app.data.ContentRepository

import com.freemocktest.app.data.remote.MyTestApplicationDto

import com.freemocktest.app.newui.tests.TestCardNew



/**

 * Shared apply / already-applied rules for Apply + Start Test screens (Phase 1–3).

 */

object TestApplyState {

    fun matchMyTestApplication(

        applications: List<MyTestApplicationDto>,

        routeKey: String,

        card: TestCardNew?,

    ): MyTestApplicationDto? = pickPreferredMyTestApplication(applications, routeKey, card)



    /**

     * Prefer current-cycle enrollment over a prior-cycle re-apply row when both exist.

     */

    fun pickPreferredMyTestApplication(

        applications: List<MyTestApplicationDto>,

        routeKey: String,

        card: TestCardNew?,

    ): MyTestApplicationDto? {

        val matches = applications.filter { matchesApplication(it, routeKey, card) }

        if (matches.isEmpty()) return null

        return matches.firstOrNull { it.alreadyAppliedInCurrentCycle && !it.mayReapplyForNewCycle }

            ?: matches.firstOrNull { it.mayReapplyForNewCycle && !it.alreadyAppliedInCurrentCycle }

            ?: matches.firstOrNull()

    }



    fun matchesApplication(

        app: MyTestApplicationDto,

        routeKey: String,

        card: TestCardNew?,

    ): Boolean {

        val key = routeKey.trim()

        if (key.isBlank()) return false

        val appTitle = app.testTitle.trim()

        val appId = app.testId.trim()

        if (appId.isNotBlank() && card?.id?.isNotBlank() == true && appId == card.id) return true

        if (appTitle.equals(key, ignoreCase = true)) return true

        val cardTitle = card?.title?.trim().orEmpty()

        if (cardTitle.isNotBlank() && appTitle.equals(cardTitle, ignoreCase = true)) return true

        val cardSub = card?.subcategory?.trim().orEmpty()

        if (cardSub.isNotBlank() &&

            key.equals(cardSub, ignoreCase = true) &&

            cardTitle.isNotBlank() &&

            appTitle.equals(cardTitle, ignoreCase = true)

        ) {

            return true

        }

        return false

    }



    /** New catalog cycle — user may apply again after reschedule. */

    fun userMayReapplyForNewCycle(

        resolve: ContentRepository.TestApplyResolveSnapshot?,

        matchedApplication: MyTestApplicationDto? = null,

    ): Boolean {

        if (resolve?.mayReapplyForNewCycle == true && resolve.alreadyAppliedInCurrentCycle != true) {

            return true

        }

        if (

            matchedApplication?.mayReapplyForNewCycle == true &&

            !matchedApplication.alreadyAppliedInCurrentCycle

        ) {

            return true

        }

        return false

    }



    /**

     * True when the user should not see a fresh apply CTA for the current cycle.

     */

    fun userHasAppliedForCurrentCycle(

        resolve: ContentRepository.TestApplyResolveSnapshot?,

        matchedApplication: MyTestApplicationDto?,

        lockedTestId: String = "",

        card: TestCardNew? = null,

    ): Boolean {

        if (userMayReapplyForNewCycle(resolve, matchedApplication)) return false

        if (resolve?.alreadyAppliedInCurrentCycle == true) return true

        if (resolve?.canStart == true) return true

        if (matchedApplication?.alreadyAppliedInCurrentCycle == true) return true

        if (matchedApplication?.mayReapplyForNewCycle == true) return false

        val locked = lockedTestId.trim()

        val cardId = card?.id?.trim().orEmpty()

        if (locked.isNotBlank() && cardId.isNotBlank() && locked == cardId) return true

        return false

    }



    /** Unified already-applied flag for Apply + Start Test preview screens. */

    fun resolveAlreadyAppliedFromSources(

        resolve: ContentRepository.TestApplyResolveSnapshot?,

        matchedApplication: MyTestApplicationDto?,

    ): Boolean = userHasAppliedForCurrentCycle(resolve, matchedApplication)



    /** True when [app] may sync into local appliedSeries (not a prior-cycle re-apply row). */

    fun shouldSyncApplicationToLocalSeries(app: MyTestApplicationDto): Boolean {

        return app.alreadyAppliedInCurrentCycle && !app.mayReapplyForNewCycle

    }



    /** Prefer server-known test id so refresh does not hop between catalog rows. */

    fun preferStableTestId(

        matchedApplication: MyTestApplicationDto?,

        resolve: ContentRepository.TestApplyResolveSnapshot?,

        lockedTestId: String,

        catalogCard: TestCardNew?,

    ): String {

        matchedApplication?.testId?.trim()?.takeIf { it.isNotBlank() }?.let { return it }

        lockedTestId.trim().takeIf { it.isNotBlank() }?.let { return it }

        resolve?.card?.id?.trim()?.takeIf { it.isNotBlank() }?.let { return it }

        return catalogCard?.id?.trim().orEmpty()

    }

}


