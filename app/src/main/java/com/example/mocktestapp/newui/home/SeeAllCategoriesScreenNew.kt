package com.example.mocktestapp.newui.home

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
import androidx.compose.material.icons.outlined.Book
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

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

    val fallbackHierarchy = listOf(
        ExamHierarchyNode(
            label = "State Exams",
            children = listOf(
                ExamHierarchyNode(
                    label = "MP Govt",
                    children = listOf(
                        ExamHierarchyNode(label = "Patwari"),
                        ExamHierarchyNode(label = "Police Constable"),
                    ),
                ),
                ExamHierarchyNode(
                    label = "UP Govt",
                    children = listOf(ExamHierarchyNode(label = "Lekhpal")),
                ),
            ),
        ),
        ExamHierarchyNode(
            label = "Central Exams",
            children = listOf(
                ExamHierarchyNode(
                    label = "SSC",
                    children = listOf(
                        ExamHierarchyNode(label = "CHSL"),
                        ExamHierarchyNode(label = "CGL"),
                    ),
                ),
            ),
        ),
    )
    var hierarchy by remember { mutableStateOf(fallbackHierarchy) }
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
        }
    }

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
                onBack = onBack,
                title = title,
                showBack = showAppBarBack,
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

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
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
            if (level1 != null || level2 != null) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Back one level",
                    color = p.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable {
                            if (level2 != null) level2 = null else level1 = null
                        }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                )
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
                    imageVector = Icons.Rounded.ArrowBack,
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
    val shape = RoundedCornerShape(18.dp)
    val icon = remember(iconKey) { resolveCategoryIcon(iconKey) }
    Card(
        modifier = modifier
            .height(92.dp)
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
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(horizontal = 8.dp),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = p.accent,
                    modifier = Modifier.size(24.dp),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = text,
                    color = p.textPrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp,
                )
            }
        }
    }
}

private fun resolveCategoryIcon(iconKey: String?): androidx.compose.ui.graphics.vector.ImageVector {
    return when (iconKey?.trim()?.lowercase()) {
        "math", "calculate" -> Icons.Outlined.Calculate
        "reasoning", "logic", "mind" -> Icons.Outlined.Memory
        "english", "language" -> Icons.Outlined.Language
        "gk", "general", "public" -> Icons.Outlined.Public
        "science" -> Icons.Outlined.Science
        "computer", "tech" -> Icons.Outlined.Memory
        "history" -> Icons.Outlined.MenuBook
        "law", "legal" -> Icons.Outlined.Gavel
        "book", "study" -> Icons.Outlined.Book
        "school", "exam" -> Icons.Outlined.School
        null, "" -> Icons.Outlined.Star
        else -> Icons.Outlined.Star
    }
}
