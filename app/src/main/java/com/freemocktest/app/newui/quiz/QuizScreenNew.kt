@file:OptIn(
    androidx.compose.material3.ExperimentalMaterial3Api::class,
    kotlinx.coroutines.FlowPreview::class,
    androidx.compose.foundation.ExperimentalFoundationApi::class,
)

package com.freemocktest.app.newui.quiz

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.MoreVert
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.foundation.clickable
import android.app.Activity
import android.view.WindowManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.window.Dialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.BuildConfig
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.util.McqScoring
import com.freemocktest.app.util.ShuffleAttemptRules
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.Locale

/**
 * Live mock-test quiz UI.
 *
 * Scoring compares selected option **text** to admin correct text via [McqScoring]
 * (see [ShuffleAttemptRules] / SHUFFLE_AND_ATTEMPT_RULES.txt §6).
 * Resume restores a frozen [AppPreferencesRepository.QuizQuestionSnapshot] — no re-shuffle.
 */
@Composable
fun QuizScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    /** Same key as attempt sync ([drawer email][user id]); resume only when this matches saved session. */
    attemptsUserKey: String,
    onBack: () -> Unit,
    onSubmit: (Int, Int, Int, Int, Long) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val defaultResultReleaseAtMs = remember {
        System.currentTimeMillis() + BuildConfig.RESULT_RELEASE_DELAY_HOURS * 60L * 60L * 1000L
    }
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

    var questionsLoaded by remember(testName) { mutableStateOf(false) }
    var questionsLoadError by remember(testName) { mutableStateOf(false) }
    var questionsReloadKey by remember(testName) { mutableIntStateOf(0) }
    val quizLoad by produceState(
        initialValue = QuizQuestionsLoad(emptyList(), ""),
        key1 = testName,
        key2 = attemptsUserKey,
        key3 = questionsReloadKey,
    ) {
        questionsLoaded = false
        questionsLoadError = false
        val trimmedName = testName.trim().ifBlank { "Test" }
        val owner = attemptsUserKey.trim().ifBlank { "guest" }
        try {
            val saved = AppPreferencesRepository.getResumableQuizSession(owner, trimmedName)
            if (saved != null && saved.questionsSnapshot.isNotEmpty()) {
                value = QuizQuestionsLoad(
                    questions = saved.questionsSnapshot.map { it.toQuizQuestion() },
                    cycleKey = saved.cycleKey,
                )
                return@produceState
            }
            if (saved != null && saved.questionsSnapshot.isEmpty()) {
                // Pre-Phase-4 resume blob — cannot safely restore shuffled delivery; discard.
                AppPreferencesRepository.clearInProgressQuizNow()
            }
            val bundle = ContentRepository.loadQuizQuestionsBundleForTest(
                testName = testName,
                forceRefresh = true,
                cacheUserScope = attemptsUserKey,
            )
            value = QuizQuestionsLoad(
                questions = bundle.items.map { it.toQuizQuestion() },
                cycleKey = bundle.meta.cycleKey,
            )
        } catch (_: Exception) {
            value = QuizQuestionsLoad(emptyList(), "")
            questionsLoadError = true
        } finally {
            questionsLoaded = true
        }
    }
    val questions = quizLoad.questions
    val deliveryCycleKey = quizLoad.cycleKey
    var current by remember { mutableIntStateOf(0) }
    val answers = remember { mutableStateMapOf<Int, Int>() }
    var questionNavigationMode by remember { mutableStateOf("sequential") }
    var submitDialogBrand by remember { mutableStateOf("Mockers") }
    var submitDialogTitle by remember { mutableStateOf("Are you sure want to submit test") }
    var submitDialogSubtitle by remember { mutableStateOf("After submitting test you won't be able to re-attempt") }
    var resultReleaseAtMs by remember(testName) { mutableStateOf<Long?>(null) }
    var resultVisibility by remember(testName) { mutableStateOf("immediate") }
    var fullscreenRequired by remember(testName) { mutableStateOf(false) }
    var copyPasteBlocked by remember(testName) { mutableStateOf(false) }
    var resumeEnabled by remember(testName) { mutableStateOf(true) }
    var configuredDurationSeconds by remember(testName) { mutableIntStateOf(12 * 60) }

    LaunchedEffect(testName) {
        // CMS copy + per-test config; on failure the built-in defaults stay in effect
        // (12-min duration, sequential mode, no fullscreen/copy-paste/resume restrictions).
        try {
            val instruction = ContentRepository.loadInstructionContent()
            submitDialogBrand = instruction?.submitDialogBrand?.ifBlank { submitDialogBrand } ?: submitDialogBrand
            submitDialogTitle = instruction?.submitDialogTitle?.ifBlank { submitDialogTitle } ?: submitDialogTitle
            submitDialogSubtitle = instruction?.submitDialogSubtitle?.ifBlank { submitDialogSubtitle } ?: submitDialogSubtitle
            val mode = instruction?.questionNavigationMode
                ?.trim()
                ?.lowercase()
                ?.takeIf { it == "free" || it == "sequential" }
                ?: "sequential"
            questionNavigationMode = mode
            val testCard = ContentRepository.loadTestByTitle(testName)
            resultReleaseAtMs = parseIsoMillis(testCard?.resultReleaseAt)
            resultVisibility = testCard?.resultVisibility?.trim()?.lowercase(Locale.US).orEmpty()
                .ifBlank { "immediate" }
            fullscreenRequired = testCard?.fullscreenRequired == true
            copyPasteBlocked = testCard?.copyPasteBlocked == true
            resumeEnabled = testCard?.resumeEnabled != false
            configuredDurationSeconds = parseDurationSeconds(testCard?.durationLabel).coerceAtLeast(60)
        } catch (_: Exception) {
            // Defaults already initialised above remain in effect.
        }
    }

    var testCatalogId by remember(testName) { mutableStateOf("") }
    LaunchedEffect(testName) {
        // Failure here just leaves `testCatalogId` blank; resume/save still work, only the
        // server-side catalog id is missing in the persisted snapshot.
        try {
            val card = ContentRepository.loadTestByTitle(testName)
            testCatalogId = card?.id?.trim().orEmpty()
        } catch (_: Exception) {
            testCatalogId = ""
        }
    }

    var remainingSeconds by remember(testName) { mutableIntStateOf(12 * 60) }
    var deadlineAtMillis by remember(testName) { mutableLongStateOf(0L) }
    var quizSessionReady by remember(testName) { mutableStateOf(false) }
    var quizSessionInitialized by remember(testName) { mutableStateOf(false) }
    /** When true, skip ON_PAUSE disk flush so we never resurrect a cleared in-progress snapshot after submit/timeout/exit. */
    var suppressOnPauseProgressFlush by remember(testName) { mutableStateOf(false) }

    fun finishQuizExplicitExit() {
        suppressOnPauseProgressFlush = true
        scope.launch {
            // DataStore cleanup is best-effort; the user must always be able to navigate back
            // even if local persistence throws.
            try {
                AppPreferencesRepository.clearInProgressQuizNow()
            } catch (_: Exception) {
                // Ignore: stale resume snapshot will be overwritten on next quiz start.
            }
            onBack()
        }
    }

    val displayQuestions = remember(questions) { questions }
    val totalQuestions = displayQuestions.size

    fun buildPersistedQuizState(
        owner: String,
        trimmedName: String,
        idx: Int,
        ans: Map<Int, Int>,
    ): AppPreferencesRepository.InProgressQuizState {
        return AppPreferencesRepository.InProgressQuizState(
            ownerUserKey = owner,
            testName = trimmedName,
            testCatalogId = testCatalogId.trim(),
            deadlineAtMillis = deadlineAtMillis,
            currentQuestionIndex = idx,
            answers = ans,
            questionNavigationMode = questionNavigationMode,
            resultReleaseAtMillis = resultReleaseAtMs,
            configuredDurationSeconds = configuredDurationSeconds.coerceAtLeast(60),
            cycleKey = deliveryCycleKey,
            questionsSnapshot = displayQuestions.map { it.toSnapshot() },
        )
    }

    LaunchedEffect(testName, attemptsUserKey, questionsLoaded, questions.size, configuredDurationSeconds) {
        if (!questionsLoaded || displayQuestions.isEmpty()) return@LaunchedEffect
        if (quizSessionInitialized) return@LaunchedEffect
        quizSessionInitialized = true
        val trimmedName = testName.trim().ifBlank { "Test" }
        val owner = attemptsUserKey.trim().ifBlank { "guest" }
        var allowResume = true
        // Resume snapshot read can throw (DataStore corruption / IO). On any failure we fall
        // back to a fresh session with the configured duration so the user is never stranded
        // with `quizSessionReady = false` (which would leave the timer effect inert and the
        // quiz UI permanently disabled).
        try {
            val testCard = runCatching { ContentRepository.loadTestByTitle(trimmedName) }.getOrNull()
            if (testCard != null) {
                allowResume = testCard.resumeEnabled != false
                resumeEnabled = allowResume
                fullscreenRequired = testCard.fullscreenRequired
                copyPasteBlocked = testCard.copyPasteBlocked
            } else {
                allowResume = resumeEnabled
            }
            if (!allowResume) {
                runCatching { AppPreferencesRepository.clearInProgressQuizNow() }
            }
            val saved = if (allowResume) {
                AppPreferencesRepository.getResumableQuizSession(owner, trimmedName)
            } else {
                null
            }
            val now = System.currentTimeMillis()
            if (saved != null) {
                deadlineAtMillis = saved.deadlineAtMillis
                questionNavigationMode = saved.questionNavigationMode
                saved.resultReleaseAtMillis?.let { resultReleaseAtMs = it }
                val maxIdx = (displayQuestions.size - 1).coerceAtLeast(0)
                current = saved.currentQuestionIndex.coerceIn(0, maxIdx)
                answers.clear()
                saved.answers.forEach { (qi, ai) ->
                    if (qi >= 0 && qi < displayQuestions.size) answers[qi] = ai
                }
            } else {
                val durSec = configuredDurationSeconds.coerceAtLeast(60)
                deadlineAtMillis = now + durSec * 1000L
            }
        } catch (_: Exception) {
            val durSec = configuredDurationSeconds.coerceAtLeast(60)
            deadlineAtMillis = System.currentTimeMillis() + durSec * 1000L
        }
        quizSessionReady = true
        if (allowResume) {
            runCatching {
                AppPreferencesRepository.saveInProgressQuizNow(
                    buildPersistedQuizState(owner, trimmedName, current, answers.toMap()),
                )
            }
        }
    }

    LaunchedEffect(quizSessionReady, deadlineAtMillis, questionsLoaded, questions.size, testName) {
        if (!quizSessionReady || deadlineAtMillis <= 0L || !questionsLoaded || displayQuestions.isEmpty()) {
            return@LaunchedEffect
        }
        while (true) {
            val now = System.currentTimeMillis()
            val rem = ((deadlineAtMillis - now) / 1000L).toInt().coerceAtLeast(0)
            remainingSeconds = rem
            if (rem <= 0) break
            delay(1000)
        }
        suppressOnPauseProgressFlush = true
        // CRITICAL: cleanup must never block the auto-submit. If clearing the resume snapshot
        // throws, the user's score still has to reach `onSubmit(...)` — otherwise their
        // entire timed attempt would be lost.
        try {
            val owner = attemptsUserKey.trim().ifBlank { "guest" }
            val trimmedName = testName.trim().ifBlank { "Test" }
            if (displayQuestions.isNotEmpty()) {
                AppPreferencesRepository.saveSubmittedAttemptSnapshotNow(
                    ownerUserKey = owner,
                    testName = trimmedName,
                    cycleKey = deliveryCycleKey,
                    questions = displayQuestions.map { it.toSnapshot() },
                    answers = answers.toMap(),
                )
            }
            AppPreferencesRepository.clearInProgressQuizNow()
        } catch (_: Exception) {
            // Stale snapshot will be cleared on the next quiz start; not user-actionable.
        }
        val correct = countCorrectAnswers(displayQuestions, answers)
        val answered = answers.size
        val wrong = (answered - correct).coerceAtLeast(0)
        onSubmit(
            answered,
            correct,
            wrong,
            totalQuestions,
            com.freemocktest.app.util.TestScheduleUtils.resolveResultReleaseMillisForSubmit(
                resultVisibility = resultVisibility,
                resultReleaseAtMs = resultReleaseAtMs,
                defaultReleaseAtMs = defaultResultReleaseAtMs,
            ),
        )
    }

    LaunchedEffect(
        quizSessionReady,
        testName,
        attemptsUserKey,
        deadlineAtMillis,
        questionNavigationMode,
        resultReleaseAtMs,
        configuredDurationSeconds,
        testCatalogId,
        resumeEnabled,
    ) {
        if (!quizSessionReady || deadlineAtMillis <= 0L || !resumeEnabled) return@LaunchedEffect
        val trimmedName = testName.trim().ifBlank { "Test" }
        val owner = attemptsUserKey.trim().ifBlank { "guest" }
        snapshotFlow { current to answers.toMap() }
            .debounce(400L)
            .collectLatest { (idx, ans) ->
                // Per-write try/catch: a single DataStore failure must not cancel the entire
                // collector flow, otherwise subsequent answer changes would silently stop saving.
                runCatching {
                    AppPreferencesRepository.saveInProgressQuizNow(
                        buildPersistedQuizState(owner, trimmedName, idx, ans),
                    )
                }
            }
    }

    // Flush immediately on background so the last answer / navigation is not lost inside the
    // 400ms debounce window (incoming call, Home gesture, split-screen, etc.).
    val lifecycleOwner = LocalLifecycleOwner.current
    val quizSessionReadyRef = rememberUpdatedState(quizSessionReady)
    val deadlineAtMillisRef = rememberUpdatedState(deadlineAtMillis)
    val questionsLoadedRef = rememberUpdatedState(questionsLoaded)
    val questionsSizeRef = rememberUpdatedState(questions.size)
    val currentRef = rememberUpdatedState(current)
    val answersMapRef = rememberUpdatedState(answers.toMap())
    val questionNavigationModeRef = rememberUpdatedState(questionNavigationMode)
    val resultReleaseAtMsRef = rememberUpdatedState(resultReleaseAtMs)
    val configuredDurationSecondsRef = rememberUpdatedState(configuredDurationSeconds)
    val testCatalogIdRef = rememberUpdatedState(testCatalogId)
    val testNameRef = rememberUpdatedState(testName)
    val attemptsUserKeyRef = rememberUpdatedState(attemptsUserKey)
    val deliveryCycleKeyRef = rememberUpdatedState(deliveryCycleKey)
    val displayQuestionsRef = rememberUpdatedState(displayQuestions)
    val suppressOnPauseProgressFlushRef = rememberUpdatedState(suppressOnPauseProgressFlush)
    val resumeEnabledRef = rememberUpdatedState(resumeEnabled)
    DisposableEffect(lifecycleOwner, scope) {
        val observer = LifecycleEventObserver { _, event ->
            if (event != Lifecycle.Event.ON_PAUSE) return@LifecycleEventObserver
            if (suppressOnPauseProgressFlushRef.value) return@LifecycleEventObserver
            if (!resumeEnabledRef.value) return@LifecycleEventObserver
            if (
                !quizSessionReadyRef.value ||
                deadlineAtMillisRef.value <= 0L ||
                !questionsLoadedRef.value ||
                questionsSizeRef.value == 0
            ) {
                return@LifecycleEventObserver
            }
            scope.launch {
                runCatching {
                    val trimmedName = testNameRef.value.trim().ifBlank { "Test" }
                    val owner = attemptsUserKeyRef.value.trim().ifBlank { "guest" }
                    AppPreferencesRepository.saveInProgressQuizNow(
                        AppPreferencesRepository.InProgressQuizState(
                            ownerUserKey = owner,
                            testName = trimmedName,
                            testCatalogId = testCatalogIdRef.value.trim(),
                            deadlineAtMillis = deadlineAtMillisRef.value,
                            currentQuestionIndex = currentRef.value,
                            answers = answersMapRef.value,
                            questionNavigationMode = questionNavigationModeRef.value,
                            resultReleaseAtMillis = resultReleaseAtMsRef.value,
                            configuredDurationSeconds = configuredDurationSecondsRef.value.coerceAtLeast(60),
                            cycleKey = deliveryCycleKeyRef.value,
                            questionsSnapshot = displayQuestionsRef.value.map { it.toSnapshot() },
                        ),
                    )
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    val answeredCount = answers.size
    val unansweredCount = totalQuestions - answeredCount
    val unlockedUntil = remember(answers.size, totalQuestions, questionNavigationMode) {
        if (questionNavigationMode == "free") {
            totalQuestions - 1
        } else {
            (0 until totalQuestions).firstOrNull { idx -> answers[idx] == null } ?: (totalQuestions - 1)
        }
    }

    var overviewOpen by remember { mutableStateOf(false) }
    val overviewSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    var showExitConfirm by remember { mutableStateOf(false) }
    var showSubmitConfirm by remember { mutableStateOf(false) }
    val interactionLocked = false

    BackHandler {
        showExitConfirm = true
    }

    DisposableEffect(fullscreenRequired, copyPasteBlocked) {
        val activity = context as? Activity
        if (activity == null) return@DisposableEffect onDispose {}
        val window = activity.window
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        var appliedFullscreen = false
        var appliedSecure = false
        if (fullscreenRequired) {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            appliedFullscreen = true
        }
        if (copyPasteBlocked) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            appliedSecure = true
        }
        onDispose {
            if (appliedFullscreen) {
                controller.show(WindowInsetsCompat.Type.systemBars())
                WindowCompat.setDecorFitsSystemWindows(window, true)
            }
            if (appliedSecure) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }

    val isLoadingQuestions = !questionsLoaded
    val hasLoadError = questionsLoaded && questionsLoadError
    val hasNoQuestions = questionsLoaded && !questionsLoadError && questions.isEmpty()

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            if (isLoadingQuestions || hasNoQuestions || hasLoadError) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { finishQuizExplicitExit() }) {
                        Icon(
                            imageVector = Icons.Rounded.ArrowBack,
                            contentDescription = "Back",
                            tint = p.textPrimary,
                        )
                    }
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = "Quiz",
                        color = p.textPrimary,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    text = testName,
                    color = p.primaryButton,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
                Spacer(Modifier.height(12.dp))
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        val headlineText = when {
                            isLoadingQuestions -> "Loading questions..."
                            hasLoadError -> "Couldn't load questions"
                            else -> "No questions available"
                        }
                        val bodyText = when {
                            isLoadingQuestions -> "Please wait while this test is prepared."
                            hasLoadError -> "Check your connection and tap Retry."
                            else -> "This test has no published questions yet. Contact admin and try again later."
                        }
                        Text(
                            text = headlineText,
                            color = p.textPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = bodyText,
                            color = p.textSecondary,
                            fontSize = 12.sp,
                        )
                        if (isLoadingQuestions) {
                            Spacer(Modifier.height(12.dp))
                            CircularProgressIndicator(color = p.accent)
                        }
                        if (hasLoadError) {
                            Spacer(Modifier.height(14.dp))
                            Button(
                                onClick = { questionsReloadKey += 1 },
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = p.primaryButton,
                                    contentColor = p.onPrimaryButton,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Retry", fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                        GhostButton(
                            text = "Back",
                            enabled = true,
                            onClick = { finishQuizExplicitExit() },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                return@Scaffold
            }

            TopBar(
                current = current + 1,
                total = totalQuestions.coerceAtLeast(1),
                remainingSeconds = remainingSeconds,
                onBack = { showExitConfirm = true },
                onSubmit = { showSubmitConfirm = true },
                onOpenOverview = { if (!interactionLocked) overviewOpen = true },
            )

            Spacer(Modifier.height(12.dp))
            Text(
                text = testName,
                color = p.primaryButton,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
            if (fullscreenRequired || copyPasteBlocked || !resumeEnabled) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = buildRuleHint(fullscreenRequired, copyPasteBlocked, resumeEnabled),
                    color = p.answerWrongStart,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }

            Spacer(Modifier.height(12.dp))

            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            text = "Answered: $answeredCount / $totalQuestions",
                            color = p.textSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Unanswered: $unansweredCount",
                            color = p.error,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    QuestionStrip(
                        total = totalQuestions,
                        currentIndex = current,
                        answered = answers.keys,
                        unlockedUntil = unlockedUntil,
                        onSelect = { idx ->
                            if (!interactionLocked && idx <= unlockedUntil) current = idx
                        },
                        onOverflowClick = { if (!interactionLocked) overviewOpen = true },
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Use chained `getOrNull` so a transient `displayQuestions == emptyList()` snapshot
            // (e.g. mid-reload) can't trigger NoSuchElementException; we just render an empty
            // placeholder card for one frame until the upstream guard re-routes the UI.
            val activeQuestion = displayQuestions.getOrNull(current) ?: displayQuestions.firstOrNull()
            if (activeQuestion != null) {
                val questionTitle = "Q${current + 1}. ${activeQuestion.title}"
                QuestionCard(
                    title = questionTitle,
                    options = activeQuestion.options,
                    selected = answers[current],
                    copyPasteBlocked = copyPasteBlocked,
                    onSelect = { option -> answers[current] = option },
                )
            }

            Spacer(Modifier.height(14.dp))

            BottomNav(
                canPrev = current > 0,
                canNext = current < unlockedUntil,
                onPrev = { if (current > 0) current -= 1 },
                onNext = { if (current < unlockedUntil) current += 1 },
            )
        }
    }

    if (overviewOpen) {
        ModalBottomSheet(
            onDismissRequest = { overviewOpen = false },
            sheetState = overviewSheetState,
            containerColor = p.surface,
            dragHandle = null,
        ) {
            QuestionOverviewSheetContent(
                total = totalQuestions,
                currentIndex = current,
                unlockedUntil = unlockedUntil,
                answeredIndices = answers.keys,
                onPickQuestion = { idx ->
                    if (idx <= unlockedUntil) {
                        current = idx
                        overviewOpen = false
                    }
                },
            )
        }
    }

    if (showExitConfirm) {
        AlertDialog(
            onDismissRequest = { showExitConfirm = false },
            title = { Text("Are you sure to exit?") },
            text = { Text("Your test progress may be lost.") },
            confirmButton = {
                Button(
                    onClick = {
                        showExitConfirm = false
                        finishQuizExplicitExit()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = p.primaryButton),
                ) {
                    Text("Exit", color = p.onPrimaryButton)
                }
            },
            dismissButton = {
                Button(
                    onClick = { showExitConfirm = false },
                    colors = ButtonDefaults.buttonColors(containerColor = p.surface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.2f)),
                ) {
                    Text("Cancel", color = p.textPrimary)
                }
            },
        )
    }

    if (showSubmitConfirm) {
        SubmitTestDialog(
            brand = submitDialogBrand,
            title = submitDialogTitle,
            subtitle = submitDialogSubtitle,
            remainingSeconds = remainingSeconds,
            attemptedCount = answeredCount,
            unattemptedCount = unansweredCount,
            markedForReviewCount = 0,
            onClose = { showSubmitConfirm = false },
            onCancel = { showSubmitConfirm = false },
            onSubmit = {
                suppressOnPauseProgressFlush = true
                showSubmitConfirm = false
                scope.launch {
                    // CRITICAL: cleanup is best-effort but the score MUST always be forwarded
                    // to `onSubmit(...)`. A DataStore exception below would otherwise discard
                    // the user's entire attempt.
                    try {
                        val owner = attemptsUserKey.trim().ifBlank { "guest" }
                        val trimmedName = testName.trim().ifBlank { "Test" }
                        if (displayQuestions.isNotEmpty()) {
                            AppPreferencesRepository.saveSubmittedAttemptSnapshotNow(
                                ownerUserKey = owner,
                                testName = trimmedName,
                                cycleKey = deliveryCycleKey,
                                questions = displayQuestions.map { it.toSnapshot() },
                                answers = answers.toMap(),
                            )
                        }
                        AppPreferencesRepository.clearInProgressQuizNow()
                    } catch (_: Exception) {
                        // Ignored: stale snapshot will be overwritten on next quiz start.
                    }
                    val correct = countCorrectAnswers(displayQuestions, answers)
                    val answered = answers.size
                    val wrong = (answered - correct).coerceAtLeast(0)
                    onSubmit(
            answered,
            correct,
            wrong,
            totalQuestions,
            com.freemocktest.app.util.TestScheduleUtils.resolveResultReleaseMillisForSubmit(
                resultVisibility = resultVisibility,
                resultReleaseAtMs = resultReleaseAtMs,
                defaultReleaseAtMs = defaultResultReleaseAtMs,
            ),
        )
                }
            },
        )
    }
}

private data class QuizQuestionsLoad(
    val questions: List<QuizQuestion>,
    val cycleKey: String,
)

private data class QuizQuestion(
    val title: String,
    val options: List<String>,
    val correctIndex: Int,
    val correctOptionText: String = "",
    val explanation: String = "",
)

private fun ContentRepository.QuizQuestionRemote.toQuizQuestion(): QuizQuestion {
    val cot = correctOptionText.trim().ifBlank { options.getOrNull(correctIndex).orEmpty() }
    return QuizQuestion(
        title = title,
        options = options,
        correctIndex = correctIndex,
        correctOptionText = cot,
        explanation = explanation,
    )
}

private fun AppPreferencesRepository.QuizQuestionSnapshot.toQuizQuestion(): QuizQuestion {
    val cot = correctOptionText.trim().ifBlank { options.getOrNull(correctIndex).orEmpty() }
    return QuizQuestion(
        title = title,
        options = options,
        correctIndex = correctIndex,
        correctOptionText = cot,
        explanation = explanation,
    )
}

private fun QuizQuestion.toSnapshot(): AppPreferencesRepository.QuizQuestionSnapshot {
    val cot = correctOptionText.trim().ifBlank { options.getOrNull(correctIndex).orEmpty() }
    return AppPreferencesRepository.QuizQuestionSnapshot(
        title = title,
        options = options,
        correctIndex = correctIndex,
        correctOptionText = cot,
        explanation = explanation,
    )
}

private fun countCorrectAnswers(questions: List<QuizQuestion>, answers: Map<Int, Int>): Int {
    return answers.count { (q, ans) ->
        val question = questions.getOrNull(q) ?: return@count false
        McqScoring.isAnswerCorrect(
            options = question.options,
            correctIndex = question.correctIndex,
            correctOptionText = question.correctOptionText,
            selectedIndex = ans,
        )
    }
}

@Composable
private fun SubmitTestDialog(
    brand: String,
    title: String,
    subtitle: String,
    remainingSeconds: Int,
    attemptedCount: Int,
    unattemptedCount: Int,
    markedForReviewCount: Int,
    onClose: () -> Unit,
    onCancel: () -> Unit,
    onSubmit: () -> Unit,
) {
    Dialog(onDismissRequest = onClose) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1451D8))
                        .padding(horizontal = 18.dp, vertical = 16.dp),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = brand,
                            color = Color.White,
                            fontWeight = FontWeight.Medium,
                            fontSize = 28.sp,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = title,
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 20.sp,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = subtitle,
                            color = Color.White.copy(alpha = 0.75f),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                        )
                    }
                    IconButton(
                        onClick = onClose,
                        modifier = Modifier.align(Alignment.TopEnd),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = "Close",
                            tint = Color.White,
                        )
                    }
                }

                Column(
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    SubmitStatRow(
                        icon = Icons.Outlined.Timer,
                        iconTint = Color(0xFFFA4B4B),
                        label = "Time Left",
                        value = "${remainingSeconds / 60} min, ${remainingSeconds % 60} sec",
                    )
                    SubmitStatRow(
                        icon = Icons.Outlined.CheckCircle,
                        iconTint = Color(0xFF20C86B),
                        label = "Attempted",
                        value = attemptedCount.toString(),
                    )
                    SubmitStatRow(
                        icon = Icons.Outlined.Close,
                        iconTint = Color(0xFFF3BC2F),
                        label = "Unattempted",
                        value = unattemptedCount.toString(),
                    )
                    SubmitStatRow(
                        icon = Icons.Outlined.Flag,
                        iconTint = Color(0xFF4AB9E9),
                        label = "Marked for review",
                        value = markedForReviewCount.toString(),
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            onClick = onCancel,
                            modifier = Modifier.weight(1f).height(48.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8589A8)),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("Cancel", color = Color.White, fontSize = 16.sp)
                        }
                        Button(
                            onClick = onSubmit,
                            modifier = Modifier.weight(1f).height(48.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF20C86B)),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("Submit", color = Color.White, fontSize = 16.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SubmitStatRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: Color,
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = iconTint,
            modifier = Modifier.size(28.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = label,
            color = Color(0xFF1A2138),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            color = Color(0xFF6C738C),
            fontWeight = FontWeight.Medium,
            fontSize = 15.sp,
        )
    }
}

