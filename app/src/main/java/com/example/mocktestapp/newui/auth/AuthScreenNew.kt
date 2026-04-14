package com.example.mocktestapp.newui.auth

import android.content.Context
import android.content.ContextWrapper
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.BuildConfig
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.needsProfileCompletion
import com.example.mocktestapp.data.auth.GoogleSignInHelper
import com.example.mocktestapp.newui.components.AppSnackbarHostNew
import com.example.mocktestapp.newui.components.rememberAppSnackbarHostStateNew
import com.example.mocktestapp.newui.components.showError
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.launch

/** QA user from `database/postgres/005_seed_qa_login.sql` — used by debug-only quick login. */
private const val QA_DEBUG_PHONE = "9817585270"
private const val QA_DEBUG_PASSWORD = "123456"

private tailrec fun Context.findComponentActivity(): ComponentActivity? =
    when (this) {
        is ComponentActivity -> this
        is ContextWrapper -> baseContext.findComponentActivity()
        else -> null
    }

@Composable
fun AuthScreenNew(
    modifier: Modifier = Modifier,
    onAuthSuccess: () -> Unit,
    onProfileIncomplete: () -> Unit,
    onForgotPassword: () -> Unit,
) {
    var mode by remember { mutableStateOf(AuthModeNew.Login) }
    val snackbar = rememberAppSnackbarHostStateNew()
    val scope = rememberCoroutineScope()
    val p = mockTestPalette()

    val bg = Brush.linearGradient(
        colors = p.gradientColors(),
        start = Offset(0f, 0f),
        end = Offset(1600f, 2200f),
    )

    Scaffold(
        snackbarHost = { AppSnackbarHostNew(state = snackbar) },
        containerColor = Color.Transparent,
        // We already draw a full-screen gradient background, so we don't need
        // the default system bar insets padding (which creates a white gap on top).
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .padding(18.dp),
            contentAlignment = Alignment.Center,
        ) {
            AuthCard(
                mode = mode,
                onModeChange = { mode = it },
                onAuthSuccess = onAuthSuccess,
                onProfileIncomplete = onProfileIncomplete,
                onForgotPassword = onForgotPassword,
                onError = { msg -> scope.launch { snackbar.showError(msg) } },
            )
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
                    onError(e.message ?: "Google Sign-In failed")
                    return@launch
                }
                AuthRepository.loginWithGoogle(idToken)
                    .onSuccess { user ->
                        if (user.needsProfileCompletion()) {
                            onProfileIncomplete()
                        } else {
                            onAuthSuccess()
                        }
                    }
                    .onFailure { e -> onError(e.message ?: "Google Sign-In failed") }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .width(560.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
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

            if (mode == AuthModeNew.Login) {
                LoginForm(
                    onSwitch = { onModeChange(AuthModeNew.Signup) },
                    onAuthSuccess = onAuthSuccess,
                    onProfileIncomplete = onProfileIncomplete,
                    onError = onError,
                    onForgotPassword = onForgotPassword,
                    onGoogleSignIn = onGoogleSignIn,
                )
            } else {
                SignupForm(
                    onSwitch = { onModeChange(AuthModeNew.Login) },
                    onSuccess = onAuthSuccess,
                    onError = onError,
                    onGoogleSignIn = onGoogleSignIn,
                )
            }
        }
    }
}

