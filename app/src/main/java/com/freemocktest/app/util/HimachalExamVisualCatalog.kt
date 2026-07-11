package com.freemocktest.app.util

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.BusAlert
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.ChildCare
import androidx.compose.material.icons.outlined.Eco
import androidx.compose.material.icons.outlined.Forest
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Landscape
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.MilitaryTech
import androidx.compose.material.icons.outlined.Park
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.VolunteerActivism
import androidx.compose.material.icons.outlined.Water
import androidx.compose.material.icons.outlined.Work
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import java.util.Locale

/** Himachal Pradesh inner exam portal — sections + per-test circular UI. iconKey: hp:<slug> */
object HimachalExamVisualCatalog {

    data class SectionVisual(
        val slug: String,
        val titleHindi: String,
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
        val icon: ImageVector,
    )

    private data class SectionRow(
        val slug: String,
        val titleHindi: String,
        val accent: Long,
        val hover: Long,
        val icon: ImageVector,
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
        SectionRow("hp-gk", "हिमाचल प्रदेश सामान्य ज्ञान (HP GK) एवं मॉक टेस्ट", 0xFF0F766E, 0xFFCCFBF1, Icons.Outlined.AutoStories),
        SectionRow("hp-admin", "प्रशासनिक एवं राजपत्रित सेवाएँ", 0xFFB91C1C, 0xFFFEF2F2, Icons.Outlined.AccountBalance),
        SectionRow("hp-allied", "अधीनस्थ एवं अलाइड सेवाएँ", 0xFF1E3A8A, 0xFFEFF6FF, Icons.Outlined.Groups),
        SectionRow("hp-police", "पुलिस एवं गृह विभाग", 0xFF0369A1, 0xFFF0F9FF, Icons.Outlined.Shield),
        SectionRow("hp-teach", "शिक्षा एवं शिक्षक पात्रता", 0xFF6D28D9, 0xFFF5F3FF, Icons.Outlined.School),
        SectionRow("hp-rev", "राजस्व, वन एवं तकनीकी विभाग", 0xFF15803D, 0xFFF0FDF4, Icons.Outlined.Park),
        SectionRow("hp-court", "स्वास्थ्य एवं न्यायपालिका", 0xFF334155, 0xFFF8FAFC, Icons.Outlined.LocalHospital),
        SectionRow("hp-misc", "कृषि, परिवहन एवं अन्य विशिष्ट विभाग", 0xFFC2410C, 0xFFFFF7ED, Icons.Outlined.Eco),
    )

