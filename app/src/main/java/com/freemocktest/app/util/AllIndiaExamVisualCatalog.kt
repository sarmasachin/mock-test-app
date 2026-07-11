package com.freemocktest.app.util

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.DirectionsBoat
import androidx.compose.material.icons.outlined.Eco
import androidx.compose.material.icons.outlined.Engineering
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Handyman
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.MilitaryTech
import androidx.compose.material.icons.outlined.Park
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Train
import androidx.compose.material.icons.outlined.VolunteerActivism
import androidx.compose.material.icons.outlined.Work
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import java.util.Locale

/**
 * All India mock-test cards — section groups + per-test circular UI (admin Level 1 = All India).
 * iconKey: allindia:<slug> e.g. allindia:ssc-cgl
 */
object AllIndiaExamVisualCatalog {

    data class SectionVisual(
        val slug: String,
        val titleHindi: String,
        val titleEnglish: String,
        val accentColor: Color,
        val hoverBackground: Color,
        val icon: ImageVector,
    )

    data class TestVisual(
        val slug: String,
        val hindiName: String,
        val subLabel: String,
        val sectionSlug: String,
        val iconColor: Color,
        val hoverBackground: Color,
        val borderColor: Color,
        val icon: ImageVector,
    )

    private data class SectionRow(
        val slug: String,
        val titleHindi: String,
        val titleEnglish: String,
        val accent: Long,
        val hover: Long,
        val icon: ImageVector,
        val aliases: List<String> = emptyList(),
    )

    private data class TestRow(
        val slug: String,
        val hindiName: String,
        val subLabel: String,
        val sectionSlug: String,
        val accent: Long,
        val hover: Long,
        val icon: ImageVector,
        val aliases: List<String> = emptyList(),
    )

    private val sections = listOf(
        SectionRow("upsc", "संघ लोक सेवा आयोग (UPSC)", "UPSC", 0xFF1E3A8A, 0xFFF0F6FF, Icons.Outlined.AccountBalance, listOf("upsc", "civil services", "union public service")),
        SectionRow("ssc", "कर्मचारी चयन आयोग (SSC)", "SSC", 0xFF9D174D, 0xFFFDF2F8, Icons.Outlined.Badge, listOf("staff selection", "ssc exams")),
        SectionRow("bank", "बैंकिंग एवं आरबीआई (Banking)", "Banking", 0xFF065F46, 0xFFF0FDF4, Icons.Outlined.AccountBalance, listOf("bank", "ibps", "sbi", "rbi", "banking")),
        SectionRow("rrb", "भारतीय रेलवे (RRB)", "Railways", 0xFF991B1B, 0xFFFEF2F2, Icons.Outlined.Train, listOf("railway", "rrb", "railways")),
        SectionRow("def", "रक्षा सेवाएं (Defence)", "Defence", 0xFF3F6212, 0xFFF7FEE7, Icons.Outlined.Shield, listOf("defence", "defense", "nda", "cds", "afcat")),
        SectionRow("other", "अन्य राष्ट्रीय एवं प्रवेश परीक्षाएँ", "Other Exams", 0xFF334155, 0xFFF8FAFC, Icons.Outlined.Star,
            listOf("teaching", "medical", "engineering", "insurance", "ugc", "neet", "gate", "jee", "lic", "ctet")),
    )

