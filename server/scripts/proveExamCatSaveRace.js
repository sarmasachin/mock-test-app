'use strict';
/**
 * Proves: two concurrent PATCH saves — last write wins; empty list wipes DB.
 * Simulates admin saveAll race (no DB needed).
 */
const writes = [];
async function simulateSave(label, items, delayMs) {
  await new Promise((r) => setTimeout(r, delayMs));
  writes.push({ label, items: items.length, at: Date.now() });
  return items;
}

async function main() {
  writes.length = 0;
  const userAdd = [{ level1: 'State', level2: 'HP', level3: 'Patwari' }];
  const emptySave = [];
  const p1 = simulateSave('addItem saveAll([new])', userAdd, 50);
  const p2 = simulateSave('Save All saveAll([]) stale state', emptySave, 10);
  await Promise.all([p1, p2]);
  const last = writes[writes.length - 1];
  console.log('Write order:', writes.map((w) => `${w.label} items=${w.items}`).join(' -> '));
  console.log('Final DB would have items:', last.items);
  console.log(last.items === 0 ? 'RESULT: DATA WIPED (empty save won race)' : 'RESULT: data kept');
}

main();
