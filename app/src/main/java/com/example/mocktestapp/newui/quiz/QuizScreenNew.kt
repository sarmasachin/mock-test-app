@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.example.mocktestapp.newui.quiz

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.delay

@Composable
fun QuizScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    val totalQuestions = 10
    var current by remember { mutableIntStateOf(0) }
    val answers = remember { mutableStateMapOf<Int, Int>() }

    var remainingSeconds by remember { mutableIntStateOf(12 * 60) }
    LaunchedEffect(Unit) {
        while (remainingSeconds > 0) {
            delay(1000)
            remainingSeconds -= 1
        }
        onSubmit()
    }

    val answeredCount = answers.size
    val unansweredCount = totalQuestions - answeredCount

    var overviewOpen by remember { mutableStateOf(false) }
    val overviewSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding),
        ) {
            TopBar(
                current = current + 1,
                total = totalQuestions,
                remainingSeconds = remainingSeconds,
                onBack = onBack,
                onSubmit = onSubmit,
                onOpenOverview = { overviewOpen = true },
            )

            Spacer(Modifier.height(12.dp))
            Text(
                text = testName,
                color = p.primaryButton,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )

            Spacer(Modifier.height(12.dp))

            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            text = "Answered: $answeredCount / $totalQuestions",
                            color = p.textSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Unanswered: $unansweredCount",
                            color = p.textPrimary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    QuestionStrip(
                        total = totalQuestions,
                        currentIndex = current,
                        answered = answers.keys,
                        onSelect = { idx -> current = idx },
                        onOverflowClick = { overviewOpen = true },
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            val questionTitle = "Q${current + 1}. Arithmetic Question ${current + 1}"
            QuestionCard(
                title = questionTitle,
                selected = answers[current],
                onSelect = { option -> answers[current] = option },
            )

            Spacer(Modifier.height(14.dp))

            BottomNav(
                canPrev = current > 0,
                canNext = current < totalQuestions - 1,
                onPrev = { if (current > 0) current -= 1 },
                onNext = { if (current < totalQuestions - 1) current += 1 },
            )
        }
    }

    if (overviewOpen) {
        ModalBottomSheet(
            onDismissRequest = { overviewOpen = false },
            sheetState = overviewSheetState,
            containerColor = p.surface,
            dragHandle = null,
        ) {
            QuestionOverviewSheetContent(
                total = totalQuestions,
                currentIndex = current,
                answeredIndices = answers.keys,
                onPickQuestion = { idx ->
                    if (idx <= current) {
                        current = idx
                        overviewOpen = false
                    }
                },
            )
        }
    }
}

@Composable
private fun TopBar(
    current: Int,
    total: Int,
    remainingSeconds: Int,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
    onOpenOverview: () -> Unit,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.Rounded.ArrowBack,
                    contentDescription = "Back",
                    tint = p.textPrimary,
                )
            }
            Spacer(Modifier.width(2.dp))
            Text(
                text = "Question $current/$total",
                color = p.textSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }

        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            TimerPillCentered(seconds = remainingSeconds)
        }

        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End,
        ) {
            IconButton(onClick = onOpenOverview) {
                Icon(
                    imageVector = Icons.Rounded.MoreVert,
                    contentDescription = "All questions",
                    tint = p.textPrimary,
                )
            }
            Spacer(Modifier.width(4.dp))
            SubmitButtonHighlighted(onClick = onSubmit)
        }
    }
}

@Composable
private fun TimerPillCentered(seconds: Int) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(999.dp)
    val text = formatTime(seconds)
    Row(
        modifier = Modifier
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.2f), shape)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            color = p.textPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

