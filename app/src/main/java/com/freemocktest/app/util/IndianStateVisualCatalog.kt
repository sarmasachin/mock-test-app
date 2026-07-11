package com.freemocktest.app.util

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AcUnit
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.Air
import androidx.compose.material.icons.outlined.Brightness7
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.Cable
import androidx.compose.material.icons.outlined.Castle
import androidx.compose.material.icons.outlined.Church
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.DirectionsBoat
import androidx.compose.material.icons.outlined.Diamond
import androidx.compose.material.icons.outlined.Eco
import androidx.compose.material.icons.outlined.Factory
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.Grass
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Hotel
import androidx.compose.material.icons.outlined.Landscape
import androidx.compose.material.icons.outlined.LocationCity
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material.icons.outlined.Park
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.SetMeal
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.material.icons.outlined.Terrain
import androidx.compose.material.icons.outlined.TempleHindu
import androidx.compose.material.icons.outlined.VolunteerActivism
import androidx.compose.material.icons.outlined.Water
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import java.util.Locale

/**
 * Indian states / UTs for mock-test Level 2 circular cards (premium circular UI).
 * iconKey on server: state:<slug> e.g. state:br
 */
object IndianStateVisualCatalog {

    data class StateVisual(
        val slug: String,
        val englishName: String,
        val hindiName: String,
        val iconColor: Color,
        val hoverBackground: Color,
        val borderColor: Color,
        val icon: ImageVector,
    )

    private data class Row(
        val slug: String,
        val english: String,
        val hindi: String,
        val iconColor: Long,
        val hoverBg: Long,
        val border: Long,
        val icon: ImageVector,
        val aliases: List<String> = emptyList(),
    )

