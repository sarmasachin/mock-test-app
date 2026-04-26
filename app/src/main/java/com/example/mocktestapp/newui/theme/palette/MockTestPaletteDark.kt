package com.example.mocktestapp.newui.theme.palette

import androidx.compose.ui.graphics.Color

/** Pixel-matched to the original dark MockTest UI. */
private fun darkHeaderTabPresetColors(preset: ColorPresetNew): HeaderTabPresetColors = when (preset) {
    ColorPresetNew.Classic -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFF081018),
        homeHeaderEnd = Color(0xFF061018),
        homeHeaderOn = Color(0xFFEAF7FF),
        tabBarContainer = Color(0xFF071018),
        tabSelected = Color(0xFFEAF7FF),
        tabIndicator = Color(0x00000000),
        tabUnselected = Color(0xFFA9C7D6),
    )
    ColorPresetNew.Soft -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFF3E4C8B),
        homeHeaderEnd = Color(0xFF5A4B8D),
        homeHeaderOn = Color(0xFFEAF2FF),
        tabBarContainer = Color(0xFF0B0F14),
        tabSelected = Color(0xFF9EA9FF),
        tabIndicator = Color(0xFF2C3256),
        tabUnselected = Color(0xFFAFB8C8),
    )
    ColorPresetNew.Vibrant -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFF0B6E99),
        homeHeaderEnd = Color(0xFF8A2E77),
        homeHeaderOn = Color(0xFFEAF7FF),
        tabBarContainer = Color(0xFF0B0F14),
        tabSelected = Color(0xFFFF5FA2),
        tabIndicator = Color(0xFF41233A),
        tabUnselected = Color(0xFFA9B2C4),
    )
    ColorPresetNew.Premium -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFF3147A8),
        homeHeaderEnd = Color(0xFF5A2FA3),
        homeHeaderOn = Color(0xFFEAF2FF),
        tabBarContainer = Color(0xFF0B0F14),
        tabSelected = Color(0xFF8EA2FF),
        tabIndicator = Color(0xFF2A3158),
        tabUnselected = Color(0xFFA9B2C4),
    )
}

fun mockTestPaletteDark(): MockTestUiPalette {
    val activePreset = darkHeaderTabPresetColors(currentColorPreset())
    return MockTestUiPalette(
        gradientStart = Color(0xFF081018),
        gradientMid = Color(0xFF0A1C25),
        gradientEnd = Color(0xFF061018),
        homeHeaderStart = activePreset.homeHeaderStart,
        homeHeaderEnd = activePreset.homeHeaderEnd,
        homeHeaderOn = activePreset.homeHeaderOn,
        tabBarContainer = activePreset.tabBarContainer,
        tabSelected = activePreset.tabSelected,
        tabIndicator = activePreset.tabIndicator,
        tabUnselected = activePreset.tabUnselected,
        surface = Color(0xFF071018),
        surfaceElevated = Color(0xFF071A22),
        surfaceTrack = Color(0xFF0A1C25),
        textPrimary = Color(0xFFEAF7FF),
        textSecondary = Color(0xFFA9C7D6),
        accent = Color(0xFF57E3FF),
        border = Color(0xFF2EE6FF),
        primaryButton = Color(0xFF1FC7E8),
        onPrimaryButton = Color(0xFF001018),
        systemBlue = Color(0xFF007AFF),
        success = Color(0xFF4BE38C),
        error = Color(0xFFFF5C6B),
        snackbarErrorContainer = Color(0xFF2A0A11),
        snackbarOnError = Color(0xFFEAF7FF),
        textFieldFocused = Color(0xFF071A22),
        textFieldUnfocused = Color(0xFF07151C),
        answerCorrectStart = Color(0xFF113C28),
        answerCorrectEnd = Color(0xFF4BE38C),
        answerWrongStart = Color(0xFF3C1318),
        answerWrongEnd = Color(0xFFFF5C6B),
        answerNeutralSurface = Color(0xFF071A22),
        overlaySoft = Color(0xFF000000).copy(alpha = 0.10f),
        overlayMedium = Color(0xFF000000).copy(alpha = 0.12f),
        materialSurface = Color(0xFF0B0F14),
        materialBackground = Color(0xFF0B0F14),
        materialPrimary = Color(0xFF29B6F6),
        materialSecondary = Color(0xFF00E5FF),
    )
}
