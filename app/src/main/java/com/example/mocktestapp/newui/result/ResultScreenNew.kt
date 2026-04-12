package com.example.mocktestapp.newui.result

import android.content.ActivityNotFoundException
import android.content.Intent
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

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
                            text = "Answer Key",
                            onClick = onAnswerKey,
                            modifier = Modifier.weight(1f),
                        )
                        SolidPillButton(
                            text = "Review",
                            onClick = onReview,
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    GhostPillButton(
                        text = "Share score",
                        onClick = {
                            val text =
                                "MockTestApp — $testName\nScore: $scoreText (answered $answered, correct $correct, wrong $wrong)\n"
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, text)
                            }
                            try {
                                context.startActivity(Intent.createChooser(send, "Share score"))
                            } catch (_: ActivityNotFoundException) {
                                // No share handler; ignore — avoids crash on stripped-down builds.
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
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
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
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
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
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
