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
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.example.mocktestapp.data.TestHistoryRepository
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
    onAnswerKey: () -> Unit,
    onReview: () -> Unit,
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
    val isResultLocked = (resultReleaseAtMs ?: 0L) > nowMs
    val isAnswerKeyLocked = (answerKeyReleaseAtMs ?: 0L) > nowMs
    val resultCountdown = formatCountdown((resultReleaseAtMs ?: 0L) - nowMs)
    val answerKeyCountdown = formatCountdown((answerKeyReleaseAtMs ?: 0L) - nowMs)

    // One Room insert per completed result; survives rotation but resets when this result’s inputs change.
    var historyWritten by rememberSaveable(testName, scoreText, correct, wrong) { mutableStateOf(false) }
    LaunchedEffect(testName, scoreText, correct, wrong) {
        if (historyWritten) return@LaunchedEffect
        val totalQuestions = scoreText.substringAfter("/").trim().toIntOrNull()
            ?: (correct + wrong).coerceAtLeast(1)
        TestHistoryRepository.recordAttempt(
            testName = testName,
            correct = correct,
            total = totalQuestions.coerceAtLeast(1),
        )
        historyWritten = true
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
                    .border(1.dp, p.border.copy(alpha = 0.16f), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = p.surface),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = scoreText,
                        color = p.textPrimary,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 34.sp,
                    )

                    Spacer(Modifier.height(14.dp))
                    if (isResultLocked) {
                        Text(
                            text = "Result unlock in $resultCountdown",
                            color = p.textPrimary,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 18.sp,
                        )
                        Spacer(Modifier.height(12.dp))
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        StatMini(title = "Answered", value = answered.toString(), modifier = Modifier.weight(1f))
                        StatMini(title = "Correct", value = correct.toString(), modifier = Modifier.weight(1f))
                        StatMini(title = "Wrong", value = wrong.toString(), modifier = Modifier.weight(1f))
                    }

                    Spacer(Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        GhostPillButton(
                            text = if (isAnswerKeyLocked) "Answer Key • $answerKeyCountdown" else "Answer Key",
                            onClick = { if (!isAnswerKeyLocked) onAnswerKey() },
                            modifier = Modifier.weight(1f),
                            enabled = !isAnswerKeyLocked,
                        )
                        SolidPillButton(
                            text = "Review",
                            onClick = { if (!isResultLocked) onReview() },
                            modifier = Modifier.weight(1f),
                            enabled = !isResultLocked,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    GhostPillButton(
                        text = "Share score",
                        onClick = {
                            if (isResultLocked) return@GhostPillButton
                            try {
                                val now = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a").format(LocalDateTime.now())
                                val userName = profile.displayName.ifBlank { "Guest User" }
                                val userId = profile.userIdFormatted ?: "00000000"
                                val cardBitmap = createResultShareCardBitmap(
                                    userName = userName,
                                    userId = userId,
                                    testName = testName,
                                    scoreText = scoreText,
                                    answered = answered,
                                    correct = correct,
                                    wrong = wrong,
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
                        enabled = !isResultLocked,
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
    val total = scoreParts.getOrNull(1)?.trim()?.toIntOrNull() ?: (correct + wrong).coerceAtLeast(1)
    val percentage = ((scored * 100f) / total.coerceAtLeast(1)).coerceIn(0f, 100f)
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
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    Card(
        modifier = modifier.height(76.dp),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surfaceElevated),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.12f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = title, color = p.textSecondary, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            Text(text = value, color = p.textPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
        }
    }
}

@Composable
private fun GhostPillButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(46.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.surface,
            contentColor = p.textPrimary,
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
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
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(46.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.primaryButton,
            contentColor = p.onPrimaryButton,
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
