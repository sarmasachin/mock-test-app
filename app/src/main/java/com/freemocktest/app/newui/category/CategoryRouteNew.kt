package com.freemocktest.app.newui.category

import androidx.compose.runtime.Composable

@Composable
fun CategoryRouteNew(
    category: String,
    onBack: () -> Unit,
    onOpenSubcategory: (String) -> Unit,
) {
    CategoryScreenNew(
        category = category,
        onBack = onBack,
        onOpenSubcategory = onOpenSubcategory,
    )
}

