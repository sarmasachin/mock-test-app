package com.freemocktest.app.newui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.WorkOutline
import androidx.compose.material.icons.rounded.Menu
import kotlin.math.roundToInt
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import com.freemocktest.app.BuildConfig
import com.freemocktest.app.MockTestApp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.data.TestHistoryRepository
import com.freemocktest.app.newui.theme.palette.applyColorPresetFromRemote
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import java.util.Date
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

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
private val defaultHomeCategorySections = listOf(
    HomeCategorySection(
        title = "Category",
        items = listOf("Math", "Reasoning", "English", "GK", "Science", "Computer", "Hindi"),
    ),
)
private val defaultHomeQuickActionSections = listOf(
    HomeQuickActionSection(
        title = "Quick actions",
        items = listOf(
            HomeQuickActionItem(title = "Start test", actionKey = "startTest"),
            HomeQuickActionItem(title = "Result", actionKey = "results"),
            HomeQuickActionItem(title = "Leaderboard", actionKey = "leaderboard"),
            HomeQuickActionItem(title = "Tool", actionKey = "bookmarks"),
        ),
    ),
)
private data class StartSeriesCardState(
    val isLocked: Boolean,
    val countdownText: String,
    val activeTestName: String?,
)

@Composable
@OptIn(ExperimentalMaterialApi::class)
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
    onOpenPendingResult: (String, Int, Int, Int, Int, Long) -> Unit,
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
    val context = LocalContext.current
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
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
    val scoreVisible by AppPreferencesRepository.scoreVisibilityEnabled.collectAsState(initial = true)
    val attemptsCount = attempts.size.toString()
    val bestScoreValue = remember(attempts, scoreVisible) {
        if (!scoreVisible) {
            "-"
        } else {
            attempts
                .maxWithOrNull(
                    compareBy<com.freemocktest.app.data.local.TestAttemptEntity> {
                        it.correct.toFloat() / it.total.coerceAtLeast(1).toFloat()
                    }.thenBy { it.correct }
                        .thenBy { it.completedAtMillis },
                )
                ?.let { "${it.correct}/${it.total.coerceAtLeast(1)}" }
                ?: "--"
        }
    }
    val lastScoreValue = remember(attempts, scoreVisible) {
        if (!scoreVisible) {
            "-"
        } else {
            attempts
                .maxByOrNull { it.completedAtMillis }
                ?.let { latest ->
                    "${latest.correct}/${latest.total.coerceAtLeast(1)}"
                }
                ?: "--"
        }
    }

    val scope = rememberCoroutineScope()
    val drawerState = androidx.compose.material3.rememberDrawerState(DrawerValue.Closed)

    var categorySections by remember {
        mutableStateOf(
        defaultHomeCategorySections,
        )
    }
    /** Hide the category strip until the first home CMS fetch settles so dummy chips never flash then swap. */
    var homeCategoryStripReady by remember { mutableStateOf(false) }
    var homeWelcomeTemplate by remember { mutableStateOf("Welcome {name}") }
    var homeQuickActionsTitle by remember { mutableStateOf("Quick actions") }
    var shareAppTemplate by remember { mutableStateOf("Check out MockTestApp for practice tests and alerts.\n{storeUrl}") }
    var quickActionSections by remember {
        mutableStateOf(
            defaultHomeQuickActionSections,
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
    var promoWidgetEnabled by remember { mutableStateOf(false) }
    var promoWidgetHtml by remember { mutableStateOf("") }
    var studentUpdateWidgetEnabled by remember { mutableStateOf(false) }
    var studentUpdateWidgetHtml by remember { mutableStateOf("") }
    var pollCount by remember { mutableIntStateOf(0) }
    var notificationCount by remember { mutableIntStateOf(0) }
    var homePollPopupEnabled by remember { mutableStateOf(false) }
    var homePollPopupVisible by rememberSaveable { mutableStateOf(false) }
    var homePollPopupDismissedPollId by rememberSaveable { mutableStateOf("") }
    var homePollActive by remember { mutableStateOf<ContentRepository.PollItemRemote?>(null) }
    val homePollSelections = remember { mutableStateMapOf<String, Set<Int>>() }
    val homePollResults = remember { mutableStateMapOf<String, List<Int>>() }
    var homePollSubmitting by remember { mutableStateOf(false) }
    var homePollMessage by remember { mutableStateOf<String?>(null) }
    val homeScroll = rememberScrollState()
    val visitPrefs = remember(context) {
        context.getSharedPreferences("home_last_visit", Context.MODE_PRIVATE)
    }
    var lastVisitMillis by remember { mutableStateOf(0L) }
    var showLastVisit by rememberSaveable { mutableStateOf(false) }
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

    /** Wall-clock of last successful home CMS fetch; used to throttle resume refreshes. */
    var lastHomeContentFetchAt by remember { mutableLongStateOf(0L) }

    fun applyHomeRemote(remote: ContentRepository.HomeContentRemote) {
        applyColorPresetFromRemote(remote.themePreset)
        if (!remote.welcomeText.isNullOrBlank()) {
            homeWelcomeTemplate = remote.welcomeText
        }
        if (!remote.quickActionsTitle.isNullOrBlank()) {
            homeQuickActionsTitle = remote.quickActionsTitle
        }
        val mappedCategorySections = remote.sections
            .mapNotNull { section ->
                val title = section.title.trim()
                val items = section.items.map { it.trim() }.filter { it.isNotBlank() }
                if (title.isBlank() || items.isEmpty()) {
                    null
                } else {
                    HomeCategorySection(
                        title = title,
                        items = items,
                    )
                }
            }
        if (mappedCategorySections.isNotEmpty()) {
            categorySections = mappedCategorySections
        }
        val mappedQuickActionSections = remote.quickActionSections
            .mapNotNull { section ->
                val title = section.title.trim()
                val items = section.items.mapNotNull { item ->
                    val itemTitle = item.title.trim()
                    val actionKey = item.actionKey.trim()
                    if (itemTitle.isBlank() || actionKey.isBlank()) {
                        null
                    } else {
                        HomeQuickActionItem(
                            title = itemTitle,
                            actionKey = actionKey,
                            iconKey = item.iconKey?.trim()?.takeIf { it.isNotBlank() },
                        )
                    }
                }
                if (title.isBlank() || items.isEmpty()) {
                    null
                } else {
                    HomeQuickActionSection(
                        title = title,
                        items = items,
                    )
                }
            }
        if (mappedQuickActionSections.isNotEmpty()) {
            quickActionSections = mappedQuickActionSections
        }
        promoWidgetEnabled = remote.promoWidgetEnabled
        promoWidgetHtml = remote.promoWidgetHtml.orEmpty()
        studentUpdateWidgetEnabled = remote.studentUpdateWidgetEnabled
        studentUpdateWidgetHtml = remote.studentUpdateWidgetHtml.orEmpty()
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
        val now = System.currentTimeMillis()
        val previousVisitTs = visitPrefs.getLong("last_home_visit_ts", 0L)
        val appLaunchTs = MockTestApp.appLaunchTimeMillis
        val shownForLaunchTs = visitPrefs.getLong("last_home_visit_shown_for_launch_ts", -1L)
        lastVisitMillis = previousVisitTs
        if (previousVisitTs <= 0L || shownForLaunchTs == appLaunchTs) {
            showLastVisit = false
        } else {
            showLastVisit = true
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
        // Stale-while-revalidate: hydrate from disk cache instantly so chips/quick actions don't
        // flash defaults on cold start, then fetch the latest payload in the background and
        // silently swap. Both paths are independently guarded so a failure in either does not
        // strand `homeCategoryStripReady` (which would hide the strip forever).
        var stripReadyMarked = false
        try {
            try {
                val cached = ContentRepository.loadCachedHomeContent()
                if (cached != null) {
                    applyHomeRemote(cached)
                    homeCategoryStripReady = true
                    stripReadyMarked = true
                }
            } catch (_: Exception) {
                // Fall through to network. We never persist a partial cache, so a parse failure
                // here just means we render defaults until the fresh fetch returns.
            }
            try {
                val remote = ContentRepository.loadHomeContent(forceRefresh = true)
                if (remote != null) {
                    lastHomeContentFetchAt = System.currentTimeMillis()
                    applyHomeRemote(remote)
                }
            } catch (_: Exception) {
                // Network failed – keep showing whatever is on screen (cache or defaults).
            }
        } finally {
            if (!stripReadyMarked) {
                homeCategoryStripReady = true
            }
        }
    }
    LaunchedEffect(Unit) {
        // Failure here just means the share button keeps its built-in default template.
        try {
            val share = ContentRepository.loadShareContent() ?: return@LaunchedEffect
            val text = share.body?.trim().orEmpty()
            if (text.isNotBlank()) {
                shareAppTemplate = text
            }
        } catch (_: Exception) {
            // Default `shareAppTemplate` remains in effect.
        }
    }
    LaunchedEffect(Unit) {
        // Poll modal involves a chain of network + prefs calls; if any link fails,
        // leave all poll state at safe defaults (popup hidden, no selections) instead
        // of crashing this coroutine and silently breaking subsequent effects.
        try {
            val pollSettings = ContentRepository.loadPollModalSettings()
            homePollPopupEnabled = pollSettings.showHomePopup
            val activePoll = pollSettings.items.firstOrNull()
            homePollActive = activePoll
            val votedPollIds = AppPreferencesRepository.getVotedPollIdsNow().map { it.trim() }.toSet()
            val status = activePoll?.let { ContentRepository.loadPollVoteStatus(it.id) }
            if (status?.hasVoted == true && activePoll != null) {
                homePollSelections[activePoll.id] = status.optionIndexes.toSet()
                homePollResults[activePoll.id] = status.counts
                AppPreferencesRepository.markPollVoted(activePoll.id)
            }
            if (
                pollSettings.showHomePopup &&
                activePoll != null &&
                status?.hasVoted != true &&
                !votedPollIds.contains(activePoll.id.trim()) &&
                !activePoll.id.equals(homePollPopupDismissedPollId, ignoreCase = true)
            ) {
                homePollPopupVisible = true
            }
        } catch (_: Exception) {
            // Network/parse/prefs error: keep the popup hidden so the user is not stuck on a half-initialised modal.
            homePollPopupVisible = false
        }
    }
    LaunchedEffect(Unit) {
        // Failure here just means the post-submit card keeps its built-in default copy.
        try {
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
        } catch (_: Exception) {
            // Defaults already in `postSubmitCard*` state remain in effect.
        }
    }
    suspend fun refreshUnreadCounts() {
        runCatching {
            val polls = ContentRepository.loadPollItems()
            val seenPollIds = AppPreferencesRepository.getSeenPollIdsNow().map { it.trim() }.toSet()
            polls.count { poll ->
                val id = poll.id.trim()
                id.isNotBlank() && !seenPollIds.contains(id)
            }
        }.onSuccess { pollCount = it }
            .onFailure { pollCount = 0 }
        runCatching {
            val notifications = ContentRepository.loadNotifications()
            val seenNotificationIds = AppPreferencesRepository.getSeenNotificationIdsNow().map { it.trim() }.toSet()
            notifications.count { item ->
                val id = item.id.trim()
                id.isNotBlank() && !seenNotificationIds.contains(id)
            }
        }.onSuccess { notificationCount = it }
            .onFailure { notificationCount = 0 }
    }
    LaunchedEffect(Unit) {
        refreshUnreadCounts()
    }

    // Pull-to-refresh: force reload CMS home payload so admin changes reflect without app restart.
    var pullRefreshing by remember { mutableStateOf(false) }
    fun triggerPullRefresh() {
        if (pullRefreshing) return
        scope.launch {
            pullRefreshing = true
            try {
                refreshUnreadCounts()
                val remote = ContentRepository.loadHomeContent(forceRefresh = true)
                if (remote != null) {
                    lastHomeContentFetchAt = System.currentTimeMillis()
                    applyHomeRemote(remote)
                }
            } finally {
                pullRefreshing = false
            }
        }
    }
    val pullRefreshState = rememberPullRefreshState(refreshing = pullRefreshing, onRefresh = ::triggerPullRefresh)
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                scope.launch {
                    // Foreground refresh must never crash the coroutine; otherwise subsequent
                    // ON_RESUME events would re-launch into a cancelled scope and silently no-op.
                    try {
                        refreshUnreadCounts()
                        val now = System.currentTimeMillis()
                        if (now - lastHomeContentFetchAt > 45_000L) {
                            val remote = ContentRepository.loadHomeContent(forceRefresh = true) ?: return@launch
                            lastHomeContentFetchAt = System.currentTimeMillis()
                            applyHomeRemote(remote)
                        }
                    } catch (_: Exception) {
                        // Swallow: pull-to-refresh stays available for the user to retry manually.
                    }
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
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
                            val shareMessage = resolveShareAppMessage(
                                template = shareAppTemplate,
                                storeUrl = storeUrl,
                            )
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
                val headerFallBrush = Brush.verticalGradient(
                    colors = listOf(
                        p.homeHeaderStart,
                        p.homeHeaderEnd.copy(alpha = 0.92f),
                        p.homeHeaderEnd.copy(alpha = 0.45f),
                        p.surface.copy(alpha = 0.98f),
                        p.surface,
                    ),
                )
                Box(
                    modifier = modifier
                        .fillMaxSize()
                        .background(p.surface)
                        .padding(padding),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(430.dp)
                            .background(headerFallBrush),
                    )
                    Column(
                        modifier = Modifier.fillMaxSize(),
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
                    pollCount = pollCount,
                    notificationCount = notificationCount,
                )

                Box(
                    modifier = Modifier
                        .weight(1f, fill = true)
                        .fillMaxWidth()
                        .pullRefresh(pullRefreshState),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(homeScroll),
                    ) {
                    Spacer(Modifier.height(12.dp))
                    if (promoWidgetEnabled && promoWidgetHtml.isNotBlank()) {
                        Box(modifier = Modifier.padding(horizontal = 14.dp)) {
                            PromoHtmlWidget(html = promoWidgetHtml)
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                    if (studentUpdateWidgetEnabled && studentUpdateWidgetHtml.isNotBlank()) {
                        Box(modifier = Modifier.padding(horizontal = 14.dp)) {
                            PromoHtmlWidget(html = studentUpdateWidgetHtml)
                        }
                        Spacer(Modifier.height(14.dp))
                    }
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
                            bestScore = bestScoreValue,
                            lastScore = lastScoreValue,
                        )
                    }
                    pendingResult?.let { pending ->
                        val isReady = nowMs >= pending.publishAtMillis
                        val localHidden = hiddenSessionAt > 0L
                        val canShow = !localHidden
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
                                },
                                onShowResult = {
                                    AppPreferencesRepository.markPendingResultViewedAndClear()
                                    onOpenPendingResult(
                                        pending.testName,
                                        pending.answered,
                                        pending.correct,
                                        pending.wrong,
                                        pending.total,
                                        pending.publishAtMillis,
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

                    val visibleCategorySections = when {
                        !homeCategoryStripReady -> emptyList()
                        categorySections.isNotEmpty() -> categorySections
                        else -> defaultHomeCategorySections
                    }
                    if (visibleCategorySections.isNotEmpty()) {
                        Spacer(Modifier.height(18.dp))
                        Divider(color = p.systemBlue.copy(alpha = 0.25f))
                        Spacer(Modifier.height(12.dp))

                        visibleCategorySections.forEachIndexed { index, section ->
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
                    }

                    // Same gate as the category strip: hide Quick actions until the first
                    // home CMS fetch settles so default chips never flash and then swap to
                    // admin-configured ones (`loadHomeContent` populates both lists together,
                    // so the existing flag covers this strip too).
                    val visibleQuickActionSections = when {
                        !homeCategoryStripReady -> emptyList()
                        quickActionSections.isNotEmpty() -> quickActionSections
                        else -> defaultHomeQuickActionSections
                    }
                    if (visibleQuickActionSections.isNotEmpty()) {
                        Spacer(Modifier.height(18.dp))
                        Divider(color = p.systemBlue.copy(alpha = 0.25f))
                        Spacer(Modifier.height(12.dp))

                        visibleQuickActionSections.forEachIndexed { index, section ->
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
                                    allowStartTest = pendingResult == null,
                                    onAction = { actionKey ->
                                        val normalizedKey = actionKey.trim().lowercase()
                                        when {
                                            normalizedKey == "starttest" || normalizedKey == "start_test" || normalizedKey == "start test" -> {
                                                val pending = pendingResult
                                                if (pending != null) {
                                                    val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a")
                                                    val whenText = runCatching {
                                                        formatter.format(
                                                            Instant.ofEpochMilli(pending.publishAtMillis).atZone(ZoneId.systemDefault()),
                                                        )
                                                    }.getOrElse { Date(pending.publishAtMillis).toString() }
                                                    Toast.makeText(
                                                        context,
                                                        "You have successfully submitted the test. Your result will be available on $whenText.",
                                                        Toast.LENGTH_LONG,
                                                    ).show()
                                                } else {
                                                    onStartTest(startSeriesState.activeTestName ?: "Test")
                                                }
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
                    PullRefreshIndicator(
                        refreshing = pullRefreshing,
                        state = pullRefreshState,
                        modifier = Modifier.align(Alignment.TopCenter),
                        backgroundColor = p.surface,
                        contentColor = p.accent,
                    )
                }
            }
        }
        }
        AnimatedVisibility(
            visible = homePollPopupEnabled && homePollPopupVisible && homePollActive != null,
            enter = fadeIn() + scaleIn(initialScale = 0.94f),
            exit = fadeOut() + scaleOut(targetScale = 0.96f),
        ) {
            if (homePollActive != null) {
                HomePollPopupModal(
                    poll = homePollActive!!,
                    selectedIndexes = homePollSelections[homePollActive!!.id] ?: emptySet(),
                    counts = homePollResults[homePollActive!!.id] ?: emptyList(),
                    submitting = homePollSubmitting,
                    message = homePollMessage,
                    onSelectOption = { pollId, optionIndex, allowMultiple ->
                        val current = homePollSelections[pollId] ?: emptySet()
                        val checked = current.contains(optionIndex)
                        homePollSelections[pollId] = if (allowMultiple) {
                            if (checked) current - optionIndex else current + optionIndex
                        } else {
                            setOf(optionIndex)
                        }
                    },
                    onClose = {
                        homePollPopupDismissedPollId = homePollActive!!.id
                        homePollPopupVisible = false
                    },
                    onMaybeLater = {
                        homePollPopupDismissedPollId = homePollActive!!.id
                        homePollPopupVisible = false
                    },
                    onSubmit = { pollId, optionIndexes ->
                        scope.launch {
                            homePollSubmitting = true
                            homePollMessage = null
                            val result = ContentRepository.submitPollVote(pollId, optionIndexes.toList())
                            if (result?.ok == true) {
                                homePollResults[pollId] = result.counts
                                AppPreferencesRepository.markPollVoted(pollId)
                                homePollMessage = "Vote submitted successfully."
                                homePollPopupDismissedPollId = pollId
                                homePollPopupVisible = false
                                refreshUnreadCounts()
                            } else {
                                homePollMessage = "Failed to submit vote."
                            }
                            homePollSubmitting = false
                        }
                    },
                )
            }
        }

    }
}

}

@Composable
private fun PromoHtmlWidget(
    html: String,
) {
    AndroidView(
        modifier = Modifier
            .fillMaxWidth()
            .height(320.dp),
        factory = { context ->
            WebView(context).apply {
                webViewClient = WebViewClient()
                settings.javaScriptEnabled = false
                settings.domStorageEnabled = false
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
            }
        },
        update = { webView ->
            webView.loadDataWithBaseURL(
                null,
                html,
                "text/html",
                "utf-8",
                null,
            )
        },
    )
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
    val statusBg = if (isReady) Color(0xFFDCFCE7) else Color(0xFFEDE9FE)
    val statusText = if (isReady) Color(0xFF166534) else Color(0xFF5B21B6)
    val timerBg = if (isReady) Color(0xFFECFDF5) else Color(0xFFEFF6FF)
    val timerText = if (isReady) Color(0xFF047857) else Color(0xFF1D4ED8)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
    ) {
        Column(modifier = Modifier.padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(statusBg)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text(
                        text = if (isReady) readyTitle else pendingTitle,
                        color = statusText,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 12.sp,
                    )
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onClose, modifier = Modifier.size(22.dp)) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = "Close",
                        tint = p.textSecondary,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xFFF3F4F6))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    text = testName,
                    color = Color(0xFF374151),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xFFDBEAFE))
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            ) {
                Text(
                    text = "$dateLabel: $releaseText",
                    color = Color(0xFF1E40AF),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "You have successfully submitted the test.",
                color = Color(0xFF0F172A),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Your result will be available on $releaseText.",
                color = p.textSecondary,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            extraLines.forEach { line ->
                Text(
                    text = line,
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
            }
            if (isReady) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xFFECFDF5))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF10B981),
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            text = "Ready to view",
                            color = Color(0xFF047857),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = readyMessage,
                    color = Color(0xFF0F172A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(12.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xFF14B8A6))
                        .clickable(onClick = onShowResult)
                        .padding(horizontal = 18.dp, vertical = 10.dp),
                ) {
                    Text(
                        text = buttonLabel,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xFFF3F4F6))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text(
                        text = pendingMessage,
                        color = Color(0xFF4B5563),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(timerBg)
                        .border(1.dp, Color.White, RoundedCornerShape(999.dp))
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = countdownText,
                        color = timerText,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
            }
        }
    }
}

