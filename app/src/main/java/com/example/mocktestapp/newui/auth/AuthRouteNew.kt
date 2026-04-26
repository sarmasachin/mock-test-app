package com.example.mocktestapp.newui.auth

import androidx.compose.runtime.Composable

@Composable
fun AuthRouteNew(
    onAuthSuccess: () -> Unit,
    onProfileIncomplete: () -> Unit,
    onForgotPassword: () -> Unit,
    onOpenTerms: () -> Unit,
) {
    AuthScreenNew(
        onAuthSuccess = onAuthSuccess,
        onProfileIncomplete = onProfileIncomplete,
        onForgotPassword = onForgotPassword,
        onOpenTerms = onOpenTerms,
    )
}

