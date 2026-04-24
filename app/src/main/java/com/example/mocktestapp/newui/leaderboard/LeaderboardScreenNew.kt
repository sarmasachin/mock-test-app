package com.example.mocktestapp.newui.leaderboard

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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun LeaderboardScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    var selectedTest by remember { mutableStateOf("All tests") }
    var selectedRange by remember { mutableStateOf(TimeRangeFilter.Weekly) }
    var selectedCity by remember { mutableStateOf("All cities") }
    var selectedState by remember { mutableStateOf("All states") }
    var showFilterSheet by remember { mutableStateOf(false) }
    val filterSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var tests by remember { mutableStateOf<List<ContentRepository.LeaderboardFilterTestRemote>>(emptyList()) }
    var cities by remember { mutableStateOf<List<String>>(emptyList()) }
    var states by remember { mutableStateOf<List<String>>(emptyList()) }
    var leaderboardRows by remember { mutableStateOf<List<ContentRepository.LeaderboardItemRemote>>(emptyList()) }

    LaunchedEffect(Unit) {
        val filters = ContentRepository.loadLeaderboardFilters()
        tests = filters.tests.distinctBy { it.title.trim().lowercase() }
        cities = filters.cities
            .map { it.trim() }
            .filter { it.isNotEmpty() && it.lowercase() != "other" && it.lowercase() != "not listed" && it.lowercase() != "notlisted" }
            .distinctBy { it.lowercase() }
        states = filters.states
            .map { it.trim() }
            .filter { it.isNotEmpty() && it.lowercase() != "other" && it.lowercase() != "not listed" && it.lowercase() != "notlisted" }
            .distinctBy { it.lowercase() }
    }

    LaunchedEffect(tests, cities, states) {
        if (selectedTest != "All tests" && tests.none { it.title.equals(selectedTest, ignoreCase = true) }) {
            selectedTest = "All tests"
        }
        if (selectedCity != "All cities" && cities.none { it.equals(selectedCity, ignoreCase = true) }) {
            selectedCity = "All cities"
        }
        if (selectedState != "All states" && states.none { it.equals(selectedState, ignoreCase = true) }) {
            selectedState = "All states"
        }
    }
    LaunchedEffect(selectedRange, selectedTest, selectedCity, selectedState, tests) {
        val testId = tests.firstOrNull { it.title == selectedTest }?.id
        leaderboardRows = ContentRepository.loadLeaderboard(
            range = if (selectedRange == TimeRangeFilter.Weekly) "weekly" else "monthly",
            city = selectedCity.takeUnless { it == "All cities" },
            state = selectedState.takeUnless { it == "All states" },
            testCatalogId = testId,
        )
    }

    if (showFilterSheet) {
        ModalBottomSheet(
            onDismissRequest = { showFilterSheet = false },
            sheetState = filterSheetState,
            containerColor = p.surface,
        ) {
            AdvancedFiltersSheet(
                tests = listOf("All tests") + tests.map { it.title }.distinctBy { it.lowercase() },
                selectedTest = selectedTest,
                onSelectTest = { selectedTest = it },
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
                    selected = selectedTest != "All tests" || selectedCity != "All cities" || selectedState != "All states",
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

            Spacer(Modifier.height(8.dp))
            Text(
                text = "Showing ${leaderboardRows.size} users",
                color = p.textSecondary,
                fontSize = 12.sp,
            )

            Spacer(Modifier.height(16.dp))

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                itemsIndexed(leaderboardRows) { index, user ->
                    LeaderboardRow(
                        rank = user.rank.takeIf { it > 0 } ?: (index + 1),
                        name = user.name,
                        scoreText = "${user.score}/500 • ${user.city.ifBlank { user.state }}",
                    )
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
    tests: List<String>,
    selectedTest: String,
    onSelectTest: (String) -> Unit,
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
            text = "Test",
            color = p.textSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        FilterChipRow(
            options = tests,
            selected = selectedTest,
            onSelect = onSelectTest,
        )
        Spacer(Modifier.height(10.dp))
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
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
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
            text = name,
            color = p.textPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
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
