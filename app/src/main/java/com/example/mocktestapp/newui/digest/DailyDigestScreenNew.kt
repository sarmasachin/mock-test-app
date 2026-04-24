package com.example.mocktestapp.newui.digest

import android.util.Log
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Quiz
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.data.TestHistoryRepository
import com.example.mocktestapp.newui.components.AppSnackbarHostNew
import com.example.mocktestapp.newui.components.rememberAppSnackbarHostStateNew
import com.example.mocktestapp.newui.components.showError
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import com.example.mocktestapp.util.CalendarEventHelper
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Calendar
import kotlinx.coroutines.flow.flowOf

private data class DigestQuestionDto(
    val prompt: String,
    val options: List<String>,
    val correctIndex: Int,
)

private data class DailyDigestColors(
    val streakBorderHex: String = "",
    val streakIconHex: String = "",
    val streakGradientEndHex: String = "",
    val questionAccentHex: String = "",
    val questionBorderHex: String = "",
    val factAccentHex: String = "",
    val factBorderHex: String = "",
)

private data class DailyDigestConfig(
    val pageTitle: String = "Daily Digest",
    val streakTitle: String = "Daily streak",
    val streakHint: String = "Open your digest daily to keep streak growing.",
    val questionSectionTitle: String = "Question of the day",
    val factSectionTitle: String = "Fact of the day",
    val tapHint: String = "Tap one option to reveal answer.",
    val correctFeedback: String = "Correct! Nice work.",
    val wrongFeedbackPrefix: String = "Not this one. Correct answer:",
    val calendarButtonTitle: String = "Add reminder to calendar",
    val calendarEventTitle: String = "MockTest daily digest reminder",
    val calendarEventDescription: String = "Revise daily digest and solve one quick question.",
    val questions: List<DigestQuestionDto> = listOf(
        DigestQuestionDto(
            prompt = "Which number is a prime?",
            options = listOf("21", "29", "35", "39"),
            correctIndex = 1,
        ),
        DigestQuestionDto(
            prompt = "Who wrote the Indian national song Vande Mataram?",
            options = listOf("Rabindranath Tagore", "Bankim Chandra Chattopadhyay", "Sarojini Naidu", "Subramania Bharati"),
            correctIndex = 1,
        ),
    ),
    val facts: List<String> = listOf(
        "Micro-revision works best in short daily chunks. 15 focused minutes beat 2 distracted hours.",
        "Spaced repetition improves retention dramatically when reviews are distributed over days.",
    ),
    val colors: DailyDigestColors? = null,
) {
    companion object {
        val DEFAULT = DailyDigestConfig()
    }
}

private object DailyDigestConfigRepository {
    val config = flowOf(DailyDigestConfig.DEFAULT)
}

private fun String.parseComposeColorOrNull(): Color? = null

private data class DailyDigestHistoryEntry(
    val date: String,
    val selected: String,
    val correct: String,
    val wasCorrect: Boolean,
)

