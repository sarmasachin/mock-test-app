package com.example.mocktestapp.newui.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Alignment
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.example.mocktestapp.newui.theme.palette.mockTestPalette
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.clip

/**
 * Type to filter [options]; tap a row to set the value. Same look as [NeonTextField].
 */
@Composable
fun NeonSearchableListField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    options: List<String>,
    enabled: Boolean = true,
    errorText: String?,
    isError: Boolean,
) {
    val p = mockTestPalette()
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val filtered = remember(value, options) {
        when {
            options.isEmpty() -> emptyList()
            value.isBlank() -> options.take(10)
            else -> options.filter { it.contains(value, ignoreCase = true) }.take(12)
        }
    }
    val showSuggestions = enabled && focused && filtered.isNotEmpty()

    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            label = { Text(label) },
            singleLine = true,
            interactionSource = interaction,
            shape = RoundedCornerShape(14.dp),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = p.textFieldFocused,
                unfocusedContainerColor = p.textFieldUnfocused,
                disabledContainerColor = p.textFieldUnfocused.copy(alpha = 0.55f),
                focusedTextColor = p.textPrimary,
                unfocusedTextColor = p.textPrimary,
                disabledTextColor = p.textSecondary,
                focusedLabelColor = if (isError) p.error else p.accent,
                unfocusedLabelColor = if (isError) p.error else p.textSecondary,
                disabledLabelColor = p.textSecondary,
                focusedIndicatorColor = if (isError) p.error else p.border,
                unfocusedIndicatorColor = if (isError) p.error.copy(alpha = 0.35f) else p.border.copy(alpha = 0.35f),
                disabledIndicatorColor = p.border.copy(alpha = 0.2f),
                cursorColor = if (isError) p.error else p.border,
            ),
            modifier = Modifier.fillMaxWidth(),
        )

        // Avoid expandVertically/shrinkVertically here: inside Scaffold they can hit unbounded
        // height during measure and crash (PaddingValuesModifier / AnimatedContent stack).
        AnimatedVisibility(
            visible = showSuggestions,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp)
                    .heightIn(max = 200.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = p.surfaceElevated),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
                border = BorderStroke(1.dp, p.border.copy(alpha = 0.18f)),
            ) {
                val scroll = rememberScrollState()
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 200.dp)
                        .verticalScroll(scroll),
                ) {
                    filtered.forEach { item ->
                        Text(
                            text = item,
                            color = p.textPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onValueChange(item)
                                }
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                        )
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = errorText != null,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Text(
                text = errorText.orEmpty(),
                color = p.error,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 10.dp, top = 6.dp, bottom = 2.dp),
            )
        }
    }
}

@Composable
fun NeonTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    isPassword: Boolean,
    errorText: String?,
    isError: Boolean,
) {
    val p = mockTestPalette()
    var showPassword by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            singleLine = true,
            visualTransformation = if (isPassword && !showPassword) PasswordVisualTransformation() else VisualTransformation.None,
            trailingIcon = if (isPassword) {
                {
                    Text(
                        text = if (showPassword) "Hide" else "Show",
                        color = p.accent,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { showPassword = !showPassword }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            } else null,
            shape = RoundedCornerShape(14.dp),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = p.textFieldFocused,
                unfocusedContainerColor = p.textFieldUnfocused,
                focusedTextColor = p.textPrimary,
                unfocusedTextColor = p.textPrimary,
                focusedLabelColor = if (isError) p.error else p.accent,
                unfocusedLabelColor = if (isError) p.error else p.textSecondary,
                focusedIndicatorColor = if (isError) p.error else p.border,
                unfocusedIndicatorColor = if (isError) p.error.copy(alpha = 0.35f) else p.border.copy(alpha = 0.35f),
                cursorColor = if (isError) p.error else p.border,
            ),
            modifier = Modifier.fillMaxWidth(),
        )

        AnimatedVisibility(
            visible = errorText != null,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Text(
                text = errorText.orEmpty(),
                color = p.error,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 10.dp, top = 6.dp, bottom = 2.dp),
            )
        }
    }
}

@Composable
fun NeonButton(
    text: String,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = p.primaryButton,
            contentColor = p.onPrimaryButton,
        ),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
    }
}

@Composable
fun GoogleAuthButton(
    text: String,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(12.dp)
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
            contentColor = p.textPrimary,
        ),
        shape = shape,
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .border(1.dp, p.border.copy(alpha = 0.28f), shape),
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
    }
}

fun isValidMobile(input: String): Boolean {
    val digits = input.trim()
    if (digits.length != 10 || !digits.all { it.isDigit() }) return false
    val allSameDigit = digits.toSet().size == 1
    val firstFiveSame = digits.take(5).toSet().size == 1
    return !allSameDigit && !firstFiveSame
}

fun isValidEmail(input: String): Boolean {
    val s = input.trim()
    val at = s.indexOf('@')
    if (at <= 0 || at != s.lastIndexOf('@')) return false
    val dot = s.lastIndexOf('.')
    return dot > at + 1 && dot < s.length - 1
}

