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

@Composable
fun DailyDigestScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onOpenLeaderboard: () -> Unit = {},
) {
    val context = LocalContext.current
    val scoreVisible by AppPreferencesRepository.scoreVisibilityEnabled.collectAsState(initial = true)
    val today = remember { LocalDate.now() }
    var selectedDate by remember { mutableStateOf(today) }
    var showQuiz by remember { mutableStateOf(false) }
    var showResult by remember { mutableStateOf(false) }
    val attemptedDates = remember { mutableStateOf(setOf(today.minusDays(1))) }
    var quizItem by remember { mutableStateOf<ContentRepository.DailyQuizRemote?>(null) }
    var quizError by remember { mutableStateOf(false) }
    var quizLoading by remember { mutableStateOf(true) }
    var quizStatusMessage by remember { mutableStateOf<String?>(null) }
    var quizReloadTick by remember { mutableStateOf(0) }
    var selectedOptionIndex by remember { mutableStateOf<Int?>(null) }
    var submittedOptionIndex by remember { mutableStateOf<Int?>(null) }
    var quizStartedAtMillis by remember { mutableStateOf<Long?>(null) }
    var submittedAtMillis by remember { mutableStateOf<Long?>(null) }
    var showSolution by remember { mutableStateOf(false) }

    LaunchedEffect(quizReloadTick) {
        quizLoading = true
        quizError = false
        quizStatusMessage = "Loading today's quiz..."
        runCatching { ContentRepository.loadDailyQuizItem() }
            .onSuccess {
                quizItem = it
                quizError = it == null
                quizStatusMessage = if (it == null) {
                    "Today's quiz is not published yet. Please check back later."
                } else {
                    null
                }
                quizLoading = false
            }
            .onFailure {
                quizError = true
                quizStatusMessage = "Couldn't load quiz right now. Check internet and tap retry."
                quizLoading = false
            }
    }

    if (!showQuiz && !showResult) {
        DailyQuizDatePickerScreen(
            modifier = modifier,
            selectedDate = selectedDate,
            attemptedDates = attemptedDates.value,
            digestItem = null,
            showDigestError = quizError,
            isQuizLoading = quizLoading,
            isTakeTestEnabled = !quizLoading && quizItem != null,
            quizStatusMessage = quizStatusMessage,
            onBack = onBack,
            onShare = {
                val dateStr = selectedDate.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US))
                val prompt = truncateForShare(quizItem?.questionPrompt.orEmpty())
                val body =
                    buildString {
                        appendLine("Try the Daily Quiz on Mock Test App!")
                        appendLine("Date: $dateStr")
                        if (prompt.isNotBlank()) {
                            appendLine()
                            appendLine(prompt)
                        }
                        appendLine()
                        appendLine("Download: ${playStoreLink(context)}")
                    }
                sharePlainText(context, "Daily Quiz — Mock Test App", body, "Share Daily Quiz")
            },
            onSelectDate = { selectedDate = it },
            onTakeTest = {
                if (quizItem == null) {
                    quizError = true
                } else {
                    attemptedDates.value = attemptedDates.value + selectedDate
                    selectedOptionIndex = null
                    quizStartedAtMillis = System.currentTimeMillis()
                    showQuiz = true
                }
            },
            onRetryLoad = { quizReloadTick++ },
        )
    } else if (showQuiz) {
        DailyQuizQuestionScreen(
            modifier = modifier,
            question = quizItem,
            selectedOptionIndex = selectedOptionIndex,
            onBack = {
                showQuiz = false
                selectedOptionIndex = null
            },
            onSelectOption = { selectedOptionIndex = it },
            onSubmit = {
                submittedOptionIndex = selectedOptionIndex
                submittedAtMillis = System.currentTimeMillis()
                showSolution = false
                showQuiz = false
                showResult = true
            },
        )
    } else {
        DailyQuizResultScreen(
            modifier = modifier,
            quizShareDay = selectedDate,
            question = quizItem,
            selectedOptionIndex = submittedOptionIndex,
            scoreVisible = scoreVisible,
            timeTakenSeconds = ((submittedAtMillis ?: System.currentTimeMillis()) - (quizStartedAtMillis
                ?: submittedAtMillis
                ?: System.currentTimeMillis())).coerceAtLeast(0L) / 1000L,
            showSolution = showSolution,
            onBack = onBack,
            onClose = {
                showResult = false
                submittedOptionIndex = null
                submittedAtMillis = null
                showSolution = false
            },
            onReAttempt = {
                selectedOptionIndex = null
                submittedOptionIndex = null
                submittedAtMillis = null
                quizStartedAtMillis = System.currentTimeMillis()
                showSolution = false
                showResult = false
                showQuiz = true
            },
            onLeaderboard = onOpenLeaderboard,
            onSolution = {
                if (quizItem?.explanation.isNullOrBlank()) {
                    Toast.makeText(context, "Solution not available for this quiz.", Toast.LENGTH_SHORT).show()
                } else {
                    showSolution = !showSolution
                }
            },
        )
    }
}

