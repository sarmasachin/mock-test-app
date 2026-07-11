package com.freemocktest.app.newui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Non-lazy adaptive circle grid for use inside [LazyColumn] sections.
 * Avoids crash: "Vertically-scrollable component was measured with infinity maximum height".
 */
@Composable
fun <T> ExamCircleStaticGrid(
    items: List<T>,
    modifier: Modifier = Modifier,
    columns: Int = 3,
    horizontalSpacing: Dp = 14.dp,
    verticalSpacing: Dp = 14.dp,
    content: @Composable (T) -> Unit,
) {
    val rows = remember(items, columns) { items.chunked(columns.coerceAtLeast(1)) }
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(verticalSpacing),
    ) {
        rows.forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(horizontalSpacing),
            ) {
                rowItems.forEach { item ->
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.TopCenter,
                    ) {
                        content(item)
                    }
                }
                repeat(columns - rowItems.size) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}
