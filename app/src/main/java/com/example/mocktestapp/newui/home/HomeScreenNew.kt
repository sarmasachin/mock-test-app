package com.example.mocktestapp.newui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.LocalOverscrollConfiguration
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Divider
import androidx.compose.material3.DrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PieChart
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Quiz
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.WorkOutline
import androidx.compose.material.icons.rounded.Menu
import kotlin.math.roundToInt
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.example.mocktestapp.BuildConfig
import com.example.mocktestapp.MockTestApp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/**
 * Admin/CMS: add another [HomeCategorySection] to this list — layout scrolls and a divider is
 * inserted automatically between consecutive sections. First section keeps the existing look.
 */
private data class HomeCategorySection(
    val title: String,
    val items: List<String>,
)
private data class HomeQuickActionItem(
    val title: String,
    val actionKey: String,
    val iconKey: String? = null,
)
private data class HomeQuickActionSection(
    val title: String,
    val items: List<HomeQuickActionItem>,
)
private data class StartSeriesCardState(
    val isLocked: Boolean,
    val countdownText: String,
    val activeTestName: String?,
)

@Composable
fun HomeScreenNew(
    modifier: Modifier = Modifier,
    onLogout: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenActivity: () -> Unit,
    onOpenCategory: (String) -> Unit,
    onSeeAllCategories: () -> Unit,
    onStartTest: (String) -> Unit,
    onLeaderboard: () -> Unit,
    onResults: () -> Unit,
    onOpenPendingResult: (String, Int, Int, Int) -> Unit,
    onBookmarks: () -> Unit,
    onOpenJobAlert: () -> Unit,
    onOpenExamAlert: () -> Unit,
    onOpenNews: () -> Unit,
    onOpenNewsArticle: (String) -> Unit,
    onOpenProgressReport: () -> Unit,
    onOpenDaily: () -> Unit,
    onOpenMenuQuiz: () -> Unit,
    onOpenPoll: () -> Unit,
    onOpenNotifications: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val context = LocalContext.current
    val profile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )
    val attemptsUserKey = remember(profile.emailLine, profile.userIdFormatted) {
        profile.emailLine.ifBlank { profile.userIdFormatted ?: "guest" }
    }
    val attempts by TestHistoryRepository.observeAttempts(attemptsUserKey).collectAsState(initial = emptyList())
    val attemptsCount = attempts.size.toString()
    val bestScoreText = remember(attempts) {
        attempts
            .maxWithOrNull(
                compareBy<com.example.mocktestapp.data.local.TestAttemptEntity> {
                    it.correct.toFloat() / it.total.coerceAtLeast(1).toFloat()
                }.thenBy { it.correct }
                    .thenBy { it.completedAtMillis },
            )
            ?.let { "${it.correct}/${it.total.coerceAtLeast(1)}" }
            ?: "--"
    }
    val lastScoreText = remember(attempts) {
        attempts
            .maxByOrNull { it.completedAtMillis }
            ?.let { latest ->
                "${latest.correct}/${latest.total.coerceAtLeast(1)}"
            }
            ?: "--"
    }

    val scope = rememberCoroutineScope()
    val drawerState = androidx.compose.material3.rememberDrawerState(DrawerValue.Closed)

    var categorySections by remember {
        mutableStateOf(
        listOf(
            HomeCategorySection(
                title = "Category",
                items = listOf("Math", "Reasoning", "English", "GK", "Science", "Computer", "Hindi"),
            ),
        ),
        )
    }
    var homeWelcomeTemplate by remember { mutableStateOf("Welcome {name}") }
    var homeQuickActionsTitle by remember { mutableStateOf("Quick actions") }
    var quickActionSections by remember {
        mutableStateOf(
            listOf(
                HomeQuickActionSection(
                    title = "Quick actions",
                    items = listOf(
                        HomeQuickActionItem(title = "Start test", actionKey = "startTest"),
                        HomeQuickActionItem(title = "Leaderboard", actionKey = "leaderboard"),
                        HomeQuickActionItem(title = "Results", actionKey = "results"),
                        HomeQuickActionItem(title = "Tool", actionKey = "bookmarks"),
                    ),
                ),
            ),
        )
    }
    var bannerSlides by remember { mutableStateOf<List<HomeCarouselSlide>>(emptyList()) }
    var postSubmitCardTitle by remember { mutableStateOf("Result Pending") }
    var postSubmitCardReadyTitle by remember { mutableStateOf("Result Ready") }
    var postSubmitCardDateLabel by remember { mutableStateOf("Result date/time") }
    var postSubmitCardPendingMessage by remember { mutableStateOf("Result will be available in") }
    var postSubmitCardReadyMessage by remember { mutableStateOf("Result is now available.") }
    var postSubmitCardButtonLabel by remember { mutableStateOf("Show Result") }
    var postSubmitCardLines by remember { mutableStateOf<List<String>>(emptyList()) }
    val homeScroll = rememberScrollState()
    val visitPrefs = remember(context) {
        context.getSharedPreferences("home_last_visit", Context.MODE_PRIVATE)
    }
    var lastVisitMillis by remember { mutableStateOf(0L) }
    var showLastVisit by remember { mutableStateOf(false) }
    val pendingResult by AppPreferencesRepository.pendingResultState.collectAsState(initial = null)
    val appliedSeries by AppPreferencesRepository.appliedTestSeries.collectAsState(initial = emptyList())
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
    var hiddenSessionAt by remember { mutableStateOf(0L) }
    val startSeriesState = remember(appliedSeries, nowMs) {
        val eligible = appliedSeries
            .sortedBy { it.unlockAtMillis }
            .firstOrNull { nowMs < it.expiresAtMillis }
        if (eligible == null) {
            StartSeriesCardState(
                isLocked = false,
                countdownText = "",
                activeTestName = null,
            )
        } else {
            val remainingMs = (eligible.unlockAtMillis - nowMs).coerceAtLeast(0L)
            val hours = (remainingMs / 3_600_000L).toInt()
            val mins = ((remainingMs % 3_600_000L) / 60_000L).toInt()
            val secs = ((remainingMs % 60_000L) / 1_000L).toInt()
            val countdown = String.format("%02d:%02d:%02d", hours, mins, secs)
            StartSeriesCardState(
                isLocked = remainingMs > 0L,
                countdownText = countdown,
                activeTestName = eligible.testName,
            )
        }
    }

    LaunchedEffect(Unit) {
        val now = System.currentTimeMillis()
        val previousVisitTs = visitPrefs.getLong("last_home_visit_ts", 0L)
        val appLaunchTs = MockTestApp.appLaunchTimeMillis
        val shownForLaunchTs = visitPrefs.getLong("last_home_visit_shown_for_launch_ts", -1L)
        lastVisitMillis = previousVisitTs
        if (previousVisitTs <= 0L || shownForLaunchTs == appLaunchTs) {
            showLastVisit = false
        } else {
            showLastVisit = true
            delay(20_000L)
            showLastVisit = false
        }
        visitPrefs.edit()
            .putLong("last_home_visit_shown_for_launch_ts", appLaunchTs)
            .putLong("last_home_visit_ts", now)
            .apply()
    }
    LaunchedEffect(Unit) {
        while (true) {
            nowMs = System.currentTimeMillis()
            delay(1000L)
        }
    }
    LaunchedEffect(pendingResult?.publishAtMillis) {
        hiddenSessionAt = 0L
    }
    LaunchedEffect(Unit) {
        val remote = ContentRepository.loadHomeContent() ?: return@LaunchedEffect
        if (!remote.welcomeText.isNullOrBlank()) {
            homeWelcomeTemplate = remote.welcomeText
        }
        if (!remote.quickActionsTitle.isNullOrBlank()) {
            homeQuickActionsTitle = remote.quickActionsTitle
        }
        if (remote.sections.isNotEmpty()) {
            categorySections = remote.sections.map {
                HomeCategorySection(
                    title = it.title,
                    items = it.items,
                )
            }
        }
        if (remote.quickActionSections.isNotEmpty()) {
            quickActionSections = remote.quickActionSections.map { section ->
                HomeQuickActionSection(
                    title = section.title,
                    items = section.items.map { item ->
                        HomeQuickActionItem(
                            title = item.title,
                            actionKey = item.actionKey,
                            iconKey = item.iconKey?.takeIf { it.isNotBlank() },
                        )
                    },
                )
            }
        }
        val mixedSlides = mutableListOf<HomeCarouselSlide>()
        mixedSlides += remote.banners.map { imageUrl ->
            HomeCarouselSlide(imageUrl = imageUrl)
        }
        mixedSlides += remote.newsSlides.map { slide ->
            HomeCarouselSlide(
                imageUrl = slide.imageUrl,
                title = slide.headline,
                articleId = slide.articleId,
            )
        }
        bannerSlides = mixedSlides
    }
    LaunchedEffect(Unit) {
        val instruction = ContentRepository.loadInstructionContent() ?: return@LaunchedEffect
        postSubmitCardTitle = instruction.postSubmitCardTitle?.ifBlank { postSubmitCardTitle } ?: postSubmitCardTitle
        postSubmitCardReadyTitle = instruction.postSubmitCardReadyTitle?.ifBlank { postSubmitCardReadyTitle } ?: postSubmitCardReadyTitle
        postSubmitCardDateLabel = instruction.postSubmitCardDateLabel?.ifBlank { postSubmitCardDateLabel } ?: postSubmitCardDateLabel
        postSubmitCardPendingMessage = instruction.postSubmitCardPendingMessage?.ifBlank { postSubmitCardPendingMessage } ?: postSubmitCardPendingMessage
        postSubmitCardReadyMessage = instruction.postSubmitCardReadyMessage?.ifBlank { postSubmitCardReadyMessage } ?: postSubmitCardReadyMessage
        postSubmitCardButtonLabel = instruction.postSubmitCardButtonLabel?.ifBlank { postSubmitCardButtonLabel } ?: postSubmitCardButtonLabel
        if (instruction.postSubmitCardLines.isNotEmpty()) {
            postSubmitCardLines = instruction.postSubmitCardLines
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            gesturesEnabled = drawerState.isOpen,
            scrimColor = Color.Black.copy(alpha = 0.32f),
            drawerContent = {
                AppDrawer(
                    drawerState = drawerState,
                    onOpenProfile = onOpenProfile,
                    onOpenHistory = onOpenHistory,
                    onOpenActivity = onOpenActivity,
                    onOpenProgressReport = onOpenProgressReport,
                    onOpenJobAlert = onOpenJobAlert,
                    onOpenExamAlert = onOpenExamAlert,
                    onOpenNews = onOpenNews,
                    onOpenDaily = onOpenDaily,
                    onOpenMenuQuiz = onOpenMenuQuiz,
                    onShareApp = {
                        scope.launch {
                            drawerState.close()
                            val packageName = context.packageName
                            val storeUrl = "https://play.google.com/store/apps/details?id=$packageName"
                            val shareMessage = "Check out MockTestApp for practice tests and alerts.\n$storeUrl"
                            try {
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, shareMessage)
                                }
                                context.startActivity(Intent.createChooser(send, "Share MockTestApp"))
                            } catch (_: ActivityNotFoundException) {
                                // Ignore if no share app available.
                            }
                        }
                    },
                    onLogout = onLogout,
                )
            },
        ) {
            Scaffold(
                containerColor = Color.Transparent,
                // NavHost already applies status-bar padding; avoid double inset so "Welcome" sits higher.
                contentWindowInsets = WindowInsets(0),
            ) { padding ->
                Column(
                    modifier = modifier
                        .fillMaxSize()
                        .background(bg)
                        .padding(padding),
                ) {
                TopRow(
                    welcomeText = homeWelcomeTemplate
                        .replace("{name}", profile.displayName.ifBlank { "User" })
                        .let { text ->
                            if (text.contains("{name}")) {
                                text.replace("{name}", profile.displayName.ifBlank { "User" })
                            } else if (text.isBlank() || text.equals("welcome", ignoreCase = true)) {
                                "Welcome ${profile.displayName.ifBlank { "User" }}"
                            } else {
                                text
                            }
                        },
                    onOpenDrawer = {
                        scope.launch {
                            if (!drawerState.isOpen) drawerState.open()
                        }
                    },
                    onOpenPoll = onOpenPoll,
                    onOpenNotifications = onOpenNotifications,
                )

                Column(
                    modifier = Modifier
                        .weight(1f, fill = true)
                        .fillMaxWidth()
                        .verticalScroll(homeScroll),
                ) {
                    Spacer(Modifier.height(12.dp))
                    HomeBannerCarouselNew(
                        modifier = Modifier.padding(horizontal = 14.dp),
                        slides = bannerSlides,
                        onSlideClick = { slide ->
                            val articleId = slide.articleId
                            if (!articleId.isNullOrBlank()) {
                                onOpenNewsArticle(articleId)
                            }
                        },
                    )

                    Spacer(Modifier.height(14.dp))
                    Box(modifier = Modifier.padding(horizontal = 14.dp)) {
                        StatsRow(
                            attempts = attemptsCount,
                            bestScore = bestScoreText,
                            lastScore = lastScoreText,
                        )
                    }
                    pendingResult?.let { pending ->
                        val isReady = nowMs >= pending.publishAtMillis
                        val canShow = hiddenSessionAt == 0L || isReady
                        if (canShow) {
                            Spacer(Modifier.height(10.dp))
                            PendingResultCard(
                                testName = pending.testName,
                                publishAtMillis = pending.publishAtMillis,
                                nowMillis = nowMs,
                                pendingTitle = postSubmitCardTitle,
                                readyTitle = postSubmitCardReadyTitle,
                                dateLabel = postSubmitCardDateLabel,
                                pendingMessage = postSubmitCardPendingMessage,
                                readyMessage = postSubmitCardReadyMessage,
                                buttonLabel = postSubmitCardButtonLabel,
                                extraLines = postSubmitCardLines,
                                onClose = {
                                    hiddenSessionAt = nowMs
                                    AppPreferencesRepository.hidePendingResultCardForSession()
                                },
                                onShowResult = {
                                    AppPreferencesRepository.markPendingResultViewedAndClear()
                                    onOpenPendingResult(
                                        pending.testName,
                                        pending.answered,
                                        pending.correct,
                                        pending.wrong,
                                    )
                                },
                            )
                        }
                    }
                    if (showLastVisit && lastVisitMillis > 0L) {
                        val formatter = remember { DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a") }
                        val lastVisitText = remember(lastVisitMillis) {
                            val at = Instant.ofEpochMilli(lastVisitMillis).atZone(ZoneId.systemDefault())
                            formatter.format(at)
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Last visit: $lastVisitText",
                            color = p.textSecondary,
                            fontSize = 12.sp,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp),
                        )
                    }

                    Spacer(Modifier.height(18.dp))
                    Divider(color = p.systemBlue.copy(alpha = 0.25f))
                    Spacer(Modifier.height(12.dp))

                    categorySections.forEachIndexed { index, section ->
                        if (index > 0) {
                            Spacer(Modifier.height(18.dp))
                            Divider(color = p.systemBlue.copy(alpha = 0.25f))
                            Spacer(Modifier.height(12.dp))
                        }
                        Box(modifier = Modifier.padding(horizontal = 14.dp)) {
                            SectionTitle(text = section.title)
                        }
                        Spacer(Modifier.height(10.dp))
                        Box(modifier = Modifier.padding(horizontal = 14.dp)) {
                            CategoryRow(
                                categories = section.items,
                                onClick = onOpenCategory,
                                onSeeAll = onSeeAllCategories,
                            )
                        }
                    }

                    Spacer(Modifier.height(18.dp))
                    Divider(color = p.systemBlue.copy(alpha = 0.25f))
                    Spacer(Modifier.height(12.dp))

                    quickActionSections.forEachIndexed { index, section ->
                        if (index > 0) {
                            Spacer(Modifier.height(18.dp))
                            Divider(color = p.systemBlue.copy(alpha = 0.25f))
                            Spacer(Modifier.height(12.dp))
                        }
                        val sectionTitle = section.title.ifBlank { homeQuickActionsTitle }
                        Box(modifier = Modifier.padding(horizontal = 14.dp)) {
                            SectionTitle(text = sectionTitle)
                        }
                        Spacer(Modifier.height(12.dp))
                        Box(modifier = Modifier.padding(horizontal = 14.dp)) {
                            ActionsGrid(
                                actions = section.items,
                                startSeriesState = startSeriesState,
                                onAction = { actionKey ->
                                    val normalizedKey = actionKey.trim().lowercase()
                                    when {
                                        normalizedKey == "starttest" || normalizedKey == "start_test" || normalizedKey == "start test" -> {
                                            onStartTest(startSeriesState.activeTestName ?: "bsc nursing moc test")
                                        }
                                        normalizedKey == "leaderboard" || normalizedKey == "leader_board" || normalizedKey == "leader board" -> onLeaderboard()
                                        normalizedKey.contains("result") || normalizedKey == "score" || normalizedKey == "results_history" -> onResults()
                                        normalizedKey == "bookmarks" || normalizedKey == "bookmark" || normalizedKey == "tool" || normalizedKey == "tools" -> onBookmarks()
                                    }
                                },
                            )
                        }
                    }

                    Spacer(Modifier.height(18.dp))
                    Divider(color = p.systemBlue.copy(alpha = 0.25f))
                }
            }
        }
        }

    }
}