    private val tests = listOf(
        TestRow("hp-gk-mix", "HP GK मिक्स मॉक टेस्ट", "HP GK Full Mix", "hp-gk", 0xFF0F766E, 0xFFCCFBF1, Icons.Outlined.Memory, listOf("hp gk", "hp gk mix", "hp gk full")),
        TestRow("hp-history", "हिमाचल का इतिहास", "HP History", "hp-gk", 0xFF0D9488, 0xFFF0FDFA, Icons.Outlined.Timeline, listOf("history")),
        TestRow("hp-geography", "हिमाचल का भूगोल", "HP Geography", "hp-gk", 0xFF0D9488, 0xFFF0FDFA, Icons.Outlined.Landscape, listOf("geography")),
        TestRow("hp-rivers", "नदियां और झीलें", "Rivers & Lakes", "hp-gk", 0xFF0D9488, 0xFFF0FDFA, Icons.Outlined.Water),
        TestRow("hp-culture", "संस्कृति, मेले व त्यौहार", "Culture & Fairs", "hp-gk", 0xFF0D9488, 0xFFF0FDFA, Icons.Outlined.Star),
        TestRow("hp-budget", "HP बजट व आर्थिक सर्वे", "Budget & Eco", "hp-gk", 0xFF0D9488, 0xFFF0FDFA, Icons.Outlined.Calculate),
        TestRow("hp-district", "जिलेवार सामान्य ज्ञान", "District Wise", "hp-gk", 0xFF0D9488, 0xFFF0FDFA, Icons.Outlined.Map),
        TestRow("hpas", "हिमाचल प्रशासनिक सेवा", "HPAS (SDM/DSP)", "hp-admin", 0xFFB91C1C, 0xFFFEF2F2, Icons.Outlined.AccountBalance, listOf("hpas", "sdm", "dsp")),
        TestRow("hp-naib-tehsildar", "नायब तहसीलदार", "HP Revenue", "hp-admin", 0xFFB91C1C, 0xFFFEF2F2, Icons.Outlined.Gavel, listOf("naib tehsildar", "tehsildar")),
        TestRow("hpfs", "वन सेवा (ACF)", "HPFS", "hp-admin", 0xFFB91C1C, 0xFFFEF2F2, Icons.Outlined.Park, listOf("acf", "forest service")),
        TestRow("hp-judicial", "न्यायिक सेवा", "HP Judicial", "hp-admin", 0xFFB91C1C, 0xFFFEF2F2, Icons.Outlined.Gavel, listOf("judicial")),
        TestRow("hp-allied", "अलाइड सर्विसेज", "HP Allied", "hp-allied", 0xFF1E3A8A, 0xFFEFF6FF, Icons.Outlined.Groups, listOf("allied")),
        TestRow("joa-it", "जेओए आईटी", "JOA IT", "hp-allied", 0xFF1E3A8A, 0xFFEFF6FF, Icons.Outlined.Memory, listOf("joa")),
        TestRow("hp-si", "सब-इंस्पेक्टर पुलिस", "HP Police SI", "hp-allied", 0xFF1E3A8A, 0xFFEFF6FF, Icons.Outlined.Security, listOf("sub inspector", "si")),
        TestRow("hp-junior-auditor", "जूनियर ऑपरेटर / क्लर्क", "Junior Auditor", "hp-allied", 0xFF1E3A8A, 0xFFEFF6FF, Icons.Outlined.Calculate, listOf("clerk", "auditor")),
        TestRow("hp-police", "पुलिस कांस्टेबल", "HP Police", "hp-police", 0xFF0369A1, 0xFFF0F9FF, Icons.Outlined.MilitaryTech, listOf("constable")),
        TestRow("hp-jail", "जेल वार्डर", "Jail Warder", "hp-police", 0xFF0369A1, 0xFFF0F9FF, Icons.Outlined.Lock),
        TestRow("hp-home-guard", "होम गार्ड स्टाफ", "Home Guards", "hp-police", 0xFF0369A1, 0xFFF0F9FF, Icons.Outlined.Shield),
        TestRow("hp-tet", "हिमाचल टीईटी", "HP TET", "hp-teach", 0xFF6D28D9, 0xFFF5F3FF, Icons.Outlined.Badge, listOf("tet")),
        TestRow("hp-pgt", "स्कूल लेक्चरर (PGT)", "HP PGT", "hp-teach", 0xFF6D28D9, 0xFFF5F3FF, Icons.Outlined.School, listOf("pgt", "lecturer")),
        TestRow("hp-tgt", "टीजीटी शिक्षक", "HP TGT", "hp-teach", 0xFF6D28D9, 0xFFF5F3FF, Icons.Outlined.School, listOf("tgt")),
        TestRow("hp-jbt", "जेबीटी / एनटीटी", "JBT / NTT", "hp-teach", 0xFF6D28D9, 0xFFF5F3FF, Icons.Outlined.ChildCare, listOf("jbt", "ntt")),
        TestRow("hp-prof", "असिस्टेंट प्रोफेसर", "College Cadre", "hp-teach", 0xFF6D28D9, 0xFFF5F3FF, Icons.Outlined.Work),
        TestRow("hp-patwari", "हिमाचल पटवारी", "HP Patwari", "hp-rev", 0xFF15803D, 0xFFF0FDF4, Icons.Outlined.Map, listOf("patwari")),
        TestRow("hp-forest-guard", "वन रक्षक", "Forest Guard", "hp-rev", 0xFF15803D, 0xFFF0FDF4, Icons.Outlined.Forest),
        TestRow("hp-je", "जूनियर इंजीनियर", "HP JE", "hp-rev", 0xFFC2410C, 0xFFFFF7ED, Icons.Outlined.Settings, listOf("je")),
        TestRow("hpseb", "बिजली बोर्ड लाइनमैन", "HPSEB Staff", "hp-rev", 0xFFC2410C, 0xFFFFF7ED, Icons.Outlined.Bolt, listOf("hpseb", "lineman")),
        TestRow("hp-mo", "मेडिकल ऑफिसर", "Medical Officer", "hp-court", 0xFF334155, 0xFFF8FAFC, Icons.Outlined.LocalHospital),
        TestRow("hp-nurse", "स्टाफ नर्स / एएनएम", "HP Staff Nurse", "hp-court", 0xFF334155, 0xFFF8FAFC, Icons.Outlined.VolunteerActivism, listOf("nurse", "anm")),
        TestRow("hp-hc-clerk", "हाई कोर्ट क्लर्क", "HP High Court", "hp-court", 0xFF334155, 0xFFF8FAFC, Icons.Outlined.Gavel, listOf("high court")),
        TestRow("hp-ado", "कृषि / बागवानी अधिकारी", "ADO / HDO", "hp-misc", 0xFFC2410C, 0xFFFFF7ED, Icons.Outlined.Eco, listOf("agriculture", "horticulture")),
        TestRow("hp-hrtc", "एचआरटीसी कंडक्टर", "HRTC Exam", "hp-misc", 0xFF1E3A8A, 0xFFEFF6FF, Icons.Outlined.BusAlert, listOf("hrtc", "conductor")),
        TestRow("hp-vet", "पशुपालन फार्मासिस्ट", "Vet Pharmacist", "hp-misc", 0xFF334155, 0xFFF8FAFC, Icons.Outlined.LocalHospital),
        TestRow("hp-stats", "सांख्यिकी सहायक", "Statistical Asst.", "hp-misc", 0xFF15803D, 0xFFF0FDF4, Icons.Outlined.Calculate),
    )

    private val sectionBySlug = sections.associateBy { it.slug }

