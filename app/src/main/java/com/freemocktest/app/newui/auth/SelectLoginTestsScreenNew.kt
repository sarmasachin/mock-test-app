package com.freemocktest.app.newui.auth

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.tests.TestCardNew
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Shown once after login (or cold start with restored session) until the user submits.
 * Compact layout: header + scrollable list in the middle band + fixed submit — avoids one endless tall page.
 */
@Composable
fun SelectLoginTestsScreenNew(
    modifier: Modifier = Modifier,
    onFinished: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var tests by remember { mutableStateOf<List<TestCardNew>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableIntStateOf(0) }
    var selectedTitles by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(reloadKey) {
        loading = true
        loadFailed = false
        try {
            tests = ContentRepository.loadCatalogTestsForPicker(limit = 100)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            tests = emptyList()
            loadFailed = true
        } finally {
            loading = false
        }
    }

    fun toggleTitle(title: String) {
        val t = title.trim()
        if (t.isBlank()) return
        selectedTitles = if (t in selectedTitles) selectedTitles - t else selectedTitles + t
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(bg)
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp)
                    .padding(top = 8.dp, bottom = 12.dp),
            ) {
                Button(
                    onClick = {
                        if (tests.isNotEmpty() && selectedTitles.isEmpty()) {
                            Toast.makeText(context, "Select at least one test", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        scope.launch {
                            val ok = runCatching {
                                AppPreferencesRepository.saveLoginTestPick(selectedTitles.toList())
                            }.getOrDefault(false)
                            if (!ok) {
                                Toast.makeText(
                                    context,
                                    "Could not save your selection. Please try again.",
                                    Toast.LENGTH_SHORT,
                                ).show()
                                return@launch
                            }
                            onFinished()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = p.accent,
                        contentColor = Color.White,
                    ),
                ) {
                    Text(
                        text = "Continue",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp)
                .padding(top = 14.dp, bottom = 8.dp),
        ) {
            Text(
                text = "Choose your tests",
                color = p.textPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Pick the mock tests you care about. You can apply from Start Test later — same as before.",
                color = p.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                when {
                    loading -> {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = p.accent)
                        }
                    }
                    loadFailed && tests.isEmpty() -> {
                        Column(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                text = "Could not load tests. Check connection.",
                                color = p.textSecondary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(Modifier.height(10.dp))
                            TextButton(onClick = { reloadKey += 1 }) {
                                Text("Retry", color = p.systemBlue, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    tests.isEmpty() -> {
                        Text(
                            text = "No published tests yet. You can continue - we'll save an empty selection.",
                            color = p.textSecondary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            items(tests, key = { it.title }) { card ->
                                val title = card.title.trim()
                                if (title.isBlank()) return@items
                                val checked = title in selectedTitles
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Checkbox(
                                        checked = checked,
                                        onCheckedChange = { toggleTitle(title) },
                                    )
                                    Text(
                                        text = title,
                                        color = p.textPrimary,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier
                                            .weight(1f)
                                            .padding(start = 4.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
