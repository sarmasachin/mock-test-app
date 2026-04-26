package com.example.mocktestapp.newui.news

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlin.math.max

/**
 * Same layout as News: gradient scaffold, top app row, hero pager, dotted indicators,
 * section headers, thumbnail list rows, pagination. Used by News, Job alert, Exam alert.
 */
@Composable
fun FeedBrowseScreenNew(
    title: String,
    subtitle: String,
    listSectionSubtitle: String,
    feedIcon: ImageVector,
    items: List<ManualNewsItem>,
    imageSeedPrefix: String,
    onBack: () -> Unit,
    onOpenItem: (id: String) -> Unit,
    modifier: Modifier = Modifier,
    topStoriesSectionLabel: String = "",
    listSectionTitle: String = "",
    categoryMenu: List<String> = emptyList(),
    selectedCategory: String? = null,
    onSelectCategory: ((String) -> Unit)? = null,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val topStories = remember(items) { items.take(3) }
    val topStoryIds = remember(topStories) { topStories.map { it.id }.toSet() }
    val pagerState = rememberPagerState(pageCount = { topStories.size.coerceAtLeast(1) })

    val totalPages = remember(items.size) {
        max(1, (items.size + FeedBrowsePageSize - 1) / FeedBrowsePageSize)
    }
    var pageIndex by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(totalPages) {
        if (pageIndex >= totalPages) {
            pageIndex = max(0, totalPages - 1)
        }
    }
    val pageItems = remember(items, pageIndex, totalPages) {
        val safe = pageIndex.coerceIn(0, totalPages - 1)
        items.drop(safe * FeedBrowsePageSize).take(FeedBrowsePageSize)
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(vertical = 10.dp),
            contentPadding = PaddingValues(bottom = 28.dp),
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                            tint = p.textPrimary,
                        )
                    }
                    Spacer(Modifier.size(4.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = title,
                            color = p.textPrimary,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            text = subtitle,
                            color = p.textSecondary,
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                        )
                    }
                    Icon(
                        imageVector = feedIcon,
                        contentDescription = null,
                        tint = p.accent,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            item { Spacer(Modifier.height(12.dp)) }

            if (categoryMenu.isNotEmpty() && onSelectCategory != null) {
                item {
                    LazyRow(
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(categoryMenu) { category ->
                            val selected = selectedCategory == category
                            Text(
                                text = category,
                                color = if (selected) Color.White else p.accent,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(if (selected) p.accent else Color.Transparent)
                                    .border(1.dp, p.accent.copy(alpha = 0.45f), RoundedCornerShape(999.dp))
                                    .clickable { onSelectCategory(category) }
                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(10.dp)) }
            }

            if (topStories.isNotEmpty()) {
                item {
                    Text(
                        text = topStoriesSectionLabel,
                        color = p.textSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                }
                item {
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(248.dp),
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        pageSpacing = 14.dp,
                    ) { page ->
                        val item = topStories[page]
                        FeedTopStoryCard(
                            item = item,
                            imageSeedPrefix = imageSeedPrefix,
                            onClick = { onOpenItem(item.id) },
                        )
                    }
                }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        repeat(topStories.size) { i ->
                            Box(
                                modifier = Modifier
                                    .padding(horizontal = 3.dp)
                                    .size(if (pagerState.currentPage == i) 8.dp else 6.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (pagerState.currentPage == i) p.accent
                                        else p.textSecondary.copy(alpha = 0.28f),
                                    ),
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(18.dp)) }
            }

            if (listSectionTitle.isNotBlank() || listSectionSubtitle.isNotBlank()) {
                item {
                    Column(Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
                        if (listSectionTitle.isNotBlank()) {
                            Text(
                                text = listSectionTitle,
                                color = p.textSecondary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                            )
                        }
                        if (listSectionSubtitle.isNotBlank()) {
                            Text(
                                text = listSectionSubtitle,
                                color = p.textSecondary.copy(alpha = 0.82f),
                                fontSize = 11.sp,
                                lineHeight = 14.sp,
                                modifier = Modifier.padding(top = if (listSectionTitle.isNotBlank()) 4.dp else 0.dp),
                            )
                        }
                    }
                }
            }

            items(pageItems, key = { it.id }) { item ->
                Column(Modifier.padding(horizontal = 20.dp, vertical = 7.dp)) {
                    FeedListRow(
                        item = item,
                        imageSeedPrefix = imageSeedPrefix,
                        alsoInTopCarousel = item.id in topStoryIds,
                        onClick = { onOpenItem(item.id) },
                    )
                }
            }

            item {
                FeedPaginationBar(
                    pageIndex = pageIndex.coerceIn(0, totalPages - 1),
                    totalPages = totalPages,
                    onPrev = { pageIndex = max(0, pageIndex - 1) },
                    onNext = { pageIndex = minOf(totalPages - 1, pageIndex + 1) },
                )
            }
        }
    }
}

@Composable
private fun FeedPaginationBar(
    pageIndex: Int,
    totalPages: Int,
    onPrev: () -> Unit,
    onNext: () -> Unit,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(
            onClick = onPrev,
            enabled = pageIndex > 0,
        ) {
            Text("Previous", color = if (pageIndex > 0) p.accent else p.textSecondary.copy(alpha = 0.4f))
        }
        Text(
            text = "Page ${pageIndex + 1} of $totalPages",
            color = p.textPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
        TextButton(
            onClick = onNext,
            enabled = pageIndex < totalPages - 1,
        ) {
            Text(
                "Next",
                color = if (pageIndex < totalPages - 1) p.accent else p.textSecondary.copy(alpha = 0.4f),
            )
        }
    }
}

@Composable
private fun FeedTopStoryCard(
    item: ManualNewsItem,
    imageSeedPrefix: String,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val context = LocalContext.current
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(248.dp)
            .clip(shape)
            .clickable(onClick = onClick),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(item.imageUrl(900, 520, imageSeedPrefix))
                    .crossfade(280)
                    .build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Black.copy(alpha = 0.05f),
                                Color.Black.copy(alpha = 0.72f),
                            ),
                        ),
                    ),
            )
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .padding(16.dp),
            ) {
                CategoryPill(
                    text = item.category,
                    accent = Color.White,
                    borderAlpha = 0.55f,
                    onHeroImage = true,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = item.headline,
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.ExtraBold,
                    lineHeight = 22.sp,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = item.dateLabel,
                    color = Color.White.copy(alpha = 0.85f),
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun FeedListRow(
    item: ManualNewsItem,
    imageSeedPrefix: String,
    alsoInTopCarousel: Boolean,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(
                width = 1.dp,
                color = if (alsoInTopCarousel) p.accent.copy(alpha = 0.35f) else p.border.copy(alpha = 0.14f),
                shape = shape,
            )
            .background(p.surface)
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (alsoInTopCarousel) {
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(96.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(
                        Brush.verticalGradient(
                            listOf(p.accent, p.systemBlue.copy(alpha = 0.85f)),
                        ),
                    ),
            )
            Spacer(Modifier.width(10.dp))
        }
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data(item.imageUrl(240, 240, imageSeedPrefix))
                .crossfade(220)
                .build(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .width(102.dp)
                .height(96.dp)
                .clip(RoundedCornerShape(10.dp)),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.headline,
                color = p.textPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                lineHeight = 20.sp,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = item.summary,
                color = p.textSecondary,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = item.dateLabel,
                color = p.textSecondary.copy(alpha = 0.85f),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}
