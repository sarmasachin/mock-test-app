'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/requireAuth');
const authRouter = require('./routes/auth');
const meRouter = require('./routes/me');
const attemptsRouter = require('./routes/attempts');
const newsRouter = require('./routes/news');
const testsCatalogRouter = require('./routes/tests');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('FATAL: set JWT_SECRET (min 16 chars) in .env');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: set DATABASE_URL in .env');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/v1/auth', authRouter);
app.use('/v1/me', requireAuth, meRouter);
app.use('/v1/attempts', requireAuth, attemptsRouter);
app.use('/v1/news', newsRouter);
app.use('/v1/tests', testsCatalogRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port, () => {
  console.log(`MockTestApp API listening on http://0.0.0.0:${port}`);
});
