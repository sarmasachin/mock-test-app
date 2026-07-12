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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.TextButton
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.util.UserInterestUtils
import com.freemocktest.app.util.AllIndiaExamVisualCatalog
import com.freemocktest.app.util.HimachalExamVisualCatalog
import com.freemocktest.app.util.IndianStateVisualCatalog
import com.freemocktest.app.util.StateExamDynamicCatalog
import kotlinx.coroutines.launch
import java.util.Locale
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
private fun soleChildApplyTarget(node: ExamHierarchyNode): String? {
    val sole = node.children.singleOrNull() ?: return null
    val name = sole.label.trim()
    return name.takeIf { it.isNotEmpty() }
}

private fun directApplyTargetForLevel2Pick(
    hierarchy: List<ExamHierarchyNode>,
    level1: String,
    level2Pick: String,
): String? {
    val l1Node = hierarchy.firstOrNull { it.label == level1 } ?: return null
    val l2Node = l1Node.children.firstOrNull { it.label == level2Pick.trim() } ?: return null
    return soleChildApplyTarget(l2Node)
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
            if (isCentralExamLevel1(level1) || isStateExamLevel1(level1)) {
                val applyTarget = directApplyTargetForLevel2Pick(hierarchy, level1, trimmedPicked)
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

private enum class ExamCatalogScopeTab {
    State,
    AllIndia,
}

private fun findLevel1Node(
    hierarchy: List<ExamHierarchyNode>,
    predicate: (String) -> Boolean,
): ExamHierarchyNode? = hierarchy.firstOrNull { predicate(it.label) }

private fun findStateChildNode(
    stateNode: ExamHierarchyNode?,
    drill: String,
): ExamHierarchyNode? {
    if (stateNode == null || drill.isBlank()) return null
    val trimmed = drill.trim()
    return stateNode.children.firstOrNull { it.label.trim().equals(trimmed, ignoreCase = true) }
        ?: stateNode.children.firstOrNull {
            IndianStateVisualCatalog.resolveSlug(it.label, it.iconKey) ==
                IndianStateVisualCatalog.resolveSlug(trimmed, null)
        }
}

private fun filterRemoteExamCategoriesForInterests(
    items: List<ContentRepository.ExamCategoryItemRemote>,
    interests: List<String>,
    showAllTests: Boolean,
): List<ContentRepository.ExamCategoryItemRemote> {
    if (showAllTests || UserInterestUtils.normalizeInterestSubcategories(interests).isEmpty()) {
        return items
    }
    return items.filter { UserInterestUtils.subcategoryMatchesAnyInterest(it.level3, interests) }
}

private fun filterStateExamSectionsForInterests(
    sections: List<Pair<StateExamDynamicCatalog.SectionVisual, List<StateExamDynamicCatalog.TestCardModel>>>,
    interests: List<String>,
    showAllTests: Boolean,
): List<Pair<StateExamDynamicCatalog.SectionVisual, List<StateExamDynamicCatalog.TestCardModel>>> {
    if (showAllTests || UserInterestUtils.normalizeInterestSubcategories(interests).isEmpty()) {
        return sections
    }
    return sections.mapNotNull { (section, tests) ->
        val filtered = tests.filter {
            UserInterestUtils.subcategoryMatchesAnyInterest(it.applyTestName, interests)
        }
        if (filtered.isEmpty()) null else section to filtered
    }
}

private fun buildHimachalSectionsAsGeneric(
    stateNode: ExamHierarchyNode?,
    stateDrill: String?,
): List<Pair<StateExamDynamicCatalog.SectionVisual, List<StateExamDynamicCatalog.TestCardModel>>> {
    val order = HimachalExamVisualCatalog.sectionOrder()
    return buildHimachalSections(stateNode, stateDrill).map { (section, tests) ->
        StateExamDynamicCatalog.SectionVisual(
            slug = section.slug,
            title = section.titleHindi,
            sortOrder = order.indexOf(section.slug).coerceAtLeast(0),
            accentColor = section.accentColor,
            hoverBackground = section.hoverBackground,
            icon = section.icon,
        ) to tests.map { test ->
            StateExamDynamicCatalog.TestCardModel(
                applyTestName = test.applyTestName,
                iconKey = test.iconKey,
            )
        }
    }
}

private fun buildHimachalSections(
    stateNode: ExamHierarchyNode?,
    stateDrill: String?,
): List<Pair<HimachalExamVisualCatalog.SectionVisual, List<HimachalTestCardModel>>> {
    val grouped = linkedMapOf<String, LinkedHashMap<String, HimachalTestCardModel>>()

    for (seed in HimachalExamVisualCatalog.catalogTestSeeds()) {
        val bucket = grouped.getOrPut(seed.sectionSlug) { linkedMapOf() }
        bucket[seed.catalogSlug] = HimachalTestCardModel(
            applyTestName = seed.applyTestName,
            iconKey = seed.iconKey,
        )
    }

    val level2 = findStateChildNode(stateNode, stateDrill.orEmpty())
    for (level3 in level2?.children.orEmpty()) {
        val name = level3.label.trim()
        if (name.isEmpty()) continue
        val sectionSlug = HimachalExamVisualCatalog.resolveSectionSlug(name)
        val catalogSlug = HimachalExamVisualCatalog.matchCatalogSlug(name, level3.iconKey)
            ?: "admin-${name.lowercase(Locale.US)}"
        val bucket = grouped.getOrPut(sectionSlug) { linkedMapOf() }
        bucket[catalogSlug] = HimachalTestCardModel(
            applyTestName = name,
            iconKey = level3.iconKey?.trim()?.takeIf { it.isNotEmpty() }
                ?: catalogSlug.takeIf { !it.startsWith("admin-") }
                    ?.let { HimachalExamVisualCatalog.iconKeyForSlug(it) },
        )
    }

    val ordered = HimachalExamVisualCatalog.sectionOrder()
    return ordered.mapNotNull { slug ->
        val items = grouped[slug]?.values?.toList().orEmpty()
        if (items.isEmpty()) null else HimachalExamVisualCatalog.sectionVisual(slug) to items
    }
}

private fun findAllIndiaNode(
    hierarchy: List<ExamHierarchyNode>,
): ExamHierarchyNode? =
    findLevel1Node(hierarchy, AllIndiaExamVisualCatalog::isAllIndiaExamLevel1)
        ?: findLevel1Node(hierarchy, ::isCentralExamLevel1)

private fun buildAllIndiaSections(
    node: ExamHierarchyNode?,
): List<Pair<AllIndiaExamVisualCatalog.SectionVisual, List<AllIndiaTestCardModel>>> {
    val grouped = linkedMapOf<String, LinkedHashMap<String, AllIndiaTestCardModel>>()

    for (seed in AllIndiaExamVisualCatalog.catalogTestSeeds()) {
        val bucket = grouped.getOrPut(seed.sectionSlug) { linkedMapOf() }
        bucket[seed.catalogSlug] = AllIndiaTestCardModel(
            applyTestName = seed.applyTestName,
            sectionLabel = seed.sectionLabel,
            iconKey = seed.iconKey,
        )
    }

    if (node != null) {
        for (level2 in node.children) {
            val sectionSlug = AllIndiaExamVisualCatalog.resolveSectionSlug(level2.label)
            val sectionLabel = level2.label.trim()
            for (level3 in level2.children) {
                val name = level3.label.trim()
                if (name.isEmpty()) continue
                val catalogSlug = AllIndiaExamVisualCatalog.matchCatalogSlug(name, sectionLabel, level3.iconKey)
                    ?: "admin-${name.lowercase(Locale.US)}"
                val bucket = grouped.getOrPut(sectionSlug) { linkedMapOf() }
                bucket[catalogSlug] = AllIndiaTestCardModel(
                    applyTestName = name,
                    sectionLabel = sectionLabel,
                    iconKey = level3.iconKey?.trim()?.takeIf { it.isNotEmpty() }
                        ?: catalogSlug.takeIf { !it.startsWith("admin-") }
                            ?.let { AllIndiaExamVisualCatalog.iconKeyForSlug(it) },
                )
            }
        }
    }

    return AllIndiaExamVisualCatalog.sectionOrder().mapNotNull { slug ->
        val items = grouped[slug]?.values?.toList().orEmpty()
        if (items.isEmpty()) null else AllIndiaExamVisualCatalog.sectionVisual(slug) to items
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
    val showAllTests by AppPreferencesRepository.showAllTestsCatalog.collectAsState(initial = true)
    val interestFilterActive = remember(userInterests, showAllTests) {
        !showAllTests && UserInterestUtils.normalizeInterestSubcategories(userInterests).isNotEmpty()
    }
    val preloadedItems = remember { ContentRepository.peekExamCategoriesMemory() }
    var examCategoryRemote by remember {
        mutableStateOf(preloadedItems?.filter { it.enabled }.orEmpty())
    }
    var fullHierarchy by remember {
        mutableStateOf(preloadedItems?.let { buildExamHierarchy(it) } ?: emptyList())
    }
    val hierarchy = remember(fullHierarchy, userInterests, showAllTests) {
        filterExamHierarchyForInterests(fullHierarchy, userInterests, showAllTests)
    }
    var hierarchyFetchError by remember { mutableStateOf(false) }
    var hierarchyReloadKey by remember { mutableIntStateOf(0) }
    var scopeTab by remember { mutableStateOf(ExamCatalogScopeTab.State) }
    var stateDrill by remember { mutableStateOf<String?>(null) }
    var didApplyPreload by remember { mutableStateOf(false) }

    val stateNode = remember(hierarchy) { findLevel1Node(hierarchy, ::isStateExamLevel1) }
    val fullStateNode = remember(fullHierarchy) { findLevel1Node(fullHierarchy, ::isStateExamLevel1) }
    val fullAllIndiaNode = remember(fullHierarchy) { findAllIndiaNode(fullHierarchy) }
    val allIndiaSections = remember(fullAllIndiaNode) { buildAllIndiaSections(fullAllIndiaNode) }
    val stateCircleItems = remember(stateNode) {
        val adminLevel2 = stateNode?.children?.map { it.label to it.iconKey }.orEmpty()
        IndianStateVisualCatalog.buildStateCircleItems(adminLevel2)
    }
    val stateTestItems = remember(stateNode, stateDrill) {
        findStateChildNode(stateNode, stateDrill.orEmpty())?.children.orEmpty()
    }
    val filteredRemoteItems = remember(examCategoryRemote, userInterests, showAllTests) {
        filterRemoteExamCategoriesForInterests(examCategoryRemote, userInterests, showAllTests)
    }
    val stateExamSections = remember(filteredRemoteItems, stateDrill, fullStateNode, userInterests, showAllTests) {
        val drill = stateDrill ?: return@remember emptyList()
        val dynamic = StateExamDynamicCatalog.buildSectionsForState(filteredRemoteItems, drill)
        val built = if (dynamic.isNotEmpty()) {
            dynamic
        } else if (HimachalExamVisualCatalog.isHimachalStateLabel(drill)) {
            buildHimachalSectionsAsGeneric(fullStateNode, drill)
        } else {
            emptyList()
        }
        filterStateExamSectionsForInterests(built, userInterests, showAllTests)
    }

    fun applyRemoteItems(remote: List<ContentRepository.ExamCategoryItemRemote>) {
        val enabled = remote.filter { it.enabled }
        examCategoryRemote = enabled
        fullHierarchy = buildExamHierarchy(enabled)
        hierarchyFetchError = false
    }

    LaunchedEffect(showAllTests, scopeTab) {
        stateDrill = null
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
            scopeTab == ExamCatalogScopeTab.State && stateDrill != null -> {
                stateDrill = null
            }
            else -> {
                onBack()
            }
        }
    }

    BackHandler(onBack = navigateUp)

    val tabHasContent = when (scopeTab) {
        ExamCatalogScopeTab.State ->
            stateCircleItems.isNotEmpty() ||
                (stateDrill != null && (stateExamSections.isNotEmpty() || stateTestItems.isNotEmpty()))
        ExamCatalogScopeTab.AllIndia -> allIndiaSections.isNotEmpty()
    }
    val showEmptyMessage = !hierarchyFetchError && !tabHasContent
    val showInterestFilterEmpty =
        showEmptyMessage && interestFilterActive && fullHierarchy.isNotEmpty()
    val showLoadError = hierarchyFetchError && fullHierarchy.isEmpty()
    val showBackInAppBar = showAppBarBack || stateDrill != null
    val stateTestRows = stateTestItems.chunked(2)
    val showStateCircleGrid =
        scopeTab == ExamCatalogScopeTab.State && stateDrill == null && stateCircleItems.isNotEmpty()
    val showAllIndiaGrid =
        scopeTab == ExamCatalogScopeTab.AllIndia && allIndiaSections.isNotEmpty()
    val showStateExamSectionedGrid =
        scopeTab == ExamCatalogScopeTab.State &&
            stateDrill != null &&
            stateExamSections.isNotEmpty()
    val showStateTestsList =
        scopeTab == ExamCatalogScopeTab.State &&
            stateDrill != null &&
            !showStateExamSectionedGrid &&
            stateTestItems.isNotEmpty()
    val title = when {
        scopeTab == ExamCatalogScopeTab.State && stateDrill != null -> stateDrill ?: "State"
        scopeTab == ExamCatalogScopeTab.State -> "State"
        else -> "All India"
    }
    val breadcrumb = if (scopeTab == ExamCatalogScopeTab.State && stateDrill != null) {
        "State > $stateDrill"
    } else {
        ""
    }

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
            if (stateDrill == null) {
                Spacer(Modifier.height(10.dp))
                ExamCatalogModeToggleRow(
                    showAllTests = showAllTests,
                    onSelectMyMockTests = {
                        scope.launch {
                            AppPreferencesRepository.setShowAllTestsCatalog(false)
                        }
                    },
                    onSelectAllMockTests = {
                        scope.launch {
                            AppPreferencesRepository.setShowAllTestsCatalog(true)
                        }
                    },
                )
                Spacer(Modifier.height(10.dp))
                ExamScopeTabRow(
                    selected = scopeTab,
                    onSelectState = { scopeTab = ExamCatalogScopeTab.State },
                    onSelectAllIndia = { scopeTab = ExamCatalogScopeTab.AllIndia },
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
                            text = "All Mock Test",
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
            } else if (showStateCircleGrid) {
                StateCircleCategoryGrid(
                    items = stateCircleItems,
                    onOpenCategory = { picked -> stateDrill = picked.trim() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            } else if (showAllIndiaGrid) {
                AllIndiaExamSectionedGrid(
                    sections = allIndiaSections,
                    onOpenTest = onOpenCategory,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            } else if (showStateExamSectionedGrid) {
                StateExamSectionedGrid(
                    sections = stateExamSections,
                    stateDrillLabel = stateDrill.orEmpty(),
                    onOpenTest = onOpenCategory,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            } else if (showStateTestsList) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(stateTestRows) { _, rowCats ->
                        AllCategoryRow(
                            left = rowCats.getOrNull(0)?.label.orEmpty(),
                            leftIconKey = rowCats.getOrNull(0)?.iconKey,
                            right = rowCats.getOrNull(1)?.label,
                            rightIconKey = rowCats.getOrNull(1)?.iconKey,
                            onOpenCategory = onOpenCategory,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ExamScopeTabRow(
    selected: ExamCatalogScopeTab,
    onSelectState: () -> Unit,
    onSelectAllIndia: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ExamCatalogModeChip(
            label = "State",
            selected = selected == ExamCatalogScopeTab.State,
            onClick = onSelectState,
            modifier = Modifier.weight(1f),
        )
        ExamCatalogModeChip(
            label = "All India",
            selected = selected == ExamCatalogScopeTab.AllIndia,
            onClick = onSelectAllIndia,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ExamCatalogModeToggleRow(
    showAllTests: Boolean,
    onSelectMyMockTests: () -> Unit,
    onSelectAllMockTests: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ExamCatalogModeChip(
            label = "My Mock Test",
            selected = !showAllTests,
            onClick = onSelectMyMockTests,
            modifier = Modifier.weight(1f),
        )
        ExamCatalogModeChip(
            label = "All Mock Test",
            selected = showAllTests,
            onClick = onSelectAllMockTests,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ExamCatalogModeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(12.dp)
    val bg = if (selected) p.primaryButton else p.surface
    val textColor = if (selected) p.onPrimaryButton else p.textSecondary
    val borderColor = if (selected) p.primaryButton else p.textSecondary.copy(alpha = 0.25f)
    Box(
        modifier = modifier
            .height(42.dp)
            .clip(shape)
            .border(1.dp, borderColor, shape)
            .background(bg)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = textColor,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
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
