package com.freemocktest.app.newui.instructions

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette

@Composable
fun InstructionsScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
    onStartTest: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var pageTitle by remember { mutableStateOf("Instructions") }
    var cardTitle by remember { mutableStateOf("Please read carefully") }
    var startButtonLabel by remember { mutableStateOf("Start Test") }
    LaunchedEffect(testName) {
        AppPreferencesRepository.rememberTestOpened(testName)
    }
    var info by remember(testName) {
        mutableStateOf(
            listOf(
                "Total questions: 10",
                "Duration: 12 minutes",
                "Each question has one correct answer",
                "You can review before submitting",
            ),
        )
    }
    var testSnapshot by remember(testName) { mutableStateOf<com.freemocktest.app.newui.tests.TestCardNew?>(null) }
    var showMoreDetails by remember(testName) { mutableStateOf(false) }
    var isSnapshotLoading by remember(testName) { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val remote = ContentRepository.loadInstructionContent() ?: return@LaunchedEffect
        pageTitle = remote.pageTitle?.ifBlank { pageTitle } ?: pageTitle
        cardTitle = remote.cardTitle?.ifBlank { cardTitle } ?: cardTitle
        startButtonLabel = remote.startButtonLabel?.ifBlank { startButtonLabel } ?: startButtonLabel
        if (remote.items.isNotEmpty()) {
            info = remote.items
        }
    }
    LaunchedEffect(testName) {
        isSnapshotLoading = true
        testSnapshot = ContentRepository.loadTestByTitle(testName)
        isSnapshotLoading = false
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(p.surface)
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 14.dp),
            ) {
                Button(
                    onClick = onStartTest,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = p.systemBlue,
                        contentColor = Color.White,
                    ),
                ) {
                    Text(text = startButtonLabel, fontWeight = FontWeight.Bold)
                }
            }
        },
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
                    text = pageTitle,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }

            Spacer(Modifier.height(14.dp))

            Text(
                text = testName,
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(Modifier.height(14.dp))

            if (isSnapshotLoading) {
                Text(
                    text = "Loading latest test details...",
                    color = p.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(10.dp))
            }

            testSnapshot?.let { snapshot ->
                val detailShape = RoundedCornerShape(16.dp)
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(detailShape)
                        .border(1.dp, p.border.copy(alpha = 0.16f), detailShape),
                    shape = detailShape,
                    colors = CardDefaults.cardColors(containerColor = p.surfaceElevated),
                ) {
                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                        val topLines = listOfNotNull(
                            snapshot.examDate?.let { "Exam Date: $it" },
                            snapshot.durationLabel?.let { "Duration: $it" },
                            snapshot.questionsMarks?.let { "Questions/Marks: $it" },
                            snapshot.enrolledLabel?.let { "Enrolled: $it" },
                            snapshot.remainingSeatsLabel?.let { "Seats Left: $it" },
                        )
                        topLines.forEach { line ->
                            Text(text = line, color = p.textSecondary, fontSize = 12.sp)
                        }
                        val moreLines = listOfNotNull(
                            snapshot.attemptsAllowed?.let { "Attempts: $it" },
                            snapshot.languageMode?.let { "Language: $it" },
                            snapshot.examMode?.let { "Mode: $it" },
                            snapshot.negativeMarkingText?.let { "Negative: $it" },
                            snapshot.testTypeLabel?.let { "Type: $it" },
                            snapshot.validUntil?.let { "Valid Till: $it" },
                        )
                        if (showMoreDetails) {
                            moreLines.forEach { line ->
                                Text(text = line, color = p.textSecondary, fontSize = 12.sp)
                            }
                        }
                        if (moreLines.isNotEmpty()) {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = if (showMoreDetails) "Less details" else "View details",
                                color = p.accent,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable { showMoreDetails = !showMoreDetails }
                                    .padding(horizontal = 6.dp, vertical = 4.dp),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            val shape = RoundedCornerShape(18.dp)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .border(1.dp, p.border.copy(alpha = 0.18f), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = p.surface),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = cardTitle,
                        color = p.textSecondary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(10.dp))
                    info.forEachIndexed { index, line ->
                        Text(
                            text = "${index + 1}. $line",
                            color = p.textPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }
        }
    }
}
