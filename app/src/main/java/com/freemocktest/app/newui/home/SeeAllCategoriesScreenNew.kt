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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.activity.compose.BackHandler
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.TextButton
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.util.UserInterestUtils
import kotlinx.coroutines.launch
import com.freemocktest.app.newui.theme.palette.categoryLabelTintColor
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import coil.compose.AsyncImage
private const val NO_EXAMS_MESSAGE = "Mock Test Exam Not Available"
private const val LOAD_ERROR_MESSAGE = "Couldn't load exam categories. Check your connection and try again."

private data class ExamHierarchyNode(
    val label: String,
    val iconKey: String? = null,
    val children: List<ExamHierarchyNode> = emptyList(),
)

/**
 * Central (all-India) categories use a shorter path: when an exam group has exactly one test,
 * Level 3 is skipped and Apply opens with that test name. State and other Level 1 values
 * always use the full 3-step hierarchy.
 */
private fun normalizeExamLevel1Key(label: String): String =
    label.trim().lowercase().replace(Regex("\\s+"), " ")

private fun isStateExamLevel1(label: String): Boolean {
    val key = normalizeExamLevel1Key(label)
    if (key.isBlank()) return false
    return key == "state" ||
        key == "state exams" ||
        key == "state exam" ||
        key.startsWith("state ")
}

private fun isCentralExamLevel1(label: String): Boolean {
    val key = normalizeExamLevel1Key(label)
    if (key.isBlank()) return false
    if (isStateExamLevel1(label)) return false
    return key == "central" ||
        key == "central exams" ||
        key == "central exam" ||
        key.startsWith("central ") ||
        key == "all india" ||
        key.startsWith("all india ") ||
        key == "national" ||
        key == "national level" ||
        key.startsWith("national ")
}

/** Level 3 test name used for Apply when this node has exactly one enabled test child. */
private fun centralDirectApplyTarget(node: ExamHierarchyNode): String? {
    val sole = node.children.singleOrNull() ?: return null
    val name = sole.label.trim()
    return name.takeIf { it.isNotEmpty() }
}

private fun handleExamCategoryPick(
    hierarchy: List<ExamHierarchyNode>,
    level1: String?,
    level2: String?,
    picked: String,
    onOpenCategory: (String) -> Unit,
    setLevel1: (String?) -> Unit,
    setLevel2: (String?) -> Unit,
) {
    val trimmedPicked = picked.trim()
    if (trimmedPicked.isEmpty()) return

    when {
        level1 == null -> {
            setLevel1(trimmedPicked)
        }
        level2 == null -> {
            if (isCentralExamLevel1(level1)) {
                val l1Node = hierarchy.firstOrNull { it.label == level1 }
                val l2Node = l1Node?.children?.firstOrNull { it.label == trimmedPicked }
                val applyTarget = l2Node?.let { centralDirectApplyTarget(it) }
                if (applyTarget != null) {
                    onOpenCategory(applyTarget)
                    setLevel1(null)
                    setLevel2(null)
                    return
                }
            }
            setLevel2(trimmedPicked)
        }
        else -> onOpenCategory(trimmedPicked)
    }
}

