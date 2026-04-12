package com.example.mocktestapp.newui.theme.palette

import androidx.compose.ui.graphics.Color

/** Light counterpart: same structure, readable on white / pale surfaces. */
val MockTestPaletteLight: MockTestUiPalette = MockTestUiPalette(
    gradientStart = Color(0xFFE8F4FC),
    gradientMid = Color(0xFFF0F7FF),
    gradientEnd = Color(0xFFE2EEF8),
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
