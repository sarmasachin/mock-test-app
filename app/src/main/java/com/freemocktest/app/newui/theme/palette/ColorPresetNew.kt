package com.freemocktest.app.newui.theme.palette

import androidx.compose.ui.graphics.Color

/**
 * Single-point selector for colorful Home header + bottom-tab styling.
 * Change [CurrentColorPreset] to switch the visual style app-wide.
 */
enum class ColorPresetNew {
    Classic,
    Soft,
    Vibrant,
    Premium,
}

@Volatile
private var currentColorPreset: ColorPresetNew = ColorPresetNew.Premium

fun currentColorPreset(): ColorPresetNew = currentColorPreset

fun applyColorPresetFromRemote(rawValue: String?) {
    val normalized = rawValue
        ?.trim()
        ?.lowercase()
        .orEmpty()
    currentColorPreset = when (normalized) {
        "classic" -> ColorPresetNew.Classic
        "soft" -> ColorPresetNew.Soft
        "vibrant" -> ColorPresetNew.Vibrant
        "premium" -> ColorPresetNew.Premium
        else -> ColorPresetNew.Premium
    }
}

data class HeaderTabPresetColors(
    val homeHeaderStart: Color,
    val homeHeaderEnd: Color,
    val homeHeaderOn: Color,
    val tabBarContainer: Color,
    val tabSelected: Color,
    val tabIndicator: Color,
    val tabUnselected: Color,
)
