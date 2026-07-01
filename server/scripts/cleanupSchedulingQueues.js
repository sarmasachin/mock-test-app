'use strict';

require('dotenv').config();

const { pool } = require('../src/db');
const { runSchedulingQueueCleanup } = require('../src/lib/schedulingQueueCleanup');

async function main() {
  const apply = process.argv.includes('--apply');
  const result = await runSchedulingQueueCleanup({ apply });
  console.log(JSON.stringify(result.summary, null, 2));
  if (!apply) {
    console.log('\nNo DB writes (dry-run). Re-run with --apply to persist.');
  } else {
    console.log('\nCleanup applied.');
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error('cleanup_scheduling_queues_failed', e.message || e);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
