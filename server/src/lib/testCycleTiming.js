'use strict';

function parseCycleEndMs(row) {
  if (!row) return Number.NaN;
  const startedMs = Date.parse(String(row.last_cycle_started_at || ''));
  if (!Number.isFinite(startedMs)) return Number.NaN;
  const durationMinutes = Math.max(0, Number(row.duration_minutes || 0));
  if (durationMinutes <= 0) return Number.NaN;
  return startedMs + durationMinutes * 60 * 1000;
}

module.exports = {
  parseCycleEndMs,
};