@Composable
private fun PendingResultCard(
    testName: String,
    publishAtMillis: Long,
    nowMillis: Long,
    pendingTitle: String,
    readyTitle: String,
    dateLabel: String,
    pendingMessage: String,
    readyMessage: String,
    buttonLabel: String,
    extraLines: List<String>,
    onClose: () -> Unit,
    onShowResult: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val remainingMs = (publishAtMillis - nowMillis).coerceAtLeast(0L)
    val isReady = remainingMs <= 0L
    val hours = (remainingMs / 3_600_000L).toInt()
    val mins = ((remainingMs % 3_600_000L) / 60_000L).toInt()
    val secs = ((remainingMs % 60_000L) / 1_000L).toInt()
    val countdownText = String.format("%02d:%02d:%02d", hours, mins, secs)
    val releaseText = remember(publishAtMillis) {
        runCatching {
            val at = Instant.ofEpochMilli(publishAtMillis).atZone(ZoneId.systemDefault())
            DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a").format(at)
        }.getOrDefault("-")
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (isReady) readyTitle else pendingTitle,
                    color = p.textPrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp,
                )
                IconButton(onClick = onClose, modifier = Modifier.size(22.dp)) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = "Close",
                        tint = p.textSecondary,
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                text = testName,
                color = p.textSecondary,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Outlined.Schedule,
                    contentDescription = null,
                    tint = p.accent,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "$dateLabel: $releaseText",
                    color = p.textSecondary,
                    fontSize = 12.sp,
                )
            }
            Spacer(Modifier.height(8.dp))
            extraLines.forEach { line ->
                Text(
                    text = line,
                    color = p.textSecondary,
                    fontSize = 12.sp,
                )
                Spacer(Modifier.height(4.dp))
            }
            if (isReady) {
                Text(
                    text = readyMessage,
                    color = p.textPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(10.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(p.systemBlue)
                        .clickable(onClick = onShowResult)
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                ) {
                    Text(
                        text = buttonLabel,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                    )
                }
            } else {
                Text(
                    text = pendingMessage,
                    color = p.textSecondary,
                    fontSize = 12.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = countdownText,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
        }
    }
}

