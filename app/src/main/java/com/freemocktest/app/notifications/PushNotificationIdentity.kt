package com.freemocktest.app.notifications

import kotlin.math.abs

/**
 * Stable tray notification identity so duplicate pushes for the same logical event
 * replace the previous tray entry instead of stacking.
 */
object PushNotificationIdentity {
    fun resolveDedupeKey(data: Map<String, String>): String {
        val explicit = data["dedupeKey"]?.trim().orEmpty()
        if (explicit.isNotBlank()) return explicit
        val campaignId = data["campaignId"]?.trim().orEmpty()
        if (campaignId.isNotBlank()) return "campaign:$campaignId"
        return ""
    }

    fun resolveDedupeKey(
        data: Map<String, String>,
        title: String,
        body: String,
        deepLink: String,
    ): String {
        val fromPayload = resolveDedupeKey(data)
        if (fromPayload.isNotBlank()) return fromPayload
        val fallback = listOf(title.trim(), body.trim(), deepLink.trim()).joinToString("|")
        return if (fallback == "||") "" else "content:$fallback"
    }

    fun stableTrayNotificationId(key: String): Int {
        val trimmed = key.trim()
        if (trimmed.isBlank()) return 0
        val hash = trimmed.hashCode()
        return when (hash) {
            Int.MIN_VALUE -> 1
            0 -> 1
            else -> abs(hash)
        }
    }

    fun stableInboxItemId(dedupeKey: String): String {
        val trimmed = dedupeKey.trim()
        if (trimmed.isBlank()) return ""
        return "push-${stableTrayNotificationId(trimmed)}"
    }
}
