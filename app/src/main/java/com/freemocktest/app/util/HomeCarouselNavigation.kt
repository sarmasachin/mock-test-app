package com.freemocktest.app.util

import com.freemocktest.app.data.AppPreferencesRepository

/**
 * Safe navigation when user taps a Home carousel card (applied or suggest-apply).
 */
object HomeCarouselNavigation {

    sealed class CarouselTapAction {
        data class OpenApplied(
            val testName: String,
            val appliedAction: HomeAppliedTestNavigation.CardTapAction,
        ) : CarouselTapAction()

        data class OpenSuggestApply(val interestLabel: String) : CarouselTapAction()
    }

    fun resolveCarouselTapAction(
        item: AppliedTestHomeUi.HomeTestCarouselItem,
        cardStates: List<AppliedTestHomeUi.AppliedTestCardUiState>,
        pendingResult: AppPreferencesRepository.PendingResultState?,
        nowMs: Long,
    ): CarouselTapAction {
        return when (item.kind) {
            AppliedTestHomeUi.HomeTestCarouselKind.SUGGEST_APPLY ->
                CarouselTapAction.OpenSuggestApply(item.testName.trim())
            AppliedTestHomeUi.HomeTestCarouselKind.APPLIED -> {
                val card = cardStates.firstOrNull {
                    it.testName.equals(item.testName, ignoreCase = true)
                } ?: item.card
                CarouselTapAction.OpenApplied(
                    testName = item.testName.trim(),
                    appliedAction = HomeAppliedTestNavigation.resolveCardTapAction(
                        card = card,
                        pendingResult = pendingResult,
                        nowMs = nowMs,
                    ),
                )
            }
        }
    }
}