@Composable
private fun SubmitButtonHighlighted(onClick: () -> Unit) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(999.dp)
    val blue = p.systemBlue
    Row(
        modifier = Modifier
            .clip(shape)
            .background(blue)
            .border(1.dp, Color.White.copy(alpha = 0.35f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Submit",
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

@Composable
private fun QuestionStrip(
    total: Int,
    currentIndex: Int,
    answered: Set<Int>,
    onSelect: (Int) -> Unit,
    onOverflowClick: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        for (i in 0 until minOf(total, 6)) {
            val selected = i == currentIndex
            val isAnswered = i in answered
            QuestionChip(
                text = (i + 1).toString(),
                selected = selected,
                answered = isAnswered,
                onClick = { onSelect(i) },
            )
        }
        if (total > 6) {
            QuestionChip(
                text = "…",
                selected = false,
                answered = false,
                onClick = onOverflowClick,
            )
        }
    }
}

@Composable
private fun QuestionChip(
    text: String,
    selected: Boolean,
    answered: Boolean,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    val bg = when {
        selected -> p.primaryButton
        else -> p.surface
    }
    val fg = if (selected) p.onPrimaryButton else p.textPrimary
    val borderCol = if (answered) p.accent.copy(alpha = 0.45f) else p.border.copy(alpha = 0.14f)

    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(shape)
            .background(bg)
            .border(1.dp, borderCol, shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, color = fg, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun QuestionCard(
    title: String,
    selected: Int?,
    onSelect: (Int) -> Unit,
) {
    val p = mockTestPalette()
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = title,
                color = p.textPrimary,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 15.sp,
            )
            Spacer(Modifier.height(12.dp))

            val options = listOf("Option A", "Option B", "Option C", "Option D")
            options.forEachIndexed { idx, text ->
                OptionRow(
                    text = text,
                    selected = selected == idx,
                    onClick = { onSelect(idx) },
                )
                Spacer(Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun OptionRow(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    val borderCol = if (selected) p.primaryButton else p.border.copy(alpha = 0.14f)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(shape)
            .background(p.surface)
            .border(1.dp, borderCol, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioDot(selected = selected)
        Spacer(Modifier.width(12.dp))
        Text(
            text = text,
            color = p.textPrimary,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun RadioDot(selected: Boolean) {
    val p = mockTestPalette()
    val outer = RoundedCornerShape(999.dp)
    Box(
        modifier = Modifier
            .size(18.dp)
            .clip(outer)
            .border(1.dp, p.textSecondary, outer),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(outer)
                    .background(p.primaryButton),
            )
        }
    }
}

@Composable
private fun BottomNav(
    canPrev: Boolean,
    canNext: Boolean,
    onPrev: () -> Unit,
    onNext: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        GhostButton(
            text = "Prev",
            enabled = canPrev,
            onClick = onPrev,
            modifier = Modifier.weight(1f),
        )
        SolidButton(
            text = "Next",
            enabled = canNext,
            onClick = onNext,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun GhostButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.surface,
            contentColor = p.textPrimary,
            disabledContainerColor = p.surface.copy(alpha = 0.6f),
            disabledContentColor = p.textPrimary.copy(alpha = 0.5f),
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
    ) {
        Text(text = text, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SolidButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.primaryButton,
            contentColor = p.onPrimaryButton,
            disabledContainerColor = p.primaryButton.copy(alpha = 0.6f),
            disabledContentColor = p.onPrimaryButton.copy(alpha = 0.6f),
        ),
    ) {
        Text(text = text, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun QuestionOverviewSheetContent(
    total: Int,
    currentIndex: Int,
    answeredIndices: Set<Int>,
    onPickQuestion: (Int) -> Unit,
) {
    val p = mockTestPalette()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Text(
            text = "Question overview",
            color = p.textPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Green = answered · Orange = missed · Ring = current · Lock = not reached yet",
            color = p.textSecondary,
            fontSize = 12.sp,
            lineHeight = 17.sp,
        )
        Spacer(Modifier.height(14.dp))
        OverviewLegendRow()
        Spacer(Modifier.height(12.dp))
        val cols = 5
        val rows = (total + cols - 1) / cols
        for (r in 0 until rows) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (c in 0 until cols) {
                    val idx = r * cols + c
                    if (idx >= total) {
                        Spacer(modifier = Modifier.weight(1f))
                    } else {
                        OverviewQuestionCell(
                            number = idx + 1,
                            index = idx,
                            currentIndex = currentIndex,
                            answered = idx in answeredIndices,
                            onClick = { onPickQuestion(idx) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun OverviewLegendRow() {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LegendItem(color = p.success, label = "Answered")
        LegendItem(color = p.answerWrongStart, label = "Missed")
        LegendItem(color = p.surfaceTrack, label = "Pending", showLock = true)
    }
}

@Composable
private fun LegendItem(
    color: Color,
    label: String,
    showLock: Boolean = false,
) {
    val p = mockTestPalette()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(color),
        )
        Spacer(Modifier.width(6.dp))
        if (showLock) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = null,
                tint = p.textSecondary,
                modifier = Modifier.size(12.dp),
            )
            Spacer(Modifier.width(4.dp))
        }
        Text(
            text = label,
            color = p.textSecondary,
            fontSize = 11.sp,
        )
    }
}

@Composable
private fun OverviewQuestionCell(
    number: Int,
    index: Int,
    currentIndex: Int,
    answered: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val locked = index > currentIndex
    val skipped = index < currentIndex && !answered
    val isCurrent = index == currentIndex

    val fillColor = when {
        locked -> p.surfaceTrack
        answered -> p.success
        skipped -> p.answerWrongStart.copy(alpha = 0.38f)
        isCurrent -> p.surfaceElevated
        else -> p.surfaceElevated
    }
    val borderColor = when {
        locked -> p.border.copy(alpha = 0.12f)
        isCurrent && !answered && !locked -> p.primaryButton
        answered -> p.success.copy(alpha = 0.85f)
        skipped -> p.error.copy(alpha = 0.5f)
        else -> p.border.copy(alpha = 0.16f)
    }
    val borderWidth = if (isCurrent && !answered && !locked) 2.dp else 1.dp
    val shape = RoundedCornerShape(12.dp)

    Box(
        modifier = modifier
            .height(48.dp)
            .clip(shape)
            .background(fillColor)
            .border(borderWidth, borderColor, shape)
            .clickable(enabled = !locked, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (locked) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = "Locked",
                tint = p.textSecondary,
                modifier = Modifier.size(20.dp),
            )
        } else {
            Text(
                text = number.toString(),
                color = when {
                    answered -> Color.White
                    else -> p.textPrimary
                },
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }
    }
}

private fun formatTime(totalSeconds: Int): String {
    val m = (totalSeconds / 60).coerceAtLeast(0)
    val s = (totalSeconds % 60).coerceAtLeast(0)
    return "%d:%02d".format(m, s)
}
