'use strict';

/**
 * Phase 4 — Android tray + inbox dedupe via stable dedupeKey in FCM payload.
 *
 * Usage:
 *   node scripts/verifyPushTrayDedupePhase4.js
 */

const fs = require('fs');
const path = require('path');
const {
  resolvePushDedupeKey,
  androidNotificationTagFromDedupeKey,
} = require('../src/notificationDispatch');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, label) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`[${mark}] ${label}`);
  return ok;
}

function kotlinStringHashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

function stableTrayNotificationId(key) {
  const trimmed = String(key || '').trim();
  if (!trimmed) return 0;
  const hash = kotlinStringHashCode(trimmed);
  if (hash === -2147483648 || hash === 0) return 1;
  return Math.abs(hash);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

let ok = true;

ok = line(
  resolvePushDedupeKey({ dedupeKey: 'test_publish:abc:2026-01-01T00:00:00.000Z' })
    === 'test_publish:abc:2026-01-01T00:00:00.000Z',
  'resolvePushDedupeKey prefers explicit dedupeKey',
) && ok;

ok = line(
  resolvePushDedupeKey({ campaignId: 'camp-1' }) === 'campaign:camp-1',
  'resolvePushDedupeKey falls back to campaignId',
) && ok;

const tag = androidNotificationTagFromDedupeKey('test_publish:t1:2026-07-01T05:21:03.095Z');
ok = line(tag.length > 0 && tag.length <= 64, 'android notification tag is bounded') && ok;
ok = line(!/[^\w\-:.@]/.test(tag), 'android notification tag is sanitized') && ok;

const sampleKey = 'test_publish:hp-gk:2026-07-07T10:00:00.000Z';
const trayId = stableTrayNotificationId(sampleKey);
ok = line(trayId > 0, 'stable tray notification id is positive') && ok;
ok = line(
  stableTrayNotificationId(sampleKey) === trayId,
  'stable tray notification id is deterministic',
) && ok;

const dispatchSrc = readText('server/src/notificationDispatch.js');
ok = line(dispatchSrc.includes('data.dedupeKey = dedupeKey'), 'FCM data includes dedupeKey') && ok;
ok = line(dispatchSrc.includes('androidNotification.tag'), 'FCM android notification tag set') && ok;

const audienceSrc = readText('server/src/lib/pushAudienceDelivery.js');
ok = line(audienceSrc.includes('dedupeKey: deliveryDedupeKey'), 'audience sender forwards dedupeKey') && ok;

const fcmServiceSrc = readText('app/src/main/java/com/freemocktest/app/notifications/MockTestFirebaseMessagingService.kt');
ok = line(fcmServiceSrc.includes('PushNotificationIdentity'), 'FCM service uses PushNotificationIdentity') && ok;
ok = line(!fcmServiceSrc.includes('Random.nextInt(1, Int.MAX_VALUE), notification)'), 'FCM service no longer uses random notify id') && ok;
ok = line(fcmServiceSrc.includes('.notify(notificationId, notification)'), 'FCM service uses stable notify id') && ok;

const inboxSrc = readText('app/src/main/java/com/freemocktest/app/notifications/LocalNotificationInbox.kt');
ok = line(inboxSrc.includes('dedupeKey'), 'inbox stores dedupeKey') && ok;
ok = line(inboxSrc.includes('shouldDropDuplicate'), 'inbox dedupes repeated pushes') && ok;

const identitySrc = readText('app/src/main/java/com/freemocktest/app/notifications/PushNotificationIdentity.kt');
ok = line(identitySrc.includes('stableTrayNotificationId'), 'PushNotificationIdentity exposes stable tray id') && ok;

if (!ok) {
  console.error('\nverifyPushTrayDedupePhase4 FAILED');
  process.exit(1);
}

console.log('\npush_tray_dedupe_phase4_smoke_ok');