@Composable
private fun ShareAppDialog(
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val p = mockTestPalette()
    val packageName = context.packageName
    val storeUrl = remember(packageName) {
        "https://play.google.com/store/apps/details?id=$packageName"
    }
    val shareMessage = remember(storeUrl) {
        "Check out MockTestApp for practice tests and alerts.\n$storeUrl"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = p.surface,
        title = {
            Text(
                text = "Share app",
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
            )
        },
        text = {
            Column {
                Text(
                    text = "Copy the Play Store link or send it with any app.",
                    color = p.textSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = storeUrl,
                    color = p.accent,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, shareMessage)
                    }
                    context.startActivity(Intent.createChooser(send, "Share MockTestApp"))
                    onDismiss()
                },
            ) {
                Text("Share", color = p.accent, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(
                onClick = {
                    clipboard.setText(AnnotatedString(storeUrl))
                    Toast.makeText(context, "Link copied", Toast.LENGTH_SHORT).show()
                    onDismiss()
                },
            ) {
                Text("Copy link", color = p.textPrimary)
            }
        },
    )
}

@Composable
private fun TopRow(
    welcomeText: String,
    onOpenDrawer: () -> Unit,
    onOpenPoll: () -> Unit,
    onOpenNotifications: () -> Unit,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // Left: menu icon
        IconButton(onClick = onOpenDrawer) {
            Icon(
                imageVector = Icons.Rounded.Menu,
                contentDescription = "Menu",
                tint = p.textPrimary,
            )
        }

        // Center: welcome text using remaining width
        Box(
            modifier = Modifier
                .weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = welcomeText,
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }

        // Right: compact action area (poll + notification) sized to avoid title overlap.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            IconButton(onClick = onOpenPoll) {
                Icon(
                    imageVector = Icons.Outlined.PieChart,
                    contentDescription = "Poll",
                    tint = p.textPrimary,
                )
            }
            IconButton(onClick = onOpenNotifications) {
                Icon(
                    imageVector = Icons.Outlined.Notifications,
                    contentDescription = "Notifications",
                    tint = p.textPrimary,
                )
            }
        }
    }
}