    private val tests = listOf(
        TestRow("upsc-cse", "सिविल सर्विसेज", "UPSC CSE", "upsc", 0xFF1E3A8A, 0xFFF0F6FF, Icons.Outlined.Work, listOf("cse", "civil service", "ias")),
        TestRow("upsc-ifs", "वन सेवा", "UPSC IFS", "upsc", 0xFF1E3A8A, 0xFFF0F6FF, Icons.Outlined.Park),
        TestRow("upsc-ese", "इंजीनियरिंग सेवा", "UPSC ESE", "upsc", 0xFF1E3A8A, 0xFFF0F6FF, Icons.Outlined.Build),
        TestRow("upsc-cms", "मेडिकल सेवा", "UPSC CMS", "upsc", 0xFF1E3A8A, 0xFFF0F6FF, Icons.Outlined.LocalHospital),
        TestRow("ssc-cgl", "एसएससी CGL", "SSC CGL", "ssc", 0xFF9D174D, 0xFFFDF2F8, Icons.Outlined.School, listOf("cgl")),
        TestRow("ssc-cpo", "सब-इंस्पेक्टर", "SSC CPO", "ssc", 0xFF9D174D, 0xFFFDF2F8, Icons.Outlined.Security, listOf("cpo")),
        TestRow("ssc-chsl", "एसएससी CHSL", "SSC CHSL", "ssc", 0xFF9D174D, 0xFFFDF2F8, Icons.Outlined.Keyboard, listOf("chsl", "ldc")),
        TestRow("ssc-mts", "एसएससी MTS", "SSC MTS", "ssc", 0xFF9D174D, 0xFFFDF2F8, Icons.Outlined.Work, listOf("mts")),
        TestRow("ssc-gd", "कांस्टेबल GD", "SSC GD", "ssc", 0xFF9D174D, 0xFFFDF2F8, Icons.Outlined.MilitaryTech, listOf("gd")),
        TestRow("sbi-po", "एसबीआई PO", "SBI PO", "bank", 0xFF065F46, 0xFFF0FDF4, Icons.Outlined.AccountBalance),
        TestRow("sbi-clerk", "एसबीआई क्लर्क", "SBI CLERK", "bank", 0xFF065F46, 0xFFF0FDF4, Icons.Outlined.Groups),
        TestRow("ibps-po", "आईबीपीएस PO", "IBPS PO", "bank", 0xFF065F46, 0xFFF0FDF4, Icons.Outlined.Public, listOf("ibps po")),
        TestRow("ibps-rrb", "ग्रामीण बैंक", "IBPS RRB", "bank", 0xFF065F46, 0xFFF0FDF4, Icons.Outlined.Groups, listOf("rrb po", "rrb clerk")),
        TestRow("rbi-grade-b", "आरबीआई ग्रेड B", "RBI GRADE B", "bank", 0xFF065F46, 0xFFF0FDF4, Icons.Outlined.Star, listOf("rbi grade b", "rbi b")),
        TestRow("rrb-ntpc", "रेलवे एनटीपीसी", "RRB NTPC", "rrb", 0xFF991B1B, 0xFFFEF2F2, Icons.Outlined.Train, listOf("ntpc")),
        TestRow("rrb-alp", "लोको पायलट", "RRB ALP", "rrb", 0xFF991B1B, 0xFFFEF2F2, Icons.Outlined.Engineering, listOf("alp")),
        TestRow("rrb-je", "जूनियर इंजीनियर", "RRB JE", "rrb", 0xFF991B1B, 0xFFFEF2F2, Icons.Outlined.Settings, listOf("je")),
        TestRow("rrb-group-d", "रेलवे ग्रुप D", "GROUP D", "rrb", 0xFF991B1B, 0xFFFEF2F2, Icons.Outlined.Handyman, listOf("group d", "railway group d")),
        TestRow("nda", "एनडीए परीक्षा", "NDA", "def", 0xFF3F6212, 0xFFF7FEE7, Icons.Outlined.MilitaryTech),
        TestRow("cds", "सीडीएस परीक्षा", "CDS", "def", 0xFF3F6212, 0xFFF7FEE7, Icons.Outlined.Star),
        TestRow("afcat", "एएफसीएटी", "AFCAT", "def", 0xFF3F6212, 0xFFF7FEE7, Icons.Outlined.Cloud),
        TestRow("agniveer", "अग्निवीर भर्ती", "AGNIVEER", "def", 0xFF3F6212, 0xFFF7FEE7, Icons.Outlined.LocalFireDepartment, listOf("agniveer")),
        TestRow("ugc-net", "यूजीसी नेट", "UGC NET", "other", 0xFF5B21B6, 0xFFF5F3FF, Icons.Outlined.AutoStories, listOf("ugc net", "net jrf")),
        TestRow("ctet", "सीटीईटी पात्रता", "CTET", "other", 0xFF5B21B6, 0xFFF5F3FF, Icons.Outlined.School),
        TestRow("neet-ug", "नीट यूजी", "NEET UG", "other", 0xFFDC2626, 0xFFFFF5F5, Icons.Outlined.LocalHospital, listOf("neet")),
        TestRow("gate", "गेट परीक्षा", "GATE", "other", 0xFFEA580C, 0xFFFFF7ED, Icons.Outlined.Settings),
        TestRow("jee-mains", "जेईई मेन्स", "JEE MAINS", "other", 0xFFEA580C, 0xFFFFF7ED, Icons.Outlined.Science, listOf("jee main", "jee mains")),
        TestRow("lic-aao", "एलआईसी AAO", "LIC AAO", "other", 0xFFB45309, 0xFFFFFBEB, Icons.Outlined.VolunteerActivism, listOf("lic aao")),
    )

    private val sectionBySlug = sections.associateBy { it.slug }

    fun isAllIndiaExamLevel1(label: String): Boolean {
        val key = normalizeKey(label)
        if (key.isBlank()) return false
        return key == "all india" || key.startsWith("all india ")
    }

    fun iconKeyForSlug(slug: String): String = "allindia:${slug.trim().lowercase(Locale.US)}"

    fun resolveSectionSlug(level2Label: String): String {
        val key = normalizeKey(level2Label)
        if (key.isBlank()) return "other"
        for (row in sections) {
            if (key == normalizeKey(row.titleEnglish) || key == normalizeKey(row.slug)) return row.slug
            if (key.contains(normalizeKey(row.slug))) return row.slug
            for (alias in row.aliases) {
                if (key.contains(normalizeKey(alias))) return row.slug
            }
        }
        when {
            key.contains("upsc") -> return "upsc"
            key.contains("ssc") -> return "ssc"
            key.contains("bank") || key.contains("ibps") || key.contains("sbi") || key.contains("rbi") -> return "bank"
            key.contains("rail") || key.contains("rrb") -> return "rrb"
            key.contains("defen") || key.contains("nda") || key.contains("cds") || key.contains("afcat") -> return "def"
        }
        return "other"
    }

