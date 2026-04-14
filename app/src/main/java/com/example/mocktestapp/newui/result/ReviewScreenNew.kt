package com.example.mocktestapp.newui.result

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

@Composable
fun ReviewScreenNew(
    modifier: Modifier = Modifier,
    testName: String,
    onBack: () -> Unit,
    onOpenSolution: (Int) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())

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
                    text = "Review Answers",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = testName,
                color = p.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(18.dp))

            val questions = dummyReviewItems()

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                itemsIndexed(questions) { index, item ->
                    ReviewQuestionCard(
                        index = index,
                        title = item.title,
                        yourAnswer = item.yourAnswer,
                        correctAnswer = item.correctAnswer,
                        onOpenSolution = { onOpenSolution(index + 1) },
                    )
                }
            }
        }
    }
}

private data class ReviewItem(
    val title: String,
    val yourAnswer: String,
    val correctAnswer: String,
)

private fun dummyReviewItems(): List<ReviewItem> {
    val options = listOf("Option A", "Option B", "Option C", "Option D")
    return List(10) { index ->
        val qNo = index + 1
        ReviewItem(
            title = "Arithmetic Question $qNo",
            yourAnswer = when (index % 3) {
                0 -> "Option D"
                1 -> "Not answered"
                else -> "Option B"
            },
            correctAnswer = options[index % options.size],
        )
    }
}

@Composable
private fun ReviewQuestionCard(
    index: Int,
    title: String,
    yourAnswer: String,
    correctAnswer: String,
    onOpenSolution: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = p.surface),
        border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Q${index + 1}. $title",
                color = p.textPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Your answer: $yourAnswer",
                color = p.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Normal,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Correct: $correctAnswer",
                color = p.success,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                Text(
                    text = "Solution",
                    color = p.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(p.surfaceElevated)
                        .border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
                        .clickable(onClick = onOpenSolution)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
fun ReviewSolutionScreenNew(
    testName: String,
    questionNo: Int,
    onBack: () -> Unit,
    onOpenQuestion: (Int) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
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
                    text = "Solution",
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "$testName · Q$questionNo",
                color = p.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                repeat(10) { idx ->
                    val q = idx + 1
                    val selected = q == questionNo
                    val shape = RoundedCornerShape(10.dp)
                    Text(
                        text = "Q$q",
                        color = if (selected) p.onPrimaryButton else p.textPrimary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .clip(shape)
                            .background(if (selected) p.primaryButton else p.surfaceElevated)
                            .border(1.dp, p.border.copy(alpha = 0.2f), shape)
                            .clickable { onOpenQuestion(q) }
                            .padding(horizontal = 10.dp, vertical = 7.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                }
            }
            Spacer(Modifier.height(14.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Step-by-step solution",
                        color = p.textPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "1) Read question carefully.\n2) Identify formula or concept.\n3) Solve each step and verify units.\n4) Match final value with options.\n\nDemo solution placeholder for Q$questionNo. Backend/CMS se real solution text bind kar sakte ho.",
                        color = p.textSecondary,
                        fontSize = 13.sp,
                        lineHeight = 19.sp,
                    )
                }
            }
        }
    }
}
