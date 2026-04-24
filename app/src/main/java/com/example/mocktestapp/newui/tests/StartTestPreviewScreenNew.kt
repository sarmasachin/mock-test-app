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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.ContentRepository
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
    onStartTest: () -> Unit,
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
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(testName) {
        testSnapshot = ContentRepository.loadTestByTitle(testName)
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
            delay(30_000L)
        }
    }

    val test = testSnapshot ?: TestCardNew(
        title = testName,
        meta = "Mock test overview",
        examDate = "15 Feb 2026",
        durationLabel = "3 hrs",
        questionsMarks = "100 Q / 400 marks",
        enrolledLabel = "12.5k",
    )
    val unlockAt = remember(test.examDate) { parseUnlockAtMillis(test.examDate) }
    val isLocked = unlockAt?.let { nowMs < it } ?: false

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

            PreviewCard(test = test)

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

            Spacer(Modifier.height(16.dp))
            if (isLocked) {
                Text(
                    text = "Test locked till scheduled time (${test.examDate ?: "upcoming"})",
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(8.dp))
            }
            Button(
                onClick = onStartTest,
                enabled = !isLocked,
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
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
                    text = if (isLocked) "Start Test Series (Locked)" else "Start Test Series",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun PreviewCard(test: TestCardNew) {
    val p = mockTestPalette()
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = p.border.copy(alpha = 0.2f),
                shape = RoundedCornerShape(18.dp),
            ),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = test.title,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = "FREE",
                    color = Color(0xFF17B85A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = test.meta.ifBlank { "Complete mock test series with detailed analysis" },
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
                    label = test.questionsMarks ?: "100 Q / 400 marks",
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
                    label = test.enrolledLabel?.let { "$it enrolled" } ?: "12.5k enrolled",
                )
                MiniStat(
                    icon = Icons.Outlined.CalendarMonth,
                    label = test.examDate ?: "15 Feb 2026",
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