private fun buildExamHierarchy(remote: List<ContentRepository.ExamCategoryItemRemote>): List<ExamHierarchyNode> {
    if (remote.isEmpty()) return emptyList()
    val grouped = remote.groupBy { it.level1.trim() }
    return grouped.map { (l1, level1Rows) ->
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

/** Keep branches that lead to at least one interest-matching level3 leaf. */
private fun filterExamHierarchyForInterests(
    nodes: List<ExamHierarchyNode>,
    interests: List<String>,
    showAllTests: Boolean,
): List<ExamHierarchyNode> {
    if (showAllTests || UserInterestUtils.normalizeInterestSubcategories(interests).isEmpty()) {
        return nodes
    }
    return nodes.mapNotNull { node ->
        if (node.children.isEmpty()) {
            if (UserInterestUtils.subcategoryMatchesAnyInterest(node.label, interests)) node else null
        } else {
            val filteredChildren = filterExamHierarchyForInterests(node.children, interests, showAllTests)
            if (filteredChildren.isEmpty()) null else node.copy(children = filteredChildren)
        }
    }
}

@Composable
fun SeeAllCategoriesScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onOpenCategory: (String) -> Unit,
    showAppBarBack: Boolean = true,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val scope = rememberCoroutineScope()
    val userInterests by AppPreferencesRepository.loginPickedSubcategories.collectAsState(initial = emptyList())
    val showAllTests by AppPreferencesRepository.showAllTestsCatalog.collectAsState(initial = false)
    val interestFilterActive = remember(userInterests, showAllTests) {
        !showAllTests && UserInterestUtils.normalizeInterestSubcategories(userInterests).isNotEmpty()
    }
    val preloadedItems = remember { ContentRepository.peekExamCategoriesMemory() }
    var fullHierarchy by remember {
        mutableStateOf(preloadedItems?.let { buildExamHierarchy(it) } ?: emptyList())
    }
    val hierarchy = remember(fullHierarchy, userInterests, showAllTests) {
        filterExamHierarchyForInterests(fullHierarchy, userInterests, showAllTests)
    }
    var hierarchyFetchError by remember { mutableStateOf(false) }
    var hierarchyReloadKey by remember { mutableIntStateOf(0) }
    var level1 by remember { mutableStateOf<String?>(null) }
    var level2 by remember { mutableStateOf<String?>(null) }
    var didApplyPreload by remember { mutableStateOf(false) }

    fun applyRemoteItems(remote: List<ContentRepository.ExamCategoryItemRemote>) {
        fullHierarchy = buildExamHierarchy(remote.filter { it.enabled })
        hierarchyFetchError = false
    }

    LaunchedEffect(showAllTests) {
        level1 = null
        level2 = null
    }

    androidx.compose.runtime.SideEffect {
        if (!didApplyPreload && preloadedItems != null) {
            applyRemoteItems(preloadedItems)
            didApplyPreload = true
        }
    }

    LaunchedEffect(hierarchyReloadKey) {
        runCatching { ContentRepository.loadCachedExamCategories() }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
            ?.let { applyRemoteItems(it) }
        val remote = runCatching { ContentRepository.loadExamCategories(forceRefresh = true) }.getOrNull()
        if (remote != null) {
            if (remote.isNotEmpty()) {
                applyRemoteItems(remote)
            } else if (hierarchy.isEmpty()) {
                fullHierarchy = emptyList()
                hierarchyFetchError = false
            }
        } else if (fullHierarchy.isEmpty()) {
            hierarchyFetchError = true
        }
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

    val showEmptyMessage =
        !hierarchyFetchError && hierarchy.isEmpty() && level1 == null && level2 == null
    val showInterestFilterEmpty =
        showEmptyMessage && interestFilterActive && fullHierarchy.isNotEmpty()
    val showLoadError = hierarchyFetchError && fullHierarchy.isEmpty()
    val showBackInAppBar = showAppBarBack || level1 != null || level2 != null

    val shownItems = when {
        level1 == null -> hierarchy
        level2 == null -> hierarchy.firstOrNull { it.label == level1 }?.children ?: emptyList()
        else -> hierarchy.firstOrNull { it.label == level1 }?.children?.firstOrNull { it.label == level2 }?.children ?: emptyList()
    }
    val rows = shownItems.chunked(2)
    val title = when {
        level1 == null && interestFilterActive -> "Mere exams"
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
            if (UserInterestUtils.normalizeInterestSubcategories(userInterests).isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                InterestCatalogToggleRow(
                    showAllTests = showAllTests,
                    onToggle = {
                        scope.launch {
                            AppPreferencesRepository.setShowAllTestsCatalog(!showAllTests)
                        }
                    },
                )
            }
            Spacer(Modifier.height(16.dp))

            if (showInterestFilterEmpty) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(horizontal = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = "Aapke chune exams is list me match nahi kar rahe.",
                        color = p.textSecondary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(10.dp))
                    TextButton(
                        onClick = {
                            scope.launch {
                                AppPreferencesRepository.setShowAllTestsCatalog(true)
                            }
                        },
                    ) {
                        Text(
                            text = "Saare tests dekho",
                            color = p.systemBlue,
                            fontWeight = FontWeight.Bold,
                        )
                    }
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
            } else if (showLoadError) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(horizontal = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = LOAD_ERROR_MESSAGE,
                        color = p.textSecondary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = { hierarchyReloadKey += 1 },
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = p.primaryButton,
                            contentColor = p.onPrimaryButton,
                        ),
                    ) {
                        Text("Retry", fontWeight = FontWeight.Bold)
                    }
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
                                handleExamCategoryPick(
                                    hierarchy = hierarchy,
                                    level1 = level1,
                                    level2 = level2,
                                    picked = picked,
                                    onOpenCategory = onOpenCategory,
                                    setLevel1 = { level1 = it },
                                    setLevel2 = { level2 = it },
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InterestCatalogToggleRow(
    showAllTests: Boolean,
    onToggle: () -> Unit,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (showAllTests) "Saare exams dikh rahe hain" else "Sirf aapke chune exams",
            color = p.textSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onToggle) {
            Text(
                text = if (showAllTests) "Sirf mere tests" else "Saare tests dekho",
                color = p.systemBlue,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
            )
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
    val labelTint = remember(text) { categoryLabelTintColor(text) }
    val cardBg = remember(labelTint, p.surface) { lerp(p.surface, labelTint, 0.12f) }
    val borderColor = remember(labelTint) { labelTint.copy(alpha = 0.22f) }
    val iconBadgeBg = remember(labelTint, p.surface) { lerp(p.surface, labelTint, 0.22f) }
    val iconBadgeBorder = remember(labelTint) { labelTint.copy(alpha = 0.32f) }
    val iconVectorTint = remember(labelTint, p.accent) { lerp(p.accent, labelTint, 0.55f) }
    val remoteIconUrl = remember(iconKey) { iconKey?.trim()?.takeIf { it.startsWith("http://") || it.startsWith("https://") } }
    val icon = remember(iconKey, text) { resolveCategoryIcon(iconKey = iconKey, label = text) }
    Card(
        modifier = modifier
            .height(76.dp)
            .clip(shape)
            .border(
                1.dp,
                borderColor,
                shape,
            )
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = cardBg),
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
                    .background(iconBadgeBg)
                    .border(1.dp, iconBadgeBorder, RoundedCornerShape(999.dp)),
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
                        tint = iconVectorTint,
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
