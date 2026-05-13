'use strict';

const express = require('express');
const { pool } = require('../db');
const { verifyMarketingEmailUnsubscribeToken } = require('../lib/marketingEmailUnsubscribe');

const router = express.Router();

function htmlPage(title, bodyHtml) {
  const t = String(title || '').replace(/</g, '');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${t}</title></head><body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
<div style="max-width:560px;margin:48px auto;padding:24px 20px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
${bodyHtml}
</div></body></html>`;
}

router.get('/preferences/unsubscribe', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const token = String(req.query.token || '').trim();
  if (!token) {
    res.status(400).send(htmlPage('Unsubscribe', '<p>Missing token.</p>'));
    return;
  }
  const payload = verifyMarketingEmailUnsubscribeToken(token);
  if (!payload) {
    res.status(400).send(htmlPage('Unsubscribe', '<p>This link is invalid or has expired.</p>'));
    return;
  }
  try {
    const cur = await pool.query(
      `SELECT marketing_emails_unsubscribed_at FROM users WHERE id = $1::uuid LIMIT 1`,
      [payload.userId],
    );
    if (!cur.rows[0]) {
      res.status(404).send(htmlPage('Unsubscribe', '<p>Account not found.</p>'));
      return;
    }
    if (cur.rows[0].marketing_emails_unsubscribed_at) {
      res
        .status(200)
        .send(
          htmlPage(
            'Already unsubscribed',
            '<p>You are already unsubscribed from optional product emails.</p><p>Verification and security emails may still be sent when needed.</p>',
          ),
        );
      return;
    }
    await pool.query(
      `UPDATE users SET marketing_emails_unsubscribed_at = now(), updated_at = now() WHERE id = $1::uuid`,
      [payload.userId],
    );
    res
      .status(200)
      .send(
        htmlPage(
          'Unsubscribed',
          '<p><strong>Done.</strong> You will no longer receive optional product emails from us.</p><p>Verification and security emails may still be sent when needed.</p>',
        ),
      );
  } catch (e) {
    if (e && e.code === '42703') {
      res
        .status(503)
        .send(
          htmlPage(
            'Unavailable',
            '<p>Server is updating. Please try again later or contact support.</p>',
          ),
        );
      return;
    }
    console.error('email_unsubscribe_failed', e);
    res.status(500).send(htmlPage('Error', '<p>Something went wrong. Please try again later.</p>'));
  }
});

module.exports = router;
