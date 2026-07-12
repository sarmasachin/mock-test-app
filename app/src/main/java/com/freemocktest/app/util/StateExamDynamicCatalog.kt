package com.freemocktest.app.util

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.BusAlert
import androidx.compose.material.icons.outlined.Forest
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.Park
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Star
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.freemocktest.app.data.ContentRepository
import java.util.Locale

/**
 * Phase 3 — dynamic state exam sections for all states (mirrors server stateExamDynamicSpec.js).
 */
object StateExamDynamicCatalog {

    data class SectionTemplate(
        val slug: String,
        val titleHi: String,
        val titleEn: String,
        val sortOrder: Int,
    )

    data class SectionVisual(
        val slug: String,
        val title: String,
        val sortOrder: Int,
        val accentColor: Color,
        val hoverBackground: Color,
        val icon: ImageVector,
    )

    data class TestCardModel(
        val applyTestName: String,
        val iconKey: String?,
        val featured: Boolean = false,
        val itemSortOrder: Int = 999,
    )

    private data class NormalizedRow(
        val level3: String,
        val iconKey: String?,
        val sectionSlug: String,
        val sectionTitle: String,
        val sectionSortOrder: Int,
        val itemSortOrder: Int,
        val featured: Boolean,
    )

    val defaultSectionTemplates: List<SectionTemplate> = listOf(
        SectionTemplate("gk", "सामान्य ज्ञान", "General Knowledge", 10),
        SectionTemplate("admin", "प्रशासनिक सेवाएँ", "Administrative Services", 20),
        SectionTemplate("police", "पुलिस भर्ती", "Police Recruitment", 30),
        SectionTemplate("teaching", "शिक्षक भर्ती", "Teaching Recruitment", 40),
        SectionTemplate("revenue", "राजस्व / पटवारी", "Revenue / Patwari", 50),
        SectionTemplate("medical", "स्वास्थ्य / मेडिकल", "Health / Medical", 60),
        SectionTemplate("technical", "तकनीकी / इंजीनियरिंग", "Technical / Engineering", 70),
        SectionTemplate("judiciary", "न्यायिक सेवा", "Judiciary", 80),
        SectionTemplate("forest", "वन / पर्यावरण", "Forest / Environment", 90),
        SectionTemplate("transport", "परिवहन", "Transport", 95),
        SectionTemplate("other", "अन्य परीक्षाएँ", "Other Exams", 99),
    )

    private val templateBySlug = defaultSectionTemplates.associateBy { it.slug }

    fun suggestSectionSlugFromLevel3(level3: String): String {
        val key = normalizeKey(level3)
        if (key.isBlank()) return "other"
        if (
            key.contains("gk") ||
            key.contains("general knowledge") ||
            key.contains("history") ||
            key.contains("geography")
        ) {
            return "gk"
        }
        if (key.contains("police") || key.contains("constable") || key.endsWith(" si") || key.contains(" si ")) {
            return "police"
        }
        if (
            key.contains("tet") ||
            key.contains("tgt") ||
            key.contains("pgt") ||
            key.contains("teacher") ||
            key.contains("lecturer") ||
            key.contains("jbt") ||
            key.contains("ntt")
        ) {
            return "teaching"
        }
        if (key.contains("patwari") || key.contains("revenue") || key.contains("tehsildar") || key.contains("naib")) {
            return "revenue"
        }
        if (key.contains("medical") || key.contains("nurse") || key.contains("anm") || key.contains("mo ")) {
            return "medical"
        }
        if (
            key.contains("je ") ||
            key.contains("junior engineer") ||
            key.contains("lineman") ||
            key.contains("technical")
        ) {
            return "technical"
        }
        if (key.contains("judicial") || key.contains("court") || key.contains("judge")) {
            return "judiciary"
        }
        if (key.contains("forest") || key.contains("acf") || key.contains("guard")) {
            return "forest"
        }
        if (key.contains("conductor") || key.contains("transport") || key.contains("hrtc")) {
            return "transport"
        }
        if (key.contains("hpas") || key.contains("sdm") || key.contains("dsp") || key.contains("administrative")) {
            return "admin"
        }
        return "other"
    }