@Composable
fun DailyDigestScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val streak by AppPreferencesRepository.streakDays.collectAsState(initial = 0)
    val attempts by TestHistoryRepository.observeAttempts().collectAsState(initial = emptyList())
    val cfg by DailyDigestConfigRepository.config.collectAsState(initial = DailyDigestConfig.DEFAULT)
    val context = LocalContext.current
    val snackbar = rememberAppSnackbarHostStateNew()
    val scope = rememberCoroutineScope()
    val profile by AppPreferencesRepository.drawerUserProfile.collectAsState(
        initial = AppPreferencesRepository.DrawerUserProfile(
            displayName = "",
            emailLine = "",
            userIdFormatted = null,
        ),
    )

    val cc = cfg.colors ?: DailyDigestColors()
    val streakBorder = cc.streakBorderHex.parseComposeColorOrNull()
        ?: Color(0xFFFF9800).copy(alpha = 0.35f)
    val streakIcon = cc.streakIconHex.parseComposeColorOrNull() ?: Color(0xFFFF9800)
    val streakGradEnd = cc.streakGradientEndHex.parseComposeColorOrNull()
        ?: Color(0xFFFF9800).copy(alpha = 0.1f)
    val qAccent = cc.questionAccentHex.parseComposeColorOrNull() ?: p.accent
    val qBorder = cc.questionBorderHex.parseComposeColorOrNull() ?: p.accent.copy(alpha = 0.35f)
    val fAccent = cc.factAccentHex.parseComposeColorOrNull() ?: p.success
    val fBorder = cc.factBorderHex.parseComposeColorOrNull() ?: p.success.copy(alpha = 0.35f)

    LaunchedEffect(Unit) {
        try {
            AppPreferencesRepository.recordDigestOpenedToday()
        } catch (e: Exception) {
            Log.e("DailyDigest", "Streak update failed", e)
        }
    }
    var remoteDigest by remember { mutableStateOf<ContentRepository.DailyDigestRemote?>(null) }
    LaunchedEffect(Unit) {
        remoteDigest = ContentRepository.loadDailyDigestItem()
    }

    val today = LocalDate.now()
    val dayIndex = today.dayOfYear
    val dateLabel = remember(today) {
        DateTimeFormatter.ofPattern("EEEE, MMM d, yyyy").format(today)
    }
    val qs = (cfg.questions ?: DailyDigestConfig.DEFAULT.questions).orEmpty()
    val facts = (cfg.facts ?: DailyDigestConfig.DEFAULT.facts).orEmpty()
    val fallbackQuestion = qs[dayIndex % qs.size.coerceAtLeast(1)]
    val qItem = remoteDigest?.let {
        DigestQuestionDto(
            prompt = it.questionPrompt,
            options = (it.options + List(4) { "" }).take(4),
            correctIndex = it.correctIndex.coerceIn(0, 3),
        )
    } ?: fallbackQuestion
    val fact = remoteDigest?.factText ?: facts[dayIndex % facts.size.coerceAtLeast(1)]

    val digestPrefs = remember(context) {
        context.getSharedPreferences("daily_digest_lock", Context.MODE_PRIVATE)
    }
    val userScope = profile.userIdFormatted ?: "guest"
    val digestLockKey = remember(dayIndex, userScope) { "digest_choice_${userScope}_$dayIndex" }
    val digestHistoryKey = remember(dayIndex, userScope) { "digest_history_${userScope}_$dayIndex" }
    var chosenOption by remember(dayIndex, qItem.prompt ?: "") { mutableIntStateOf(-1) }
    LaunchedEffect(digestLockKey) {
        chosenOption = digestPrefs.getInt(digestLockKey, -1)
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        snackbarHost = { AppSnackbarHostNew(state = snackbar) },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 14.dp)
                .verticalScroll(rememberScrollState()),
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
                Column(Modifier.weight(1f)) {
                    Text(
                        text = cfg.pageTitle,
                        color = p.textPrimary,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = dateLabel,
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            DailyDigestHeroCard(
                headline = "Today's learning boost",
                subline = "1 question + 1 fact. Read daily and build consistency.",
            )

            Spacer(Modifier.height(12.dp))
            DigestStreakCard(
                streak = streak,
                title = cfg.streakTitle,
                hint = cfg.streakHint,
                borderColor = streakBorder,
                iconTint = streakIcon,
                gradientEnd = streakGradEnd,
            )
            Spacer(Modifier.height(10.dp))
            DigestGamificationCard(
                streak = streak,
                attemptCount = attempts.size,
            )

            Spacer(Modifier.height(14.dp))
            DigestQuestionCard(
                item = qItem,
                chosenOption = chosenOption,
                onChoose = { selected ->
                    if (chosenOption >= 0) return@DigestQuestionCard
                    chosenOption = selected
                    digestPrefs.edit().putInt(digestLockKey, selected).apply()
                    val correctIndex = qItem.correctIndex.coerceIn(0, 3)
                    val selectedText = qItem.options.getOrElse(selected) { "" }
                    val correctText = qItem.options.getOrElse(correctIndex) { "" }
                    val line = listOf(
                        dateLabel,
                        selectedText,
                        correctText,
                        if (selected == correctIndex) "1" else "0",
                    ).joinToString("|")
                    digestPrefs.edit().putString(digestHistoryKey, line).apply()
                },
                sectionTitle = cfg.questionSectionTitle,
                tapHint = cfg.tapHint,
                correctFeedback = cfg.correctFeedback,
                wrongPrefix = cfg.wrongFeedbackPrefix,
                accent = qAccent,
                borderColor = qBorder,
            )
            Spacer(Modifier.height(12.dp))
            DigestFactCard(
                body = fact,
                sectionTitle = cfg.factSectionTitle,
                accent = fAccent,
                borderColor = fBorder,
            )
            Spacer(Modifier.height(12.dp))
            DailyDigestHistoryCard(
                userScope = userScope,
                prefs = digestPrefs,
                currentDayIndex = dayIndex,
            )

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    val cal = Calendar.getInstance().apply {
                        add(Calendar.DAY_OF_YEAR, 7)
                        set(Calendar.HOUR_OF_DAY, 10)
                        set(Calendar.MINUTE, 0)
                        set(Calendar.SECOND, 0)
                        set(Calendar.MILLISECOND, 0)
                    }
                    val end = Calendar.getInstance().apply {
                        timeInMillis = cal.timeInMillis
                        add(Calendar.HOUR_OF_DAY, 1)
                    }
                    val opened = CalendarEventHelper.openInsertExamReminder(
                        context = context,
                        title = cfg.calendarEventTitle,
                        description = cfg.calendarEventDescription,
                        beginTimeMillis = cal.timeInMillis,
                        endTimeMillis = end.timeInMillis,
                    )
                    if (!opened) {
                        scope.launch { snackbar.showError("No calendar app found on this device.") }
                    }
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = p.primaryButton,
                    contentColor = p.onPrimaryButton,
                ),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Rounded.Event, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(text = cfg.calendarButtonTitle, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Tip: Add reminder to keep your streak active.",
                color = p.textSecondary,
                fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun DigestGamificationCard(
    streak: Int,
    attemptCount: Int,
) {
    val p = mockTestPalette()
    val level = (attemptCount / 5) + 1
    val badge = when {
        streak >= 30 -> "Legend Badge"
        streak >= 14 -> "Gold Consistency Badge"
        streak >= 7 -> "Silver Streak Badge"
        streak >= 3 -> "Bronze Starter Badge"
        else -> "New Learner Badge"
    }
    val reward = when {
        streak >= 30 -> "Reward unlocked: Mega revision pass"
        streak >= 14 -> "Reward unlocked: Double streak bonus"
        streak >= 7 -> "Reward unlocked: Weekly achiever"
        else -> "Next reward at 7-day streak"
    }
    val shape = RoundedCornerShape(16.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, p.accent.copy(alpha = 0.28f), shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text("Gamification", color = p.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(6.dp))
            Text("Level $level • $badge", color = p.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text("Streak rewards: $reward", color = p.textSecondary, fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
}

@Composable
private fun DailyDigestHistoryCard(
    userScope: String,
    prefs: android.content.SharedPreferences,
    currentDayIndex: Int,
) {
    val p = mockTestPalette()
    val history = (0..13).mapNotNull { back ->
        val day = currentDayIndex - back
        if (day <= 0) return@mapNotNull null
        val raw = prefs.getString("digest_history_${userScope}_$day", null) ?: return@mapNotNull null
        val parts = raw.split("|")
        if (parts.size < 4) return@mapNotNull null
        DailyDigestHistoryEntry(
            date = parts[0],
            selected = parts[1],
            correct = parts[2],
            wasCorrect = parts[3] == "1",
        )
    }
    val shape = RoundedCornerShape(16.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, p.border.copy(alpha = 0.24f), shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text("Daily Digest History", color = p.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(8.dp))
            if (history.isEmpty()) {
                Text("No previous answer history yet.", color = p.textSecondary, fontSize = 12.sp)
            } else {
                history.forEach { item ->
                    Text(
                        text = "${item.date}: ${if (item.wasCorrect) "Correct" else "Wrong"} • Your answer: ${item.selected} • Correct: ${item.correct}",
                        color = if (item.wasCorrect) p.success else p.textSecondary,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        modifier = Modifier.padding(vertical = 2.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DailyDigestHeroCard(
    headline: String,
    subline: String,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val heroBrush = Brush.horizontalGradient(
        listOf(
            p.systemBlue.copy(alpha = 0.16f),
            p.accent.copy(alpha = 0.14f),
            p.surfaceElevated,
        ),
    )
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, p.border.copy(alpha = 0.2f), shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
    ) {
        Column(
            modifier = Modifier
                .background(heroBrush)
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Text(
                text = headline,
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = subline,
                color = p.textSecondary,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
        }
    }
}

@Composable
private fun DigestStreakCard(
    streak: Int,
    title: String,
    hint: String,
    borderColor: Color,
    iconTint: Color,
    gradientEnd: Color,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val warm = Brush.linearGradient(
        colors = listOf(
            p.surfaceElevated,
            gradientEnd,
        ),
    )
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, borderColor, shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
    ) {
        Box(
            modifier = Modifier
                .background(warm)
                .padding(16.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Rounded.LocalFireDepartment,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(40.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = title,
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "$streak day(s)",
                        color = p.textPrimary,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = hint,
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun DigestQuestionCard(
    item: DigestQuestionDto,
    chosenOption: Int,
    onChoose: (Int) -> Unit,
    sectionTitle: String,
    tapHint: String,
    correctFeedback: String,
    wrongPrefix: String,
    accent: Color,
    borderColor: Color,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val revealed = chosenOption >= 0
    val quizTint = Brush.horizontalGradient(
        colors = listOf(
            accent.copy(alpha = 0.14f),
            p.systemBlue.copy(alpha = 0.1f),
        ),
    )
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, borderColor, shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(quizTint)
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Outlined.Quiz,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = sectionTitle,
                    color = accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = item.prompt ?: "",
                color = p.textPrimary,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(14.dp))
            val opts = ((item.options ?: emptyList()) + List(4) { "" }).take(4)
            opts.forEachIndexed { index, label ->
                DigestOptionRow(
                    label = label,
                    index = index,
                    correctIndex = item.correctIndex.coerceIn(0, 3),
                    chosenOption = chosenOption,
                    revealed = revealed,
                    accent = accent,
                    onClick = {
                        if (!revealed) onChoose(index)
                    },
                )
                Spacer(Modifier.height(8.dp))
            }
            if (revealed) {
                val ok = chosenOption == item.correctIndex.coerceIn(0, 3)
                val correctText = opts.getOrElse(item.correctIndex.coerceIn(0, 3)) { "" }
                val feedbackShape = RoundedCornerShape(12.dp)
                val feedbackBg = if (ok) p.success.copy(alpha = 0.14f) else p.error.copy(alpha = 0.14f)
                val feedbackBorder = if (ok) p.success.copy(alpha = 0.5f) else p.error.copy(alpha = 0.55f)
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(feedbackShape)
                        .border(1.dp, feedbackBorder, feedbackShape),
                    color = feedbackBg,
                    shape = feedbackShape,
                ) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                        Text(
                            text = if (ok) "🎉 Correct answer!" else "😞 Oh wrong answer...",
                            color = if (ok) p.success else p.error,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = if (ok) {
                                "$correctFeedback  Locked for today."
                            } else {
                                "$wrongPrefix $correctText"
                            },
                            color = p.textPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            lineHeight = 18.sp,
                        )
                    }
                }
            } else {
                Text(
                    text = "$tapHint Once selected, answer locks for today.",
                    color = p.textSecondary,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun DigestOptionRow(
    label: String,
    index: Int,
    correctIndex: Int,
    chosenOption: Int,
    revealed: Boolean,
    accent: Color,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(12.dp)
    val bg = when {
        !revealed -> p.surfaceElevated.copy(alpha = 0.95f)
        index == correctIndex -> p.success.copy(alpha = 0.22f)
        index == chosenOption && index != correctIndex -> p.error.copy(alpha = 0.2f)
        else -> p.surfaceElevated.copy(alpha = 0.5f)
    }
    val borderC = when {
        !revealed -> p.border.copy(alpha = 0.22f)
        index == correctIndex -> p.success.copy(alpha = 0.65f)
        index == chosenOption && index != correctIndex -> p.error.copy(alpha = 0.65f)
        else -> p.border.copy(alpha = 0.12f)
    }
    val interaction = remember { MutableInteractionSource() }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, borderC, shape)
            .clickable(
                interactionSource = interaction,
                indication = ripple(color = accent.copy(alpha = 0.25f)),
                enabled = !revealed,
                onClick = onClick,
            ),
        color = bg,
        shape = shape,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = ('A' + index).toString(),
                color = accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(22.dp),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = label,
                color = p.textPrimary,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun DigestFactCard(
    body: String,
    sectionTitle: String,
    accent: Color,
    borderColor: Color,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    val factBrush = Brush.linearGradient(
        colors = listOf(
            accent.copy(alpha = 0.12f),
            p.systemBlue.copy(alpha = 0.06f),
        ),
    )
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, borderColor, shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Column(
            modifier = Modifier
                .background(factBrush)
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Lightbulb,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = sectionTitle,
                    color = accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = body,
                color = p.textPrimary,
                fontSize = 15.sp,
                lineHeight = 23.sp,
            )
        }
    }
}
