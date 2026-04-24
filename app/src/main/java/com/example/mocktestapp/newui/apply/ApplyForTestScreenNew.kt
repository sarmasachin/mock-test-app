package com.example.mocktestapp.newui.apply

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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.ContentRepository
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
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
    var slotInfo by remember { mutableStateOf("Morning Slot") }
    var appliedInfo by remember { mutableStateOf("0") }
    var remainingSeatsInfo by remember { mutableStateOf("0 seats left") }
    var startSeriesLockMs by remember { mutableStateOf(20_000L) }
    var startSeriesActiveWindowMs by remember { mutableStateOf(30 * 60 * 1000L) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val remote = ContentRepository.loadSubmitApplicationContent() ?: return@LaunchedEffect
        pageTitle = remote.title?.ifBlank { pageTitle } ?: pageTitle
        benefitsTitle = remote.benefitsTitle?.ifBlank { benefitsTitle } ?: benefitsTitle
        submitButtonLabel = remote.submitButtonLabel?.ifBlank { submitButtonLabel } ?: submitButtonLabel
        successMessage = remote.successMessage?.ifBlank { successMessage } ?: successMessage
        if (remote.bulletItems.isNotEmpty()) {
            bulletItems = remote.bulletItems
        }
    }
    LaunchedEffect(Unit) {
        val home = ContentRepository.loadHomeContent() ?: return@LaunchedEffect
        startSeriesLockMs = home.startSeriesLockSeconds.coerceAtLeast(0).toLong() * 1000L
        startSeriesActiveWindowMs = home.startSeriesActiveWindowMinutes.coerceAtLeast(1).toLong() * 60_000L
    }
    LaunchedEffect(title) {
        val test = ContentRepository.loadTestByTitle(title)
        slotInfo = test?.slotLabel?.ifBlank { "Morning Slot" } ?: "Morning Slot"
        appliedInfo = test?.enrolledLabel?.ifBlank { "0" } ?: "0"
        remainingSeatsInfo = test?.remainingSeatsLabel?.ifBlank { "0 seats left" } ?: "0 seats left"
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
                    Spacer(Modifier.height(10.dp))

                    if (!revealSubmitSection) {
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
                    } else {
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
                            onClick = { showSuccessDialog = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                        ) {
                            Text(text = submitButtonLabel, fontWeight = FontWeight.Bold)
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
                            AppPreferencesRepository.addAppliedTestSeries(
                                testName = title,
                                lockMs = startSeriesLockMs,
                                activeWindowMs = startSeriesActiveWindowMs,
                            )
                        }
                        showSuccessDialog = false
                        onSubmit()
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
