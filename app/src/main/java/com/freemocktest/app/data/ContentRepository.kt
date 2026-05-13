package com.freemocktest.app.data

import android.util.Log
import com.freemocktest.app.data.remote.NewsArticleDto
import com.freemocktest.app.data.remote.RetrofitProvider
import org.json.JSONArray
import org.json.JSONObject
import com.freemocktest.app.newui.alerts.ManualExamAlertContent
import com.freemocktest.app.newui.alerts.ManualJobAlertContent
import com.freemocktest.app.newui.news.ManualNewsContent
import com.freemocktest.app.newui.news.ManualNewsItem
import com.freemocktest.app.newui.tests.TestCardNew
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.LinkedHashMap
import java.util.concurrent.ConcurrentHashMap
import kotlin.jvm.Volatile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Loads public feed + test catalog from API; falls back to bundled manual content when empty or offline.
 */
object ContentRepository {
    private const val TAG = "ContentRepository"
    private const val MAX_CACHED_TEST_CARDS = 24
    private const val MAX_CACHED_TEST_LIST_KEYS = 20
    private const val MAX_CACHED_QUIZ_QUESTION_KEYS = 16

    private val articleMemory = ConcurrentHashMap<String, ManualNewsItem>()
    private val newsFeedListMemory = ConcurrentHashMap<String, List<ManualNewsItem>>()
    private val testCardMemory = ConcurrentHashMap<String, TestCardNew>()
    private val testListBySubcategoryMemory = ConcurrentHashMap<String, List<TestCardNew>>()
    private val quizQuestionsMemory = ConcurrentHashMap<String, List<QuizQuestionRemote>>()
    @Volatile
    private var profileMenuItemsMemory: List<ProfileMenuItemRemote>? = null
    @Volatile
    private var homeContentMemory: HomeContentRemote? = null
    @Volatile
    private var instructionContentMemory: InstructionContentRemote? = null

    data class DailyDigestRemote(
        val questionPrompt: String,
        val options: List<String>,
        val correctIndex: Int,
        val factText: String,
    )
    data class DailyQuizRemote(
        val questionPrompt: String,
        val options: List<String>,
        val correctIndex: Int,
        val explanation: String,
    )
    data class QuizQuestionRemote(
        val title: String,
        val options: List<String>,
        val correctIndex: Int,
        val explanation: String,
    )
    data class TestAdvancedConfigRemote(
        val publishAt: String?,
        val unpublishAt: String?,
        val resultVisibility: String,
        val reattemptCooldownMinutes: Int,
        val lateJoinMinutes: Int,
        val notifyBeforeMinutes: Int,
        val resumeEnabled: Boolean,
        val shuffleQuestions: Boolean,
        val shuffleOptions: Boolean,
        val fullscreenRequired: Boolean,
        val copyPasteBlocked: Boolean,
        val notifyOnPublish: Boolean,
    )
    data class HomeSectionRemote(
        val id: String,
        val title: String,
        val items: List<String>,
    )
    data class HomeQuickActionItemRemote(
        val title: String,
        val actionKey: String,
        val iconKey: String?,
    )
    data class HomeQuickActionSectionRemote(
        val id: String,
        val title: String,
        val items: List<HomeQuickActionItemRemote>,
    )
    data class HomeNewsSlideRemote(
        val id: String,
        val articleId: String,
        val headline: String?,
        val imageUrl: String,
    )
    data class HomeContentRemote(
        val welcomeText: String?,
        val quickActionsTitle: String?,
        val themePreset: String?,
        val promoWidgetEnabled: Boolean,
        val promoWidgetHtml: String?,
        val studentUpdateWidgetEnabled: Boolean,
        val studentUpdateWidgetHtml: String?,
        val newsCategoryMenu: List<String>,
        val jobCategoryMenu: List<String>,
        val examCategoryMenu: List<String>,
        val sections: List<HomeSectionRemote>,
        val quickActionSections: List<HomeQuickActionSectionRemote>,
        val banners: List<String>,
        val newsSlides: List<HomeNewsSlideRemote>,
        val startSeriesLockSeconds: Int,
        val startSeriesActiveWindowMinutes: Int,
    )
    data class SubmitApplicationContentRemote(
        val title: String?,
        val benefitsTitle: String?,
        val submitButtonLabel: String?,
        val successMessage: String?,
        val bulletItems: List<String>,
    )
    data class InstructionContentRemote(
        val pageTitle: String?,
        val cardTitle: String?,
        val startButtonLabel: String?,
        val submitDialogBrand: String?,
        val submitDialogTitle: String?,
        val submitDialogSubtitle: String?,
        val postSubmitCardTitle: String?,
        val postSubmitCardReadyTitle: String?,
        val postSubmitCardDateLabel: String?,
        val postSubmitCardPendingMessage: String?,
        val postSubmitCardReadyMessage: String?,
        val postSubmitCardButtonLabel: String?,
        val postSubmitCardLines: List<String>,
        val questionNavigationMode: String?,
        val items: List<String>,
    )
    data class ProfileMenuItemRemote(
        val id: String,
        val title: String,
        val subtitle: String,
        val path: String,
        val enabled: Boolean,
    )
    data class ExamCategoryItemRemote(
        val id: String,
        val level1: String,
        val level2: String,
        val level3: String,
        val iconKey: String?,
        val enabled: Boolean,
    )
    data class PollItemRemote(
        val id: String,
        val question: String,
        val options: List<String>,
        val allowMultiple: Boolean,
        val createdAt: String?,
    )
    data class PollModalSettingsRemote(
        val showHomePopup: Boolean,
        val items: List<PollItemRemote>,
    )
    data class PollVoteResultRemote(
        val ok: Boolean,
        val pollId: String,
        val hasVoted: Boolean,
        val optionIndexes: List<Int>,
        val counts: List<Int>,
    )
    data class PushNotificationItemRemote(
        val id: String,
        val title: String,
        val message: String,
        val deepLink: String?,
        val createdAt: String?,
    )
    data class ShareContentRemote(
        val title: String?,
        val body: String?,
    )
    data class SignupRegionRemote(
        val state: String,
        val districts: List<String>,
    )
    data class LeaderboardItemRemote(
        val rank: Int,
        val userId: String,
        val name: String,
        val city: String,
        val state: String,
        val score: Int,
        val totalCorrect: Int,
        val totalQuestions: Int,
    )
    data class LeaderboardTestSummaryRemote(
        val testId: String,
        val testTitle: String,
        val attemptsCount: Int,
        val participantsCount: Int,
    )
    data class LeaderboardFilterTestRemote(
        val id: String,
        val title: String,
    )
    data class LeaderboardFiltersRemote(
        val tests: List<LeaderboardFilterTestRemote>,
        val cities: List<String>,
        val states: List<String>,
    )

    private fun TestCardNew.toAdvancedConfigRemote() = TestAdvancedConfigRemote(
        publishAt = publishAt,
        unpublishAt = unpublishAt,
        resultVisibility = resultVisibility ?: "immediate",
        reattemptCooldownMinutes = reattemptCooldownMinutes.coerceAtLeast(0),
        lateJoinMinutes = lateJoinMinutes.coerceAtLeast(0),
        notifyBeforeMinutes = notifyBeforeMinutes.coerceAtLeast(0),
        resumeEnabled = resumeEnabled,
        shuffleQuestions = shuffleQuestions,
        shuffleOptions = shuffleOptions,
        fullscreenRequired = fullscreenRequired,
        copyPasteBlocked = copyPasteBlocked,
        notifyOnPublish = notifyOnPublish,
    )

    suspend fun loadCachedNewsFeed(feedKind: String): List<ManualNewsItem> = withContext(Dispatchers.IO) {
        val kind = feedKind.lowercase(Locale.US)
        newsFeedListMemory[kind]?.let { return@withContext it }
        val raw = AppPreferencesRepository.peekCachedNewsFeed(kind) ?: return@withContext emptyList()
        val parsed = runCatching { decodeNewsFeedItemsJson(raw) }.getOrNull()
            ?: return@withContext emptyList()
        if (parsed.isNotEmpty()) {
            parsed.forEach { articleMemory[it.id] = it }
            newsFeedListMemory[kind] = parsed
        }
        parsed
    }

