package com.freemocktest.app.newui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.util.AppliedTestHomeUi
import com.freemocktest.app.newui.theme.palette.mockTestPalette

@Composable
fun HomeAppliedTestsSection(
    uiState: AppliedTestHomeUi.HomeAppliedTestsUiState,
    catalogLoading: Boolean,
    onOpenAppliedTest: (String) -> Unit,
    onSuggestApply: (String) -> Unit,
    onViewAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!uiState.showSection) return
    val p = mockTestPalette()
    val visibleItems = uiState.visibleCarouselItems
    val overflowCount = uiState.carouselOverflowCount
    val hiddenItems = remember(uiState.carouselItems, visibleItems) {
        uiState.carouselItems.filter { item ->
            visibleItems.none { visible -> visible.carouselKey == item.carouselKey }
        }
    }

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
            if (uiState.hasAppliedTests) {
                TextButton(onClick = onViewAll) {
                    Text(
                        text = "View all",
                        color = p.systemBlue,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(
                items = visibleItems,
                key = { it.carouselKey },
            ) { item ->
                val card = item.card
                val loading = catalogLoading && !card.catalogLoaded
                if (loading) {
                    AppliedTestCatalogCardLoading()
                } else {
                    AppliedTestCatalogCard(
                        card = card,
                        onClick = {
                            when (item.kind) {
                                AppliedTestHomeUi.HomeTestCarouselKind.APPLIED ->
                                    onOpenAppliedTest(item.testName)
                                AppliedTestHomeUi.HomeTestCarouselKind.SUGGEST_APPLY ->
                                    onSuggestApply(item.testName)
                            }
                        },
                    )
                }
            }
            if (overflowCount > 0) {
                item(key = "overflow") {
                    AppliedTestCatalogOverflowCard(
                        moreCount = overflowCount,
                        onClick = {
                            when {
                                uiState.hasAppliedTests -> onViewAll()
                                else -> {
                                    val nextSuggest = hiddenItems.firstOrNull {
                                        it.kind == AppliedTestHomeUi.HomeTestCarouselKind.SUGGEST_APPLY
                                    }
                                    if (nextSuggest != null) {
                                        onSuggestApply(nextSuggest.testName)
                                    } else {
                                        onViewAll()
                                    }
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}