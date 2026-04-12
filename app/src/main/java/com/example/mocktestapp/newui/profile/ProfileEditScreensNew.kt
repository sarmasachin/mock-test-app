package com.example.mocktestapp.newui.profile

import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.data.AppPreferencesRepository
import com.example.mocktestapp.data.AuthRepository
import com.example.mocktestapp.newui.auth.isValidEmail
import com.example.mocktestapp.newui.auth.isValidMobile
import com.example.mocktestapp.newui.theme.palette.gradientColors
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.launch

@Composable
private fun ProfileEditFieldColors() = mockTestPalette().let { p ->
    TextFieldDefaults.colors(
        focusedTextColor = p.textPrimary,
        unfocusedTextColor = p.textPrimary,
        focusedContainerColor = p.surfaceElevated,
        unfocusedContainerColor = p.surfaceElevated,
        focusedIndicatorColor = p.accent,
        unfocusedIndicatorColor = p.border.copy(alpha = 0.35f),
        cursorColor = p.accent,
        focusedLabelColor = p.accent,
        unfocusedLabelColor = p.textSecondary,
    )
}

@Composable
fun ProfileEditUsernameScreen(
    onBack: () -> Unit,
    onShowSuccess: (String) -> Unit,
    onShowError: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", ""),
    )
    var name by remember { mutableStateOf("") }
    LaunchedEffect(profile.displayName) {
        name = profile.displayName
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 18.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(4.dp))
                Text("Username", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(18.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Username") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
                shape = fieldShape,
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    val n = name.trim()
                    if (n.isBlank()) {
                        onShowError("Username required")
                        return@Button
                    }
                    scope.launch {
                        val r = AuthRepository.patchProfileRemote(displayName = n)
                        r.fold(
                            onSuccess = { onShowSuccess("Username saved") },
                            onFailure = { e -> onShowError(e.message ?: "Could not save") },
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Save", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun ProfileEditEmailScreen(
    onBack: () -> Unit,
    onShowSuccess: (String) -> Unit,
    onShowError: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", ""),
    )
    val emailOk by AppPreferencesRepository.emailVerified.collectAsState(initial = false)
    var email by remember { mutableStateOf("") }
    LaunchedEffect(profile.email) {
        email = profile.email
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 18.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(4.dp))
                Text("Email", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(10.dp))
            if (emailOk) {
                Text(
                    "This email is verified and cannot be changed.",
                    color = p.textSecondary,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
            } else {
                Text(
                    "You can update your email until it is verified.",
                    color = p.textSecondary,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it.trim() },
                    label = { Text("Email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = {
                        val em = email.trim()
                        if (!isValidEmail(em)) {
                            onShowError("Enter a valid email")
                            return@Button
                        }
                        scope.launch {
                            val r = AuthRepository.patchProfileRemote(email = em)
                            r.fold(
                                onSuccess = { onShowSuccess("Email saved") },
                                onFailure = { e -> onShowError(e.message ?: "Could not save") },
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Save", color = Color.White, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
fun ProfileEditMobileScreen(
    onBack: () -> Unit,
    onShowSuccess: (String) -> Unit,
    onShowError: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", ""),
    )
    var mobile by remember { mutableStateOf("") }
    LaunchedEffect(profile.mobile) {
        mobile = profile.mobile
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 18.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(4.dp))
                Text("Mobile number", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(18.dp))
            OutlinedTextField(
                value = mobile,
                onValueChange = { v -> mobile = v.filter(Char::isDigit).take(10) },
                label = { Text("10-digit mobile") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
                shape = fieldShape,
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    val mob = mobile.trim().filter(Char::isDigit).take(10)
                    if (mob.length != 10 || !isValidMobile(mob)) {
                        onShowError("Enter a valid 10-digit mobile")
                        return@Button
                    }
                    scope.launch {
                        val r = AuthRepository.patchProfileRemote(phone = mob)
                        r.fold(
                            onSuccess = { onShowSuccess("Mobile number saved") },
                            onFailure = { e -> onShowError(e.message ?: "Could not save") },
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Save", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun ProfileEditPasswordScreen(
    onBack: () -> Unit,
    onShowSuccess: (String) -> Unit,
    onShowError: (String) -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var oldPass by remember { mutableStateOf("") }
    var newPass by remember { mutableStateOf("") }
    var confirmPass by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 18.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = p.textPrimary,
                    )
                }
                Spacer(Modifier.size(4.dp))
                Text("Change password", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "Enter your current password, then your new password twice.",
                color = p.textSecondary,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = oldPass,
                onValueChange = { oldPass = it },
                label = { Text("Current password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
                shape = fieldShape,
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = newPass,
                onValueChange = { newPass = it },
                label = { Text("New password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
                shape = fieldShape,
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = confirmPass,
                onValueChange = { confirmPass = it },
                label = { Text("Confirm new password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
                shape = fieldShape,
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    when {
                        oldPass.isBlank() -> onShowError("Enter current password")
                        newPass.length < 4 -> onShowError("New password must be at least 4 characters")
                        newPass != confirmPass -> onShowError("New password and confirm do not match")
                        else -> {
                            scope.launch {
                                val r = AuthRepository.changePasswordRemote(oldPass, newPass)
                                r.fold(
                                    onSuccess = {
                                        oldPass = ""
                                        newPass = ""
                                        confirmPass = ""
                                        onShowSuccess("Password updated")
                                    },
                                    onFailure = { e -> onShowError(e.message ?: "Could not update password") },
                                )
                            }
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Save password", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
