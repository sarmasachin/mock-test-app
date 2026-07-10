package com.freemocktest.app.util

import com.freemocktest.app.data.AppPreferencesRepository

/**
 * Phase 3 — safe navigation when user taps a Home applied-test card.
 */
object HomeAppliedTestNavigation {

    sealed class CardTapAction {
        data class OpenStartPreview(val testName: String) : CardTapAction()
        data class OpenPendingResult(
            val testName: String,
            val answered: Int,
            val correct: Int,
            val wrong: Int,
            val total: Int,
            val publishAtMillis: Long,
        ) : CardTapAction()
    }

    fun resolveCardTapAction(
        card: AppliedTestHomeUi.AppliedTestCardUiState,
        pendingResult: AppPreferencesRepository.PendingResultState?,
        nowMs: Long,
    ): CardTapAction {
        val name = card.testName.trim().ifBlank { "Test" }
        val pending = pendingResult
        if (
            card.isPendingResult &&
            pending != null &&
            pending.testName.equals(name, ignoreCase = true)
        ) {
            if (AppPreferencesRepository.isPendingResultReady(pending, nowMs)) {
                return CardTapAction.OpenPendingResult(
                    testName = pending.testName,
                    answered = pending.answered,
                    correct = pending.correct,
                    wrong = pending.wrong,
                    total = pending.total,
                    publishAtMillis = pending.publishAtMillis,
                )
            }
        }
        return CardTapAction.OpenStartPreview(name)
    }
}
