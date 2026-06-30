package com.freemocktest.app.newui.tests

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import com.freemocktest.app.util.TestScheduleUtils
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/** Route names that mean "show my applied tests", not a catalog title lookup. */
private fun isGenericStartTestRoute(name: String): Boolean {
    val route = name.trim()
    return route.isBlank() ||
        route.equals("Test", ignoreCase = true) ||
        route.equals("applied", ignoreCase = true)
}

@Composable
fun StartTestPreviewScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
    onStartTest: (String) -> Unit,
    onApplyForTest: (String) -> Unit,
    onBrowseTests: () -> Unit = {},
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var instructionItems by remember(testName) { mutableStateOf<List<String>>(emptyList()) }
    var instructionsLoaded by remember { mutableStateOf(false) }
    val appliedSnapshots = remember { mutableStateMapOf<String, TestCardNew?>() }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val appliedSeries by AppPreferencesRepository.appliedTestSeries.collectAsState(initial = emptyList())
    val pendingResult by AppPreferencesRepository.pendingResultState.collectAsState(initial = null)
    val loginPickedTitles by AppPreferencesRepository.loginPickedTestTitles.collectAsState(initial = emptyList())
    val pickedTitlesForApply = remember(loginPickedTitles) {
        loginPickedTitles
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinctBy { it.lowercase(Locale.US) }
    }
    val isListRoute = remember(testName) { isGenericStartTestRoute(testName) }
    /** Specific catalog title when opening a single test (Apply flow); null on the applied-tests list route. */
    val specificTestName = remember(testName, pickedTitlesForApply, isListRoute) {
        if (isListRoute) {
            pickedTitlesForApply.firstOrNull()
        } else {
            testName.trim().takeIf { it.isNotBlank() }
        }
    }
    var testSnapshot by remember(specificTestName) { mutableStateOf<TestCardNew?>(null) }
    /** True until applied-tests sync from server finishes on first load / resume refresh. */
    var appliedSyncLoading by remember { mutableStateOf(true) }
    /** True until a specific (non-list) test card load settles. */
    var primaryLoading by remember(specificTestName) { mutableStateOf(specificTestName != null) }
    /** Debounce rapid taps without toggling `enabled` (disabled styling was causing visible blink). */
    var lastPrimaryNavAt by remember { mutableLongStateOf(0L) }
    /** Bumped by Retry / ON_RESUME to force enrollment refresh after apply or background return. */
    var reloadKey by remember(testName) { mutableIntStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                reloadKey += 1
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
    LaunchedEffect(reloadKey) {
        appliedSyncLoading = true
        try {
            val home = runCatching { ContentRepository.loadHomeContent() }.getOrNull()
            val lockMs = (home?.startSeriesLockSeconds ?: 20).coerceAtLeast(0).toLong() * 1000L
            val activeWindowMs = (home?.startSeriesActiveWindowMinutes ?: 30).coerceAtLeast(1).toLong() * 60_000L
            runCatching {
                AuthRepository.syncAppliedTestSeriesFromServer(
                    lockMs = lockMs,
                    activeWindowMs = activeWindowMs,
                )
            }
        } catch (e: CancellationException) {
            throw e
        } finally {
            appliedSyncLoading = false
        }
    }
    LaunchedEffect(specificTestName, reloadKey) {
        val target = specificTestName?.trim().orEmpty()
        if (target.isBlank()) {
            testSnapshot = null
            primaryLoading = false
            return@LaunchedEffect
        }
        try {
            val cached = runCatching { ContentRepository.loadCachedTestByTitle(target) }.getOrNull()
            if (cached != null && cached.id.isNotBlank()) {
                testSnapshot = cached
            }
            primaryLoading = testSnapshot == null
            testSnapshot = runCatching {
                ContentRepository.loadTestByTitle(
                    title = target,
                    forceRefresh = true,
                    allowDefaultFallback = false,
                )
            }.getOrNull()?.takeIf { it.id.isNotBlank() } ?: testSnapshot
        } catch (e: CancellationException) {
            throw e
        } finally {
            primaryLoading = false
        }
    }
    LaunchedEffect(appliedSeries, reloadKey) {
        try {
            val names = appliedSeries.map { it.testName.trim() }.filter { it.isNotBlank() }.distinct()
            appliedSnapshots.keys.toList().forEach { existing ->
                if (existing !in names) appliedSnapshots.remove(existing)
            }
            names.forEach { name ->
                appliedSnapshots[name] = runCatching {
                    ContentRepository.loadTestByTitle(
                        title = name,
                        forceRefresh = true,
                        allowDefaultFallback = false,
                    )
                }.getOrNull()?.takeIf { it.id.isNotBlank() } ?: appliedSnapshots[name]
            }
        } catch (e: CancellationException) {
            throw e
        }
    }
    LaunchedEffect(Unit) {
        try {
            val remote = runCatching { ContentRepository.loadInstructionContent() }.getOrNull()
            if (remote != null && remote.items.isNotEmpty()) {
                instructionItems = remote.items
            }
        } catch (e: CancellationException) {
            throw e
        } finally {
            instructionsLoaded = true
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            nowMs = System.currentTimeMillis()
            delay(1_000L)
        }
    }

    val activeAppliedEntries = remember(appliedSeries, nowMs) {
        appliedSeries
            .filter { it.expiresAtMillis > nowMs }
            .sortedBy { (it.startUnlockAtMillis(nowMs) - nowMs).coerceAtLeast(0L) }
    }
    val hiddenExpiredCount = remember(appliedSeries, activeAppliedEntries) {
        (appliedSeries.size - activeAppliedEntries.size).coerceAtLeast(0)
    }
    val specificTest = testSnapshot
    val unlockAt = remember(specificTest?.examDate, specificTest?.slotLabel) {
        TestScheduleUtils.parseExamStartMillis(specificTest?.examDate, specificTest?.slotLabel)
    }
    val fallbackRemainingMs = unlockAt?.let { (it - nowMs).coerceAtLeast(0L) } ?: 0L
    val fallbackLocked = fallbackRemainingMs > 0L
    val showAppliedList = activeAppliedEntries.isNotEmpty()
    val showLoading = appliedSyncLoading || (specificTestName != null && primaryLoading && !showAppliedList)
    val showSpecificApply = !showAppliedList && !showLoading && specificTest != null
    val showEmptyList = isListRoute && !showAppliedList && !showLoading
    val showSpecificLoadError = !isListRoute && !showAppliedList && !showLoading && specificTest == null && specificTestName != null

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 14.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Text(
                    text = "Start Test",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(12.dp))

            if (pickedTitlesForApply.isNotEmpty()) {
                val label = if (pickedTitlesForApply.size == 1) {
                    "Your selected test"
                } else {
                    "Your selected tests"
                }
                Text(
                    text = label,
                    color = p.textPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = pickedTitlesForApply.joinToString(separator = " · "),
                    color = p.textSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
            }

            if (showAppliedList) {
                Text(
                    text = "Applied Tests",
                    color = p.textPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                )
                if (hiddenExpiredCount > 0) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "$hiddenExpiredCount expired test(s) hidden",
                        color = p.textSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(8.dp))
                activeAppliedEntries.forEach { entry ->
                    val name = entry.testName.trim()
                    val snapshot = appliedSnapshots[name]
                    if (snapshot == null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(120.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = p.accent, modifier = Modifier.size(24.dp))
                        }
                        Spacer(Modifier.height(14.dp))
                        return@forEach
                    }
                    val card = snapshot
                    val cardScheduledMs = TestScheduleUtils.parseExamStartMillis(card.examDate, card.slotLabel)
                    val effectiveUnlockMs = when {
                        cardScheduledMs != null && cardScheduledMs > nowMs -> cardScheduledMs
                        entry.scheduledStartAtMillis > nowMs -> entry.scheduledStartAtMillis
                        else -> entry.startUnlockAtMillis(nowMs)
                    }
                    val remainingMs = (effectiveUnlockMs - nowMs).coerceAtLeast(0L)
                    val totalLockMs = (entry.expiresAtMillis - effectiveUnlockMs).coerceAtLeast(1L)
                    val hours = (remainingMs / 3_600_000L).toInt()
                    val mins = ((remainingMs % 3_600_000L) / 60_000L).toInt()
                    val secs = ((remainingMs % 60_000L) / 1_000L).toInt()
                    val countdown = String.format(Locale.US, "%02d:%02d:%02d", hours, mins, secs)
                    val isLocked = remainingMs > 0L
                    val isPendingResult = AppPreferencesRepository.isTestBlockedByPendingResult(name, pendingResult)
                    val progress = if (isLocked) {
                        1f - (remainingMs.toFloat() / totalLockMs.toFloat()).coerceIn(0f, 1f)
                    } else {
                        1f
                    }
                    PreviewCard(test = card)
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CountdownProgressRing(
                            progress = progress,
                            locked = isLocked,
                            countdown = countdown,
                        )
                        TestStatusChip(
                            locked = isLocked,
                            countdown = countdown,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = when {
                            isPendingResult -> "Result will be available soon"
                            isLocked && cardScheduledMs != null && cardScheduledMs > nowMs ->
                                "Locked until ${TestScheduleUtils.formatExamStartLabel(card.examDate, card.slotLabel)}"
                            isLocked -> "Starts in $countdown"
                            else -> "Ready to start"
                        },
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = {
                            if (card.title.isBlank() || isPendingResult || isLocked) return@Button
                            if (!TestScheduleUtils.isExamStartAllowed(card.examDate, card.slotLabel, nowMs)) return@Button
                            val now = System.currentTimeMillis()
                            if (now - lastPrimaryNavAt < 600L) return@Button
                            lastPrimaryNavAt = now
                            onStartTest(card.title)
                        },
                        enabled = !isLocked && !isPendingResult && card.title.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isLocked) p.border else Color(0xFF10B65A),
                            contentColor = Color.White,
                            disabledContainerColor = p.border,
                            disabledContentColor = Color.White.copy(alpha = 0.9f),
                        ),
                    ) {
                        Icon(
                            imageVector = when {
                                isPendingResult -> Icons.Outlined.Lock
                                isLocked -> Icons.Outlined.Lock
                                else -> Icons.Outlined.PlayArrow
                            },
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.size(8.dp))
                        Text(
                            text = when {
                                isPendingResult -> "Result Pending"
                                isLocked -> "Start Test (Locked)"
                                else -> "Start Test"
                            },
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.height(14.dp))
                }
            } else if (showLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = p.accent)
                }
            } else if (showEmptyList) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Text(
                            text = "No applied tests yet",
                            color = p.textPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Apply for a test from the Tests tab. After you apply, your tests will appear here ready to start.",
                            color = p.textSecondary,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                        )
                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = onBrowseTests,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(999.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.systemBlue,
                                contentColor = Color.White,
                            ),
                        ) {
                            Text(
                                text = "Browse Tests",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            } else if (showSpecificLoadError) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Text(
                            text = "Couldn't load test",
                            color = p.textPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "This test may be unpublished or unavailable. Try again or apply from the Tests tab.",
                            color = p.textSecondary,
                            fontSize = 13.sp,
                        )
                        Spacer(Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            TextButton(onClick = { reloadKey += 1 }) {
                                Text(text = "Retry", color = p.systemBlue, fontWeight = FontWeight.Bold)
                            }
                            TextButton(onClick = onBrowseTests) {
                                Text(text = "Browse Tests", color = p.systemBlue, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            } else if (showSpecificApply) {
                val test = specificTest!!
                PreviewCard(test = test)
                Spacer(Modifier.height(10.dp))
                if (fallbackLocked) {
                    val hours = (fallbackRemainingMs / 3_600_000L).toInt()
                    val mins = ((fallbackRemainingMs % 3_600_000L) / 60_000L).toInt()
                    val secs = ((fallbackRemainingMs % 60_000L) / 1_000L).toInt()
                    val countdown = String.format(Locale.US, "%02d:%02d:%02d", hours, mins, secs)
                    Text(
                        text = "Test locked till scheduled time (${test.examDate ?: "upcoming"})",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = countdown,
                        color = p.textPrimary,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                } else {
                    Text(
                        text = "You need to apply for this test before starting it.",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = {
                        if (test.title.isBlank()) return@Button
                        val now = System.currentTimeMillis()
                        if (now - lastPrimaryNavAt < 600L) return@Button
                        lastPrimaryNavAt = now
                        onApplyForTest(test.title)
                    },
                    enabled = test.title.isNotBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .height(52.dp),
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = p.systemBlue,
                        contentColor = Color.White,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.size(8.dp))
                    Text(
                        text = "Apply Now",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            Text(
                text = "Instructions",
                color = p.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    when {
                        !instructionsLoaded -> {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(
                                    color = p.accent,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                        instructionItems.isEmpty() -> {
                            Text(
                                text = "Instructions will appear when published by admin.",
                                color = p.textSecondary,
                                fontSize = 13.sp,
                            )
                        }
                        else -> {
                            instructionItems.forEach { line ->
                                Text(
                                    text = "\u2022 $line",
                                    color = p.textSecondary,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(bottom = 8.dp),
                                )
                            }
                        }
                    }
                }
            }

        }
    }
}

@Composable
private fun PreviewCard(test: TestCardNew) {
    val p = mockTestPalette()
    Box(modifier = Modifier.fillMaxWidth()) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp)
                .border(
                    width = 1.dp,
                    color = p.border.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(18.dp),
                ),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = p.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = test.title,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = test.meta.ifBlank { "Details will appear when published by admin." },
                    color = p.textSecondary,
                    fontSize = 13.sp,
                )
                Spacer(Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    MiniStat(
                        icon = Icons.Outlined.PlayArrow,
                        label = test.questionsMarks ?: "Questions/marks unavailable",
                    )
                    MiniStat(
                        icon = Icons.Outlined.Timer,
                        label = test.durationLabel ?: "3 hrs each",
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    MiniStat(
                        icon = Icons.Outlined.Groups,
                        label = test.enrolledLabel?.let { "$it enrolled" } ?: "Enrollment data unavailable",
                    )
                    MiniStat(
                        icon = Icons.Outlined.CalendarMonth,
                        label = test.examDate ?: "Date not published",
                    )
                }
            }
        }
        if (test.badgeEnabled) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = 0.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFDC2626))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    text = test.badgeText,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun MiniStat(icon: ImageVector, label: String) {
    val p = mockTestPalette()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = p.accent,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = label,
            color = p.textSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun TestStatusChip(
    locked: Boolean,
    countdown: String,
) {
    val bg = if (locked) Color(0xFFFEF3C7) else Color(0xFFDCFCE7)
    val fg = if (locked) Color(0xFF92400E) else Color(0xFF166534)
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Text(
            text = if (locked) "Locked • $countdown" else "Ready",
            color = fg,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun CountdownProgressRing(
    progress: Float,
    locked: Boolean,
    countdown: String,
) {
    val ringColor = if (locked) Color(0xFFF59E0B) else Color(0xFF16A34A)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier.size(30.dp),
                color = ringColor,
                trackColor = Color(0xFFE5E7EB),
                strokeWidth = 3.dp,
            )
        }
        Text(
            text = if (locked) countdown else "00:00:00",
            color = Color(0xFF475569),
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