private val HomePollOptionFillPalette: List<Color> = listOf(
    Color(0xFF2563EB),
    Color(0xFF7C3AED),
    Color(0xFF059669),
    Color(0xFFD97706),
    Color(0xFFDC2626),
    Color(0xFF0891B2),
    Color(0xFFDB2777),
    Color(0xFF4F46E5),
)

private fun homePollOptionFillColor(optionIndex: Int): Color =
    HomePollOptionFillPalette[optionIndex % HomePollOptionFillPalette.size]

private fun homePollSortedOptionIndices(
    optionCount: Int,
    normalizedCounts: List<Int>,
    countsLoaded: Boolean,
): List<Int> {
    if (optionCount <= 0) return emptyList()
    val indices = (0 until optionCount).toList()
    if (!countsLoaded) return indices
    val total = normalizedCounts.sum()
    if (total <= 0) return indices
    return indices.sortedWith(
        compareByDescending<Int> { normalizedCounts.getOrElse(it) { 0 } }
            .thenBy { it },
    )
}

@Composable
private fun HomePollPopupModal(
    poll: ContentRepository.PollItemRemote,
    selectedIndexes: Set<Int>,
    counts: List<Int>,
    submitting: Boolean,
    message: String?,
    onSelectOption: (pollId: String, optionIndex: Int, allowMultiple: Boolean) -> Unit,
    onClose: () -> Unit,
    onMaybeLater: () -> Unit,
    onSubmit: (pollId: String, optionIndexes: Set<Int>) -> Unit,
) {
    val p = mockTestPalette()
    val hasSubmitted = counts.isNotEmpty() || message?.contains("success", ignoreCase = true) == true
    val normalizedCounts = poll.options.mapIndexed { idx, _ -> counts.getOrElse(idx) { 0 } }
    val totalVotes = normalizedCounts.sum().coerceAtLeast(0)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.46f))
            .padding(horizontal = 18.dp, vertical = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE2E8F0)),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "Live Community Poll",
                            color = Color(0xFF0F172A),
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 17.sp,
                        )
                        Text(
                            text = "Share your opinion in one tap",
                            color = p.textSecondary,
                            fontSize = 12.sp,
                        )
                    }
                    IconButton(onClick = onClose, modifier = Modifier.size(24.dp)) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = "Close poll popup",
                            tint = p.textSecondary,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    text = poll.question,
                    color = p.textPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                )
                Spacer(Modifier.height(12.dp))
                val countsLoaded = counts.isNotEmpty()
                val displayIndices =
                    homePollSortedOptionIndices(poll.options.size, normalizedCounts, countsLoaded)
                for (idx in displayIndices) {
                    val option = poll.options[idx]
                    val checked = selectedIndexes.contains(idx)
                    val votes = normalizedCounts.getOrElse(idx) { 0 }
                    val ratio = if (totalVotes > 0) votes.toFloat() / totalVotes.toFloat() else 0f
                    val pct = (ratio * 100f).toInt()
                    val fillColor = homePollOptionFillColor(idx)
                    val borderW = if (checked && !hasSubmitted) 2.dp else 1.dp
                    val borderC =
                        when {
                            checked && !hasSubmitted -> p.systemBlue
                            checked && hasSubmitted -> Color(0xFF22C55E).copy(alpha = 0.75f)
                            else -> p.border.copy(alpha = 0.22f)
                        }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .border(borderW, borderC, RoundedCornerShape(14.dp))
                            .clickable(enabled = !hasSubmitted) {
                                onSelectOption(poll.id, idx, poll.allowMultiple)
                            },
                    ) {
                        Box(
                            Modifier
                                .fillMaxSize()
                                .background(Color(0xFFF8FAFC)),
                        )
                        if (totalVotes > 0) {
                            Box(
                                Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth(ratio.coerceIn(0f, 1f))
                                    .align(Alignment.CenterStart)
                                    .background(fillColor.copy(alpha = 0.34f)),
                            )
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = option,
                                color = Color(0xFF0F172A),
                                fontSize = 14.sp,
                                modifier = Modifier.weight(1f),
                            )
                            if (counts.isNotEmpty()) {
                                Text(
                                    text = "$pct% • $votes",
                                    color = Color(0xFF64748B),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                if (counts.isNotEmpty()) {
                    Text(
                        text = "Total votes: $totalVotes",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(Modifier.height(8.dp))
                }
                if (!message.isNullOrBlank()) {
                    Text(
                        text = message,
                        color = if (message.contains("success", ignoreCase = true)) Color(0xFF0F766E) else p.error,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(8.dp))
                }
                if (hasSubmitted) {
                    Text(
                        text = "Thanks, your response has been recorded.",
                        color = Color(0xFF0F766E),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        TextButton(
                            onClick = onMaybeLater,
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Maybe Later")
                        }
                        Button(
                            onClick = { onSubmit(poll.id, selectedIndexes) },
                            enabled = selectedIndexes.isNotEmpty() && !submitting,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                        ) {
                            Text(if (submitting) "Submitting..." else "Submit Vote", fontWeight = FontWeight.Bold)
                        }
                    }

                    // No pull-to-refresh indicator.
                }
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
        resolveShareAppMessage(
            template = "Check out MockTestApp for practice tests and alerts.\n{storeUrl}",
            storeUrl = storeUrl,
        )
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

private fun resolveShareAppMessage(template: String, storeUrl: String): String {
    val raw = template.trim()
    if (raw.isBlank()) return "Check out MockTestApp for practice tests and alerts.\n$storeUrl"
    val withLink = if (raw.contains("{storeUrl}")) raw.replace("{storeUrl}", storeUrl) else "$raw\n$storeUrl"
    return withLink.trim()
}

@Composable
private fun TopRow(
    welcomeText: String,
    onOpenDrawer: () -> Unit,
    onOpenPoll: () -> Unit,
    onOpenNotifications: () -> Unit,
    pollCount: Int,
    notificationCount: Int,
) {
    val p = mockTestPalette()
    val headerBrush = Brush.horizontalGradient(
        colors = listOf(p.homeHeaderStart, p.homeHeaderEnd),
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(headerBrush),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // Left: menu icon
        IconButton(onClick = onOpenDrawer) {
            Icon(
                imageVector = Icons.Rounded.Menu,
                contentDescription = "Menu",
                tint = p.homeHeaderOn,
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
                color = p.homeHeaderOn,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }

        // Right: compact action area (poll + notification) sized to avoid title overlap.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            HeaderIconWithCount(
                count = pollCount,
                onClick = onOpenPoll,
                icon = {
                    Icon(
                        imageVector = Icons.Outlined.PieChart,
                        contentDescription = "Poll",
                        tint = p.homeHeaderOn,
                    )
                },
            )
            HeaderIconWithCount(
                count = notificationCount,
                onClick = onOpenNotifications,
                icon = {
                    Icon(
                        imageVector = Icons.Outlined.Notifications,
                        contentDescription = "Notifications",
                        tint = p.homeHeaderOn,
                    )
                },
            )
        }
    }
}

@Composable
private fun HeaderIconWithCount(
    count: Int,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    Box {
        IconButton(onClick = onClick) {
            icon()
        }
        if (count > 0) {
            Text(
                text = if (count > 99) "99+" else count.toString(),
                color = Color(0xFFDC2626),
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier
                    .align(Alignment.Center),
            )
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
    val screenWidthDp = LocalConfiguration.current.screenWidthDp
    val columns = when {
        screenWidthDp < 360 -> 2
        screenWidthDp < 560 -> 3
        else -> 4
    }
    val slots = remember(categories, columns) {
        val base = categories.take(12).toMutableList()
        base += "__see_all__"
        base.chunked(columns)
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        slots.forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                repeat(columns) { col ->
                    val label = rowItems.getOrNull(col)
                    when {
                        label == null -> Spacer(Modifier.weight(1f).height(46.dp))
                        label == "__see_all__" -> SeeAllChip(
                            onClick = onSeeAll,
                            modifier = Modifier.weight(1f),
                        )
                        else -> CategoryChip(
                            text = label,
                            onClick = { onClick(label) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
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
    allowStartTest: Boolean,
    onAction: (String) -> Unit,
) {
    val screenWidthDp = LocalConfiguration.current.screenWidthDp
    val columns = when {
        screenWidthDp < 360 -> 1
        screenWidthDp < 700 -> 2
        else -> 3
    }
    val normalizedBase = if (actions.isNotEmpty()) {
        actions.filterNot { !allowStartTest && it.actionKey.equals("startTest", ignoreCase = true) }
    } else {
        listOfNotNull(
            if (allowStartTest) HomeQuickActionItem(title = "Start test", actionKey = "startTest") else null,
            HomeQuickActionItem(title = "Result", actionKey = "results"),
            HomeQuickActionItem(title = "Leaderboard", actionKey = "leaderboard"),
            HomeQuickActionItem(title = "Tool", actionKey = "bookmarks"),
        )
    }
    // Ensure "Result" and "Leaderboard" are swapped regardless of CMS ordering.
    val normalized = remember(normalizedBase) {
        val items = normalizedBase.toMutableList()
        val leaderboardIdx = items.indexOfFirst { it.actionKey.equals("leaderboard", ignoreCase = true) }
        val resultIdx = items.indexOfFirst { it.actionKey.contains("result", ignoreCase = true) }
        if (leaderboardIdx >= 0 && resultIdx >= 0 && leaderboardIdx != resultIdx) {
            val tmp = items[leaderboardIdx]
            items[leaderboardIdx] = items[resultIdx]
            items[resultIdx] = tmp
        }
        items.toList()
    }
    val rows = normalized.chunked(columns)
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
                repeat(columns - rowItems.size) {
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
    var showLogoutConfirm by remember { mutableStateOf(false) }
    /** Close drawer, yield one frame (lets the sheet finish composing away), then navigate — reduces white flashes. */
    fun postDrawerNavigation(navigate: () -> Unit) {
        scope.launch {
            runCatching { drawerState.close() }
            yield()
            navigate()
        }
    }
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
                    onClick = { postDrawerNavigation { onOpenProfile() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.History,
                    label = "History",
                    onClick = { postDrawerNavigation { onOpenHistory() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.PieChart,
                    label = "Activity",
                    onClick = { postDrawerNavigation { onOpenActivity() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.BarChart,
                    label = "Progress report",
                    onClick = { postDrawerNavigation { onOpenProgressReport() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.WorkOutline,
                    label = "Job alert",
                    onClick = { postDrawerNavigation { onOpenJobAlert() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.School,
                    label = "Exam alert",
                    onClick = { postDrawerNavigation { onOpenExamAlert() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.Article,
                    label = "News",
                    onClick = { postDrawerNavigation { onOpenNews() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.Today,
                    label = "Daily Digest",
                    onClick = { postDrawerNavigation { onOpenDaily() } },
                )
                DrawerItem(
                    icon = Icons.Outlined.Quiz,
                    label = "Daily Quiz",
                    onClick = { postDrawerNavigation { onOpenMenuQuiz() } },
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
                            showLogoutConfirm = true
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
    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text("Log out?") },
            text = { Text("Are you sure you want to log out from this device?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutConfirm = false
                        onLogout()
                    },
                ) {
                    Text("Log out")
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) {
                    Text("Cancel")
                }
            },
        )
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
                text = "User Id - ${profile.userIdFormatted ?: "000000"}",
                color = if (profile.userIdFormatted != null) p.textPrimary else p.textSecondary.copy(alpha = 0.55f),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = {
                    val userId = profile.userIdFormatted ?: "000000"
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


