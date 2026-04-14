package com.example.mocktestapp.data

import android.util.Log
import com.example.mocktestapp.data.remote.NewsArticleDto
import com.example.mocktestapp.data.remote.RetrofitProvider
import com.example.mocktestapp.newui.alerts.ManualExamAlertContent
import com.example.mocktestapp.newui.alerts.ManualJobAlertContent
import com.example.mocktestapp.newui.news.ManualNewsContent
import com.example.mocktestapp.newui.news.ManualNewsItem
import com.example.mocktestapp.newui.tests.TestCardNew
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Loads public feed + test catalog from API; falls back to bundled manual content when empty or offline.
 */
object ContentRepository {
    private const val TAG = "ContentRepository"

    private val articleMemory = ConcurrentHashMap<String, ManualNewsItem>()

    suspend fun loadNewsFeed(feedKind: String): List<ManualNewsItem> = withContext(Dispatchers.IO) {
        val kind = feedKind.lowercase(Locale.US)
        try {
            val resp = RetrofitProvider.publicApi.listNews(feedKind = kind, limit = 50, offset = 0)
            val mapped = resp.items.map { it.toManualNewsItem() }
            mapped.forEach { articleMemory[it.id] = it }
            if (mapped.isNotEmpty()) {
                mapped
            } else {
                manualFallback(kind)
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadNewsFeed $kind", e)
            manualFallback(kind)
        }
    }

    suspend fun resolveArticle(articleId: String): ManualNewsItem? = withContext(Dispatchers.IO) {
        val id = articleId.trim()
        if (id.isEmpty()) return@withContext null
        ManualNewsContent.itemById(id)
            ?: ManualJobAlertContent.itemById(id)
            ?: ManualExamAlertContent.itemById(id)
            ?: articleMemory[id]
            ?: runCatching {
                val remote = RetrofitProvider.publicApi.getNewsArticle(id).article.toManualNewsItem()
                articleMemory[id] = remote
                remote
            }.getOrElse {
                Log.w(TAG, "resolveArticle $id", it)
                null
            }
    }

    suspend fun loadTestsForSubcategory(subcategory: String): List<TestCardNew> = withContext(Dispatchers.IO) {
        val sub = subcategory.trim().ifBlank { "Topic" }
        try {
            val resp = RetrofitProvider.publicApi.listTests(subcategory = sub, limit = 40)
            val mapped = resp.items.map { row ->
                val meta = row.metaLine.ifBlank {
                    "${row.questionCount} Questions · ${row.durationMinutes} min"
                }
                TestCardNew(title = row.title, meta = meta)
            }
            if (mapped.isNotEmpty()) {
                mapped
            } else {
                defaultTests(sub)
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadTestsForSubcategory $sub", e)
            defaultTests(sub)
        }
    }

    private fun manualFallback(kind: String): List<ManualNewsItem> = when (kind) {
        "job" -> ManualJobAlertContent.items
        "exam" -> ManualExamAlertContent.items
        else -> ManualNewsContent.items
    }

    private fun defaultTests(subcategory: String): List<TestCardNew> = listOf(
        TestCardNew(
            title = "${subcategory.trim()} Sprint",
            meta = "10 Questions · 12 min",
        ),
    )

    private fun NewsArticleDto.toManualNewsItem(): ManualNewsItem {
        val bodyText = body?.ifBlank { summary } ?: summary
        return ManualNewsItem(
            id = id,
            headline = headline,
            summary = summary,
            category = category.ifBlank { "News" },
            dateLabel = formatPublishedLabel(publishedAt),
            body = bodyText,
        )
    }

    private fun formatPublishedLabel(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try {
            val z = ZonedDateTime.parse(iso)
            val local = z.withZoneSameInstant(ZoneId.systemDefault())
            DateTimeFormatter.ofPattern("d MMM yyyy, hh:mm a", Locale.US).format(local)
        } catch (_: Exception) {
            iso.take(10)
        }
    }
}
