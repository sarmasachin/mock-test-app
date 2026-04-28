package com.freemocktest.app.newui.news

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun CategoryPill(
    text: String,
    accent: Color,
    borderAlpha: Float = 0.45f,
    onHeroImage: Boolean = false,
) {
    val shape = RoundedCornerShape(999.dp)
    Text(
        text = text.uppercase(),
        color = accent,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.6.sp,
        modifier = Modifier
            .clip(shape)
            .border(1.dp, accent.copy(alpha = borderAlpha), shape)
            .then(
                if (onHeroImage) Modifier.background(Color.White.copy(alpha = 0.14f))
                else Modifier,
            )
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}
