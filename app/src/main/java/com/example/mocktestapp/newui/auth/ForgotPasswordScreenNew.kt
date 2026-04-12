package com.example.mocktestapp.newui.auth

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.newui.components.AppSnackbarHostNew
import com.example.mocktestapp.newui.components.AuthScreenFeedback
import com.example.mocktestapp.newui.components.AuthScreenFeedbackBanner
import com.example.mocktestapp.newui.components.rememberAppSnackbarHostStateNew
import com.example.mocktestapp.newui.components.showError
import com.example.mocktestapp.newui.components.showSuccess
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
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
    var busy by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<AuthScreenFeedback?>(null) }
    val snackbar = rememberAppSnackbarHostStateNew()
    val scope = rememberCoroutineScope()

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
                                feedback = null
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        readOnly = step > 0,
                        enabled = !busy,
                        label = { Text("Gmail / email") },
                        singleLine = true,
                        colors = fieldColors,
                        supportingText = {
                            Text(
                                text = if (step == 0) {
                                    "We only send a code if this email is registered on your account."
                                } else {
                                    "Verified — this address is locked. Tap \"Use a different email\" below to change it."
                                },
                                color = p.textSecondary,
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                    )

                    val successFeedback = feedback?.takeIf { !it.isError }
                    if (step > 0 && successFeedback != null) {
                        Spacer(Modifier.height(12.dp))
                        AuthScreenFeedbackBanner(
                            palette = p,
                            feedback = successFeedback,
                            onDismiss = { feedback = null },
                        )
                        Spacer(Modifier.height(14.dp))
                    }

                    if (step == 0) {
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = {
                                if (!isValidEmail(email)) {
                                    feedback = AuthScreenFeedback(
                                        isError = true,
                                        title = "Invalid email",
                                        detail = "Please enter a valid email address.",
                                    )
                                    return@Button
                                }
                                scope.launch {
                                    busy = true
                                    feedback = null
                                    val r = AuthRepository.requestPasswordResetOtp(email)
                                    busy = false
                                    r.onSuccess { body ->
                                        if (body.ok) {
                                            otp = ""
                                            newPassword = ""
                                            confirmPassword = ""
                                            step = 1
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
                            Text(text = "Send code to email", fontWeight = FontWeight.Bold)
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
                            onValueChange = { v -> otp = v.filter(Char::isDigit).take(6) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("6-digit OTP") },
                            placeholder = { Text("______", color = p.textSecondary.copy(alpha = 0.45f)) },
                            singleLine = true,
                            enabled = !busy,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = fieldColors,
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = newPassword,
                            onValueChange = { newPassword = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("New password") },
                            singleLine = true,
                            enabled = !busy,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            colors = fieldColors,
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = confirmPassword,
                            onValueChange = { confirmPassword = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Confirm new password") },
                            singleLine = true,
                            enabled = !busy,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            colors = fieldColors,
                        )
                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = {
                                when {
                                    otp.length != 6 ->
                                        scope.launch { snackbar.showError("Enter the 6-digit code") }
                                    newPassword.length < 4 ->
                                        scope.launch { snackbar.showError("Password must be at least 4 characters") }
                                    newPassword != confirmPassword ->
                                        scope.launch { snackbar.showError("Passwords do not match") }
                                    else -> scope.launch {
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
                                            delay(450)
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
                            Text(text = "Reset password", fontWeight = FontWeight.Bold)
                        }
                        TextButton(
                            onClick = {
                                if (!busy) {
                                    step = 0
                                    otp = ""
                                    newPassword = ""
                                    confirmPassword = ""
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
