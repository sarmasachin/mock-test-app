package com.freemocktest.app.util

import com.freemocktest.app.data.AppPreferencesRepository

/**
 * Safe navigation when user taps a Home / View-all applied-test card.
 * Locked cards stay on screen until [AppliedTestHomeUi.AppliedTestCardUiState.actionButtonEnabled].
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

        /** Tap ignored — test locked, result pending, or late join closed. */
        data class Blocked(val message: String) : CardTapAction()
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
        if (card.actionButtonEnabled) {
            return CardTapAction.OpenStartPreview(name)
        }
        return CardTapAction.Blocked(blockedTapMessage(card))
    }

    fun blockedTapMessage(card: AppliedTestHomeUi.AppliedTestCardUiState): String {
        if (!card.catalogLoaded) return "Loading test details..."
        if (card.isPendingResultWaiting) {
            return card.statusMessage.ifBlank { "Result will be available soon" }
        }
        if (card.lateJoinClosed) {
            return card.statusMessage.ifBlank { "Late join closed" }
        }
        if (card.isLocked) {
            card.startTimeDisplay?.trim()?.takeIf { it.isNotBlank() }?.let {
                return "Test unlocks at $it"
            }
            card.examStartLabel?.trim()?.takeIf { it.isNotBlank() }?.let {
                return "Test starts $it"
            }
            if (card.countdownText.isNotBlank()) {
                return "Starts in ${card.countdownText}"
            }
            return card.statusMessage.ifBlank { "Test is locked" }
        }
        return card.statusMessage.ifBlank { "Not available yet" }
    }
}
