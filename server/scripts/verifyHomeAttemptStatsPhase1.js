#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — unified user scope key for mock-test attempt history (Home stats).
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

// Mirror UserScopeKeys.kt
function resolveCanonicalKey(email, contact, userIdFormatted) {
  const mail = (email || '').trim();
  if (mail) return mail.toLowerCase();
  const c = (contact || '').trim();
  if (c) return c.toLowerCase();
  const uid = (userIdFormatted || '').trim();
  if (uid) return `uid:${uid}`;
  return '';
}

function canonicalizeLegacyKey(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('uid:')) {
    const digits = trimmed.substring(trimmed.indexOf(':') + 1).trim();
    return digits ? `uid:${digits}` : '';
  }
  if (/^\d{6,8}$/.test(trimmed)) return `uid:${trimmed}`;
  return lower;
}

function lookupKeys(canonicalScopeKey, userIdFormatted) {
  const canonical = canonicalizeLegacyKey(canonicalScopeKey);
  if (!canonical) return [];
  const keys = new Set([canonical]);
  const uid = (userIdFormatted || '').trim();
  if (uid) {
    keys.add(uid);
    keys.add(`uid:${uid}`);
  }
  if (canonical.startsWith('uid:')) {
    const digits = canonical.substring(4).trim();
    if (digits) keys.add(digits);
  }
  return [...keys];
}

let ok = true;

const keysKt = read('app/src/main/java/com/freemocktest/app/util/UserScopeKeys.kt');
const repoKt = read('app/src/main/java/com/freemocktest/app/data/TestHistoryRepository.kt');
const prefsKt = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
const navKt = read('app/src/main/java/com/freemocktest/app/newui/navigation/MainBottomNavHost.kt');
const daoKt = read('app/src/main/java/com/freemocktest/app/data/local/TestAttemptDao.kt');
const appKt = read('app/src/main/java/com/freemocktest/app/MockTestApp.kt');

ok = line(keysKt.includes('resolveCanonicalKey'), 'UserScopeKeys helper exists') && ok;
ok = line(keysKt.includes('canonicalizeLegacyKey'), 'Legacy key canonicalization exists') && ok;
ok = line(keysKt.includes('lookupKeys'), 'Legacy alias lookup keys exist') && ok;
ok = line(prefsKt.includes('val userScopeKey'), 'AppPreferences exposes userScopeKey flow') && ok;
ok = line(prefsKt.includes('UserScopeKeys.resolveCanonicalKey'), 'Owner id uses UserScopeKeys') && ok;
ok = line(repoKt.includes('observeAttemptsForLoggedInUser'), 'Repository observes by logged-in scope') && ok;
ok = line(repoKt.includes('migrateLegacyUserKeysIfNeeded'), 'One-shot legacy key migration exists') && ok;
ok = line(daoKt.includes('observeAllByUserKeys'), 'DAO queries multiple legacy aliases') && ok;
ok = line(homeKt.includes('observeAttemptsForLoggedInUser'), 'Home uses unified scope observer') && ok;
ok = line(homeKt.includes('userScopeKey'), 'Home reads canonical userScopeKey flow') && ok;
ok = line(navKt.includes('peekContentStateOwnerIdNow'), 'Quiz submit saves with canonical scope key') && ok;
ok = line(appKt.includes('migrateLegacyUserKeysIfNeeded'), 'App startup runs key migration') && ok;

const emailCanon = resolveCanonicalKey('User@Mail.com', '', null);
ok = line(emailCanon === 'user@mail.com', 'Sim: email canonicalized lowercase') && ok;

const uidCanon = resolveCanonicalKey('', '', '123456');
ok = line(uidCanon === 'uid:123456', 'Sim: uid formatted as uid:123456') && ok;

const legacy = canonicalizeLegacyKey('123456');
ok = line(legacy === 'uid:123456', 'Sim: legacy raw uid migrated form') && ok;

const aliases = lookupKeys('user@mail.com', '123456');
ok = line(aliases.includes('user@mail.com') && aliases.includes('123456'), 'Sim: lookup includes email + legacy uid rows') && ok;

console.log(`\n${ok ? 'VERIFY_HOME_ATTEMPT_STATS_PHASE1_OK' : 'VERIFY_HOME_ATTEMPT_STATS_PHASE1_FAILED'}\n`);
process.exit(ok ? 0 : 1);
