package com.freemocktest.app.newui.auth

import android.content.Context
import android.content.ContextWrapper
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.ui.window.Dialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import com.freemocktest.app.BuildConfig
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.data.needsProfileCompletion
import com.freemocktest.app.data.auth.GoogleSignInHelper
import com.freemocktest.app.newui.components.AppSnackbarHostNew
import com.freemocktest.app.newui.components.rememberAppSnackbarHostStateNew
import com.freemocktest.app.newui.components.showError
import com.freemocktest.app.newui.components.showSuccess
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private tailrec fun Context.findComponentActivity(): ComponentActivity? =
    when (this) {
        is ComponentActivity -> this
        is ContextWrapper -> baseContext.findComponentActivity()
        else -> null
    }

private enum class PendingAuthRoute { None, Home, Profile }

@Composable
fun AuthScreenNew(
    modifier: Modifier = Modifier,
    onAuthSuccess: () -> Unit,
    onProfileIncomplete: () -> Unit,
    onForgotPassword: () -> Unit,
    onOpenTerms: () -> Unit,
) {
    var mode by remember { mutableStateOf(AuthModeNew.Login) }
    val snackbar = rememberAppSnackbarHostStateNew()
    val scope = rememberCoroutineScope()
    val p = mockTestPalette()
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", ""),
    )
    val emailVerified by AppPreferencesRepository.emailVerified.collectAsState(initial = false)
    var showEmailVerifyPopup by remember { mutableStateOf(false) }
    var pendingRoute by remember { mutableStateOf(PendingAuthRoute.None) }

    fun continuePostAuth(route: PendingAuthRoute) {
        when (route) {
            PendingAuthRoute.Home -> onAuthSuccess()
            PendingAuthRoute.Profile -> onProfileIncomplete()
            PendingAuthRoute.None -> Unit
        }
    }

    fun handlePostAuth(route: PendingAuthRoute) {
        if (emailVerified) {
            continuePostAuth(route)
        } else {
            pendingRoute = route
            showEmailVerifyPopup = true
        }
    }

    val bg = Brush.linearGradient(
        colors = p.gradientColors(),
        start = Offset(0f, 0f),
        end = Offset(1600f, 2200f),
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(bg)
            .padding(18.dp),
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            AuthCard(
                mode = mode,
                onModeChange = { mode = it },
                onAuthSuccess = { handlePostAuth(PendingAuthRoute.Home) },
                onProfileIncomplete = { handlePostAuth(PendingAuthRoute.Profile) },
                onForgotPassword = onForgotPassword,
                onOpenTerms = onOpenTerms,
                onSuccess = { msg -> scope.launch { snackbar.showSuccess(msg) } },
                onError = { msg -> scope.launch { snackbar.showError(msg) } },
            )
        }
        AppSnackbarHostNew(
            state = snackbar,
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
    if (showEmailVerifyPopup) {
        EmailVerificationPopupModal(
            initialEmail = profile.email,
            onDismiss = {
                showEmailVerifyPopup = false
                continuePostAuth(pendingRoute)
                pendingRoute = PendingAuthRoute.None
            },
            onVerified = {
                showEmailVerifyPopup = false
                continuePostAuth(pendingRoute)
                pendingRoute = PendingAuthRoute.None
            },
        )
    }
}

