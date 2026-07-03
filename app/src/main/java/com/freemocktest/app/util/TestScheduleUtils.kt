package com.freemocktest.app.util

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.regex.Pattern

/**
 * Exam start scheduling aligned with server [EXAM_TIMEZONE_OFFSET_MINUTES] default (IST / +05:30).
 */
object TestScheduleUtils {
    private val EXAM_ZONE: ZoneId = ZoneId.of("Asia/Kolkata")

    private val SLOT_PATTERN = Pattern.compile(
        "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?",
        Pattern.CASE_INSENSITIVE,
    )

    /**
     * Wall-clock millis when the user may start the test, or null when no exam schedule is set.
     */
    fun parseExamStartMillis(examDate: String?, slotLabel: String?): Long? {
        val dateStr = examDate?.trim()?.takeIf { it.isNotBlank() } ?: return null
        val localDate = parseLocalExamDate(dateStr) ?: return null
        val slot = parseSlotTime(slotLabel)
        val localDateTime = if (slot != null) {
            localDate.atTime(slot.first, slot.second)
        } else {
            localDate.atStartOfDay()
        }
        return localDateTime.atZone(EXAM_ZONE).toInstant().toEpochMilli()
    }

    fun isExamStartAllowed(examDate: String?, slotLabel: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
        val startMs = parseExamStartMillis(examDate, slotLabel) ?: return true
        return nowMs >= startMs
    }

    fun isLateJoinWindowClosed(
        examDate: String?,
        slotLabel: String?,
        lateJoinMinutes: Int,
        nowMs: Long = System.currentTimeMillis(),
    ): Boolean {
        val lateMin = lateJoinMinutes.coerceAtLeast(0)
        if (lateMin <= 0) return false
        val startMs = parseExamStartMillis(examDate, slotLabel) ?: return false
        return nowMs > startMs + lateMin * 60_000L
    }

    /** True when user may enter the test (started and within late-join window, if configured). */
    fun isExamJoinAllowed(
        examDate: String?,
        slotLabel: String?,
        lateJoinMinutes: Int = 0,
        nowMs: Long = System.currentTimeMillis(),
    ): Boolean {
        if (!isExamStartAllowed(examDate, slotLabel, nowMs)) return false
        if (isLateJoinWindowClosed(examDate, slotLabel, lateJoinMinutes, nowMs)) return false
        return true
    }

