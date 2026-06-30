package com.freemocktest.app.newui.apply

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.ContentRepository
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import com.freemocktest.app.newui.tests.TestCardNew
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun ApplyForTestScreenNew(
    modifier: Modifier = Modifier,
    title: String,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var pageTitle by remember { mutableStateOf("Apply") }
    var benefitsTitle by remember { mutableStateOf("What you’ll get") }
    var submitButtonLabel by remember { mutableStateOf("Submit Application") }
    var successMessage by remember { mutableStateOf("Your application was submitted successfully.") }
    var bulletItems by remember {
        mutableStateOf(
            listOf(
                "Instant access after approval",
                "Mock test practice & review",
                "Score history in your profile",
            ),
        )
    }
    var showSuccessDialog by remember { mutableStateOf(false) }
    var revealSubmitSection by remember { mutableStateOf(false) }
    var testId by remember { mutableStateOf("") }
    var resolvedTestName by remember { mutableStateOf(title) }
    var slotInfo by remember { mutableStateOf("Morning Slot") }
    var appliedInfo by remember { mutableStateOf("0") }
    var remainingSeatsInfo by remember { mutableStateOf("0 seats left") }
    var submitError by remember { mutableStateOf<String?>(null) }
    var submitWarning by remember { mutableStateOf<String?>(null) }
    var isWaitlisted by remember { mutableStateOf(false) }
    var waitingPosition by remember { mutableIntStateOf(0) }
    var waitingTotal by remember { mutableIntStateOf(0) }
    var isSubmitting by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var refreshTick by remember { mutableIntStateOf(0) }
    var startSeriesLockMs by remember { mutableStateOf(20_000L) }
    var startSeriesActiveWindowMs by remember { mutableStateOf(30 * 60 * 1000L) }
    var localApplySeriesSaved by remember { mutableStateOf(false) }
    var hasAlreadyApplied by remember { mutableStateOf(false) }
    var testBetweenCycles by remember { mutableStateOf(false) }
    var testUnavailable by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(Unit) {
        // CMS copy for this screen; on failure the built-in defaults stay in effect.
        try {
            val remote = runCatching { ContentRepository.loadSubmitApplicationContent() }.getOrNull()
                ?: return@LaunchedEffect
            pageTitle = remote.title?.ifBlank { pageTitle } ?: pageTitle
            benefitsTitle = remote.benefitsTitle?.ifBlank { benefitsTitle } ?: benefitsTitle
            submitButtonLabel = remote.submitButtonLabel?.ifBlank { submitButtonLabel } ?: submitButtonLabel
            successMessage = remote.successMessage?.ifBlank { successMessage } ?: successMessage
            if (remote.bulletItems.isNotEmpty()) {
                bulletItems = remote.bulletItems
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Defaults already initialised in `remember { mutableStateOf(...) }` remain in effect.
        }
    }
    LaunchedEffect(Unit) {
        // Lock-window/active-window come from CMS; on failure the safe defaults
        // (`20_000L`, `30 * 60 * 1000L`) initialised above remain in effect.
        try {
            val home = runCatching { ContentRepository.loadHomeContent() }.getOrNull() ?: return@LaunchedEffect
            startSeriesLockMs = home.startSeriesLockSeconds.coerceAtLeast(0).toLong() * 1000L
            startSeriesActiveWindowMs = home.startSeriesActiveWindowMinutes.coerceAtLeast(1).toLong() * 60_000L
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Defaults remain in effect.
        }
    }
    LaunchedEffect(title, refreshTick) {
        isRefreshing = true
        // try/finally guarantees `isRefreshing` is reset even if any repository call throws
        // (otherwise the "Refreshing latest seats..." text would be stuck on screen forever).
        // On failure we deliberately KEEP previously-resolved values so the user doesn't
        // lose a good snapshot just because a single ON_RESUME refresh hit a network blip.
        try {
            val routeTitle = title.trim()
            val myApplications = runCatching { AuthRepository.loadMyTestApplications() }
                .getOrNull()
                ?.getOrNull()
                .orEmpty()

            val directMatch = runCatching {
                ContentRepository.loadTestByTitle(routeTitle, forceRefresh = true, allowDefaultFallback = false)
            }.getOrNull()
            val publishedTest = if (directMatch?.id?.isNotBlank() == true) {
                directMatch
            } else {
                runCatching {
                    ContentRepository.loadTestsForSubcategory(routeTitle, forceRefresh = true)
                        .firstOrNull { it.id.isNotBlank() }
                }.getOrNull()
            }

            val matchedApplication = myApplications.firstOrNull { app ->
                val appTitle = app.testTitle.trim()
                val appId = app.testId.trim()
                when {
                    publishedTest?.id?.isNotBlank() == true && appId == publishedTest.id -> true
                    appTitle.equals(routeTitle, ignoreCase = true) -> true
                    publishedTest?.title?.let { appTitle.equals(it, ignoreCase = true) } == true -> true
                    else -> false
                }
            }

            val resolvedTest = publishedTest ?: matchedApplication?.let { app ->
                TestCardNew(
                    id = app.testId,
                    title = app.testTitle.ifBlank { routeTitle },
                    meta = if (app.isPublished) {
                        "Live test"
                    } else {
                        "Between cycles — opens again when republished"
                    },
                    slotLabel = app.slotLabel,
                    enrolledCount = app.enrolledCount,
                    capacityTotal = app.capacityTotal,
                    remainingSeats = app.remainingSeats,
                    enrolledLabel = if (app.capacityTotal > 0) {
                        "${app.enrolledCount.coerceAtLeast(0)}/${app.capacityTotal.coerceAtLeast(0)}"
                    } else if (app.isPublished) {
                        "${app.enrolledCount.coerceAtLeast(0)}"
                    } else {
                        null
                    },
                    remainingSeatsLabel = if (app.isPublished) {
                        "${app.remainingSeats.coerceAtLeast(0)} seats left"
                    } else {
                        null
                    },
                )
            }

            testId = resolvedTest?.id?.trim().orEmpty()
            resolvedTestName = resolvedTest?.title?.trim()?.ifBlank { routeTitle } ?: routeTitle
            slotInfo = resolvedTest?.slotLabel?.ifBlank { "Morning Slot" } ?: "Morning Slot"

            hasAlreadyApplied = matchedApplication != null
            testBetweenCycles = matchedApplication != null && !matchedApplication.isPublished
            testUnavailable = resolvedTest == null || testId.isBlank()

            when {
                publishedTest != null -> {
                    val enrolled = publishedTest.enrolledCount
                    val capacity = publishedTest.capacityTotal
                    val remaining = publishedTest.remainingSeats
                    appliedInfo = if (enrolled != null && capacity != null && capacity > 0) {
                        "${enrolled.coerceAtLeast(0)}/${capacity.coerceAtLeast(0)}"
                    } else {
                        publishedTest.enrolledLabel?.ifBlank { null } ?: "—"
                    }
                    remainingSeatsInfo = if (remaining != null) {
                        "${remaining.coerceAtLeast(0)} seats left"
                    } else {
                        publishedTest.remainingSeatsLabel?.ifBlank { null } ?: "—"
                    }
                }
                testBetweenCycles -> {
                    appliedInfo = "—"
                    remainingSeatsInfo = "Opens in next cycle"
                }
                matchedApplication != null && matchedApplication.isPublished -> {
                    val app = matchedApplication
                    appliedInfo = if (app.capacityTotal > 0) {
                        "${app.enrolledCount.coerceAtLeast(0)}/${app.capacityTotal.coerceAtLeast(0)}"
                    } else {
                        "${app.enrolledCount.coerceAtLeast(0)}"
                    }
                    remainingSeatsInfo = "${app.remainingSeats.coerceAtLeast(0)} seats left"
                }
                else -> {
                    appliedInfo = "—"
                    remainingSeatsInfo = "Unavailable"
                }
            }

            if (hasAlreadyApplied) {
                revealSubmitSection = false
            }

            if (testId.isNotBlank()) {
                runCatching { AuthRepository.getTestWaitlistStatus(testId) }
                    .getOrNull()
                    ?.onSuccess { status ->
                        isWaitlisted = status.waitlisted
                        waitingPosition = status.waitingPosition.coerceAtLeast(0)
                        waitingTotal = status.waitingTotal.coerceAtLeast(0)
                    }
            } else {
                isWaitlisted = false
                waitingPosition = 0
                waitingTotal = 0
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Keep last-good values on screen; the user can pull background→foreground
            // (DisposableEffect bumps `refreshTick`) to retry.
        } finally {
            // When this effect is cancelled because `refreshTick` changed, do not clear
            // `isRefreshing` here — the new effect immediately sets it true again. Clearing
            // during cancel races the new run and makes Retry / resume look like they "flicker".
            if (isActive) {
                isRefreshing = false
            }
        }
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                refreshTick += 1
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Block accidental Back press while a submission is in flight: the server-side application
    // may have already been recorded, so navigating away mid-submit could leave the user thinking
    // they hadn't applied (a "phantom application"). The toast is short feedback only; once
    // `isSubmitting` flips to false the BackHandler disables itself and Back works normally.
    BackHandler(enabled = isSubmitting) {
        Toast.makeText(
            context,
            "Submitting your application... please wait.",
            Toast.LENGTH_SHORT,
        ).show()
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
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            TopBar(title = pageTitle, onBack = onBack)
            Spacer(Modifier.height(14.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = p.surface),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    p.border.copy(alpha = 0.18f),
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Test: $title",
                        color = p.textPrimary,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 16.sp,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Outlined.Schedule,
                            contentDescription = null,
                            tint = p.accent,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Slot: $slotInfo",
                            color = p.textSecondary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Outlined.Groups,
                            contentDescription = null,
                            tint = p.accent,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Applied users: $appliedInfo",
                            color = p.textSecondary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Remaining seats: $remainingSeatsInfo",
                        color = p.textSecondary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (isWaitlisted) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Waiting list active: Position $waitingPosition of $waitingTotal",
                            color = Color(0xFF92400E),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    // Keep a stable slot so the action button does not jump while refresh state toggles.
                    Text(
                        text = "Refreshing latest seats...",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 18.dp)
                            .graphicsLayer { alpha = if (isRefreshing) 1f else 0f },
                    )
                    // Manual retry when live catalog lookup failed and user has no saved application.
                    if (testUnavailable && !hasAlreadyApplied && !isRefreshing) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = if (testBetweenCycles) {
                                    "This test is between cycles. Check back when it is republished."
                                } else {
                                    "Couldn't load test details."
                                },
                                color = p.textSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(
                                onClick = {
                                    if (isRefreshing) return@TextButton
                                    refreshTick += 1
                                },
                                enabled = !isRefreshing,
                            ) {
                                Text(
                                    text = "Retry",
                                    color = p.systemBlue,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                    if (testBetweenCycles && hasAlreadyApplied) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Your application is saved. The test will reopen in the next scheduled cycle.",
                            color = Color(0xFF166534),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(Modifier.height(10.dp))

                    when {
                        hasAlreadyApplied && !isWaitlisted -> {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = "You have already applied for this test.",
                                color = Color(0xFF166534),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(12.dp))
                            Button(
                                onClick = onSubmit,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = p.primaryButton,
                                    contentColor = p.onPrimaryButton,
                                ),
                            ) {
                                Text(text = "Back to Start Test", fontWeight = FontWeight.Bold)
                            }
                        }
                        testBetweenCycles && !hasAlreadyApplied -> {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = "Applications are closed while this test is between cycles.",
                                color = p.textSecondary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        testUnavailable -> {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = "This test is not open for applications right now.",
                                color = p.textSecondary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        !revealSubmitSection -> {
                            Spacer(Modifier.height(6.dp))
                            Button(
                                onClick = { revealSubmitSection = true },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = p.systemBlue,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Text(text = "Apply for Test", fontWeight = FontWeight.Bold)
                            }
                        }
                        else -> {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            text = benefitsTitle,
                            color = p.textSecondary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                        )
                        Spacer(Modifier.height(10.dp))

                        bulletItems.forEach { item ->
                            Bullet(text = item)
                        }

                        Spacer(Modifier.height(16.dp))

                        Button(
                            onClick = {
                                if (isSubmitting) return@Button
                                submitError = null
                                submitWarning = null
                                if (testId.isBlank()) {
                                    submitError = "Test details unavailable. Please reopen this page."
                                    return@Button
                                }
                                isSubmitting = true
                                scope.launch {
                                    try {
                                        val result = AuthRepository.applyForTest(testId)
                                        result.onSuccess { response ->
                                            val enrolled = response.enrolledCount.coerceAtLeast(0)
                                            val capacity = response.capacityTotal.coerceAtLeast(0)
                                            val remaining = response.remainingSeats.coerceAtLeast(0)
                                            appliedInfo = if (capacity > 0) "$enrolled/$capacity" else "$enrolled"
                                            remainingSeatsInfo = "$remaining seats left"
                                            isWaitlisted = response.waitlisted
                                            waitingPosition = response.waitingPosition.coerceAtLeast(0)
                                            waitingTotal = response.waitingTotal.coerceAtLeast(0)
                                            successMessage = when {
                                                response.message?.isNotBlank() == true -> response.message
                                                response.alreadyApplied -> "You have already applied for this test."
                                                else -> successMessage
                                            }
                                            if (!response.waitlisted) {
                                                hasAlreadyApplied = true
                                                revealSubmitSection = false
                                                testBetweenCycles = false
                                                testUnavailable = false
                                                val titleToSave = response.testTitle?.trim()
                                                    ?.takeIf { it.isNotBlank() }
                                                    ?: resolvedTestName
                                                localApplySeriesSaved = runCatching {
                                                    AppPreferencesRepository.addAppliedTestSeriesNow(
                                                        testName = titleToSave,
                                                        lockMs = startSeriesLockMs,
                                                        activeWindowMs = startSeriesActiveWindowMs,
                                                    )
                                                }.getOrDefault(false) || localApplySeriesSaved
                                            }
                                            if (response.waitlisted) {
                                                submitWarning = successMessage
                                                showSuccessDialog = false
                                            } else {
                                                showSuccessDialog = true
                                            }
                                        }.onFailure { error ->
                                            val message = error.message?.ifBlank { "Unable to submit application." }
                                                ?: "Unable to submit application."
                                            submitError = message
                                            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                                        }
                                    } catch (e: CancellationException) {
                                        throw e
                                    } catch (_: Exception) {
                                        submitError = "Unable to submit application."
                                        Toast.makeText(
                                            context,
                                            "Unable to submit application.",
                                            Toast.LENGTH_LONG,
                                        ).show()
                                    } finally {
                                        isSubmitting = false
                                    }
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                            enabled = !isSubmitting,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center,
                                modifier = Modifier.heightIn(min = 22.dp),
                            ) {
                                Box(
                                    modifier = Modifier.size(18.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (isSubmitting) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            strokeWidth = 2.dp,
                                            color = p.onPrimaryButton,
                                        )
                                    }
                                }
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = if (isSubmitting) "Submitting..." else submitButtonLabel,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                        submitError?.let { msg ->
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = msg,
                                color = Color(0xFFB91C1C),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        submitWarning?.let { msg ->
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = msg,
                                color = Color(0xFF92400E),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        }
                    }
                }
            }
        }
    }

    if (showSuccessDialog) {
        AlertDialog(
            onDismissRequest = { showSuccessDialog = false },
            title = { Text(text = "Success") },
            text = { Text(text = successMessage) },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                if (!localApplySeriesSaved) {
                                    val titleToSave = resolvedTestName.trim().ifBlank { title.trim() }
                                    if (titleToSave.isNotBlank()) {
                                        localApplySeriesSaved = AppPreferencesRepository.addAppliedTestSeriesNow(
                                            testName = titleToSave,
                                            lockMs = startSeriesLockMs,
                                            activeWindowMs = startSeriesActiveWindowMs,
                                        )
                                    }
                                }
                            } catch (e: CancellationException) {
                                throw e
                            } catch (_: Exception) {
                                // Server already accepted the application; navigation must not block.
                            } finally {
                                showSuccessDialog = false
                                onSubmit()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = p.primaryButton),
                ) {
                    Text("OK", color = p.onPrimaryButton)
                }
            },
        )
    }
}

@Composable
private fun TopBar(
    title: String,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
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
        Spacer(Modifier.width(6.dp))
        Text(
            text = title,
            color = p.textPrimary,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 18.sp,
        )
    }
}

@Composable
private fun Bullet(text: String) {
    val p = mockTestPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .wrapContentHeight(),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = "•",
            color = p.accent,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 16.sp,
            modifier = Modifier.padding(top = 2.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = text,
            color = p.textPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
    Spacer(Modifier.height(10.dp))
}
