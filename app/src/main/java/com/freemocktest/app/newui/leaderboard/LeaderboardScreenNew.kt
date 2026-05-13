package com.freemocktest.app.newui.leaderboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun LeaderboardScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    var selectedRange by remember { mutableStateOf(TimeRangeFilter.Weekly) }
    var selectedCity by remember { mutableStateOf("All cities") }
    var selectedState by remember { mutableStateOf("All states") }
    var searchQuery by remember { mutableStateOf("") }
    var showFilterSheet by remember { mutableStateOf(false) }
    val filterSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var leaderboardReloadKey by remember { mutableIntStateOf(0) }
    var filtersLoadFailed by remember { mutableStateOf(false) }
    var testsLoading by remember { mutableStateOf(true) }
    var testsLoadFailed by remember { mutableStateOf(false) }
    val expandLoadFailed = remember { mutableStateMapOf<String, Boolean>() }

    var cities by remember { mutableStateOf<List<String>>(emptyList()) }
    var states by remember { mutableStateOf<List<String>>(emptyList()) }
    var leaderboardTestRows by remember { mutableStateOf<List<ContentRepository.LeaderboardTestSummaryRemote>>(emptyList()) }
    val expandedRows = remember { mutableStateMapOf<String, List<ContentRepository.LeaderboardItemRemote>>() }
    var expandedTestId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val profile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )
    val scoreVisible by AppPreferencesRepository.scoreVisibilityEnabled.collectAsState(initial = true)
    val currentDisplayNameKey = profile.displayName.trim().lowercase()

    LaunchedEffect(leaderboardReloadKey) {
        val result = runCatching { ContentRepository.loadLeaderboardFilters() }
        if (result.isSuccess) {
            filtersLoadFailed = false
            val filters = result.getOrThrow()
            cities = filters.cities
                .map { it.trim() }
                .filter { it.isNotEmpty() && it.lowercase() != "other" && it.lowercase() != "not listed" && it.lowercase() != "notlisted" }
                .distinctBy { it.lowercase() }
            states = filters.states
                .map { it.trim() }
                .filter { it.isNotEmpty() && it.lowercase() != "other" && it.lowercase() != "not listed" && it.lowercase() != "notlisted" }
                .distinctBy { it.lowercase() }
        } else {
            filtersLoadFailed = true
            cities = emptyList()
            states = emptyList()
        }
    }

    LaunchedEffect(cities, states) {
        if (selectedCity != "All cities" && cities.none { it.equals(selectedCity, ignoreCase = true) }) {
            selectedCity = "All cities"
        }
        if (selectedState != "All states" && states.none { it.equals(selectedState, ignoreCase = true) }) {
            selectedState = "All states"
        }
    }
    LaunchedEffect(selectedRange, selectedCity, selectedState, leaderboardReloadKey) {
        testsLoading = true
        testsLoadFailed = false
        try {
            val tResult = runCatching {
                ContentRepository.loadLeaderboardTests(
                    range = if (selectedRange == TimeRangeFilter.Weekly) "weekly" else "monthly",
                    city = selectedCity.takeUnless { it == "All cities" },
                    state = selectedState.takeUnless { it == "All states" },
                )
            }
            leaderboardTestRows = tResult.getOrElse { emptyList() }
            testsLoadFailed = tResult.isFailure
            expandedRows.clear()
            expandLoadFailed.clear()
            val first = leaderboardTestRows.firstOrNull()
            expandedTestId = if (testsLoadFailed) null else first?.testId
            if (first != null && !testsLoadFailed) {
                val r = runCatching {
                    ContentRepository.loadLeaderboardByTest(
                        testId = first.testId,
                        range = if (selectedRange == TimeRangeFilter.Weekly) "weekly" else "monthly",
                        city = selectedCity.takeUnless { it == "All cities" },
                        state = selectedState.takeUnless { it == "All states" },
                    )
                }
                expandedRows[first.testId] = r.getOrElse { emptyList() }
                expandLoadFailed[first.testId] = r.isFailure
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            leaderboardTestRows = emptyList()
            testsLoadFailed = true
            expandedRows.clear()
            expandLoadFailed.clear()
            expandedTestId = null
        } finally {
            testsLoading = false
        }
    }

    if (showFilterSheet) {
        ModalBottomSheet(
            onDismissRequest = { showFilterSheet = false },
            sheetState = filterSheetState,
            containerColor = p.surface,
        ) {
            AdvancedFiltersSheet(
                cities = listOf("All cities") + cities.distinctBy { it.lowercase() },
                selectedCity = selectedCity,
                onSelectCity = { selectedCity = it },
                states = listOf("All states") + states.distinctBy { it.lowercase() },
                selectedState = selectedState,
                onSelectState = { selectedState = it },
            )
        }
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(6.dp))
                Text(
                    text = "Leaderboard",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Spacer(Modifier.weight(1f))
                LeaderboardScopeChip(
                    label = "More Filters",
                    selected = selectedCity != "All cities" || selectedState != "All states",
                    onClick = { showFilterSheet = true },
                    modifier = Modifier.width(132.dp),
                )
            }

            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                LeaderboardScopeChip(
                    label = "Weekly",
                    selected = selectedRange == TimeRangeFilter.Weekly,
                    onClick = { selectedRange = TimeRangeFilter.Weekly },
                    modifier = Modifier.weight(1f),
                )
                LeaderboardScopeChip(
                    label = "Monthly",
                    selected = selectedRange == TimeRangeFilter.Monthly,
                    onClick = { selectedRange = TimeRangeFilter.Monthly },
                    modifier = Modifier.weight(1f),
                )
            }

            if (filtersLoadFailed) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "City and state filters couldn't be loaded. You can still use \"All cities\" and \"All states\".",
                    color = p.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Spacer(Modifier.height(8.dp))
            Text(
                text = when {
                    testsLoading -> "Loading tests…"
                    testsLoadFailed -> "Couldn't load tests"
                    else -> "Showing ${leaderboardTestRows.size} tests"
                },
                color = p.textSecondary,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Search test or user") },
            )

            Spacer(Modifier.height(16.dp))

            when {
                testsLoading -> {
                    Text(
                        text = "Loading leaderboard…",
                        color = p.textSecondary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                testsLoadFailed -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = p.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = "Something went wrong while loading the leaderboard. Check your connection and try again.",
                                color = p.textPrimary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Button(
                                onClick = { leaderboardReloadKey++ },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = p.primaryButton,
                                    contentColor = p.onPrimaryButton,
                                ),
                            ) {
                                Text("Retry")
                            }
                        }
                    }
                }
                else -> {
                    val queryKey = searchQuery.trim().lowercase()
                    val visibleTests = leaderboardTestRows.filter { testRow ->
                        if (queryKey.isBlank()) return@filter true
                        if (testRow.testTitle.lowercase().contains(queryKey)) return@filter true
                        expandedRows[testRow.testId].orEmpty().any { u ->
                            u.name.lowercase().contains(queryKey)
                        }
                    }
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        itemsIndexed(visibleTests) { _, testRow ->
                            val isExpanded = expandedTestId == testRow.testId
                            LeaderboardTestCard(
                                testTitle = testRow.testTitle,
                                participants = testRow.participantsCount,
                                attempts = testRow.attemptsCount,
                                expanded = isExpanded,
                                detailLoadFailed = expandLoadFailed[testRow.testId] == true,
                                onToggle = {
                                    if (isExpanded) {
                                        expandedTestId = null
                                    } else {
                                        expandedTestId = testRow.testId
                                        val needsFetch =
                                            !expandedRows.containsKey(testRow.testId) ||
                                                expandLoadFailed[testRow.testId] == true
                                        if (needsFetch) {
                                            scope.launch {
                                                expandLoadFailed[testRow.testId] = false
                                                val r = runCatching {
                                                    ContentRepository.loadLeaderboardByTest(
                                                        testId = testRow.testId,
                                                        range = if (selectedRange == TimeRangeFilter.Weekly) "weekly" else "monthly",
                                                        city = selectedCity.takeUnless { it == "All cities" },
                                                        state = selectedState.takeUnless { it == "All states" },
                                                    )
                                                }
                                                expandedRows[testRow.testId] = r.getOrElse { emptyList() }
                                                expandLoadFailed[testRow.testId] = r.isFailure
                                            }
                                        }
                                    }
                                },
                                rows = expandedRows[testRow.testId].orEmpty(),
                                currentDisplayNameKey = currentDisplayNameKey,
                                scoreVisible = scoreVisible,
                            )
                        }
                    }
                }
            }
        }
    }
}

