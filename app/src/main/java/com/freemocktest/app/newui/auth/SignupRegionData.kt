package com.freemocktest.app.newui.auth

/**
 * Demo lists for signup autocomplete. Replace with API / room DB for production.
 */
object SignupRegionData {
    private val builtinStates: List<String> = listOf(
        "Andhra Pradesh",
        "Arunachal Pradesh",
        "Assam",
        "Bihar",
        "Chhattisgarh",
        "Delhi",
        "Goa",
        "Gujarat",
        "Haryana",
        "Himachal Pradesh",
        "Jharkhand",
        "Karnataka",
        "Kerala",
        "Madhya Pradesh",
        "Maharashtra",
        "Manipur",
        "Meghalaya",
        "Mizoram",
        "Nagaland",
        "Odisha",
        "Punjab",
        "Rajasthan",
        "Sikkim",
        "Tamil Nadu",
        "Telangana",
        "Tripura",
        "Uttar Pradesh",
        "Uttarakhand",
        "West Bengal",
    ).sorted()

    @Volatile
    private var adminRegionMap: Map<String, List<String>> = emptyMap()

    val indianStates: List<String>
        get() = (builtinStates + adminRegionMap.keys.toList())
            .distinctBy { it.lowercase() }
            .sortedBy { it.lowercase() }

    fun replaceFromAdmin(items: List<Pair<String, List<String>>>) {
        if (items.isEmpty()) {
            adminRegionMap = emptyMap()
            return
        }
        val next = linkedMapOf<String, List<String>>()
        for ((stateRaw, districtsRaw) in items) {
            val state = stateRaw.trim()
            if (state.isBlank()) continue
            val districts = districtsRaw.map { it.trim() }.filter { it.isNotBlank() }.distinctBy { it.lowercase() }
            // Admin is the source of truth. If admin removes "Other / Not listed", the app must not
            // re-add it implicitly.
            next[state] = districts
        }
        adminRegionMap = next
    }

    fun districtsForState(state: String): List<String> {
        if (state.isBlank()) return emptyList()
        val key = indianStates.firstOrNull { it.equals(state, ignoreCase = true) } ?: return emptyList()
        val adminEntry = adminRegionMap.entries.firstOrNull { it.key.equals(key, ignoreCase = true) }
        if (adminEntry != null) {
            val adminDistricts = adminEntry.value.distinctBy { it.lowercase() }.sortedBy { it.lowercase() }
            if (adminDistricts.isNotEmpty()) return adminDistricts
            // Admin added the state but no districts yet — fall back to built-in samples so signup is not blocked.
        }
        val base = (districtSamples[key] ?: emptyList())
        return base.distinctBy { it.lowercase() }.sortedBy { it.lowercase() }
    }

    private val districtSamples: Map<String, List<String>> = mapOf(
        "Uttar Pradesh" to listOf("Lucknow", "Kanpur", "Varanasi", "Agra", "Prayagraj", "Ghaziabad", "Noida", "Meerut"),
        "Bihar" to listOf("Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia"),
        "Delhi" to listOf("New Delhi", "North Delhi", "South Delhi", "East Delhi", "West Delhi"),
        "Maharashtra" to listOf("Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad"),
        "Karnataka" to listOf("Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi"),
        "Rajasthan" to listOf("Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner"),
        "West Bengal" to listOf("Kolkata", "Howrah", "Darjeeling", "Siliguri", "Durgapur"),
        "Tamil Nadu" to listOf("Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli"),
        "Gujarat" to listOf("Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar"),
        "Madhya Pradesh" to listOf("Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"),
        "Punjab" to listOf("Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda"),
        "Haryana" to listOf("Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar"),
        "Telangana" to listOf("Hyderabad", "Warangal", "Nizamabad", "Karimnagar"),
        "Kerala" to listOf("Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur"),
        "Assam" to listOf("Guwahati", "Silchar", "Dibrugarh", "Jorhat"),
        "Odisha" to listOf("Bhubaneswar", "Cuttack", "Rourkela", "Sambalpur"),
    )
}
