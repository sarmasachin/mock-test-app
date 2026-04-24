package com.example.mocktestapp.newui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ReportProblem
import androidx.compose.material3.Icon
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.mocktestapp.newui.theme.palette.mockTestPalette

/**
 * Error snackbars use [SnackbarDuration.Short]; success uses [SnackbarDuration.Long] (visual only).
 * Do not call [androidx.compose.material3.SnackbarHostState.showSnackbar] with Long duration for errors.
 */
@Composable
fun rememberAppSnackbarHostStateNew(): SnackbarHostState = remember { SnackbarHostState() }

@Composable
fun AppSnackbarHostNew(
    state: SnackbarHostState,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    SnackbarHost(
        hostState = state,
        modifier = modifier,
    ) { data ->
        val isSuccess = data.visuals.duration == SnackbarDuration.Long
        val container = if (isSuccess) p.answerCorrectStart else p.snackbarErrorContainer
        val content = if (isSuccess) p.textPrimary else p.snackbarOnError
        val iconTint = if (isSuccess) p.success else p.error
        Snackbar(
            containerColor = container,
            contentColor = content,
        ) {
            Row(modifier = Modifier.padding(horizontal = 6.dp)) {
                Icon(
                    imageVector = if (isSuccess) Icons.Rounded.CheckCircle else Icons.Rounded.ReportProblem,
                    contentDescription = null,
                    tint = iconTint,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = data.visuals.message,
                    color = content,
                    fontSize = if (isSuccess) 13.sp else 14.sp,
                    fontWeight = if (isSuccess) FontWeight.SemiBold else FontWeight.Medium,
                    lineHeight = if (isSuccess) 18.sp else 21.sp,
                )
            }
        }
    }
}

suspend fun SnackbarHostState.showError(message: String) {
    showSnackbar(
        message = message,
        duration = SnackbarDuration.Short,
    )
}

suspend fun SnackbarHostState.showSuccess(message: String) {
    showSnackbar(
        message = message,
        duration = SnackbarDuration.Long,
    )
}
