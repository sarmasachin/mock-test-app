package com.freemocktest.app.util

import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.data.remote.MyTestApplicationDto

/**
 * Phase 7 — user-facing cycle phase labels (mirrors server testResolve / testCycleWindow).
 */
object TestCyclePhase {
    const val LIVE = "live"
    const val BETWEEN_CYCLES = "between_cycles"
    const val SCHEDULED = "scheduled"
    const val CLOSED = "closed"
    const val UNPUBLISHED = "unpublished"
    const val NOT_FOUND = "not_found"

    fun normalize(raw: String?): String {
        return raw?.trim()?.lowercase().orEmpty().ifBlank { UNPUBLISHED }
    }

    fun isBetweenCycles(phase: String): Boolean = normalize(phase) == BETWEEN_CYCLES

    fun isExamApplyBlocked(blockReason: String?): Boolean {
        val reason = blockReason?.trim().orEmpty()
        return reason.contains("exam in progress", ignoreCase = true)
    }

    fun isPreparingNextCycle(blockReason: String?): Boolean {
        val reason = blockReason?.trim().orEmpty()
        return reason.contains("preparing next cycle", ignoreCase = true) ||
            reason.contains("exam completed", ignoreCase = true)
    }

    /** Short line for test card meta (resolve / my-applications fallback). */
    fun cardMetaLine(phase: String, blockReason: String? = null): String {
        val normalized = normalize(phase)
        val reason = blockReason?.trim().orEmpty()
        return when {
            reason.isNotBlank() && (isExamApplyBlocked(reason) || isPreparingNextCycle(reason)) -> reason
            normalized == LIVE && reason.isNotBlank() -> reason
            normalized == LIVE -> "Live — apply open"
            normalized == BETWEEN_CYCLES -> "Between cycles — opens again when republished"
            normalized == SCHEDULED -> "Scheduled — not open yet"
            normalized == CLOSED -> reason.ifBlank { "Registration closed" }
            reason.isNotBlank() -> reason
            else -> "Test status"
        }
    }

    fun cardMetaFromApplication(app: MyTestApplicationDto): String {
        val phase = normalize(app.cyclePhase)
        if (phase != UNPUBLISHED && phase != NOT_FOUND) {
            return cardMetaLine(phase)
        }
        return if (app.isPublished) {
            "Live test"
        } else {
            "Between cycles — opens again when republished"
        }
    }

    data class ApplyUiState(
        val phase: String,
        val phaseLabel: String,
        val betweenCycles: Boolean,
        val applyBlockedMessage: String?,
        val republishAt: String?,
        val mayReapply: Boolean,
        val showApplyButton: Boolean,
    )

    fun resolveApplyUiState(
        resolve: ContentRepository.TestApplyResolveSnapshot?,
        matchedApplication: MyTestApplicationDto?,
        hasAlreadyApplied: Boolean,
        testUnavailable: Boolean,
    ): ApplyUiState {
        val phase = normalize(
            resolve?.cyclePhase ?: matchedApplication?.cyclePhase,
        )
        val blockReason = resolve?.blockReason?.trim().orEmpty()
        val republishAt = resolve?.republishAt?.trim()?.takeIf { it.isNotBlank() }
        val mayReapply = TestApplyState.userMayReapplyForNewCycle(resolve, matchedApplication)
        val betweenCycles = isBetweenCycles(phase) ||
            (matchedApplication != null && !matchedApplication.isPublished && phase != LIVE)
        val phaseLabel = cardMetaLine(phase, blockReason)

        val applyBlockedMessage = when {
            hasAlreadyApplied || mayReapply -> null
            testUnavailable -> blockReason.ifBlank { "This test is not open for applications right now." }
            betweenCycles -> blockReason.ifBlank { "Applications are closed while this test is between cycles." }
            resolve != null && !resolve.canApply && blockReason.isNotBlank() -> blockReason
            resolve != null && !resolve.canApply && isExamApplyBlocked(blockReason) ->
                blockReason.ifBlank { "Registration closed — exam in progress" }
            else -> null
        }

        val showApplyButton = !hasAlreadyApplied &&
            !betweenCycles &&
            !testUnavailable &&
            applyBlockedMessage.isNullOrBlank() &&
            (resolve == null || resolve.canApply || mayReapply)

        return ApplyUiState(
            phase = phase,
            phaseLabel = phaseLabel,
            betweenCycles = betweenCycles,
            applyBlockedMessage = applyBlockedMessage,
            republishAt = republishAt,
            mayReapply = mayReapply,
            showApplyButton = showApplyButton,
        )
    }

    data class PreviewApplyState(
        val phaseLabel: String?,
        val applyBlockedMessage: String?,
        val showApplyButton: Boolean,
    )

    fun resolvePreviewApplyState(
        resolve: ContentRepository.TestApplyResolveSnapshot?,
        alreadyApplied: Boolean,
    ): PreviewApplyState {
        if (alreadyApplied) {
            return PreviewApplyState(
                phaseLabel = resolve?.let { cardMetaLine(it.cyclePhase, it.blockReason) },
                applyBlockedMessage = null,
                showApplyButton = false,
            )
        }
        if (resolve == null) {
            return PreviewApplyState(
                phaseLabel = null,
                applyBlockedMessage = null,
                showApplyButton = true,
            )
        }
        val phase = normalize(resolve.cyclePhase)
        val blockReason = resolve.blockReason?.trim().orEmpty()
        val blocked = !resolve.canApply && !resolve.mayReapplyForNewCycle && blockReason.isNotBlank()
        return PreviewApplyState(
            phaseLabel = cardMetaLine(phase, blockReason),
            applyBlockedMessage = if (blocked) blockReason else null,
            showApplyButton = resolve.canApply || resolve.mayReapplyForNewCycle,
        )
    }
}
