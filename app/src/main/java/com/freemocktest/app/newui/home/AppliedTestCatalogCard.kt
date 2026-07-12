package com.freemocktest.app.newui.home

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.util.AppliedTestHomeUi
import com.freemocktest.app.newui.theme.palette.mockTestPalette

/** Width of the premium home test catalog card (matches mockup layout). */
val AppliedTestCatalogCardWidth = 304.dp

/** Fixed height while catalog metadata is loading. */
val AppliedTestCatalogCardLoadingHeight = 292.dp

private val AppliedCardShape = RoundedCornerShape(18.dp)
private val AccentOrange = Color(0xFFF97316)
private val NavyTitle = Color(0xFF1E3A5F)
private val ScheduledBadgeBg = Color(0xFFFEF3C7)
private val ScheduledBadgeText = Color(0xFF92400E)
private val ReadyBadgeBg = Color(0xFFD1FAE5)
private val ReadyBadgeText = Color(0xFF065F46)
private val OpenBadgeBg = Color(0xFFDBEAFE)
private val OpenBadgeText = Color(0xFF1D4ED8)
private val ResultBadgeBg = Color(0xFFFFEDD5)
private val ResultBadgeText = Color(0xFF9A3412)
private val RegisteredBadgeBg = Color(0xFFE0E7FF)
private val RegisteredBadgeText = Color(0xFF3730A3)
private val InfoBoxBg = Color(0xFFF1F5F9)
private val PillBorder = Color(0xFFE2E8F0)
private val DisabledButtonBg = Color(0xFFE8EEF4)
private val DisabledButtonText = Color(0xFF64748B)

@Composable
fun AppliedTestCatalogCardLoading(
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Card(
        modifier = modifier
            .width(AppliedTestCatalogCardWidth)
            .height(AppliedTestCatalogCardLoadingHeight),
        shape = AppliedCardShape,
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, PillBorder),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(AppliedTestCatalogCardLoadingHeight),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.dp,
                color = p.accent,
            )
        }
    }
}

@Composable
fun AppliedTestCatalogCard(
    card: AppliedTestHomeUi.AppliedTestCardUiState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val badgeColors = scheduleBadgeColors(card.scheduleBadgeLabel)
    Card(
        modifier = modifier
            .width(AppliedTestCatalogCardWidth)
            .clip(AppliedCardShape)
            .clickable(onClick = onClick),
        shape = AppliedCardShape,
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        border = androidx.compose.foundation.BorderStroke(
            width = when {
                card.isFeaturedStateExamBoost -> 2.dp
                card.isReadyHighlight -> 1.5.dp
                card.isSuggestApplyHighlight -> 1.5.dp
                else -> 1.dp
            },
            color = when {
                card.isFeaturedStateExamBoost -> Color(0xFFEAB308)
                card.isReadyHighlight -> Color(0xFF16A34A)
                card.isSuggestApplyHighlight -> Color(0xFF2563EB)
                card.isPendingResult -> Color(0xFFF59E0B)
                else -> PillBorder
            },
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CatalogStatusBadge(
                    label = card.scheduleBadgeLabel,
                    background = badgeColors.first,
                    content = badgeColors.second,
                    icon = when (card.scheduleBadgeLabel) {
                        "READY" -> Icons.Outlined.PlayArrow
                        "OPEN" -> Icons.Outlined.PlayArrow
                        "RESULT" -> Icons.Outlined.Star
                        else -> Icons.Outlined.Schedule
                    },
                )
                if (card.isFeaturedStateExamBoost) {
                    CatalogStatusBadge(
                        label = "IMPORTANT",
                        background = Color(0xFFFEF3C7),
                        content = Color(0xFFB45309),
                        icon = Icons.Outlined.Star,
                    )
                }
                if (!card.registeredDisplay.isNullOrBlank()) {
                    CatalogStatusBadge(
                        label = card.registeredDisplay,
                        background = RegisteredBadgeBg,
                        content = RegisteredBadgeText,
                        icon = Icons.Outlined.Groups,
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            Text(
                text = card.testName,
                color = NavyTitle,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 22.sp,
            )

            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                CatalogStatPill(Icons.Outlined.Timer, card.durationPill, Modifier.weight(1f))
                CatalogStatPill(Icons.Outlined.HelpOutline, card.questionsPill, Modifier.weight(1f))
            }
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                CatalogStatPill(Icons.Outlined.TrackChanges, card.marksPill, Modifier.weight(1f))
                CatalogStatPill(Icons.Outlined.Star, card.negativePill, Modifier.weight(1f))
            }

            Spacer(Modifier.height(10.dp))
            CatalogInfoBox(
                startTime = card.startTimeDisplay ?: card.examStartLabel ?: "—",
                subjectFocus = card.subjectFocus ?: "General",
            )

            if (card.showUnlockSection) {
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Unlocking in...",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        text = card.countdownVerbose,
                        color = AccentOrange,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { card.unlockProgress.coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(5.dp)
                        .clip(RoundedCornerShape(999.dp)),
                    color = AccentOrange,
                    trackColor = Color(0xFFE2E8F0),
                )
            } else if (card.canStartNow) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = card.statusMessage,
                    color = Color(0xFF16A34A),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            } else if (card.isPendingResult) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = card.statusMessage,
                    color = ResultBadgeText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Spacer(Modifier.height(12.dp))
            CatalogActionButton(
                label = card.actionButtonLabel,
                enabled = card.actionButtonEnabled,
                suggestApply = card.isSuggestApply,
            )
        }
    }
}

