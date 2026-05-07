package com.freemocktest.app.newui.bookmarks

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.data.AppPreferencesRepository
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import java.time.LocalDate
import java.time.LocalTime
import java.time.Period
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.Locale

private data class AgeCalcResult(
    val ymdText: String,
    val ymwdhmText: String,
    val ydText: String,
)

private fun isValidIsoDate(value: String): Boolean {
    val raw = value.trim()
    if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(raw)) return false
    return try {
        LocalDate.parse(raw)
        true
    } catch (_: DateTimeParseException) {
        false
    }
}

private fun formatDateForUi(iso: String): String {
    val raw = iso.trim()
    if (!isValidIsoDate(raw)) return raw
    return runCatching {
        LocalDate.parse(raw).format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH))
    }.getOrDefault(raw)
}

private fun computeAgeResult(dob: LocalDate, onDate: LocalDate): AgeCalcResult {
    // Use an anchor-date method so Y/M/D never drift:
    // yearsComplete = full years since DOB
    // months/days = remainder after adding full years
    val yearsComplete = ChronoUnit.YEARS.between(dob, onDate).coerceAtLeast(0).toInt()
    val anchorAfterYears = dob.plusYears(yearsComplete.toLong())
    val remAfterYears = Period.between(anchorAfterYears, onDate)
    val y = yearsComplete
    val m = remAfterYears.months.coerceAtLeast(0)
    val d = remAfterYears.days.coerceAtLeast(0)

    val totalDays = ChronoUnit.DAYS.between(dob, onDate).coerceAtLeast(0)
    val daysAfterYears = ChronoUnit.DAYS.between(anchorAfterYears, onDate).coerceAtLeast(0)

    // Totals (so values don't appear as 0 unless truly 0).
    val totalWeeks = (totalDays / 7).coerceAtLeast(0)
    val totalMonths = ChronoUnit.MONTHS.between(dob, onDate).coerceAtLeast(0)

    // User selects a DATE only (no time). We assume start-of-day for both; for "today" add current minutes-of-day.
    val minutesOfDay =
        if (onDate == LocalDate.now()) {
            LocalTime.now().let { it.hour * 60L + it.minute.toLong() }
        } else {
            0L
        }
    val totalMinutes = totalDays * 24L * 60L + minutesOfDay
    val totalHours = totalMinutes / 60L

    return AgeCalcResult(
        ymdText = "$y Years / $m Months / $d Days",
        ymwdhmText = "$y Years / $totalMonths Months / $totalWeeks week / $totalDays Days / $totalHours hours / $totalMinutes minute",
        ydText = "$y Years / $daysAfterYears Days",
    )
}

