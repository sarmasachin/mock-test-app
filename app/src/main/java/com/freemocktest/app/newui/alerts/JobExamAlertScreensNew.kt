package com.freemocktest.app.newui.alerts

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.WorkOutline
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.freemocktest.app.data.ContentRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.supervisorScope
import androidx.compose.ui.Modifier
import com.freemocktest.app.newui.feeds.WebFeedDefaults
import com.freemocktest.app.newui.news.FeedBrowseScreenNew
import com.freemocktest.app.newui.news.ManualNewsItem

const val JobAlertFeedImageSeedPrefix = "mocktest_job"
const val ExamAlertFeedImageSeedPrefix = "mocktest_exam"

private const val JOB_ALERT_LOAD_ERROR_MESSAGE =
    "Couldn't load job alerts. Check your connection and try again."

private const val EXAM_ALERT_LOAD_ERROR_MESSAGE =
    "Couldn't load exam alerts. Check your connection and try again."

object ManualJobAlertContent {
    val items: List<ManualNewsItem> = emptyList()

    fun itemById(id: String): ManualNewsItem? = items.find { it.id == id }
}

object ManualExamAlertContent {
    val items: List<ManualNewsItem> = emptyList()

    fun itemById(id: String): ManualNewsItem? = items.find { it.id == id }
}

@Composable
fun JobAlertScreenNew(
    onBack: () -> Unit,
    onOpenListing: (id: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var items by remember { mutableStateOf(ManualJobAlertContent.items) }
    var menuCategories by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var feedLoading by remember { mutableStateOf(true) }
    var feedLoadFailed by remember { mutableStateOf(false) }
    var jobAlertReloadKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(jobAlertReloadKey) {
        feedLoading = true
        feedLoadFailed = false
        try {
            supervisorScope {
                val feedDeferred = async { runCatching { ContentRepository.loadNewsFeed("job") } }
                val menuDeferred = async { runCatching { ContentRepository.loadHomeContent() } }
                val feedOutcome = feedDeferred.await()
                val menuOutcome = menuDeferred.await()
                items = feedOutcome.getOrElse { emptyList() }
                feedLoadFailed = feedOutcome.isFailure
                menuCategories = menuOutcome.getOrNull()
                    ?.jobCategoryMenu
                    ?.filter { it.isNotBlank() }
                    .orEmpty()
                    .distinctBy { it.lowercase() }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            items = emptyList()
            menuCategories = emptyList()
            feedLoadFailed = true
        } finally {
            feedLoading = false
        }
    }
    val derivedCategories = remember(items) {
        items.map { it.category.trim() }.filter { it.isNotBlank() }.distinctBy { it.lowercase() }
    }
    val allCategories = remember(menuCategories, derivedCategories) {
        (menuCategories + derivedCategories).distinctBy { it.lowercase() }
    }
    val visibleItems = remember(items, selectedCategory) {
        if (selectedCategory.isNullOrBlank()) items
        else items.filter { it.category.equals(selectedCategory ?: "", ignoreCase = true) }
    }
    FeedBrowseScreenNew(
        title = "Job alert",
        subtitle = "",
        listSectionTitle = "",
        listSectionSubtitle = "",
        feedIcon = Icons.Rounded.WorkOutline,
        items = visibleItems,
        imageSeedPrefix = JobAlertFeedImageSeedPrefix,
        loading = feedLoading && items.isEmpty() && !feedLoadFailed,
        onBack = onBack,
        onOpenItem = onOpenListing,
        categoryMenu = allCategories,
        selectedCategory = selectedCategory,
        onSelectCategory = { selectedCategory = it },
        modifier = modifier,
        loadFailed = feedLoadFailed,
        loadFailedMessage = JOB_ALERT_LOAD_ERROR_MESSAGE,
        onRetryLoad = { jobAlertReloadKey += 1 },
    )
}

@Composable
fun ExamAlertScreenNew(
    onBack: () -> Unit,
    onOpenListing: (id: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var items by remember { mutableStateOf(ManualExamAlertContent.items) }
    var menuCategories by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var feedLoading by remember { mutableStateOf(true) }
    var feedLoadFailed by remember { mutableStateOf(false) }
    var examAlertReloadKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(examAlertReloadKey) {
        feedLoading = true
        feedLoadFailed = false
        try {
            supervisorScope {
                val feedDeferred = async { runCatching { ContentRepository.loadNewsFeed("exam") } }
                val menuDeferred = async { runCatching { ContentRepository.loadHomeContent() } }
                val feedOutcome = feedDeferred.await()
                val menuOutcome = menuDeferred.await()
                items = feedOutcome.getOrElse { emptyList() }
                feedLoadFailed = feedOutcome.isFailure
                menuCategories = menuOutcome.getOrNull()
                    ?.examCategoryMenu
                    ?.filter { it.isNotBlank() }
                    .orEmpty()
                    .distinctBy { it.lowercase() }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            items = emptyList()
            menuCategories = emptyList()
            feedLoadFailed = true
        } finally {
            feedLoading = false
        }
    }
    val derivedCategories = remember(items) {
        items.map { it.category.trim() }.filter { it.isNotBlank() }.distinctBy { it.lowercase() }
    }
    val allCategories = remember(menuCategories, derivedCategories) {
        (menuCategories + derivedCategories).distinctBy { it.lowercase() }
    }
    val visibleItems = remember(items, selectedCategory) {
        if (selectedCategory.isNullOrBlank()) items
        else items.filter { it.category.equals(selectedCategory ?: "", ignoreCase = true) }
    }
    FeedBrowseScreenNew(
        title = "Exam alert",
        subtitle = "",
        listSectionTitle = "",
        listSectionSubtitle = "",
        feedIcon = Icons.Rounded.CalendarMonth,
        items = visibleItems,
        imageSeedPrefix = ExamAlertFeedImageSeedPrefix,
        loading = feedLoading && items.isEmpty() && !feedLoadFailed,
        onBack = onBack,
        onOpenItem = onOpenListing,
        categoryMenu = allCategories,
        selectedCategory = selectedCategory,
        onSelectCategory = { selectedCategory = it },
        categoryMenuEmphasis = true,
        modifier = modifier,
        loadFailed = feedLoadFailed,
        loadFailedMessage = EXAM_ALERT_LOAD_ERROR_MESSAGE,
        onRetryLoad = { examAlertReloadKey += 1 },
    )
}
