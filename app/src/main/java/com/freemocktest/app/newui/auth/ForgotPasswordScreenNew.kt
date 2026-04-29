package com.freemocktest.app.newui.auth

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.newui.components.AppSnackbarHostNew
import com.freemocktest.app.newui.components.AuthScreenFeedback
import com.freemocktest.app.newui.components.AuthScreenFeedbackBanner
import com.freemocktest.app.newui.components.rememberAppSnackbarHostStateNew
import com.freemocktest.app.newui.components.showError
import com.freemocktest.app.newui.components.showSuccess
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ForgotPasswordScreenNew(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var step by remember { mutableIntStateOf(0) }
    var email by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var emailError by remember { mutableStateOf<String?>(null) }
    var otpError by remember { mutableStateOf<String?>(null) }
    var newPasswordError by remember { mutableStateOf<String?>(null) }
    var confirmPasswordError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var resendBusy by remember { mutableStateOf(false) }
    var resendCooldownSec by remember { mutableIntStateOf(0) }
    var feedback by remember { mutableStateOf<AuthScreenFeedback?>(null) }
    val snackbar = rememberAppSnackbarHostStateNew()
    val scope = rememberCoroutineScope()

    LaunchedEffect(resendCooldownSec) {
        if (resendCooldownSec > 0) {
            delay(1000L)
            resendCooldownSec -= 1
        }
    }

    val fieldColors = TextFieldDefaults.colors(
        focusedContainerColor = p.surfaceElevated,
        unfocusedContainerColor = p.surfaceElevated,
        focusedTextColor = p.textPrimary,
        unfocusedTextColor = p.textPrimary,
        focusedLabelColor = p.textSecondary,
        unfocusedLabelColor = p.textSecondary,
        cursorColor = p.accent,
        focusedIndicatorColor = p.accent,
        unfocusedIndicatorColor = p.border.copy(alpha = 0.35f),
    )

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        snackbarHost = { AppSnackbarHostNew(state = snackbar) },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .statusBarsPadding()
                .padding(18.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack, enabled = !busy) {
                    Icon(
                        imageVector = Icons.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
            }
            Spacer(Modifier.height(18.dp))

            val shape = RoundedCornerShape(18.dp)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .border(1.dp, p.border.copy(alpha = 0.16f), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = p.surface),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Errors stay at the top; success after email is verified shows under the email field.
                    val errorFeedback = feedback?.takeIf { it.isError }
                    if (errorFeedback != null) {
                        AuthScreenFeedbackBanner(
                            palette = p,
                            feedback = errorFeedback,
                            onDismiss = { feedback = null },
                        )
                        Spacer(Modifier.height(14.dp))
                    }

                    // Email always first: editable until verified, then locked (read-only).
                    OutlinedTextField(
                        value = email,
                        onValueChange = { v ->
                            if (step == 0) {
                                email = v.trim()
                                emailError = null
                                feedback = null
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        isError = emailError != null,
                        readOnly = step > 0,
                        enabled = !busy,
                        label = { Text("Gmail / email") },
                        singleLine = true,
                        colors = fieldColors,
                        supportingText = {
                            if (emailError != null) {
                                Text(
                                    text = emailError ?: "",
                                    color = p.error,
                                    fontSize = 12.sp,
                                )
                            } else {
                                Text(
                                    text = if (step == 0) {
                                        "We only send a code if this email is registered on your account."
                                    } else {
                                        "Verified — this address is locked. Tap \"Use a different email\" below to change it."
                                    },
                                    color = p.textSecondary,
                                    fontSize = 12.sp,
                                    lineHeight = 16.sp,
                                )
                            }
                        },
                    )

                    if (step == 0) {
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = {
                                if (!isValidEmail(email)) {
                                    emailError = "Enter a valid email address."
                                    feedback = AuthScreenFeedback(
                                        isError = true,
                                        title = "Invalid email",
                                        detail = "Please enter a valid email address.",
                                    )
                                    return@Button
                                }
                                scope.launch {
                                    busy = true
                                    emailError = null
                                    feedback = null
                                    val r = AuthRepository.requestPasswordResetOtp(email)
                                    busy = false
                                    r.onSuccess { body ->
                                        if (body.ok) {
                                            otp = ""
                                            newPassword = ""
                                            confirmPassword = ""
                                            otpError = null
                                            newPasswordError = null
                                            confirmPasswordError = null
                                            step = 1
                                            resendCooldownSec = 30
                                            feedback = AuthScreenFeedback(
                                                isError = false,
                                                title = "Verification successful",
                                                detail = body.message?.takeIf { it.isNotBlank() }
                                                    ?: "A 6-digit OTP was sent to this Gmail. Enter it in the box below — you cannot edit this email until you start over.",
                                                successUsesMailIcon = true,
                                            )
                                        } else {
                                            feedback = AuthScreenFeedback(
                                                isError = true,
                                                title = "No account for this email",
                                                detail = body.error
                                                    ?: "This email is not registered. Sign up or fix a typo.",
                                            )
                                        }
                                    }
                                    r.onFailure {
                                        feedback = AuthScreenFeedback(
                                            isError = true,
                                            title = "Could not send code",
                                            detail = it.message ?: "Check your connection and try again.",
                                        )
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            enabled = !busy,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                        ) {
                            if (busy) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = p.onPrimaryButton,
                                    )
                                    Spacer(Modifier.size(8.dp))
                                    Text(text = "Sending...", fontWeight = FontWeight.Bold)
                                }
                            } else {
                                Text(text = "Send code to email", fontWeight = FontWeight.Bold)
                            }
                        }
                    } else {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            text = "Enter OTP",
                            color = p.textPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            lineHeight = 20.sp,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Type the 6-digit code from the email we sent to the Gmail address above.",
                            color = p.textSecondary,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "If you do not see it within a minute, check Spam or Promotions.",
                            color = p.textSecondary.copy(alpha = 0.88f),
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = otp,
                            onValueChange = { v ->
                                otp = v.filter(Char::isDigit).take(6)
                                otpError = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            isError = otpError != null,
                            label = { Text("6-digit OTP") },
                            placeholder = { Text("______", color = p.textSecondary.copy(alpha = 0.45f)) },
                            singleLine = true,
                            enabled = !busy,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = fieldColors,
                            supportingText = {
                                if (otpError != null) {
                                    Text(text = otpError ?: "", color = p.error, fontSize = 12.sp)
                                }
                            },
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = newPassword,
                            onValueChange = {
                                newPassword = it
                                newPasswordError = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            isError = newPasswordError != null,
                            label = { Text("New password") },
                            singleLine = true,
                            enabled = !busy,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            colors = fieldColors,
                            supportingText = {
                                if (newPasswordError != null) {
                                    Text(text = newPasswordError ?: "", color = p.error, fontSize = 12.sp)
                                } else {
                                    Text(
                                        text = "Minimum 6 characters.",
                                        color = p.textSecondary,
                                        fontSize = 12.sp,
                                    )
                                }
                            },
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = confirmPassword,
                            onValueChange = {
                                confirmPassword = it
                                confirmPasswordError = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            isError = confirmPasswordError != null,
                            label = { Text("Confirm new password") },
                            singleLine = true,
                            enabled = !busy,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            colors = fieldColors,
                            supportingText = {
                                if (confirmPasswordError != null) {
                                    Text(text = confirmPasswordError ?: "", color = p.error, fontSize = 12.sp)
                                }
                            },
                        )
                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = {
                                otpError = null
                                newPasswordError = null
                                confirmPasswordError = null

                                val nextOtpError = if (otp.length != 6) "Enter the 6-digit OTP." else null
                                val nextNewPasswordError =
                                    if (newPassword.length < 6) "Password must be at least 6 characters." else null
                                val nextConfirmPasswordError = when {
                                    confirmPassword.isBlank() -> "Please confirm your new password."
                                    newPassword != confirmPassword -> "Passwords do not match."
                                    else -> null
                                }
                                if (nextOtpError != null || nextNewPasswordError != null || nextConfirmPasswordError != null) {
                                    otpError = nextOtpError
                                    newPasswordError = nextNewPasswordError
                                    confirmPasswordError = nextConfirmPasswordError
                                    return@Button
                                }

                                scope.launch {
                                    busy = true
                                    feedback = null
                                    val r = AuthRepository.completePasswordReset(
                                        email = email,
                                        otp = otp,
                                        newPassword = newPassword,
                                    )
                                    busy = false
                                    r.onSuccess {
                                        snackbar.showSuccess(
                                            "Password updated. Sign in with your new password.",
                                        )
                                        onBack()
                                    }
                                    r.onFailure {
                                        feedback = AuthScreenFeedback(
                                            isError = true,
                                            title = "Could not reset password",
                                            detail = it.message ?: "Check the code and try again.",
                                        )
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            enabled = !busy,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                        ) {
                            if (busy) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = p.onPrimaryButton,
                                    )
                                    Spacer(Modifier.size(8.dp))
                                    Text(text = "Updating...", fontWeight = FontWeight.Bold)
                                }
                            } else {
                                Text(text = "Reset password", fontWeight = FontWeight.Bold)
                            }
                        }
                        TextButton(
                            onClick = {
                                if (busy || resendBusy || resendCooldownSec > 0) return@TextButton
                                scope.launch {
                                    resendBusy = true
                                    feedback = null
                                    val r = AuthRepository.requestPasswordResetOtp(email)
                                    resendBusy = false
                                    r.onSuccess { body ->
                                        if (body.ok) {
                                            resendCooldownSec = 30
                                            snackbar.showSuccess(
                                                body.message?.takeIf { it.isNotBlank() } ?: "Code resent to your email.",
                                            )
                                        } else {
                                            feedback = AuthScreenFeedback(
                                                isError = true,
                                                title = "Could not resend code",
                                                detail = body.error ?: "Please try again.",
                                            )
                                        }
                                    }
                                    r.onFailure {
                                        feedback = AuthScreenFeedback(
                                            isError = true,
                                            title = "Could not resend code",
                                            detail = it.message ?: "Check your connection and try again.",
                                        )
                                    }
                                }
                            },
                            enabled = !busy && !resendBusy && resendCooldownSec == 0,
                            modifier = Modifier.padding(top = 4.dp),
                        ) {
                            if (resendBusy) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(14.dp),
                                        strokeWidth = 2.dp,
                                        color = p.accent,
                                    )
                                    Spacer(Modifier.size(6.dp))
                                    Text("Sending...")
                                }
                            } else {
                                Text(
                                    text = if (resendCooldownSec > 0) {
                                        "Resend code in ${resendCooldownSec}s"
                                    } else {
                                        "Resend code"
                                    },
                                    color = if (resendCooldownSec > 0) p.textSecondary else p.accent,
                                )
                            }
                        }
                        TextButton(
                            onClick = {
                                if (!busy) {
                                    step = 0
                                    otp = ""
                                    newPassword = ""
                                    confirmPassword = ""
                                    otpError = null
                                    newPasswordError = null
                                    confirmPasswordError = null
                                    emailError = null
                                    resendCooldownSec = 0
                                    feedback = null
                                }
                            },
                            enabled = !busy,
                            modifier = Modifier.padding(top = 4.dp),
                        ) {
                            Text("Use a different email", color = p.accent)
                        }
                    }
                }
            }
        }
    }
}
