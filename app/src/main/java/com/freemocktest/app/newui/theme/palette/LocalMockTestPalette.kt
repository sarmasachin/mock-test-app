package com.freemocktest.app.newui.theme.palette

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.ReadOnlyComposable

val LocalMockTestPalette = compositionLocalOf<MockTestUiPalette> {
    error("MockTestThemeNew must wrap content that reads LocalMockTestPalette")
}

@Composable
@ReadOnlyComposable
fun mockTestPalette(): MockTestUiPalette = LocalMockTestPalette.current

@Composable
fun ProvideMockTestPalette(
    palette: MockTestUiPalette,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalMockTestPalette provides palette) {
        content()
    }
}
