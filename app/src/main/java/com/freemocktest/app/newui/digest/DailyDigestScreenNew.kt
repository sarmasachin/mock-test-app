package com.freemocktest.app.newui.digest

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Leaderboard
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import android.util.Log
import com.freemocktest.app.data.DailyQuizRepository
import com.freemocktest.app.data.DailyQuizScopeSelection
import com.freemocktest.app.newui.auth.SignupRegionData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun playStoreLink(context: Context): String {
    val pkg = context.packageName
    return "https://play.google.com/store/apps/details?id=$pkg"
}

private fun truncateForShare(text: String, maxLen: Int = 220): String {
    val t = text.trim()
    if (t.length <= maxLen) return t
    return t.take(maxLen - 1).trimEnd() + "…"
}

private fun sharePlainText(context: Context, subject: String, body: String, chooserTitle: String) {
    try {
        val send =
            Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, subject)
                putExtra(Intent.EXTRA_TEXT, body)
            }
        context.startActivity(Intent.createChooser(send, chooserTitle))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "No app available to share.", Toast.LENGTH_SHORT).show()
    }
}

/** Per-question status for Daily Quiz analysis UI only (not mock-test review). */
private enum class DailyQuizQuestionStatus {
    CORRECT,
    WRONG,
    SKIPPED,
}

private fun DailyQuizQuestionStatus.color(): Color = when (this) {
    DailyQuizQuestionStatus.CORRECT -> Color(0xFF10B981)
    DailyQuizQuestionStatus.WRONG -> Color(0xFFEB5757)
    DailyQuizQuestionStatus.SKIPPED -> Color(0xFFE7EBEF)
}

private fun DailyQuizQuestionStatus.label(): String = when (this) {
    DailyQuizQuestionStatus.CORRECT -> "Correct"
    DailyQuizQuestionStatus.WRONG -> "Wrong"
    DailyQuizQuestionStatus.SKIPPED -> "Skipped"
}

private fun resolveDailyQuizQuestionStatus(
    selectedOptionIndex: Int?,
    correctIndex: Int,
): DailyQuizQuestionStatus {
    if (selectedOptionIndex == null) return DailyQuizQuestionStatus.SKIPPED
    return if (selectedOptionIndex == correctIndex) {
        DailyQuizQuestionStatus.CORRECT
    } else {
        DailyQuizQuestionStatus.WRONG
    }
}

private fun resolveDailyShareTemplate(
    template: String,
    date: String,
    question: String,
    storeUrl: String,
    score: String = "",
    result: String = "",
): String {
    return template
        .replace("{date}", date)
        .replace("{question}", question)
        .replace("{storeUrl}", storeUrl)
        .replace("{score}", score)
        .replace("{result}", result)
}

private fun dailyQuizProfileInitials(displayName: String): String {
    val cleaned = displayName.trim()
    if (cleaned.isBlank() || cleaned.equals("Guest", ignoreCase = true)) return "G"
    val parts = cleaned.split(Regex("\\s+")).filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> {
            "${parts.first().first().uppercaseChar()}${parts.last().first().uppercaseChar()}"
        }
        else -> {
            val word = parts.first()
            word.take(2).uppercase(Locale.US).ifBlank { "G" }
        }
    }
}

/** Phase 4 — identity key so quiz UI resets when account / guest mode changes. */
private fun buildDailyQuizSessionKey(
    isLoggedIn: Boolean,
    drawerProfile: AppPreferencesRepository.DrawerUserProfile,
): String {
    if (!isLoggedIn) return "guest"
    val uid = drawerProfile.userIdFormatted.orEmpty().trim()
    val email = drawerProfile.emailLine.trim().lowercase(Locale.US)
    return listOf(uid, email).filter { it.isNotBlank() }.joinToString("|").ifBlank { "signed-in" }
}

private fun buildDailyQuizQuestionResult(
    q: ContentRepository.DailyQuizRemote,
    selected: Int?,
    elapsedSec: Long,
): AppPreferencesRepository.DailyQuizQuestionResult {
    val isCorrect = selected != null && selected == q.correctIndex
    return AppPreferencesRepository.DailyQuizQuestionResult(
        itemId = q.id,
        selectedOptionIndex = selected,
        correctIndex = q.correctIndex,
        isCorrect = isCorrect,
        questionPrompt = q.questionPrompt,
        options = q.options,
        explanation = q.explanation,
        timeTakenSeconds = elapsedSec,
    )
}

