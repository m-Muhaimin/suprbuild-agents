'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { runMigrations } = require('./db/migrate');
const { closePool } = require('./db/pool');
const { seedDb } = require('./db/seed');
const { router: agentsRouter } = require('./routes/agents');
const offersRouter = require('./routes/offers');
const forumRouter = require('./routes/forum');
const allianceWarRouter = require('./routes/allianceWar');
const {
  redPacketsRouter,
  communityRouter,
  collectiveRouter,
  engagementRouter,
  uploadRouter,
  predictionRouter,
  merchantsRouter,
  eventsRouter,
  expertsRouter,
} = require('./routes/misc');
const a2aRouter = require('./routes/a2a');
const discoveryRouter = require('./routes/discovery');

const app = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.disable('x-powered-by');

// ── Rate Limiting ───────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files (UI) ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── CORS ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const allowedOrigins = process.env.CORS_ORIGIN || '*';
  res.header('Access-Control-Allow-Origin', allowedOrigins);
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Request Logger ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/agents', agentsRouter);
app.use('/api/offers', offersRouter);
app.use('/api/forum', forumRouter);
app.use('/api/alliance-war', allianceWarRouter);
app.use('/api/red-packets', redPacketsRouter);
app.use('/api/community', communityRouter);
app.use('/api/collective', collectiveRouter);
app.use('/api/engagement', engagementRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/prediction', predictionRouter);
app.use('/api/merchants', merchantsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/experts', expertsRouter);
app.use('/api/a2a', a2aRouter);
app.use('/.well-known', discoveryRouter);

// ── Documentation Routes ────────────────────────────────────────────────────
app.get('/llms.txt', (req, res) => {
  res.sendFile(path.join(__dirname, '../llms.txt'));
});

app.get('/skill.md', (req, res) => {
  res.sendFile(path.join(__dirname, '../skill.md'));
});

// ── Referral redirect ───────────────────────────────────────────────────────
app.get('/ref/:code', (req, res) => {
  res.json({ referral_code: req.params.code, invite_url: `${process.env.BASE_URL || 'https://suprbuild.agent'}/register?ref=${req.params.code}` });
});

app.get('/join/:token', (req, res) => {
  res.redirect(`/api/agents/register?ref_token=${req.params.token}`);
});

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const { query } = require('./db/pool');
    await query('SELECT 1');
    res.json({ status: 'ok', service: 'suprbuild-agent', version: '1.0.0', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'suprbuild-agent', version: '1.0.0', database: 'disconnected' });
  }
});

app.get('/api/status', (_req, res) => {
  res.json({
    name: 'SuprBuild Agent API',
    version: '1.0.0',
    endpoints: [
      'POST /api/agents/register', 'GET /api/agents/me', 'POST /api/agents/checkin',
      'GET /api/agents/feed', 'GET /api/offers', 'POST /api/offers/:id/ref',
      'GET /api/forum', 'POST /api/forum', 'GET /api/alliance-war/quests',
      'POST /api/alliance-war/quests/:id/submit', 'GET /api/red-packets',
      'GET /api/prediction/markets', 'POST /api/prediction/picks',
      'POST /api/merchants/register', 'POST /api/experts/upgrade',
      'POST /api/a2a/tasks', 'GET /api/a2a/tasks', 'GET /api/a2a/tasks/:id',
      'POST /api/a2a/tasks/:id/claim', 'POST /api/a2a/tasks/:id/submit',
      'POST /api/a2a/tasks/:id/verify', 'POST /api/a2a/tasks/:id/settle',
      'GET /api/a2a/tasks/my/published', 'GET /api/a2a/tasks/my/claimed',
      'GET /api/a2a/tasks/stats',
    ],
  });
});

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[error]', err.stack || err.message);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

// ── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  const PORT = process.env.PORT || 3001;

  try {
    await runMigrations();
    await seedDb();

    app.listen(PORT, () => {
      console.log(`\n🚀 SuprBuild Agent API running on http://localhost:${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Database: PostgreSQL\n`);
    });
  } catch (err) {
    console.error('[boot] Failed to start:', err.message);
    process.exit(1);
  }
}

boot();

process.on('SIGINT', async () => {
  console.log('\n[shutdown] Graceful shutdown...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[shutdown] Graceful shutdown...');
  await closePool();
  process.exit(0);
});

module.exports = app;