    fun isHimachalStateLabel(label: String): Boolean =
        IndianStateVisualCatalog.resolveSlug(label, null) == "hp"

    fun iconKeyForSlug(slug: String): String = "hp:${slug.trim().lowercase(Locale.US)}"

    fun sectionOrder(): List<String> = sections.map { it.slug }

    fun resolveSectionSlug(level3Label: String): String {
        val slug = resolveTestSlug(level3Label, null)
        if (slug != null) {
            return tests.firstOrNull { it.slug == slug }?.sectionSlug ?: "hp-gk"
        }
        val key = normalizeKey(level3Label)
        return when {
            key.contains("gk") || key.contains("history") || key.contains("geography") -> "hp-gk"
            key.contains("hpas") || key.contains("judicial") || key.contains("tehsildar") -> "hp-admin"
            key.contains("allied") || key.contains("joa") -> "hp-allied"
            key.contains("police") || key.contains("jail") || key.contains("home guard") -> "hp-police"
            key.contains("tet") || key.contains("tgt") || key.contains("pgt") || key.contains("teacher") -> "hp-teach"
            key.contains("patwari") || key.contains("forest") || key.contains("je") || key.contains("hpseb") -> "hp-rev"
            key.contains("medical") || key.contains("nurse") || key.contains("court") -> "hp-court"
            else -> "hp-misc"
        }
    }

    fun sectionVisual(sectionSlug: String): SectionVisual {
        val row = sectionBySlug[sectionSlug] ?: sectionBySlug["hp-gk"]!!
        return SectionVisual(row.slug, row.titleHindi, Color(row.accent), Color(row.hover), row.icon)
    }

    fun findTestVisual(level3Label: String, iconKey: String? = null): TestVisual? {
        val slug = resolveTestSlug(level3Label, iconKey) ?: return null
        val row = tests.firstOrNull { it.slug == slug } ?: return null
        return toTestVisual(row)
    }

    fun defaultTestVisual(level3Label: String): TestVisual {
        val sectionSlug = resolveSectionSlug(level3Label)
        val section = sectionBySlug[sectionSlug] ?: sectionBySlug["hp-gk"]!!
        val name = level3Label.trim().ifBlank { "Mock Test" }
        return TestVisual(
            slug = "custom",
            hindiName = name,
            subLabel = name.uppercase(Locale.US),
            sectionSlug = sectionSlug,
            iconColor = Color(section.accent),
            hoverBackground = Color(section.hover),
            icon = Icons.Outlined.Star,
        )
    }

    data class CatalogTestSeed(
        val catalogSlug: String,
        val applyTestName: String,
        val sectionSlug: String,
        val iconKey: String,
    )

    fun catalogTestSeeds(): List<CatalogTestSeed> = tests.map { row ->
        CatalogTestSeed(
            catalogSlug = row.slug,
            applyTestName = row.hindiName,
            sectionSlug = row.sectionSlug,
            iconKey = iconKeyForSlug(row.slug),
        )
    }

    fun matchCatalogSlug(level3Label: String, iconKey: String? = null): String? =
        resolveTestSlug(level3Label, iconKey)

    fun resolveAutoIconKey(level1: String, level2: String, level3: String, iconKey: String?): String? {
        val existing = iconKey?.trim().orEmpty()
        if (existing.startsWith("http://", ignoreCase = true) || existing.startsWith("https://", ignoreCase = true)) {
            return existing
        }
        if (existing.startsWith("hp:", ignoreCase = true)) return existing
        if (!IndianStateVisualCatalog.isStateExamLevel1(level1) || !isHimachalStateLabel(level2)) {
            return existing.takeIf { it.isNotBlank() }
        }
        val slug = resolveTestSlug(level3, existing) ?: return existing.takeIf { it.isNotBlank() }
        return iconKeyForSlug(slug)
    }

    private fun resolveTestSlug(level3Label: String, iconKey: String?): String? {
        parseSlugFromIconKey(iconKey)?.let { return it }
        val key = normalizeKey(level3Label)
        if (key.isBlank()) return null
        for (row in tests) {
            if (key == normalizeKey(row.subLabel) || key == normalizeKey(row.hindiName)) return row.slug
            for (alias in row.aliases) {
                if (key.contains(normalizeKey(alias))) return row.slug
            }
        }
        return null
    }

    private fun parseSlugFromIconKey(iconKey: String?): String? {
        val raw = iconKey?.trim()?.lowercase(Locale.US).orEmpty()
        if (!raw.startsWith("hp:")) return null
        val slug = raw.removePrefix("hp:").trim()
        return slug.takeIf { tests.any { it.slug == slug } }
    }

    private fun toTestVisual(row: TestRow): TestVisual = TestVisual(
        slug = row.slug,
        hindiName = row.hindiName,
        subLabel = row.subLabel,
        sectionSlug = row.sectionSlug,
        iconColor = Color(row.accent),
        hoverBackground = Color(row.hover),
        icon = row.icon,
    )

    private fun normalizeKey(value: String): String =
        value.trim()
            .lowercase(Locale.US)
            .replace("&", " and ")
            .replace(Regex("[^a-z0-9\\u0900-\\u097F\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
}
