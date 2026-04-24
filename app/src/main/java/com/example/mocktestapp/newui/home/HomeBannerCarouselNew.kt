package com.example.mocktestapp.newui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
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

data class HomeCarouselSlide(
    val imageUrl: String,
    val title: String? = null,
    val articleId: String? = null,
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeBannerCarouselNew(
    modifier: Modifier = Modifier,
    /** Number of pager pages; each uses a built-in gradient (cycles every 3 styles). */
    slideCount: Int = 3,
    imageUrls: List<String> = emptyList(),
    slides: List<HomeCarouselSlide> = emptyList(),
    onSlideClick: (HomeCarouselSlide) -> Unit = {},
) {
    val context = LocalContext.current
    val remoteSlides = if (slides.isNotEmpty()) {
        slides.filter { it.imageUrl.isNotBlank() }
    } else {
        imageUrls.filter { it.isNotBlank() }.map { HomeCarouselSlide(imageUrl = it) }
    }
    val totalSlides = if (remoteSlides.isNotEmpty()) remoteSlides.size else slideCount
    if (totalSlides <= 0) return

    val pagerState = rememberPagerState(pageCount = { totalSlides }, initialPage = 0)

    LaunchedEffect(totalSlides) {
        while (isActive) {
            delay(AutoScrollMs)
            val next = (pagerState.currentPage + 1) % totalSlides
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
        if (remoteSlides.isNotEmpty()) {
            val slide = remoteSlides[page]
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(168.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable { onSlideClick(slide) },
            ) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(slide.imageUrl)
                        .crossfade(true)
                        .build(),
                    contentDescription = "Home banner",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(168.dp)
                        .clip(RoundedCornerShape(16.dp)),
                )
                if (!slide.title.isNullOrBlank()) {
                    Text(
                        text = slide.title,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .drawBehind {
                                drawRect(Color.Black.copy(alpha = 0.4f))
                            },
                    )
                }
            }
        } else {
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
}