@Composable
private fun LoginForm(
    onSwitch: () -> Unit,
    onAuthSuccess: () -> Unit,
    onProfileIncomplete: () -> Unit,
    onError: (String) -> Unit,
    onForgotPassword: () -> Unit,
    onGoogleSignIn: () -> Unit,
) {
    val p = mockTestPalette()
    val scope = rememberCoroutineScope()
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var identifierError by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }

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
            onClick = {
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
                    scope.launch {
                        AuthRepository.login(id, password)
                            .onSuccess { user ->
                                if (user.needsProfileCompletion()) {
                                    onProfileIncomplete()
                                } else {
                                    onAuthSuccess()
                                }
                            }
                            .onFailure { e ->
                                onError(e.message ?: "Login failed")
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

    Spacer(Modifier.height(12.dp))
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Explore app inside (no login)",
            color = p.accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            textDecoration = TextDecoration.Underline,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .padding(vertical = 6.dp, horizontal = 8.dp)
                .clickable(
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                ) {
                    scope.launch {
                        AuthRepository.prepareGuestPreviewSession()
                        onAuthSuccess()
                    }
                },
        )
        Text(
            text = "No API token — some actions may fail",
            color = p.textSecondary,
            fontSize = 10.sp,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
    if (BuildConfig.DEBUG) {
        Spacer(Modifier.height(12.dp))
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Quick test login",
                color = p.accent,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .padding(vertical = 6.dp, horizontal = 8.dp)
                    .clickable(
                        indication = null,
                        interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    ) {
                        identifier = QA_DEBUG_PHONE
                        password = QA_DEBUG_PASSWORD
                        identifierError = null
                        passwordError = null
                        scope.launch {
                            AuthRepository.login(QA_DEBUG_PHONE, QA_DEBUG_PASSWORD)
                                .onSuccess { user ->
                                    if (user.needsProfileCompletion()) {
                                        onProfileIncomplete()
                                    } else {
                                        onAuthSuccess()
                                    }
                                }
                                .onFailure { e ->
                                    onError(
                                        e.message
                                            ?: "Login failed — run API + DB seed, and set mocktest.apiBaseUrl for your phone.",
                                    )
                                }
                        }
                    },
            )
            Text(
                text = "Debug only · same account as DB seed 005",
                color = p.textSecondary,
                fontSize = 10.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
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
    onError: (String) -> Unit,
    onGoogleSignIn: () -> Unit,
) {
    val p = mockTestPalette()
    val scope = rememberCoroutineScope()
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
    Spacer(Modifier.height(16.dp))

    NeonButton(
        text = "Register",
        onClick = {
            usernameError = null
            emailError = null
            mobileError = null
            stateError = null
            districtError = null
            passwordError = null

            val newUsernameError = when {
                username.isBlank() -> "Username required"
                else -> null
            }
            val newEmailError = when {
                email.isBlank() -> "Email required"
                !isValidEmail(email) -> "Enter a valid email"
                else -> null
            }
            val newMobileError = when {
                mobile.length != 10 -> "Enter valid mobile number"
                !isValidMobile(mobile) -> "Enter valid mobile number"
                else -> null
            }
            val newStateError = when {
                state.isBlank() -> "State required"
                !SignupRegionData.indianStates.any { it.equals(state, ignoreCase = true) } ->
                    "Select state from the list"
                else -> null
            }
            val newDistrictError = when {
                !SignupRegionData.indianStates.any { it.equals(state, ignoreCase = true) } -> null
                district.isBlank() -> "District required"
                !SignupRegionData.districtsForState(state).any { it.equals(district, ignoreCase = true) } ->
                    "Select district from the list"
                else -> null
            }
            val newPasswordError = when {
                password.length < 4 -> "Password too short"
                else -> null
            }

            if (
                newUsernameError != null ||
                newEmailError != null ||
                newMobileError != null ||
                newStateError != null ||
                newDistrictError != null ||
                newPasswordError != null
            ) {
                usernameError = newUsernameError
                emailError = newEmailError
                mobileError = newMobileError
                stateError = newStateError
                districtError = newDistrictError
                passwordError = newPasswordError
            } else {
                scope.launch {
                    AuthRepository.register(
                        displayName = username,
                        email = email,
                        phone = mobile,
                        password = password,
                        state = state,
                        district = district,
                    )
                        .onSuccess { onSuccess() }
                        .onFailure { e ->
                            onError(e.message ?: "Registration failed")
                        }
                }
            }
        },
    )
    Spacer(Modifier.height(14.dp))
    GoogleAuthButton(
        text = "Continue with Google",
        onClick = onGoogleSignIn,
    )
    if (BuildConfig.DEBUG) {
        Spacer(Modifier.height(12.dp))
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Explore app inside (no login)",
                color = p.accent,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .padding(vertical = 6.dp, horizontal = 8.dp)
                    .clickable(
                        indication = null,
                        interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    ) {
                        scope.launch {
                            AuthRepository.prepareGuestPreviewSession()
                            onSuccess()
                        }
                    },
            )
            Text(
                text = "Debug only · no API token",
                color = p.textSecondary,
                fontSize = 10.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
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