@Composable
fun DailyDigestScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scoreVisible by AppPreferencesRepository.scoreVisibilityEnabled.collectAsState(initial = true)
    val drawerProfile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile("", "", null),
    )
    val today = remember { LocalDate.now() }
    var selectedDate by remember { mutableStateOf(today) }
    var showQuiz by remember { mutableStateOf(false) }
    var showResult by remember { mutableStateOf(false) }
    var attemptedDates by remember { mutableStateOf<Set<LocalDate>>(emptySet()) }
    var savedDayResult by remember { mutableStateOf<AppPreferencesRepository.DailyQuizDayResult?>(null) }
    var quizItems by remember { mutableStateOf<List<ContentRepository.DailyQuizRemote>>(emptyList()) }
    var currentQuestionIndex by remember { mutableStateOf(0) }
    var pendingQuestionResults by remember {
        mutableStateOf<List<AppPreferencesRepository.DailyQuizQuestionResult>>(emptyList())
    }
    var currentQuizDay by remember { mutableStateOf<LocalDate?>(null) }
    var dailyQuizRank by remember { mutableStateOf<Int?>(null) }
    var dailyQuizRankTotal by remember { mutableStateOf<Int?>(null) }
    var quizError by remember { mutableStateOf(false) }
    var quizLoading by remember { mutableStateOf(true) }
    var quizStatusMessage by remember { mutableStateOf<String?>(null) }
    var quizReloadTick by remember { mutableStateOf(0) }
    var dailyQuizQuestionCount by remember { mutableStateOf(0) }
    var selectedQuizScope by remember { mutableStateOf(DailyQuizScopeSelection.AllIndia) }
    var featuredScopeStates by remember { mutableStateOf(emptyList<String>()) }
    var expandedScopeStates by remember { mutableStateOf(emptyList<String>()) }
    var showAllScopeStates by remember { mutableStateOf(false) }
    var selectedOptionIndex by remember { mutableStateOf<Int?>(null) }
    var quizStartedAtMillis by remember { mutableStateOf<Long?>(null) }
    var questionStartedAtMillis by remember { mutableStateOf<Long?>(null) }
    var submittedAtMillis by remember { mutableStateOf<Long?>(null) }
    var showSolution by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var resultSyncMessage by remember { mutableStateOf<String?>(null) }
    var dailyDigestShareSubject by remember { mutableStateOf("Daily Quiz — Mock Test App") }
    var dailyDigestShareTemplate by remember {
        mutableStateOf("Try today's Daily Digest on Mock Test App!\nDate: {date}\n\n{question}\n\nDownload: {storeUrl}")
    }
    var dailyQuizResultShareSubject by remember { mutableStateOf("Daily Quiz result — Mock Test App") }
    var dailyQuizResultShareTemplate by remember {
        mutableStateOf("My Daily Quiz result on {date}\n\n{question}\nScore: {score}\n\nDownload: {storeUrl}")
    }

    val dailyQuizSessionKey = buildDailyQuizSessionKey(
        isLoggedIn = DailyQuizRepository.isLoggedIn(),
        drawerProfile = drawerProfile,
    )

    // Phase 4 — drop in-flight quiz/result UI when user logs out or switches account.
    LaunchedEffect(dailyQuizSessionKey) {
        showQuiz = false
        showResult = false
        savedDayResult = null
        pendingQuestionResults = emptyList()
        currentQuestionIndex = 0
        selectedOptionIndex = null
        submittedAtMillis = null
        quizStartedAtMillis = null
        questionStartedAtMillis = null
        showSolution = false
        isSubmitting = false
        resultSyncMessage = null
        dailyQuizRank = null
        dailyQuizRankTotal = null
        showAllScopeStates = false
        val scopeSetup = withContext(Dispatchers.IO) {
            runCatching { ContentRepository.loadSignupRegions() }.onSuccess { rows ->
                SignupRegionData.replaceFromAdmin(rows.map { it.state to it.districts })
            }
            val allStates = SignupRegionData.indianStates
            val signupState = AppPreferencesRepository.peekSignupStateNow()
            val savedScope = AppPreferencesRepository.loadDailyQuizScopeSelection()
            val initialScope = DailyQuizScopeUi.resolveInitialSelection(signupState, savedScope, allStates)
            val lists = DailyQuizScopeUi.buildStateLists(signupState, allStates)
            Triple(initialScope, lists.first, lists.second)
        }
        selectedQuizScope = scopeSetup.first
        featuredScopeStates = scopeSetup.second
        expandedScopeStates = scopeSetup.third
        attemptedDates = withContext(Dispatchers.IO) {
            if (DailyQuizRepository.isLoggedIn()) {
                val synced = DailyQuizRepository.syncHistoryFromServer()
                synced?.attemptedDates
                    ?: AppPreferencesRepository.loadDailyQuizAttemptedDates()
            } else {
                AppPreferencesRepository.loadDailyQuizAttemptedDates()
            }
        }
        val result = withContext(Dispatchers.IO) {
            DailyQuizRepository.loadDayResultForCurrentUser(selectedDate)
        }
        savedDayResult = result
        dailyQuizRank = result?.rank
        dailyQuizRankTotal = result?.rankTotal
    }

    LaunchedEffect(selectedDate, dailyQuizSessionKey) {
        val result = withContext(Dispatchers.IO) {
            DailyQuizRepository.loadDayResultForCurrentUser(selectedDate)
        }
        savedDayResult = result
        dailyQuizRank = result?.rank
        dailyQuizRankTotal = result?.rankTotal
    }

    // Phase 4 — never keep dashboard route open without a verified day snapshot.
    LaunchedEffect(showResult, savedDayResult, dailyQuizSessionKey) {
        if (showResult && savedDayResult == null) {
            showResult = false
            showQuiz = false
        }
    }

    LaunchedEffect(quizReloadTick, selectedQuizScope, dailyQuizSessionKey) {
        quizLoading = true
        quizError = false
        quizStatusMessage = "Loading today's quiz..."
        val cached = ContentRepository.peekCachedDailyQuizToday(selectedQuizScope)
        if (cached != null) {
            quizItems = cached.items
            dailyQuizQuestionCount = cached.questionCount
            currentQuizDay = cached.quizDay
            selectedDate = cached.quizDay
            quizError = cached.items.isEmpty()
            quizLoading = false
        }
        runCatching { ContentRepository.loadDailyQuizToday(selectedQuizScope) }
            .onSuccess { payload ->
                quizItems = payload?.items.orEmpty()
                dailyQuizQuestionCount = payload?.questionCount ?: payload?.items.orEmpty().size
                currentQuizDay = payload?.quizDay
                // Align calendar with server "today's quiz" day (schedule TZ) so TAKE TEST / dashboard unlock.
                if (payload?.quizDay != null) {
                    selectedDate = payload.quizDay
                }
                quizError = quizItems.isEmpty()
                quizStatusMessage = when {
                    quizItems.isEmpty() ->
                        "Today's quiz is not published yet. Please check back later."
                    else -> null
                }
                quizLoading = false
            }
            .onFailure { e ->
                quizItems = emptyList()
                dailyQuizQuestionCount = 0
                quizError = true
                quizStatusMessage = when (e) {
                    is HttpException -> when (e.code()) {
                        in 500..599 -> "Server error. Please try again later."
                        else -> "Couldn't load quiz (error ${e.code()}). Check internet and tap retry."
                    }
                    else -> "Couldn't load quiz right now. Check internet and tap retry."
                }
                quizLoading = false
                Log.w("DailyQuizUI", "loadDailyQuizToday failed", e)
            }
    }
    LaunchedEffect(Unit) {
        val digestShare = ContentRepository.loadDailyDigestShareContent()
        if (digestShare?.body?.isNotBlank() == true) {
            dailyDigestShareTemplate = digestShare.body
            val t = digestShare.title?.trim().orEmpty()
            if (t.isNotBlank()) dailyDigestShareSubject = t
        }
        val quizShare = ContentRepository.loadDailyQuizShareContent()
        if (quizShare?.body?.isNotBlank() == true) {
            dailyQuizResultShareTemplate = quizShare.body
            val t = quizShare.title?.trim().orEmpty()
            if (t.isNotBlank()) dailyQuizResultShareSubject = t
        }
    }

    val hasSavedResultForSelectedDay = savedDayResult != null
    val effectiveQuizDay = currentQuizDay ?: today
    val isSelectedQuizDay = selectedDate == effectiveQuizDay
    val canTakeTodayQuiz = !quizLoading && quizItems.isNotEmpty() && isSelectedQuizDay
    val currentQuizItem = quizItems.getOrNull(currentQuestionIndex)

    if (!showQuiz && !showResult) {
        DailyQuizDatePickerScreen(
            modifier = modifier,
            selectedDate = selectedDate,
            attemptedDates = attemptedDates,
            digestItem = null,
            showDigestError = quizError,
            isQuizLoading = quizLoading,
            isTakeTestEnabled = canTakeTodayQuiz || hasSavedResultForSelectedDay,
            hasSavedResultForDay = hasSavedResultForSelectedDay,
            savedDayResult = savedDayResult,
            effectiveQuizDay = effectiveQuizDay,
            scoreVisible = scoreVisible,
            showSelectTodayHint = !isSelectedQuizDay && !hasSavedResultForSelectedDay,
            quizStatusMessage = quizStatusMessage,
            todayQuestionCount = if (isSelectedQuizDay) dailyQuizQuestionCount else 0,
            selectedScope = selectedQuizScope,
            featuredScopeStates = featuredScopeStates,
            expandedScopeStates = expandedScopeStates,
            showAllScopeStates = showAllScopeStates,
            onSelectAllIndiaScope = {
                selectedQuizScope = DailyQuizScopeSelection.AllIndia
                scope.launch(Dispatchers.IO) {
                    AppPreferencesRepository.saveDailyQuizScopeSelection(selectedQuizScope)
                }
            },
            onSelectStateScope = { stateName ->
                selectedQuizScope = DailyQuizScopeSelection.state(stateName)
                scope.launch(Dispatchers.IO) {
                    AppPreferencesRepository.saveDailyQuizScopeSelection(selectedQuizScope)
                }
            },
            onToggleSeeAllScopeStates = { showAllScopeStates = !showAllScopeStates },
            onBack = onBack,
            onShare = {
                val dateStr = selectedDate.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US))
                val prompt = truncateForShare(
                    quizItems.firstOrNull()?.questionPrompt.orEmpty(),
                )
                val fallback =
                    buildString {
                        appendLine("Try today's Daily Digest on Mock Test App!")
                        appendLine("Date: $dateStr")
                        if (prompt.isNotBlank()) {
                            appendLine()
                            appendLine(prompt)
                        }
                        appendLine()
                        appendLine("Download: ${playStoreLink(context)}")
                    }
                val body = resolveDailyShareTemplate(
                    template = dailyDigestShareTemplate,
                    date = dateStr,
                    question = prompt,
                    storeUrl = playStoreLink(context),
                ).ifBlank { fallback }
                sharePlainText(context, dailyDigestShareSubject, body, "Share Daily Quiz")
            },
            onSelectDate = { selectedDate = it },
            onTakeTest = {
                scope.launch {
                    // Phase 4 — re-verify server truth before routing to dashboard (prevents stale UI).
                    val verified = withContext(Dispatchers.IO) {
                        DailyQuizRepository.loadDayResultForCurrentUser(selectedDate)
                    }
                    savedDayResult = verified
                    dailyQuizRank = verified?.rank
                    dailyQuizRankTotal = verified?.rankTotal
                    if (verified != null) {
                        submittedAtMillis = verified.savedAtMillis
                        resultSyncMessage = null
                        showResult = true
                    } else if (quizItems.isEmpty()) {
                        quizError = true
                        if (quizStatusMessage.isNullOrBlank()) {
                            quizStatusMessage =
                                "Today's quiz is not available. Tap RETRY or check back later."
                        }
                    } else if (!quizLoading && quizItems.isNotEmpty() && selectedDate == effectiveQuizDay) {
                        currentQuestionIndex = 0
                        pendingQuestionResults = emptyList()
                        selectedOptionIndex = null
                        submittedAtMillis = null
                        val now = System.currentTimeMillis()
                        quizStartedAtMillis = now
                        questionStartedAtMillis = now
                        showQuiz = true
                    } else {
                        Toast.makeText(
                            context,
                            "Select today's quiz date to take the test.",
                            Toast.LENGTH_SHORT,
                        ).show()
                    }
                }
            },
            onRetryLoad = { quizReloadTick++ },
        )
    } else if (showQuiz) {
        val totalQuestions = quizItems.size.coerceAtLeast(1)
        val questionNumber = (currentQuestionIndex + 1).coerceIn(1, totalQuestions)
        val isLastQuestion = currentQuestionIndex >= quizItems.lastIndex
        DailyQuizQuestionScreen(
            modifier = modifier,
            question = currentQuizItem,
            questionNumber = questionNumber,
            totalQuestions = totalQuestions,
            selectedOptionIndex = selectedOptionIndex,
            submitLabel = when {
                isSubmitting -> "SAVING..."
                isLastQuestion -> "SUBMIT"
                else -> "NEXT"
            },
            isSubmitting = isSubmitting,
            onBack = {
                showQuiz = false
                selectedOptionIndex = null
                currentQuestionIndex = 0
                pendingQuestionResults = emptyList()
            },
            onSelectOption = { selectedOptionIndex = it },
            onSubmit = onSubmit@{
                if (isSubmitting) return@onSubmit
                val q = currentQuizItem ?: return@onSubmit
                val selected = selectedOptionIndex
                if (selected == null) {
                    Toast.makeText(context, "Please select an option.", Toast.LENGTH_SHORT).show()
                    return@onSubmit
                }
                val now = System.currentTimeMillis()
                val elapsedSec = ((now) - (questionStartedAtMillis ?: now)).coerceAtLeast(0L) / 1000L
                val questionResult = buildDailyQuizQuestionResult(q, selected, elapsedSec)
                val updatedResults = pendingQuestionResults + questionResult
                pendingQuestionResults = updatedResults
                if (!isLastQuestion) {
                    currentQuestionIndex += 1
                    selectedOptionIndex = null
                    questionStartedAtMillis = System.currentTimeMillis()
                } else {
                    submittedAtMillis = now
                    showSolution = false
                    showQuiz = false
                    showResult = true
                    val dayForSave = currentQuizDay ?: selectedDate
                    val totalTime = updatedResults.sumOf { it.timeTakenSeconds }
                    val snapshot = AppPreferencesRepository.DailyQuizDayResult(
                        day = dayForSave,
                        questions = updatedResults,
                        totalTimeTakenSeconds = totalTime,
                        savedAtMillis = submittedAtMillis ?: now,
                    )
                    savedDayResult = snapshot
                    resultSyncMessage = null
                    isSubmitting = true
                    scope.launch(Dispatchers.IO) {
                        val saveOk = AppPreferencesRepository.saveDailyQuizDayResult(snapshot)
                        val serverResult = DailyQuizRepository.submitBatchToServer(snapshot, selectedQuizScope)
                        withContext(Dispatchers.Main) {
                            isSubmitting = false
                            if (!saveOk) {
                                Toast.makeText(
                                    context,
                                    "Could not save result on this device. Free some storage and try again.",
                                    Toast.LENGTH_LONG,
                                ).show()
                            } else {
                                attemptedDates = AppPreferencesRepository.loadDailyQuizAttemptedDates()
                            }
                            when (serverResult) {
                                is DailyQuizRepository.ServerResult.Success -> {
                                    savedDayResult = serverResult.snapshot
                                    dailyQuizRank = serverResult.snapshot.rank
                                    dailyQuizRankTotal = serverResult.snapshot.rankTotal
                                    resultSyncMessage = null
                                    attemptedDates = AppPreferencesRepository.loadDailyQuizAttemptedDates()
                                }
                                is DailyQuizRepository.ServerResult.Failure -> {
                                    resultSyncMessage = serverResult.message
                                    Toast.makeText(context, serverResult.message, Toast.LENGTH_LONG).show()
                                }
                            }
                        }
                    }
                }
            },
        )
    } else {
        val resultTimeSec = savedDayResult?.timeTakenSeconds ?: run {
            val endMs = submittedAtMillis ?: System.currentTimeMillis()
            val startMs = quizStartedAtMillis ?: submittedAtMillis ?: endMs
            ((endMs - startMs).coerceAtLeast(0L) / 1000L)
        }
        DailyQuizResultScreen(
            modifier = modifier,
            quizShareDay = selectedDate,
            quizScope = selectedQuizScope,
            displayName = drawerProfile.displayName.ifBlank { "Guest" },
            userIdFormatted = drawerProfile.userIdFormatted,
            rank = dailyQuizRank,
            rankTotal = dailyQuizRankTotal,
            dayResult = savedDayResult,
            syncMessage = resultSyncMessage,
            scoreVisible = scoreVisible,
            timeTakenSeconds = resultTimeSec,
            showSolution = showSolution,
            onBack = onBack,
            onClose = {
                showResult = false
                submittedAtMillis = null
                showSolution = false
            },
            onReAttempt = {
                if (quizItems.isEmpty()) {
                    quizReloadTick++
                    quizError = quizItems.isEmpty()
                    showResult = false
                } else {
                    savedDayResult = null
                    currentQuestionIndex = 0
                    pendingQuestionResults = emptyList()
                    selectedOptionIndex = null
                    submittedAtMillis = null
                    val now = System.currentTimeMillis()
                    quizStartedAtMillis = now
                    questionStartedAtMillis = now
                    showSolution = false
                    showResult = false
                    showQuiz = true
                }
            },
            onSolution = {
                val hasAnyExplanation = savedDayResult?.questions?.any {
                    it.explanation.isNotBlank()
                } == true
                if (!hasAnyExplanation) {
                    Toast.makeText(context, "Solution not available for this quiz.", Toast.LENGTH_SHORT).show()
                } else {
                    showSolution = !showSolution
                }
            },
            shareSubject = dailyQuizResultShareSubject,
            shareTemplate = dailyQuizResultShareTemplate,
        )
    }
}

