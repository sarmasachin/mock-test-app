package com.freemocktest.app.newui.auth

import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.tests.TestCardNew
import com.freemocktest.app.newui.theme.palette.MockTestUiPalette
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import com.freemocktest.app.util.UserInterestUtils
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Post-login interest picker — user selects exam subcategories (examCategories level3).
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

    var categories by remember { mutableStateOf<List<ContentRepository.InterestPickerCategory>>(emptyList()) }
    var catalogSnapshot by remember { mutableStateOf<List<TestCardNew>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableIntStateOf(0) }
    var selectedSubcategories by remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(reloadKey) {
        loading = true
        loadFailed = false
        try {
            val catalog = ContentRepository.loadCatalogTestsForPicker(limit = 100)
            catalogSnapshot = catalog
            categories = ContentRepository.loadInterestSubcategoriesForPicker(limit = 100)
            Log.d("SelectLoginTests", "picker loaded ${categories.size} interest(s), catalog=${catalog.size}")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.e("SelectLoginTests", "interest picker load failed", e)
            categories = emptyList()
            catalogSnapshot = emptyList()
            loadFailed = true
        } finally {
            loading = false
        }
    }

    fun toggleSubcategory(subcategory: String) {
        val label = subcategory.trim()
        if (label.isBlank()) return
        val key = label.lowercase(Locale.US)
        val existing = selectedSubcategories.firstOrNull { it.lowercase(Locale.US) == key }
        selectedSubcategories = if (existing != null) {
            selectedSubcategories.filterNot { it.lowercase(Locale.US) == key }.toSet()
        } else {
            selectedSubcategories + label
        }
    }

    fun isSubcategorySelected(subcategory: String): Boolean {
        val key = subcategory.trim().lowercase(Locale.US)
        if (key.isBlank()) return false
        return selectedSubcategories.any { it.lowercase(Locale.US) == key }
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
                        if (categories.isNotEmpty() && selectedSubcategories.isEmpty()) {
                            Toast.makeText(context, "Kam se kam ek exam chunein", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        scope.launch {
                            val subs = UserInterestUtils.normalizeInterestSubcategories(
                                selectedSubcategories.toList(),
                            )
                            val hintTitles = ContentRepository.sampleTitlesForSubcategories(
                                catalog = catalogSnapshot,
                                subcategories = subs,
                            )
                            val ok = runCatching {
                                AppPreferencesRepository.saveLoginInterestPick(
                                    selectedSubcategories = subs,
                                    selectedTitles = hintTitles,
                                )
                            }.getOrDefault(false)
                            if (!ok) {
                                Toast.makeText(
                                    context,
                                    "Could not save your selection. Please try again.",
                                    Toast.LENGTH_SHORT,
                                ).show()
                                return@launch
                            }
                            if (subs.isNotEmpty()) {
                                runCatching {
                                    AuthRepository.saveUserInterestsToServer(subs)
                                }.onFailure { e ->
                                    Log.w("SelectLoginTests", "server interest sync failed", e)
                                }
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
                text = "Apne exams chunein",
                color = p.textPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Jo exams aapko chahiye unhe select karein. Baad me Profile se badal sakte hain — Tests tab se saare tests bhi dekh sakte hain.",
                color = p.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = 18.sp,
            )
            Spacer(Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                when {
                    loading -> {
                        Column(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            CircularProgressIndicator(
                                color = p.accent,
                                modifier = Modifier.size(36.dp),
                            )
                            Spacer(Modifier.height(14.dp))
                            Text(
                                text = "Exams load ho rahe hain…",
                                color = p.textSecondary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                    loadFailed && categories.isEmpty() -> {
                        PickerStatusCard(
                            palette = p,
                            title = "Exams load nahi ho paaye",
                            body = "Internet ya server check karein, phir Retry dabayein. Continue se aap Home par ja sakte hain.",
                            actionLabel = "Retry",
                            onAction = { reloadKey += 1 },
                        )
                    }
                    categories.isEmpty() -> {
                        PickerStatusCard(
                            palette = p,
                            title = "Abhi koi exam category nahi hai",
                            body = "Admin ne exam categories ya published tests set nahi kiye. Continue dabakar aage badh sakte hain — baad me Tests tab se apply kar sakte hain.",
                            actionLabel = "Reload",
                            onAction = { reloadKey += 1 },
                        )
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            items(categories, key = { it.subcategory }) { item ->
                                val label = item.subcategory.trim()
                                if (label.isBlank()) return@items
                                val checked = isSubcategorySelected(label)
                                val countLabel = when (item.publishedTestCount) {
                                    0 -> "No published tests yet"
                                    1 -> "1 test"
                                    else -> "${item.publishedTestCount} tests"
                                }
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Checkbox(
                                        checked = checked,
                                        onCheckedChange = { toggleSubcategory(label) },
                                    )
                                    Column(
                                        modifier = Modifier
                                            .weight(1f)
                                            .padding(start = 4.dp),
                                    ) {
                                        Text(
                                            text = label,
                                            color = p.textPrimary,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        Text(
                                            text = countLabel,
                                            color = p.textSecondary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
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
}

@Composable
private fun PickerStatusCard(
    palette: MockTestUiPalette,
    title: String,
    body: String,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = palette.surface),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = title,
                    color = palette.textPrimary,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = body,
                    color = palette.textSecondary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 18.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = onAction) {
                    Text(actionLabel, color = palette.systemBlue, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
