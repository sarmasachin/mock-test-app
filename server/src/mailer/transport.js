'use strict';

const nodemailer = require('nodemailer');

function createTransportForPrefix(prefix) {
  const safePrefix = String(prefix || '').trim();
  const host = String(process.env[`${safePrefix}HOST`] || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(process.env[`${safePrefix}PORT`] || process.env.SMTP_PORT || '587', 10);
  const secure =
    String(process.env[`${safePrefix}SECURE`] || process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const connectionTimeout = parseInt(
    process.env[`${safePrefix}CONNECTION_TIMEOUT_MS`] || process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000',
    10,
  );
  const greetingTimeout = parseInt(
    process.env[`${safePrefix}GREETING_TIMEOUT_MS`] || process.env.SMTP_GREETING_TIMEOUT_MS || '10000',
    10,
  );
  const socketTimeout = parseInt(
    process.env[`${safePrefix}SOCKET_TIMEOUT_MS`] || process.env.SMTP_SOCKET_TIMEOUT_MS || '15000',
    10,
  );
  const tlsRejectUnauthorized =
    String(
      process.env[`${safePrefix}TLS_REJECT_UNAUTHORIZED`] ||
        process.env.SMTP_TLS_REJECT_UNAUTHORIZED ||
        'true',
    ).toLowerCase() !== 'false';
  const tlsMinVersion = String(
    process.env[`${safePrefix}TLS_MIN_VERSION`] || process.env.SMTP_TLS_MIN_VERSION || 'TLSv1.2',
  ).trim();
  const user = String(process.env[`${safePrefix}USER`] || process.env.SMTP_USER || '').trim();
  const pass = String(process.env[`${safePrefix}PASS`] || process.env.SMTP_PASS || '').trim();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: tlsRejectUnauthorized,
      minVersion: tlsMinVersion,
    },
  });
}

module.exports = { createTransportForPrefix };
