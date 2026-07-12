'use strict';

/**
 * State exam tests use fixed question papers — pool shuffle on publish must stay off.
 */

function isStateExamSyncRequest(syncParsed) {
  return syncParsed?.mode === 'upsert';
}

function bodyHasExplicitDynamicFluctuation(body) {
  return Object.prototype.hasOwnProperty.call(body || {}, 'dynamicFluctuationOnPublish');
}

/**
 * Force fluctuation off for state-exam sync unless admin explicitly sent a value.
 * @param {{ body?: object, syncParsed?: object, data: object }} input
 */
function applyStateExamDynamicFluctuationDefault({ body, syncParsed, data }) {
  if (!data || !isStateExamSyncRequest(syncParsed)) return;
  if (bodyHasExplicitDynamicFluctuation(body)) return;
  data.dynamicFluctuationOnPublish = false;
}

function resolveDynamicFluctuationOnPublishForSave({
  body,
  syncParsed,
  hasExplicitValue,
  explicitValue,
  existingValue,
}) {
  if (hasExplicitValue) {
    return explicitValue !== false;
  }
  if (isStateExamSyncRequest(syncParsed)) {
    return false;
  }
  if (existingValue !== undefined && existingValue !== null) {
    return existingValue !== false;
  }
  return true;
}

module.exports = {
  isStateExamSyncRequest,
  bodyHasExplicitDynamicFluctuation,
  applyStateExamDynamicFluctuationDefault,
  resolveDynamicFluctuationOnPublishForSave,
};