@Composable
private fun DailyQuizQuestionScreen(
    modifier: Modifier,
    question: ContentRepository.DailyQuizRemote?,
    questionNumber: Int,
    totalQuestions: Int,
    selectedOptionIndex: Int?,
    submitLabel: String,
    isSubmitting: Boolean,
    onBack: () -> Unit,
    onSelectOption: (Int) -> Unit,
    onSubmit: () -> Unit,
) {
    Scaffold(
        containerColor = Color(0xFFF5F6FA),
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "Back", tint = Color(0xFF3D3D3D))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Daily Quiz",
                        color = Color(0xFF272727),
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Question $questionNumber of $totalQuestions",
                        color = Color(0xFF6B7280),
                        fontSize = 14.sp,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = question?.questionPrompt?.ifBlank { "Question unavailable" } ?: "Question unavailable",
                        color = Color(0xFF202020),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 18.sp,
                    )
                    Spacer(Modifier.height(14.dp))
                    question?.options.orEmpty().forEachIndexed { index, option ->
                        val selected = selectedOptionIndex == index
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp)
                                .clickable { onSelectOption(index) },
                            colors = CardDefaults.cardColors(
                                containerColor = if (selected) Color(0xFFE7EEFF) else Color(0xFFF8F8F8),
                            ),
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            Text(
                                text = "${'A' + index}. $option",
                                color = Color(0xFF2F2F2F),
                                fontSize = 15.sp,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = onSubmit,
                enabled = !isSubmitting && selectedOptionIndex != null && question != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DailyBlue),
                shape = DailyCardRadius,
            ) {
                Text(submitLabel, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }
        }
    }
}