    fun buildSectionsForState(
        remoteItems: List<ContentRepository.ExamCategoryItemRemote>,
        stateDrillLabel: String,
    ): List<Pair<SectionVisual, List<TestCardModel>>> {
        val stateSlug = IndianStateVisualCatalog.resolveSlug(stateDrillLabel, null) ?: return emptyList()
        val rows = remoteItems
            .asSequence()
            .filter { it.enabled && IndianStateVisualCatalog.isStateExamLevel1(it.level1) }
            .filter { IndianStateVisualCatalog.resolveSlug(it.level2, it.iconKey) == stateSlug }
            .mapNotNull { normalizeRow(it) }
            .toList()
        if (rows.isEmpty()) return emptyList()

        val grouped = linkedMapOf<String, MutableList<NormalizedRow>>()
        for (row in rows) {
            grouped.getOrPut(row.sectionSlug) { mutableListOf() }.add(row)
        }

        return grouped.entries
            .map { (slug, sectionRows) ->
                val sortedTests = sortRows(sectionRows)
                val first = sortedTests.first()
                sectionVisual(
                    slug = slug,
                    title = first.sectionTitle,
                    sortOrder = first.sectionSortOrder,
                ) to sortedTests.map { row ->
                    TestCardModel(
                        applyTestName = row.level3,
                        iconKey = row.iconKey,
                        featured = row.featured,
                        itemSortOrder = row.itemSortOrder,
                    )
                }
            }
            .sortedWith(
                compareBy<Pair<SectionVisual, List<TestCardModel>>> { it.first.sortOrder }
                    .thenBy { it.first.title },
            )
    }

    fun resolveTestVisual(
        applyTestName: String,
        iconKey: String?,
        stateDrillLabel: String? = null,
    ): TestVisual {
        val remoteUrl = iconKey?.trim()?.takeIf {
            it.startsWith("http://", ignoreCase = true) || it.startsWith("https://", ignoreCase = true)
        }
        if (stateDrillLabel != null && HimachalExamVisualCatalog.isHimachalStateLabel(stateDrillLabel)) {
            HimachalExamVisualCatalog.findTestVisual(applyTestName, iconKey)?.let { hp ->
                return TestVisual(
                    title = hp.hindiName,
                    subLabel = hp.subLabel,
                    icon = hp.icon,
                    iconColor = hp.iconColor,
                    hoverBackground = hp.hoverBackground,
                    remoteIconUrl = remoteUrl,
                )
            }
        }
        val heuristic = heuristicVisual(applyTestName, iconKey)
        return heuristic.copy(remoteIconUrl = remoteUrl ?: heuristic.remoteIconUrl)
    }

    data class TestVisual(
        val title: String,
        val subLabel: String,
        val icon: ImageVector,
        val iconColor: Color,
        val hoverBackground: Color,
        val remoteIconUrl: String? = null,
    )

    private fun normalizeRow(item: ContentRepository.ExamCategoryItemRemote): NormalizedRow? {
        val level3 = item.level3.trim()
        if (level3.isEmpty()) return null
        val sectionSlug = normalizeSectionSlug(
            item.sectionSlug?.trim().takeUnless { it.isNullOrEmpty() }
                ?: suggestSectionSlugFromLevel3(level3),
        )
        val template = templateBySlug[sectionSlug] ?: templateBySlug["other"]!!
        val sectionTitle = item.sectionTitle?.trim().takeUnless { it.isNullOrEmpty() }
            ?: template.titleHi.ifBlank { template.titleEn }
        val sectionSortOrder = item.sectionSortOrder?.takeIf { it in 0..999 }
            ?: template.sortOrder
        val itemSortOrder = item.itemSortOrder?.coerceIn(0, 9999) ?: 999
        return NormalizedRow(
            level3 = level3,
            iconKey = item.iconKey?.trim()?.takeIf { it.isNotEmpty() },
            sectionSlug = sectionSlug,
            sectionTitle = sectionTitle,
            sectionSortOrder = sectionSortOrder,
            itemSortOrder = itemSortOrder,
            featured = item.featured,
        )
    }