@Composable
internal fun AgeCalculatorToolCard(
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val shape = RoundedCornerShape(22.dp)
    val scroll = rememberScrollState()
    val context = LocalContext.current

    var dobIso by remember { mutableStateOf("") }
    var dobManuallySet by remember { mutableStateOf(false) }
    var onDateIso by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<AgeCalcResult?>(null) }
    var lastAutoKey by remember { mutableStateOf("") }
    val profile by AppPreferencesRepository.editableProfile.collectAsState(
        initial = AppPreferencesRepository.EditableProfileState("", "", "", "", ""),
    )

    LaunchedEffect(Unit) {
        onDateIso = LocalDate.now().toString()
    }
    LaunchedEffect(profile.birthdayDate) {
        if (dobManuallySet) return@LaunchedEffect
        val fromProfile = profile.birthdayDate.trim()
        if (fromProfile.isBlank()) {
            dobIso = ""
            return@LaunchedEffect
        }
        if (isValidIsoDate(fromProfile)) {
            val parsed = runCatching { LocalDate.parse(fromProfile) }.getOrNull()
            if (parsed != null && !parsed.isAfter(LocalDate.now())) {
                dobIso = parsed.toString()
                error = ""
                result = null
            }
        }
    }

    // Auto-calculate whenever DOB + calculate-date are valid and consistent.
    // This fulfills: "DOB set hote hi result auto me show".
    LaunchedEffect(dobIso, onDateIso) {
        val dobStr = dobIso.trim()
        val onStr = onDateIso.trim()
        if (dobStr.isBlank() || onStr.isBlank()) {
            // Keep placeholders at top; no auto result.
            error = ""
            result = null
            lastAutoKey = ""
            return@LaunchedEffect
        }
        if (!isValidIsoDate(dobStr) || !isValidIsoDate(onStr)) {
            error = "Please select valid dates"
            result = null
            lastAutoKey = ""
            return@LaunchedEffect
        }
        val dob = runCatching { LocalDate.parse(dobStr) }.getOrNull() ?: return@LaunchedEffect
        val onDate = runCatching { LocalDate.parse(onStr) }.getOrNull() ?: return@LaunchedEffect
        if (dob.isAfter(LocalDate.now())) {
            error = "DOB cannot be in the future"
            result = null
            lastAutoKey = ""
            return@LaunchedEffect
        }
        if (onDate.isBefore(dob)) {
            error = "Calculate date cannot be before DOB"
            result = null
            lastAutoKey = ""
            return@LaunchedEffect
        }

        val key = "${dob}_$onDate"
        if (key == lastAutoKey) return@LaunchedEffect
        lastAutoKey = key
        error = ""
        result = computeAgeResult(dob, onDate)
    }

    fun openDatePicker(
        initial: LocalDate,
        onPicked: (LocalDate) -> Unit,
    ) {
        DatePickerDialog(
            context,
            { _, y, m, d ->
                val picked = runCatching { LocalDate.of(y, m + 1, d) }.getOrNull() ?: return@DatePickerDialog
                onPicked(picked)
            },
            initial.year,
            initial.monthValue - 1,
            initial.dayOfMonth,
        ).show()
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(p.surface)
            .border(1.dp, p.border.copy(alpha = 0.16f), shape)
            .verticalScroll(scroll)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Result at top (as requested) — separated lines/blocks.
        val resultShape = RoundedCornerShape(16.dp)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(resultShape)
                .background(p.surfaceElevated)
                .border(1.dp, p.border.copy(alpha = 0.14f), resultShape)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = result?.ymdText ?: "Years / Months / Days",
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(p.border.copy(alpha = 0.16f)),
            )
            Text(
                text = result?.ymwdhmText ?: "Years / Months /week / Days/ hours / minute",
                color = p.textPrimary.copy(alpha = 0.92f),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(p.border.copy(alpha = 0.16f)),
            )
            Text(
                text = result?.ydText ?: "Years/ Days",
                color = p.textPrimary.copy(alpha = 0.92f),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Spacer(Modifier.height(6.dp))

        val fieldColors = TextFieldDefaults.colors(
            focusedTextColor = p.textPrimary,
            unfocusedTextColor = p.textPrimary,
            focusedContainerColor = p.surfaceElevated,
            unfocusedContainerColor = p.surfaceElevated,
            focusedIndicatorColor = p.accent,
            unfocusedIndicatorColor = p.border.copy(alpha = 0.35f),
            cursorColor = p.accent,
            focusedLabelColor = p.accent,
            unfocusedLabelColor = p.textSecondary,
        )

        OutlinedTextField(
            value = if (dobIso.isBlank()) "" else formatDateForUi(dobIso),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text("Date of birth (DOB)") },
            placeholder = { Text("Select DOB") },
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    val init = runCatching {
                        if (isValidIsoDate(dobIso)) LocalDate.parse(dobIso) else LocalDate.now().minusYears(18)
                    }.getOrElse { LocalDate.now().minusYears(18) }
                    openDatePicker(init) { picked ->
                        if (picked.isAfter(LocalDate.now())) {
                            error = "DOB cannot be in the future"
                            result = null
                        } else {
                            dobIso = picked.toString()
                            dobManuallySet = true
                            error = ""
                            result = null
                            lastAutoKey = ""
                        }
                    }
                },
            colors = fieldColors,
            shape = RoundedCornerShape(12.dp),
        )
        OutlinedButton(
            onClick = {
                val init = runCatching {
                    if (isValidIsoDate(dobIso)) LocalDate.parse(dobIso) else LocalDate.now().minusYears(18)
                }.getOrElse { LocalDate.now().minusYears(18) }
                openDatePicker(init) { picked ->
                    if (picked.isAfter(LocalDate.now())) {
                        error = "DOB cannot be in the future"
                        result = null
                    } else {
                        dobIso = picked.toString()
                        dobManuallySet = true
                        error = ""
                        result = null
                        lastAutoKey = ""
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text("Set DOB", fontWeight = FontWeight.SemiBold)
        }

        OutlinedTextField(
            value = if (onDateIso.isBlank()) "" else formatDateForUi(onDateIso),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text("Calculate on date") },
            placeholder = { Text("Select date") },
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    val init = runCatching {
                        if (isValidIsoDate(onDateIso)) LocalDate.parse(onDateIso) else LocalDate.now()
                    }.getOrElse { LocalDate.now() }
                    openDatePicker(init) { picked ->
                        onDateIso = picked.toString()
                        error = ""
                        result = null
                        lastAutoKey = ""
                    }
                },
            colors = fieldColors,
            shape = RoundedCornerShape(12.dp),
        )
        OutlinedButton(
            onClick = {
                val init = runCatching {
                    if (isValidIsoDate(onDateIso)) LocalDate.parse(onDateIso) else LocalDate.now()
                }.getOrElse { LocalDate.now() }
                openDatePicker(init) { picked ->
                    onDateIso = picked.toString()
                    error = ""
                    result = null
                    lastAutoKey = ""
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text("Select date", fontWeight = FontWeight.SemiBold)
        }

        if (error.isNotBlank()) {
            Text(
                text = error,
                color = p.error,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
            )
        }

        Button(
            onClick = {
                error = ""
                result = null

                val dobStr = dobIso.trim()
                val onStr = onDateIso.trim().ifBlank { LocalDate.now().toString() }
                if (!isValidIsoDate(dobStr)) {
                    error = "Please select DOB"
                    return@Button
                }
                if (!isValidIsoDate(onStr)) {
                    error = "Please select a valid date"
                    return@Button
                }
                val dob = LocalDate.parse(dobStr)
                val onDate = LocalDate.parse(onStr)
                if (dob.isAfter(LocalDate.now())) {
                    error = "DOB cannot be in the future"
                    return@Button
                }
                if (onDate.isBefore(dob)) {
                    error = "Calculate date cannot be before DOB"
                    return@Button
                }

                result = computeAgeResult(dob, onDate)
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = p.accent),
            enabled = dobIso.isNotBlank() && onDateIso.isNotBlank(),
        ) {
            Text("Calculate", color = Color.White, fontWeight = FontWeight.SemiBold)
        }
    }
}