@Composable
private fun DailyQuizResultLiveScreen(
    modifier: Modifier,
    question: ContentRepository.DailyQuizRemote?,
    selectedOptionIndex: Int?,
    scoreVisible: Boolean,
    onBack: () -> Unit,
    onClose: () -> Unit,
    onReAttempt: () -> Unit,
) {
    val correctIndex = question?.correctIndex ?: -1
    val isCorrect = selectedOptionIndex != null && selectedOptionIndex == correctIndex
    val scoreText = if (scoreVisible) {
        if (isCorrect) "1 / 1" else "0 / 1"
    } else {
        "-"
    }
    Scaffold(
        containerColor = Color(0xFFF4F5F9),
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onClose(); onBack() }) {
                    Icon(Icons.Rounded.Close, contentDescription = "Close", tint = Color(0xFF555555))
                }
                Text(
                    text = "Daily Quiz Result",
                    color = Color(0xFF2B2B2B),
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 22.sp,
                )
            }
            Spacer(Modifier.height(12.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = DailyPanelRadius,
                colors = CardDefaults.cardColors(containerColor = Color.White),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("Score: $scoreText", color = DailyBlue, fontWeight = FontWeight.Bold, fontSize = 24.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = if (isCorrect) "Great! Your answer is correct." else "Your answer is incorrect.",
                        color = if (isCorrect) Color(0xFF16A34A) else Color(0xFFDC2626),
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(10.dp))
                    val selectedText = selectedOptionIndex?.let { idx ->
                        question?.options?.getOrNull(idx)
                    } ?: "Not answered"
                    val correctText = question?.options?.getOrNull(correctIndex).orEmpty()
                    Text("Your answer: $selectedText", color = Color(0xFF3D3D3D), fontSize = 14.sp)
                    Spacer(Modifier.height(4.dp))
                    Text("Correct answer: $correctText", color = Color(0xFF3D3D3D), fontSize = 14.sp)
                }
            }
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = onReAttempt,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DailyBlue),
                shape = DailyCardRadius,
            ) {
                Text("RE-ATTEMPT", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

private val DailyBlue = Color(0xFF1652D4)
private val DailyCardRadius = RoundedCornerShape(8.dp)
private val DailyPanelRadius = RoundedCornerShape(10.dp)

@Composable
private fun DailyQuizDatePickerScreen(
    modifier: Modifier,
    selectedDate: LocalDate,
    attemptedDates: Set<LocalDate>,
    digestItem: ContentRepository.DailyDigestRemote?,
    showDigestError: Boolean,
    isQuizLoading: Boolean,
    isTakeTestEnabled: Boolean,
    hasSavedResultForDay: Boolean,
    savedDayResult: AppPreferencesRepository.DailyQuizDayResult?,
    effectiveQuizDay: LocalDate,
    scoreVisible: Boolean,
    showSelectTodayHint: Boolean,
    quizStatusMessage: String?,
    todayQuestionCount: Int,
    selectedScope: DailyQuizScopeSelection,
    featuredScopeStates: List<String>,
    expandedScopeStates: List<String>,
    showAllScopeStates: Boolean,
    onSelectAllIndiaScope: () -> Unit,
    onSelectStateScope: (String) -> Unit,
    onToggleSeeAllScopeStates: () -> Unit,
    onBack: () -> Unit,
    onShare: () -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    onTakeTest: () -> Unit,
    onRetryLoad: () -> Unit,
) {
    val month = YearMonth.from(selectedDate)
    val firstDay = month.atDay(1)
    val startOffset = firstDay.dayOfWeek.value % 7
    val dayCount = month.lengthOfMonth()
    val prevMonth = month.minusMonths(1)
    val prevMonthDays = prevMonth.lengthOfMonth()

    Scaffold(
        containerColor = Color(0xFFF5F6FA),
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "Back", tint = Color(0xFF3D3D3D))
                }
                Text(
                    text = "Select Date",
                    color = Color(0xFF272727),
                    fontSize = 28.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onShare) {
                    Icon(Icons.Rounded.Share, contentDescription = "Share", tint = Color(0xFF3D3D3D))
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DailyBlue)
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { onSelectDate(selectedDate.minusMonths(1)) }) {
                    Text("‹", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
                Text(
                    text = month.format(DateTimeFormatter.ofPattern("MMMM  yyyy")),
                    color = Color.White,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                )
                IconButton(onClick = { onSelectDate(selectedDate.plusMonths(1)) }) {
                    Text("›", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                listOf("S", "M", "T", "W", "T", "F", "S").forEach {
                    Text(text = it, color = Color(0xFF8B8B8B), fontSize = 15.sp, modifier = Modifier.width(36.dp), textAlign = TextAlign.Center)
                }
            }
            Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                repeat(6) { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        repeat(7) { col ->
                            val index = row * 7 + col
                            val dayNumber = index - startOffset + 1
                            val isCurrentMonth = dayNumber in 1..dayCount
                            val date = when {
                                isCurrentMonth -> month.atDay(dayNumber)
                                dayNumber <= 0 -> prevMonth.atDay(prevMonthDays + dayNumber)
                                else -> month.plusMonths(1).atDay(dayNumber - dayCount)
                            }
                            val isSelected = date == selectedDate
                            val isAttempted = attemptedDates.contains(date)
                            val isQuizDay = date == effectiveQuizDay
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(CircleShape)
                                    .background(
                                        when {
                                            isSelected -> DailyBlue
                                            isAttempted -> Color(0xFFD6D8DF)
                                            isQuizDay && !isSelected -> Color(0xFFB8D4FF)
                                            else -> Color.Transparent
                                        },
                                    )
                                    .then(
                                        if (isQuizDay && !isSelected) {
                                            Modifier.border(1.dp, DailyBlue, CircleShape)
                                        } else {
                                            Modifier
                                        },
                                    )
                                    .clickable { onSelectDate(date) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = date.dayOfMonth.toString(),
                                    color = when {
                                        isSelected -> Color.White
                                        isCurrentMonth -> Color(0xFF313131)
                                        else -> Color(0xFFCBCBCB)
                                    },
                                    fontSize = 20.sp,
                                )
                            }
                        }
                    }
                }
            }

            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
            Button(
                onClick = onTakeTest,
                enabled = isTakeTestEnabled || hasSavedResultForDay,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DailyBlue),
                shape = DailyCardRadius,
            ) {
                Text(
                    text = when {
                        isQuizLoading -> "LOADING QUIZ..."
                        hasSavedResultForDay -> "VIEW DASHBOARD"
                        !isTakeTestEnabled -> "QUIZ NOT AVAILABLE"
                        else -> "TAKE TEST"
                    },
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 19.sp,
                )
            }
            DailyQuizScopeSelectorCard(
                selection = selectedScope,
                featuredStates = featuredScopeStates,
                expandedStates = expandedScopeStates,
                showAllStates = showAllScopeStates,
                enabled = !isQuizLoading,
                onSelectAllIndia = onSelectAllIndiaScope,
                onSelectState = onSelectStateScope,
                onToggleSeeAll = onToggleSeeAllScopeStates,
            )
            if (showSelectTodayHint) {
                val hintDay = effectiveQuizDay.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US))
                Text(
                    text = "Tap the highlighted quiz day ($hintDay) on the calendar to take today's Daily Quiz.",
                    color = Color(0xFF6B7280),
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
            if (todayQuestionCount > 0 && !hasSavedResultForDay && !isQuizLoading) {
                Text(
                    text = "Today's quiz has $todayQuestionCount question${if (todayQuestionCount == 1) "" else "s"}.",
                    color = Color(0xFF4B5563),
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            if (hasSavedResultForDay && savedDayResult != null) {
                DailyQuizDashboardPreviewCard(
                    result = savedDayResult,
                    effectiveQuizDay = effectiveQuizDay,
                    scoreVisible = scoreVisible,
                    onOpenDashboard = onTakeTest,
                )
            }

            if (showDigestError) {
                TextButton(
                    onClick = onRetryLoad,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                ) {
                    Text("RETRY", color = DailyBlue, fontWeight = FontWeight.Bold)
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = DailyPanelRadius,
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFFFF1E4)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Rounded.Leaderboard, contentDescription = null, tint = Color(0xFFFF9800))
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = digestItem?.questionPrompt?.takeIf { it.isNotBlank() }?.let { "Question: $it" }
                            ?: quizStatusMessage
                            ?: if (showDigestError) "Daily quiz unavailable right now" else "Current Affairs Daily Quiz",
                        color = Color(0xFF303030),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 17.sp,
                    )
                }
                val factText = digestItem?.factText?.takeIf { it.isNotBlank() }
                if (factText != null) {
                    Text(
                        text = "Fact: $factText",
                        color = Color(0xFF5A5A5A),
                        fontSize = 14.sp,
                        modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp),
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
            LegendRow(label = "Today's quiz day", color = Color(0xFFB8D4FF))
            Spacer(Modifier.height(8.dp))
            LegendRow(label = "Attempted", color = Color(0xFFD6D8DF))
            Spacer(Modifier.height(8.dp))
            LegendRow(label = "Selected", color = DailyBlue)
            Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun DailyQuizDashboardPreviewCard(
    result: AppPreferencesRepository.DailyQuizDayResult,
    effectiveQuizDay: LocalDate,
    scoreVisible: Boolean,
    onOpenDashboard: () -> Unit,
) {
    val totalQ = result.totalQuestions
    val status = when {
        result.correctCount == totalQ -> DailyQuizQuestionStatus.CORRECT
        result.skippedCount == totalQ -> DailyQuizQuestionStatus.SKIPPED
        else -> DailyQuizQuestionStatus.WRONG
    }
    val dayLabel = result.day.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US))
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(onClick = onOpenDashboard),
        shape = DailyPanelRadius,
        colors = CardDefaults.cardColors(containerColor = Color(0xFFEEF4FF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                "Your Daily Quiz dashboard",
                fontWeight = FontWeight.SemiBold,
                fontSize = 17.sp,
                color = Color(0xFF1652D4),
            )
            Spacer(Modifier.height(6.dp))
            Text("Date: $dayLabel", color = Color(0xFF4A4A4A), fontSize = 14.sp)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column {
                    Text("Score", color = Color(0xFF666666), fontSize = 12.sp)
                    Text(
                        if (scoreVisible) "${result.correctCount} / $totalQ" else "-",
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        color = Color(0xFF10B981),
                    )
                }
                Column {
                    Text("Status", color = Color(0xFF666666), fontSize = 12.sp)
                    Text(
                        if (scoreVisible) status.label() else "-",
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        color = status.color(),
                    )
                }
                if (result.rank != null && result.rank > 0) {
                    Column {
                        Text("Rank", color = Color(0xFF666666), fontSize = 12.sp)
                        Text(
                            if (scoreVisible) {
                                val total = result.rankTotal?.takeIf { it > 0 }
                                if (total != null) "${result.rank} / $total" else result.rank.toString()
                            } else {
                                "-"
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            color = Color(0xFF2563EB),
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "Tap to open full dashboard (graphs & answer review)",
                color = Color(0xFF1652D4),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun LegendRow(label: String, color: Color) {
    Row(
        modifier = Modifier.padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(14.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(8.dp))
        Text(label, color = Color(0xFF505050), fontSize = 15.sp)
    }
}

@Composable
private fun DailyQuizResultScreen(
    modifier: Modifier,
    quizShareDay: LocalDate,
    quizScope: DailyQuizScopeSelection,
    displayName: String,
    userIdFormatted: String?,
    rank: Int?,
    rankTotal: Int?,
    dayResult: AppPreferencesRepository.DailyQuizDayResult?,
    syncMessage: String?,
    scoreVisible: Boolean,
    timeTakenSeconds: Long,
    showSolution: Boolean,
    onBack: () -> Unit,
    onClose: () -> Unit,
    onReAttempt: () -> Unit,
    onSolution: () -> Unit,
    shareSubject: String,
    shareTemplate: String,
) {
    val context = LocalContext.current
    val questions = dayResult?.questions.orEmpty()
    val totalQuestions = dayResult?.totalQuestions ?: questions.size.coerceAtLeast(1)
    val correctCount = dayResult?.correctCount ?: 0
    val wrongCount = dayResult?.wrongCount ?: 0
    val skippedCount = dayResult?.skippedCount ?: 0
    val questionStatus = when {
        correctCount == totalQuestions -> DailyQuizQuestionStatus.CORRECT
        skippedCount == totalQuestions -> DailyQuizQuestionStatus.SKIPPED
        else -> DailyQuizQuestionStatus.WRONG
    }
    val firstQuestion = questions.firstOrNull()
    val isCorrect = correctCount == totalQuestions && totalQuestions > 0
    val quizDateLabel = quizShareDay.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US))
    val userCodeLine = userIdFormatted?.takeIf { it.isNotBlank() } ?: "—"
    val visibleScore = if (scoreVisible) "$correctCount" else "-"
    val visibleOutOf = if (scoreVisible) "$totalQuestions" else "-"
    val accuracyPct = if (!scoreVisible) {
        "-"
    } else if (totalQuestions > 0) {
        "${(correctCount * 100) / totalQuestions}%"
    } else {
        "0%"
    }
    val selectedAnswer = firstQuestion?.selectedOptionIndex?.let { idx ->
        firstQuestion.options.getOrNull(idx)
    } ?: "Not answered"
    val correctAnswer = firstQuestion?.options?.getOrNull(firstQuestion.correctIndex).orEmpty()
    val shareQuestionPrompt = if (questions.size > 1) {
        "${questions.size} questions"
    } else {
        firstQuestion?.questionPrompt.orEmpty()
    }
    val minutes = (timeTakenSeconds / 60L).toInt()
    val seconds = (timeTakenSeconds % 60L).toInt()
    val solutionText = questions.mapIndexedNotNull { index, q ->
        q.explanation.trim().takeIf { it.isNotBlank() }?.let { exp ->
            if (questions.size > 1) "Q${index + 1}: $exp" else exp
        }
    }.joinToString("\n\n")
    var leaderboard by remember(quizShareDay, quizScope) { mutableStateOf<DailyQuizRepository.Leaderboard?>(null) }
    var leaderboardLoading by remember(quizShareDay, quizScope) { mutableStateOf(true) }

    LaunchedEffect(quizShareDay, quizScope, rank, rankTotal) {
        leaderboardLoading = true
        leaderboard = withContext(Dispatchers.IO) {
            DailyQuizRepository.loadLeaderboard(quizShareDay, scope = quizScope)
        }
        leaderboardLoading = false
    }

    Scaffold(
        containerColor = Color(0xFFF4F5F9),
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF4F5F9))
                    .padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Button(
                    onClick = onReAttempt,
                    modifier = Modifier.weight(1f).height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DailyBlue),
                    shape = DailyCardRadius,
                ) { Text("Re Attempt", color = Color.White, fontSize = 15.sp) }
                Button(
                    onClick = onSolution,
                    modifier = Modifier.weight(1f).height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF14B97A)),
                    shape = DailyCardRadius,
                ) { Text("Solution", color = Color.White, fontSize = 15.sp) }
            }
        },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            if (!syncMessage.isNullOrBlank()) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    shape = DailyPanelRadius,
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7ED)),
                ) {
                    Text(
                        text = syncMessage,
                        color = Color(0xFF92400E),
                        fontSize = 14.sp,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { onClose(); onBack() }) {
                    Icon(Icons.Rounded.Close, contentDescription = "Close", tint = Color(0xFF555555))
                }
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier.size(28.dp).clip(CircleShape).background(Color(0xFF1DBF73)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = dailyQuizProfileInitials(displayName),
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                IconButton(
                    onClick = {
                        val dateStr = quizShareDay.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US))
                        val prompt = truncateForShare(shareQuestionPrompt)
                        val scoreSummary = if (scoreVisible) {
                            "$correctCount / $totalQuestions · Time: ${minutes}m ${seconds}s"
                        } else {
                            "Completed (score hidden)"
                        }
                        val resultSummary = "Correct: $correctCount · Wrong: $wrongCount · Skipped: $skippedCount"
                        val fallback =
                            buildString {
                                appendLine("My Daily Quiz result — Mock Test App")
                                appendLine("Date: $dateStr")
                                if (prompt.isNotBlank()) {
                                    appendLine()
                                    appendLine(prompt)
                                }
                                appendLine()
                                appendLine("Score: $scoreSummary")
                                appendLine(resultSummary)
                                appendLine()
                                appendLine("Download: ${playStoreLink(context)}")
                            }
                        val body = resolveDailyShareTemplate(
                            template = shareTemplate,
                            date = dateStr,
                            question = prompt,
                            storeUrl = playStoreLink(context),
                            score = scoreSummary,
                            result = resultSummary,
                        ).ifBlank { fallback }
                        sharePlainText(context, shareSubject, body, "Share result")
                    },
                ) {
                    Icon(Icons.Rounded.Share, contentDescription = "Share", tint = Color(0xFF555555))
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = DailyPanelRadius,
                colors = CardDefaults.cardColors(containerColor = Color(0xFFDDF7FA)),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(modifier = Modifier.size(56.dp).clip(CircleShape).background(Color(0xFFEAF0F2)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.Person, contentDescription = null, tint = Color(0xFF8397A3), modifier = Modifier.size(32.dp))
                    }
                    Text("Daily Quiz", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Color(0xFF1652D4))
                    Text(displayName, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, color = Color(0xFF2B2B2B))
                    Text("ID: $userCodeLine · $quizDateLabel", color = Color(0xFF4E4E4E), fontSize = 14.sp)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ScoreBox(
                            title = "Daily Quiz Score",
                            value = visibleScore,
                            subtitle = "Out of $visibleOutOf",
                            valueColor = Color(0xFF10B981),
                            modifier = Modifier.weight(1f),
                        )
                        ScoreBox(
                            title = "Daily Quiz Rank",
                            value = if (scoreVisible && rank != null && rank > 0) rank.toString() else "-",
                            subtitle = if (rankTotal != null && rankTotal > 0) {
                                "Out of $rankTotal"
                            } else {
                                "Same day players"
                            },
                            valueColor = Color(0xFF2563EB),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Time Taken : ${String.format("%02d", minutes)} min, ${String.format("%02d", seconds)} sec",
                        color = Color(0xFF454545),
                        fontSize = 14.sp,
                    )
                }
            }

            DailyQuizLeaderboardSection(
                quizDayLabel = quizDateLabel,
                loading = leaderboardLoading,
                leaderboard = leaderboard,
                scoreVisible = scoreVisible,
                fallbackRank = rank,
                fallbackRankTotal = rankTotal,
            )

            AnalysisCard(questionStatus = questionStatus)
            DonutCard(
                title = "Daily Quiz — Brief Analysis",
                centerText = "Brief",
                values = dailyQuizDonutSegments(correctCount, wrongCount, skippedCount),
                sideStats = "Correct - $correctCount      Wrong - $wrongCount      Skipped - $skippedCount",
            )
            DonutCard(
                title = "Daily Quiz — Accuracy",
                centerText = "Accuracy\n$accuracyPct",
                values = if (scoreVisible) {
                    dailyQuizDonutSegments(correctCount, wrongCount, skippedCount)
                } else {
                    listOf(100f to Color(0xFFE7EBEF))
                },
                sideStats = "Correct - $correctCount      Wrong - $wrongCount      Skipped - $skippedCount",
            )
            Card(
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                shape = DailyPanelRadius,
                colors = CardDefaults.cardColors(containerColor = Color.White),
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
                    Text("Daily Quiz — Answer Review", color = Color(0xFF2E2E2E), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                    Spacer(Modifier.height(8.dp))
                    if (questions.isEmpty()) {
                        Text("No answers recorded.", color = Color(0xFF4A4A4A), fontSize = 14.sp)
                    } else {
                        questions.forEachIndexed { index, q ->
                            val qStatus = resolveDailyQuizQuestionStatus(q.selectedOptionIndex, q.correctIndex)
                            val yourAns = q.selectedOptionIndex?.let { idx -> q.options.getOrNull(idx) } ?: "Not answered"
                            val correctAns = q.options.getOrNull(q.correctIndex).orEmpty()
                            Text(
                                "Q${index + 1}: ${qStatus.label()}",
                                color = qStatus.color(),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text("Your answer: $yourAns", color = Color(0xFF4A4A4A), fontSize = 14.sp)
                            Text("Correct answer: $correctAns", color = Color(0xFF4A4A4A), fontSize = 14.sp)
                            if (index < questions.lastIndex) {
                                Spacer(Modifier.height(10.dp))
                            }
                        }
                    }
                }
            }
            if (showSolution && solutionText.isNotBlank()) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                    shape = DailyPanelRadius,
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                ) {
                    Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
                        Text("Solution", color = Color(0xFF2E2E2E), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(solutionText, color = Color(0xFF4A4A4A), fontSize = 14.sp, lineHeight = 21.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ScoreBox(
    title: String,
    value: String,
    subtitle: String,
    valueColor: Color,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = DailyPanelRadius,
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FBFC)),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, color = Color(0xFF666666), fontSize = 14.sp)
            Text(value, color = valueColor, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = Color(0xFF474747), fontSize = 13.sp)
        }
    }
}

