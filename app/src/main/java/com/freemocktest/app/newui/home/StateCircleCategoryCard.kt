package com.freemocktest.app.newui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.freemocktest.app.util.IndianStateVisualCatalog

@Composable
fun StateCircleCategoryGrid(
    items: List<Pair<String, String?>>,
    onOpenCategory: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 100.dp),
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        items(
            items = items,
            key = { (label, iconKey) -> "$label|$iconKey" },
        ) { (label, iconKey) ->
            StateCircleCategoryCard(
                label = label,
                iconKey = iconKey,
                onClick = { onOpenCategory(label) },
            )
        }
    }
}

@Composable
fun StateCircleCategoryCard(
    label: String,
    iconKey: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visual = remember(label, iconKey) {
        IndianStateVisualCatalog.findVisual(label, iconKey) ?: IndianStateVisualCatalog.defaultVisual()
    }
    val remoteIconUrl = remember(iconKey) {
        iconKey?.trim()?.takeIf { it.startsWith("http://", ignoreCase = true) || it.startsWith("https://", ignoreCase = true) }
    }
    val title = remember(label, visual) {
        if (IndianStateVisualCatalog.findVisual(label, iconKey) != null) visual.hindiName else label.trim()
    }
    val subtitle = remember(label, visual) {
        if (IndianStateVisualCatalog.findVisual(label, iconKey) != null) visual.englishName else ""
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Card(
            modifier = Modifier
                .size(118.dp)
                .clip(CircleShape)
                .border(2.dp, visual.borderColor.copy(alpha = 0.55f), CircleShape)
                .clickable(onClick = onClick),
            shape = CircleShape,
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(118.dp)
                    .background(visual.hoverBackground.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
                ) {
                    if (remoteIconUrl != null) {
                        AsyncImage(
                            model = remoteIconUrl,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                        )
                    } else {
                        Icon(
                            imageVector = visual.icon,
                            contentDescription = null,
                            tint = visual.iconColor,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                    Text(
                        text = title,
                        color = Color(0xFF1E293B),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 11.sp,
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .fillMaxWidth(),
                    )
                    if (subtitle.isNotBlank()) {
                        Text(
                            text = subtitle,
                            color = Color(0xFF64748B),
                            fontSize = 7.sp,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .padding(top = 1.dp)
                                .fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}
