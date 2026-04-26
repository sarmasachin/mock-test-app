package com.example.mocktestapp.newui.result

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import androidx.core.content.FileProvider
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay

@Composable
fun ResultScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    scoreText: String = "0 / 10",
    answered: Int = 3,
    correct: Int = 0,
    wrong: Int = 3,
    total: Int = 0,
    publishAtMillisOverride: Long? = null,
    onGoSubmitApplication: () -> Unit,
    onAnswerKey: () -> Unit,
    onReview: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(
        colors = listOf(
            Color(0xFFF8FAFF),
            Color(0xFFEEF4FF),
        ),
    )
    val context = LocalContext.current
    val profile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )
    val scoreVisible by AppPreferencesRepository.scoreVisibilityEnabled.collectAsState(initial = true)
    val appliedSeries by AppPreferencesRepository.appliedTestSeries.collectAsState(initial = emptyList())
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
    var answerKeyReleaseAtMs by remember(testName) { mutableStateOf<Long?>(null) }
    var resultReleaseAtMs by remember(testName) { mutableStateOf<Long?>(null) }
    LaunchedEffect(testName) {
        val snapshot = ContentRepository.loadTestByTitle(testName)
        answerKeyReleaseAtMs = parseIsoMillis(snapshot?.answerKeyReleaseAt)
        resultReleaseAtMs = parseIsoMillis(snapshot?.resultReleaseAt)
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            nowMs = System.currentTimeMillis()
        }
    }
    val safeTotal = total.coerceAtLeast(answered).coerceAtLeast(correct + wrong)
    val scoreDisplayText = if (scoreVisible) "$correct / ${safeTotal.coerceAtLeast(1)}" else "-"
    val hasAttemptData = safeTotal > 0 || answered > 0 || correct > 0 || wrong > 0
    val shouldShowSubmitApplicationGate = !hasAttemptData && appliedSeries.isEmpty()
    val effectiveResultReleaseAt = maxOf(resultReleaseAtMs ?: 0L, publishAtMillisOverride ?: 0L)
    val isResultLocked = effectiveResultReleaseAt > nowMs
    val isAnswerKeyLocked = (answerKeyReleaseAtMs ?: 0L) > nowMs
    val resultCountdown = formatCountdown(effectiveResultReleaseAt - nowMs)
    val answerKeyCountdown = formatCountdown((answerKeyReleaseAtMs ?: 0L) - nowMs)
    val questionCountState by produceState<Int?>(initialValue = null, key1 = testName) {
        val count = ContentRepository.loadQuizQuestionsForTest(testName).size
        value = count
    }
    val isQuestionDataLoading = questionCountState == null
    val hasQuestionData = (questionCountState ?: 0) > 0
    val canOpenDetailViews = !isQuestionDataLoading && hasQuestionData
    val answerKeyButtonText = when {
        isQuestionDataLoading -> "Answer Key • Loading..."
        !hasQuestionData -> "Answer Key • Not available"
        isAnswerKeyLocked -> "Answer Key • $answerKeyCountdown"
        else -> "Answer Key"
    }
    val reviewButtonText = when {
        isQuestionDataLoading -> "Review • Loading..."
        !hasQuestionData -> "Review • Not available"
        else -> "Review"
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            Text(
                text = "Result",
                color = p.textPrimary,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = testName,
                color = p.textSecondary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
            )

            Spacer(Modifier.height(16.dp))

            val shape = RoundedCornerShape(20.dp)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .border(1.dp, Color(0xFFE5E7EB), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = Color.White),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    if (!hasAttemptData) {
                        Text(
                            text = "No test attempt found yet. Start and submit a test to view results.",
                            color = Color(0xFF0F172A),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                        Spacer(Modifier.height(14.dp))
                        SolidPillButton(
                            text = "Go to Submit Application",
                            onClick = onGoSubmitApplication,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = true,
                            containerColor = Color(0xFF2563EB),
                            contentColor = Color.White,
                        )
                        return@Column
                    }
                    if (shouldShowSubmitApplicationGate) {
                        Text(
                            text = "Please submit a test application first. You can take the test after your application is submitted.",
                            color = Color(0xFF0F172A),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                        Spacer(Modifier.height(14.dp))
                        SolidPillButton(
                            text = "Go to Submit Application",
                            onClick = onGoSubmitApplication,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = true,
                            containerColor = Color(0xFF2563EB),
                            contentColor = Color.White,
                        )
                        return@Column
                    }

                    if (isResultLocked) {
                        Text(
                            text = "You have successfully submitted the test.",
                            color = Color(0xFF0F172A),
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Result unlock in $resultCountdown",
                            color = Color(0xFF1D4ED8),
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 18.sp,
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            text = "Your full result details will be available after unlock.",
                            color = Color(0xFF475569),
                            fontWeight = FontWeight.Medium,
                            fontSize = 13.sp,
                        )
                        return@Column
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(
                                brush = Brush.horizontalGradient(
                                    colors = listOf(
                                        Color(0xFF1D4ED8),
                                        Color(0xFF3B82F6),
                                    ),
                                ),
                            )
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                    ) {
                        Text(
                            text = scoreDisplayText,
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 34.sp,
                        )
                    }

                    Spacer(Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        StatMini(
                            title = "Answered",
                            value = if (scoreVisible) answered.toString() else "-",
                            modifier = Modifier.weight(1f),
                            containerColor = Color(0xFFF5F3FF),
                            valueColor = Color(0xFF7C3AED),
                            titleColor = Color(0xFF6D28D9),
                        )
                        StatMini(
                            title = "Correct",
                            value = if (scoreVisible) correct.toString() else "-",
                            modifier = Modifier.weight(1f),
                            containerColor = Color(0xFFECFDF3),
                            valueColor = Color(0xFF16A34A),
                            titleColor = Color(0xFF166534),
                        )
                        StatMini(
                            title = "Wrong",
                            value = if (scoreVisible) wrong.toString() else "-",
                            modifier = Modifier.weight(1f),
                            containerColor = Color(0xFFFEF2F2),
                            valueColor = Color(0xFFDC2626),
                            titleColor = Color(0xFFB91C1C),
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        GhostPillButton(
                            text = answerKeyButtonText,
                            onClick = {
                                if (!isQuestionDataLoading && hasQuestionData && !isAnswerKeyLocked) {
                                    onAnswerKey()
                                }
                            },
                            modifier = Modifier.weight(1f),
                            enabled = canOpenDetailViews && !isAnswerKeyLocked,
                            containerColor = Color(0xFFDBEAFE),
                            contentColor = Color(0xFF1D4ED8),
                            borderColor = Color(0xFF93C5FD),
                        )
                        SolidPillButton(
                            text = reviewButtonText,
                            onClick = {
                                if (canOpenDetailViews) onReview()
                            },
                            modifier = Modifier.weight(1f),
                            enabled = canOpenDetailViews,
                            containerColor = Color(0xFF14B8A6),
                            contentColor = Color.White,
                        )
                    }
                    if (!hasQuestionData && !isQuestionDataLoading) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Answer key and review will be enabled after questions are published for this test.",
                            color = Color(0xFF64748B),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    GhostPillButton(
                        text = "Share score",
                        onClick = {
                            try {
                                val now = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a").format(LocalDateTime.now())
                                val userName = profile.displayName.ifBlank { "Guest User" }
                                val userId = profile.userIdFormatted ?: "00000000"
                                val cardBitmap = createResultShareCardBitmap(
                                    userName = userName,
                                    userId = userId,
                                    testName = testName,
                                    scoreText = scoreDisplayText,
                                    answered = answered,
                                    correct = correct,
                                    wrong = wrong,
                                    total = safeTotal,
                                    sharedAt = now,
                                )
                                val outFile = File(context.cacheDir, "result_share_${System.currentTimeMillis()}.png")
                                FileOutputStream(outFile).use { cardBitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                                val uri = FileProvider.getUriForFile(
                                    context,
                                    "${context.packageName}.fileprovider",
                                    outFile,
                                )
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "image/png"
                                    putExtra(Intent.EXTRA_STREAM, uri)
                                    putExtra(Intent.EXTRA_TEXT, "MockTestApp result card")
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(Intent.createChooser(send, "Share score"))
                            } catch (_: ActivityNotFoundException) {
                                // No share handler; ignore — avoids crash on stripped-down builds.
                            } catch (_: Exception) {
                                // Ignore share failures to keep result flow safe.
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = true,
                        containerColor = Color(0xFFE0E7FF),
                        contentColor = Color(0xFF3730A3),
                        borderColor = Color(0xFFC7D2FE),
                    )
                }
            }
        }
    }
}

private fun createResultShareCardBitmap(
    userName: String,
    userId: String,
    testName: String,
    scoreText: String,
    answered: Int,
    correct: Int,
    wrong: Int,
    total: Int,
    sharedAt: String,
): Bitmap {
    val width = 1080
    val height = 1350
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val safeTestName = testName.take(34)
    val safeUserName = userName.take(24)
    val scoreParts = scoreText.split("/")
    val scored = scoreParts.getOrNull(0)?.trim()?.toIntOrNull() ?: correct
    val resolvedTotal = scoreParts.getOrNull(1)?.trim()?.toIntOrNull()
        ?: total.coerceAtLeast(correct + wrong).coerceAtLeast(1)
    val percentage = ((scored * 100f) / resolvedTotal.coerceAtLeast(1)).coerceIn(0f, 100f)
    val performanceBand = when {
        percentage >= 85f -> "Top Performer"
        percentage >= 60f -> "Strong Attempt"
        percentage >= 40f -> "Good Progress"
        else -> "Keep Practicing"
    }

    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = LinearGradient(
            0f,
            0f,
            width.toFloat(),
            height.toFloat(),
            intArrayOf(0xFF0B1026.toInt(), 0xFF1D4ED8.toInt(), 0xFF0EA5E9.toInt()),
            null,
            Shader.TileMode.CLAMP,
        )
    }
    canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), bgPaint)

    val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x33FFFFFF }
    canvas.drawCircle(width - 110f, 130f, 180f, glowPaint)
    canvas.drawCircle(90f, height - 90f, 130f, glowPaint)

    val cardRect = RectF(56f, 86f, width - 56f, height - 86f)
    val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xF2FFFFFF.toInt() }
    canvas.drawRoundRect(cardRect, 44f, 44f, cardPaint)

    val badgeRect = RectF(110f, 140f, 300f, 214f)
    val badgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1D4ED8.toInt() }
    canvas.drawRoundRect(badgeRect, 24f, 24f, badgePaint)

    val heading = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0F172A.toInt()
        textSize = 50f
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT_BOLD, android.graphics.Typeface.BOLD)
    }
    val subHeading = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF334155.toInt()
        textSize = 30f
    }
    val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF475569.toInt()
        textSize = 28f
    }
    val value = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0F172A.toInt()
        textSize = 34f
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT_BOLD, android.graphics.Typeface.BOLD)
    }
    val badgeText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textSize = 30f
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT_BOLD, android.graphics.Typeface.BOLD)
    }
    val scorePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF1D4ED8.toInt()
        textSize = 76f
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT_BOLD, android.graphics.Typeface.BOLD)
    }
    val percentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF059669.toInt()
        textSize = 46f
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT_BOLD, android.graphics.Typeface.BOLD)
    }

    var y = 192f
    canvas.drawText("MOCKTEST", 128f, y, badgeText)
    y += 72f
    canvas.drawText("Result Snapshot", 110f, y, heading)
    y += 52f
    canvas.drawText(performanceBand, 110f, y, subHeading)

    y += 80f
    canvas.drawText("User", 110f, y, label)
    y += 42f
    canvas.drawText(safeUserName, 110f, y, value)
    y += 50f
    canvas.drawText("User Id - $userId", 110f, y, subHeading)

    y += 72f
    canvas.drawText("Test", 110f, y, label)
    y += 42f
    canvas.drawText(safeTestName, 110f, y, value)

    y += 78f
    canvas.drawText("Score", 110f, y, label)
    y += 54f
    canvas.drawText(scoreText, 110f, y, scorePaint)
    canvas.drawText(String.format("%.1f%%", percentage), 560f, y, percentPaint)

    val statTop = y + 42f
    val statWidth = 268f
    val gap = 32f
    drawShareStatBox(canvas, 110f, statTop, statWidth, "Answered", answered.toString(), 0xFFE0F2FE.toInt())
    drawShareStatBox(canvas, 110f + statWidth + gap, statTop, statWidth, "Correct", correct.toString(), 0xFFDCFCE7.toInt())
    drawShareStatBox(canvas, 110f + (statWidth + gap) * 2f, statTop, statWidth, "Wrong", wrong.toString(), 0xFFFEE2E2.toInt())

    y = statTop + 178f
    canvas.drawText("Shared on: $sharedAt", 110f, y, subHeading)

    val footer = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF1E293B.toInt()
        textSize = 28f
    }
    canvas.drawText("Keep practicing daily with MockTestApp", 110f, height - 150f, footer)

    return bitmap
}