private enum class TimeRangeFilter {
    Weekly,
    Monthly,
}

@Composable
private fun LeaderboardScopeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    fitContent: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    val bg = if (selected) p.primaryButton else p.surface
    val fg = if (selected) p.onPrimaryButton else p.textPrimary
    Box(
        modifier = modifier
            .height(40.dp)
            .then(if (fitContent) Modifier.wrapContentWidth() else Modifier)
            .clip(shape)
            .background(bg)
            .border(1.dp, p.border.copy(alpha = if (selected) 0.35f else 0.18f), shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = fg,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 14.dp),
        )
    }
}

@Composable
private fun FilterChipRow(
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(count = options.size, key = { idx -> options[idx] }) { index ->
            val option = options[index]
            LeaderboardScopeChip(
                label = option,
                selected = selected == option,
                onClick = { onSelect(option) },
                fitContent = true,
            )
        }
    }
}

@Composable
private fun AdvancedFiltersSheet(
    cities: List<String>,
    selectedCity: String,
    onSelectCity: (String) -> Unit,
    states: List<String>,
    selectedState: String,
    onSelectState: (String) -> Unit,
) {
    val p = mockTestPalette()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) {
        Text(
            text = "More filters",
            color = p.textPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = "City",
            color = p.textSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        FilterChipRow(
            options = cities,
            selected = selectedCity,
            onSelect = onSelectCity,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = "State",
            color = p.textSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        FilterChipRow(
            options = states,
            selected = selectedState,
            onSelect = onSelectState,
        )
        Spacer(Modifier.height(18.dp))
    }
}

@Composable
private fun LeaderboardRow(
    rank: Int,
    name: String,
    scoreText: String,
    isCurrentUser: Boolean,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (isCurrentUser) p.surfaceElevated else Color.Transparent)
            .border(
                width = if (isCurrentUser) 1.dp else 0.dp,
                color = if (isCurrentUser) p.accent.copy(alpha = 0.3f) else Color.Transparent,
                shape = RoundedCornerShape(10.dp),
            )
            .padding(horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "#$rank",
            color = p.accent,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            modifier = Modifier.width(52.dp),
        )

        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(p.surfaceElevated),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "U",
                color = p.textSecondary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
        }

        Spacer(Modifier.size(12.dp))

        Text(
            text = if (isCurrentUser) "$name (You)" else name,
            color = p.textPrimary,
            fontSize = 14.sp,
            fontWeight = if (isCurrentUser) FontWeight.ExtraBold else FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )

        Text(
            text = scoreText,
            color = p.textSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun LeaderboardTestCard(
    testTitle: String,
    participants: Int,
    attempts: Int,
    expanded: Boolean,
    detailLoadFailed: Boolean,
    onToggle: () -> Unit,
    rows: List<ContentRepository.LeaderboardItemRemote>,
    currentDisplayNameKey: String,
    scoreVisible: Boolean,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape)
            .clickable(onClick = onToggle)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = if (expanded) "−" else "+",
                color = p.accent,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 20.sp,
                modifier = Modifier.width(22.dp),
            )
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = testTitle,
                    color = p.textPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "$participants users • $attempts attempts",
                    color = p.textSecondary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.sp,
                )
            }
        }
        if (expanded) {
            Spacer(Modifier.height(10.dp))
            if (rows.isEmpty()) {
                Text(
                    text = if (detailLoadFailed) {
                        "Couldn't load rankings for this test. Tap to collapse and try again."
                    } else {
                        "No attempts found for this test in selected filters."
                    },
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    rows.forEachIndexed { idx, user ->
                        val placeText = user.city.ifBlank { user.state }
                        LeaderboardRow(
                            rank = user.rank.takeIf { it > 0 } ?: (idx + 1),
                            name = user.name,
                            scoreText = (if (scoreVisible) {
                                "${user.score} pts • ${user.totalCorrect}/${user.totalQuestions}"
                            } else {
                                "-"
                            }) + (if (placeText.isNotBlank()) " • $placeText" else ""),
                            isCurrentUser = currentDisplayNameKey.isNotBlank() &&
                                user.name.trim().lowercase() == currentDisplayNameKey,
                        )
                    }
                }
            }
        }
    }
}
