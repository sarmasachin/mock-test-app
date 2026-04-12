package com.example.mocktestapp.newui.legal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
fun PrivacyPolicyScreenNew(
    onBack: () -> Unit,
) {
    StaticLegalScreen(
        title = "Privacy policy",
        body = privacyPolicyText,
        onBack = onBack,
    )
}

@Composable
fun TermsOfServiceScreenNew(
    onBack: () -> Unit,
) {
    StaticLegalScreen(
        title = "Terms of use",
        body = termsText,
        onBack = onBack,
    )
}

@Composable
private fun StaticLegalScreen(
    title: String,
    body: String,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val shape = RoundedCornerShape(18.dp)

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(horizontal = 18.dp, vertical = 14.dp),
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
                    text = title,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Spacer(Modifier.height(14.dp))
            Card(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(shape)
                    .border(1.dp, p.border.copy(alpha = 0.16f), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = p.surface),
            ) {
                Text(
                    text = body,
                    color = p.textPrimary,
                    fontSize = 14.sp,
                    lineHeight = 21.sp,
                    modifier = Modifier
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState()),
                )
            }
        }
    }
}

private val privacyPolicyText = """
This Privacy Policy describes how MockTestApp handles information on your device.

Data on device: quiz progress, cached WebView URLs, digest streaks, and verification flags are stored locally using DataStore until you delete them or uninstall the app.

Push notifications: if you enable notifications, Firebase Cloud Messaging may receive tokens and message metadata. Wire your own backend to store tokens responsibly.

Analytics: this demo build does not include third-party analytics by default.

Your rights: you can export local preferences from Profile and request account deletion flows when a backend exists.

Contact: add your support email before publishing.
""".trimIndent()

private val termsText = """
By using MockTestApp you agree to these terms.

The app is provided as-is for practice and learning. Exam dates, job listings, and news shown in WebView or notifications may come from third-party sites; verify critical information at official sources.

You are responsible for complying with third-party website terms when browsing inside the app.

We are not liable for missed deadlines or incorrect content originating from external feeds.

Replace this text with counsel-reviewed terms before production release.
""".trimIndent()
