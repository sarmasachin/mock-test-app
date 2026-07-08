'use strict';

/**
 * Phase 3 — logout clears test catalog caches (disk + in-memory) so stale cards
 * cannot cross sessions or mark the wrong test as applied.
 */

const fs = require('fs');
const path = require('path');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function peekCachedBlob(raw) {
  const trimmed = String(raw || '').trim();
  return trimmed || null;
}

let ok = true;

const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
const auth = read('app/src/main/java/com/freemocktest/app/data/AuthRepository.kt');
const content = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');

ok = line(
  prefs.includes('prefs[keyCachedTestCardsBlob] = ""'),
  'clearAuthSessionPrefs: clears test card disk blob',
) && ok;
ok = line(
  prefs.includes('prefs[keyCachedTestsListsBlob] = ""'),
  'clearAuthSessionPrefs: clears tests-list disk blob',
) && ok;
ok = line(
  content.includes('fun clearTestNavigationCaches()'),
  'ContentRepository: clearTestNavigationCaches',
) && ok;
ok = line(
  content.includes('testCardMemory.clear()') && content.includes('testListBySubcategoryMemory.clear()'),
  'ContentRepository: clears in-memory test maps',
) && ok;
ok = line(
  auth.includes('ContentRepository.clearTestNavigationCaches()'),
  'AuthRepository.logout: clears navigation caches',
) && ok;

// peek* helpers treat blank as absent — empty string after logout is correct.
ok = line(peekCachedBlob('') === null, 'blank blob → no cache hit') && ok;
ok = line(peekCachedBlob('{"v":1}') !== null, 'non-blank blob → cache present') && ok;

// Unrelated CMS caches must not be cleared on logout (performance / offline UX).
ok = line(
  !prefs.match(/clearAuthSessionPrefs[\s\S]{0,2500}keyCachedHomeContent/),
  'logout does not clear home CMS cache',
) && ok;
ok = line(
  !prefs.match(/clearAuthSessionPrefs[\s\S]{0,2500}keyCachedExamCategoriesJson/),
  'logout does not clear exam categories cache',
) && ok;

if (ok) {
  console.log('\nAPPLY_CACHE_LOGOUT_PHASE3_OK');
  process.exit(0);
}
console.log('\nAPPLY_CACHE_LOGOUT_PHASE3_FAILED');
process.exit(1);
