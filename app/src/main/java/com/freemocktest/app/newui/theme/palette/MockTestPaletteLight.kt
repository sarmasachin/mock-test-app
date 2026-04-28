package com.freemocktest.app.newui.theme.palette

import androidx.compose.ui.graphics.Color

/** Light counterpart: same structure, readable on white / pale surfaces. */
private fun lightHeaderTabPresetColors(preset: ColorPresetNew): HeaderTabPresetColors = when (preset) {
    ColorPresetNew.Classic -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFFE8F4FC),
        homeHeaderEnd = Color(0xFFE2EEF8),
        homeHeaderOn = Color(0xFF0F172A),
        tabBarContainer = Color(0xFFFFFFFF),
        tabSelected = Color(0xFF000000),
        tabIndicator = Color(0x00000000),
        tabUnselected = Color(0xFF64748B),
    )
    ColorPresetNew.Soft -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFF67B8FF),
        homeHeaderEnd = Color(0xFF9B8CFF),
        homeHeaderOn = Color(0xFFFFFFFF),
        tabBarContainer = Color(0xFFFFFFFF),
        tabSelected = Color(0xFF4F46E5),
        tabIndicator = Color(0xFFE5E7FF),
        tabUnselected = Color(0xFF94A3B8),
    )
    ColorPresetNew.Vibrant -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFF00A6FB),
        homeHeaderEnd = Color(0xFFB5179E),
        homeHeaderOn = Color(0xFFFFFFFF),
        tabBarContainer = Color(0xFFFFFFFF),
        tabSelected = Color(0xFFFF006E),
        tabIndicator = Color(0xFFFFE0EF),
        tabUnselected = Color(0xFF7C8799),
    )
    ColorPresetNew.Premium -> HeaderTabPresetColors(
        homeHeaderStart = Color(0xFF3A86FF),
        homeHeaderEnd = Color(0xFF8338EC),
        homeHeaderOn = Color(0xFFFFFFFF),
        tabBarContainer = Color(0xFFFFFFFF),
        tabSelected = Color(0xFF5E60CE),
        tabIndicator = Color(0xFFE0E7FF),
        tabUnselected = Color(0xFF8E9AAF),
    )
}

fun mockTestPaletteLight(): MockTestUiPalette {
    val activePreset = lightHeaderTabPresetColors(currentColorPreset())
    return MockTestUiPalette(
        gradientStart = Color(0xFFE8F4FC),
        gradientMid = Color(0xFFF0F7FF),
        gradientEnd = Color(0xFFE2EEF8),
        homeHeaderStart = activePreset.homeHeaderStart,
        homeHeaderEnd = activePreset.homeHeaderEnd,
        homeHeaderOn = activePreset.homeHeaderOn,
        tabBarContainer = activePreset.tabBarContainer,
        tabSelected = activePreset.tabSelected,
        tabIndicator = activePreset.tabIndicator,
        tabUnselected = activePreset.tabUnselected,
        surface = Color(0xFFFFFFFF),
        surfaceElevated = Color(0xFFF1F5F9),
        surfaceTrack = Color(0xFFE2E8F0),
        textPrimary = Color(0xFF0F172A),
        textSecondary = Color(0xFF64748B),
        accent = Color(0xFF0284C7),
        border = Color(0xFF38BDF8),
        primaryButton = Color(0xFF0EA5E9),
        onPrimaryButton = Color(0xFFFFFFFF),
        systemBlue = Color(0xFF2563EB),
        success = Color(0xFF16A34A),
        error = Color(0xFFDC2626),
        snackbarErrorContainer = Color(0xFFFFE4E6),
        snackbarOnError = Color(0xFF7F1D1D),
        textFieldFocused = Color(0xFFF8FAFC),
        textFieldUnfocused = Color(0xFFF1F5F9),
        answerCorrectStart = Color(0xFFDCFCE7),
        answerCorrectEnd = Color(0xFF22C55E),
        answerWrongStart = Color(0xFFFEE2E2),
        answerWrongEnd = Color(0xFFEF4444),
        answerNeutralSurface = Color(0xFFF1F5F9),
        overlaySoft = Color(0xFF000000).copy(alpha = 0.06f),
        overlayMedium = Color(0xFF000000).copy(alpha = 0.08f),
        materialSurface = Color(0xFFF8FAFC),
        materialBackground = Color(0xFFF8FAFC),
        materialPrimary = Color(0xFF0284C7),
        materialSecondary = Color(0xFF0891B2),
    )
}
