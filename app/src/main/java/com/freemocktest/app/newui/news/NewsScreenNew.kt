package com.freemocktest.app.newui.news

import android.graphics.drawable.Drawable
import android.graphics.drawable.LevelListDrawable
import android.text.Html
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Newspaper
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.freemocktest.app.data.ContentRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.supervisorScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.widget.TextView
import android.text.method.LinkMovementMethod
import androidx.core.text.HtmlCompat
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import coil.target.Target
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette

const val NewsFeedImageSeedPrefix = "mocktest_news"

private const val NEWS_LOAD_ERROR_MESSAGE =
    "Couldn't load news. Check your connection and try again."

@Composable
fun NewsScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onOpenArticle: (newsId: String) -> Unit,
) {
    var articles by remember { mutableStateOf(emptyList<ManualNewsItem>()) }
    var newsMenuCategories by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var feedLoading by remember { mutableStateOf(true) }
    var feedLoadFailed by remember { mutableStateOf(false) }
    var newsFeedReloadKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(newsFeedReloadKey) {
        feedLoadFailed = false
        try {
            runCatching { ContentRepository.loadCachedHomeContent() }.getOrNull()?.let { cachedHome ->
                val menu = cachedHome.newsCategoryMenu
                    .filter { it.isNotBlank() }
                    .distinctBy { it.lowercase() }
                if (menu.isNotEmpty()) {
                    newsMenuCategories = menu
                }
            }
            val cachedArticles = runCatching { ContentRepository.loadCachedNewsFeed("all") }.getOrDefault(emptyList())
            if (cachedArticles.isNotEmpty()) {
                articles = cachedArticles
            }
            val hadArticlesFromCache = cachedArticles.isNotEmpty()
            feedLoading = !hadArticlesFromCache
            supervisorScope {
                val feedDeferred = async { runCatching { ContentRepository.loadNewsFeed("all") } }
                val menuDeferred = async { runCatching { ContentRepository.loadHomeContent() } }
                val feedOutcome = feedDeferred.await()
                val menuOutcome = menuDeferred.await()
                articles = if (feedOutcome.isSuccess) {
                    feedOutcome.getOrNull() ?: emptyList()
                } else if (hadArticlesFromCache) {
                    articles
                } else {
                    emptyList()
                }
                val netMenu = menuOutcome.getOrNull()
                    ?.newsCategoryMenu
                    ?.filter { it.isNotBlank() }
                    .orEmpty()
                    .distinctBy { it.lowercase() }
                if (netMenu.isNotEmpty()) {
                    newsMenuCategories = netMenu
                }
                feedLoadFailed = feedOutcome.isFailure && articles.isEmpty()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            if (articles.isEmpty()) {
                newsMenuCategories = emptyList()
                feedLoadFailed = true
            }
        } finally {
            feedLoading = false
        }
    }
    val derivedCategories = remember(articles) {
        articles.map { it.category.trim() }.filter { it.isNotBlank() }.distinctBy { it.lowercase() }
    }
    val menuCategories = remember(newsMenuCategories, derivedCategories) {
        (newsMenuCategories + derivedCategories).distinctBy { it.lowercase() }
    }
    val visibleArticles = remember(articles, selectedCategory) {
        if (selectedCategory.isNullOrBlank()) {
            articles
        } else {
            articles.filter { it.category.equals(selectedCategory ?: "", ignoreCase = true) }
        }
    }
    FeedBrowseScreenNew(
        title = "News",
        subtitle = "",
        listSectionTitle = "",
        listSectionSubtitle = "",
        feedIcon = Icons.Rounded.Newspaper,
        items = visibleArticles,
        imageSeedPrefix = NewsFeedImageSeedPrefix,
        loading = feedLoading && articles.isEmpty() && !feedLoadFailed,
        onBack = onBack,
        onOpenItem = onOpenArticle,
        categoryMenu = menuCategories,
        selectedCategory = selectedCategory,
        onSelectCategory = { selectedCategory = it },
        modifier = modifier,
        loadFailed = feedLoadFailed,
        loadFailedMessage = NEWS_LOAD_ERROR_MESSAGE,
        onRetryLoad = { newsFeedReloadKey += 1 },
    )
}

@Composable
fun NewsArticleDetailScreen(
    item: ManualNewsItem,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    imageSeedPrefix: String = NewsFeedImageSeedPrefix,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val context = LocalContext.current
    val scroll = rememberScrollState()

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(scroll),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
            }

            Column(Modifier.padding(horizontal = 20.dp)) {
                Text(
                    text = item.headline,
                    color = p.textPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.ExtraBold,
                    lineHeight = 30.sp,
                )
                Spacer(Modifier.height(12.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CategoryPill(text = item.category, accent = p.accent)
                    Text(
                        text = item.dateLabel,
                        color = p.textSecondary,
                        fontSize = 13.sp,
                    )
                }
                Spacer(Modifier.height(16.dp))
            }

            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(item.imageUrl(1200, 675, imageSeedPrefix))
                    .crossfade(320)
                    .build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f),
            )

            AndroidView(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                factory = { ctx ->
                    TextView(ctx).apply {
                        movementMethod = LinkMovementMethod.getInstance()
                        textSize = 16f
                        setTextColor(p.textPrimary.toArgb())
                        setLinkTextColor(p.accent.toArgb())
                        setLineSpacing(6f * ctx.resources.displayMetrics.density, 1f)
                    }
                },
                update = { tv ->
                    tv.text = HtmlCompat.fromHtml(
                        item.body.ifBlank { " " },
                        HtmlCompat.FROM_HTML_MODE_COMPACT,
                        CoilTextViewImageGetter(tv),
                        null,
                    )
                    tv.setTextColor(p.textPrimary.toArgb())
                    tv.setLinkTextColor(p.accent.toArgb())
                },
            )
            Spacer(Modifier.height(32.dp))
        }
    }
}

