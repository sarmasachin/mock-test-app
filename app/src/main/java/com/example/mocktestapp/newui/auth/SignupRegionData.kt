package com.example.mocktestapp.newui.auth

/**
 * Demo lists for signup autocomplete. Replace with API / room DB for production.
 */
object SignupRegionData {
    val indianStates: List<String> = listOf(
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

    fun districtsForState(state: String): List<String> {
        if (state.isBlank()) return emptyList()
        val key = indianStates.firstOrNull { it.equals(state, ignoreCase = true) } ?: return emptyList()
        return (districtSamples[key] ?: listOf("Other / Not listed")).sorted()
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
