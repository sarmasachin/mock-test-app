package com.freemocktest.app.newui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.freemocktest.app.util.AllIndiaExamVisualCatalog

data class AllIndiaTestCardModel(
    val applyTestName: String,
    val sectionLabel: String,
    val iconKey: String?,
)

@Composable
fun AllIndiaExamSectionedGrid(
    sections: List<Pair<AllIndiaExamVisualCatalog.SectionVisual, List<AllIndiaTestCardModel>>>,
    onOpenTest: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scrollState = rememberScrollState()
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        sections.forEach { (section, tests) ->
            key(section.slug) {
                AllIndiaExamSection(
                    section = section,
                    tests = tests,
                    onOpenTest = onOpenTest,
                )
            }
        }
    }
}

@Composable
private fun AllIndiaExamSection(
    section: AllIndiaExamVisualCatalog.SectionVisual,
    tests: List<AllIndiaTestCardModel>,
    onOpenTest: (String) -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.72f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.6f)),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = section.icon,
                    contentDescription = null,
                    tint = section.accentColor,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.size(8.dp))
                Text(
                    text = section.titleHindi,
                    color = section.accentColor,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(14.dp))
            ExamCircleStaticGrid(
                items = tests,
                modifier = Modifier.fillMaxWidth(),
            ) { test ->
                AllIndiaExamCircleCard(
                    model = test,
                    onClick = { onOpenTest(test.applyTestName) },
                )
            }
        }
    }
}

@Composable
fun AllIndiaExamCircleCard(
    model: AllIndiaTestCardModel,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visual = remember(model.applyTestName, model.sectionLabel, model.iconKey) {
        AllIndiaExamVisualCatalog.findTestVisual(model.applyTestName, model.sectionLabel, model.iconKey)
            ?: AllIndiaExamVisualCatalog.defaultTestVisual(model.applyTestName, model.sectionLabel)
    }
    val remoteIconUrl = remember(model.iconKey) {
        model.iconKey?.trim()?.takeIf {
            it.startsWith("http://", ignoreCase = true) || it.startsWith("https://", ignoreCase = true)
        }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Card(
            modifier = Modifier
                .size(108.dp)
                .clip(CircleShape)
                .border(2.dp, Color(0xCCE2E8F0), CircleShape)
                .clickable(onClick = onClick),
            shape = CircleShape,
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(108.dp)
                    .background(visual.hoverBackground.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center,
            ) {
                if (remoteIconUrl != null) {
                    AsyncImage(
                        model = remoteIconUrl,
                        contentDescription = null,
                        modifier = Modifier.size(26.dp),
                    )
                } else {
                    Icon(
                        imageVector = visual.icon,
                        contentDescription = null,
                        tint = visual.iconColor,
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
        }
        Text(
            text = visual.hindiName,
            color = Color(0xFF1E293B),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 13.sp,
            modifier = Modifier
                .padding(top = 8.dp)
                .fillMaxWidth(),
        )
        Text(
            text = visual.subLabel,
            color = Color(0xFF64748B),
            fontSize = 8.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .padding(top = 2.dp)
                .fillMaxWidth(),
        )
    }
}