private class CoilTextViewImageGetter(
    private val textView: TextView,
) : Html.ImageGetter {
    override fun getDrawable(source: String?): Drawable {
        val placeholder = LevelListDrawable().apply {
            // Keep temporary 1x1 bounds so layout can proceed before image load.
            setBounds(0, 0, 1, 1)
        }
        val url = source?.trim().orEmpty()
        if (url.isBlank()) return placeholder
        val request = ImageRequest.Builder(textView.context)
            .data(url)
            .target(
                object : Target {
                    override fun onSuccess(result: Drawable) {
                        val intrinsicWidth = result.intrinsicWidth.coerceAtLeast(1)
                        val intrinsicHeight = result.intrinsicHeight.coerceAtLeast(1)
                        val maxWidth = (textView.width - textView.paddingLeft - textView.paddingRight).coerceAtLeast(1)
                        val finalWidth = if (maxWidth > 1) maxWidth else intrinsicWidth
                        val finalHeight = (intrinsicHeight * (finalWidth.toFloat() / intrinsicWidth.toFloat()))
                            .toInt()
                            .coerceAtLeast(1)
                        result.setBounds(0, 0, finalWidth, finalHeight)
                        placeholder.addLevel(1, 1, result)
                        placeholder.setBounds(0, 0, finalWidth, finalHeight)
                        placeholder.level = 1
                        // Re-assigning text forces TextView to redraw updated image spans.
                        textView.text = textView.text
                    }

                    override fun onError(error: Drawable?) {
                        placeholder.level = 0
                    }
                },
            )
            .build()
        textView.context.imageLoader.enqueue(request)
        return placeholder
    }
}

@Composable
fun NewsArticleDetailMissingScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("This story could not be found.", color = p.textPrimary, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onBack,
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
            ) {
                Text("Go back", color = Color.White)
            }
        }
    }
}
