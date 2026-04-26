package com.example.mocktestapp.newui.tests

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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlinx.coroutines.delay

@Composable
fun StartTestPreviewScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
    onStartTest: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var instructionItems by remember(testName) {
        mutableStateOf(
            listOf(
                "Total questions: 100",
                "Duration: 3 hours",
                "Each question has one correct answer",
                "Submit before timer ends",
            ),
        )
    }
    var testSnapshot by remember(testName) { mutableStateOf<TestCardNew?>(null) }
    val appliedSnapshots = remember { mutableStateMapOf<String, TestCardNew?>() }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val appliedSeries by AppPreferencesRepository.appliedTestSeries.collectAsState(initial = emptyList())

    LaunchedEffect(testName) {
        testSnapshot = ContentRepository.loadTestByTitle(testName)
    }
    LaunchedEffect(appliedSeries) {
        val names = appliedSeries.map { it.testName.trim() }.filter { it.isNotBlank() }.distinct()
        appliedSnapshots.keys.toList().forEach { existing ->
            if (existing !in names) appliedSnapshots.remove(existing)
        }
        names.forEach { name ->
            if (!appliedSnapshots.containsKey(name)) {
                appliedSnapshots[name] = ContentRepository.loadTestByTitle(name)
            }
        }
    }
    LaunchedEffect(Unit) {
        val remote = ContentRepository.loadInstructionContent()
        if (remote != null && remote.items.isNotEmpty()) {
            instructionItems = remote.items
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
                    val countdown = String.format("%02d:%02d:%02d", hours, mins, secs)
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
                        onClick = { onStartTest(card.title) },
                        enabled = !isLocked,
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
            } else {
                PreviewCard(test = test)
                Spacer(Modifier.height(10.dp))
                if (fallbackLocked) {
                    val hours = (fallbackRemainingMs / 3_600_000L).toInt()
                    val mins = ((fallbackRemainingMs % 3_600_000L) / 60_000L).toInt()
                    val secs = ((fallbackRemainingMs % 60_000L) / 1_000L).toInt()
                    val countdown = String.format("%02d:%02d:%02d", hours, mins, secs)
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
                        text = "No active applied test found. Apply for a test first.",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { onStartTest(test.title) },
                    enabled = !fallbackLocked,
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .height(52.dp),
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (fallbackLocked) p.border else Color(0xFF10B65A),
                        contentColor = Color.White,
                        disabledContainerColor = p.border,
                        disabledContentColor = Color.White.copy(alpha = 0.9f),
                    ),
                ) {
                    Icon(
                        imageVector = if (fallbackLocked) Icons.Outlined.Lock else Icons.Outlined.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.size(8.dp))
                    Text(
                        text = if (fallbackLocked) "Start Test (Locked)" else "Start Test",
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
        } catch (_: DateTimeParseException) {
        }
    }
    return null
}
