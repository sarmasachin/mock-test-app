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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
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
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun StartTestPreviewScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
    onStartTest: (String) -> Unit,
    onApplyForTest: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var instructionItems by remember(testName) { mutableStateOf<List<String>>(emptyList()) }
    var instructionsLoaded by remember { mutableStateOf(false) }
    var testSnapshot by remember(testName) { mutableStateOf<TestCardNew?>(null) }
    val appliedSnapshots = remember { mutableStateMapOf<String, TestCardNew?>() }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val appliedSeries by AppPreferencesRepository.appliedTestSeries.collectAsState(initial = emptyList())
    /** True until the first `loadTestByTitle` settles so we can show a spinner instead of a dummy card. */
    var primaryLoading by remember(testName) { mutableStateOf(true) }
    /** Click guard so a slow navigation/double-tap cannot fire two transitions. Resets after 1.5s. */
    var navInFlight by remember { mutableStateOf(false) }
    /** Bumped by the Retry button to force `LaunchedEffect(testName, reloadKey)` to re-run. */
    var reloadKey by remember(testName) { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(testName, reloadKey) {
        primaryLoading = true
        try {
            testSnapshot = ContentRepository.loadTestByTitle(testName)
        } catch (_: Exception) {
            // Swallow network/parse errors here; UI shows a Retry button when `testSnapshot == null`.
            testSnapshot = null
        } finally {
            primaryLoading = false
        }
    }
    LaunchedEffect(appliedSeries) {
        val names = appliedSeries.map { it.testName.trim() }.filter { it.isNotBlank() }.distinct()
        appliedSnapshots.keys.toList().forEach { existing ->
            if (existing !in names) appliedSnapshots.remove(existing)
        }
        names.forEach { name ->
            if (!appliedSnapshots.containsKey(name)) {
                // Per-name try/catch so one failed fetch doesn't abort the whole loop.
                // Network/parse errors fall back to a `null` snapshot (same shape as before),
                // and the missing key will be retried whenever `appliedSeries` changes again.
                appliedSnapshots[name] = try {
                    ContentRepository.loadTestByTitle(name)
                } catch (_: Exception) {
                    null
                }
            }
        }
    }
    LaunchedEffect(Unit) {
        try {
            val remote = ContentRepository.loadInstructionContent()
            if (remote != null && remote.items.isNotEmpty()) {
                instructionItems = remote.items
            }
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

    val test = testSnapshot ?: TestCardNew(
        title = testName,
        meta = "Test details are currently unavailable",
        examDate = null,
        durationLabel = null,
        questionsMarks = null,
        enrolledLabel = null,
    )
    val activeAppliedEntries = remember(appliedSeries, nowMs) {
        appliedSeries
            .filter { it.expiresAtMillis > nowMs }
            .sortedBy { (it.unlockAtMillis - nowMs).coerceAtLeast(0L) }
    }
    val hiddenExpiredCount = remember(appliedSeries, activeAppliedEntries) {
        (appliedSeries.size - activeAppliedEntries.size).coerceAtLeast(0)
    }
    val unlockAt = remember(test.examDate) { parseUnlockAtMillis(test.examDate) }
    val fallbackRemainingMs = unlockAt?.let { (it - nowMs).coerceAtLeast(0L) } ?: 0L
    val fallbackLocked = fallbackRemainingMs > 0L

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

            if (activeAppliedEntries.isNotEmpty()) {
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
                    val card = snapshot ?: TestCardNew(
                        title = name,
                        meta = "Test details are currently unavailable",
                        examDate = null,
                        durationLabel = null,
                        questionsMarks = null,
                        enrolledLabel = null,
                    )
                    val remainingMs = (entry.unlockAtMillis - nowMs).coerceAtLeast(0L)
                    val totalLockMs = (entry.expiresAtMillis - entry.unlockAtMillis).coerceAtLeast(1L)
                    val hours = (remainingMs / 3_600_000L).toInt()
                    val mins = ((remainingMs % 3_600_000L) / 60_000L).toInt()
                    val secs = ((remainingMs % 60_000L) / 1_000L).toInt()
                    val countdown = String.format(Locale.US, "%02d:%02d:%02d", hours, mins, secs)
                    val isLocked = remainingMs > 0L
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
                        text = if (isLocked) "Starts in $countdown" else "Ready to start",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = {
                            if (navInFlight || card.title.isBlank()) return@Button
                            navInFlight = true
                            scope.launch {
                                delay(1500)
                                navInFlight = false
                            }
                            onStartTest(card.title)
                        },
                        enabled = !isLocked && !navInFlight && card.title.isNotBlank(),
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
                            imageVector = if (isLocked) Icons.Outlined.Lock else Icons.Outlined.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.size(8.dp))
                        Text(
                            text = if (isLocked) "Start Test (Locked)" else "Start Test",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.height(14.dp))
                }
            } else if (primaryLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = p.accent)
                }
            } else {
                PreviewCard(test = test)
                Spacer(Modifier.height(10.dp))
                if (testSnapshot == null) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Couldn't load latest details.",
                            color = p.textSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(
                            onClick = {
                                if (primaryLoading) return@TextButton
                                reloadKey += 1
                            },
                            enabled = !primaryLoading,
                        ) {
                            Text(
                                text = "Retry",
                                color = p.systemBlue,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                }
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
                        if (navInFlight || test.title.isBlank()) return@Button
                        navInFlight = true
                        scope.launch {
                            delay(1500)
                            navInFlight = false
                        }
                        onApplyForTest(test.title)
                    },
                    enabled = !navInFlight && test.title.isNotBlank(),
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

private fun parseUnlockAtMillis(examDate: String?): Long? {
    val raw = examDate?.trim()?.takeIf { it.isNotBlank() } ?: return null
    val zone = ZoneId.systemDefault()
    val patterns = listOf("yyyy-MM-dd HH:mm", "yyyy-MM-dd'T'HH:mm", "d MMM yyyy HH:mm", "d MMM yyyy")
    for (pattern in patterns) {
        val formatter = DateTimeFormatter.ofPattern(pattern, Locale.US)
        try {
            return if (pattern.contains("HH:mm")) {
                LocalDateTime.parse(raw, formatter).atZone(zone).toInstant().toEpochMilli()
            } else {
                LocalDate.parse(raw, formatter).atStartOfDay(zone).toInstant().toEpochMilli()
            }
        } catch (_: Exception) {
            // Any parse/format/zone issue: try the next pattern, finally return null.
        }
    }
    return null
}