    private fun sortRows(rows: List<NormalizedRow>): List<NormalizedRow> =
        rows.sortedWith(
            compareByDescending<NormalizedRow> { it.featured }
                .thenBy { it.itemSortOrder }
                .thenBy { it.level3.lowercase(Locale.US) },
        )

    private fun normalizeSectionSlug(raw: String): String {
        val slug = raw.trim().lowercase(Locale.US)
            .replace(Regex("[^a-z0-9-]"), "-")
            .replace(Regex("-+"), "-")
            .trim('-')
            .take(48)
        return slug.ifBlank { "other" }
    }

    private fun sectionVisual(slug: String, title: String, sortOrder: Int): SectionVisual {
        val palette = sectionPalette(slug)
        return SectionVisual(
            slug = slug,
            title = title,
            sortOrder = sortOrder,
            accentColor = palette.accent,
            hoverBackground = palette.hover,
            icon = palette.icon,
        )
    }

    private data class SectionPalette(val accent: Color, val hover: Color, val icon: ImageVector)

    private fun sectionPalette(slug: String): SectionPalette = when (slug) {
        "gk" -> SectionPalette(Color(0xFF0F766E), Color(0xFFCCFBF1), Icons.Outlined.AutoStories)
        "admin" -> SectionPalette(Color(0xFFB91C1C), Color(0xFFFEF2F2), Icons.Outlined.AccountBalance)
        "police" -> SectionPalette(Color(0xFF0369A1), Color(0xFFF0F9FF), Icons.Outlined.Shield)
        "teaching" -> SectionPalette(Color(0xFF6D28D9), Color(0xFFF5F3FF), Icons.Outlined.School)
        "revenue" -> SectionPalette(Color(0xFF15803D), Color(0xFFF0FDF4), Icons.Outlined.Park)
        "medical" -> SectionPalette(Color(0xFF334155), Color(0xFFF8FAFC), Icons.Outlined.LocalHospital)
        "technical" -> SectionPalette(Color(0xFF1E3A8A), Color(0xFFEFF6FF), Icons.Outlined.Memory)
        "judiciary" -> SectionPalette(Color(0xFF7C2D12), Color(0xFFFFF7ED), Icons.Outlined.Gavel)
        "forest" -> SectionPalette(Color(0xFF166534), Color(0xFFECFDF5), Icons.Outlined.Forest)
        "transport" -> SectionPalette(Color(0xFFC2410C), Color(0xFFFFF7ED), Icons.Outlined.BusAlert)
        else -> SectionPalette(Color(0xFF475569), Color(0xFFF1F5F9), Icons.Outlined.Star)
    }

    private fun heuristicVisual(applyTestName: String, iconKey: String?): TestVisual {
        val key = "${iconKey.orEmpty()} ${applyTestName}".lowercase(Locale.US)
        val palette = when {
            listOf("police", "constable", "si", "shield").any { key.contains(it) } ->
                sectionPalette("police")
            listOf("tet", "tgt", "teacher", "lecturer", "school").any { key.contains(it) } ->
                sectionPalette("teaching")
            listOf("patwari", "revenue", "tehsildar").any { key.contains(it) } ->
                sectionPalette("revenue")
            listOf("medical", "nurse", "hospital", "anm").any { key.contains(it) } ->
                sectionPalette("medical")
            listOf("gk", "history", "geography", "general").any { key.contains(it) } ->
                sectionPalette("gk")
            listOf("forest", "acf").any { key.contains(it) } ->
                sectionPalette("forest")
            listOf("judicial", "court", "judge").any { key.contains(it) } ->
                sectionPalette("judiciary")
            listOf("engineer", "technical", "lineman", "je ").any { key.contains(it) } ->
                sectionPalette("technical")
            listOf("hpas", "admin", "sdm", "dsp").any { key.contains(it) } ->
                sectionPalette("admin")
            else -> sectionPalette("other")
        }
        val subLabel = applyTestName.trim()
        return TestVisual(
            title = subLabel,
            subLabel = subLabel,
            icon = palette.icon,
            iconColor = palette.accent,
            hoverBackground = palette.hover,
        )
    }

    private fun normalizeKey(value: String): String =
        value.trim()
            .lowercase(Locale.US)
            .replace("&", " and ")
            .replace(Regex("[^a-z0-9\\u0900-\\u097F\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
}
