package com.freemocktest.app.newui.news



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
    val items: List<ManualNewsItem> = emptyList()



    fun itemById(id: String): ManualNewsItem? = items.find { it.id == id }

}



internal const val FeedBrowsePageSize = NewsPageSize

