package com.freemocktest.app.newui.profile

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import android.widget.Toast
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.rememberDatePickerState
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.data.AuthRepository
import com.freemocktest.app.newui.auth.isValidEmail
import com.freemocktest.app.newui.auth.isValidMobile
import com.freemocktest.app.newui.theme.palette.gradientColors
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException

private enum class InlineMessageType { Success, Error }

private val profileBirthdayPattern = Regex("^\\d{4}-\\d{2}-\\d{2}$")

/** @return Pair(serverValue, errorMessage) — serverValue `""` clears DOB; null = invalid. */
private fun validateBirthdayForServer(raw: String): Pair<String?, String> {
    val s = raw.trim()
    if (s.isEmpty()) return "" to ""
    if (!profileBirthdayPattern.matches(s)) return null to "Use YYYY-MM-DD (e.g. 1998-03-21)"
    return try {
        val d = LocalDate.parse(s)
        val today = LocalDate.now(ZoneId.systemDefault())
        if (d.isAfter(today)) return null to "Date cannot be in the future"
        s to ""
    } catch (_e: DateTimeParseException) {
        null to "Invalid calendar date"
    }
}

private fun normalizeProfileInlineMessage(raw: String?, fallback: String): String {
    val msg = raw?.trim().orEmpty()
    if (msg.isBlank()) return fallback
    val key = msg.lowercase()
    return when {
        "unable to resolve host" in key ||
            "failed to connect" in key ||
            "timeout" in key ||
            "network" in key -> "Check your internet connection"
        "401" in key || "unauthorized" in key || "sign in required" in key -> "Session expired. Please login again"
        "503" in key || "maintenance" in key || "service unavailable" in key -> "Server is temporarily unavailable"
        else -> msg
    }
}

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
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", "", ""),
    )
    var name by remember { mutableStateOf("") }
    LaunchedEffect(profile.displayName) {
        name = profile.displayName
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }

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
            if (!submitted) {
                OutlinedTextField(
                    value = name,
                    onValueChange = {
                        name = it
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                    },
                    label = { Text("Username") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
                if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = inlineMessage,
                        color = p.error,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        inlineMessage = ""
                        return@Button
                    }
                    val n = name.trim()
                    if (n.isBlank()) {
                        inlineType = InlineMessageType.Error
                        inlineMessage = "Username required"
                        return@Button
                    }
                    scope.launch {
                        val r = AuthRepository.patchProfileRemote(displayName = n)
                        r.fold(
                            onSuccess = {
                                inlineType = InlineMessageType.Success
                                inlineMessage = "Username saved successfully"
                                submitted = true
                            },
                            onFailure = { e ->
                                inlineType = InlineMessageType.Error
                                inlineMessage = normalizeProfileInlineMessage(e.message, "Could not save username")
                            },
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(if (submitted) "Edit again" else "Save", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
            if (inlineType == InlineMessageType.Success && inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = inlineMessage,
                    color = Color(0xFF16A34A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
fun ProfileEditEmailScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", "", ""),
    )
    val emailOk by AppPreferencesRepository.emailVerified.collectAsState(initial = false)
    var email by remember { mutableStateOf("") }
    LaunchedEffect(profile.email) {
        email = profile.email
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }

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
                if (!submitted) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = {
                            email = it.trim()
                            if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                        },
                        label = { Text("Email") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ProfileEditFieldColors(),
                        shape = fieldShape,
                    )
                    if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = inlineMessage,
                            color = p.error,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = {
                        if (submitted) {
                            submitted = false
                            inlineMessage = ""
                            return@Button
                        }
                        val em = email.trim()
                        if (!isValidEmail(em)) {
                            inlineType = InlineMessageType.Error
                            inlineMessage = "Enter a valid email"
                            return@Button
                        }
                        scope.launch {
                            val r = AuthRepository.patchProfileRemote(email = em)
                            r.fold(
                                onSuccess = {
                                    inlineType = InlineMessageType.Success
                                    inlineMessage = "Email saved successfully"
                                    submitted = true
                                },
                                onFailure = { e ->
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = normalizeProfileInlineMessage(e.message, "Could not save email")
                                },
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text(if (submitted) "Edit again" else "Save", color = Color.White, fontWeight = FontWeight.SemiBold)
                }
                if (inlineType == InlineMessageType.Success && inlineMessage.isNotBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = inlineMessage,
                        color = Color(0xFF16A34A),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
fun ProfileEditMobileScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", "", ""),
    )
    var mobile by remember { mutableStateOf("") }
    LaunchedEffect(profile.mobile) {
        mobile = profile.mobile
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }

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
            if (!submitted) {
                OutlinedTextField(
                    value = mobile,
                    onValueChange = { v ->
                        mobile = v.filter(Char::isDigit).take(10)
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                    },
                    label = { Text("10-digit mobile") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
                if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = inlineMessage,
                        color = p.error,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        inlineMessage = ""
                        return@Button
                    }
                    val mob = mobile.trim().filter(Char::isDigit).take(10)
                    if (mob.length != 10 || !isValidMobile(mob)) {
                        inlineType = InlineMessageType.Error
                        inlineMessage = "Enter a valid 10-digit mobile"
                        return@Button
                    }
                    scope.launch {
                        val r = AuthRepository.patchProfileRemote(phone = mob)
                        r.fold(
                            onSuccess = {
                                inlineType = InlineMessageType.Success
                                inlineMessage = "Mobile number saved successfully"
                                submitted = true
                            },
                            onFailure = { e ->
                                inlineType = InlineMessageType.Error
                                inlineMessage = normalizeProfileInlineMessage(e.message, "Could not save mobile number")
                            },
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(if (submitted) "Edit again" else "Save", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
            if (inlineType == InlineMessageType.Success && inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = inlineMessage,
                    color = Color(0xFF16A34A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
fun ProfileEditGenderScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", "", ""),
    )
    var gender by remember { mutableStateOf("") }
    LaunchedEffect(profile.gender) {
        gender = profile.gender
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)
    val options = remember { listOf("Male", "Female", "Other") }
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }

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
                Text("Gender", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(18.dp))
            if (!submitted) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    options.forEach { option ->
                        val selected = gender.trim().equals(option, ignoreCase = true)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(fieldShape)
                                .border(1.dp, p.border.copy(alpha = 0.22f), fieldShape)
                                .background(p.surface.copy(alpha = 0.55f))
                                .clickable {
                                    gender = option
                                    if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                                }
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = option,
                                color = p.textPrimary,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f),
                            )
                            RadioButton(
                                selected = selected,
                                onClick = {
                                    gender = option
                                    if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                                },
                            )
                        }
                    }
                }
                if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = inlineMessage,
                        color = p.error,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Allowed: ${options.joinToString(" / ")}",
                color = p.textSecondary,
                fontSize = 13.sp,
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        inlineMessage = ""
                        return@Button
                    }
                    val selected = gender.trim().replaceFirstChar { c ->
                        if (c.isLowerCase()) c.titlecase() else c.toString()
                    }
                    if (selected !in options) {
                        inlineType = InlineMessageType.Error
                        inlineMessage = "Select valid gender: Male / Female / Other"
                        return@Button
                    }
                    scope.launch {
                        val r = AppPreferencesRepository.updateGender(selected)
                        r.fold(
                            onSuccess = {
                                inlineType = InlineMessageType.Success
                                inlineMessage = "Gender saved successfully"
                                submitted = true
                            },
                            onFailure = { e ->
                                inlineType = InlineMessageType.Error
                                inlineMessage = normalizeProfileInlineMessage(e.message, "Could not save gender")
                            },
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(if (submitted) "Edit again" else "Save", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
            if (inlineType == InlineMessageType.Success && inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = inlineMessage,
                    color = Color(0xFF16A34A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
fun ProfileEditBirthdayScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", "", ""),
    )
    var dateText by remember { mutableStateOf("") }
    LaunchedEffect(profile.birthdayDate) {
        dateText = profile.birthdayDate.trim()
    }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }
    var showDobPicker by remember { mutableStateOf(false) }

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
                Text("Date of birth", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "Format: YYYY-MM-DD (device calendar). Cannot be in the future.",
                color = p.textSecondary,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(14.dp))
            if (!submitted) {
                OutlinedTextField(
                    value = dateText,
                    onValueChange = { value ->
                        dateText = value.filter { it.isDigit() || it == '-' }.take(10)
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                    },
                    label = { Text("YYYY-MM-DD") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedButton(
                    onClick = { showDobPicker = true },
                    enabled = !submitted,
                    modifier = Modifier.fillMaxWidth(),
                    shape = fieldShape,
                ) {
                    Text("Pick date (calendar)", color = p.textPrimary, fontWeight = FontWeight.SemiBold)
                }
                if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = inlineMessage,
                        color = p.error,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                TextButton(
                    onClick = {
                        if (submitted) return@TextButton
                        dateText = ""
                        inlineMessage = ""
                    },
                    enabled = !submitted && dateText.isNotBlank(),
                ) {
                    Text("Clear field", color = p.accent)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        if (submitted) return@OutlinedButton
                        scope.launch {
                            val r = AuthRepository.patchProfileRemote(birthdayDate = "")
                            r.fold(
                                onSuccess = {
                                    inlineType = InlineMessageType.Success
                                    inlineMessage = "Date of birth removed"
                                    submitted = true
                                },
                                onFailure = { e ->
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = normalizeProfileInlineMessage(e.message, "Could not clear date of birth")
                                },
                            )
                        }
                    },
                    enabled = !submitted && profile.birthdayDate.isNotBlank(),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Remove from account", color = p.textPrimary)
                }
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        inlineMessage = ""
                        dateText = profile.birthdayDate.trim()
                        return@Button
                    }
                    val (serverVal, err) = validateBirthdayForServer(dateText)
                    if (serverVal == null) {
                        inlineType = InlineMessageType.Error
                        inlineMessage = err.ifBlank { "Invalid date" }
                        return@Button
                    }
                    scope.launch {
                        val r = AuthRepository.patchProfileRemote(birthdayDate = serverVal)
                        r.fold(
                            onSuccess = {
                                inlineType = InlineMessageType.Success
                                inlineMessage =
                                    if (serverVal.isEmpty()) {
                                        "Date of birth cleared"
                                    } else {
                                        "Date of birth saved"
                                    }
                                submitted = true
                            },
                            onFailure = { e ->
                                inlineType = InlineMessageType.Error
                                inlineMessage = normalizeProfileInlineMessage(e.message, "Could not save date of birth")
                            },
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(if (submitted) "Edit again" else "Save", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
            if (inlineType == InlineMessageType.Success && inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = inlineMessage,
                    color = Color(0xFF16A34A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }

    if (showDobPicker) {
        DobPickerDialog(
            initialIso = dateText,
            onDismiss = { showDobPicker = false },
            onPickIso = { iso ->
                dateText = iso
                if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                showDobPicker = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DobPickerDialog(
    initialIso: String,
    onDismiss: () -> Unit,
    onPickIso: (String) -> Unit,
) {
    val p = mockTestPalette()
    val ctx = LocalContext.current

    fun millisToIso(millis: Long): String =
        Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate().toString()

    val selectableDates = remember {
        object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                runCatching {
                    val d = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneId.systemDefault()).toLocalDate()
                    !d.isAfter(LocalDate.now())
                }.getOrDefault(false)

            override fun isSelectableYear(year: Int): Boolean =
                year in 1900..LocalDate.now().year
        }
    }

    val initialMillis = remember(initialIso) {
        val trimmed = initialIso.trim()
        val fromExisting =
            if (profileBirthdayPattern.matches(trimmed)) {
                runCatching { LocalDate.parse(trimmed).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() }.getOrNull()
            } else {
                null
            }
        fromExisting ?: run {
            val todayIso = LocalDate.now().toString()
            LocalDate.parse(todayIso).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        }
    }

    val state = rememberDatePickerState(
        initialSelectedDateMillis = initialMillis,
        selectableDates = selectableDates,
    )

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    val millis = state.selectedDateMillis
                    if (millis == null) {
                        onDismiss()
                        return@TextButton
                    }
                    val iso = millisToIso(millis)
                    val (serverVal, errMsg) = validateBirthdayForServer(iso)
                    if (serverVal != null) {
                        onPickIso(iso)
                    } else {
                        Toast.makeText(
                            ctx,
                            errMsg.ifBlank { "Invalid date" },
                            Toast.LENGTH_SHORT,
                        ).show()
                    }
                },
            ) { Text("OK", color = p.accent) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel", color = p.textSecondary) }
        },
        colors = DatePickerDefaults.colors(),
    ) {
        DatePicker(state = state)
    }
}

@Composable
fun ProfileEditPasswordScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var oldPass by remember { mutableStateOf("") }
    var newPass by remember { mutableStateOf("") }
    var confirmPass by remember { mutableStateOf("") }
    var showOldPass by remember { mutableStateOf(false) }
    var showNewPass by remember { mutableStateOf(false) }
    var showConfirmPass by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }

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
            if (!submitted) {
                OutlinedTextField(
                    value = oldPass,
                    onValueChange = {
                        oldPass = it
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                    },
                    label = { Text("Current password") },
                    singleLine = true,
                    visualTransformation = if (showOldPass) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton(onClick = { showOldPass = !showOldPass }) {
                            Icon(
                                imageVector = if (showOldPass) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = if (showOldPass) "Hide current password" else "Show current password",
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = newPass,
                    onValueChange = {
                        newPass = it
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                    },
                    label = { Text("New password") },
                    singleLine = true,
                    visualTransformation = if (showNewPass) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton(onClick = { showNewPass = !showNewPass }) {
                            Icon(
                                imageVector = if (showNewPass) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = if (showNewPass) "Hide new password" else "Show new password",
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = confirmPass,
                    onValueChange = {
                        confirmPass = it
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                    },
                    label = { Text("Confirm new password") },
                    singleLine = true,
                    visualTransformation = if (showConfirmPass) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton(onClick = { showConfirmPass = !showConfirmPass }) {
                            Icon(
                                imageVector = if (showConfirmPass) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = if (showConfirmPass) "Hide confirm password" else "Show confirm password",
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
                if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = inlineMessage,
                        color = p.error,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        inlineMessage = ""
                        return@Button
                    }
                    when {
                        oldPass.isBlank() -> {
                            inlineType = InlineMessageType.Error
                            inlineMessage = "Enter current password"
                        }
                        newPass.length < 4 -> {
                            inlineType = InlineMessageType.Error
                            inlineMessage = "New password must be at least 4 characters"
                        }
                        newPass != confirmPass -> {
                            inlineType = InlineMessageType.Error
                            inlineMessage = "New password and confirm do not match"
                        }
                        else -> {
                            scope.launch {
                                val r = AuthRepository.changePasswordRemote(oldPass, newPass)
                                r.fold(
                                    onSuccess = {
                                        oldPass = ""
                                        newPass = ""
                                        confirmPass = ""
                                        inlineType = InlineMessageType.Success
                                        inlineMessage = "Password updated successfully"
                                        submitted = true
                                    },
                                    onFailure = { e ->
                                        inlineType = InlineMessageType.Error
                                        inlineMessage = normalizeProfileInlineMessage(
                                            e.message,
                                            "Could not update password",
                                        )
                                    },
                                )
                            }
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    if (submitted) "Edit again" else "Save password",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            if (inlineType == InlineMessageType.Success && inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = inlineMessage,
                    color = Color(0xFF16A34A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
fun ProfileEmailVerificationScreen(
    onBack: () -> Unit,
    onVerified: () -> Unit = onBack,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", "", ""),
    )
    val emailVerified by AppPreferencesRepository.emailVerified.collectAsState(initial = false)
    var email by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var otpRequested by remember { mutableStateOf(false) }
    var resendSeconds by remember { mutableStateOf(0) }
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var verificationCompleted by remember { mutableStateOf(false) }
    var verifyInProgress by remember { mutableStateOf(false) }
    var otpRequestInProgress by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val isVerifiedNow = emailVerified || verificationCompleted

    LaunchedEffect(profile.email) {
        email = profile.email
    }
    LaunchedEffect(resendSeconds, otpRequested, isVerifiedNow) {
        if (otpRequested && !isVerifiedNow && resendSeconds > 0) {
            delay(1000)
            resendSeconds -= 1
        }
    }
    LaunchedEffect(isVerifiedNow) {
        if (isVerifiedNow) {
            onVerified()
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
                .verticalScroll(rememberScrollState())
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
                Text("Email verification", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = email,
                onValueChange = { email = it.trim() },
                label = { Text("Email") },
                singleLine = true,
                readOnly = true,
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
                shape = RoundedCornerShape(12.dp),
            )
            if (!otpRequested && inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = inlineMessage,
                    color = p.error,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            Spacer(Modifier.height(12.dp))
            if (!otpRequested && !isVerifiedNow) {
                Button(
                    onClick = {
                        if (otpRequestInProgress) return@Button
                        scope.launch {
                            otpRequestInProgress = true
                            AuthRepository.requestEmailVerificationOtp().fold(
                                onSuccess = { msg ->
                                    val alreadyVerified = msg.contains("already verified", ignoreCase = true)
                                    if (alreadyVerified) {
                                        AppPreferencesRepository.setEmailVerified(true)
                                        verificationCompleted = true
                                        otpRequested = false
                                        resendSeconds = 0
                                        inlineType = InlineMessageType.Success
                                        inlineMessage = "Your email is already verified."
                                    } else {
                                        otpRequested = true
                                        resendSeconds = 30
                                        inlineType = InlineMessageType.Success
                                        inlineMessage = "OTP sent to your email"
                                    }
                                },
                                onFailure = { e ->
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = normalizeProfileInlineMessage(
                                        e.message,
                                        "Could not send verification code",
                                    )
                                },
                            )
                            otpRequestInProgress = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                    shape = RoundedCornerShape(12.dp),
                    enabled = !otpRequestInProgress,
                ) {
                    if (otpRequestInProgress) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = Color.White,
                            )
                            Spacer(Modifier.size(8.dp))
                            Text("Sending...", color = Color.White, fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        Text("Send OTP", color = Color.White, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            if (otpRequested && !isVerifiedNow) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = otp,
                    onValueChange = {
                        otp = it.filter(Char::isDigit).take(6)
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) inlineMessage = ""
                    },
                    label = { Text("Enter 6-digit OTP") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = RoundedCornerShape(12.dp),
                )
                if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = inlineMessage,
                        color = p.error,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(modifier = Modifier.fillMaxWidth()) {
                    Button(
                        onClick = {
                            scope.launch {
                                if (otp.length != 6) {
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = "Enter valid 6-digit OTP"
                                    return@launch
                                }
                                verifyInProgress = true
                                AuthRepository.confirmEmailVerification(otp).fold(
                                    onSuccess = { msg ->
                                        inlineType = InlineMessageType.Success
                                        inlineMessage = msg
                                        otpRequested = false
                                        verificationCompleted = true
                                        verifyInProgress = false
                                    },
                                    onFailure = { e ->
                                        inlineType = InlineMessageType.Error
                                        inlineMessage = normalizeProfileInlineMessage(
                                            e.message,
                                            "Could not verify email",
                                        )
                                        verifyInProgress = false
                                    },
                                )
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                        shape = RoundedCornerShape(12.dp),
                        enabled = !verifyInProgress,
                    ) {
                        if (verifyInProgress) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = Color.White,
                                )
                                Spacer(Modifier.size(8.dp))
                                Text("Verifying...", color = Color.White, fontWeight = FontWeight.SemiBold)
                            }
                        } else {
                            Text("Verify OTP", color = Color.White, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                TextButton(
                    onClick = {
                        if (resendSeconds > 0 || otpRequestInProgress) return@TextButton
                        scope.launch {
                            otpRequestInProgress = true
                            AuthRepository.requestEmailVerificationOtp().fold(
                                onSuccess = { msg ->
                                    val alreadyVerified = msg.contains("already verified", ignoreCase = true)
                                    if (alreadyVerified) {
                                        AppPreferencesRepository.setEmailVerified(true)
                                        verificationCompleted = true
                                        otpRequested = false
                                        resendSeconds = 0
                                        inlineType = InlineMessageType.Success
                                        inlineMessage = "Your email is already verified."
                                    } else {
                                        resendSeconds = 30
                                        inlineType = InlineMessageType.Success
                                        inlineMessage = "OTP sent to your email"
                                    }
                                },
                                onFailure = { e ->
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = normalizeProfileInlineMessage(
                                        e.message,
                                        "Could not send verification code",
                                    )
                                },
                            )
                            otpRequestInProgress = false
                        }
                    },
                    enabled = resendSeconds == 0 && !otpRequestInProgress,
                ) {
                    if (otpRequestInProgress) {
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
                            if (resendSeconds > 0) "Resend OTP (${resendSeconds}s)" else "Resend OTP",
                        )
                    }
                }
            }

            if (inlineType == InlineMessageType.Success && inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = inlineMessage,
                    color = Color(0xFF16A34A),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            if (isVerifiedNow) {
                Spacer(Modifier.height(8.dp))
                Text("Email verified successfully.", color = Color(0xFF16A34A), fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onBack,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Done", color = Color.White, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
fun ProfileNotificationsScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    val enabled by AppPreferencesRepository.notificationsEnabled.collectAsState(initial = true)
    val scoreVisible by AppPreferencesRepository.scoreVisibilityEnabled.collectAsState(initial = true)
    val context = LocalContext.current
    val prefs = remember(context) { context.getSharedPreferences("notification_engine", Context.MODE_PRIVATE) }
    var examAlerts by remember { mutableStateOf(prefs.getBoolean("cat_exam", true)) }
    var jobAlerts by remember { mutableStateOf(prefs.getBoolean("cat_job", true)) }
    var quietStart by remember { mutableStateOf(prefs.getString("quiet_start", "22:00").orEmpty()) }
    var quietEnd by remember { mutableStateOf(prefs.getString("quiet_end", "07:00").orEmpty()) }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
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
                Text("Notifications", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(18.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Enable notifications",
                        color = p.textPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = if (enabled) "Notifications are ON" else "Notifications are OFF",
                        color = p.textSecondary,
                        fontSize = 13.sp,
                    )
                }
                Switch(
                    checked = enabled,
                    onCheckedChange = { AppPreferencesRepository.setNotificationsEnabled(it) },
                )
            }
            Spacer(Modifier.height(18.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Show score numbers",
                        color = p.textPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = if (scoreVisible) "Score numbers are visible" else "Score numbers are hidden",
                        color = p.textSecondary,
                        fontSize = 13.sp,
                    )
                }
                Switch(
                    checked = scoreVisible,
                    onCheckedChange = { AppPreferencesRepository.setScoreVisibilityEnabled(it) },
                )
            }
            Spacer(Modifier.height(18.dp))
            Text(
                text = "Reminder categories",
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Exam alerts", color = p.textSecondary, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Switch(
                    checked = examAlerts,
                    onCheckedChange = {
                        examAlerts = it
                        prefs.edit().putBoolean("cat_exam", it).apply()
                    },
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Job alerts", color = p.textSecondary, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Switch(
                    checked = jobAlerts,
                    onCheckedChange = {
                        jobAlerts = it
                        prefs.edit().putBoolean("cat_job", it).apply()
                    },
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Quiet hours (24h format)",
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = quietStart,
                onValueChange = {
                    quietStart = it.take(5)
                    prefs.edit().putString("quiet_start", quietStart).apply()
                },
                label = { Text("Start (e.g. 22:00)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = quietEnd,
                onValueChange = {
                    quietEnd = it.take(5)
                    prefs.edit().putString("quiet_end", quietEnd).apply()
                },
                label = { Text("End (e.g. 07:00)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = ProfileEditFieldColors(),
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Engine rule: notification allowed only when app notifications are ON, category is ON, and current time is outside quiet hours.",
                color = p.textSecondary,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
fun ProfileHelpSupportScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var message by remember { mutableStateOf("") }
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
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
                Text("Help & support", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                text = "Describe your issue below.",
                color = p.textSecondary,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(12.dp))
            if (!submitted) {
                OutlinedTextField(
                    value = message,
                    onValueChange = {
                        message = it
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                            inlineMessage = ""
                        }
                    },
                    label = { Text("Write your message") },
                    minLines = 5,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
            }
            if (inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (inlineType == InlineMessageType.Success) Color(0xFFDCFCE7) else Color(0xFFFEE2E2),
                            RoundedCornerShape(12.dp),
                        )
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                )
                {
                    Text(
                        text = if (inlineType == InlineMessageType.Success) "Status: Success" else "Status: Failed",
                        color = if (inlineType == InlineMessageType.Success) Color(0xFF166534) else Color(0xFF991B1B),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = inlineMessage,
                        color = if (inlineType == InlineMessageType.Success) Color(0xFF166534) else Color(0xFF991B1B),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        message = ""
                        inlineMessage = ""
                        return@Button
                    }
                    if (message.trim().isBlank()) {
                        inlineType = InlineMessageType.Error
                        inlineMessage = "Please enter your message"
                    } else {
                        scope.launch {
                            AuthRepository.submitHelpSupport(message).fold(
                                onSuccess = {
                                    inlineType = InlineMessageType.Success
                                    inlineMessage = "Support message submitted successfully"
                                    submitted = true
                                },
                                onFailure = { e ->
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = normalizeProfileInlineMessage(
                                        e.message,
                                        "Failed to submit support message",
                                    )
                                },
                            )
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    if (submitted) "Send another response" else "Submit",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                )
            }
        }
    }
}

@Composable
fun ProfileFeedbackScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var feedbackText by remember { mutableStateOf("") }
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
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
                Text("Feedback", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                text = "Tell us what you liked or what we can improve.",
                color = p.textSecondary,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(12.dp))
            if (!submitted) {
                OutlinedTextField(
                    value = feedbackText,
                    onValueChange = {
                        feedbackText = it
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                            inlineMessage = ""
                        }
                    },
                    label = { Text("Write feedback") },
                    minLines = 5,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
            }
            if (inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = inlineMessage,
                    color = if (inlineType == InlineMessageType.Success) Color(0xFF16A34A) else p.error,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        feedbackText = ""
                        inlineMessage = ""
                        return@Button
                    }
                    if (feedbackText.trim().isBlank()) {
                        inlineType = InlineMessageType.Error
                        inlineMessage = "Please enter feedback"
                    } else {
                        scope.launch {
                            AuthRepository.submitFeedback(feedbackText).fold(
                                onSuccess = {
                                    inlineType = InlineMessageType.Success
                                    inlineMessage = "Feedback submitted successfully"
                                    submitted = true
                                },
                                onFailure = { e ->
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = normalizeProfileInlineMessage(
                                        e.message,
                                        "Failed to submit feedback",
                                    )
                                },
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    if (submitted) "Send another response" else "Submit",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
fun ProfileReportIssueScreen(
    onBack: () -> Unit,
) {
    val p = mockTestPalette()
    val bg = Brush.verticalGradient(colors = p.gradientColors())
    var issueText by remember { mutableStateOf("") }
    val fieldShape = RoundedCornerShape(12.dp)
    var inlineMessage by remember { mutableStateOf("") }
    var inlineType by remember { mutableStateOf(InlineMessageType.Success) }
    var submitted by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .padding(padding)
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
                Text("Report issue", color = p.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                text = "Describe the issue in detail so we can fix it quickly.",
                color = p.textSecondary,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(12.dp))
            if (!submitted) {
                OutlinedTextField(
                    value = issueText,
                    onValueChange = {
                        issueText = it
                        if (inlineType == InlineMessageType.Error && inlineMessage.isNotBlank()) {
                            inlineMessage = ""
                        }
                    },
                    label = { Text("Write issue details") },
                    minLines = 5,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ProfileEditFieldColors(),
                    shape = fieldShape,
                )
            }
            if (inlineMessage.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = inlineMessage,
                    color = if (inlineType == InlineMessageType.Success) Color(0xFF16A34A) else p.error,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    if (submitted) {
                        submitted = false
                        issueText = ""
                        inlineMessage = ""
                        return@Button
                    }
                    if (issueText.trim().isBlank()) {
                        inlineType = InlineMessageType.Error
                        inlineMessage = "Please enter issue details"
                    } else {
                        scope.launch {
                            AuthRepository.submitIssueReport(issueText).fold(
                                onSuccess = {
                                    inlineType = InlineMessageType.Success
                                    inlineMessage = "Issue submitted successfully"
                                    submitted = true
                                },
                                onFailure = { e ->
                                    inlineType = InlineMessageType.Error
                                    inlineMessage = normalizeProfileInlineMessage(
                                        e.message,
                                        "Failed to submit issue report",
                                    )
                                },
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.accent),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    if (submitted) "Send another response" else "Submit",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
