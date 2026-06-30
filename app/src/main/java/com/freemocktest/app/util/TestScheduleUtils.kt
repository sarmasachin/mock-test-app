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

    fun formatExamStartLabel(examDate: String?, slotLabel: String?): String {
        val startMs = parseExamStartMillis(examDate, slotLabel) ?: return "the scheduled time"
        val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.getDefault())
        return formatter.format(java.time.Instant.ofEpochMilli(startMs).atZone(EXAM_ZONE))
    }

    /**
     * When a future exam is scheduled, unlock at that time; otherwise use the post-apply CMS lock.
     */
    fun resolveUnlockAtMillis(
        nowMs: Long,
        applyLockAtMillis: Long,
        examDate: String?,
        slotLabel: String?,
    ): Pair<Long, Long> {
        val scheduledStart = parseExamStartMillis(examDate, slotLabel)
        val unlockAt = when {
            scheduledStart != null && scheduledStart > nowMs -> scheduledStart
            else -> applyLockAtMillis
        }
        val scheduledStored = scheduledStart?.takeIf { it > 0L } ?: 0L
        return unlockAt to scheduledStored
    }

    /** Active window starts at unlock; for scheduled exams keep visible through the take window. */
    fun resolveExpiresAtMillis(
        unlockAtMillis: Long,
        activeWindowMs: Long,
        scheduledStartAtMillis: Long = 0L,
    ): Long {
        val safeWindow = activeWindowMs.coerceAtLeast(60_000L)
        val base = unlockAtMillis + safeWindow
        return if (scheduledStartAtMillis > 0L) {
            maxOf(base, scheduledStartAtMillis + safeWindow)
        } else {
            base
        }
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
