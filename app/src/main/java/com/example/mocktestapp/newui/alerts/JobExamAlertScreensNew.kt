package com.example.mocktestapp.newui.alerts

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.WorkOutline
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.example.mocktestapp.data.ContentRepository
import androidx.compose.ui.Modifier
import com.example.mocktestapp.newui.feeds.WebFeedDefaults
import com.example.mocktestapp.newui.news.FeedBrowseScreenNew
import com.example.mocktestapp.newui.news.ManualNewsItem

const val JobAlertFeedImageSeedPrefix = "mocktest_job"
const val ExamAlertFeedImageSeedPrefix = "mocktest_exam"

object ManualJobAlertContent {
    val items: List<ManualNewsItem> = buildList {
        add(
            ManualNewsItem(
                id = "j1",
                headline = "Railway apprentice recruitment — CBT schedule out",
                summary = "Phase-1 city intimation live; carry ID proof and admit card as per notice.",
                category = "Central PSU",
                dateLabel = "10 Apr 2026, 10:20 AM",
                body = "Computer-based tests are being conducted in multiple phases. Download your city " +
                    "intimation slip and verify photograph/signature on the admit card.\n\n" +
                    "Always cross-check deadlines on the official employer portal.\n\n" +
                    "Reference portal (replace with your CMS later): ${WebFeedDefaults.JOB_URL}",
            ),
        )
        add(
            ManualNewsItem(
                id = "j2",
                headline = "State health department: staff nurse walk-in interviews",
                summary = "District-wise panels published; reporting time and document checklist updated.",
                category = "State govt",
                dateLabel = "8 Apr 2026, 02:10 PM",
                body = "Walk-in interviews are scheduled across districts. Carry original certificates plus " +
                    "self-attested copies exactly as listed in the official PDF.\n\n" +
                    "Reference portal (replace with your CMS later): ${WebFeedDefaults.JOB_URL}",
            ),
        )
        add(
            ManualNewsItem(
                id = "j3",
                headline = "Teaching fellowships — online application correction window",
                summary = "48-hour window for photo/signature correction; fee already paid will carry forward.",
                category = "Education",
                dateLabel = "6 Apr 2026, 09:35 AM",
                body = "Use the correction window only for technical issues with uploads. Profile fields " +
                    "locked after submission except where the notice explicitly allows edits.\n\n" +
                    "Reference portal (replace with your CMS later): ${WebFeedDefaults.JOB_URL}",
            ),
        )
        val tags = listOf("Central PSU", "State govt", "Contract", "Faculty", "Police / defence")
        for (n in 4..22) {
            add(
                ManualNewsItem(
                    id = "j$n",
                    headline = "Job bulletin #$n: vacancies, walk-ins & contract posts",
                    summary = "Demo listing $n — wire your HR feed or scraper when backend is ready.",
                    category = tags[n % tags.size],
                    dateLabel = "${(26 - (n % 16)).coerceAtLeast(1)} Mar 2026, ${String.format("%02d", 8 + (n % 10))}:${if (n % 2 == 0) "15" else "40"} ${if ((n % 3) == 0) "PM" else "AM"}",
                    body = "Verify every date and eligibility clause on the official advertisement PDF. " +
                        "This placeholder text exists so pagination and detail screens match the News layout.\n\n" +
                        "Reference portal (replace with your CMS later): ${WebFeedDefaults.JOB_URL}",
                ),
            )
        }
    }

    fun itemById(id: String): ManualNewsItem? = items.find { it.id == id }
}

object ManualExamAlertContent {
    val items: List<ManualNewsItem> = buildList {
        add(
            ManualNewsItem(
                id = "e1",
                headline = "Combined graduate level — tier-II admit card release",
                summary = "Download window opens 7 days before exam; check paper code and shift timing.",
                category = "National exam",
                dateLabel = "11 Apr 2026, 11:05 AM",
                body = "Tier-II will run in multiple shifts. Verify paper code, medium of examination, " +
                    "and reporting time on the admit card. Reach the centre early for frisking.\n\n" +
                    "Reference portal (replace with your CMS later): ${WebFeedDefaults.EXAM_URL}",
            ),
        )
        add(
            ManualNewsItem(
                id = "e2",
                headline = "State eligibility test — revised exam city list",
                summary = "Some centres merged; reprint admit card if your venue code changed.",
                category = "State exam",
                dateLabel = "9 Apr 2026, 01:25 PM",
                body = "Centre changes are published as an addendum. If your venue code changed, " +
                    "download a fresh admit card and plan travel accordingly.\n\n" +
                    "Reference portal (replace with your CMS later): ${WebFeedDefaults.EXAM_URL}",
            ),
        )
        add(
            ManualNewsItem(
                id = "e3",
                headline = "Engineering services — personality test call letter",
                summary = "Shortlisted candidates must upload undertakings before the PT window closes.",
                category = "Technical",
                dateLabel = "5 Apr 2026, 08:45 AM",
                body = "Personality tests run in batches. Upload required undertakings in the candidate " +
                    "portal before the deadline shown on your call letter.\n\n" +
                    "Reference portal (replace with your CMS later): ${WebFeedDefaults.EXAM_URL}",
            ),
        )
        val tags = listOf("National exam", "State exam", "Board exam", "Entrance", "Technical")
        for (n in 4..22) {
            add(
                ManualNewsItem(
                    id = "e$n",
                    headline = "Exam bulletin #$n: dates, shifts & admit cards",
                    summary = "Demo notice $n — connect to your exam calendar API when available.",
                    category = tags[n % tags.size],
                    dateLabel = "${(25 - (n % 15)).coerceAtLeast(1)} Mar 2026, ${String.format("%02d", 7 + (n % 11))}:${if (n % 2 == 0) "10" else "50"} ${if ((n % 4) == 0) "PM" else "AM"}",
                    body = "Exam schedules change; confirm on the commission website. Placeholder copy for " +
                        "item $n mirrors the News feed so UI and pagination stay consistent.\n\n" +
                        "Reference portal (replace with your CMS later): ${WebFeedDefaults.EXAM_URL}",
                ),
            )
        }
    }

    fun itemById(id: String): ManualNewsItem? = items.find { it.id == id }
}

@Composable
fun JobAlertScreenNew(
    onBack: () -> Unit,
    onOpenListing: (id: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var items by remember { mutableStateOf(ManualJobAlertContent.items) }
    LaunchedEffect(Unit) {
        items = ContentRepository.loadNewsFeed("job")
    }
    FeedBrowseScreenNew(
        title = "Job alert",
        subtitle = "",
        listSectionTitle = "",
        listSectionSubtitle = "",
        feedIcon = Icons.Rounded.WorkOutline,
        items = items,
        imageSeedPrefix = JobAlertFeedImageSeedPrefix,
        onBack = onBack,
        onOpenItem = onOpenListing,
        modifier = modifier,
    )
}

@Composable
fun ExamAlertScreenNew(
    onBack: () -> Unit,
    onOpenListing: (id: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var items by remember { mutableStateOf(ManualExamAlertContent.items) }
    LaunchedEffect(Unit) {
        items = ContentRepository.loadNewsFeed("exam")
    }
    FeedBrowseScreenNew(
        title = "Exam alert",
        subtitle = "",
        listSectionTitle = "",
        listSectionSubtitle = "",
        feedIcon = Icons.Rounded.CalendarMonth,
        items = items,
        imageSeedPrefix = ExamAlertFeedImageSeedPrefix,
        onBack = onBack,
        onOpenItem = onOpenListing,
        modifier = modifier,
    )
}
