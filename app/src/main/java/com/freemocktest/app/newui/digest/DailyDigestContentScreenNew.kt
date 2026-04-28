package com.freemocktest.app.newui.digest

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Quiz
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette

@Composable
fun DailyDigestContentScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var item by remember { mutableStateOf<ContentRepository.DailyDigestRemote?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { ContentRepository.loadDailyDigestItem() }
            .onSuccess {
                item = it
                if (it == null) {
                    error = "Daily Digest is not available right now"
                }
            }
            .onFailure { error = "Failed to load daily digest" }
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "Back", tint = p.textPrimary)
                }
                Text(
                    text = "Daily Digest",
                    color = p.textPrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 22.sp,
                )
            }
            Spacer(Modifier.height(12.dp))

            if (item == null) {
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = p.surface),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = error ?: "Loading Daily Digest...",
                        color = p.textSecondary,
                        modifier = Modifier.padding(16.dp),
                    )
                }
                return@Scaffold
            }

            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                modifier = Modifier.fillMaxWidth().border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(16.dp)),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Quiz, contentDescription = null, tint = p.accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.size(8.dp))
                        Text("Question of the Day", color = p.accent, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(item?.questionPrompt.orEmpty(), color = p.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item?.options.orEmpty().forEachIndexed { idx, opt ->
                            Card(
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = p.surfaceElevated),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    text = "${'A' + idx}. $opt",
                                    color = p.textPrimary,
                                    fontSize = 14.sp,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                modifier = Modifier.fillMaxWidth().border(1.dp, p.border.copy(alpha = 0.2f), RoundedCornerShape(16.dp)),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Lightbulb, contentDescription = null, tint = p.success, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.size(8.dp))
                        Text("Fact of the Day", color = p.success, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(item?.factText.orEmpty(), color = p.textPrimary, fontSize = 15.sp, lineHeight = 21.sp)
                }
            }
        }
    }
}

