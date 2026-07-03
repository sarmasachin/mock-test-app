package com.freemocktest.app.newui.profile

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import com.freemocktest.app.util.UserInterestUtils
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
fun ProfileEditInterestsScreen(
    onBack: () -> Unit,
    onSaved: (message: String) -> Unit,
    onError: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val scope = rememberCoroutineScope()

    var categories by remember { mutableStateOf<List<ContentRepository.InterestPickerCategory>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableIntStateOf(0) }
    var selectedSubcategories by remember { mutableStateOf(setOf<String>()) }
    var saving by remember { mutableStateOf(false) }
    var initialSelectionApplied by remember { mutableStateOf(false) }

    LaunchedEffect(reloadKey) {
        loading = true
        loadFailed = false
        initialSelectionApplied = false
        try {
            categories = ContentRepository.loadInterestSubcategoriesForPicker(limit = 100)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            categories = emptyList()
            loadFailed = true
        } finally {
            loading = false
        }
    }

    LaunchedEffect(loading) {
        if (loading || initialSelectionApplied) return@LaunchedEffect
        val subs = UserInterestUtils.normalizeInterestSubcategories(
            AppPreferencesRepository.peekLoginPickedSubcategories(),
        )
        selectedSubcategories = subs.toSet()
        initialSelectionApplied = true
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
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack, enabled = !saving) {
                    Icon(
                        Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(4.dp))
                Text(
                    text = "Meri interests",
                    color = p.textPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Jo exams aapko chahiye unhe chunein. Tests tab me sirf ye dikhenge — \"Saare tests dekho\" se poora catalog bhi khul sakta hai.",
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
                            CircularProgressIndicator(color = p.accent, modifier = Modifier.size(32.dp))
                            Spacer(Modifier.height(12.dp))
                            Text(
                                text = "Exams load ho rahe hain…",
                                color = p.textSecondary,
                                fontSize = 14.sp,
                            )
                        }
                    }
                    loadFailed && categories.isEmpty() -> {
                        InterestStatusCard(
                            title = "Exams load nahi ho paaye",
                            body = "Internet ya server check karein, phir Retry dabayein.",
                            actionLabel = "Retry",
                            onAction = { reloadKey += 1 },
                        )
                    }
                    categories.isEmpty() -> {
                        InterestStatusCard(
                            title = "Abhi koi exam category nahi hai",
                            body = "Admin ne exam categories set nahi ki. Baad me dubara try karein.",
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
                                        onCheckedChange = { if (!saving) toggleSubcategory(label) },
                                        enabled = !saving,
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

            Spacer(Modifier.height(12.dp))
            Button(
                onClick = {
                    if (saving) return@Button
                    if (categories.isNotEmpty() && selectedSubcategories.isEmpty()) {
                        onError("Kam se kam ek exam chunein")
                        return@Button
                    }
                    scope.launch {
                        saving = true
                        try {
                            val subs = UserInterestUtils.normalizeInterestSubcategories(
                                selectedSubcategories.toList(),
                            )
                            val localOk = AppPreferencesRepository.saveProfileUserInterests(subs)
                            if (!localOk) {
                                onError("Save nahi ho paaya. Dubara try karein.")
                                return@launch
                            }
                            val serverSynced = runCatching {
                                AuthRepository.saveUserInterestsToServer(subs)
                            }.isSuccess
                            onSaved(
                                if (serverSynced) {
                                    "Interests saved"
                                } else {
                                    "Saved on device; server sync will retry on login"
                                },
                            )
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = !loading && !saving && categories.isNotEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = p.accent,
                    contentColor = Color.White,
                ),
            ) {
                if (saving) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(22.dp),
                    )
                } else {
                    Text("Save", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun InterestStatusCard(
    title: String,
    body: String,
    actionLabel: String,
    onAction: () -> Unit,
) {
    val p = mockTestPalette()
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = p.surface),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = title,
                    color = p.textPrimary,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = body,
                    color = p.textSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = onAction) {
                    Text(actionLabel, color = p.systemBlue, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
