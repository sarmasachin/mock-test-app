package com.freemocktest.app.newui.bookmarks

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freemocktest.app.newui.theme.palette.mockTestPalette
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

private val isoBirthdayPattern = Regex("^\\d{4}-\\d{2}-\\d{2}$")

internal fun parseIsoBirthdayDate(raw: String): LocalDate? {
    val s = raw.trim()
    if (s.isEmpty() || !isoBirthdayPattern.matches(s)) return null
    return runCatching { LocalDate.parse(s) }.getOrNull()
}

/** @return null if birth is after [end] (invalid for age). */
internal fun periodYearsMonthsDaysSafe(birth: LocalDate, end: LocalDate = LocalDate.now()): Period? {
    if (birth.isAfter(end)) return null
    return Period.between(birth, end)
}

/**
 * Main line: calendar [Period] with unit names capitalised.
 * Parentheses: same year count, then total **calendar days** from `birth + years` to [end]
 * (remainder after full years), e.g. `26 Years, 3 Months, 24 Days (26 years, 114 Days)`.
 */
internal fun formatAgeDisplay(birth: LocalDate, end: LocalDate = LocalDate.now()): String? {
    if (birth.isAfter(end)) return null
    val period = Period.between(birth, end)
    val afterFullYears = birth.plusYears(period.years.toLong())
    val remainderDays = ChronoUnit.DAYS.between(afterFullYears, end)
    return "${period.years} Years, ${period.months} Months, ${period.days} Days (${period.years} years, $remainderDays Days)"
}

private fun displayDate(d: LocalDate): String =
    d.format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault()))

private fun localDateToPickerMillis(d: LocalDate): Long =
    d.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()

private fun pickerMillisToLocalDate(millis: Long): LocalDate =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalculatorToolSection(
    profileBirthdayIso: String,
    modifier: Modifier = Modifier,
) {
    val p = mockTestPalette()
    val cardShape = RoundedCornerShape(22.dp)
    val scroll = rememberScrollState()
    var showDatePicker by remember { mutableStateOf(false) }
    var calculatorBirthMillis by remember(profileBirthdayIso) {
        mutableStateOf(
            parseIsoBirthdayDate(profileBirthdayIso)?.let { localDateToPickerMillis(it) }
                ?: localDateToPickerMillis(LocalDate.now().minusYears(20)),
        )
    }

    val profileBirth = remember(profileBirthdayIso) { parseIsoBirthdayDate(profileBirthdayIso) }
    val profilePeriod = remember(profileBirth) { profileBirth?.let { periodYearsMonthsDaysSafe(it) } }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(scroll)
            .padding(bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(cardShape)
                .border(1.dp, p.border.copy(alpha = 0.16f), cardShape)
                .background(p.surface)
                .padding(18.dp),
        ) {
            Text(
                text = "Your profile age",
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            when {
                profileBirth == null && profileBirthdayIso.isBlank() -> {
                    Text(
                        text = "Save your date of birth in Profile to see your age here automatically.",
                        color = p.textSecondary,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                }
                profileBirth == null -> {
                    Text(
                        text = "Saved date of birth could not be read. Please set it again in Profile (use YYYY-MM-DD).",
                        color = p.error,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                }
                profilePeriod == null -> {
                    Text(
                        text = "Saved date of birth is in the future. Update it in Profile.",
                        color = p.error,
                        fontSize = 14.sp,
                    )
                }
                else -> {
                    Text(
                        text = "Date of birth: ${displayDate(profileBirth)}",
                        color = p.textSecondary,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = formatAgeDisplay(profileBirth, LocalDate.now()).orEmpty(),
                        color = p.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(cardShape)
                .border(1.dp, p.border.copy(alpha = 0.16f), cardShape)
                .background(p.surface)
                .padding(18.dp),
        ) {
            Text(
                text = "Age calculator",
                color = p.textPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Pick any birth date (not after today). Age shows as years, months, days, plus extra days after full years in brackets.",
                color = p.textSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            Spacer(Modifier.height(12.dp))

            val calcDate = remember(calculatorBirthMillis) {
                calculatorBirthMillis?.let { runCatching { pickerMillisToLocalDate(it) }.getOrNull() }
            }
            val todayCalc = LocalDate.now()
            val calcAgeLine = remember(calcDate, todayCalc) {
                calcDate?.takeIf { !it.isAfter(todayCalc) }?.let { formatAgeDisplay(it, todayCalc) }
            }

            if (calcAgeLine != null && calcDate != null) {
                Text(
                    text = "Selected: ${displayDate(calcDate)}",
                    color = p.textSecondary,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = calcAgeLine,
                    color = p.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
            }

            Button(
                onClick = { showDatePicker = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = p.systemBlue),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Choose birth date", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }

    if (showDatePicker) {
        val selectableDates = remember {
            object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    runCatching {
                        val d = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneId.systemDefault()).toLocalDate()
                        !d.isAfter(LocalDate.now())
                    }.getOrDefault(false)

                override fun isSelectableYear(year: Int): Boolean =
                    year in 1900..LocalDate.now().year
            }
        }
        val initialMillis = calculatorBirthMillis ?: localDateToPickerMillis(LocalDate.now())
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = initialMillis,
            selectableDates = selectableDates,
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { calculatorBirthMillis = it }
                        showDatePicker = false
                    },
                ) { Text("OK", color = p.accent) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text("Cancel", color = p.textSecondary)
                }
            },
            colors = DatePickerDefaults.colors(),
        ) {
            DatePicker(state = datePickerState)
        }
    }
}
