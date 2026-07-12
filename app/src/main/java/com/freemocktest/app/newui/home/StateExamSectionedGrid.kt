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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Star
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.freemocktest.app.util.StateExamDynamicCatalog

@Composable
fun StateExamSectionedGrid(
    sections: List<Pair<StateExamDynamicCatalog.SectionVisual, List<StateExamDynamicCatalog.TestCardModel>>>,
    stateDrillLabel: String,
    onOpenTest: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bg = Brush.verticalGradient(
        colors = listOf(Color(0xFFF0FDF4), Color(0xFFE0F2FE)),
    )
    val scrollState = rememberScrollState()
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(bg, RoundedCornerShape(16.dp))
            .verticalScroll(scrollState)
            .padding(top = 4.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        sections.forEach { (section, tests) ->
            key(section.slug) {
                StateExamSection(
                    section = section,
                    tests = tests,
                    stateDrillLabel = stateDrillLabel,
                    onOpenTest = onOpenTest,
                )
            }
        }
    }
}

@Composable
private fun StateExamSection(
    section: StateExamDynamicCatalog.SectionVisual,
    tests: List<StateExamDynamicCatalog.TestCardModel>,
    stateDrillLabel: String,
    onOpenTest: (String) -> Unit,
) {
    val hasFeatured = tests.any { it.featured }
    val shape = RoundedCornerShape(20.dp)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        colors = CardDefaults.cardColors(
            containerColor = if (hasFeatured) {
                Color(0xFFFFFBEB).copy(alpha = 0.92f)
            } else {
                Color.White.copy(alpha = 0.75f)
            },
        ),
        border = androidx.compose.foundation.BorderStroke(
            width = if (hasFeatured) 1.5.dp else 1.dp,
            color = if (hasFeatured) Color(0xFFFDE68A) else Color.White.copy(alpha = 0.7f),
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Icon(
                        imageVector = section.icon,
                        contentDescription = null,
                        tint = section.accentColor,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.size(8.dp))
                    Text(
                        text = section.title,
                        color = section.accentColor,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (hasFeatured) {
                    Text(
                        text = "⭐ Important",
                        color = Color(0xFFB45309),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            ExamCircleStaticGrid(
                items = tests,
                modifier = Modifier.fillMaxWidth(),
            ) { test ->
                StateExamCircleCard(
                    model = test,
                    stateDrillLabel = stateDrillLabel,
                    onClick = { onOpenTest(test.applyTestName) },
                )
            }
        }
    }
}

@Composable
fun StateExamCircleCard(
    model: StateExamDynamicCatalog.TestCardModel,
    stateDrillLabel: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visual = remember(model.applyTestName, model.iconKey, stateDrillLabel) {
        StateExamDynamicCatalog.resolveTestVisual(
            applyTestName = model.applyTestName,
            iconKey = model.iconKey,
            stateDrillLabel = stateDrillLabel,
        )
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.TopEnd) {
            Card(
                modifier = Modifier
                    .size(108.dp)
                    .clip(CircleShape)
                    .border(
                        width = if (model.featured) 3.dp else 2.dp,
                        color = if (model.featured) Color(0xFFEAB308) else Color(0xCCE2E8F0),
                        shape = CircleShape,
                    )
                    .clickable(onClick = onClick),
                shape = CircleShape,
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(
                    defaultElevation = if (model.featured) 8.dp else 4.dp,
                ),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(108.dp)
                        .background(visual.hoverBackground.copy(alpha = 0.4f)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (visual.remoteIconUrl != null) {
                        AsyncImage(
                            model = visual.remoteIconUrl,
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
            if (model.featured) {
                Box(
                    modifier = Modifier
                        .background(Color(0xFFFEF3C7), RoundedCornerShape(999.dp))
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Star,
                        contentDescription = "Featured",
                        tint = Color(0xFFEAB308),
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
        Text(
            text = visual.title,
            color = if (model.featured) Color(0xFFB45309) else Color(0xFF1E293B),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 12.sp,
            modifier = Modifier
                .padding(top = 8.dp)
                .fillMaxWidth(),
        )
        if (visual.subLabel != visual.title) {
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
}
