package com.example.mocktestapp.newui.result

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

@Composable
fun AnswerKeyScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

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

            val items = dummyAnswerKeyItems()

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
            ) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 10.dp),
                ) {
                    itemsIndexed(items) { index, status ->
                        AnswerKeyRow(
                            label = "Q${index + 1}",
                            status = status,
                        )
                    }
                }
            }
        }
    }
}

private enum class AnswerStatus {
    CORRECT,
    WRONG,
    NOT_ANSWERED,
}

private fun dummyAnswerKeyItems(): List<AnswerStatus> {
    return listOf(
        AnswerStatus.WRONG,
        AnswerStatus.NOT_ANSWERED,
        AnswerStatus.WRONG,
        AnswerStatus.WRONG,
        AnswerStatus.NOT_ANSWERED,
        AnswerStatus.NOT_ANSWERED,
        AnswerStatus.NOT_ANSWERED,
        AnswerStatus.NOT_ANSWERED,
        AnswerStatus.NOT_ANSWERED,
        AnswerStatus.NOT_ANSWERED,
    )
}

@Composable
private fun AnswerKeyRow(
    label: String,
    status: AnswerStatus,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            color = p.textPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )

        val (cellBg, fg, symbol) = when (status) {
            AnswerStatus.CORRECT -> Triple(
                p.answerCorrectStart,
                p.answerCorrectEnd,
                "✓",
            )

            AnswerStatus.WRONG -> Triple(
                p.answerWrongStart,
                p.answerWrongEnd,
                "✕",
            )

            AnswerStatus.NOT_ANSWERED -> Triple(
                p.answerNeutralSurface,
                p.textSecondary,
                "–",
            )
        }

        Box(
            modifier = Modifier
                .size(30.dp)
                .background(cellBg, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = symbol,
                color = fg,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
