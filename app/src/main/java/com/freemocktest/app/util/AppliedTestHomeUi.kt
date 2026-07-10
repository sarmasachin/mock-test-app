package com.freemocktest.app.util

import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.tests.TestCardNew
import java.util.Locale

/**
 * Shared Home UI state for applied tests (Option A horizontal cards + Option E Start test card).
 * Logic mirrors [com.freemocktest.app.newui.tests.StartTestPreviewScreenNew] card sections.
 */
object AppliedTestHomeUi {

    data class AppliedTestCardUiState(
        val testName: String,
        val statusMessage: String,
        val countdownText: String,
        val isLocked: Boolean,
        val canStartNow: Boolean,
        val isPendingResult: Boolean,
        val isPendingResultWaiting: Boolean,
        val isReadyHighlight: Boolean,
        val catalogLoaded: Boolean,
        val examStartLabel: String?,
        val enrolledLabel: String?,
    )

    data class HomeAppliedTestsUiState(
        val activeEntries: List<AppPreferencesRepository.AppliedTestSeriesEntry>,
        val cardStates: List<AppliedTestCardUiState>,
        val hiddenExpiredCount: Int,
        val totalAppliedCount: Int,
        val readyCount: Int,
        val nextEligibleTestName: String?,
        val startTestSubtitle: String,
        val startTestRouteName: String,
    ) {
        val hasAppliedTests: Boolean get() = totalAppliedCount > 0
        val showSection: Boolean get() = activeEntries.isNotEmpty()
    }

    fun formatCountdown(remainingMs: Long): String {
        val ms = remainingMs.coerceAtLeast(0L)
        val hours = (ms / 3_600_000L).toInt()
        val mins = ((ms % 3_600_000L) / 60_000L).toInt()
        val secs = ((ms % 60_000L) / 1_000L).toInt()
        return String.format(Locale.US, "%02d:%02d:%02d", hours, mins, secs)
    }

    fun resolveCardUiState(
        entry: AppPreferencesRepository.AppliedTestSeriesEntry,
        card: TestCardNew?,
        scheduleTimerEnabled: Boolean,
        pendingResult: AppPreferencesRepository.PendingResultState?,
        nowMs: Long,
    ): AppliedTestCardUiState {
        val name = entry.testName.trim().ifBlank { "Test" }
        val examDate = card?.examDate
        val slotLabel = card?.slotLabel
        val lateJoinMinutes = card?.lateJoinMinutes ?: 0
        val effectiveTimer = TestScheduleUtils.effectiveScheduleTimerEnabled(
            scheduleTimerEnabled = scheduleTimerEnabled,
            examDate = examDate,
            slotLabel = slotLabel,
        )
        val cardScheduledMs = TestScheduleUtils.parseExamStartMillis(examDate, slotLabel)
        val serverAuthoritative = entry.serverCanStart != null
        val effectiveUnlockMs = when {
            serverAuthoritative && entry.serverCanStart == true -> nowMs
            effectiveTimer && cardScheduledMs != null && cardScheduledMs > nowMs -> cardScheduledMs
            effectiveTimer && entry.scheduledStartAtMillis > nowMs -> entry.scheduledStartAtMillis
            else -> if (effectiveTimer) entry.startUnlockAtMillis(nowMs) else nowMs
        }
        val remainingMs = (effectiveUnlockMs - nowMs).coerceAtLeast(0L)
        val countdown = formatCountdown(remainingMs)
        val isLocked = when {
            serverAuthoritative && entry.serverCanStart == true -> false
            serverAuthoritative && entry.serverCanStart == false -> true
            !effectiveTimer -> false
            else -> remainingMs > 0L
        }
        val joinAllowed = when {
            serverAuthoritative -> entry.serverCanStart == true
            else -> TestScheduleUtils.isExamJoinAllowedWhenScheduleTimer(
                scheduleTimerEnabled = scheduleTimerEnabled,
                examDate = examDate,
                slotLabel = slotLabel,
                lateJoinMinutes = lateJoinMinutes,
                nowMs = nowMs,
            )
        }
        val lateJoinClosed = !serverAuthoritative && effectiveTimer && !isLocked && !joinAllowed &&
            TestScheduleUtils.isExamStartAllowed(examDate, slotLabel, nowMs)
        val isPendingResult = AppPreferencesRepository.isTestBlockedByPendingResult(name, pendingResult)
        val isPendingResultWaiting = isPendingResult &&
            !AppPreferencesRepository.isPendingResultReady(pendingResult, nowMs)
        val canStartNow = !isPendingResult && joinAllowed && !isLocked && name.isNotBlank()
        val catalogLoaded = card != null && ContentRepository.hasCatalogDisplayFields(card)
        val examStartLabel = if (catalogLoaded && !examDate.isNullOrBlank()) {
            TestScheduleUtils.formatExamStartLabel(examDate, slotLabel)
        } else {
            null
        }
        val enrolledLabel = card?.enrolledLabel?.trim()?.takeIf { it.isNotBlank() }
        val statusMessage = when {
            isPendingResultWaiting -> "Result will be available soon"
            isPendingResult -> "View your result"
            serverAuthoritative && !entry.startBlockReason.isNullOrBlank() && !canStartNow ->
                entry.startBlockReason!!.trim()
            lateJoinClosed ->
                "Late join closed"
            isLocked && effectiveTimer && cardScheduledMs != null && cardScheduledMs > nowMs ->
                "Starts ${TestScheduleUtils.formatExamStartLabel(examDate, slotLabel)}"
            isLocked -> "Starts in $countdown"
            else -> "Ready to start"
        }
        return AppliedTestCardUiState(
            testName = name,
            statusMessage = statusMessage,
            countdownText = countdown,
            isLocked = isLocked,
            canStartNow = canStartNow,
            isPendingResult = isPendingResult,
            isPendingResultWaiting = isPendingResultWaiting,
            isReadyHighlight = canStartNow,
            catalogLoaded = catalogLoaded,
            examStartLabel = examStartLabel,
            enrolledLabel = enrolledLabel,
        )
    }