    suspend fun loadNewsFeed(feedKind: String): List<ManualNewsItem> = withContext(Dispatchers.IO) {
        val kind = feedKind.lowercase(Locale.US)
        try {
            val resp = RetrofitProvider.publicApi.listNews(feedKind = kind, limit = 50, offset = 0)
            val mapped = resp.items.map { it.toManualNewsItem() }
            mapped.forEach { articleMemory[it.id] = it }
            if (mapped.isNotEmpty()) {
                runCatching {
                    AppPreferencesRepository.saveCachedNewsFeedNow(kind, encodeNewsFeedItemsJson(mapped))
                }.onFailure { Log.w(TAG, "saveCachedNewsFeed $kind", it) }
                newsFeedListMemory[kind] = mapped
                mapped
            } else {
                manualFallback(kind)
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadNewsFeed $kind", e)
            manualFallback(kind)
        }
    }

    private fun encodeNewsFeedItemsJson(items: List<ManualNewsItem>): String {
        val arr = JSONArray()
        items.forEach { item ->
            val o = JSONObject()
            o.put("id", item.id)
            o.put("headline", item.headline)
            o.put("summary", item.summary)
            o.put("category", item.category)
            o.put("dateLabel", item.dateLabel)
            o.put("body", item.body)
            item.featureImageUrl?.let { if (it.isNotBlank()) o.put("featureImageUrl", it) }
            arr.put(o)
        }
        return JSONObject().put("items", arr).toString()
    }

    private fun decodeNewsFeedItemsJson(raw: String): List<ManualNewsItem>? {
        if (raw.isBlank()) return null
        val root = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        val arr = root.optJSONArray("items") ?: return null
        val out = ArrayList<ManualNewsItem>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id").trim()
            if (id.isEmpty()) continue
            val headline = o.optString("headline")
            val summary = o.optString("summary")
            val category = o.optString("category").trim().ifBlank { "News" }
            val dateLabel = o.optString("dateLabel")
            val bodyRaw = o.optString("body").trim()
            val body = bodyRaw.ifBlank { summary }
            val featureUrl = o.optString("featureImageUrl").trim().takeIf { it.isNotEmpty() }
            out.add(
                ManualNewsItem(
                    id = id,
                    headline = headline,
                    summary = summary,
                    category = category,
                    dateLabel = dateLabel,
                    body = body,
                    featureImageUrl = featureUrl,
                ),
            )
        }
        return out
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

    suspend fun loadCachedTestsForSubcategory(subcategory: String): List<TestCardNew> = withContext(Dispatchers.IO) {
        val sub = subcategory.trim().ifBlank { "Topic" }
        val key = sub.lowercase(Locale.US)
        testListBySubcategoryMemory[key]?.let { return@withContext it }
        val raw = AppPreferencesRepository.peekCachedTestsListsBlob() ?: return@withContext emptyList()
        val map = linkedKeyedJsonArrayBlobFromJson(raw)
        val arr = map[key] ?: return@withContext emptyList()
        val out = ArrayList<TestCardNew>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            decodeTestCardNew(o)?.let { card ->
                out.add(card)
                val tKey = card.title.trim().lowercase(Locale.US)
                if (tKey.isNotBlank()) testCardMemory[tKey] = card
            }
        }
        if (out.isNotEmpty()) {
            testListBySubcategoryMemory[key] = out
        }
        out
    }

