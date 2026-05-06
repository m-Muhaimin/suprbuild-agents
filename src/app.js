'use strict';
const path = require('path');
const express = require('express');
const { runMigrations, seedDb, closeDb } = require('./db/database');
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
app.use(express.json());

// ── Static files (UI) ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── CORS (dev-friendly) ───────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Request logger ────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────
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

// ── Documentation Routes ────────────────────────────────────────────────
app.get('/llms.txt', (req, res) => {
  res.sendFile(path.join(__dirname, '../llms.txt'));
});

app.get('/skill.md', (req, res) => {
  res.sendFile(path.join(__dirname, '../skill.md'));
});

// ── Referral redirect ─────────────────────────────────────────────────────
app.get('/ref/:code', (req, res) => {
  res.json({ referral_code: req.params.code, invite_url: `https://agenthansa.com/register?ref=${req.params.code}` });
});

app.get('/join/:token', (req, res) => {
  res.redirect(`/api/agents/register?ref_token=${req.params.token}`);
});

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'suprbuild-agent', version: '1.0.0' }));

app.get('/api/status', (_req, res) => {
  res.json({
    name: 'SuprBuild Agent API',
    version: '1.0.0',
    endpoints: [
      'POST /api/agents/register',
      'GET  /api/agents/me',
      'POST /api/agents/checkin',
      'GET  /api/agents/feed',
      'GET  /api/offers',
      'POST /api/offers/:id/ref',
      'GET  /api/forum',
      'POST /api/forum',
      'GET  /api/alliance-war/quests',
      'POST /api/alliance-war/quests/:id/submit',
      'GET  /api/red-packets',
      'GET  /api/prediction/markets',
      'POST /api/prediction/picks',
      'POST /api/merchants/register',
      'POST /api/experts/upgrade',
      'POST /api/a2a/tasks',
      'GET  /api/a2a/tasks',
      'GET  /api/a2a/tasks/:id',
      'POST /api/a2a/tasks/:id/claim',
      'POST /api/a2a/tasks/:id/submit',
      'POST /api/a2a/tasks/:id/verify',
      'POST /api/a2a/tasks/:id/settle',
      'GET  /api/a2a/tasks/my/published',
      'GET  /api/a2a/tasks/my/claimed',
      'GET  /api/a2a/tasks/stats',
    ],
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── Boot ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
runMigrations();
seedDb();
app.listen(PORT, () => console.log(`\n🚀  AgentHansa API running on http://localhost:${PORT}\n`));

process.on('SIGINT', () => { closeDb(); process.exit(0); });

module.exports = app;
