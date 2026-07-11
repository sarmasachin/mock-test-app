package com.freemocktest.app.util

import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.tests.TestCardNew
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.regex.Pattern

/**
 * Shared Home UI state for applied tests (Option A horizontal cards + Option E Start test card).
 * Logic mirrors [com.freemocktest.app.newui.tests.StartTestPreviewScreenNew] card sections.
 */
object AppliedTestHomeUi {

    private val EXAM_ZONE: ZoneId = ZoneId.of("Asia/Kolkata")
    private val DURATION_MIN_PATTERN = Pattern.compile("(\\d+)\\s*min", Pattern.CASE_INSENSITIVE)
    private val DURATION_HR_PATTERN = Pattern.compile("(\\d+)\\s*hr", Pattern.CASE_INSENSITIVE)

    enum class HomeTestCarouselKind {
        APPLIED,
        SUGGEST_APPLY,
    }

    data class HomeTestCarouselItem(
        val kind: HomeTestCarouselKind,
        val testName: String,
        val card: AppliedTestCardUiState,
    ) {
        val carouselKey: String get() = "${kind.name.lowercase()}:${testName.lowercase()}"
    }

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
        val scheduleBadgeLabel: String,
        val registeredDisplay: String?,
        val durationPill: String,
        val questionsPill: String,
        val marksPill: String,
        val negativePill: String,
        val startTimeDisplay: String?,
        val subjectFocus: String?,
        val countdownVerbose: String,
        val unlockProgress: Float,
        val showUnlockSection: Boolean,
        val actionButtonLabel: String,
        val actionButtonEnabled: Boolean,
        val lateJoinClosed: Boolean,
        val isSuggestApply: Boolean = false,
        val isSuggestApplyHighlight: Boolean = false,
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
        val carouselItems: List<HomeTestCarouselItem> = emptyList(),
        val visibleCarouselItems: List<HomeTestCarouselItem> = emptyList(),
        val carouselOverflowCount: Int = 0,
    ) {
        val hasAppliedTests: Boolean get() = totalAppliedCount > 0
        val showSection: Boolean get() = carouselItems.isNotEmpty()
    }

    fun formatCountdown(remainingMs: Long): String {
        val ms = remainingMs.coerceAtLeast(0L)
        val hours = (ms / 3_600_000L).toInt()
        val mins = ((ms % 3_600_000L) / 60_000L).toInt()
        val secs = ((ms % 60_000L) / 1_000L).toInt()
        return String.format(Locale.US, "%02d:%02d:%02d", hours, mins, secs)
    }

    fun formatCountdownVerbose(remainingMs: Long): String {
        val ms = remainingMs.coerceAtLeast(0L)
        val hours = (ms / 3_600_000L).toInt()
        val mins = ((ms % 3_600_000L) / 60_000L).toInt()
        val secs = ((ms % 60_000L) / 1_000L).toInt()
        return String.format(Locale.US, "%02dh : %02dm : %02ds", hours, mins, secs)
    }

    fun formatExamStartFriendly(examDate: String?, slotLabel: String?, nowMs: Long): String? {
        val startMs = TestScheduleUtils.parseExamStartMillis(examDate, slotLabel) ?: return null
        val start = Instant.ofEpochMilli(startMs).atZone(EXAM_ZONE)
        val now = Instant.ofEpochMilli(nowMs).atZone(EXAM_ZONE)
        val time = DateTimeFormatter.ofPattern("hh:mma", Locale.getDefault()).format(start)
        val dayPrefix = when {
            start.toLocalDate() == now.toLocalDate() -> "Today"
            start.toLocalDate() == now.toLocalDate().plusDays(1) -> "Tomorrow"
            else -> DateTimeFormatter.ofPattern("dd MMM", Locale.getDefault()).format(start)
        }
        return "$dayPrefix @ $time"
    }

    fun formatLockUntilLabel(examDate: String?, slotLabel: String?, nowMs: Long): String {
        val friendly = formatExamStartFriendly(examDate, slotLabel, nowMs)
        if (friendly != null) {
            val timeOnly = friendly.substringAfter("@", friendly).trim()
            return "Locked Until $timeOnly"
        }
        return "Locked"
    }

    /**
     * Login interests the user has not applied for yet (same filter as legacy Quick Apply chips).
     */
    fun resolvePendingInterestTests(
        interests: List<String>,
        activeEntries: List<AppPreferencesRepository.AppliedTestSeriesEntry>,
        maxItems: Int = 4,
    ): List<String> {
        val normalized = UserInterestUtils.normalizeInterestSubcategories(interests)
        return normalized.filter { interest ->
            activeEntries.none { entry ->
                entry.testName.equals(interest, ignoreCase = true) ||
                    UserInterestUtils.subcategoryMatchesAnyInterest(entry.testName, listOf(interest))
            }
        }.take(maxItems.coerceAtLeast(0))
    }

    fun resolveSuggestApplyCardUiState(
        interestLabel: String,
        card: TestCardNew?,
        scheduleTimerEnabled: Boolean,
        nowMs: Long,
    ): AppliedTestCardUiState {
        val interest = interestLabel.trim().ifBlank { "Test" }
        val name = card?.title?.trim()?.takeIf { it.isNotBlank() } ?: interest
        val examDate = card?.examDate
        val slotLabel = card?.slotLabel
        val catalogLoaded = card != null && ContentRepository.hasCatalogDisplayFields(card)
        val effectiveTimer = TestScheduleUtils.effectiveScheduleTimerEnabled(
            scheduleTimerEnabled = scheduleTimerEnabled,
            examDate = examDate,
            slotLabel = slotLabel,
        )
        val cardScheduledMs = TestScheduleUtils.parseExamStartMillis(examDate, slotLabel)
        val isFutureScheduled = effectiveTimer && cardScheduledMs != null && cardScheduledMs > nowMs
        val remainingMs = if (isFutureScheduled) {
            (cardScheduledMs - nowMs).coerceAtLeast(0L)
        } else {
            0L
        }
        val countdown = formatCountdown(remainingMs)
        val countdownVerbose = formatCountdownVerbose(remainingMs)
        val enrolledLabel = card?.enrolledLabel?.trim()?.takeIf { it.isNotBlank() }
        val examStartLabel = if (catalogLoaded && !examDate.isNullOrBlank()) {
            TestScheduleUtils.formatExamStartLabel(examDate, slotLabel)
        } else {
            null
        }
        val startTimeDisplay = if (catalogLoaded) {
            formatExamStartFriendly(examDate, slotLabel, nowMs)
        } else {
            null
        }
        val scheduleBadge = if (isFutureScheduled) "SCHEDULED" else "OPEN"
        val statusMessage = when {
            !catalogLoaded -> "Loading test details..."
            isFutureScheduled -> "Apply now — starts ${examStartLabel ?: "soon"}"
            else -> "Tap to apply for this test"
        }
        val actionButtonLabel = when {
            !catalogLoaded -> "Apply Now"
            else -> "Apply Now"
        }
        return AppliedTestCardUiState(
            testName = name,
            statusMessage = statusMessage,
            countdownText = countdown,
            isLocked = false,
            canStartNow = false,
            isPendingResult = false,
            isPendingResultWaiting = false,
            isReadyHighlight = false,
            catalogLoaded = catalogLoaded,
            examStartLabel = examStartLabel,
            enrolledLabel = enrolledLabel,
            scheduleBadgeLabel = scheduleBadge,
            registeredDisplay = registeredDisplay(enrolledLabel),
            durationPill = compactDurationPill(card),
            questionsPill = questionsPill(card),
            marksPill = marksPill(card),
            negativePill = negativePill(card),
            startTimeDisplay = startTimeDisplay,
            subjectFocus = card?.subcategory?.trim()?.takeIf { it.isNotBlank() } ?: interest,
            countdownVerbose = countdownVerbose,
            unlockProgress = 0f,
            showUnlockSection = false,
            actionButtonLabel = actionButtonLabel,
            actionButtonEnabled = true,
            lateJoinClosed = false,
            isSuggestApply = true,
            isSuggestApplyHighlight = catalogLoaded,
        )
    }

    fun buildHomeTestCarouselItems(
        appliedCardStates: List<AppliedTestCardUiState>,
        suggestInterests: List<String>,
        snapshots: Map<String, TestCardNew?>,
        scheduleTimerEnabled: Boolean,
        nowMs: Long,
    ): List<HomeTestCarouselItem> {
        val appliedItems = appliedCardStates.map { card ->
            HomeTestCarouselItem(
                kind = HomeTestCarouselKind.APPLIED,
                testName = card.testName,
                card = card,
            )
        }
        val suggestItems = suggestInterests.map { interest ->
            val snapshot = resolveCarouselSnapshot(interest, snapshots)
            HomeTestCarouselItem(
                kind = HomeTestCarouselKind.SUGGEST_APPLY,
                testName = interest,
                card = resolveSuggestApplyCardUiState(
                    interestLabel = interest,
                    card = snapshot,
                    scheduleTimerEnabled = scheduleTimerEnabled,
                    nowMs = nowMs,
                ),
            )
        }
        return appliedItems + suggestItems
    }

    /**
     * Suggest-apply cards stay visible even when many applied tests exist (max 4 interests).
     * Remaining slots are filled with applied tests; overflow counts hidden applied items.
     */
    fun prioritizeCarouselForDisplay(
        carouselItems: List<HomeTestCarouselItem>,
        maxVisible: Int = AppliedTestCatalogLoader.HOME_CAROUSEL_MAX_VISIBLE,
    ): Pair<List<HomeTestCarouselItem>, Int> {
        if (carouselItems.isEmpty()) return emptyList<HomeTestCarouselItem>() to 0
        val cap = maxVisible.coerceAtLeast(1)
        val suggests = carouselItems.filter { it.kind == HomeTestCarouselKind.SUGGEST_APPLY }
        val applied = carouselItems.filter { it.kind == HomeTestCarouselKind.APPLIED }
        val prioritized = suggests + applied
        val visible = prioritized.take(cap)
        val overflow = (prioritized.size - visible.size).coerceAtLeast(0)
        return visible to overflow
    }

    private fun resolveCarouselSnapshot(
        lookup: String,
        snapshots: Map<String, TestCardNew?>,
    ): TestCardNew? {
        val trimmed = lookup.trim()
        if (trimmed.isBlank()) return null
        snapshots[trimmed]?.let { return it }
        snapshots.entries.firstOrNull { (key, _) ->
            key.equals(trimmed, ignoreCase = true)
        }?.value?.let { return it }
        return snapshots.values.firstOrNull { card ->
            card != null && (
                card.title.equals(trimmed, ignoreCase = true) ||
                    card.subcategory.equals(trimmed, ignoreCase = true) ||
                    UserInterestUtils.subcategoryMatchesAnyInterest(card.title, listOf(trimmed))
                )
        }
    }

    private fun compactDurationPill(card: TestCardNew?): String {
        val raw = card?.durationLabel?.trim().orEmpty()
        if (raw.isBlank()) return "—"
        val lower = raw.lowercase(Locale.US)
        val minMatcher = DURATION_MIN_PATTERN.matcher(lower)
        val hrMatcher = DURATION_HR_PATTERN.matcher(lower)
        var totalMinutes = 0
        if (hrMatcher.find()) {
            totalMinutes += hrMatcher.group(1)?.toIntOrNull()?.times(60) ?: 0
        }
        if (minMatcher.find()) {
            totalMinutes += minMatcher.group(1)?.toIntOrNull() ?: 0
        }
        if (totalMinutes > 0) return "${totalMinutes}m"
        return raw.replace(" ", "").take(8)
    }

    private fun questionsPill(card: TestCardNew?): String {
        val count = card?.questionCountValue ?: 0
        if (count > 0) return "$count Qs"
        val parsed = card?.questionsMarks?.substringBefore("/")?.trim()?.takeIf { it.isNotBlank() }
        return parsed?.let { if (it.endsWith("Q", ignoreCase = true)) it else "$it Qs" } ?: "— Qs"
    }

    private fun marksPill(card: TestCardNew?): String {
        val marks = card?.totalMarksValue ?: 0
        if (marks > 0) return "$marks Marks"
        val parsed = card?.questionsMarks
            ?.substringAfter("/", "")
            ?.replace("marks", "", ignoreCase = true)
            ?.trim()
            ?.takeIf { it.isNotBlank() }
        return parsed?.let { if (it.contains("mark", ignoreCase = true)) it else "$it Marks" } ?: "— Marks"
    }

    private fun negativePill(card: TestCardNew?): String {
        val neg = card?.negativeMarkingText?.trim().orEmpty()
        return when {
            neg.isBlank() || neg.equals("no", ignoreCase = true) -> "No Neg"
            neg.length <= 8 -> neg
            else -> neg.take(8)
        }
    }

    private fun registeredDisplay(enrolledLabel: String?): String? {
        val raw = enrolledLabel?.trim().orEmpty()
        if (raw.isBlank()) return null
        return if (raw.contains("registered", ignoreCase = true)) raw else "$raw Registered"
    }

    private fun scheduleBadgeLabel(
        isPendingResultWaiting: Boolean,
        isPendingResult: Boolean,
        canStartNow: Boolean,
        isLocked: Boolean,
        lateJoinClosed: Boolean,
    ): String = when {
        isPendingResultWaiting -> "RESULT"
        isPendingResult -> "RESULT"
        lateJoinClosed -> "CLOSED"
        canStartNow -> "READY"
        isLocked -> "SCHEDULED"
        else -> "APPLIED"
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
        val totalLockMs = (entry.expiresAtMillis - effectiveUnlockMs).coerceAtLeast(1L)
        val countdown = formatCountdown(remainingMs)
        val countdownVerbose = formatCountdownVerbose(remainingMs)
        val unlockProgress = if (remainingMs > 0L && effectiveTimer) {
            1f - (remainingMs.toFloat() / totalLockMs.toFloat()).coerceIn(0f, 1f)
        } else {
            1f
        }
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
        val canViewResult = isPendingResult &&
            pendingResult != null &&
            AppPreferencesRepository.isPendingResultReady(pendingResult, nowMs)
        val canStartNow = !isPendingResult && joinAllowed && !isLocked && name.isNotBlank()
        val catalogLoaded = card != null && ContentRepository.hasCatalogDisplayFields(card)
        val examStartLabel = if (catalogLoaded && !examDate.isNullOrBlank()) {
            TestScheduleUtils.formatExamStartLabel(examDate, slotLabel)
        } else {
            null
        }
        val startTimeDisplay = if (catalogLoaded) {
            formatExamStartFriendly(examDate, slotLabel, nowMs)
        } else {
            null
        }
        val enrolledLabel = card?.enrolledLabel?.trim()?.takeIf { it.isNotBlank() }
        val statusMessage = when {
            isPendingResultWaiting -> "Result will be available soon"
            isPendingResult -> "View your result"
            serverAuthoritative && !entry.startBlockReason.isNullOrBlank() && !canStartNow ->
                entry.startBlockReason!!.trim()
            lateJoinClosed -> "Late join closed"
            isLocked && effectiveTimer && cardScheduledMs != null && cardScheduledMs > nowMs ->
                "Starts ${TestScheduleUtils.formatExamStartLabel(examDate, slotLabel)}"
            isLocked -> "Starts in $countdown"
            else -> "Ready to start"
        }
        val actionButtonLabel = when {
            isPendingResultWaiting -> "Result Pending"
            canViewResult -> "View Result"
            lateJoinClosed -> "Late Join Closed"
            isLocked && effectiveTimer -> formatLockUntilLabel(examDate, slotLabel, nowMs)
            isLocked -> "Start Test (Locked)"
            canStartNow -> "Start Test"
            else -> "Open Test"
        }
        val actionButtonEnabled = canViewResult || canStartNow
        val showUnlockSection = isLocked && !isPendingResult && effectiveTimer
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
            scheduleBadgeLabel = scheduleBadgeLabel(
                isPendingResultWaiting = isPendingResultWaiting,
                isPendingResult = isPendingResult,
                canStartNow = canStartNow,
                isLocked = isLocked,
                lateJoinClosed = lateJoinClosed,
            ),
            registeredDisplay = registeredDisplay(enrolledLabel),
            durationPill = compactDurationPill(card),
            questionsPill = questionsPill(card),
            marksPill = marksPill(card),
            negativePill = negativePill(card),
            startTimeDisplay = startTimeDisplay,
            subjectFocus = card?.subcategory?.trim()?.takeIf { it.isNotBlank() },
            countdownVerbose = countdownVerbose,
            unlockProgress = unlockProgress,
            showUnlockSection = showUnlockSection,
            actionButtonLabel = actionButtonLabel,
            actionButtonEnabled = actionButtonEnabled,
            lateJoinClosed = lateJoinClosed,
            isSuggestApply = false,
            isSuggestApplyHighlight = false,
        )
    }

    fun buildHomeAppliedTestsUiState(
        appliedSeries: List<AppPreferencesRepository.AppliedTestSeriesEntry>,
        snapshots: Map<String, TestCardNew?>,
        scheduleTimerEnabled: Boolean,
        pendingResult: AppPreferencesRepository.PendingResultState?,
        nowMs: Long,
        interestSubcategories: List<String> = emptyList(),
    ): HomeAppliedTestsUiState {
        val activeEntries = appliedSeries
            .filter { it.isActive(nowMs) }
            .sortedBy { (it.startUnlockAtMillis(nowMs) - nowMs).coerceAtLeast(0L) }
        val hiddenExpiredCount = appliedSeries.count { !it.isActive(nowMs) }
        val cardStates = activeEntries.map { entry ->
            val snapshot = resolveCarouselSnapshot(entry.testName.trim(), snapshots)
            resolveCardUiState(
                entry = entry,
                card = snapshot,
                scheduleTimerEnabled = scheduleTimerEnabled,
                pendingResult = pendingResult,
                nowMs = nowMs,
            )
        }
        val pendingInterests = resolvePendingInterestTests(
            interests = interestSubcategories,
            activeEntries = activeEntries,
        )
        val carouselItems = buildHomeTestCarouselItems(
            appliedCardStates = cardStates,
            suggestInterests = pendingInterests,
            snapshots = snapshots,
            scheduleTimerEnabled = scheduleTimerEnabled,
            nowMs = nowMs,
        )
        val (visibleCarouselItems, carouselOverflowCount) = prioritizeCarouselForDisplay(carouselItems)
        val readyCount = cardStates.count { it.canStartNow }
        val nextEligible = activeEntries.firstOrNull { entry ->
            AppPreferencesRepository.canStartTest(entry.testName, pendingResult) &&
                cardStates.firstOrNull { it.testName.equals(entry.testName, ignoreCase = true) }?.canStartNow == true
        } ?: activeEntries.firstOrNull {
            AppPreferencesRepository.canStartTest(it.testName, pendingResult)
        }
        val total = activeEntries.size
        val hasSuggestCards = carouselItems.any { it.kind == HomeTestCarouselKind.SUGGEST_APPLY }
        val firstSuggestName = carouselItems
            .firstOrNull { it.kind == HomeTestCarouselKind.SUGGEST_APPLY }
            ?.testName
            ?.trim()
            ?.takeIf { it.isNotBlank() }
        val startTestSubtitle = when {
            total == 0 && hasSuggestCards -> "Tap a card below to apply"
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
            total == 0 && firstSuggestName != null -> firstSuggestName
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
            carouselItems = carouselItems,
            visibleCarouselItems = visibleCarouselItems,
            carouselOverflowCount = carouselOverflowCount,
        )
    }
}