    private val rows: List<Row> = listOf(
        Row("ap", "Andhra Pradesh", "आंध्र प्रदेश", 0xFFF97316, 0xFFFFF7ED, 0xFFF97316, Icons.Outlined.TempleHindu, listOf("andhra")),
        Row("ar", "Arunachal Pradesh", "अरुणाचल प्रदेश", 0xFF06B6D4, 0xFFECFEFF, 0xFF06B6D4, Icons.Outlined.Landscape, listOf("arunachal")),
        Row("as", "Assam", "असम", 0xFF16A34A, 0xFFF0FDF4, 0xFF16A34A, Icons.Outlined.Eco),
        Row("br", "Bihar", "बिहार", 0xFFEA580C, 0xFFFFF7ED, 0xFFEA580C, Icons.Outlined.AccountBalance),
        Row("cg", "Chhattisgarh", "छत्तीसगढ़", 0xFFF59E0B, 0xFFFFFBEB, 0xFFF59E0B, Icons.Outlined.Park, listOf("chhattisgarh")),
        Row("ga", "Goa", "गोवा", 0xFF0EA5E9, 0xFFF0F9FF, 0xFF0EA5E9, Icons.Outlined.WbSunny),
        Row("gj", "Gujarat", "गुजरात", 0xFFF97316, 0xFFFFF7ED, 0xFFF97316, Icons.Outlined.Factory),
        Row("hr", "Haryana", "हरियाणा", 0xFF6D28D9, 0xFFF5F3FF, 0xFF6D28D9, Icons.Outlined.Grass),
        Row("hp", "Himachal Pradesh", "हिमाचल प्रदेश", 0xFF14B8A6, 0xFFF0FDFA, 0xFF14B8A6, Icons.Outlined.AcUnit, listOf("himachal", "hp")),
        Row("jh", "Jharkhand", "झारखंड", 0xFF4F46E5, 0xFFEEF2FF, 0xFF4F46E5, Icons.Outlined.Diamond),
        Row("ka", "Karnataka", "कर्नाटक", 0xFFC2410C, 0xFFFFF7ED, 0xFFC2410C, Icons.Outlined.AccountBalance),
        Row("kl", "Kerala", "केरल", 0xFF22C55E, 0xFFF0FDF4, 0xFF22C55E, Icons.Outlined.Park),
        Row("mp", "Madhya Pradesh", "मध्य प्रदेश", 0xFFDB2777, 0xFFFDF2F8, 0xFFDB2777, Icons.Outlined.Favorite, listOf("madhya pradesh")),
        Row("mh", "Maharashtra", "महाराष्ट्र", 0xFF2563EB, 0xFFEFF6FF, 0xFF2563EB, Icons.Outlined.LocationCity),
        Row("mn", "Manipur", "मणिपुर", 0xFF9C27B0, 0xFFFDF4FF, 0xFF9C27B0, Icons.Outlined.MusicNote),
        Row("ml", "Meghalaya", "मेघालय", 0xFF6D28D9, 0xFFF5F3FF, 0xFF6D28D9, Icons.Outlined.Cloud),
        Row("mz", "Mizoram", "मिजोरम", 0xFF7CB342, 0xFFF7FEE7, 0xFF7CB342, Icons.Outlined.MusicNote),
        Row("nl", "Nagaland", "नागालैंड", 0xFFAFB42B, 0xFFFEFCE8, 0xFFAFB42B, Icons.Outlined.Air),
        Row("od", "Odisha", "ओडिशा", 0xFF991B1B, 0xFFFEF2F2, 0xFF991B1B, Icons.Outlined.Brightness7, listOf("orissa")),
        Row("pb", "Punjab", "पंजाब", 0xFFFF6F00, 0xFFFFF7ED, 0xFFFF6F00, Icons.Outlined.Grass),
        Row("rj", "Rajasthan", "राजस्थान", 0xFFFACC15, 0xFFFFFBEB, 0xFFFACC15, Icons.Outlined.Castle),
        Row("sk", "Sikkim", "सिक्किम", 0xFFF9A825, 0xFFFFFBEB, 0xFFF9A825, Icons.Outlined.Spa),
        Row("tn", "Tamil Nadu", "तमिलनाडु", 0xFFAA00FF, 0xFFFDF4FF, 0xFFAA00FF, Icons.Outlined.TempleHindu, listOf("tamil nadu")),
        Row("tg", "Telangana", "तेलंगाना", 0xFFE65100, 0xFFFFF7ED, 0xFFE65100, Icons.Outlined.AccountBalance),
        Row("tr", "Tripura", "त्रिपुरा", 0xFFFBC02D, 0xFFFFFBEB, 0xFFFBC02D, Icons.Outlined.Hotel),
        Row("up", "Uttar Pradesh", "उत्तर प्रदेश", 0xFFF9A825, 0xFFFFFBEB, 0xFFF9A825, Icons.Outlined.VolunteerActivism, listOf("uttar pradesh")),
        Row("uk", "Uttarakhand", "उत्तराखंड", 0xFF0D9488, 0xFFF0FDFA, 0xFF0D9488, Icons.Outlined.Church, listOf("uttarakhand")),
        Row("wb", "West Bengal", "पश्चिम बंगाल", 0xFF15803D, 0xFFF0FDF4, 0xFF15803D, Icons.Outlined.Cable, listOf("west bengal", "bengal")),
        Row("an", "Andaman & Nicobar", "अंडमान निकोबार", 0xFF0288D1, 0xFFE1F5FE, 0xFF0288D1, Icons.Outlined.Water, listOf("andaman", "nicobar")),
        Row("ch", "Chandigarh", "चंडीगढ़", 0xFF7B1FA2, 0xFFF3E5F5, 0xFF7B1FA2, Icons.Outlined.PanTool),
        Row("dn", "Dadra & Nagar Haveli", "दादरा और नगर हवेली", 0xFFF57C00, 0xFFFFF3E0, 0xFFF57C00, Icons.Outlined.Business, listOf("dadra", "daman", "diu")),
        Row("dl", "Delhi", "दिल्ली", 0xFFC62828, 0xFFFFEBEE, 0xFFC62828, Icons.Outlined.AccountBalance, listOf("nct delhi", "new delhi")),
        Row("jk", "Jammu & Kashmir", "जम्मू और कश्मीर", 0xFF00838F, 0xFFE0F7FA, 0xFF00838F, Icons.Outlined.DirectionsBoat, listOf("jammu", "kashmir", "j&k")),
        Row("la", "Ladakh", "लद्दाख", 0xFF0277BD, 0xFFE1F5FE, 0xFF0277BD, Icons.Outlined.Terrain),
        Row("ld", "Lakshadweep", "लक्षद्वीप", 0xFF2E7D32, 0xFFE8F5E9, 0xFF2E7D32, Icons.Outlined.SetMeal),
        Row("py", "Puducherry", "पुडुचेरी", 0xFFAD1457, 0xFFFCE4EC, 0xFFAD1457, Icons.Outlined.Home, listOf("pondicherry", "puducherry")),
    )

    private val bySlug = rows.associateBy { it.slug }

    fun iconKeyForSlug(slug: String): String = "state:${slug.trim().lowercase(Locale.US)}"