@Composable
private fun EmailVerificationPopupModal(
    initialEmail: String,
    onDismiss: () -> Unit,
    onVerified: () -> Unit,
) {
    val p = mockTestPalette()
    val scope = rememberCoroutineScope()
    var email by remember(initialEmail) { mutableStateOf(initialEmail.trim()) }
    var otp by remember { mutableStateOf("") }
    var otpRequested by remember { mutableStateOf(false) }
    var resendSeconds by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var verifyBusy by remember { mutableStateOf(false) }
    var inlineError by remember { mutableStateOf("") }
    var inlineSuccess by remember { mutableStateOf("") }
    val initialEmailNormalized = remember(initialEmail) { initialEmail.trim().lowercase() }

    LaunchedEffect(resendSeconds, otpRequested) {
        if (otpRequested && resendSeconds > 0) {
            delay(1000)
            resendSeconds -= 1
        }
    }

    fun sendOtp() {
        val normalizedEmail = email.trim().lowercase()
        if (!isValidEmail(normalizedEmail)) {
            inlineSuccess = ""
            inlineError = "Enter a valid email"
            return
        }
        scope.launch {
            busy = true
            inlineError = ""
            inlineSuccess = ""
            val needsProfileEmailUpdate = normalizedEmail != initialEmailNormalized
            if (needsProfileEmailUpdate) {
                val updateResult = AuthRepository.patchProfileRemote(email = normalizedEmail)
                updateResult.fold(
                    onSuccess = {
                        AuthRepository.requestEmailVerificationOtp().fold(
                            onSuccess = {
                                otpRequested = true
                                resendSeconds = 30
                                inlineSuccess = "OTP sent to your email"
                                inlineError = ""
                            },
                            onFailure = { e ->
                                inlineSuccess = ""
                                inlineError = networkAwareError(e, "Could not send OTP")
                            },
                        )
                    },
                    onFailure = { e ->
                        inlineSuccess = ""
                        inlineError = networkAwareError(e, "Could not update email")
                    },
                )
            } else {
                AuthRepository.requestEmailVerificationOtp().fold(
                    onSuccess = {
                        otpRequested = true
                        resendSeconds = 30
                        inlineSuccess = "OTP sent to your email"
                        inlineError = ""
                    },
                    onFailure = { e ->
                        inlineSuccess = ""
                        inlineError = networkAwareError(e, "Could not send OTP")
                    },
                )
            }
            busy = false
        }
    }

    LaunchedEffect(Unit) {
        val normalizedEmail = email.trim().lowercase()
        if (isValidEmail(normalizedEmail) && !otpRequested && !busy && !verifyBusy) {
            sendOtp()
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        val cardBrush = Brush.verticalGradient(
            colors = listOf(
                p.surface.copy(alpha = 0.97f),
                p.surface.copy(alpha = 0.90f),
            ),
        )
        val titleBrush = Brush.horizontalGradient(
            colors = listOf(p.primaryButton, p.accent),
        )
        val fieldColors = TextFieldDefaults.colors(
            focusedContainerColor = p.surface.copy(alpha = 0.92f),
            unfocusedContainerColor = p.surface.copy(alpha = 0.92f),
            disabledContainerColor = p.surface.copy(alpha = 0.80f),
            focusedIndicatorColor = p.accent,
            unfocusedIndicatorColor = p.border,
            focusedLabelColor = p.accent,
            unfocusedLabelColor = p.textSecondary,
            focusedTextColor = p.textPrimary,
            unfocusedTextColor = p.textPrimary,
        )

        Card(
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.Transparent),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, p.border.copy(alpha = 0.36f), RoundedCornerShape(24.dp))
                .background(cardBrush, RoundedCornerShape(24.dp)),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "Premium Security Check",
                            color = p.textPrimary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = "Verify Your Email",
                            color = p.textPrimary,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = "Close",
                            tint = p.textSecondary,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(p.accent.copy(alpha = 0.12f))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "Secure your account with one-time verification code.",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = {
                        email = it.trim()
                        inlineError = ""
                    },
                    label = { Text("Email Address") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy && !verifyBusy,
                    colors = fieldColors,
                )
                if (otpRequested) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = otp,
                        onValueChange = {
                            otp = it.filter(Char::isDigit).take(6)
                            inlineError = ""
                        },
                        label = { Text("6-digit OTP") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy && !verifyBusy,
                        colors = fieldColors,
                    )
                }
                if (inlineError.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(inlineError, color = p.error, fontSize = 12.sp)
                }
                if (inlineSuccess.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(inlineSuccess, color = Color(0xFF16A34A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
                if (otpRequested && resendSeconds > 0) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Resend available in ${resendSeconds}s",
                        color = p.textSecondary,
                        fontSize = 12.sp,
                    )
                }
                Spacer(Modifier.height(16.dp))
                if (!otpRequested) {
                    Button(
                        onClick = { sendOtp() },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy && !verifyBusy,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = p.primaryButton,
                            contentColor = p.onPrimaryButton,
                        ),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(if (busy) "Sending OTP..." else "Send Verification OTP")
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Button(
                            onClick = {
                                if (otp.length != 6) {
                                    inlineSuccess = ""
                                    inlineError = "Enter valid 6-digit OTP"
                                    return@Button
                                }
                                scope.launch {
                                    verifyBusy = true
                                    inlineError = ""
                                    AuthRepository.confirmEmailVerification(otp).fold(
                                        onSuccess = {
                                            inlineSuccess = "Email verified successfully"
                                            inlineError = ""
                                            delay(500)
                                            onVerified()
                                        },
                                        onFailure = { e ->
                                            inlineSuccess = ""
                                            inlineError = networkAwareError(e, "OTP verification failed")
                                        },
                                    )
                                    verifyBusy = false
                                }
                            },
                            modifier = Modifier.weight(1f),
                            enabled = !busy && !verifyBusy,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = p.primaryButton,
                                contentColor = p.onPrimaryButton,
                            ),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text(if (verifyBusy) "Verifying..." else "Verify OTP")
                        }
                        Button(
                            onClick = { sendOtp() },
                            modifier = Modifier.weight(1f),
                            enabled = resendSeconds == 0 && !busy && !verifyBusy,
                            colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text(
                                if (resendSeconds > 0) "Resend ${resendSeconds}s" else if (busy) "Sending..." else "Resend OTP",
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AuthCard(
    mode: AuthModeNew,
    onModeChange: (AuthModeNew) -> Unit,
    onAuthSuccess: () -> Unit,
    onProfileIncomplete: () -> Unit,
    onForgotPassword: () -> Unit,
    onOpenTerms: () -> Unit,
    onSuccess: (String) -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val p = mockTestPalette()
    val cardShape = RoundedCornerShape(18.dp)
    val stroke = p.border.copy(alpha = 0.30f)

    val onGoogleSignIn: () -> Unit = {
        val act = context.findComponentActivity()
        if (act == null) {
            onError("Google Sign-In is not available.")
        } else if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isBlank()) {
            onError(
                "Add mocktest.googleWebClientId to local.properties (Web client ID — same as server GOOGLE_WEB_CLIENT_ID).",
            )
        } else {
            scope.launch {
                val idToken = GoogleSignInHelper.requestIdToken(act).getOrElse { e ->
                    onError(networkAwareError(e, "Google Sign-In failed"))
                    return@launch
                }
                AuthRepository.loginWithGoogle(idToken)
                    .onSuccess { user ->
                        if (user.needsProfileCompletion()) {
                            onSuccess("Login successful")
                            delay(600)
                            onProfileIncomplete()
                        } else {
                            onSuccess("Login successful")
                            delay(600)
                            onAuthSuccess()
                        }
                    }
                    .onFailure { e -> onError(networkAwareError(e, "Google Sign-In failed")) }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .width(560.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (mode == AuthModeNew.Login) {
            LoginInspiredAuthCard(
                cardShape = cardShape,
                borderColor = stroke,
            ) {
                ModeSwitcher(
                    mode = mode,
                    onModeChange = onModeChange,
                )
                Spacer(Modifier.height(18.dp))
                LoginForm(
                    onSwitch = { onModeChange(AuthModeNew.Signup) },
                    onAuthSuccess = onAuthSuccess,
                    onProfileIncomplete = onProfileIncomplete,
                    onSuccess = onSuccess,
                    onError = onError,
                    onForgotPassword = onForgotPassword,
                    onGoogleSignIn = onGoogleSignIn,
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(cardShape)
                    .border(1.dp, stroke, cardShape)
                    .background(p.surface)
                    .padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ModeSwitcher(
                    mode = mode,
                    onModeChange = onModeChange,
                )
                Spacer(Modifier.height(18.dp))
                SignupForm(
                    onSwitch = { onModeChange(AuthModeNew.Login) },
                    onSuccess = onAuthSuccess,
                    onUiSuccess = onSuccess,
                    onError = onError,
                    onGoogleSignIn = onGoogleSignIn,
                    onOpenTerms = onOpenTerms,
                )
            }
        }
    }
}

@Composable
private fun LoginInspiredAuthCard(
    cardShape: RoundedCornerShape,
    borderColor: Color,
    content: @Composable ColumnScope.() -> Unit,
) {
    val p = mockTestPalette()
    val headerBrush = Brush.verticalGradient(
        colors = listOf(
            p.primaryButton.copy(alpha = 0.96f),
            p.primaryButton.copy(alpha = 0.82f),
        ),
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .border(1.dp, borderColor, cardShape)
            .background(p.surface),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(262.dp)
                .background(headerBrush),
        ) {
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .align(Alignment.BottomCenter),
            ) {
                val w = size.width
                val h = size.height

                val areaBack = Path().apply {
                    moveTo(0f, h * 0.66f)
                    quadraticTo(w * 0.20f, h * 0.50f, w * 0.43f, h * 0.65f)
                    quadraticTo(w * 0.72f, h * 0.82f, w, h * 0.63f)
                    lineTo(w, h)
                    lineTo(0f, h)
                    close()
                }
                drawPath(areaBack, color = p.onPrimaryButton.copy(alpha = 0.16f))

                val areaFront = Path().apply {
                    moveTo(0f, h * 0.76f)
                    quadraticTo(w * 0.18f, h * 0.62f, w * 0.48f, h * 0.77f)
                    quadraticTo(w * 0.78f, h * 0.92f, w, h * 0.74f)
                    lineTo(w, h)
                    lineTo(0f, h)
                    close()
                }
                drawPath(areaFront, color = p.onPrimaryButton.copy(alpha = 0.24f))

                val graphLine1 = Path().apply {
                    moveTo(0f, h * 0.58f)
                    quadraticTo(w * 0.20f, h * 0.44f, w * 0.44f, h * 0.58f)
                    quadraticTo(w * 0.72f, h * 0.73f, w, h * 0.56f)
                }
                drawPath(
                    path = graphLine1,
                    color = p.onPrimaryButton.copy(alpha = 0.36f),
                    style = Stroke(width = 4.5f),
                )

                val graphLine2 = Path().apply {
                    moveTo(0f, h * 0.70f)
                    quadraticTo(w * 0.18f, h * 0.57f, w * 0.46f, h * 0.71f)
                    quadraticTo(w * 0.78f, h * 0.86f, w, h * 0.69f)
                }
                drawPath(
                    path = graphLine2,
                    color = p.onPrimaryButton.copy(alpha = 0.44f),
                    style = Stroke(width = 5.5f),
                )

                val surfaceCurve = Path().apply {
                    moveTo(0f, h * 0.86f)
                    quadraticTo(w * 0.24f, h * 0.74f, w * 0.52f, h * 0.87f)
                    quadraticTo(w * 0.78f, h, w, h * 0.84f)
                    lineTo(w, h)
                    lineTo(0f, h)
                    close()
                }
                drawPath(surfaceCurve, color = p.surface)
            }
            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(horizontal = 24.dp, vertical = 22.dp),
            ) {
                Text(
                    text = "Welcome Back",
                    color = p.onPrimaryButton.copy(alpha = 0.92f),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Log In!",
                    color = p.onPrimaryButton,
                    fontSize = 56.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp)
                .padding(top = 28.dp, bottom = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            content = content,
        )
    }
}

@Composable
private fun LoginForm(
    onSwitch: () -> Unit,
    onAuthSuccess: () -> Unit,
    onProfileIncomplete: () -> Unit,
    onSuccess: (String) -> Unit,
    onError: (String) -> Unit,
    onForgotPassword: () -> Unit,
    onGoogleSignIn: () -> Unit,
) {
    val p = mockTestPalette()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var identifierError by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    NeonTextField(
        value = identifier,
        onValueChange = { identifier = it.trim() },
        label = "Email or Mobile",
        isPassword = false,
        errorText = identifierError,
        isError = identifierError != null,
    )
    Spacer(Modifier.height(10.dp))
    NeonTextField(
        value = password,
        onValueChange = { password = it },
        label = "Password",
        isPassword = true,
        errorText = passwordError,
        isError = passwordError != null,
    )
    Spacer(Modifier.height(8.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
    ) {
        Text(
            text = "Forgot password?",
            color = p.accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            textDecoration = TextDecoration.Underline,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .padding(horizontal = 4.dp, vertical = 4.dp)
                .clickable(
                    enabled = !busy,
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                ) { onForgotPassword() },
        )
    }
    Spacer(Modifier.height(16.dp))

    // Ensure the login CTA stretches to the full card width (some parent constraints
    // can otherwise cause the background to appear narrower).
    Box(modifier = Modifier.fillMaxWidth()) {
        NeonButton(
            text = "Login",
            enabled = !busy,
            loading = busy,
            onClick = {
                if (busy) return@NeonButton
                val id = identifier.trim()
                // Reset previous errors
                identifierError = null
                passwordError = null

                val newIdError = when {
                    id.isBlank() -> "Email/mobile required"
                    id.contains('@') && !isValidEmail(id) -> "Enter a valid email"
                    !id.contains('@') && !isValidMobile(id) -> "Enter a valid mobile number"
                    else -> null
                }
                val newPasswordError = when {
                    password.isBlank() -> "Password required"
                    else -> null
                }

                if (newIdError != null || newPasswordError != null) {
                    identifierError = newIdError
                    passwordError = newPasswordError
                } else {
                    busy = true
                    scope.launch {
                        AuthRepository.login(id, password)
                            .onSuccess { user ->
                                busy = false
                                if (user.needsProfileCompletion()) {
                                    Toast.makeText(context, "Login successful", Toast.LENGTH_SHORT).show()
                                    onProfileIncomplete()
                                } else {
                                    Toast.makeText(context, "Login successful", Toast.LENGTH_SHORT).show()
                                    onAuthSuccess()
                                }
                            }
                            .onFailure { e ->
                                busy = false
                                onError(networkAwareError(e, "Login failed"))
                            }
                    }
                }
            },
        )
    }
    Spacer(Modifier.height(14.dp))
    GoogleAuthButton(
        text = "Continue with Google",
        onClick = onGoogleSignIn,
    )

    Spacer(Modifier.height(10.dp))

    Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
        Text(text = "Don't have an account? ", color = p.textSecondary, fontSize = 12.sp)
        Text(
            text = "Sign Up",
            color = p.accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            textDecoration = TextDecoration.Underline,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .padding(horizontal = 2.dp)
                .clickable(
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                ) { onSwitch() },
        )
    }
}

@Composable
private fun SignupForm(
    onSwitch: () -> Unit,
    onSuccess: () -> Unit,
    onUiSuccess: (String) -> Unit,
    onError: (String) -> Unit,
    onGoogleSignIn: () -> Unit,
    onOpenTerms: () -> Unit,
) {
    val p = mockTestPalette()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var state by remember { mutableStateOf("") }
    var district by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var usernameError by remember { mutableStateOf<String?>(null) }
    var emailError by remember { mutableStateOf<String?>(null) }
    var mobileError by remember { mutableStateOf<String?>(null) }
    var stateError by remember { mutableStateOf<String?>(null) }
    var districtError by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }
    var termsError by remember { mutableStateOf<String?>(null) }
    var agreedToTerms by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    val stateMatched = remember(state) {
        SignupRegionData.indianStates.any { it.equals(state, ignoreCase = true) }
    }
    val districtOptions = remember(stateMatched, state) {
        if (stateMatched) SignupRegionData.districtsForState(state) else emptyList()
    }

    NeonTextField(
        value = username,
        onValueChange = { username = it },
        label = "Username",
        isPassword = false,
        errorText = usernameError,
        isError = usernameError != null,
    )
    Spacer(Modifier.height(10.dp))
    NeonTextField(
        value = email,
        onValueChange = { email = it },
        label = "Email",
        isPassword = false,
        errorText = emailError,
        isError = emailError != null,
    )
    Spacer(Modifier.height(10.dp))
    NeonTextField(
        value = mobile,
        onValueChange = { mobile = it.filter(Char::isDigit).take(10) },
        label = "Mobile Number",
        isPassword = false,
        errorText = mobileError,
        isError = mobileError != null,
    )
    Spacer(Modifier.height(10.dp))
    NeonSearchableListField(
        value = state,
        onValueChange = { new ->
            state = new
            if (!SignupRegionData.districtsForState(new).any { it.equals(district, ignoreCase = true) }) {
                district = ""
            }
        },
        label = "State",
        options = SignupRegionData.indianStates,
        enabled = true,
        errorText = stateError,
        isError = stateError != null,
    )
    Spacer(Modifier.height(10.dp))
    NeonSearchableListField(
        value = district,
        onValueChange = { district = it },
        label = if (stateMatched) "District" else "District (select state first)",
        options = districtOptions,
        enabled = stateMatched && districtOptions.isNotEmpty(),
        errorText = districtError,
        isError = districtError != null,
    )
    Spacer(Modifier.height(10.dp))
    NeonTextField(
        value = password,
        onValueChange = { password = it },
        label = "Password",
        isPassword = true,
        errorText = passwordError,
        isError = passwordError != null,
    )
    Spacer(Modifier.height(10.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = agreedToTerms,
            onCheckedChange = {
                agreedToTerms = it
                if (it) termsError = null
            },
            enabled = !busy,
        )
        Text(
            text = "I agree with ",
            color = p.textSecondary,
            fontSize = 12.sp,
        )
        Text(
            text = "Terms & Condition",
            color = p.accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            textDecoration = TextDecoration.Underline,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(
                    enabled = !busy,
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                ) { onOpenTerms() }
                .padding(horizontal = 2.dp),
        )
    }
    if (termsError != null) {
        Text(
            text = termsError ?: "",
            color = p.error,
            fontSize = 11.sp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 8.dp),
        )
    }
    Spacer(Modifier.height(16.dp))

    NeonButton(
        text = "Register",
        enabled = !busy,
        loading = busy,
        onClick = {
            if (busy) return@NeonButton
            usernameError = null
            emailError = null
            mobileError = null
            stateError = null
            districtError = null
            passwordError = null
            termsError = null

            if (username.isBlank()) {
                usernameError = "Username required"
                return@NeonButton
            }

            if (email.isBlank()) {
                emailError = "Email required"
                return@NeonButton
            }
            if (!isValidEmail(email)) {
                emailError = "Enter a valid email"
                return@NeonButton
            }

            if (mobile.length != 10 || !isValidMobile(mobile)) {
                mobileError = "Enter valid mobile number"
                return@NeonButton
            }

            val isStateFromList = SignupRegionData.indianStates.any { it.equals(state, ignoreCase = true) }
            if (state.isBlank()) {
                stateError = "State required"
                return@NeonButton
            }
            if (!isStateFromList) {
                stateError = "Select state from the list"
                return@NeonButton
            }

            if (district.isBlank()) {
                districtError = "District required"
                return@NeonButton
            }
            if (!SignupRegionData.districtsForState(state).any { it.equals(district, ignoreCase = true) }) {
                districtError = "Select district from the list"
                return@NeonButton
            }

            if (password.length < 4) {
                passwordError = "Password too short"
                return@NeonButton
            }

            if (!agreedToTerms) {
                termsError = "Please accept Terms & Condition"
                return@NeonButton
            }

            busy = true
            scope.launch {
                AuthRepository.register(
                    displayName = username,
                    email = email,
                    phone = mobile,
                    password = password,
                    state = state,
                    district = district,
                )
                    .onSuccess {
                        busy = false
                        Toast.makeText(context, "Signup successful", Toast.LENGTH_SHORT).show()
                        onSuccess()
                    }
                    .onFailure { e ->
                        busy = false
                        onError(networkAwareError(e, "Registration failed"))
                    }
            }
        },
    )
    Spacer(Modifier.height(14.dp))
    GoogleAuthButton(
        text = "Continue with Google",
        onClick = onGoogleSignIn,
    )
    Spacer(Modifier.height(10.dp))

    Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
        Text(text = "Already have an account? ", color = p.textSecondary, fontSize = 12.sp)
        Text(
            text = "Sign In",
            color = p.accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            textDecoration = TextDecoration.Underline,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .padding(horizontal = 2.dp)
                .clickable(
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                ) { onSwitch() },
        )
    }
}

private fun networkAwareError(error: Throwable?, fallback: String): String {
    val raw = error?.message?.trim().orEmpty()
    val lowered = raw.lowercase()
    val likelyOffline =
        error is UnknownHostException ||
            error is SocketTimeoutException ||
            error is ConnectException ||
            lowered.contains("unable to resolve host") ||
            lowered.contains("failed to connect") ||
            lowered.contains("timeout") ||
            lowered.contains("network")
    return if (likelyOffline) {
        "No internet connection. Please check your network and try again."
    } else {
        raw.ifBlank { fallback }
    }
}

