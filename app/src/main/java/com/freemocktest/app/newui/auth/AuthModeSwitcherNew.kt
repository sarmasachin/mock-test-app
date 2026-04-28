package com.freemocktest.app.newui.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.ui.draw.clip

// Shared auth mode for the auth screens.
enum class AuthModeNew { Signup, Login }

@Composable
fun ModeSwitcher(
    mode: AuthModeNew,
    onModeChange: (AuthModeNew) -> Unit,
) {
    val p = mockTestPalette()
    val pill = RoundedCornerShape(999.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(pill)
            .background(p.surfaceTrack)
            .border(1.dp, p.border.copy(alpha = 0.20f), pill)
            .padding(4.dp),
    ) {
        ModeChip(
            text = "Sign Up",
            selected = mode == AuthModeNew.Signup,
            onClick = { onModeChange(AuthModeNew.Signup) },
        )
        ModeChip(
            text = "Login",
            selected = mode == AuthModeNew.Login,
            onClick = { onModeChange(AuthModeNew.Login) },
        )
    }
}

@Composable
private fun RowScope.ModeChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(999.dp)
    val container = if (selected) p.primaryButton else Color.Transparent
    val content = if (selected) p.onPrimaryButton else p.textSecondary

    Box(
        modifier = Modifier
            // Each tab takes exactly half of the available width so
            // Sign Up and Login always look identical in size.
            .weight(1f)
            .clip(shape)
            .background(container)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = content,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
        )
    }
}

