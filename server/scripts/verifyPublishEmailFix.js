#!/usr/bin/env node
'use strict';

const {
  evaluatePublishEmailSend,
  buildPublishEmailDedupeKey,
} = require('../src/lib/publishAnnouncementEmail');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

let ok = true;
const cycleA = '2026-07-01T10:00:00.000Z';
const cycleB = '2026-07-02T10:00:00.000Z';
const testId = '11111111-1111-1111-1111-111111111111';
const dedupeA = buildPublishEmailDedupeKey(testId, cycleA);
const dedupeB = buildPublishEmailDedupeKey(testId, cycleB);

ok = line(
  evaluatePublishEmailSend({
    sendEmailOnPublish: true,
    isPublished: true,
    justPublished: true,
    dedupeKey: dedupeA,
    lastSentDedupeKey: '',
  }).send === true,
  'justPublished + checkbox ON → send',
) && ok;

ok = line(
  evaluatePublishEmailSend({
    sendEmailOnPublish: true,
    isPublished: true,
    justPublished: false,
    previousSendEmailOnPublish: false,
    dedupeKey: dedupeA,
    lastSentDedupeKey: '',
  }).send === true,
  'checkbox newly enabled on published test → send',
) && ok;

ok = line(
  evaluatePublishEmailSend({
    sendEmailOnPublish: true,
    isPublished: true,
    justPublished: false,
    cycleRenewed: true,
    previousSendEmailOnPublish: true,
    dedupeKey: dedupeB,
    lastSentDedupeKey: dedupeA,
  }).send === true,
  'new cycle with checkbox ON → send again',
) && ok;

ok = line(
  evaluatePublishEmailSend({
    sendEmailOnPublish: true,
    isPublished: true,
    justPublished: false,
    previousSendEmailOnPublish: true,
    dedupeKey: dedupeA,
    lastSentDedupeKey: dedupeA,
  }).send === false,
  'same cycle save again → no duplicate spam',
) && ok;

ok = line(
  evaluatePublishEmailSend({
    sendEmailOnPublish: false,
    isPublished: true,
    justPublished: true,
    dedupeKey: dedupeA,
  }).send === false,
  'checkbox OFF → never send',
) && ok;

if (!ok) {
  console.error('PUBLISH_EMAIL_FIX_VERIFY_FAIL');
  process.exit(1);
}
console.log('PUBLISH_EMAIL_FIX_VERIFY_OK');