    fun sectionVisual(sectionSlug: String): SectionVisual {
        val row = sectionBySlug[sectionSlug] ?: sectionBySlug["other"]!!
        return SectionVisual(
            slug = row.slug,
            titleHindi = row.titleHindi,
            titleEnglish = row.titleEnglish,
            accentColor = Color(row.accent),
            hoverBackground = Color(row.hover),
            icon = row.icon,
        )
    }

    fun resolveTestSlug(level3Label: String, level2Label: String, iconKey: String? = null): String? {
        parseSlugFromIconKey(iconKey)?.let { return it }
        val key = normalizeKey(level3Label)
        if (key.isBlank()) return null
        for (row in tests) {
            if (key == normalizeKey(row.subLabel) || key == normalizeKey(row.hindiName)) return row.slug
            for (alias in row.aliases) {
                if (key.contains(normalizeKey(alias))) return row.slug
            }
        }
        val l2 = normalizeKey(level2Label)
        for (row in tests) {
            if (l2.contains(normalizeKey(row.sectionSlug)) && key.contains(normalizeKey(row.subLabel))) return row.slug
        }
        return null
    }

    fun findTestVisual(level3Label: String, level2Label: String, iconKey: String? = null): TestVisual? {
        val slug = resolveTestSlug(level3Label, level2Label, iconKey) ?: return null
        val row = tests.firstOrNull { it.slug == slug } ?: return null
        return toTestVisual(row)
    }

    fun resolveAutoIconKey(level1: String, level2: String, level3: String, iconKey: String?): String? {
        val existing = iconKey?.trim().orEmpty()
        if (existing.startsWith("http://", ignoreCase = true) || existing.startsWith("https://", ignoreCase = true)) {
            return existing
        }
        if (existing.startsWith("allindia:", ignoreCase = true)) return existing
        if (!isAllIndiaExamLevel1(level1)) return existing.takeIf { it.isNotBlank() }
        val slug = resolveTestSlug(level3, level2, existing) ?: return existing.takeIf { it.isNotBlank() }
        return iconKeyForSlug(slug)
    }

    fun defaultTestVisual(level3Label: String, level2Label: String): TestVisual {
        val sectionSlug = resolveSectionSlug(level2Label)
        val section = sectionBySlug[sectionSlug] ?: sectionBySlug["other"]!!
        val name = level3Label.trim().ifBlank { "Mock Test" }
        return TestVisual(
            slug = "custom",
            hindiName = name,
            subLabel = name.uppercase(Locale.US),
            sectionSlug = sectionSlug,
            iconColor = Color(section.accent),
            hoverBackground = Color(section.hover),
            borderColor = Color(section.accent),
            icon = Icons.Outlined.Star,
        )
    }

    fun sectionOrder(): List<String> = listOf("upsc", "ssc", "bank", "rrb", "def", "other")

    data class CatalogTestSeed(
        val catalogSlug: String,
        val applyTestName: String,
        val sectionSlug: String,
        val sectionLabel: String,
        val iconKey: String,
    )

    /** Full All India design catalog — shown even when admin has no rows yet. */
    fun catalogTestSeeds(): List<CatalogTestSeed> = tests.map { row ->
        val section = sectionBySlug[row.sectionSlug] ?: sectionBySlug["other"]!!
        CatalogTestSeed(
            catalogSlug = row.slug,
            applyTestName = row.hindiName,
            sectionSlug = row.sectionSlug,
            sectionLabel = section.titleEnglish,
            iconKey = iconKeyForSlug(row.slug),
        )
    }

    fun matchCatalogSlug(level3Label: String, level2Label: String, iconKey: String? = null): String? =
        resolveTestSlug(level3Label, level2Label, iconKey)

    private fun toTestVisual(row: TestRow): TestVisual = TestVisual(
        slug = row.slug,
        hindiName = row.hindiName,
        subLabel = row.subLabel,
        sectionSlug = row.sectionSlug,
        iconColor = Color(row.accent),
        hoverBackground = Color(row.hover),
        borderColor = Color(row.accent),
        icon = row.icon,
    )

    private fun parseSlugFromIconKey(iconKey: String?): String? {
        val raw = iconKey?.trim()?.lowercase(Locale.US).orEmpty()
        if (!raw.startsWith("allindia:")) return null
        val slug = raw.removePrefix("allindia:").trim()
        return slug.takeIf { tests.any { it.slug == slug } }
    }

    private fun normalizeKey(value: String): String =
        value.trim()
            .lowercase(Locale.US)
            .replace("&", " and ")
            .replace(Regex("[^a-z0-9\\u0900-\\u097F\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
}
