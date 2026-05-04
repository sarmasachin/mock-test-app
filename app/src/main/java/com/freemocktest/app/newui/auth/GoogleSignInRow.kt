package com.freemocktest.app.newui.auth

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.BuildConfig
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException

/**
 * Play Services account picker only — no Retrofit / SMTP. Server exchange happens in the caller.
 */
@Composable
fun ContinueWithGoogleSection(
    modifier: Modifier = Modifier,
    requireTermsAccepted: Boolean,
    termsAccepted: Boolean,
    onTermsNotAccepted: () -> Unit,
    enabled: Boolean,
    pickingAccount: Boolean,
    onPickingAccountChange: (Boolean) -> Unit,
    onGoogleIdToken: (String) -> Unit,
    onPickerErrorMessage: (String) -> Unit,
) {
    val p = mockTestPalette()
    val context = LocalContext.current
    val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
    val signInClient = remember(webClientId) {
        val opts = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestIdToken(webClientId)
            .build()
        GoogleSignIn.getClient(context, opts)
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        onPickingAccountChange(false)
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val idToken = account?.idToken?.trim().orEmpty()
            if (idToken.isEmpty()) {
                onPickerErrorMessage("Google did not return an ID token. Check Web client ID and app signing (SHA-1) in Firebase.")
            } else {
                onGoogleIdToken(idToken)
            }
        } catch (e: ApiException) {
            if (e.statusCode == GoogleSignInStatusCodes.SIGN_IN_CANCELLED) {
                return@rememberLauncherForActivityResult
            }
            onPickerErrorMessage("Google sign-in failed (${e.statusCode})")
        } catch (_: Exception) {
            onPickerErrorMessage("Google sign-in failed")
        }
    }

    Column(modifier = modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        RowOrColumnDividerLabel(
            lineColor = p.border.copy(alpha = 0.35f),
            label = "or continue with",
            labelColor = p.textSecondary,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedButton(
            onClick = {
                if (!enabled || pickingAccount) return@OutlinedButton
                if (requireTermsAccepted && !termsAccepted) {
                    onTermsNotAccepted()
                    return@OutlinedButton
                }
                if (webClientId.isBlank()) {
                    onPickerErrorMessage("Google Web client ID is not configured in the app build.")
                    return@OutlinedButton
                }
                onPickingAccountChange(true)
                launcher.launch(signInClient.signInIntent)
            },
            enabled = enabled && !pickingAccount,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text(
                text = if (pickingAccount) "Opening Google…" else "Continue with Google",
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
        }
    }
}

@Composable
private fun RowOrColumnDividerLabel(
    lineColor: Color,
    label: String,
    labelColor: Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = lineColor)
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 10.dp),
            color = labelColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        HorizontalDivider(modifier = Modifier.weight(1f), color = lineColor)
    }
}
