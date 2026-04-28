package com.freemocktest.app.data

import com.freemocktest.app.data.remote.AuthUserDto

/** Google / partial accounts until phone + Indian region are saved. */
fun AuthUserDto.needsProfileCompletion(): Boolean {
    val digits = phone.trim().filter { it.isDigit() }.take(10)
    val st = (signupState ?: "").trim()
    val dist = (signupDistrict ?: "").trim()
    return digits.length != 10 || st.isBlank() || dist.isBlank()
}
