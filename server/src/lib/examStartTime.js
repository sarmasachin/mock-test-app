'use strict';

function parseHourMinuteFromSlotLabel(slotLabel) {
  const raw = String(slotLabel || '').trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const meridiem = String(m[3] || '').toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return { hour, minute };
}

function buildExamStartIso(examDate, slotLabel, tzOffsetMinutes = Number(process.env.EXAM_TIMEZONE_OFFSET_MINUTES || 330)) {
  const date = String(examDate || '').trim();
  if (!date) return null;
  const hm = parseHourMinuteFromSlotLabel(slotLabel);
  if (!hm) return null;
  const offset = Number(tzOffsetMinutes);
  const safeOffset = Number.isFinite(offset) ? offset : 330;
  const sign = safeOffset >= 0 ? '+' : '-';
  const abs = Math.abs(safeOffset);
  const tzH = String(Math.floor(abs / 60)).padStart(2, '0');
  const tzM = String(abs % 60).padStart(2, '0');
  const hh = String(hm.hour).padStart(2, '0');
  const mm = String(hm.minute).padStart(2, '0');
  const iso = `${date}T${hh}:${mm}:00${sign}${tzH}:${tzM}`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

module.exports = {
  parseHourMinuteFromSlotLabel,
  buildExamStartIso,
};
