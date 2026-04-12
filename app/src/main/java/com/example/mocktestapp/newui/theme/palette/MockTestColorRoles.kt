package com.example.mocktestapp.newui.theme.palette

import androidx.compose.ui.graphics.Color

/**
 * Semantic UI colors for MockTest screens. Values come from [MockTestPaletteDark] / [MockTestPaletteLight].
 */
data class MockTestUiPalette(
    val gradientStart: Color,
    val gradientMid: Color,
    val gradientEnd: Color,
    val surface: Color,
    val surfaceElevated: Color,
    val surfaceTrack: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val accent: Color,
    val border: Color,
    val primaryButton: Color,
    val onPrimaryButton: Color,
    val systemBlue: Color,
    val success: Color,
    val error: Color,
    val snackbarErrorContainer: Color,
    val snackbarOnError: Color,
    val textFieldFocused: Color,
    val textFieldUnfocused: Color,
    val answerCorrectStart: Color,
    val answerCorrectEnd: Color,
    val answerWrongStart: Color,
    val answerWrongEnd: Color,
    val answerNeutralSurface: Color,
    val overlaySoft: Color,
    val overlayMedium: Color,
    val materialSurface: Color,
    val materialBackground: Color,
    val materialPrimary: Color,
    val materialSecondary: Color,
)

fun MockTestUiPalette.gradientColors(): List<Color> =
    listOf(gradientStart, gradientMid, gradientEnd)
