package com.freemocktest.app.newui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ReportProblem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.newui.theme.palette.MockTestUiPalette

/** Inline success / error panel for auth flows (forgot password, complete profile, etc.). */
data class AuthScreenFeedback(
    val isError: Boolean,
    val title: String,
    val detail: String,
    /** When false and [isError] is false, shows a check icon instead of mail. */
    val successUsesMailIcon: Boolean = false,
)

@Composable
fun AuthScreenFeedbackBanner(
    palette: MockTestUiPalette,
    feedback: AuthScreenFeedback,
    onDismiss: () -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    val borderColor = if (feedback.isError) {
        palette.error.copy(alpha = 0.45f)
    } else {
        palette.success.copy(alpha = 0.4f)
    }
    val bg = if (feedback.isError) {
        palette.snackbarErrorContainer
    } else {
        palette.answerCorrectStart.copy(alpha = 0.55f)
    }
    val titleColor = if (feedback.isError) palette.snackbarOnError else palette.textPrimary
    val detailColor = if (feedback.isError) {
        palette.snackbarOnError.copy(alpha = 0.92f)
    } else {
        palette.textSecondary
    }
    val successIcon: ImageVector =
        if (feedback.successUsesMailIcon) Icons.Outlined.MarkEmailRead else Icons.Rounded.CheckCircle
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        color = bg,
        border = BorderStroke(1.dp, borderColor),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .background(
                        color = if (feedback.isError) {
                            palette.error.copy(alpha = 0.14f)
                        } else {
                            palette.success.copy(alpha = 0.14f)
                        },
                        shape = RoundedCornerShape(999.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (feedback.isError) Icons.Rounded.ReportProblem else successIcon,
                    contentDescription = null,
                    tint = if (feedback.isError) palette.error else palette.success,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = feedback.title,
                    color = titleColor,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 20.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = feedback.detail,
                    color = detailColor,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 21.sp,
                )
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.size(40.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = "Dismiss",
                    tint = titleColor.copy(alpha = 0.75f),
                )
            }
        }
    }
}
