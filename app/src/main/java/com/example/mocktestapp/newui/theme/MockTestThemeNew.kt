package com.example.mocktestapp.newui.theme

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.drawable.ColorDrawable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.example.mocktestapp.newui.theme.palette.MockTestPaletteDark
import com.example.mocktestapp.newui.theme.palette.MockTestPaletteLight
import com.example.mocktestapp.newui.theme.palette.ProvideMockTestPalette

@Composable
fun MockTestThemeNew(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val palette = if (darkTheme) MockTestPaletteDark else MockTestPaletteLight
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = palette.materialPrimary,
            secondary = palette.materialSecondary,
            surface = palette.materialSurface,
            background = palette.materialBackground,
        )
    } else {
        lightColorScheme(
            primary = palette.materialPrimary,
            secondary = palette.materialSecondary,
            surface = palette.materialSurface,
            background = palette.materialBackground,
        )
    }

    val view = LocalView.current
    SideEffect {
        runCatching {
            if (!view.isAttachedToWindow) return@runCatching
            val window = view.context.findActivity()?.window ?: return@runCatching
            // Keep the system window tint aligned with Compose surfaces so navigation never reveals
            // the framework default black frame between destinations.
            window.setBackgroundDrawable(ColorDrawable(palette.materialBackground.toArgb()))
            WindowCompat.setDecorFitsSystemWindows(window, false)
            val controller = WindowCompat.getInsetsController(window, view) ?: return@runCatching
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    ProvideMockTestPalette(palette) {
        MaterialTheme(
            colorScheme = colorScheme,
            content = content,
        )
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