@Composable
private fun DailyQuizQuestionScreen(
    modifier: Modifier,
    question: ContentRepository.DailyQuizRemote?,
    selectedOptionIndex: Int?,
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
                Text(
                    text = "Daily Quiz",
                    color = Color(0xFF272727),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                )
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
                enabled = selectedOptionIndex != null && question != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DailyBlue),
                shape = DailyCardRadius,
            ) {
                Text("SUBMIT", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
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
    quizStatusMessage: String?,
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
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(CircleShape)
                                    .background(
                                        when {
                                            isSelected -> DailyBlue
                                            isAttempted -> Color(0xFFD6D8DF)
                                            else -> Color.Transparent
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

            Button(
                onClick = onTakeTest,
                enabled = isTakeTestEnabled,
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
                        !isTakeTestEnabled -> "QUIZ NOT AVAILABLE"
                        else -> "TAKE TEST"
                    },
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 19.sp,
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
            LegendRow(label = "Attempted Test", color = Color(0xFFD6D8DF))
            Spacer(Modifier.height(8.dp))
            LegendRow(label = "Current date selected", color = DailyBlue)
            Spacer(Modifier.height(12.dp))
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
    question: ContentRepository.DailyQuizRemote?,
    selectedOptionIndex: Int?,
    scoreVisible: Boolean,
    timeTakenSeconds: Long,
    showSolution: Boolean,
    onBack: () -> Unit,
    onClose: () -> Unit,
    onLeaderboard: () -> Unit,
    onReAttempt: () -> Unit,
    onSolution: () -> Unit,
) {
    val context = LocalContext.current
    val correctIndex = question?.correctIndex ?: -1
    val isAnswered = selectedOptionIndex != null
    val isCorrect = isAnswered && selectedOptionIndex == correctIndex
    val totalQuestions = 1
    val correctCount = if (isCorrect) 1 else 0
    val wrongCount = if (isAnswered && !isCorrect) 1 else 0
    val skippedCount = if (!isAnswered) 1 else 0
    val visibleScore = if (scoreVisible) "$correctCount" else "-"
    val visibleOutOf = if (scoreVisible) "$totalQuestions" else "-"
    val accuracyPct = if (!scoreVisible) "-" else if (isCorrect) "100%" else "0%"
    val selectedAnswer = selectedOptionIndex?.let { idx -> question?.options?.getOrNull(idx) } ?: "Not answered"
    val correctAnswer = question?.options?.getOrNull(correctIndex).orEmpty()
    val minutes = (timeTakenSeconds / 60L).toInt()
    val seconds = (timeTakenSeconds % 60L).toInt()
    val solutionText = question?.explanation?.trim().orEmpty()

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
                    Text("WA", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                }
                IconButton(
                    onClick = {
                        val dateStr = quizShareDay.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US))
                        val prompt = truncateForShare(question?.questionPrompt.orEmpty())
                        val body =
                            buildString {
                                appendLine("My Daily Quiz result — Mock Test App")
                                appendLine("Date: $dateStr")
                                if (prompt.isNotBlank()) {
                                    appendLine()
                                    appendLine(prompt)
                                }
                                appendLine()
                                if (scoreVisible) {
                                    appendLine("Score: $correctCount / $totalQuestions · Time: ${minutes}m ${seconds}s")
                                    appendLine("Correct: $correctCount · Wrong: $wrongCount · Skipped: $skippedCount")
                                } else {
                                    appendLine("Completed the quiz (score hidden in app settings).")
                                }
                                appendLine()
                                appendLine("Download: ${playStoreLink(context)}")
                            }
                        sharePlainText(context, "Daily Quiz result — Mock Test App", body, "Share result")
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
                    Text("Gamming Club", fontWeight = FontWeight.SemiBold, fontSize = 18.sp, color = Color(0xFF2B2B2B))
                    Text(LocalDate.now().toString().replace("-", ""), color = Color(0xFF4E4E4E), fontSize = 14.sp)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ScoreBox(
                            title = "Score",
                            value = visibleScore,
                            subtitle = "Out of $visibleOutOf",
                            valueColor = Color(0xFF10B981),
                            modifier = Modifier.weight(1f),
                        )
                        ScoreBox(
                            title = "Rank",
                            value = "-",
                            subtitle = "Out of -",
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

            Button(
                onClick = onLeaderboard,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DailyBlue),
                shape = DailyCardRadius,
            ) {
                Icon(Icons.Rounded.Leaderboard, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("LEADERBOARD", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }

            AnalysisCard()
            DonutCard(
                title = "Brief Analysis",
                centerText = "Brief",
                values = listOf(
                    correctCount * 100f to Color(0xFFF5A623),
                    wrongCount * 100f to Color(0xFFEB5757),
                    skippedCount * 100f to Color(0xFFE7EBEF),
                ),
                sideStats = "Correct - $correctCount      Wrong - $wrongCount      Skipped - $skippedCount",
            )
            DonutCard(
                title = "Accuracy & Score",
                centerText = "Accuracy\n$accuracyPct",
                values = if (scoreVisible) {
                    if (isCorrect) {
                        listOf(100f to Color(0xFF10B981))
                    } else {
                        listOf(100f to Color(0xFFEB5757))
                    }
                } else {
                    listOf(100f to Color(0xFFE7EBEF))
                },
                sideStats = "Selected: $selectedAnswer",
            )
            Card(
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                shape = DailyPanelRadius,
                colors = CardDefaults.cardColors(containerColor = Color.White),
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
                    Text("Answer Review", color = Color(0xFF2E2E2E), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Your answer: $selectedAnswer", color = Color(0xFF4A4A4A), fontSize = 14.sp)
                    Spacer(Modifier.height(4.dp))
                    Text("Correct answer: $correctAnswer", color = Color(0xFF4A4A4A), fontSize = 14.sp)
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
private fun AnalysisCard() {
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
        shape = DailyPanelRadius,
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Question Analysis", color = Color(0xFF2E2E2E), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Spacer(Modifier.height(8.dp))
            Text("For Daily Quiz (1 question)", color = Color(0xFF6C6C6C), fontSize = 12.sp)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("1" to Color(0xFFE7EBEF)).forEach { (n, bg) ->
                    Box(
                        modifier = Modifier.size(42.dp).clip(RoundedCornerShape(4.dp)).background(bg),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(n, color = Color(0xFF4A4A4A), fontSize = 16.sp)
                    }
                }
            }
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
                androidx.compose.foundation.Canvas(modifier = Modifier.size(170.dp)) {
                    var start = -90f
                    values.forEach { (portion, color) ->
                        val angle = (portion / 100f) * 360f
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
