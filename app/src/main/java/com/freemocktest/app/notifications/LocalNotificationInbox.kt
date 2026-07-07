package com.freemocktest.app.notifications

import android.content.Context
import com.freemocktest.app.data.ContentRepository
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.util.UUID

object LocalNotificationInbox {
    private const val PREFS_NAME = "mocktest_local_notifications"
    private const val KEY_ITEMS = "items_json"
    private const val MAX_ITEMS = 80
    private val CONTENT_DEDUPE_WINDOW: Duration = Duration.ofHours(24)

    private data class LocalItem(
        val id: String,
        val title: String,
        val message: String,
        val deepLink: String?,
        val createdAt: String,
        val dedupeKey: String?,
    )

    fun save(
        context: Context,
        title: String,
        message: String,
        deepLink: String?,
        dedupeKey: String? = null,
    ) {
        val safeTitle = title.trim().ifBlank { "Notification" }.take(120)
        val safeMessage = message.trim().ifBlank { "No message" }.take(500)
        val safeDeepLink = deepLink?.trim()?.takeIf { it.isNotBlank() }?.take(300)
        val safeDedupeKey = dedupeKey?.trim()?.takeIf { it.isNotBlank() }?.take(200)
        val now = Instant.now().toString()

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = readLocalItems(prefs.getString(KEY_ITEMS, null))
        val filtered = existing.filterNot { item ->
            shouldDropDuplicate(item, safeTitle, safeMessage, safeDeepLink, safeDedupeKey, now)
        }
        val itemId = when {
            !safeDedupeKey.isNullOrBlank() -> PushNotificationIdentity.stableInboxItemId(safeDedupeKey)
            else -> "local-${UUID.randomUUID()}"
        }
        val next = mutableListOf(
            LocalItem(
                id = itemId,
                title = safeTitle,
                message = safeMessage,
                deepLink = safeDeepLink,
                createdAt = now,
                dedupeKey = safeDedupeKey,
            ),
        )
        next += filtered
        val compact = next.take(MAX_ITEMS)
        prefs.edit().putString(KEY_ITEMS, toJson(compact)).apply()
    }

    fun read(context: Context): List<ContentRepository.PushNotificationItemRemote> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return readLocalItems(prefs.getString(KEY_ITEMS, null))
            .map {
                ContentRepository.PushNotificationItemRemote(
                    id = it.id,
                    title = it.title,
                    message = it.message,
                    deepLink = it.deepLink,
                    createdAt = it.createdAt,
                )
            }
            .sortedByDescending { it.createdAt.orEmpty() }
    }

    fun clearAll(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(KEY_ITEMS).apply()
    }

    private fun shouldDropDuplicate(
        item: LocalItem,
        title: String,
        message: String,
        deepLink: String?,
        dedupeKey: String?,
        nowIso: String,
    ): Boolean {
        if (!dedupeKey.isNullOrBlank()) {
            return item.dedupeKey == dedupeKey || item.id == PushNotificationIdentity.stableInboxItemId(dedupeKey)
        }
        if (item.dedupeKey != null) return false
        if (item.title != title || item.message != message) return false
        val itemDeepLink = item.deepLink.orEmpty()
        val nextDeepLink = deepLink.orEmpty()
        if (itemDeepLink != nextDeepLink) return false
        return isWithinContentDedupeWindow(item.createdAt, nowIso)
    }

    private fun isWithinContentDedupeWindow(previousIso: String, nowIso: String): Boolean {
        val previous = runCatching { Instant.parse(previousIso) }.getOrNull() ?: return false
        val now = runCatching { Instant.parse(nowIso) }.getOrNull() ?: return false
        return Duration.between(previous, now).abs() <= CONTENT_DEDUPE_WINDOW
    }

    private fun readLocalItems(raw: String?): List<LocalItem> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val id = obj.optString("id").trim()
                    val title = obj.optString("title").trim()
                    val message = obj.optString("message").trim()
                    if (id.isBlank() || title.isBlank() || message.isBlank()) continue
                    add(
                        LocalItem(
                            id = id.take(100),
                            title = title.take(120),
                            message = message.take(500),
                            deepLink = obj.optString("deepLink").trim().takeIf { it.isNotBlank() }?.take(300),
                            createdAt = obj.optString("createdAt").trim().ifBlank { Instant.now().toString() },
                            dedupeKey = obj.optString("dedupeKey").trim().takeIf { it.isNotBlank() }?.take(200),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun toJson(items: List<LocalItem>): String {
        val arr = JSONArray()
        items.forEach { item ->
            val obj = JSONObject()
                .put("id", item.id)
                .put("title", item.title)
                .put("message", item.message)
                .put("createdAt", item.createdAt)
            if (!item.deepLink.isNullOrBlank()) {
                obj.put("deepLink", item.deepLink)
            }
            if (!item.dedupeKey.isNullOrBlank()) {
                obj.put("dedupeKey", item.dedupeKey)
            }
            arr.put(obj)
        }
        return arr.toString()
    }
}
