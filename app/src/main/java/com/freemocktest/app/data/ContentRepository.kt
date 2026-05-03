package com.freemocktest.app.data

import android.util.Log
import com.freemocktest.app.data.remote.NewsArticleDto
import com.freemocktest.app.data.remote.RetrofitProvider
import com.freemocktest.app.newui.alerts.ManualExamAlertContent
import com.freemocktest.app.newui.alerts.ManualJobAlertContent
import com.freemocktest.app.newui.news.ManualNewsContent
import com.freemocktest.app.newui.news.ManualNewsItem
import com.freemocktest.app.newui.tests.TestCardNew
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

    suspend fun loadQuizQuestionsForTest(testName: String): List<QuizQuestionRemote> = withContext(Dispatchers.IO) {
        val safeName = testName.trim()
        if (safeName.isBlank()) return@withContext emptyList()
        try {
            val test = loadTestByTitle(safeName)
            val testId = test?.id?.trim().orEmpty()
            if (testId.isBlank()) return@withContext emptyList()
            val rows = try {
                // Prefer authenticated, per-user shuffled order.
                RetrofitProvider.appApi.getAttemptQuestions(testId).items
            } catch (_: Exception) {
                // Fallback keeps app functional if session expired or endpoint unavailable.
                RetrofitProvider.publicApi.getTestQuestions(testId).items
            }
            rows.mapNotNull { row ->
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
        } catch (e: Exception) {
            Log.w(TAG, "loadQuizQuestionsForTest $safeName", e)
            emptyList()
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

    suspend fun loadHomeContent(): HomeContentRemote? = withContext(Dispatchers.IO) {
        homeContentMemory?.let { return@withContext it }
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
            ).also { homeContentMemory = it }
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
                .take(30)
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
