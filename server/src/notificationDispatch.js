'use strict';

const { GoogleAuth } = require('google-auth-library');

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function getProjectId() {
  return String(process.env.FCM_PROJECT_ID || '').trim();
}

function getServiceAccount() {
  const raw = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

async function getAccessToken() {
  const projectId = getProjectId();
  const credentials = getServiceAccount();
  if (!projectId || !credentials) {
    throw new Error('FCM_PROJECT_ID or FCM_SERVICE_ACCOUNT_JSON missing');
  }
  const auth = new GoogleAuth({
    credentials,
    scopes: [FCM_SCOPE],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error('Failed to obtain FCM access token');
  }
  return { token, projectId };
}

async function sendPushToToken(deviceToken, payload) {
  const token = String(deviceToken || '').trim();
  if (!token) {
    return { ok: false, code: 'EMPTY_TOKEN' };
  }
  const title = String(payload?.title || '').trim().slice(0, 120);
  const body = String(payload?.message || '').trim().slice(0, 500);
  const deepLink = String(payload?.deepLink || '').trim().slice(0, 120);
  const campaignId = String(payload?.campaignId || '').trim().slice(0, 64);
  if (!title || !body) {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }
  const data = {};
  if (deepLink) data.deepLink = deepLink;
  if (campaignId) data.campaignId = campaignId;
  const { token: accessToken, projectId } = await getAccessToken();
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title,
          body,
        },
        data,
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: 'general_notifications',
            default_sound: true,
          },
        },
      },
      validate_only: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const compact = text.slice(0, 500);
    if (response.status === 404 && compact.includes('UNREGISTERED')) {
      return { ok: false, code: 'UNREGISTERED', detail: compact };
    }
    if (compact.includes('UNREGISTERED')) {
      return { ok: false, code: 'UNREGISTERED', detail: compact };
    }
    return { ok: false, code: `HTTP_${response.status}`, detail: compact };
  }
  return { ok: true };
}

module.exports = {
  sendPushToToken,
};