    fun buildHomeAppliedTestsUiState(
        appliedSeries: List<AppPreferencesRepository.AppliedTestSeriesEntry>,
        snapshots: Map<String, TestCardNew?>,
        scheduleTimerEnabled: Boolean,
        pendingResult: AppPreferencesRepository.PendingResultState?,
        nowMs: Long,
    ): HomeAppliedTestsUiState {
        val activeEntries = appliedSeries
            .filter { it.isActive(nowMs) }
            .sortedBy { (it.startUnlockAtMillis(nowMs) - nowMs).coerceAtLeast(0L) }
        val hiddenExpiredCount = appliedSeries.count { !it.isActive(nowMs) }
        val cardStates = activeEntries.map { entry ->
            val snapshot = snapshots[entry.testName.trim()]
            resolveCardUiState(
                entry = entry,
                card = snapshot,
                scheduleTimerEnabled = scheduleTimerEnabled,
                pendingResult = pendingResult,
                nowMs = nowMs,
            )
        }
        val readyCount = cardStates.count { it.canStartNow }
        val nextEligible = activeEntries.firstOrNull { entry ->
            AppPreferencesRepository.canStartTest(entry.testName, pendingResult) &&
                cardStates.firstOrNull { it.testName.equals(entry.testName, ignoreCase = true) }?.canStartNow == true
        } ?: activeEntries.firstOrNull {
            AppPreferencesRepository.canStartTest(it.testName, pendingResult)
        }
        val total = activeEntries.size
        val startTestSubtitle = when {
            total == 0 -> "Apply from Tests tab"
            total == 1 -> {
                val card = cardStates.firstOrNull()
                when {
                    card == null -> "Tap to view"
                    card.isPendingResultWaiting -> "Result pending"
                    card.isPendingResult -> "View your result"
                    card.canStartNow -> "Ready to start"
                    card.isLocked -> "Starts in ${card.countdownText}"
                    else -> card.statusMessage
                }
            }
            readyCount > 0 ->
                "$total tests applied · $readyCount ready now"
            else ->
                "$total tests applied · Tap to view all"
        }
        val startTestRouteName = when {
            total == 0 -> "applied"
            total == 1 -> nextEligible?.testName?.trim()?.takeIf { it.isNotBlank() } ?: "applied"
            else -> "applied"
        }
        return HomeAppliedTestsUiState(
            activeEntries = activeEntries,
            cardStates = cardStates,
            hiddenExpiredCount = hiddenExpiredCount,
            totalAppliedCount = total,
            readyCount = readyCount,
            nextEligibleTestName = nextEligible?.testName?.trim()?.takeIf { it.isNotBlank() },
            startTestSubtitle = startTestSubtitle,
            startTestRouteName = startTestRouteName,
        )
    }
}
