package com.freemocktest.app.newui.theme.palette

import androidx.compose.ui.graphics.Color

/**
 * Stable pastel per label — used for Exam hierarchy cards and feed category chips.
 * Hash-based so the same label always gets the same accent (premium, not random each visit).
 */
fun categoryLabelTintColor(raw: String): Color {
    val palette = listOf(
        Color(0xFF0EA5E9),
        Color(0xFF06B6D4),
        Color(0xFF14B8A6),
        Color(0xFF10B981),
        Color(0xFF22C55E),
        Color(0xFF84CC16),
        Color(0xFFEAB308),
        Color(0xFFF59E0B),
        Color(0xFFF97316),
        Color(0xFFFB7185),
        Color(0xFFE11D48),
        Color(0xFFEC4899),
        Color(0xFFD946EF),
        Color(0xFFA855F7),
        Color(0xFF8B5CF6),
        Color(0xFF7C3AED),
        Color(0xFF6366F1),
        Color(0xFF4F46E5),
        Color(0xFF3B82F6),
        Color(0xFF2563EB),
        Color(0xFF60A5FA),
        Color(0xFF2DD4BF),
        Color(0xFF34D399),
        Color(0xFFA3E635),
        Color(0xFFFDE047),
        Color(0xFFFDBA74),
        Color(0xFFF9A8D4),
        Color(0xFFC4B5FD),
        Color(0xFF93C5FD),
    )
    val key = raw.trim().lowercase()
    val hash = key.hashCode() and Int.MAX_VALUE
    return palette[hash % palette.size]
}