@Composable
fun AppliedTestCatalogOverflowCard(
    moreCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Box(
        modifier = modifier
            .width(96.dp)
            .height(AppliedTestCatalogCardLoadingHeight)
            .clip(AppliedCardShape)
            .border(1.dp, PillBorder, AppliedCardShape)
            .background(Color.White)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "+$moreCount",
                color = p.systemBlue,
                fontSize = 22.sp,
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

@Composable
private fun CatalogStatusBadge(
    label: String,
    background: Color,
    content: Color,
    icon: ImageVector,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(background)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = content,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = label,
            color = content,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CatalogStatPill(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .border(1.dp, PillBorder, RoundedCornerShape(999.dp))
            .background(Color.White)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = AccentOrange,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = label,
            color = Color(0xFF475569),
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CatalogInfoBox(
    startTime: String,
    subjectFocus: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(InfoBoxBg)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Start Time",
                color = Color(0xFF94A3B8),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = startTime,
                color = NavyTitle,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Subject Focus",
                color = Color(0xFF94A3B8),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = subjectFocus,
                color = NavyTitle,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CatalogActionButton(
    label: String,
    enabled: Boolean,
    suggestApply: Boolean,
) {
    val bg = when {
        enabled && suggestApply -> Color(0xFF2563EB)
        enabled -> Color(0xFF10B981)
        else -> DisabledButtonBg
    }
    val textColor = if (enabled) Color.White else DisabledButtonText
    val iconTint = when {
        enabled -> Color.White
        suggestApply -> Color(0xFF2563EB)
        else -> AccentOrange
    }
    val icon = when {
        enabled && suggestApply -> Icons.Outlined.PlayArrow
        enabled -> Icons.Outlined.PlayArrow
        else -> Icons.Outlined.Lock
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bg),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            color = textColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(6.dp))
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = iconTint,
            modifier = Modifier.size(16.dp),
        )
    }
}

private fun scheduleBadgeColors(label: String): Pair<Color, Color> = when (label) {
    "READY" -> ReadyBadgeBg to ReadyBadgeText
    "OPEN" -> OpenBadgeBg to OpenBadgeText
    "RESULT" -> ResultBadgeBg to ResultBadgeText
    "CLOSED" -> Color(0xFFFEE2E2) to Color(0xFF991B1B)
    else -> ScheduledBadgeBg to ScheduledBadgeText
}