@Composable
private fun StatsRow(
    attempts: String,
    bestScore: String,
    lastScore: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StatCard(title = "Attempts", value = attempts, modifier = Modifier.weight(1f))
        StatCard(title = "Best score", value = bestScore, modifier = Modifier.weight(1f))
        StatCard(title = "Last score", value = lastScore, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    Card(
        modifier = modifier,
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = title,
                color = p.textSecondary,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = value,
                color = p.textPrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    val p = mockTestPalette()
    Text(
        text = text,
        color = p.textPrimary,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 16.sp,
    )
}

@Composable
private fun CategoryRow(
    categories: List<String>,
    onClick: (String) -> Unit,
    onSeeAll: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Top row: always 4 equal slots (indices 0–3). Weight is on Row direct children only
        // (no extra wrapper Box) so constraints match CategoryChip / Spacer cleanly.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(4) { col ->
                val label = categories.getOrNull(col)
                if (label != null) {
                    CategoryChip(
                        text = label,
                        onClick = { onClick(label) },
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    Spacer(Modifier.weight(1f).height(46.dp))
                }
            }
        }

        // Bottom row: 4 equal slots — categories at 4–6, See All fixed as 4th
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(3) { idx ->
                val label = categories.getOrNull(4 + idx)
                if (label != null) {
                    CategoryChip(
                        text = label,
                        onClick = { onClick(label) },
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    Spacer(Modifier.weight(1f).height(46.dp))
                }
            }

            SeeAllChip(
                onClick = onSeeAll,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun CategoryChip(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = 46.dp)
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.18f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = p.textPrimary,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun SeeAllChip(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = 46.dp)
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.18f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "See All",
            color = p.accent,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ActionsGrid(
    actions: List<HomeQuickActionItem>,
    startSeriesState: StartSeriesCardState,
    onAction: (String) -> Unit,
) {
    val normalized = if (actions.isNotEmpty()) {
        actions
    } else {
        listOf(
            HomeQuickActionItem(title = "Start test", actionKey = "startTest"),
            HomeQuickActionItem(title = "Leaderboard", actionKey = "leaderboard"),
            HomeQuickActionItem(title = "Results", actionKey = "results"),
            HomeQuickActionItem(title = "Tool", actionKey = "bookmarks"),
        )
    }
    val rows = normalized.chunked(2)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        rows.forEach { rowItems ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                rowItems.forEach { item ->
                    val isStartSeries = item.actionKey == "startTest"
                    val subtitle = if (isStartSeries && startSeriesState.isLocked) {
                        "Starts in ${startSeriesState.countdownText}"
                    } else {
                        ""
                    }
                    ActionCard(
                        title = item.title,
                        subtitle = subtitle,
                        actionKey = item.actionKey,
                        iconKey = item.iconKey,
                        enabled = true,
                        onClick = { onAction(item.actionKey) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(2 - rowItems.size) {
                    Spacer(Modifier.weight(1f).height(122.dp))
                }
            }
        }
    }
}

@Composable
private fun ActionCard(
    title: String,
    subtitle: String,
    actionKey: String,
    iconKey: String? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val icon = remember(actionKey, iconKey) { resolveQuickActionIcon(actionKey, iconKey) }
    // Fixed height (no aspectRatio): Row + weight() + aspectRatio() fights intrinsic height
    // and misaligns the bottom row (Results / Tool) on many screens.
    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(122.dp)
            .clickable(enabled = enabled, onClick = onClick),
        shape = shape,
        colors = CardDefaults.cardColors(
            containerColor = if (enabled) p.surface else p.surface.copy(alpha = 0.7f),
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(p.border.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = p.accent,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = title,
                color = p.textPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                textAlign = TextAlign.Center,
            )
            if (subtitle.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = subtitle,
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

private fun resolveQuickActionIcon(
    actionKey: String,
    iconKey: String?,
): androidx.compose.ui.graphics.vector.ImageVector {
    return when ((iconKey?.takeIf { it.isNotBlank() } ?: actionKey).lowercase()) {
        "start", "starttest", "play" -> Icons.Outlined.PlayArrow
        "leaderboard", "trophy", "rank" -> Icons.Outlined.EmojiEvents
        "results", "result", "report", "score" -> Icons.Outlined.BarChart
        "tool", "tools", "bookmark", "bookmarks" -> Icons.Outlined.Bookmark
        "history" -> Icons.Outlined.History
        "news", "article" -> Icons.Outlined.Article
        "daily", "today" -> Icons.Outlined.Today
        "quiz" -> Icons.Outlined.Quiz
        "poll" -> Icons.Outlined.PieChart
        else -> Icons.Outlined.Star
    }
}

private fun openPlayStoreForRating(context: Context) {
    val pkg = context.packageName
    val marketUri = Uri.parse("market://details?id=$pkg")
    val webUri = Uri.parse("https://play.google.com/store/apps/details?id=$pkg")
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, marketUri).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) },
        )
    } catch (_: ActivityNotFoundException) {
        try {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, webUri).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) },
            )
        } catch (_: ActivityNotFoundException) {
            // No Play Store or browser available
        }
    }
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun AppDrawer(
    drawerState: DrawerState,
    onOpenProfile: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenActivity: () -> Unit,
    onOpenProgressReport: () -> Unit,
    onOpenJobAlert: () -> Unit,
    onOpenExamAlert: () -> Unit,
    onOpenNews: () -> Unit,
    onOpenDaily: () -> Unit,
    onOpenMenuQuiz: () -> Unit,
    onShareApp: () -> Unit,
    onLogout: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val p = mockTestPalette()
    // Keep drawer distinct from the page background to avoid a "white blank screen" feel.
    val sheetBg = p.surfaceElevated
    val border = p.border.copy(alpha = 0.22f)
    val configuration = LocalConfiguration.current
    val drawerWidthDp = (configuration.screenWidthDp * 0.82f).roundToInt().coerceIn(268, 300).dp
    val drawerShape = RoundedCornerShape(topEnd = 20.dp, bottomEnd = 20.dp)

    CompositionLocalProvider(LocalOverscrollConfiguration provides null) {
        ModalDrawerSheet(
            drawerContainerColor = sheetBg,
            drawerTonalElevation = 6.dp,
            windowInsets = WindowInsets(0, 0, 0, 0),
            modifier = Modifier
                .width(drawerWidthDp)
                .clip(drawerShape)
                .border(1.dp, border, drawerShape),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
            ) {
                Spacer(Modifier.height(4.dp))
                DrawerHeader()
                Spacer(Modifier.height(12.dp))

                DrawerItem(
                    icon = Icons.Outlined.Person,
                    label = "Profile",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenProfile()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.History,
                    label = "History",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenHistory()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.PieChart,
                    label = "Activity",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenActivity()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.BarChart,
                    label = "Progress report",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenProgressReport()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.WorkOutline,
                    label = "Job alert",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenJobAlert()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.School,
                    label = "Exam alert",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenExamAlert()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.Article,
                    label = "News",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenNews()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.Today,
                    label = "Daily Digest",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenDaily()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.Quiz,
                    label = "Daily Quiz",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onOpenMenuQuiz()
                        }
                    },
                )
                DrawerItem(
                    icon = Icons.Outlined.Share,
                    label = "Share app",
                    onClick = { onShareApp() },
                )
                DrawerItem(
                    icon = Icons.Outlined.Star,
                    label = "Rate on Play Store",
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            openPlayStoreForRating(context)
                        }
                    },
                )

                // Avoid Spacer(Modifier.weight(1f)) here: inside ModalDrawerSheet some devices pass
                // height constraints where weighted spacers can throw during first layout after login.
                Spacer(Modifier.height(32.dp))

                DrawerItem(
                    icon = Icons.Outlined.Logout,
                    label = "Logout",
                    isDanger = true,
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            onLogout()
                        }
                    },
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "App version ${BuildConfig.VERSION_NAME}",
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                )
                Spacer(Modifier.height(18.dp))
            }
        }
    }
}

