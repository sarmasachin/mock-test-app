package com.freemocktest.app.newui.history

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.util.HistoryAttemptUi
import com.freemocktest.app.newui.theme.palette.mockTestPalette

@Composable
fun HistoryResultCard(
    model: HistoryAttemptUi.ResultCardModel,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(20.dp)
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = model.testName,
                        color = p.textPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "${model.dateText} · ${model.timeText}",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                HistoryPercentBadge(
                    percent = model.percent,
                    hidden = model.scoreHidden,
                )
            }

            Spacer(Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(Color(0xFF1D4ED8), Color(0xFF3B82F6)),
                        ),
                    )
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Text(
                    text = if (model.scoreHidden) "Score hidden" else model.scoreText,
                    color = Color.White,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 26.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                HistoryStatMini(
                    title = "Answered",
                    value = if (model.scoreHidden) "-" else model.answered.toString(),
                    modifier = Modifier.weight(1f),
                    containerColor = Color(0xFFF5F3FF),
                    valueColor = Color(0xFF7C3AED),
                    titleColor = Color(0xFF6D28D9),
                )
                HistoryStatMini(
                    title = "Correct",
                    value = if (model.scoreHidden) "-" else model.correct.toString(),
                    modifier = Modifier.weight(1f),
                    containerColor = Color(0xFFECFDF3),
                    valueColor = Color(0xFF16A34A),
                    titleColor = Color(0xFF166534),
                )
                HistoryStatMini(
                    title = "Wrong",
                    value = if (model.scoreHidden) "-" else model.wrong.toString(),
                    modifier = Modifier.weight(1f),
                    containerColor = Color(0xFFFEF2F2),
                    valueColor = Color(0xFFDC2626),
                    titleColor = Color(0xFFB91C1C),
                )
            }

            Spacer(Modifier.height(10.dp))
            Text(
                text = "Mock test · ${model.total} questions",
                color = p.textSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Tap for full result · Share · Answer key · Review",
                color = Color(0xFF2563EB),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun HistoryPercentBadge(percent: Int, hidden: Boolean) {
    val shape = RoundedCornerShape(999.dp)
    Box(
        modifier = Modifier
            .clip(shape)
            .background(Color(0xFFEFF6FF))
            .border(1.dp, Color(0xFFBFDBFE), shape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (hidden) "-" else "$percent%",
            color = Color(0xFF1D4ED8),
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

@Composable
private fun HistoryStatMini(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    containerColor: Color,
    valueColor: Color,
    titleColor: Color,
) {
    val shape = RoundedCornerShape(14.dp)
    Card(
        modifier = modifier.height(72.dp),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.85f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = title, color = titleColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(text = value, color = valueColor, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
        }
    }
}