    fun resolveSlug(level2Label: String, iconKey: String? = null): String? {
        parseSlugFromIconKey(iconKey)?.let { return it }
        val key = normalizeLookupKey(level2Label)
        if (key.isBlank()) return null
        for (row in rows) {
            val englishKey = normalizeLookupKey(row.english)
            val hindiKey = normalizeLookupKey(row.hindi)
            if (key == englishKey || key == hindiKey) return row.slug
            if (key.startsWith("$englishKey ") || key.contains(" $englishKey")) return row.slug
            for (alias in row.aliases) {
                val aliasKey = normalizeLookupKey(alias)
                if (key == aliasKey || key.startsWith("$aliasKey ") || key.contains(" $aliasKey")) {
                    return row.slug
                }
            }
        }
        return null
    }

    fun resolveAutoIconKey(level1: String, level2: String, iconKey: String?): String? {
        val existing = iconKey?.trim().orEmpty()
        if (existing.startsWith("http://", ignoreCase = true) || existing.startsWith("https://", ignoreCase = true)) {
            return existing
        }
        if (existing.startsWith("state:", ignoreCase = true)) return existing
        if (!isStateExamLevel1(level1)) return existing.takeIf { it.isNotBlank() }
        val slug = resolveSlug(level2, existing) ?: return existing.takeIf { it.isNotBlank() }
        return iconKeyForSlug(slug)
    }

    fun findVisual(level2Label: String, iconKey: String? = null): StateVisual? {
        val slug = resolveSlug(level2Label, iconKey) ?: return null
        val row = bySlug[slug] ?: return null
        return StateVisual(
            slug = row.slug,
            englishName = row.english,
            hindiName = row.hindi,
            iconColor = Color(row.iconColor),
            hoverBackground = Color(row.hoverBg),
            borderColor = Color(row.border),
            icon = row.icon,
        )
    }

    fun defaultVisual(): StateVisual = StateVisual(
        slug = "default",
        englishName = "State",
        hindiName = "राज्य",
        iconColor = Color(0xFF3B82F6),
        hoverBackground = Color(0xFFEFF6FF),
        borderColor = Color(0xFF3B82F6),
        icon = Icons.Outlined.Public,
    )

    /** All states/UTs for the State tab circular grid (always show full India map). */
    fun allStateSlugsInOrder(): List<String> = rows.map { it.slug }

    /**
     * Build circle grid items from the full catalog, merging admin Level-2 rows when present
     * (custom icon URL / alternate label). States without admin rows still appear.
     */
    fun buildStateCircleItems(
        adminLevel2: List<Pair<String, String?>>,
    ): List<Pair<String, String?>> {
        val adminBySlug = linkedMapOf<String, Pair<String, String?>>()
        for ((label, iconKey) in adminLevel2) {
            val slug = resolveSlug(label, iconKey) ?: continue
            adminBySlug[slug] = label.trim() to iconKey?.trim()?.takeIf { it.isNotEmpty() }
        }
        val catalogItems = rows.map { row ->
            val admin = adminBySlug[row.slug]
            val label = admin?.first?.takeIf { it.isNotBlank() } ?: row.hindi
            val iconKey = admin?.second ?: iconKeyForSlug(row.slug)
            label to iconKey
        }
        val extraAdmin = adminLevel2.mapNotNull { (label, iconKey) ->
            val trimmed = label.trim()
            if (trimmed.isEmpty()) return@mapNotNull null
            if (resolveSlug(trimmed, iconKey) != null) return@mapNotNull null
            trimmed to iconKey?.trim()?.takeIf { it.isNotEmpty() }
        }
        return catalogItems + extraAdmin
    }

    fun isStateExamLevel1(label: String): Boolean = isStateExamLevel1Internal(label)

    private fun parseSlugFromIconKey(iconKey: String?): String? {
        val raw = iconKey?.trim()?.lowercase(Locale.US).orEmpty()
        if (raw.startsWith("state:")) {
            val slug = raw.removePrefix("state:").trim()
            return slug.takeIf { bySlug.containsKey(it) }
        }
        if (raw.length in 2..3 && bySlug.containsKey(raw)) return raw
        return null
    }

    private fun isStateExamLevel1Internal(label: String): Boolean {
        val key = normalizeLookupKey(label)
        if (key.isBlank()) return false
        return key == "state" ||
            key == "state exams" ||
            key == "state exam" ||
            key.startsWith("state ")
    }

    private fun normalizeLookupKey(value: String): String =
        value.trim()
            .lowercase(Locale.US)
            .replace("&", " and ")
            .replace(Regex("[^a-z0-9\\u0900-\\u097F\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
}
