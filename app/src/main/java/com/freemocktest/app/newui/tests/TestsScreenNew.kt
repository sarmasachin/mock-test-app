package com.freemocktest.app.newui.tests

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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.freemocktest.app.data.ContentRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette

data class TestCardNew(
    val id: String = "",
    val slug: String = "",
    val title: String,
    val meta: String,
    val examDate: String? = null,
    val durationLabel: String? = null,
    val questionsMarks: String? = null,
    val slotLabel: String? = null,
    val enrolledLabel: String? = null,
    val remainingSeatsLabel: String? = null,
    val attemptsAllowed: String? = null,
    val languageMode: String? = null,
    val examMode: String? = null,
    val negativeMarkingText: String? = null,
    val testTypeLabel: String? = null,
    val badgeEnabled: Boolean = false,
    val badgeText: String = "Live",
    val validUntil: String? = null,
    val answerKeyReleaseAt: String? = null,
    val resultReleaseAt: String? = null,
    val capacityTotal: Int? = null,
    val enrolledCount: Int? = null,
    val remainingSeats: Int? = null,
    val publishAt: String? = null,
    val unpublishAt: String? = null,
    val resultVisibility: String? = null,
    val reattemptCooldownMinutes: Int = 0,
    val lateJoinMinutes: Int = 0,
    val notifyBeforeMinutes: Int = 0,
    val resumeEnabled: Boolean = true,
    val shuffleQuestions: Boolean = false,
    val shuffleOptions: Boolean = false,
    val fullscreenRequired: Boolean = false,
    val copyPasteBlocked: Boolean = false,
    val notifyOnPublish: Boolean = true,
)

private const val TESTS_LOAD_ERROR_MESSAGE = "Couldn't load tests. Check your connection and try again."
private const val TESTS_EMPTY_MESSAGE = "No tests available for this topic yet."

@Composable
fun TestsScreenNew(
    modifier: Modifier = Modifier,
    subcategory: String,
    onBack: () -> Unit,
    onOpenTest: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val scope = rememberCoroutineScope()

    var tests by remember(subcategory) { mutableStateOf<List<TestCardNew>>(emptyList()) }
    var testsLoading by remember(subcategory) { mutableStateOf(true) }
    var testsLoadError by remember(subcategory) { mutableStateOf(false) }
    var testsReloadKey by remember(subcategory) { mutableIntStateOf(0) }
    var navInFlight by remember(subcategory) { mutableStateOf(false) }

    LaunchedEffect(subcategory, testsReloadKey) {
        testsLoadError = false
        try {
            val cached = runCatching { ContentRepository.loadCachedTestsForSubcategory(subcategory) }
                .getOrDefault(emptyList())
            if (cached.isNotEmpty()) {
                tests = cached
            }
            val hadCache = cached.isNotEmpty()
            testsLoading = !hadCache

            val refreshOutcome = runCatching {
                ContentRepository.loadTestsForSubcategory(subcategory, forceRefresh = true)
            }
            tests = if (refreshOutcome.isSuccess) {
                refreshOutcome.getOrNull() ?: tests
            } else if (hadCache) {
                tests
            } else {
                emptyList()
            }
            testsLoadError = refreshOutcome.isFailure && tests.isEmpty()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            if (tests.isEmpty()) {
                testsLoadError = true
            }
        } finally {
            testsLoading = false
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
                .padding(padding),
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
                    text = "Tests",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }

            Spacer(Modifier.height(16.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) {
                when {
                    testsLoading && tests.isEmpty() && !testsLoadError -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = p.accent)
                        }
                    }
                    testsLoadError -> {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 18.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(
                                text = TESTS_LOAD_ERROR_MESSAGE,
                                color = p.textSecondary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(14.dp))
                            Button(
                                onClick = { testsReloadKey += 1 },
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = p.primaryButton,
                                    contentColor = p.onPrimaryButton,
                                ),
                            ) {
                                Text("Retry", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    tests.isEmpty() -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = TESTS_EMPTY_MESSAGE,
                                color = p.textSecondary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                    else -> {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState()),
                        ) {
                            tests.forEach { t ->
                                TestRow(
                                    test = t,
                                    openDisabled = navInFlight,
                                    onOpen = {
                                        if (!navInFlight && t.title.isNotBlank()) {
                                            navInFlight = true
                                            onOpenTest(t.title)
                                            scope.launch {
                                                delay(1_500L)
                                                navInFlight = false
                                            }
                                        }
                                    },
                                )
                                Spacer(Modifier.height(12.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TestRow(
    test: TestCardNew,
    openDisabled: Boolean,
    onOpen: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    var expanded by remember(test.title) { mutableStateOf(false) }
    Box(modifier = Modifier.fillMaxWidth()) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp),
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = p.surface),
            border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = test.title,
                        color = p.textPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = test.meta,
                        color = p.textSecondary,
                        fontSize = 12.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    val primaryRows = listOfNotNull(
                        test.examDate?.let { "Exam Date: $it" },
                        test.durationLabel?.let { "Duration: $it" },
                        test.questionsMarks?.let { "Questions/Marks: $it" },
                        test.enrolledLabel?.let { "Enrolled: $it" },
                        test.remainingSeatsLabel?.let { "Seats Left: $it" },
                    )
                    primaryRows.forEach { line ->
                        Text(
                            text = line,
                            color = p.textSecondary,
                            fontSize = 11.sp,
                        )
                    }
                    val extraRows = listOfNotNull(
                        test.slotLabel?.takeIf { it.isNotBlank() }?.let { "Slot: $it" },
                        test.attemptsAllowed?.let { "Attempts: $it" },
                        test.languageMode?.let { "Language: $it" },
                        test.examMode?.let { "Mode: $it" },
                        test.negativeMarkingText?.let { "Negative: $it" },
                        test.testTypeLabel?.let { "Type: $it" },
                        test.validUntil?.let { "Valid Till: $it" },
                    )
                    if (expanded) {
                        extraRows.forEach { line ->
                            Text(
                                text = line,
                                color = p.textSecondary,
                                fontSize = 11.sp,
                            )
                        }
                    }
                    if (extraRows.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = if (expanded) "Less details" else "View details",
                            color = p.accent,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { expanded = !expanded }
                                .padding(horizontal = 8.dp, vertical = 5.dp),
                        )
                    }
                }

                val pill = RoundedCornerShape(999.dp)
                Box(
                    modifier = Modifier
                        .clip(pill)
                        .background(if (openDisabled) p.border else p.systemBlue)
                        .border(1.dp, p.overlaySoft, pill)
                        .clickable(enabled = !openDisabled, onClick = onOpen)
                        .padding(horizontal = 18.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Start Test Series",
                        color = Color.White.copy(alpha = if (openDisabled) 0.55f else 1f),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        if (test.badgeEnabled) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = 0.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFDC2626))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    text = test.badgeText,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
