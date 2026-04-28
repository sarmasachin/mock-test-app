package com.freemocktest.app.newui.alerts

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.WorkOutline
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.freemocktest.app.data.ContentRepository
import androidx.compose.ui.Modifier
import com.freemocktest.app.newui.feeds.WebFeedDefaults
import com.freemocktest.app.newui.news.FeedBrowseScreenNew
import com.freemocktest.app.newui.news.ManualNewsItem

const val JobAlertFeedImageSeedPrefix = "mocktest_job"
const val ExamAlertFeedImageSeedPrefix = "mocktest_exam"

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
    LaunchedEffect(Unit) {
        items = ContentRepository.loadNewsFeed("job")
        menuCategories = ContentRepository.loadHomeContent()
            ?.jobCategoryMenu
            ?.filter { it.isNotBlank() }
            .orEmpty()
            .distinctBy { it.lowercase() }
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
        onBack = onBack,
        onOpenItem = onOpenListing,
        categoryMenu = allCategories,
        selectedCategory = selectedCategory,
        onSelectCategory = { selectedCategory = it },
        modifier = modifier,
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
    LaunchedEffect(Unit) {
        items = ContentRepository.loadNewsFeed("exam")
        menuCategories = ContentRepository.loadHomeContent()
            ?.examCategoryMenu
            ?.filter { it.isNotBlank() }
            .orEmpty()
            .distinctBy { it.lowercase() }
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
        onBack = onBack,
        onOpenItem = onOpenListing,
        categoryMenu = allCategories,
        selectedCategory = selectedCategory,
        onSelectCategory = { selectedCategory = it },
        modifier = modifier,
    )
}
