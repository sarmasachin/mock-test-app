package com.freemocktest.app.newui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.CompositionLocalProvider

/**
 * Optional wrapper for an in-app light/dark toggle.
 * Default entry uses system UI mode via [MockTestThemeNew].
 */
enum class AppThemeModeNew {
    Light,
    Dark,
}

@Stable
data class AppThemeControllerNew(
    val mode: AppThemeModeNew,
    val setMode: (AppThemeModeNew) -> Unit,
    val toggle: () -> Unit,
)

val LocalAppThemeControllerNew = staticCompositionLocalOf<AppThemeControllerNew> {
    error("AppThemeControllerNew not provided")
}

@Composable
fun ProvideAppThemeNew(
    content: @Composable () -> Unit,
) {
    // By default the app uses LIGHT theme.
    var mode by rememberSaveable { mutableStateOf(AppThemeModeNew.Light) }

    val controller = remember(mode) {
        AppThemeControllerNew(
            mode = mode,
            setMode = { mode = it },
            toggle = {
                mode = when (mode) {
                    AppThemeModeNew.Light -> AppThemeModeNew.Dark
                    AppThemeModeNew.Dark -> AppThemeModeNew.Light
                }
            },
        )
    }

    CompositionLocalProvider(LocalAppThemeControllerNew provides controller) {
        // Map our high-level mode to the underlying Material theme.
        val useDarkColors = mode == AppThemeModeNew.Dark
        MockTestThemeNew(darkTheme = useDarkColors) {
            content()
        }
    }
}