@Composable
private fun TopBar(
    current: Int,
    total: Int,
    remainingSeconds: Int,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
    onOpenOverview: () -> Unit,
) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.Rounded.ArrowBack,
                    contentDescription = "Back",
                    tint = p.textPrimary,
                )
            }
            Spacer(Modifier.width(2.dp))
            Text(
                text = "Question $current/$total",
                color = p.textSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }

        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            TimerPillCentered(seconds = remainingSeconds)
        }

        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End,
        ) {
            IconButton(onClick = onOpenOverview) {
                Icon(
                    imageVector = Icons.Rounded.MoreVert,
                    contentDescription = "All questions",
                    tint = p.textPrimary,
                )
            }
            Spacer(Modifier.width(4.dp))
            SubmitButtonHighlighted(onClick = onSubmit)
        }
    }
}

@Composable
private fun TimerPillCentered(seconds: Int) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(999.dp)
    val text = formatTime(seconds)
    Row(
        modifier = Modifier
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.2f), shape)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            color = p.textPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

@Composable
private fun SubmitButtonHighlighted(onClick: () -> Unit) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(999.dp)
    val blue = p.systemBlue
    Row(
        modifier = Modifier
            .clip(shape)
            .background(blue)
            .border(1.dp, Color.White.copy(alpha = 0.35f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Submit",
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

@Composable
private fun QuestionStrip(
    total: Int,
    currentIndex: Int,
    answered: Set<Int>,
    unlockedUntil: Int,
    onSelect: (Int) -> Unit,
    onOverflowClick: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        for (i in 0 until minOf(total, 6)) {
            val selected = i == currentIndex
            val isAnswered = i in answered
            val isLocked = i > unlockedUntil
            QuestionChip(
                text = (i + 1).toString(),
                selected = selected,
                answered = isAnswered,
                locked = isLocked,
                onClick = { onSelect(i) },
            )
        }
        if (total > 6) {
            QuestionChip(
                text = "…",
                selected = false,
                answered = false,
                locked = false,
                onClick = onOverflowClick,
            )
        }
    }
}

@Composable
private fun QuestionChip(
    text: String,
    selected: Boolean,
    answered: Boolean,
    locked: Boolean,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(14.dp)
    val bg = when {
        selected -> p.primaryButton
        locked -> p.surfaceTrack
        else -> p.surface
    }
    val fg = if (selected) p.onPrimaryButton else p.textPrimary
    val borderCol = if (answered) p.accent.copy(alpha = 0.45f) else p.border.copy(alpha = 0.14f)

    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(shape)
            .background(bg)
            .border(1.dp, borderCol, shape)
            .clickable(enabled = !locked, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (locked) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = "Locked",
                tint = p.textSecondary,
                modifier = Modifier.size(14.dp),
            )
        } else {
            Text(text = text, color = fg, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun QuestionCard(
    title: String,
    options: List<String>,
    selected: Int?,
    copyPasteBlocked: Boolean,
    onSelect: (Int) -> Unit,
) {
    val p = mockTestPalette()
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = title,
                color = p.textPrimary,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 15.sp,
            )
            Spacer(Modifier.height(12.dp))

            options.forEachIndexed { idx, text ->
                OptionRow(
                    text = text,
                    selected = selected == idx,
                    copyPasteBlocked = copyPasteBlocked,
                    onClick = { onSelect(idx) },
                )
                Spacer(Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun OptionRow(
    text: String,
    selected: Boolean,
    copyPasteBlocked: Boolean,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(16.dp)
    val borderCol = if (selected) p.primaryButton else p.border.copy(alpha = 0.14f)
    val rowModifier = Modifier
        .fillMaxWidth()
        .defaultMinSize(minHeight = 52.dp)
        .clip(shape)
        .background(p.surface)
        .border(1.dp, borderCol, shape)
        .then(
            if (copyPasteBlocked) {
                Modifier.combinedClickable(
                    onClick = onClick,
                    onLongClick = { /* consume long-press copy */ },
                )
            } else {
                Modifier.clickable(onClick = onClick)
            },
        )
        .padding(horizontal = 14.dp, vertical = 10.dp)
    Row(
        modifier = rowModifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioDot(selected = selected)
        Spacer(Modifier.width(12.dp))
        Text(
            text = text,
            color = p.textPrimary,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun RadioDot(selected: Boolean) {
    val p = mockTestPalette()
    val outer = RoundedCornerShape(999.dp)
    Box(
        modifier = Modifier
            .size(18.dp)
            .clip(outer)
            .border(1.dp, p.textSecondary, outer),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(outer)
                    .background(p.primaryButton),
            )
        }
    }
}

@Composable
private fun BottomNav(
    canPrev: Boolean,
    canNext: Boolean,
    onPrev: () -> Unit,
    onNext: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        GhostButton(
            text = "Prev",
            enabled = canPrev,
            onClick = onPrev,
            modifier = Modifier.weight(1f),
        )
        SolidButton(
            text = "Next",
            enabled = canNext,
            onClick = onNext,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun GhostButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.surface,
            contentColor = p.textPrimary,
            disabledContainerColor = p.surface.copy(alpha = 0.6f),
            disabledContentColor = p.textPrimary.copy(alpha = 0.5f),
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.border.copy(alpha = 0.16f)),
    ) {
        Text(text = text, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SolidButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.primaryButton,
            contentColor = p.onPrimaryButton,
            disabledContainerColor = p.primaryButton.copy(alpha = 0.6f),
            disabledContentColor = p.onPrimaryButton.copy(alpha = 0.6f),
        ),
    ) {
        Text(text = text, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun QuestionOverviewSheetContent(
    total: Int,
    currentIndex: Int,
    unlockedUntil: Int,
    answeredIndices: Set<Int>,
    onPickQuestion: (Int) -> Unit,
) {
    val p = mockTestPalette()
    val pageSize = 50
    val totalPages = ((total + pageSize - 1) / pageSize).coerceAtLeast(1)
    var selectedPage by remember(currentIndex, totalPages) {
        mutableIntStateOf((currentIndex / pageSize).coerceIn(0, totalPages - 1))
    }
    val pageStart = selectedPage * pageSize
    val pageEndExclusive = minOf(total, pageStart + pageSize)
    val pageQuestionsCount = (pageEndExclusive - pageStart).coerceAtLeast(0)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Text(
            text = "Question overview",
            color = p.textPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Green = answered · Orange = missed · Ring = current · Lock = not reached yet",
            color = p.textSecondary,
            fontSize = 12.sp,
            lineHeight = 17.sp,
        )
        Spacer(Modifier.height(14.dp))
        if (totalPages > 1) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                repeat(totalPages) { page ->
                    val from = page * pageSize + 1
                    val to = minOf(total, (page + 1) * pageSize)
                    val isSelected = selectedPage == page
                    PageRangeChip(
                        label = "$from-$to",
                        selected = isSelected,
                        onClick = { selectedPage = page },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        OverviewLegendRow()
        Spacer(Modifier.height(12.dp))
        val cols = 5
        val rows = (pageQuestionsCount + cols - 1) / cols
        for (r in 0 until rows) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (c in 0 until cols) {
                    val localIdx = r * cols + c
                    if (localIdx >= pageQuestionsCount) {
                        Spacer(modifier = Modifier.weight(1f))
                    } else {
                        val idx = pageStart + localIdx
                        OverviewQuestionCell(
                            number = idx + 1,
                            index = idx,
                            currentIndex = currentIndex,
                            unlockedUntil = unlockedUntil,
                            answered = idx in answeredIndices,
                            onClick = { onPickQuestion(idx) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun PageRangeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier = modifier
            .height(36.dp)
            .clip(shape)
            .background(if (selected) p.primaryButton else p.surface)
            .border(1.dp, p.border.copy(alpha = if (selected) 0.35f else 0.18f), shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (selected) p.onPrimaryButton else p.textPrimary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun OverviewLegendRow() {
    val p = mockTestPalette()
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LegendItem(color = p.success, label = "Answered")
        LegendItem(color = p.answerWrongStart, label = "Missed")
        LegendItem(color = p.surfaceTrack, label = "Pending", showLock = true)
    }
}

@Composable
private fun LegendItem(
    color: Color,
    label: String,
    showLock: Boolean = false,
) {
    val p = mockTestPalette()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(color),
        )
        Spacer(Modifier.width(6.dp))
        if (showLock) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = null,
                tint = p.textSecondary,
                modifier = Modifier.size(12.dp),
            )
            Spacer(Modifier.width(4.dp))
        }
        Text(
            text = label,
            color = p.textSecondary,
            fontSize = 11.sp,
        )
    }
}

@Composable
private fun OverviewQuestionCell(
    number: Int,
    index: Int,
    currentIndex: Int,
    unlockedUntil: Int,
    answered: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val locked = index > unlockedUntil
    val skipped = index < currentIndex && !answered
    val isCurrent = index == currentIndex

    val fillColor = when {
        locked -> p.surfaceTrack
        answered -> p.success
        skipped -> p.answerWrongStart.copy(alpha = 0.38f)
        isCurrent -> p.surfaceElevated
        else -> p.surfaceElevated
    }
    val borderColor = when {
        locked -> p.border.copy(alpha = 0.12f)
        isCurrent && !answered && !locked -> p.primaryButton
        answered -> p.success.copy(alpha = 0.85f)
        skipped -> p.error.copy(alpha = 0.5f)
        else -> p.border.copy(alpha = 0.16f)
    }
    val borderWidth = if (isCurrent && !answered && !locked) 2.dp else 1.dp
    val shape = RoundedCornerShape(12.dp)

    Box(
        modifier = modifier
            .height(48.dp)
            .clip(shape)
            .background(fillColor)
            .border(borderWidth, borderColor, shape)
            .clickable(enabled = !locked, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (locked) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = "Locked",
                tint = p.textSecondary,
                modifier = Modifier.size(20.dp),
            )
        } else {
            Text(
                text = number.toString(),
                color = when {
                    answered -> Color.White
                    else -> p.textPrimary
                },
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }
    }
}

private fun formatTime(totalSeconds: Int): String {
    val m = (totalSeconds / 60).coerceAtLeast(0)
    val s = (totalSeconds % 60).coerceAtLeast(0)
    return "%d:%02d".format(m, s)
}

private fun parseIsoMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    return try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: Exception) {
        null
    }
}

private fun parseDurationSeconds(durationLabel: String?): Int {
    val raw = durationLabel?.trim().orEmpty().lowercase()
    if (raw.isBlank()) return 12 * 60
    val hourMatch = Regex("(\\d+)\\s*(hr|hrs|hour|hours)").find(raw)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0
    val minMatch = Regex("(\\d+)\\s*(min|mins|minute|minutes)").find(raw)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0
    val totalMinutes = when {
        hourMatch > 0 || minMatch > 0 -> hourMatch * 60 + minMatch
        else -> Regex("(\\d+)").find(raw)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 12
    }
    return totalMinutes.coerceAtLeast(1) * 60
}

private fun buildRuleHint(fullscreenRequired: Boolean, copyPasteBlocked: Boolean, resumeEnabled: Boolean): String {
    val parts = mutableListOf<String>()
    if (fullscreenRequired) parts += "Fullscreen required"
    if (copyPasteBlocked) parts += "Copy/paste blocked"
    if (!resumeEnabled) parts += "Resume disabled"
    return parts.joinToString(" • ")
}