private fun drawShareStatBox(
    canvas: Canvas,
    left: Float,
    top: Float,
    width: Float,
    title: String,
    value: String,
    boxColor: Int,
) {
    val rect = RectF(left, top, left + width, top + 136f)
    val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = boxColor }
    canvas.drawRoundRect(rect, 24f, 24f, boxPaint)
    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF334155.toInt()
        textSize = 27f
    }
    val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF0F172A.toInt()
        textSize = 42f
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT_BOLD, android.graphics.Typeface.BOLD)
    }
    canvas.drawText(title, left + 20f, top + 50f, titlePaint)
    canvas.drawText(value, left + 20f, top + 104f, valuePaint)
}

@Composable
private fun StatMini(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    containerColor: Color,
    valueColor: Color,
    titleColor: Color,
) {
    val shape = RoundedCornerShape(16.dp)
    Card(
        modifier = modifier.height(76.dp),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.8f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = title, color = titleColor, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text(text = value, color = valueColor, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
        }
    }
}

@Composable
private fun GhostPillButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    containerColor: Color,
    contentColor: Color,
    borderColor: Color,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(46.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor.copy(alpha = 0.6f),
            disabledContentColor = contentColor.copy(alpha = 0.6f),
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, borderColor),
    ) {
        Text(text = text, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SolidPillButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    containerColor: Color,
    contentColor: Color,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(46.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor.copy(alpha = 0.6f),
            disabledContentColor = contentColor.copy(alpha = 0.6f),
        ),
    ) {
        Text(text = text, fontWeight = FontWeight.Bold)
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
