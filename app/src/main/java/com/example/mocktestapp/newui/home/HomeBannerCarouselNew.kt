package com.example.mocktestapp.newui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/**
 * Home banner slides use Compose gradients (not `painterResource`): shape XML drawables
 * are not supported by Compose painters — only VectorDrawable and raster (PNG/WebP).
 */
private val BannerBlueHorizontal = listOf(Color(0xFF0284C7), Color(0xFF0EA5E9))
private val BannerCyanVertical = listOf(Color(0xFF0891B2), Color(0xFF22D3EE))
private val BannerSkyDiagonal = listOf(Color(0xFF38BDF8), Color(0xFF2563EB))

private fun bannerBrushForPageInScope(page: Int, width: Float, height: Float): Brush {
    return when (page % 3) {
        0 -> Brush.horizontalGradient(BannerBlueHorizontal)
        1 -> Brush.verticalGradient(BannerCyanVertical)
        else -> Brush.linearGradient(
            BannerSkyDiagonal,
            start = Offset(0f, height),
            end = Offset(width, 0f),
        )
    }
}

private const val AutoScrollMs = 4000L

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeBannerCarouselNew(
    modifier: Modifier = Modifier,
    /** Number of pager pages; each uses a built-in gradient (cycles every 3 styles). */
    slideCount: Int = 3,
) {
    if (slideCount <= 0) return

    val pagerState = rememberPagerState(pageCount = { slideCount }, initialPage = 0)

    LaunchedEffect(slideCount) {
        while (isActive) {
            delay(AutoScrollMs)
            val next = (pagerState.currentPage + 1) % slideCount
            runCatching { pagerState.animateScrollToPage(next) }
                .onFailure { Log.w("HomeBanner", "Auto-scroll failed", it) }
        }
    }

    HorizontalPager(
        state = pagerState,
        modifier = modifier
            .fillMaxWidth()
            .height(168.dp),
        contentPadding = PaddingValues(horizontal = 8.dp),
        pageSpacing = 12.dp,
        beyondViewportPageCount = 1,
    ) { page ->
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(168.dp)
                .clip(RoundedCornerShape(16.dp))
                .drawBehind {
                    drawRect(
                        brush = bannerBrushForPageInScope(
                            page,
                            size.width,
                            size.height,
                        ),
                    )
                },
        ) {}
    }
}
