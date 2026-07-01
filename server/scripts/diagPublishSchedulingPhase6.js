'use strict';
/**
 * Phase 6 — READ-ONLY publish scheduling diagnostic (no DB writes).
 *
 * Usage:
 *   node scripts/diagPublishSchedulingPhase6.js
 */
require('dotenv').config();

const { pool } = require('../src/db');
const { getPublishSchedulingItems } = require('../src/lib/testVisibility');
const { buildPublishSchedulingDiagnostics } = require('../src/lib/publishScheduleDiagnostics');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
}

async function main() {
  const nowMs = Date.now();
  console.log('PHASE6_PUBLISH_SCHED_DIAG — read-only\n');

  const items = await getPublishSchedulingItems(pool);
  const testIds = [
    ...new Set(
      items
        .filter((x) => String(x?.entityType || '').toLowerCase() === 'test')
        .map((x) => String(x?.entityId || '').trim())
        .filter(Boolean),
    ),
  ];
  const labels = {};
  if (testIds.length) {
    const res = await pool.query(`SELECT id::text AS id, title FROM tests WHERE id = ANY($1::uuid[])`, [testIds]);
    for (const row of res.rows || []) {
      labels[String(row.id)] = String(row.title || '');
    }
  }

  const { diagnostics } = buildPublishSchedulingDiagnostics(items, nowMs, labels);
  console.log(`Server now: ${diagnostics.serverNow}`);
  console.log(`Total queue items: ${items.length}`);
  console.log(`Overdue pending: ${diagnostics.overdueCount}`);
  console.log(`Stale processing: ${diagnostics.staleProcessingCount}`);
  console.log(`Max overdue minutes: ${diagnostics.maxOverdueMinutes}`);
  console.log(`Alert threshold: ${diagnostics.alertAfterMinutes} min`);
  console.log(`Healthy: ${diagnostics.healthy ? 'yes' : 'NO'}\n`);

  if (diagnostics.overdueSamples.length) {
    console.log('Overdue samples:');
    for (const sample of diagnostics.overdueSamples) {
      const label = sample.entityLabel ? ` "${sample.entityLabel}"` : '';
      line(false, `${sample.id} ${sample.entityType}${label} — ${sample.overdueMinutes}m late (${sample.status})`);
    }
  } else {
    line(true, 'No overdue publish schedules');
  }

  console.log('\nIf overdue: pm2 restart mocktestapp-api OR Admin → All Tests → Republish now');
  console.log('Full runbook: server/PHASE6_SCHEDULER_HARDENING_RUNBOOK.txt\n');
  console.log(diagnostics.healthy ? 'PHASE6_DIAG_OK' : 'PHASE6_DIAG_NEEDS_ACTION');
}

main()
  .catch((e) => {
    console.error('PHASE6_DIAG_FATAL', e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