    fun formatLateJoinClosedLabel(examDate: String?, slotLabel: String?, lateJoinMinutes: Int): String {
        val startMs = parseExamStartMillis(examDate, slotLabel) ?: return "the late join window"
        val endMs = startMs + lateJoinMinutes.coerceAtLeast(0) * 60_000L
        val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.getDefault())
        return formatter.format(java.time.Instant.ofEpochMilli(endMs).atZone(EXAM_ZONE))
    }

    /** User-facing reason when join is blocked; null when join is allowed. */
    fun examJoinBlockMessage(
        examDate: String?,
        slotLabel: String?,
        lateJoinMinutes: Int = 0,
        nowMs: Long = System.currentTimeMillis(),
    ): String? {
        if (!isExamStartAllowed(examDate, slotLabel, nowMs)) {
            return "Test starts on ${formatExamStartLabel(examDate, slotLabel)}"
        }
        if (isLateJoinWindowClosed(examDate, slotLabel, lateJoinMinutes, nowMs)) {
            return "Late join window closed at ${formatLateJoinClosedLabel(examDate, slotLabel, lateJoinMinutes)}"
        }
        return null
    }

    fun formatExamStartLabel(examDate: String?, slotLabel: String?): String {
        val startMs = parseExamStartMillis(examDate, slotLabel) ?: return "the scheduled time"
        val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.getDefault())
        return formatter.format(java.time.Instant.ofEpochMilli(startMs).atZone(EXAM_ZONE))
    }

    fun isExamJoinAllowedWhenScheduleTimer(
        scheduleTimerEnabled: Boolean,
        examDate: String?,
        slotLabel: String?,
        lateJoinMinutes: Int = 0,
        nowMs: Long = System.currentTimeMillis(),
    ): Boolean {
        if (!scheduleTimerEnabled) return true
        return isExamJoinAllowed(examDate, slotLabel, lateJoinMinutes, nowMs)
    }

    fun examJoinBlockMessageWhenScheduleTimer(
        scheduleTimerEnabled: Boolean,
        examDate: String?,
        slotLabel: String?,
        lateJoinMinutes: Int = 0,
        nowMs: Long = System.currentTimeMillis(),
    ): String? {
        if (!scheduleTimerEnabled) return null
        return examJoinBlockMessage(examDate, slotLabel, lateJoinMinutes, nowMs)
    }

    /**
     * Resolve unlock/expiry for a locally stored applied test entry.
     * - Timer OFF: immediate start; long TTL (cycle/server governs re-apply).
     * - Timer ON: lock until exam date/slot; expiry uses late-join window from scheduled start.
     */
    data class AppliedSeriesTiming(
        val unlockAtMillis: Long,
        val expiresAtMillis: Long,
        val scheduledStartAtMillis: Long,
    )

    /** Keep applied entries visible when schedule timer is off (also used for local reconcile). */
    const val APPLIED_SERIES_NO_TIMER_TTL_MS = 90L * 24 * 60 * 60 * 1000

    /** Default join window for scheduled tests when admin omitted lateJoinMinutes. */
    private const val DEFAULT_SCHEDULED_JOIN_WINDOW_MS = 24L * 60 * 60 * 1000

    fun resolveAppliedSeriesTiming(
        nowMs: Long,
        scheduleTimerEnabled: Boolean,
        examDate: String?,
        slotLabel: String?,
        lateJoinMinutes: Int = 0,
    ): AppliedSeriesTiming {
        if (!scheduleTimerEnabled) {
            return AppliedSeriesTiming(
                unlockAtMillis = nowMs,
                expiresAtMillis = nowMs + APPLIED_SERIES_NO_TIMER_TTL_MS,
                scheduledStartAtMillis = 0L,
            )
        }
        val scheduledStart = parseExamStartMillis(examDate, slotLabel)
        if (scheduledStart == null) {
            return AppliedSeriesTiming(
                unlockAtMillis = nowMs,
                expiresAtMillis = nowMs + APPLIED_SERIES_NO_TIMER_TTL_MS,
                scheduledStartAtMillis = 0L,
            )
        }
        val unlockAt = if (scheduledStart > nowMs) scheduledStart else nowMs
        val joinWindowMs = if (lateJoinMinutes > 0) {
            lateJoinMinutes.coerceAtLeast(0) * 60_000L
        } else {
            DEFAULT_SCHEDULED_JOIN_WINDOW_MS
        }
        val expiresAt = maxOf(scheduledStart + joinWindowMs, unlockAt + 60_000L)
        return AppliedSeriesTiming(
            unlockAtMillis = unlockAt,
            expiresAtMillis = expiresAt,
            scheduledStartAtMillis = scheduledStart,
        )
    }

    fun isTestListingVisible(
        validUntilIso: String?,
        publishAt: String?,
        unpublishAt: String?,
        nowMs: Long = System.currentTimeMillis(),
    ): Boolean {
        if (isPastValidUntil(validUntilIso, nowMs)) return false
        if (isBeforeScheduledPublish(publishAt, nowMs)) return false
        if (isAfterScheduledUnpublish(unpublishAt, nowMs)) return false
        return true
    }

    fun isPastValidUntil(validUntilIso: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
        val raw = validUntilIso?.trim()?.takeIf { it.isNotBlank() } ?: return false
        val dateOnly = if (raw.length >= 10) raw.substring(0, 10) else raw
        val localDate = parseLocalExamDate(dateOnly) ?: return false
        val endMs = localDate.atTime(23, 59, 59, 999_000_000)
            .atZone(EXAM_ZONE)
            .toInstant()
            .toEpochMilli()
        return nowMs > endMs
    }

    fun isBeforeScheduledPublish(publishAt: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
        val ms = parseIsoMillis(publishAt) ?: return false
        return nowMs < ms
    }

    fun isAfterScheduledUnpublish(unpublishAt: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
        val ms = parseIsoMillis(unpublishAt) ?: return false
        return nowMs >= ms
    }

    fun parseIsoMillis(iso: String?): Long? {
        val raw = iso?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return try {
            java.time.Instant.parse(raw).toEpochMilli()
        } catch (_: Exception) {
            try {
                java.time.ZonedDateTime.parse(raw).toInstant().toEpochMilli()
            } catch (_: Exception) {
                try {
                    LocalDateTime.parse(raw, DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        .atZone(EXAM_ZONE)
                        .toInstant()
                        .toEpochMilli()
                } catch (_: Exception) {
                    null
                }
            }
        }
    }

    fun isResultReleaseDeferred(resultVisibility: String?): Boolean {
        return resultVisibility?.trim()?.equals("after_result_time", ignoreCase = true) == true
    }

    fun resolveResultReleaseMillisForSubmit(
        resultVisibility: String?,
        resultReleaseAtMs: Long?,
        defaultReleaseAtMs: Long,
    ): Long {
        if (!isResultReleaseDeferred(resultVisibility)) return 0L
        return resultReleaseAtMs?.takeIf { it > 0L } ?: defaultReleaseAtMs
    }

    private fun parseLocalExamDate(raw: String): LocalDate? {
        val trimmed = raw.trim()
        val patterns = listOf(
            "yyyy-MM-dd",
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd'T'HH:mm",
            "d MMM yyyy HH:mm",
            "d MMM yyyy",
        )
        for (pattern in patterns) {
            val formatter = DateTimeFormatter.ofPattern(pattern, Locale.US)
            try {
                return if (pattern.contains("HH:mm")) {
                    LocalDateTime.parse(trimmed, formatter).toLocalDate()
                } else {
                    LocalDate.parse(trimmed, formatter)
                }
            } catch (_: Exception) {
                // try next pattern
            }
        }
        return null
    }

    private fun parseSlotTime(slotLabel: String?): Pair<Int, Int>? {
        val raw = slotLabel?.trim()?.lowercase(Locale.US).orEmpty()
        if (raw.isBlank()) return null
        val matcher = SLOT_PATTERN.matcher(raw)
        if (!matcher.find()) return null
        var hour = matcher.group(1)?.toIntOrNull() ?: return null
        val minute = matcher.group(2)?.toIntOrNull() ?: 0
        val meridiem = matcher.group(3)?.lowercase(Locale.US).orEmpty()
        if (minute !in 0..59) return null
        if (meridiem.isNotEmpty()) {
            if (hour !in 1..12) return null
            if (meridiem == "pm" && hour != 12) hour += 12
            if (meridiem == "am" && hour == 12) hour = 0
        } else if (hour !in 0..23) {
            return null
        }
        return hour to minute
    }
}
