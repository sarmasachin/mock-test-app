package com.freemocktest.app.newui.result

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import androidx.compose.runtime.mutableIntStateOf
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
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private const val ANSWER_KEY_META_LOAD_ERROR_MESSAGE =
    "Couldn't load unlock schedule. Check your connection and try again."

private const val ANSWER_KEY_QUESTIONS_LOAD_ERROR_MESSAGE =
    "Couldn't load answer key. Check your connection and try again."

@Composable
fun AnswerKeyScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
    var answerKeyReleaseAtMs by remember(testName) { mutableStateOf<Long?>(null) }
    var resultReleaseAtMs by remember(testName) { mutableStateOf<Long?>(null) }
    var metaLoadFailed by remember(testName) { mutableStateOf(false) }
    var answerKeyReloadKey by remember(testName) { mutableIntStateOf(0) }

    var items by remember(testName) { mutableStateOf<List<AnswerKeyItem>>(emptyList()) }
    var questionsLoading by remember(testName) { mutableStateOf(false) }
    var questionsLoadFailed by remember(testName) { mutableStateOf(false) }

    LaunchedEffect(testName, answerKeyReloadKey) {
        runCatching { ContentRepository.loadTestByTitle(testName) }.fold(
            onSuccess = { snapshot ->
                metaLoadFailed = false
                answerKeyReleaseAtMs = parseIsoMillis(snapshot?.answerKeyReleaseAt)
                resultReleaseAtMs = parseIsoMillis(snapshot?.resultReleaseAt)
            },
            onFailure = {
                metaLoadFailed = true
                answerKeyReleaseAtMs = null
                resultReleaseAtMs = null
            },
        )
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            nowMs = System.currentTimeMillis()
        }
    }
    val effectiveUnlockAtMs = maxOf(answerKeyReleaseAtMs ?: 0L, resultReleaseAtMs ?: 0L)
    val isLocked = effectiveUnlockAtMs > nowMs
    val countdown = formatCountdown(effectiveUnlockAtMs - nowMs)

    LaunchedEffect(testName, answerKeyReloadKey, isLocked) {
        if (isLocked) {
            items = emptyList()
            questionsLoading = false
            questionsLoadFailed = false
            return@LaunchedEffect
        }
        questionsLoading = true
        questionsLoadFailed = false
        try {
            val result = runCatching { ContentRepository.loadQuizQuestionsForTest(testName) }
            items = result.getOrElse { emptyList() }.mapIndexed { index, q ->
                AnswerKeyItem(
                    label = "Q${index + 1}",
                    title = q.title,
                    correctAnswer = q.options.getOrNull(q.correctIndex).orEmpty().ifBlank { "Not available" },
                )
            }
            questionsLoadFailed = result.isFailure
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            items = emptyList()
            questionsLoadFailed = true
        } finally {
            questionsLoading = false
        }
    }

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
                Spacer(Modifier.size(6.dp))
                Text(
                    text = "Answer Key",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = testName,
                color = p.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(18.dp))
            if (isLocked) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Answer key unlock in",
                            color = p.textSecondary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = countdown,
                            color = p.textPrimary,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 22.sp,
                        )
                    }
                }
                if (metaLoadFailed) {
                    Spacer(Modifier.height(12.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = p.surfaceElevated),
                        border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = ANSWER_KEY_META_LOAD_ERROR_MESSAGE,
                                color = p.textPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Button(
                                onClick = { answerKeyReloadKey += 1 },
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = p.primaryButton,
                                    contentColor = p.onPrimaryButton,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Retry", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                return@Scaffold
            }

            if (metaLoadFailed) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surfaceElevated),
                    border = BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            text = ANSWER_KEY_META_LOAD_ERROR_MESSAGE,
                            color = p.textSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        )
                        Button(
                            onClick = { answerKeyReloadKey += 1 },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Retry", fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            if (questionsLoading) {
                Text(
                    text = "Loading answer key…",
                    color = p.textSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
                return@Scaffold
            }

            if (questionsLoadFailed) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = ANSWER_KEY_QUESTIONS_LOAD_ERROR_MESSAGE,
                            color = p.textPrimary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                        Button(
                            onClick = { answerKeyReloadKey += 1 },
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Retry", fontWeight = FontWeight.Bold)
                        }
                    }
                }
                return@Scaffold
            }

            if (items.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Answer key details are not available yet.",
                            color = p.textPrimary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Check again after the answer key is published by admin.",
                            color = p.textSecondary,
                            fontSize = 12.sp,
                        )
                    }
                }
                return@Scaffold
            }

            val pageSize = 50
            val totalPages = ((items.size + pageSize - 1) / pageSize).coerceAtLeast(1)
            var selectedPage by remember(items.size) { mutableStateOf(0) }
            val pageStart = selectedPage * pageSize
            val pageEndExclusive = minOf(items.size, pageStart + pageSize)
            val pageItems = items.subList(pageStart, pageEndExclusive)

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    if (totalPages > 1) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            repeat(totalPages) { page ->
                                val from = page * pageSize + 1
                                val to = minOf(items.size, (page + 1) * pageSize)
                                val selected = page == selectedPage
                                Text(
                                    text = "$from-$to",
                                    color = if (selected) p.onPrimaryButton else p.textPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(if (selected) p.primaryButton else p.surfaceElevated)
                                        .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
                                        .clickable { selectedPage = page }
                                        .padding(horizontal = 10.dp, vertical = 7.dp)
                                    ,
                                )
                            }
                        }
                    }
                    Text(
                        text = "Showing Q${pageStart + 1} to Q${pageEndExclusive} of ${items.size}",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                    Spacer(Modifier.height(4.dp))
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 10.dp),
                    ) {
                        itemsIndexed(pageItems) { _, item ->
                            AnswerKeyRow(
                                item = item,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun parseIsoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    return try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: Exception) {
        null
    }
}

private fun formatCountdown(remainingMs: Long): String {
    if (remainingMs <= 0L) return "00:00:00"
    val totalSeconds = remainingMs / 1000L
    val hours = totalSeconds / 3600L
    val minutes = (totalSeconds % 3600L) / 60L
    val seconds = totalSeconds % 60L
    return String.format("%02d:%02d:%02d", hours, minutes, seconds)
}

private data class AnswerKeyItem(
    val label: String,
    val title: String,
    val correctAnswer: String,
)

@Composable
private fun AnswerKeyRow(
    item: AnswerKeyItem,
) {
    val p = mockTestPalette()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = item.label,
                color = p.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Correct",
                color = p.success,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = item.title,
            color = p.textSecondary,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = "Answer: ${item.correctAnswer}",
            color = p.textPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
