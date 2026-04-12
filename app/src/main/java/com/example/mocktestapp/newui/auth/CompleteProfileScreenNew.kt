package com.example.mocktestapp.newui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.data.needsProfileCompletion
import com.example.mocktestapp.data.remote.RetrofitProvider
import com.example.mocktestapp.newui.components.AuthScreenFeedback
import com.example.mocktestapp.newui.components.AuthScreenFeedbackBanner
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Shown after Google (or any) sign-in when phone / state / district are still missing on the server.
 */
@Composable
fun CompleteProfileScreenNew(
    modifier: Modifier = Modifier,
    onFinished: () -> Unit,
    onSignOut: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var mobile by remember { mutableStateOf("") }
    var state by remember { mutableStateOf("") }
    var district by remember { mutableStateOf("") }
    var accountEmail by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<AuthScreenFeedback?>(null) }
    val scope = rememberCoroutineScope()

    val stateMatched = remember(state) {
        SignupRegionData.indianStates.any { it.equals(state, ignoreCase = true) }
    }
    val districtOptions = remember(stateMatched, state) {
        if (stateMatched) SignupRegionData.districtsForState(state) else emptyList()
    }

    var mobileError by remember { mutableStateOf<String?>(null) }
    var stateError by remember { mutableStateOf<String?>(null) }
    var districtError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { RetrofitProvider.appApi.me() }
            .onSuccess { accountEmail = it.user.email }
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
                .padding(horizontal = 18.dp, vertical = 16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                text = "Complete your profile",
                color = p.textPrimary,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "We need your mobile number and location to finish setting up your account.",
                color = p.textSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            if (accountEmail.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Signed in as $accountEmail",
                    color = p.textSecondary.copy(alpha = 0.9f),
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
            }
            Spacer(Modifier.height(18.dp))

            feedback?.let { fb ->
                AuthScreenFeedbackBanner(
                    palette = p,
                    feedback = fb,
                    onDismiss = { feedback = null },
                )
                Spacer(Modifier.height(14.dp))
            }

            val shape = RoundedCornerShape(18.dp)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .border(1.dp, p.border.copy(alpha = 0.16f), shape),
                shape = shape,
                colors = CardDefaults.cardColors(containerColor = p.surface),
            ) {
                Column(Modifier.padding(16.dp)) {
                    NeonTextField(
                        value = mobile,
                        onValueChange = {
                            mobile = it.filter(Char::isDigit).take(10)
                            mobileError = null
                            feedback = null
                        },
                        label = "Mobile number (10 digits)",
                        isPassword = false,
                        errorText = mobileError,
                        isError = mobileError != null,
                    )
                    Spacer(Modifier.height(10.dp))
                    NeonSearchableListField(
                        value = state,
                        onValueChange = { new ->
                            state = new
                            stateError = null
                            feedback = null
                            if (!SignupRegionData.districtsForState(new).any { it.equals(district, ignoreCase = true) }) {
                                district = ""
                            }
                        },
                        label = "State",
                        options = SignupRegionData.indianStates,
                        enabled = !busy,
                        errorText = stateError,
                        isError = stateError != null,
                    )
                    Spacer(Modifier.height(10.dp))
                    NeonSearchableListField(
                        value = district,
                        onValueChange = {
                            district = it
                            districtError = null
                            feedback = null
                        },
                        label = if (stateMatched) "District" else "District (select state first)",
                        options = districtOptions,
                        enabled = stateMatched && districtOptions.isNotEmpty() && !busy,
                        errorText = districtError,
                        isError = districtError != null,
                    )
                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = {
                            mobileError = null
                            stateError = null
                            districtError = null
                            feedback = null

                            val mErr = when {
                                mobile.length != 10 -> "Enter a valid 10-digit mobile number"
                                !isValidMobile(mobile) -> "Enter a valid mobile number"
                                else -> null
                            }
                            val sErr = when {
                                state.isBlank() -> "State is required"
                                !SignupRegionData.indianStates.any { it.equals(state, ignoreCase = true) } ->
                                    "Pick your state from the list"
                                else -> null
                            }
                            val dErr = when {
                                !stateMatched -> null
                                district.isBlank() -> "District is required"
                                !SignupRegionData.districtsForState(state).any { it.equals(district, ignoreCase = true) } ->
                                    "Pick your district from the list"
                                else -> null
                            }

                            if (mErr != null || sErr != null || dErr != null) {
                                mobileError = mErr
                                stateError = sErr
                                districtError = dErr
                                val first = listOfNotNull(mErr, sErr, dErr).firstOrNull().orEmpty()
                                feedback = AuthScreenFeedback(
                                    isError = true,
                                    title = "Check the highlighted fields",
                                    detail = first.ifBlank { "Please fix the errors above." },
                                )
                                return@Button
                            }

                            scope.launch {
                                busy = true
                                val r = AuthRepository.patchProfileRemote(
                                    phone = mobile,
                                    state = state.trim(),
                                    district = district.trim(),
                                )
                                busy = false
                                r.onSuccess {
                                    runCatching { RetrofitProvider.appApi.me() }
                                        .onSuccess { me ->
                                            if (me.user.needsProfileCompletion()) {
                                                feedback = AuthScreenFeedback(
                                                    isError = true,
                                                    title = "Could not save everything",
                                                    detail = "Please try again or contact support.",
                                                )
                                            } else {
                                                feedback = AuthScreenFeedback(
                                                    isError = false,
                                                    title = "You’re all set",
                                                    detail = "Your profile is complete. Opening the app…",
                                                    successUsesMailIcon = false,
                                                )
                                                delay(1400)
                                                onFinished()
                                            }
                                        }
                                        .onFailure {
                                            feedback = AuthScreenFeedback(
                                                isError = true,
                                                title = "Saved, but sync failed",
                                                detail = it.message ?: "Pull down to retry or sign in again.",
                                            )
                                        }
                                }
                                r.onFailure { e ->
                                    val msg = e.message ?: "Could not save profile"
                                    feedback = AuthScreenFeedback(
                                        isError = true,
                                        title = "Could not save profile",
                                        detail = msg,
                                    )
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        enabled = !busy,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = p.primaryButton,
                            contentColor = p.onPrimaryButton,
                        ),
                    ) {
                        Text("Save and continue", fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = {
                            if (!busy) {
                                scope.launch {
                                    busy = true
                                    AuthRepository.logout()
                                    busy = false
                                    onSignOut()
                                }
                            }
                        },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Sign out", color = p.accent, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
