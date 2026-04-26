package com.example.mocktestapp.newui.news

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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.example.mocktestapp.data.ContentRepository
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

const val NewsFeedImageSeedPrefix = "mocktest_news"

@Composable
fun NewsScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onOpenArticle: (newsId: String) -> Unit,
) {
    var articles by remember { mutableStateOf(ManualNewsContent.items) }
    var newsMenuCategories by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        articles = ContentRepository.loadNewsFeed("news")
        newsMenuCategories = ContentRepository.loadHomeContent()
            ?.newsCategoryMenu
            ?.filter { it.isNotBlank() }
            .orEmpty()
            .distinctBy { it.lowercase() }
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
        onBack = onBack,
        onOpenItem = onOpenArticle,
        categoryMenu = menuCategories,
        selectedCategory = selectedCategory,
        onSelectCategory = { selectedCategory = it },
        modifier = modifier,
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

            Text(
                text = item.body,
                color = p.textPrimary,
                fontSize = 16.sp,
                lineHeight = 25.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 20.dp),
            )
            Spacer(Modifier.height(32.dp))
        }
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
