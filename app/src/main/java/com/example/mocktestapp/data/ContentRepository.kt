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
    private val testCardMemory = ConcurrentHashMap<String, TestCardNew>()
    @Volatile
    private var instructionContentMemory: InstructionContentRemote? = null

    data class DailyDigestRemote(
        val questionPrompt: String,
        val options: List<String>,
        val correctIndex: Int,
        val factText: String,
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
    )
    data class PushNotificationItemRemote(
        val id: String,
        val title: String,
        val message: String,
        val createdAt: String?,
    )
    data class LeaderboardItemRemote(
        val rank: Int,
        val name: String,
        val city: String,
        val state: String,
        val score: Int,
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
            val mapped = resp.items.map { row -> row.toTestCard() }
            mapped.forEach { card ->
                val key = card.title.trim().lowercase(Locale.US)
                if (key.isNotBlank()) testCardMemory[key] = card
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

    suspend fun loadTestByTitle(title: String): TestCardNew? = withContext(Dispatchers.IO) {
        val target = title.trim()
        if (target.isBlank()) return@withContext null
        val key = target.lowercase(Locale.US)
        testCardMemory[key]?.let { return@withContext it }
        try {
            val resp = RetrofitProvider.publicApi.listTests(limit = 100)
            val mapped = resp.items.map { it.toTestCard() }
            mapped.forEach { card ->
                val k = card.title.trim().lowercase(Locale.US)
                if (k.isNotBlank()) testCardMemory[k] = card
            }
            mapped
                .firstOrNull { it.title.equals(target, ignoreCase = true) }
                ?: defaultTests(target).firstOrNull()
        } catch (e: Exception) {
            Log.w(TAG, "loadTestByTitle $target", e)
            defaultTests(target).firstOrNull()
        }
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

    suspend fun loadHomeContent(): HomeContentRemote? = withContext(Dispatchers.IO) {
        try {
            val content = RetrofitProvider.publicApi.getHomeContent().content ?: return@withContext null
            HomeContentRemote(
                welcomeText = content.welcomeText,
                quickActionsTitle = content.quickActionsTitle,
                sections = content.sections.map {
                    HomeSectionRemote(
                        id = it.id,
                        title = it.title,
                        items = it.items,
                    )
                },
                quickActionSections = content.quickActionSections.map {
                    HomeQuickActionSectionRemote(
                        id = it.id,
                        title = it.title,
                        items = it.items.map { action ->
                            HomeQuickActionItemRemote(
                                title = action.title,
                                actionKey = action.actionKey,
                                iconKey = action.iconKey,
                            )
                        },
                    )
                },
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
            )
        } catch (e: Exception) {
            Log.w(TAG, "loadHomeContent", e)
            null
        }
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

    suspend fun loadProfileMenuItems(): List<ProfileMenuItemRemote> = withContext(Dispatchers.IO) {
        try {
            RetrofitProvider.publicApi.getHomeContent().profileMenuItems.map { item ->
                ProfileMenuItemRemote(
                    id = item.id,
                    title = item.title,
                    subtitle = item.subtitle.orEmpty(),
                    path = item.path,
                    enabled = item.enabled,
                )
            }.filter { it.title.isNotBlank() && it.path.isNotBlank() }
        } catch (e: Exception) {
            Log.w(TAG, "loadProfileMenuItems", e)
            emptyList()
        }
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

    suspend fun loadPollItems(): List<PollItemRemote> = withContext(Dispatchers.IO) {
        try {
            val items = RetrofitProvider.publicApi.getHomeContent().pollSettings?.items ?: emptyList()
            items
                .filter { it.enabled && it.question.isNotBlank() && it.options.isNotEmpty() }
                .map {
                    PollItemRemote(
                        id = it.id,
                        question = it.question,
                        options = it.options.filter { option -> option.isNotBlank() },
                        allowMultiple = it.allowMultiple,
                    )
                }
        } catch (e: Exception) {
            Log.w(TAG, "loadPollItems", e)
            emptyList()
        }
    }

    suspend fun submitPollVote(
        pollId: String,
        optionIndexes: List<Int>,
    ): Boolean = withContext(Dispatchers.IO) {
        val id = pollId.trim()
        if (id.isBlank()) return@withContext false
        val normalized = optionIndexes.distinct().filter { it >= 0 }
        if (normalized.isEmpty()) return@withContext false
        try {
            RetrofitProvider.appApi.postPollVote(
                pollId = id,
                body = com.example.mocktestapp.data.remote.PollVoteRequest(normalized),
            ).ok
        } catch (e: Exception) {
            Log.w(TAG, "submitPollVote", e)
            false
        }
    }

    suspend fun loadNotifications(): List<PushNotificationItemRemote> = withContext(Dispatchers.IO) {
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
                        createdAt = it.createdAt,
                    )
                }
        } catch (e: Exception) {
            Log.w(TAG, "loadNotifications", e)
            emptyList()
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
                    name = it.name,
                    city = it.city.orEmpty(),
                    state = it.state.orEmpty(),
                    score = it.score,
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "loadLeaderboard", e)
            emptyList()
        }
    }

    private fun manualFallback(kind: String): List<ManualNewsItem> = when (kind) {
        "job" -> ManualJobAlertContent.items
        "exam" -> ManualExamAlertContent.items
        else -> ManualNewsContent.items
    }

    private fun defaultTests(subcategory: String): List<TestCardNew> = listOf(
        TestCardNew(
            slug = "",
            title = "${subcategory.trim()} Sprint",
            meta = "Mock test overview",
            examDate = "15 Feb 2026",
            durationLabel = "3 hrs",
            questionsMarks = "100 Q / 400 marks",
            slotLabel = "Morning Slot",
            enrolledLabel = "410/500",
            remainingSeatsLabel = "90 seats left",
            attemptsAllowed = "1 attempt",
            languageMode = "Hindi / English",
            examMode = "Online CBT",
            negativeMarkingText = "Yes (-1)",
            testTypeLabel = "Full Mock",
            validUntil = "Available till 20 Feb",
        ),
    )

    private fun com.example.mocktestapp.data.remote.CatalogTestDto.toTestCard(): TestCardNew {
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
            validUntil = validUntil?.let { "Available till $it" },
            answerKeyReleaseAt = answerKeyReleaseAt,
            resultReleaseAt = resultReleaseAt,
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
