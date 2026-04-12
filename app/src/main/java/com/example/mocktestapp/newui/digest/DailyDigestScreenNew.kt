package com.example.mocktestapp.newui.digest

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.newui.components.AppSnackbarHostNew
import com.example.mocktestapp.newui.components.rememberAppSnackbarHostStateNew
import com.example.mocktestapp.newui.components.showError
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import com.example.mocktestapp.util.CalendarEventHelper
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Calendar

@Composable
fun DailyDigestScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val streak by AppPreferencesRepository.streakDays.collectAsState(initial = 0)
    val context = LocalContext.current
    val snackbar = rememberAppSnackbarHostStateNew()
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            AppPreferencesRepository.recordDigestOpenedToday()
        } catch (e: Exception) {
            Log.e("DailyDigest", "Streak update failed", e)
        }
    }

    val dayIndex = LocalDate.now().dayOfYear
    val question = digestQuestions[dayIndex % digestQuestions.size]
    val fact = digestFacts[dayIndex % digestFacts.size]

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
                Text(
                    text = "Daily digest",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(14.dp))

            val shape = RoundedCornerShape(18.dp)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .border(1.dp, p.border.copy(alpha = 0.16f), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = p.surface),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(text = "Streak", color = p.textSecondary, fontSize = 12.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "$streak day(s)",
                        color = p.textPrimary,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Opens this screen once per day to grow your streak.",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            DigestSectionCard(
                title = "Question of the day",
                body = question,
            )
            Spacer(Modifier.height(12.dp))
            DigestSectionCard(
                title = "Fact of the day",
                body = fact,
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
                        title = "Exam / form deadline (sample)",
                        description = "Replace with your real exam from backend or RSS.",
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
                    Text(text = "Add sample exam to calendar", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun DigestSectionCard(
    title: String,
    body: String,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = title, color = p.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))
            Text(text = body, color = p.textPrimary, fontSize = 15.sp, lineHeight = 22.sp)
        }
    }
}

private val digestQuestions = listOf(
    "If a train travels 120 km in 2 hours, what is its average speed in km/h?",
    "Which organelle is known as the powerhouse of the cell?",
    "What is the value of π (pi) rounded to two decimal places?",
    "In a right triangle, if legs are 3 and 4, what is the hypotenuse?",
)

private val digestFacts = listOf(
    "Spaced repetition improves long-term recall more than cramming the night before.",
    "Short breaks every 25–40 minutes can help maintain focus during long study blocks.",
    "Teaching a concept to someone else is one of the fastest ways to find gaps in your understanding.",
    "Sleep after learning helps your brain consolidate new memories.",
)
