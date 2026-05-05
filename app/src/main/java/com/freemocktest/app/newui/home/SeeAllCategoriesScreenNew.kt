package com.freemocktest.app.newui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.Book
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.activity.compose.BackHandler
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import coil.compose.AsyncImage

private const val NO_EXAMS_MESSAGE = "Mock Test Exam Not Available"

private data class ExamHierarchyNode(
    val label: String,
    val iconKey: String? = null,
    val children: List<ExamHierarchyNode> = emptyList(),
)

@Composable
fun SeeAllCategoriesScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onOpenCategory: (String) -> Unit,
    showAppBarBack: Boolean = true,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    var hierarchy by remember { mutableStateOf<List<ExamHierarchyNode>>(emptyList()) }
    var hierarchyLoaded by remember { mutableStateOf(false) }
    var level1 by remember { mutableStateOf<String?>(null) }
    var level2 by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val remote = ContentRepository.loadExamCategories().filter { it.enabled }
        if (remote.isNotEmpty()) {
            val grouped = remote.groupBy { it.level1.trim() }
            hierarchy = grouped.map { (l1, level1Rows) ->
                ExamHierarchyNode(
                    label = l1,
                    children = level1Rows.groupBy { it.level2.trim() }.map { (l2, level2Rows) ->
                        ExamHierarchyNode(
                            label = l2,
                            iconKey = level2Rows.firstNotNullOfOrNull { it.iconKey?.trim()?.takeIf(String::isNotEmpty) },
                            children = level2Rows.map {
                                ExamHierarchyNode(
                                    label = it.level3.trim(),
                                    iconKey = it.iconKey?.trim()?.takeIf(String::isNotEmpty),
                                )
                            }.distinctBy { it.label },
                        )
                    }.sortedBy { it.label },
                    iconKey = level1Rows.firstNotNullOfOrNull { it.iconKey?.trim()?.takeIf(String::isNotEmpty) },
                )
            }.sortedBy { it.label }
        } else {
            hierarchy = emptyList()
        }
        hierarchyLoaded = true
    }

    val navigateUp: () -> Unit = {
        when {
            level2 != null -> {
                level2 = null
            }
            level1 != null -> {
                level1 = null
            }
            else -> {
                onBack()
            }
        }
    }

    BackHandler(onBack = navigateUp)

    val showEmptyMessage = hierarchyLoaded && hierarchy.isEmpty() && level1 == null && level2 == null
    val showBackInAppBar = showAppBarBack || level1 != null || level2 != null

    val shownItems = when {
        level1 == null -> hierarchy
        level2 == null -> hierarchy.firstOrNull { it.label == level1 }?.children ?: emptyList()
        else -> hierarchy.firstOrNull { it.label == level1 }?.children?.firstOrNull { it.label == level2 }?.children ?: emptyList()
    }
    val rows = shownItems.chunked(2)
    val title = when {
        level1 == null -> "Exam Categories"
        level2 == null -> level1 ?: "Exam Categories"
        else -> level2 ?: "Exam Categories"
    }
    val breadcrumb = listOfNotNull(level1, level2).joinToString(" > ")

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            TopBar(
                onBack = navigateUp,
                title = title,
                showBack = showBackInAppBar,
            )
            if (breadcrumb.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = breadcrumb,
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(16.dp))

            if (!hierarchyLoaded) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = p.accent)
                }
            } else if (showEmptyMessage) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = NO_EXAMS_MESSAGE,
                        color = p.textSecondary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(rows) { _, rowCats ->
                        AllCategoryRow(
                            left = rowCats.getOrNull(0)?.label.orEmpty(),
                            leftIconKey = rowCats.getOrNull(0)?.iconKey,
                            right = rowCats.getOrNull(1)?.label,
                            rightIconKey = rowCats.getOrNull(1)?.iconKey,
                            onOpenCategory = { picked ->
                                if (level1 == null) {
                                    level1 = picked
                                    return@AllCategoryRow
                                }
                                if (level2 == null) {
                                    level2 = picked
                                    return@AllCategoryRow
                                }
                                onOpenCategory(picked)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TopBar(
    onBack: () -> Unit,
    title: String,
    showBack: Boolean = true,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showBack) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Back",
                    tint = p.textPrimary,
                )
            }
            Spacer(Modifier.width(6.dp))
        } else {
            Spacer(Modifier.width(4.dp))
        }
        Text(
            text = title,
            color = p.textPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

@Composable
private fun AllCategoryRow(
    left: String,
    leftIconKey: String?,
    right: String?,
    rightIconKey: String?,
    onOpenCategory: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CategorySquare(text = left, iconKey = leftIconKey, onClick = { onOpenCategory(left) }, modifier = Modifier.weight(1f))
        if (right != null) {
            CategorySquare(text = right, iconKey = rightIconKey, onClick = { onOpenCategory(right) }, modifier = Modifier.weight(1f))
        } else {
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun CategorySquare(
    text: String,
    iconKey: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    val remoteIconUrl = remember(iconKey) { iconKey?.trim()?.takeIf { it.startsWith("http://") || it.startsWith("https://") } }
    val icon = remember(iconKey, text) { resolveCategoryIcon(iconKey = iconKey, label = text) }
    Card(
        modifier = modifier
            .height(76.dp)
            .clip(shape)
            .background(p.surface)
            .border(
                1.dp,
                p.border.copy(alpha = 0.16f),
                shape,
            )
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(p.border.copy(alpha = 0.12f))
                    .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(999.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (remoteIconUrl != null) {
                    AsyncImage(
                        model = remoteIconUrl,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = p.accent,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            Spacer(Modifier.width(10.dp))
            Text(
                text = text,
                color = p.textPrimary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                lineHeight = 16.sp,
                maxLines = 2,
            )
        }
    }
}

private fun resolveCategoryIcon(
    iconKey: String?,
    label: String,
): androidx.compose.ui.graphics.vector.ImageVector {
    val key = iconKey?.trim()?.lowercase().orEmpty()
    val text = label.trim().lowercase()
    return when {
        listOf("math", "calculate", "quant", "arithmetic", "algebra")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Calculate
        listOf("reasoning", "logic", "mind", "computer", "tech", "software", "coding", "startup")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Memory
        listOf("it", "developer", "data", "ai", "ml")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Memory
        listOf("english", "language", "ctet", "ugc", "net")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Language
        listOf("verbal", "typing", "steno")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Language
        listOf("gk", "general", "public", "state", "govt", "ssc", "upsc", "bank", "railway", "defence", "police")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Public
        listOf("government", "central", "ministerial", "clerical", "groupd", "ntpc", "patwari", "constable", "subinspector", "nda", "army", "airforce", "navy", "pcs")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Public
        listOf("science", "neet", "gate", "csir")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Science
        listOf("hospital", "pharma", "lab", "nursing", "medical")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Science
        listOf("law", "legal", "judiciary", "pcs", "clat")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Gavel
        listOf("book", "study", "interview", "preparation", "skill", "certification", "diploma")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.Book
        listOf("school", "exam", "entrance", "class", "cat", "jee", "cuet", "iit", "jam", "gmat", "ca", "cs", "jaib", "jaiib", "teacher", "commerce", "accounts", "management", "b com", "bcom", "cma")
            .any { key.contains(it) || text.contains(it) } -> Icons.Outlined.School
        listOf("history", "menu", "syllabus")
            .any { key.contains(it) || text.contains(it) } -> Icons.AutoMirrored.Outlined.MenuBook
        else -> Icons.Outlined.Star
    }
}