@Composable
private fun DrawerHeader() {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val profile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        AppPreferencesRepository.ensureDrawerUserCode()
    }

    val displayName = profile.displayName.ifBlank { "Guest" }
    val emailShown = profile.emailLine.ifBlank { "No email saved" }

    Column(
        modifier = Modifier
            .padding(horizontal = 12.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(
            text = displayName,
            color = p.textPrimary,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 19.sp,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = emailShown,
            color = if (profile.emailLine.isNotBlank()) p.textSecondary else p.textSecondary.copy(alpha = 0.55f),
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(6.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "User Id - ${profile.userIdFormatted ?: "00000000"}",
                color = if (profile.userIdFormatted != null) p.textPrimary else p.textSecondary.copy(alpha = 0.55f),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = {
                    val userId = profile.userIdFormatted ?: "00000000"
                    clipboard.setText(AnnotatedString(userId))
                    Toast.makeText(context, "User ID copied", Toast.LENGTH_SHORT).show()
                },
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.ContentCopy,
                    contentDescription = "Copy user id",
                    tint = p.textSecondary,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Composable
private fun DrawerItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    isDanger: Boolean = false,
) {
    val p = mockTestPalette()
    val tint = if (isDanger) p.error else p.accent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Text(
            text = label,
            color = tint,
            fontSize = 15.5.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 20.sp,
        )
    }
}

