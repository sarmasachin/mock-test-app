package com.example.mocktestapp.newui.news

data class ManualNewsItem(
    val id: String,
    val headline: String,
    val summary: String,
    val category: String,
    val dateLabel: String,
    val body: String,
)

/** Stable image per item; [seedPrefix] groups pics so job/exam/news feeds look distinct. */
fun ManualNewsItem.imageUrl(
    width: Int = 1080,
    height: Int = 608,
    seedPrefix: String = "mocktest_news",
): String = "https://picsum.photos/seed/${seedPrefix}_${id}/$width/$height"

private const val NewsPageSize = 10

object ManualNewsContent {
    val items: List<ManualNewsItem> = buildList {
        add(
            ManualNewsItem(
                id = "1",
                headline = "Bihar STET 2025: registration window extended",
                summary = "One-week extension for payment and uploads; admit cards follow the usual timeline.",
                category = "Board notice",
                dateLabel = "11 Apr 2026",
                body = "Registration for Secondary Teacher Eligibility Test has been extended by one week. " +
                    "Candidates who missed the earlier deadline can complete payment and upload documents " +
                    "before the new last date. Admit cards will release 10 days before the exam.\n\n" +
                    "Keep checking the official bulletin so your mock schedule matches the final date sheet.",
            ),
        )
        add(
            ManualNewsItem(
                id = "2",
                headline = "UPPSC releases revised syllabus for combined state services",
                summary = "Topic-wise GS changes are out — download the PDF and realign your practice tests.",
                category = "Syllabus",
                dateLabel = "9 Apr 2026",
                body = "The commission has published topic-wise changes for General Studies papers. " +
                    "Aspirants should download the PDF from the official site and align mock tests accordingly.\n\n" +
                    "We recommend mapping each removed/added topic to at least one mini quiz this month.",
            ),
        )
        add(
            ManualNewsItem(
                id = "3",
                headline = "Scholarship: Central Sector Scheme — income bracket update",
                summary = "Eligibility bands shifted; renewals open next Monday on the national portal.",
                category = "Scholarship",
                dateLabel = "5 Apr 2026",
                body = "Income eligibility for the Central Sector Scheme of Scholarships for College " +
                    "Students has been updated. Renewal applications open next Monday on the national portal.\n\n" +
                    "Document income proofs carefully — mismatches are the most common rejection reason.",
            ),
        )
        add(
            ManualNewsItem(
                id = "4",
                headline = "Mock test tip: time-box weak topics this week",
                summary = "Twenty-five minutes per weak chapter, then one full timed paper on the weekend.",
                category = "Study tip",
                dateLabel = "3 Apr 2026",
                body = "Spend 25 minutes per subject on your lowest three chapters, then one full-length " +
                    "timed paper on the weekend. Review mistakes same day — retention improves sharply.\n\n" +
                    "If your app tracks attempts, compare this week’s average against last week’s best score.",
            ),
        )
        val extraCats = listOf("Board notice", "Syllabus", "Study tip", "Scholarship")
        for (n in 5..22) {
            add(
                ManualNewsItem(
                    id = "$n",
                    headline = "Education bulletin #$n: schedules, portals & deadlines",
                    summary = "Demo feed item $n — swap for CMS/API when your admin panel is ready.",
                    category = extraCats[n % extraCats.size],
                    dateLabel = "${(28 - (n % 18)).coerceAtLeast(1)} Mar 2026",
                    body = "Official notices change often — verify on the commission website. " +
                        "This is placeholder copy for item $n so pagination and detail screens can be tested.",
                ),
            )
        }
    }

    fun itemById(id: String): ManualNewsItem? = items.find { it.id == id }
}

internal const val FeedBrowsePageSize = NewsPageSize