    suspend fun loadTestsForSubcategory(subcategory: String, forceRefresh: Boolean = false): List<TestCardNew> = withContext(Dispatchers.IO) {
        val sub = subcategory.trim().ifBlank { "Topic" }
        val key = sub.lowercase(Locale.US)
        if (!forceRefresh) {
            testListBySubcategoryMemory[key]?.let { return@withContext it }
        } else {
            testListBySubcategoryMemory.remove(key)
        }
        try {
            val resp = RetrofitProvider.publicApi.listTests(subcategory = sub, limit = 40)
            val mapped = resp.items.map { row -> row.toTestCard() }
            mapped.forEach { card ->
                val tKey = card.title.trim().lowercase(Locale.US)
                if (tKey.isNotBlank()) testCardMemory[tKey] = card
            }
            if (mapped.isNotEmpty()) {
                testListBySubcategoryMemory[key] = mapped
                runCatching { persistTestsListDiskCache(key, mapped) }
                    .onFailure { Log.w(TAG, "persistTestsListDiskCache $key", it) }
                mapped
            } else {
                defaultTests(sub)
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadTestsForSubcategory $sub", e)
            val disk = runCatching { loadCachedTestsForSubcategory(sub) }.getOrDefault(emptyList())
            if (disk.isNotEmpty()) disk else defaultTests(sub)
        }
    }

    /** Full catalog slice for post-login test picker (`GET /tests` without subcategory filter). */
    suspend fun loadCatalogTestsForPicker(limit: Int = 100): List<TestCardNew> = withContext(Dispatchers.IO) {
        val resp = RetrofitProvider.publicApi.listTests(subcategory = null, limit = limit)
        resp.items
            .map { row -> row.toTestCard() }
            .filter { it.title.isNotBlank() }
            .distinctBy { it.title.trim().lowercase(Locale.US) }
    }

    private fun jsonOptIntOrNull(o: JSONObject, key: String): Int? =
        when {
            !o.has(key) || o.isNull(key) -> null
            else -> o.optInt(key)
        }

    private fun linkedTestCardCacheFromJson(raw: String): LinkedHashMap<String, JSONObject> {
        val out = LinkedHashMap<String, JSONObject>()
        val root = runCatching { JSONObject(raw.trim()) }.getOrNull() ?: return out
        val arr = root.optJSONArray("entries") ?: return out
        for (i in 0 until arr.length()) {
            val row = arr.optJSONObject(i) ?: continue
            val k = row.optString("k").trim().lowercase(Locale.US)
            if (k.isEmpty()) continue
            val c = row.optJSONObject("c") ?: continue
            out.remove(k)
            out[k] = c
        }
        return out
    }

    private fun linkedTestCardCacheToJson(map: LinkedHashMap<String, JSONObject>): String {
        val arr = JSONArray()
        for ((k, c) in map) {
            val row = JSONObject()
            row.put("k", k)
            row.put("c", c)
            arr.put(row)
        }
        return JSONObject().put("v", 1).put("entries", arr).toString()
    }

    private fun encodeTestCardNewJson(c: TestCardNew): JSONObject = JSONObject().apply {
        put("id", c.id)
        put("slug", c.slug)
        put("title", c.title)
        put("meta", c.meta)
        c.examDate?.let { put("examDate", it) }
        c.durationLabel?.let { put("durationLabel", it) }
        c.questionsMarks?.let { put("questionsMarks", it) }
        c.slotLabel?.let { put("slotLabel", it) }
        c.enrolledLabel?.let { put("enrolledLabel", it) }
        c.remainingSeatsLabel?.let { put("remainingSeatsLabel", it) }
        c.attemptsAllowed?.let { put("attemptsAllowed", it) }
        c.languageMode?.let { put("languageMode", it) }
        c.examMode?.let { put("examMode", it) }
        c.negativeMarkingText?.let { put("negativeMarkingText", it) }
        c.testTypeLabel?.let { put("testTypeLabel", it) }
        put("badgeEnabled", c.badgeEnabled)
        put("badgeText", c.badgeText)
        c.validUntil?.let { put("validUntil", it) }
        c.answerKeyReleaseAt?.let { put("answerKeyReleaseAt", it) }
        c.resultReleaseAt?.let { put("resultReleaseAt", it) }
        c.capacityTotal?.let { put("capacityTotal", it) } ?: run { put("capacityTotal", JSONObject.NULL) }
        c.enrolledCount?.let { put("enrolledCount", it) } ?: run { put("enrolledCount", JSONObject.NULL) }
        c.remainingSeats?.let { put("remainingSeats", it) } ?: run { put("remainingSeats", JSONObject.NULL) }
        c.publishAt?.let { put("publishAt", it) }
        c.unpublishAt?.let { put("unpublishAt", it) }
        c.resultVisibility?.let { put("resultVisibility", it) }
        put("reattemptCooldownMinutes", c.reattemptCooldownMinutes)
        put("lateJoinMinutes", c.lateJoinMinutes)
        put("notifyBeforeMinutes", c.notifyBeforeMinutes)
        put("resumeEnabled", c.resumeEnabled)
        put("shuffleQuestions", c.shuffleQuestions)
        put("shuffleOptions", c.shuffleOptions)
        put("fullscreenRequired", c.fullscreenRequired)
        put("copyPasteBlocked", c.copyPasteBlocked)
        put("notifyOnPublish", c.notifyOnPublish)
    }

    private fun decodeTestCardNew(o: JSONObject): TestCardNew? {
        val title = o.optString("title").trim()
        if (title.isBlank()) return null
        return TestCardNew(
            id = o.optString("id", ""),
            slug = o.optString("slug", ""),
            title = title,
            meta = o.optString("meta").ifBlank { "Test details are currently unavailable" },
            examDate = o.optString("examDate", "").trim().takeIf { it.isNotBlank() },
            durationLabel = o.optString("durationLabel", "").trim().takeIf { it.isNotBlank() },
            questionsMarks = o.optString("questionsMarks", "").trim().takeIf { it.isNotBlank() },
            slotLabel = o.optString("slotLabel", "").trim().takeIf { it.isNotBlank() },
            enrolledLabel = o.optString("enrolledLabel", "").trim().takeIf { it.isNotBlank() },
            remainingSeatsLabel = o.optString("remainingSeatsLabel", "").trim().takeIf { it.isNotBlank() },
            attemptsAllowed = o.optString("attemptsAllowed", "").trim().takeIf { it.isNotBlank() },
            languageMode = o.optString("languageMode", "").trim().takeIf { it.isNotBlank() },
            examMode = o.optString("examMode", "").trim().takeIf { it.isNotBlank() },
            negativeMarkingText = o.optString("negativeMarkingText", "").trim().takeIf { it.isNotBlank() },
            testTypeLabel = o.optString("testTypeLabel", "").trim().takeIf { it.isNotBlank() },
            badgeEnabled = o.optBoolean("badgeEnabled", false),
            badgeText = o.optString("badgeText", "Live").ifBlank { "Live" },
            validUntil = o.optString("validUntil", "").trim().takeIf { it.isNotBlank() },
            answerKeyReleaseAt = o.optString("answerKeyReleaseAt", "").trim().takeIf { it.isNotBlank() },
            resultReleaseAt = o.optString("resultReleaseAt", "").trim().takeIf { it.isNotBlank() },
            capacityTotal = jsonOptIntOrNull(o, "capacityTotal"),
            enrolledCount = jsonOptIntOrNull(o, "enrolledCount"),
            remainingSeats = jsonOptIntOrNull(o, "remainingSeats"),
            publishAt = o.optString("publishAt", "").trim().takeIf { it.isNotBlank() },
            unpublishAt = o.optString("unpublishAt", "").trim().takeIf { it.isNotBlank() },
            resultVisibility = o.optString("resultVisibility", "").trim().takeIf { it.isNotBlank() },
            reattemptCooldownMinutes = o.optInt("reattemptCooldownMinutes", 0).coerceAtLeast(0),
            lateJoinMinutes = o.optInt("lateJoinMinutes", 0).coerceAtLeast(0),
            notifyBeforeMinutes = o.optInt("notifyBeforeMinutes", 0).coerceAtLeast(0),
            resumeEnabled = o.optBoolean("resumeEnabled", true),
            shuffleQuestions = o.optBoolean("shuffleQuestions", false),
            shuffleOptions = o.optBoolean("shuffleOptions", false),
            fullscreenRequired = o.optBoolean("fullscreenRequired", false),
            copyPasteBlocked = o.optBoolean("copyPasteBlocked", false),
            notifyOnPublish = o.optBoolean("notifyOnPublish", true),
        )
    }

    private suspend fun persistTestCardDiskCache(titleKey: String, card: TestCardNew) {
        val key = titleKey.trim().lowercase(Locale.US)
        if (key.isBlank()) return
        val encoded = encodeTestCardNewJson(card)
        val raw = AppPreferencesRepository.peekCachedTestCardsBlob().orEmpty()
        val map = linkedTestCardCacheFromJson(if (raw.isBlank()) "{\"v\":1,\"entries\":[]}" else raw)
        map.remove(key)
        map[key] = encoded
        while (map.size > MAX_CACHED_TEST_CARDS) {
            val drop = map.keys.first()
            map.remove(drop)
        }
        AppPreferencesRepository.saveCachedTestCardsBlobNow(linkedTestCardCacheToJson(map))
    }

    /** Shared blob shape: `{ "v":1, "entries":[{ "k", "items":[] }] }` for tests lists and quiz questions. */
    private fun linkedKeyedJsonArrayBlobFromJson(raw: String): LinkedHashMap<String, JSONArray> {
        val out = LinkedHashMap<String, JSONArray>()
        val root = runCatching { JSONObject(raw.trim()) }.getOrNull() ?: return out
        val arr = root.optJSONArray("entries") ?: return out
        for (i in 0 until arr.length()) {
            val row = arr.optJSONObject(i) ?: continue
            val k = row.optString("k").trim().lowercase(Locale.US)
            if (k.isEmpty()) continue
            val items = row.optJSONArray("items") ?: continue
            out.remove(k)
            out[k] = items
        }
        return out
    }

    private fun linkedKeyedJsonArrayBlobToJson(map: LinkedHashMap<String, JSONArray>, maxKeys: Int): String {
        while (map.size > maxKeys) {
            map.remove(map.keys.first())
        }
        val arr = JSONArray()
        for ((k, items) in map) {
            val row = JSONObject()
            row.put("k", k)
            row.put("items", items)
            arr.put(row)
        }
        return JSONObject().put("v", 1).put("entries", arr).toString()
    }

    private suspend fun persistTestsListDiskCache(subKey: String, items: List<TestCardNew>) {
        val key = subKey.trim().lowercase(Locale.US)
        if (key.isBlank()) return
        val arr = JSONArray()
        items.forEach { arr.put(encodeTestCardNewJson(it)) }
        val raw = AppPreferencesRepository.peekCachedTestsListsBlob().orEmpty()
        val map = linkedKeyedJsonArrayBlobFromJson(if (raw.isBlank()) "{\"v\":1,\"entries\":[]}" else raw)
        map.remove(key)
        map[key] = arr
        AppPreferencesRepository.saveCachedTestsListsBlobNow(
            linkedKeyedJsonArrayBlobToJson(map, MAX_CACHED_TEST_LIST_KEYS),
        )
    }

    /**
     * Disk-backed snapshot for [title] (normalized). Hydrates [testCardMemory] so other callers
     * benefit; use [loadTestByTitle] with `forceRefresh = true` after this for stale-while-revalidate.
     */
    suspend fun loadCachedTestByTitle(title: String): TestCardNew? = withContext(Dispatchers.IO) {
        val target = title.trim()
        if (target.isBlank()) return@withContext null
        val key = target.lowercase(Locale.US)
        testCardMemory[key]?.let { return@withContext it }
        val blob = AppPreferencesRepository.peekCachedTestCardsBlob() ?: return@withContext null
        val map = linkedTestCardCacheFromJson(blob)
        val json = map[key] ?: return@withContext null
        val card = decodeTestCardNew(json) ?: return@withContext null
        testCardMemory[key] = card
        card
    }

    suspend fun loadTestByTitle(title: String, forceRefresh: Boolean = false): TestCardNew? = withContext(Dispatchers.IO) {
        val target = title.trim()
        if (target.isBlank()) return@withContext null
        val key = target.lowercase(Locale.US)
        if (!forceRefresh) {
            testCardMemory[key]?.let { return@withContext it }
        }
        try {
            val resp = RetrofitProvider.publicApi.listTests(limit = 100)
            val mapped = resp.items.map { it.toTestCard() }
            mapped.forEach { card ->
                val k = card.title.trim().lowercase(Locale.US)
                if (k.isNotBlank()) testCardMemory[k] = card
            }
            val resolved = mapped
                .firstOrNull { it.title.equals(target, ignoreCase = true) }
                ?: defaultTests(target).firstOrNull()
            if (resolved != null && resolved.title.isNotBlank()) {
                testCardMemory[key] = resolved
                runCatching { persistTestCardDiskCache(key, resolved) }
                    .onFailure { Log.w(TAG, "persistTestCardDiskCache $key", it) }
            }
            resolved
        } catch (e: Exception) {
            Log.w(TAG, "loadTestByTitle $target", e)
            val fromDisk = runCatching { loadCachedTestByTitle(target) }.getOrNull()
            if (fromDisk != null && fromDisk.title.isNotBlank()) {
                testCardMemory[key] = fromDisk
                return@withContext fromDisk
            }
            val fallback = defaultTests(target).firstOrNull()
            if (fallback != null && fallback.title.isNotBlank()) {
                testCardMemory[key] = fallback
                runCatching { persistTestCardDiskCache(key, fallback) }
                    .onFailure { Log.w(TAG, "persistTestCardDiskCache fallback $key", it) }
            }
            fallback
        }
    }

    private fun encodeQuizQuestionRemoteJson(q: QuizQuestionRemote): JSONObject {
        val o = JSONObject()
        o.put("t", q.title)
        val arr = JSONArray()
        q.options.forEach { arr.put(it) }
        o.put("o", arr)
        o.put("c", q.correctIndex)
        o.put("e", q.explanation)
        return o
    }

    private fun decodeQuizQuestionRemote(o: JSONObject): QuizQuestionRemote? {
        val title = o.optString("t").trim()
        if (title.isBlank()) return null
        val arr = o.optJSONArray("o") ?: return null
        val options = buildList {
            for (i in 0 until arr.length()) {
                arr.optString(i).trim().takeIf { it.isNotBlank() }?.let { add(it) }
            }
        }
        if (options.size < 2) return null
        val correctIndex = o.optInt("c", -1)
        if (correctIndex !in options.indices) return null
        return QuizQuestionRemote(
            title = title,
            options = options,
            correctIndex = correctIndex,
            explanation = o.optString("e", "").trim(),
        )
    }

    private suspend fun readQuizQuestionsFromDisk(titleKey: String): List<QuizQuestionRemote> {
        val key = titleKey.trim().lowercase(Locale.US)
        if (key.isBlank()) return emptyList()
        val raw = AppPreferencesRepository.peekCachedQuizQuestionsBlob() ?: return emptyList()
        val map = linkedKeyedJsonArrayBlobFromJson(raw)
        val arr = map[key] ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val jo = arr.optJSONObject(i) ?: continue
                decodeQuizQuestionRemote(jo)?.let { add(it) }
            }
        }
    }

    private suspend fun persistQuizQuestionsDiskCache(titleKey: String, items: List<QuizQuestionRemote>) {
        val key = titleKey.trim().lowercase(Locale.US)
        if (key.isBlank()) return
        val arr = JSONArray()
        items.forEach { arr.put(encodeQuizQuestionRemoteJson(it)) }
        val raw = AppPreferencesRepository.peekCachedQuizQuestionsBlob().orEmpty()
        val map = linkedKeyedJsonArrayBlobFromJson(if (raw.isBlank()) "{\"v\":1,\"entries\":[]}" else raw)
        map.remove(key)
        map[key] = arr
        AppPreferencesRepository.saveCachedQuizQuestionsBlobNow(
            linkedKeyedJsonArrayBlobToJson(map, MAX_CACHED_QUIZ_QUESTION_KEYS),
        )
    }

    private suspend fun evictQuizQuestionsDiskCache(titleKey: String) {
        val key = titleKey.trim().lowercase(Locale.US)
        if (key.isBlank()) return
        val raw = AppPreferencesRepository.peekCachedQuizQuestionsBlob().orEmpty()
        val map = linkedKeyedJsonArrayBlobFromJson(if (raw.isBlank()) "{\"v\":1,\"entries\":[]}" else raw)
        if (!map.containsKey(key)) return
        map.remove(key)
        AppPreferencesRepository.saveCachedQuizQuestionsBlobNow(
            linkedKeyedJsonArrayBlobToJson(map, MAX_CACHED_QUIZ_QUESTION_KEYS),
        )
    }

    private suspend fun resolveTestForQuizQuestions(safeName: String, forceRefresh: Boolean): TestCardNew? {
        return when {
            forceRefresh -> loadTestByTitle(safeName, forceRefresh = true) ?: loadCachedTestByTitle(safeName)
            else -> {
                val key = safeName.lowercase(Locale.US)
                testCardMemory[key] ?: loadCachedTestByTitle(safeName) ?: loadTestByTitle(safeName, forceRefresh = false)
            }
        }
    }

    /**
     * Disk-backed quiz questions for [testName] (normalized). Hydrates [quizQuestionsMemory].
     * Use [loadQuizQuestionsForTest] with `forceRefresh = true` after this for stale-while-revalidate.
     */
    suspend fun loadCachedQuizQuestionsForTest(testName: String): List<QuizQuestionRemote> = withContext(Dispatchers.IO) {
        val key = testName.trim().lowercase(Locale.US)
        if (key.isBlank()) return@withContext emptyList()
        quizQuestionsMemory[key]?.let { return@withContext it }
        val list = readQuizQuestionsFromDisk(key)
        if (list.isNotEmpty()) quizQuestionsMemory[key] = list
        list
    }

    suspend fun loadQuizQuestionsForTest(testName: String, forceRefresh: Boolean = false): List<QuizQuestionRemote> =
        withContext(Dispatchers.IO) {
            val safeName = testName.trim()
            if (safeName.isBlank()) return@withContext emptyList()
            val key = safeName.lowercase(Locale.US)
            if (!forceRefresh) {
                quizQuestionsMemory[key]?.let { return@withContext it }
            } else {
                quizQuestionsMemory.remove(key)
            }
            try {
                val test = resolveTestForQuizQuestions(safeName, forceRefresh)
                val testId = test?.id?.trim().orEmpty()
                if (testId.isBlank()) {
                    val diskOnly = readQuizQuestionsFromDisk(key)
                    if (diskOnly.isNotEmpty()) {
                        quizQuestionsMemory[key] = diskOnly
                        return@withContext diskOnly
                    }
                    return@withContext emptyList()
                }
                val rows = try {
                    RetrofitProvider.appApi.getAttemptQuestions(testId).items
                } catch (_: Exception) {
                    RetrofitProvider.publicApi.getTestQuestions(testId).items
                }
                val mapped = rows.mapNotNull { row ->
                    val prompt = row.questionPrompt.trim()
                    val options = row.options.map { it.trim() }.filter { it.isNotBlank() }
                    val correctIndex = row.correctIndex
                    if (prompt.isBlank() || options.size < 2 || correctIndex !in options.indices) {
                        null
                    } else {
                        QuizQuestionRemote(
                            title = prompt,
                            options = options,
                            correctIndex = correctIndex,
                            explanation = row.explanation?.trim().orEmpty(),
                        )
                    }
                }
                if (mapped.isNotEmpty()) {
                    quizQuestionsMemory[key] = mapped
                    runCatching { persistQuizQuestionsDiskCache(key, mapped) }
                        .onFailure { Log.w(TAG, "persistQuizQuestionsDiskCache $key", it) }
                    mapped
                } else {
                    runCatching { evictQuizQuestionsDiskCache(key) }
                        .onFailure { Log.w(TAG, "evictQuizQuestionsDiskCache $key", it) }
                    quizQuestionsMemory.remove(key)
                    emptyList()
                }
            } catch (e: Exception) {
                Log.w(TAG, "loadQuizQuestionsForTest $safeName", e)
                val fromDisk = readQuizQuestionsFromDisk(key)
                if (fromDisk.isNotEmpty()) {
                    quizQuestionsMemory[key] = fromDisk
                    return@withContext fromDisk
                }
                throw e
            }
        }

    suspend fun loadTestAdvancedConfigByTitle(testName: String): TestAdvancedConfigRemote? = withContext(Dispatchers.IO) {
        loadTestByTitle(testName)?.toAdvancedConfigRemote()
    }

    suspend fun loadDailyDigestItem(): DailyDigestRemote? = withContext(Dispatchers.IO) {
        try {
            val row = RetrofitProvider.publicApi.getDailyDigestToday().item
            DailyDigestRemote(
                questionPrompt = row.questionPrompt,
                options = row.options,
                correctIndex = row.correctIndex,
                factText = row.factText,
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadDailyDigestItem", e)
            null
        }
    }

    suspend fun loadDailyQuizItem(): DailyQuizRemote? = withContext(Dispatchers.IO) {
        try {
            val row = RetrofitProvider.publicApi.getDailyQuizToday().item
            DailyQuizRemote(
                questionPrompt = row.questionPrompt,
                options = row.options,
                correctIndex = row.correctIndex,
                explanation = row.explanation.orEmpty(),
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadDailyQuizItem", e)
            null
        }
    }

    /**
     * Loads CMS home payload (banners, news slider, sections). Cached in-memory after first success
     * unless [forceRefresh] clears the cache — use when Home must reflect server updates (slider, etc.).
     */
    /**
     * Returns the previously persisted home payload (no network). Used by the Home screen to render
     * instantly on cold start while a fresh fetch runs in the background (stale-while-revalidate).
     * Safe to call before [loadHomeContent]; returns null on first-ever launch or on parse failure.
     */
    suspend fun loadCachedHomeContent(): HomeContentRemote? = withContext(Dispatchers.IO) {
        homeContentMemory?.let { return@withContext it }
        val raw = AppPreferencesRepository.peekCachedHomeContent() ?: return@withContext null
        val parsed = runCatching { decodeHomeContent(raw) }.getOrNull() ?: return@withContext null
        homeContentMemory = parsed
        parsed
    }

    suspend fun loadHomeContent(forceRefresh: Boolean = false): HomeContentRemote? = withContext(Dispatchers.IO) {
        if (!forceRefresh) {
            homeContentMemory?.let { return@withContext it }
        } else {
            homeContentMemory = null
        }
        try {
            val content = RetrofitProvider.publicApi.getHomeContent().content ?: return@withContext null
            val sanitizedSections = content.sections
                .map { section ->
                    HomeSectionRemote(
                        id = section.id.trim(),
                        title = section.title.trim(),
                        items = section.items.map { it.trim() }.filter { it.isNotBlank() },
                    )
                }
                .filter { it.title.isNotBlank() && it.items.isNotEmpty() }
            val sanitizedQuickActionSections = content.quickActionSections
                .map { section ->
                    HomeQuickActionSectionRemote(
                        id = section.id.trim(),
                        title = section.title.trim(),
                        items = section.items
                            .map { action ->
                                HomeQuickActionItemRemote(
                                    title = action.title.trim(),
                                    actionKey = action.actionKey.trim(),
                                    iconKey = action.iconKey?.trim()?.ifBlank { null },
                                )
                            }
                            .filter { it.title.isNotBlank() && it.actionKey.isNotBlank() },
                    )
                }
                .filter { it.title.isNotBlank() && it.items.isNotEmpty() }
            HomeContentRemote(
                welcomeText = content.welcomeText,
                quickActionsTitle = content.quickActionsTitle,
                themePreset = content.themePreset,
                promoWidgetEnabled = content.promoWidgetEnabled,
                promoWidgetHtml = content.promoWidgetHtml,
                studentUpdateWidgetEnabled = content.studentUpdateWidgetEnabled || content.billWidgetEnabledLegacy,
                studentUpdateWidgetHtml = content.studentUpdateWidgetHtml ?: content.billWidgetHtmlLegacy,
                newsCategoryMenu = content.newsCategoryMenu.map { it.trim() }.filter { it.isNotBlank() },
                jobCategoryMenu = content.jobCategoryMenu.map { it.trim() }.filter { it.isNotBlank() },
                examCategoryMenu = content.examCategoryMenu.map { it.trim() }.filter { it.isNotBlank() },
                sections = sanitizedSections,
                quickActionSections = sanitizedQuickActionSections,
                banners = content.banners.filter { it.enabled && it.imageUrl.isNotBlank() }.map { it.imageUrl },
                newsSlides = content.newsSlides
                    .filter { it.enabled && it.articleId.isNotBlank() && it.imageUrl.isNotBlank() }
                    .map {
                        HomeNewsSlideRemote(
                            id = it.id,
                            articleId = it.articleId,
                            headline = it.headline,
                            imageUrl = it.imageUrl,
                        )
                    },
                startSeriesLockSeconds = (content.startSeriesLockSeconds ?: 20).coerceIn(0, 86_400),
                startSeriesActiveWindowMinutes = (content.startSeriesActiveWindowMinutes ?: 30).coerceIn(1, 10_080),
            ).also { fresh ->
                homeContentMemory = fresh
                // Persist for the next cold start. Failure here is non-fatal: in-memory cache
                // still serves the rest of this session, and the next successful fetch will retry.
                runCatching {
                    AppPreferencesRepository.saveCachedHomeContentNow(encodeHomeContent(fresh))
                }.onFailure { Log.w(TAG, "saveCachedHomeContent", it) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadHomeContent", e)
            null
        }
    }

    private fun encodeHomeContent(c: HomeContentRemote): String {
        val o = JSONObject()
        c.welcomeText?.let { o.put("welcomeText", it) }
        c.quickActionsTitle?.let { o.put("quickActionsTitle", it) }
        c.themePreset?.let { o.put("themePreset", it) }
        o.put("promoWidgetEnabled", c.promoWidgetEnabled)
        c.promoWidgetHtml?.let { o.put("promoWidgetHtml", it) }
        o.put("studentUpdateWidgetEnabled", c.studentUpdateWidgetEnabled)
        c.studentUpdateWidgetHtml?.let { o.put("studentUpdateWidgetHtml", it) }
        o.put("newsCategoryMenu", JSONArray(c.newsCategoryMenu))
        o.put("jobCategoryMenu", JSONArray(c.jobCategoryMenu))
        o.put("examCategoryMenu", JSONArray(c.examCategoryMenu))
        val sectionsArr = JSONArray()
        c.sections.forEach { s ->
            sectionsArr.put(
                JSONObject().apply {
                    put("id", s.id)
                    put("title", s.title)
                    put("items", JSONArray(s.items))
                },
            )
        }
        o.put("sections", sectionsArr)
        val qaArr = JSONArray()
        c.quickActionSections.forEach { s ->
            val itemsArr = JSONArray()
            s.items.forEach { it2 ->
                itemsArr.put(
                    JSONObject().apply {
                        put("title", it2.title)
                        put("actionKey", it2.actionKey)
                        it2.iconKey?.let { ik -> put("iconKey", ik) }
                    },
                )
            }
            qaArr.put(
                JSONObject().apply {
                    put("id", s.id)
                    put("title", s.title)
                    put("items", itemsArr)
                },
            )
        }
        o.put("quickActionSections", qaArr)
        o.put("banners", JSONArray(c.banners))
        val newsArr = JSONArray()
        c.newsSlides.forEach { ns ->
            newsArr.put(
                JSONObject().apply {
                    put("id", ns.id)
                    put("articleId", ns.articleId)
                    ns.headline?.let { put("headline", it) }
                    put("imageUrl", ns.imageUrl)
                },
            )
        }
        o.put("newsSlides", newsArr)
        o.put("startSeriesLockSeconds", c.startSeriesLockSeconds)
        o.put("startSeriesActiveWindowMinutes", c.startSeriesActiveWindowMinutes)
        return o.toString()
    }

    private fun decodeHomeContent(raw: String): HomeContentRemote {
        val o = JSONObject(raw)
        fun nullableString(key: String): String? =
            if (o.has(key) && !o.isNull(key)) o.optString(key, "").takeIf { it.isNotEmpty() } else null
        fun stringList(key: String): List<String> {
            val arr = o.optJSONArray(key) ?: return emptyList()
            return List(arr.length()) { arr.optString(it).orEmpty() }
        }
        val sections = o.optJSONArray("sections")?.let { arr ->
            List(arr.length()) { i ->
                val s = arr.optJSONObject(i) ?: JSONObject()
                HomeSectionRemote(
                    id = s.optString("id", ""),
                    title = s.optString("title", ""),
                    items = s.optJSONArray("items")?.let { ia ->
                        List(ia.length()) { ia.optString(it).orEmpty() }
                    }.orEmpty(),
                )
            }
        }.orEmpty()
        val quickActions = o.optJSONArray("quickActionSections")?.let { arr ->
            List(arr.length()) { i ->
                val s = arr.optJSONObject(i) ?: JSONObject()
                val itemsArr = s.optJSONArray("items")
                val items = if (itemsArr == null) {
                    emptyList()
                } else {
                    List(itemsArr.length()) { j ->
                        val it2 = itemsArr.optJSONObject(j) ?: JSONObject()
                        HomeQuickActionItemRemote(
                            title = it2.optString("title", ""),
                            actionKey = it2.optString("actionKey", ""),
                            iconKey = if (it2.has("iconKey") && !it2.isNull("iconKey")) {
                                it2.optString("iconKey", "").takeIf { ik -> ik.isNotEmpty() }
                            } else {
                                null
                            },
                        )
                    }
                }
                HomeQuickActionSectionRemote(
                    id = s.optString("id", ""),
                    title = s.optString("title", ""),
                    items = items,
                )
            }
        }.orEmpty()
        val newsSlides = o.optJSONArray("newsSlides")?.let { arr ->
            List(arr.length()) { i ->
                val ns = arr.optJSONObject(i) ?: JSONObject()
                HomeNewsSlideRemote(
                    id = ns.optString("id", ""),
                    articleId = ns.optString("articleId", ""),
                    headline = if (ns.has("headline") && !ns.isNull("headline")) {
                        ns.optString("headline", "").takeIf { it.isNotEmpty() }
                    } else {
                        null
                    },
                    imageUrl = ns.optString("imageUrl", ""),
                )
            }
        }.orEmpty()
        return HomeContentRemote(
            welcomeText = nullableString("welcomeText"),
            quickActionsTitle = nullableString("quickActionsTitle"),
            themePreset = nullableString("themePreset"),
            promoWidgetEnabled = o.optBoolean("promoWidgetEnabled", false),
            promoWidgetHtml = nullableString("promoWidgetHtml"),
            studentUpdateWidgetEnabled = o.optBoolean("studentUpdateWidgetEnabled", false),
            studentUpdateWidgetHtml = nullableString("studentUpdateWidgetHtml"),
            newsCategoryMenu = stringList("newsCategoryMenu"),
            jobCategoryMenu = stringList("jobCategoryMenu"),
            examCategoryMenu = stringList("examCategoryMenu"),
            sections = sections,
            quickActionSections = quickActions,
            banners = stringList("banners"),
            newsSlides = newsSlides,
            startSeriesLockSeconds = o.optInt("startSeriesLockSeconds", 20).coerceIn(0, 86_400),
            startSeriesActiveWindowMinutes = o.optInt("startSeriesActiveWindowMinutes", 30).coerceIn(1, 10_080),
        )
    }

    suspend fun loadSubmitApplicationContent(): SubmitApplicationContentRemote? = withContext(Dispatchers.IO) {
        try {
            val content = RetrofitProvider.publicApi.getHomeContent().submitApplicationContent ?: return@withContext null
            SubmitApplicationContentRemote(
                title = content.title,
                benefitsTitle = content.benefitsTitle,
                submitButtonLabel = content.submitButtonLabel,
                successMessage = content.successMessage,
                bulletItems = content.bulletItems.filter { it.isNotBlank() },
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadSubmitApplicationContent", e)
            null
        }
    }

    suspend fun loadInstructionContent(): InstructionContentRemote? = withContext(Dispatchers.IO) {
        instructionContentMemory?.let { return@withContext it }
        try {
            val content = RetrofitProvider.publicApi.getHomeContent().instructionContent ?: return@withContext null
            InstructionContentRemote(
                pageTitle = content.pageTitle,
                cardTitle = content.cardTitle,
                startButtonLabel = content.startButtonLabel,
                submitDialogBrand = content.submitDialogBrand,
                submitDialogTitle = content.submitDialogTitle,
                submitDialogSubtitle = content.submitDialogSubtitle,
                postSubmitCardTitle = content.postSubmitCardTitle,
                postSubmitCardReadyTitle = content.postSubmitCardReadyTitle,
                postSubmitCardDateLabel = content.postSubmitCardDateLabel,
                postSubmitCardPendingMessage = content.postSubmitCardPendingMessage,
                postSubmitCardReadyMessage = content.postSubmitCardReadyMessage,
                postSubmitCardButtonLabel = content.postSubmitCardButtonLabel,
                postSubmitCardLines = content.postSubmitCardLines.filter { it.isNotBlank() },
                questionNavigationMode = content.questionNavigationMode,
                items = content.items.filter { it.isNotBlank() },
            ).also { instructionContentMemory = it }
        } catch (e: Exception) {
            Log.w(TAG, "loadInstructionContent", e)
            null
        }
    }

    suspend fun loadCachedProfileMenuItems(): List<ProfileMenuItemRemote> = withContext(Dispatchers.IO) {
        profileMenuItemsMemory?.let { return@withContext it }
        val raw = AppPreferencesRepository.peekCachedProfileMenuJson() ?: return@withContext emptyList()
        val parsed = runCatching { decodeProfileMenuItemsJson(raw) }.getOrNull() ?: return@withContext emptyList()
        if (parsed.isNotEmpty()) {
            profileMenuItemsMemory = parsed
        }
        parsed
    }

    suspend fun loadProfileMenuItems(forceRefresh: Boolean = false): List<ProfileMenuItemRemote> = withContext(Dispatchers.IO) {
        if (!forceRefresh) {
            profileMenuItemsMemory?.let { return@withContext it }
        } else {
            profileMenuItemsMemory = null
        }
        try {
            val list = RetrofitProvider.publicApi.getHomeContent().profileMenuItems.map { item ->
                ProfileMenuItemRemote(
                    id = item.id,
                    title = item.title,
                    subtitle = item.subtitle.orEmpty(),
                    path = item.path,
                    enabled = item.enabled,
                )
            }.filter { it.title.isNotBlank() && it.path.isNotBlank() }
            if (list.isNotEmpty()) {
                profileMenuItemsMemory = list
                runCatching {
                    AppPreferencesRepository.saveCachedProfileMenuJsonNow(encodeProfileMenuItemsJson(list))
                }.onFailure { Log.w(TAG, "saveCachedProfileMenuJson", it) }
            }
            list
        } catch (e: Exception) {
            Log.w(TAG, "loadProfileMenuItems", e)
            profileMenuItemsMemory ?: loadCachedProfileMenuItems()
        }
    }

    private fun encodeProfileMenuItemsJson(items: List<ProfileMenuItemRemote>): String {
        val arr = JSONArray()
        items.forEach { item ->
            val o = JSONObject()
            o.put("id", item.id)
            o.put("title", item.title)
            o.put("subtitle", item.subtitle)
            o.put("path", item.path)
            o.put("enabled", item.enabled)
            arr.put(o)
        }
        return JSONObject().put("items", arr).toString()
    }

    private fun decodeProfileMenuItemsJson(raw: String): List<ProfileMenuItemRemote>? {
        if (raw.isBlank()) return null
        val root = runCatching { JSONObject(raw.trim()) }.getOrNull() ?: return null
        val arr = root.optJSONArray("items") ?: return null
        val out = ArrayList<ProfileMenuItemRemote>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val title = o.optString("title").trim()
            val path = o.optString("path").trim()
            if (title.isBlank() || path.isBlank()) continue
            out.add(
                ProfileMenuItemRemote(
                    id = o.optString("id").trim().ifBlank { path },
                    title = title,
                    subtitle = o.optString("subtitle", ""),
                    path = path,
                    enabled = o.optBoolean("enabled", true),
                ),
            )
        }
        return out
    }

    suspend fun loadExamCategories(): List<ExamCategoryItemRemote> = withContext(Dispatchers.IO) {
        try {
            val items = RetrofitProvider.publicApi.getHomeContent().examCategories?.items ?: emptyList()
            items.map {
                ExamCategoryItemRemote(
                    id = it.id,
                    level1 = it.level1,
                    level2 = it.level2,
                    level3 = it.level3,
                    iconKey = it.iconKey,
                    enabled = it.enabled,
                )
            }.filter { it.level1.isNotBlank() && it.level2.isNotBlank() && it.level3.isNotBlank() }
        } catch (e: Exception) {
            Log.w(TAG, "loadExamCategories", e)
            emptyList()
        }
    }

    suspend fun loadPollModalSettings(): PollModalSettingsRemote = withContext(Dispatchers.IO) {
        try {
            val pollSettings = RetrofitProvider.publicApi.getHomeContent().pollSettings
            val items = pollSettings?.items ?: emptyList()
            val mappedItems = items
                .filter { it.enabled && it.question.isNotBlank() && it.options.isNotEmpty() }
                .map {
                    PollItemRemote(
                        id = it.id,
                        question = it.question,
                        options = it.options.filter { option -> option.isNotBlank() },
                        allowMultiple = it.allowMultiple,
                        createdAt = it.createdAt,
                    )
                }
                .sortedByDescending { it.createdAt.orEmpty() }
            PollModalSettingsRemote(
                showHomePopup = pollSettings?.showHomePopup != false,
                items = mappedItems,
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadPollModalSettings", e)
            PollModalSettingsRemote(showHomePopup = true, items = emptyList())
        }
    }

    suspend fun loadPollItems(): List<PollItemRemote> = withContext(Dispatchers.IO) {
        loadPollModalSettings().items
    }

    suspend fun submitPollVote(
        pollId: String,
        optionIndexes: List<Int>,
    ): PollVoteResultRemote? = withContext(Dispatchers.IO) {
        val id = pollId.trim()
        if (id.isBlank()) return@withContext null
        val normalized = optionIndexes.distinct().filter { it >= 0 }
        if (normalized.isEmpty()) return@withContext null
        try {
            val response = RetrofitProvider.appApi.postPollVote(
                pollId = id,
                body = com.freemocktest.app.data.remote.PollVoteRequest(normalized),
            )
            PollVoteResultRemote(
                ok = response.ok,
                pollId = response.pollId,
                hasVoted = response.hasVoted,
                optionIndexes = response.optionIndexes,
                counts = response.counts,
            )
        } catch (e: Exception) {
            Log.w(TAG, "submitPollVote", e)
            null
        }
    }

    suspend fun loadPollVoteStatus(pollId: String): PollVoteResultRemote? = withContext(Dispatchers.IO) {
        val id = pollId.trim()
        if (id.isBlank()) return@withContext null
        try {
            val response = RetrofitProvider.appApi.getPollVoteStatus(id)
            PollVoteResultRemote(
                ok = response.ok,
                pollId = response.pollId,
                hasVoted = response.hasVoted,
                optionIndexes = response.optionIndexes,
                counts = response.counts,
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadPollVoteStatus", e)
            null
        }
    }

    suspend fun filterNotificationsForCurrentAccount(rows: List<PushNotificationItemRemote>): List<PushNotificationItemRemote> {
        val signup = AppPreferencesRepository.getAccountSignupInstantOrNull() ?: return rows
        return rows.filter { row ->
            val t = parseNotificationCreatedInstant(row.createdAt) ?: return@filter false
            !t.isBefore(signup)
        }
    }

    private fun parseNotificationCreatedInstant(raw: String?): Instant? {
        val s = raw?.trim().orEmpty()
        if (s.isBlank()) return null
        runCatching { Instant.parse(s) }.getOrNull()?.let { return it }
        return runCatching {
            if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(s)) {
                LocalDate.parse(s).atStartOfDay(ZoneOffset.UTC).toInstant()
            } else {
                null
            }
        }.getOrNull()
    }

    suspend fun loadNotifications(): List<PushNotificationItemRemote> = withContext(Dispatchers.IO) {
        if (!AppPreferencesRepository.notificationsEnabledNow()) {
            return@withContext emptyList()
        }
        try {
            val items = RetrofitProvider.publicApi.getHomeContent().pushNotificationSettings?.items ?: emptyList()
            items
                .filter {
                    it.enabled &&
                        (it.status.isNullOrBlank() || it.status.equals("sent", ignoreCase = true) || it.status.equals("draft", ignoreCase = true)) &&
                        (!it.title.isNullOrBlank() || !it.message.isNullOrBlank())
                }
                .map {
                    PushNotificationItemRemote(
                        id = it.id,
                        title = it.title.orEmpty().ifBlank { "Notification" },
                        message = it.message.orEmpty().ifBlank { "No message" },
                        deepLink = it.deepLink,
                        createdAt = it.createdAt,
                    )
                }
                .sortedByDescending { it.createdAt.orEmpty() }
                .let { filterNotificationsForCurrentAccount(it) }
                .take(30)
        } catch (e: Exception) {
            Log.w(TAG, "loadNotifications", e)
            emptyList()
        }
    }

    suspend fun loadShareContent(): ShareContentRemote? = withContext(Dispatchers.IO) {
        try {
            val content = RetrofitProvider.publicApi.getHomeContent().shareContent ?: return@withContext null
            val body = content.body?.trim().orEmpty()
            if (body.isBlank()) return@withContext null
            ShareContentRemote(
                title = content.title?.trim(),
                body = body,
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadShareContent", e)
            null
        }
    }

    suspend fun loadSignupRegions(): List<SignupRegionRemote> = withContext(Dispatchers.IO) {
        try {
            val rows = RetrofitProvider.publicApi.getHomeContent().signupRegions?.items ?: emptyList()
            rows.mapNotNull { row ->
                val state = row.state.trim()
                val districts = row.districts.map { it.trim() }.filter { it.isNotBlank() }.distinctBy { it.lowercase(Locale.US) }
                if (state.isBlank()) null else SignupRegionRemote(state = state, districts = districts)
            }.distinctBy { it.state.lowercase(Locale.US) }
                .sortedBy { it.state.lowercase(Locale.US) }
        } catch (e: Exception) {
            Log.w(TAG, "loadSignupRegions", e)
            emptyList()
        }
    }

    suspend fun loadDailyDigestShareContent(): ShareContentRemote? = withContext(Dispatchers.IO) {
        try {
            val content = RetrofitProvider.publicApi.getHomeContent().dailyDigestShareContent ?: return@withContext null
            val body = content.body?.trim().orEmpty()
            if (body.isBlank()) return@withContext null
            ShareContentRemote(
                title = content.title?.trim(),
                body = body,
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadDailyDigestShareContent", e)
            null
        }
    }

    suspend fun loadDailyQuizShareContent(): ShareContentRemote? = withContext(Dispatchers.IO) {
        try {
            val content = RetrofitProvider.publicApi.getHomeContent().dailyQuizShareContent ?: return@withContext null
            val body = content.body?.trim().orEmpty()
            if (body.isBlank()) return@withContext null
            ShareContentRemote(
                title = content.title?.trim(),
                body = body,
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadDailyQuizShareContent", e)
            null
        }
    }

    suspend fun loadLeaderboardFilters(): LeaderboardFiltersRemote = withContext(Dispatchers.IO) {
        try {
            val data = RetrofitProvider.publicApi.getLeaderboardFilters()
            LeaderboardFiltersRemote(
                tests = data.tests.map { LeaderboardFilterTestRemote(id = it.id, title = it.title) },
                cities = data.cities.filter { it.isNotBlank() },
                states = data.states.filter { it.isNotBlank() },
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadLeaderboardFilters", e)
            LeaderboardFiltersRemote(emptyList(), emptyList(), emptyList())
        }
    }

    suspend fun loadLeaderboard(
        range: String,
        city: String?,
        state: String?,
        testCatalogId: String?,
    ): List<LeaderboardItemRemote> = withContext(Dispatchers.IO) {
        try {
            RetrofitProvider.publicApi.getLeaderboard(
                range = range,
                city = city?.takeIf { it.isNotBlank() },
                state = state?.takeIf { it.isNotBlank() },
                testCatalogId = testCatalogId?.takeIf { it.isNotBlank() },
                limit = 100,
            ).items.map {
                LeaderboardItemRemote(
                    rank = it.rank,
                    userId = it.userId,
                    name = it.name,
                    city = it.city.orEmpty(),
                    state = it.state.orEmpty(),
                    score = it.score,
                    totalCorrect = it.totalCorrect,
                    totalQuestions = it.totalQuestions,
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadLeaderboard", e)
            emptyList()
        }
    }

    suspend fun loadLeaderboardByTest(
        testId: String,
        range: String,
        city: String?,
        state: String?,
    ): List<LeaderboardItemRemote> = withContext(Dispatchers.IO) {
        if (testId.isBlank()) return@withContext emptyList()
        try {
            RetrofitProvider.publicApi.getLeaderboardByTest(
                testId = testId,
                range = range,
                city = city?.takeIf { it.isNotBlank() },
                state = state?.takeIf { it.isNotBlank() },
                limit = 100,
            ).items.map {
                LeaderboardItemRemote(
                    rank = it.rank,
                    userId = it.userId,
                    name = it.name,
                    city = it.city.orEmpty(),
                    state = it.state.orEmpty(),
                    score = it.score,
                    totalCorrect = it.totalCorrect,
                    totalQuestions = it.totalQuestions,
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadLeaderboardByTest", e)
            emptyList()
        }
    }

    suspend fun loadLeaderboardTests(
        range: String,
        city: String?,
        state: String?,
    ): List<LeaderboardTestSummaryRemote> = withContext(Dispatchers.IO) {
        try {
            RetrofitProvider.publicApi.getLeaderboardTests(
                range = range,
                city = city?.takeIf { it.isNotBlank() },
                state = state?.takeIf { it.isNotBlank() },
                limit = 100,
            ).items.map {
                LeaderboardTestSummaryRemote(
                    testId = it.testId,
                    testTitle = it.testTitle,
                    attemptsCount = it.attemptsCount,
                    participantsCount = it.participantsCount,
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadLeaderboardTests", e)
            emptyList()
        }
    }

    private fun manualFallback(kind: String): List<ManualNewsItem> = when (kind) {
        "job" -> ManualJobAlertContent.items
        "exam" -> ManualExamAlertContent.items
        "all" -> ManualNewsContent.items + ManualJobAlertContent.items + ManualExamAlertContent.items
        else -> ManualNewsContent.items
    }

    private fun defaultTests(subcategory: String): List<TestCardNew> = listOf(
        TestCardNew(
            id = "",
            slug = "",
            title = subcategory.trim().ifBlank { "Test" },
            meta = "No published test is available for this category.",
            examDate = null,
            durationLabel = null,
            questionsMarks = null,
            slotLabel = null,
            enrolledLabel = "0",
            remainingSeatsLabel = "0 seats left",
            attemptsAllowed = null,
            languageMode = null,
            examMode = null,
            negativeMarkingText = null,
            testTypeLabel = null,
            badgeEnabled = false,
            badgeText = "",
            validUntil = null,
        ),
    )

    private fun com.freemocktest.app.data.remote.CatalogTestDto.toTestCard(): TestCardNew {
        val meta = metaLine.ifBlank {
            "$questionCount Questions · $durationMinutes min"
        }
        val durationLabel = if (durationMinutes >= 60) {
            val hrs = durationMinutes / 60
            val mins = durationMinutes % 60
            if (mins == 0) "$hrs hrs" else "$hrs hr ${mins} min"
        } else {
            "$durationMinutes min"
        }
        val questionsMarks = "$questionCount Q / ${(totalMarks ?: 0)} marks"
        val capacity = (capacityTotal ?: 0).coerceAtLeast(0)
        val enrolled = (enrolledCount ?: 0).coerceAtLeast(0)
        val remaining = (remainingSeats ?: (capacity - enrolled)).coerceAtLeast(0)
        return TestCardNew(
            id = id,
            slug = slug,
            title = title,
            meta = meta,
            examDate = examDate,
            durationLabel = durationLabel,
            questionsMarks = questionsMarks,
            slotLabel = slotLabel,
            enrolledLabel = if (capacity > 0) "$enrolled/$capacity" else "$enrolled",
            remainingSeatsLabel = "$remaining seats left",
            attemptsAllowed = attemptsAllowed?.let { "$it attempt${if (it > 1) "s" else ""}" },
            languageMode = languageMode,
            examMode = examMode,
            negativeMarkingText = negativeMarkingText,
            testTypeLabel = testTypeLabel,
            badgeEnabled = badgeEnabled == true,
            badgeText = badgeText?.trim().takeUnless { it.isNullOrBlank() } ?: "Live",
            validUntil = validUntil?.let { "Available till $it" },
            answerKeyReleaseAt = answerKeyReleaseAt,
            resultReleaseAt = resultReleaseAt,
            capacityTotal = capacity,
            enrolledCount = enrolled,
            remainingSeats = remaining,
            publishAt = advancedConfig?.publishAt,
            unpublishAt = advancedConfig?.unpublishAt,
            resultVisibility = advancedConfig?.resultVisibility,
            reattemptCooldownMinutes = (advancedConfig?.reattemptCooldownMinutes ?: 0).coerceAtLeast(0),
            lateJoinMinutes = (advancedConfig?.lateJoinMinutes ?: 0).coerceAtLeast(0),
            notifyBeforeMinutes = (advancedConfig?.notifyBeforeMinutes ?: 0).coerceAtLeast(0),
            resumeEnabled = advancedConfig?.resumeEnabled != false,
            shuffleQuestions = advancedConfig?.shuffleQuestions == true,
            shuffleOptions = advancedConfig?.shuffleOptions == true,
            fullscreenRequired = advancedConfig?.fullscreenRequired == true,
            copyPasteBlocked = advancedConfig?.copyPasteBlocked == true,
            notifyOnPublish = advancedConfig?.notifyOnPublish != false,
        )
    }

    private fun NewsArticleDto.toManualNewsItem(): ManualNewsItem {
        val bodyText = body?.ifBlank { summary } ?: summary
        return ManualNewsItem(
            id = id,
            headline = headline,
            summary = summary,
            category = category.ifBlank { "News" },
            dateLabel = formatPublishedLabel(publishedAt),
            body = bodyText,
            featureImageUrl = featureImageUrl?.trim()?.takeIf { it.isNotEmpty() },
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
