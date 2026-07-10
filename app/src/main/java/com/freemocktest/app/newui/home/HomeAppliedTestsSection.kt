package com.freemocktest.app.newui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.util.AppliedTestHomeUi
import com.freemocktest.app.newui.theme.palette.mockTestPalette

private const val HOME_APPLIED_CARD_MAX_VISIBLE = 5

@Composable
fun HomeAppliedTestsSection(
    uiState: AppliedTestHomeUi.HomeAppliedTestsUiState,
    catalogLoading: Boolean,
    onOpenTest: (String) -> Unit,
    onViewAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!uiState.showSection) return
    val p = mockTestPalette()
    val visibleCards = uiState.cardStates.take(HOME_APPLIED_CARD_MAX_VISIBLE)
    val overflowCount = (uiState.cardStates.size - visibleCards.size).coerceAtLeast(0)

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "My Applied Tests",
                    color = p.textPrimary,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                if (uiState.hiddenExpiredCount > 0) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "${uiState.hiddenExpiredCount} expired hidden",
                        color = p.textSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            TextButton(onClick = onViewAll) {
                Text(
                    text = "View all",
                    color = p.systemBlue,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(
                items = visibleCards,
                key = { it.testName.lowercase() },
            ) { card ->
                HomeAppliedTestCard(
                    card = card,
                    catalogLoading = catalogLoading && !card.catalogLoaded,
                    onClick = { onOpenTest(card.testName) },
                )
            }
            if (overflowCount > 0) {
                item(key = "overflow") {
                    HomeAppliedOverflowCard(
                        moreCount = overflowCount,
                        onClick = onViewAll,
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeAppliedTestCard(
    card: AppliedTestHomeUi.AppliedTestCardUiState,
    catalogLoading: Boolean,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    val borderColor = when {
        card.isReadyHighlight -> Color(0xFF16A34A)
        card.isPendingResult -> Color(0xFFF59E0B)
        else -> p.border.copy(alpha = 0.22f)
    }
    if (catalogLoading) {
        Card(
            modifier = Modifier
                .width(148.dp)
                .height(118.dp),
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = p.surface.copy(alpha = 0.92f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
        ) {
            Box(
                modifier = Modifier.fillMaxWidth().height(118.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    strokeWidth = 2.dp,
                    color = p.accent,
                )
            }
        }
        return
    }
    Card(
        modifier = Modifier
            .width(148.dp)
            .height(118.dp)
            .clip(shape)
            .clickable(onClick = onClick),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(
            width = if (card.isReadyHighlight) 1.5.dp else 1.dp,
            color = borderColor,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = card.testName,
                color = p.textPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 16.sp,
            )
            if (!card.examStartLabel.isNullOrBlank() && card.isLocked) {
                Text(
                    text = card.examStartLabel,
                    color = p.textSecondary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!card.enrolledLabel.isNullOrBlank()) {
                Text(
                    text = card.enrolledLabel,
                    color = p.textSecondary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Column {
                if (card.isLocked && !card.isPendingResult) {
                    Text(
                        text = card.countdownText,
                        color = p.textPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Spacer(Modifier.height(2.dp))
                }
                Text(
                    text = card.statusMessage,
                    color = when {
                        card.isReadyHighlight -> Color(0xFF16A34A)
                        card.isPendingResult -> Color(0xFFB45309)
                        else -> p.textSecondary
                    },
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 14.sp,
                )
            }
        }
    }
}

@Composable
private fun HomeAppliedOverflowCard(
    moreCount: Int,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = Modifier
            .width(96.dp)
            .height(118.dp)
            .clip(shape)
            .border(1.dp, p.border.copy(alpha = 0.22f), shape)
            .background(p.surface.copy(alpha = 0.92f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "+$moreCount",
                color = p.systemBlue,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Text(
                text = "more",
                color = p.textSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