@Composable
private fun DailyQuizLeaderboardSection(
    quizDayLabel: String,
    loading: Boolean,
    leaderboard: DailyQuizRepository.Leaderboard?,
    scoreVisible: Boolean,
    fallbackRank: Int?,
    fallbackRankTotal: Int?,
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
        shape = DailyPanelRadius,
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
            Text(
                "Daily Quiz Leaderboard — $quizDayLabel",
                color = Color(0xFF2E2E2E),
                fontWeight = FontWeight.SemiBold,
                fontSize = 18.sp,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "Rank 1, 2, 3… by correct answer first, then fastest time.",
                color = Color(0xFF6C6C6C),
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(10.dp))
            when {
                loading -> {
                    Text("Loading ranks…", color = Color(0xFF6B7280), fontSize = 14.sp)
                }
                !DailyQuizRepository.isLoggedIn() -> {
                    Text(
                        "Login to see today’s ranked list (1, 2, 3…).",
                        color = Color(0xFF6B7280),
                        fontSize = 14.sp,
                    )
                }
                leaderboard == null -> {
                    Text(
                        "Could not load leaderboard. Check internet and try again.",
                        color = Color(0xFFB91C1C),
                        fontSize = 14.sp,
                    )
                }
                leaderboard.entries.isEmpty() -> {
                    Text(
                        "No players yet for this day. Complete the quiz to appear as rank 1.",
                        color = Color(0xFF6B7280),
                        fontSize = 14.sp,
                    )
                }
                else -> {
                    val youRank = leaderboard.currentUserRank ?: fallbackRank
                    val total = leaderboard.totalPlayers.takeIf { it > 0 } ?: fallbackRankTotal
                    if (youRank != null && youRank > 0 && scoreVisible) {
                        Text(
                            "Your rank: #$youRank" + if (total != null && total > 0) " of $total" else "",
                            color = DailyBlue,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    leaderboard.entries.forEach { entry ->
                        DailyQuizLeaderboardRow(entry = entry, scoreVisible = scoreVisible)
                        Spacer(Modifier.height(6.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun DailyQuizLeaderboardRow(
    entry: DailyQuizRepository.LeaderboardEntry,
    scoreVisible: Boolean,
) {
    val rankColor = when (entry.rank) {
        1 -> Color(0xFFF59E0B)
        2 -> Color(0xFF94A3B8)
        3 -> Color(0xFFCD7F32)
        else -> Color(0xFF64748B)
    }
    val bg = if (entry.isCurrentUser) Color(0xFFE8F0FF) else Color(0xFFF8FAFC)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(rankColor),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                entry.rank.toString(),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (entry.isCurrentUser) "${entry.displayName} (You)" else entry.displayName,
                fontWeight = if (entry.isCurrentUser) FontWeight.Bold else FontWeight.SemiBold,
                fontSize = 15.sp,
                color = Color(0xFF1E293B),
            )
            val idLine = entry.publicId?.let { "ID $it" }.orEmpty()
            val resultLine = if (scoreVisible) {
                if (entry.isCorrect) "Correct · ${entry.timeTakenSeconds}s" else "Wrong · ${entry.timeTakenSeconds}s"
            } else {
                "Completed"
            }
            Text(
                text = listOf(idLine, resultLine).filter { it.isNotBlank() }.joinToString(" · "),
                fontSize = 12.sp,
                color = Color(0xFF64748B),
            )
        }
        if (scoreVisible) {
            Text(
                if (entry.isCorrect) "✓" else "✗",
                color = if (entry.isCorrect) Color(0xFF10B981) else Color(0xFFDC2626),
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
            )
        }
    }
}

private fun dailyQuizDonutSegments(
    correct: Int,
    wrong: Int,
    skipped: Int,
): List<Pair<Float, Color>> {
    val raw = listOf(
        correct.toFloat() to Color(0xFF10B981),
        wrong.toFloat() to Color(0xFFEB5757),
        skipped.toFloat() to Color(0xFFE7EBEF),
    ).filter { it.first > 0f }
    if (raw.isEmpty()) return listOf(100f to Color(0xFFE7EBEF))
    val sum = raw.sumOf { it.first.toDouble() }.toFloat().coerceAtLeast(1f)
    return raw.map { (portion, color) -> (portion / sum * 100f) to color }
}

@Composable
private fun AnalysisCard(questionStatus: DailyQuizQuestionStatus) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
        shape = DailyPanelRadius,
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Daily Quiz — Question Analysis", color = Color(0xFF2E2E2E), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Spacer(Modifier.height(8.dp))
            Text(
                "Green = correct · Red = wrong · Gray = skipped",
                color = Color(0xFF6C6C6C),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(questionStatus.color()),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "1",
                        color = if (questionStatus == DailyQuizQuestionStatus.SKIPPED) {
                            Color(0xFF4A4A4A)
                        } else {
                            Color.White
                        },
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "Q1 — ${questionStatus.label()}",
                color = questionStatus.color(),
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
        }
    }
}

@Composable
private fun DonutCard(
    title: String,
    centerText: String,
    values: List<Pair<Float, Color>>,
    sideStats: String,
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
        shape = DailyPanelRadius,
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, color = Color(0xFF2E2E2E), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Spacer(Modifier.height(8.dp))
            Text(sideStats, color = Color(0xFF6C6C6C), fontSize = 12.sp)
            Spacer(Modifier.height(8.dp))
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(190.dp)) {
                val segments = values.filter { it.first > 0f }.ifEmpty { listOf(100f to Color(0xFFE7EBEF)) }
                val segmentSum = segments.sumOf { it.first.toDouble() }.toFloat().coerceAtLeast(1f)
                androidx.compose.foundation.Canvas(modifier = Modifier.size(170.dp)) {
                    var start = -90f
                    segments.forEach { (portion, color) ->
                        val angle = (portion / segmentSum) * 360f
                        if (angle <= 0f) return@forEach
                        drawArc(
                            color = color,
                            startAngle = start,
                            sweepAngle = angle,
                            useCenter = false,
                            topLeft = Offset(12f, 12f),
                            size = Size(size.width - 24f, size.height - 24f),
                            style = Stroke(width = 30f, cap = StrokeCap.Butt),
                        )
                        start += angle
                    }
                }
                Box(
                    modifier = Modifier
                        .size(92.dp)
                        .clip(CircleShape)
                        .background(Color.White)
                        .border(1.dp, Color(0xFFD9DDE2), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(centerText, textAlign = TextAlign.Center, color = Color(0xFF4A4A4A), fontSize = 17.sp, lineHeight = 19.sp)
                }
            }
        }
    }
}
