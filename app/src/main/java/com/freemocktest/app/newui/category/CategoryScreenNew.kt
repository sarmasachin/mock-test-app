package com.freemocktest.app.newui.category

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette

@Composable
fun CategoryScreenNew(
    modifier: Modifier = Modifier,
    category: String,
    onBack: () -> Unit,
    onOpenSubcategory: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val allCategories = listOf("Math", "Reasoning", "English", "GK", "Science", "Computer", "Hindi")
    var selectedCategory by remember(category) { mutableStateOf(category) }

    val items = remember(selectedCategory) {
        when (selectedCategory.lowercase()) {
            "math" -> listOf("Arithmetic", "Algebra")
            "reasoning" -> listOf("Series", "Analogy")
            "english" -> listOf("Grammar", "Vocabulary")
            "gk" -> listOf("Static GK", "Current Affairs")
            "science" -> listOf("Physics", "Chemistry")
            "computer" -> listOf("Basics", "MS Office")
            "hindi" -> listOf("Vyakaran", "Sahitya")
            else -> emptyList()
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
                    text = selectedCategory,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }

            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                allCategories.forEach { cat ->
                    val selected = selectedCategory.equals(cat, ignoreCase = true)
                    val chipShape = RoundedCornerShape(14.dp)
                    Text(
                        text = cat,
                        color = if (selected) p.onPrimaryButton else p.textPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .clip(chipShape)
                            .background(if (selected) p.primaryButton else p.surface)
                            .border(1.dp, p.border.copy(alpha = 0.18f), chipShape)
                            .clickable { selectedCategory = cat }
                            .padding(horizontal = 16.dp, vertical = 11.dp),
                    )
                    Spacer(Modifier.size(8.dp))
                }
            }
            Spacer(Modifier.height(12.dp))

            Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)) {
                items.forEach { label ->
                    SubcategoryRow(
                        label = label,
                        onOpen = { onOpenSubcategory(label) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SubcategoryRow(
    label: String,
    onOpen: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(18.dp)
    Card(
        modifier = Modifier.fillMaxWidth(),
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
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(p.border.copy(alpha = 0.16f))
                    .border(1.dp, p.border.copy(alpha = 0.16f), RoundedCornerShape(10.dp)),
            )

            Spacer(Modifier.size(12.dp))

            Text(
                text = label,
                color = p.textPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )

            Text(
                text = "Open",
                color = p.accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onOpen)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }
    }
}
