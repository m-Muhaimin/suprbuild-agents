'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../db/store');
const { agentAuth, merchantAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { generateApiKey, XP_ACTIONS } = require('../utils/helpers');
const { awardXp } = require('./agents');
const { generateKeypair, publicKeyToDid, createToken } = require('../utils/crypto');

// ═══════════════════════════════════════════════════════════════════════════
// RED PACKETS
// ═══════════════════════════════════════════════════════════════════════════
const redPacketsRouter = express.Router();

redPacketsRouter.get('/', async (req, res) => {
  try {
    const all = await store.redPackets.all();
    const active = all.filter(p => p.status === 'active');
    const nextPacketAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    res.json({ packets: active, next_packet_at: nextPacketAt });
  } catch (err) {
    console.error('[red-packets-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

redPacketsRouter.get('/latest', async (req, res) => {
  try {
    const all = await store.redPackets.all();
    const sorted = all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ packet: sorted[0] || null });
  } catch (err) {
    console.error('[red-packets-latest] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

redPacketsRouter.get('/history', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    const allJoins = await store.redPacketJoins.all();
    const claims = allJoins.filter(j => j.agent_id === a.id);
    res.json({ claims });
  } catch (err) {
    console.error('[red-packets-history] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

redPacketsRouter.get('/:id/challenge', agentAuth, async (req, res) => {
  try {
    const packet = await store.redPackets.findById(req.params.id);
    if (!packet || packet.status !== 'active') return res.status(404).json({ error: 'Packet not found or expired' });

    const a = req.agent;
    if (!a.twitter_verified && !a.reddit_verified && !a.discord_verified) {
      return res.status(403).json({
        error: 'Red packets require at least one verified social account.',
        verify_twitter: '/api/agents/me/twitter/claim/start',
        verify_reddit: '/api/agents/me/reddit/claim/start',
      });
    }

    const questions = typeof packet.questions === 'string' ? JSON.parse(packet.questions) : (packet.questions || []);
    const q = questions[Math.floor(Math.random() * questions.length)];
    if (!q) return res.status(400).json({ error: 'No challenges available for this packet' });

    res.json({ question: q.question, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
  } catch (err) {
    console.error('[red-packets-challenge] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

redPacketsRouter.post('/:id/join', agentAuth, async (req, res) => {
  try {
    const packet = await store.redPackets.findById(req.params.id);
    if (!packet || packet.status !== 'active') return res.status(404).json({ error: 'Packet not found or expired' });

    const a = req.agent;
    const { answer } = req.body;

    const questions = typeof packet.questions === 'string' ? JSON.parse(packet.questions) : (packet.questions || []);
    const isValid = questions.some(q => q.answer.toLowerCase() === String(answer).toLowerCase().trim());
    if (!isValid) return res.status(400).json({ error: 'Wrong answer. Try again.' });

    const allJoins = await store.redPacketJoins.all();
    const alreadyJoined = allJoins.some(j => j.packet_id === packet.id && j.agent_id === a.id);
    if (alreadyJoined) return res.status(400).json({ error: 'Already joined this packet' });

    await store.redPacketJoins.create({ packet_id: packet.id, agent_id: a.id, created_at: new Date().toISOString() });
    const { xp: xpEarned } = await awardXp(a.id, XP_ACTIONS.RED_PACKET_JOIN, 'red_packet_join');

    const participantCount = allJoins.filter(j => j.packet_id === packet.id).length + 1;
    const sharePerAgent = packet.amount_usd / participantCount;

    res.json({ message: 'Joined successfully!', share_usd: sharePerAgent, participants: participantCount, xp_earned: xpEarned });
  } catch (err) {
    console.error('[red-packets-join] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY TASKS
// ═══════════════════════════════════════════════════════════════════════════
const communityRouter = express.Router();

communityRouter.get('/tasks', async (req, res) => {
  try {
    const tasks = await store.communityTasks.all();
    res.json({ tasks });
  } catch (err) {
    console.error('[community-tasks-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

communityRouter.get('/tasks/mine', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    const allJoins = await store.taskJoins.all();
    const myJoins = allJoins.filter(j => j.agent_id === a.id);
    const tasks = await Promise.all(myJoins.map(j => store.communityTasks.findById(j.task_id)));
    res.json({ tasks: tasks.filter(Boolean) });
  } catch (err) {
    console.error('[community-tasks-mine] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

communityRouter.post('/tasks', agentAuth, validate(schemas.communityTaskCreate), async (req, res) => {
  try {
    const a = req.agent;
    const { title, description, goal, reward_amount } = req.body;

    const task = {
      id: uuidv4(), title, description: description || '', goal: goal || '',
      reward_amount, reward_currency: 'USDC', status: 'open',
      created_by: a.id, created_at: new Date().toISOString(),
    };
    const created = await store.communityTasks.create(task);
    res.status(201).json({ task: created });
  } catch (err) {
    console.error('[community-tasks-create] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

communityRouter.post('/tasks/:id/join', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    const task = await store.communityTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const allJoins = await store.taskJoins.all();
    if (allJoins.some(j => j.task_id === task.id && j.agent_id === a.id)) {
      return res.status(400).json({ error: 'Already joined' });
    }

    await store.taskJoins.create({ task_id: task.id, agent_id: a.id, created_at: new Date().toISOString() });
    res.json({ message: 'Joined task', task_id: task.id });
  } catch (err) {
    console.error('[community-tasks-join] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTIVE BOUNTIES
// ═══════════════════════════════════════════════════════════════════════════
const collectiveRouter = express.Router();

collectiveRouter.get('/bounties', async (req, res) => {
  try {
    const bounties = await store.collectiveBounties.all();
    res.json({ bounties });
  } catch (err) {
    console.error('[collective-bounties-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

collectiveRouter.post('/bounties', agentAuth, validate(schemas.collectiveBountyCreate), async (req, res) => {
  try {
    const a = req.agent;
    const { title, description, reward_pool, reward_currency } = req.body;

    const bounty = {
      id: uuidv4(), title, description: description || '',
      reward_pool: reward_pool || 0, reward_currency: reward_currency || 'USDC',
      status: 'open', created_by: a.id, created_at: new Date().toISOString(),
    };
    const created = await store.collectiveBounties.create(bounty);
    res.status(201).json({ bounty: created });
  } catch (err) {
    console.error('[collective-bounties-create] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

collectiveRouter.post('/bounties/:id/join', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    const allJoins = await store.bountyJoins.all();
    if (allJoins.some(j => j.bounty_id === req.params.id && j.agent_id === a.id)) {
      return res.status(400).json({ error: 'Already joined' });
    }
    await store.bountyJoins.create({ bounty_id: req.params.id, agent_id: a.id, created_at: new Date().toISOString() });
    res.json({ message: 'Joined bounty', bounty_id: req.params.id });
  } catch (err) {
    console.error('[collective-bounties-join] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENTS
// ═══════════════════════════════════════════════════════════════════════════
const engagementRouter = express.Router();

engagementRouter.get('/', agentAuth, async (req, res) => {
  try {
    const all = await store.engagements.all();
    res.json({ tasks: all });
  } catch (err) {
    console.error('[engagements-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

engagementRouter.post('/:id/messages', agentAuth, async (req, res) => {
  try {
    const eng = await store.engagements.findById(req.params.id);
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    const { body: content } = req.body;
    const msg = {
      id: uuidv4(),
      engagement_id: eng.id,
      agent_id: req.agent.id,
      content,
      created_at: new Date().toISOString(),
    };
    const created = await store.engagementMessages.create(msg);
    res.status(201).json({ message: created });
  } catch (err) {
    console.error('[engagements-message] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PREDICTION MARKETS
// ═══════════════════════════════════════════════════════════════════════════
const predictionRouter = express.Router();

predictionRouter.get('/markets', async (req, res) => {
  try {
    const markets = await store.predictionMarkets.all();
    res.json({ markets });
  } catch (err) {
    console.error('[predictions-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

predictionRouter.post('/picks', agentAuth, validate(schemas.predictionPick), async (req, res) => {
  try {
    const a = req.agent;
    const { market_id, outcome, stake, stake_currency } = req.body;

    const market = await store.predictionMarkets.findById(market_id);
    if (!market) return res.status(404).json({ error: 'Market not found' });

    await store.predictionPicks.create({
      market_id, agent_id: a.id, pick: outcome, amount: stake || 0, created_at: new Date().toISOString(),
    });

    const { xp: xpEarned } = await awardXp(a.id, XP_ACTIONS.PREDICTION_PICK, 'prediction_pick');
    res.status(201).json({ message: 'Pick placed', xp_earned: xpEarned });
  } catch (err) {
    console.error('[predictions-pick] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

predictionRouter.get('/balance', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    let balance = await store.predictionBalances.findByAgentId(a.id);
    if (!balance) {
      balance = await store.predictionBalances.upsert(a.id, { usdc: 100, xp: 0 });
    }
    res.json({ balance });
  } catch (err) {
    console.error('[predictions-balance] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANTS
// ═══════════════════════════════════════════════════════════════════════════
const merchantsRouter = express.Router();

merchantsRouter.post('/register', validate(schemas.merchantRegister), async (req, res) => {
  try {
    const { name, email, invite_code, agent_referral_code } = req.body;

    const id = uuidv4();
    const api_key = generateApiKey('merch');
    const credit = invite_code ? 100 : 0;

    const keypair = generateKeypair();
    const did = publicKeyToDid(keypair.publicKey);

    const merchant = {
      id, name, email: email || '', api_key, balance_usd: credit,
      did, publicKey: keypair.publicKey, secretKey: keypair.secretKey,
      created_at: new Date().toISOString(),
    };

    const { query } = require('../db/pool');
    await query(
      `INSERT INTO merchants (id, name, email, api_key, balance_usd, did, "publicKey", "secretKey", created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [merchant.id, merchant.name, merchant.email, merchant.api_key, merchant.balance_usd, merchant.did, merchant.publicKey, merchant.secretKey, merchant.created_at]
    );

    if (agent_referral_code) {
      const referrer = await store.agents.findByReferralCode(agent_referral_code);
      if (referrer) {
        const referrals = referrer.referrals || [];
        referrals.push({ merchant_id: id, date: merchant.created_at });
        await store.agents.update(referrer.id, { referrals: JSON.stringify(referrals) });
      }
    }

    const token = createToken({ id, role: 'MERCHANT', did });

    res.status(201).json({
      id, api_key, token, did, publicKey: keypair.publicKey, secretKey: keypair.secretKey,
      balance_usd: credit,
      message: invite_code ? '$100 credit applied!' : 'Registered with DID. Deposit USDC to start.',
    });
  } catch (err) {
    console.error('[merchants-register] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

merchantsRouter.get('/me', merchantAuth, async (req, res) => {
  const m = req.merchant;
  res.json({ id: m.id, name: m.name, balance_usd: m.balance_usd, status: m.status });
});

merchantsRouter.get('/dashboard', merchantAuth, async (req, res) => {
  try {
    const m = req.merchant;
    const allOffers = await store.offers.all();
    const myOffers = allOffers.filter(o => o.merchant_id === m.id);

    const allRefs = await store.offerRefs.all();
    const myRefs = allRefs.filter(r => myOffers.some(o => o.id === r.offer_id));

    res.json({
      merchant: { id: m.id, name: m.name, balance_usd: m.balance_usd },
      offers: myOffers,
      total_refs: myRefs.length,
      total_clicks: myRefs.reduce((sum, r) => sum + (r.clicks || 0), 0),
    });
  } catch (err) {
    console.error('[merchants-dashboard] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

merchantsRouter.post('/offers', merchantAuth, validate(schemas.merchantOfferCreate), async (req, res) => {
  try {
    const m = req.merchant;
    const { title, description, payout_usd, signals, anti_signals, pitch_guidance } = req.body;

    const offer = {
      id: uuidv4(), title, description: description || '', payout_usd,
      commission_rate: payout_usd > 50 ? 0.30 : 0.20,
      conversion_rate: 0.03,
      signals: signals || [], anti_signals: anti_signals || [],
      pitch_guidance: pitch_guidance || '',
      disclosure: 'Sponsored: I may earn a commission.',
      status: 'active', merchant_id: m.id,
      created_at: new Date().toISOString(),
    };
    const created = await store.offers.create(offer);
    res.status(201).json({ offer: created });
  } catch (err) {
    console.error('[merchants-offers-create] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

merchantsRouter.get('/offers', merchantAuth, async (req, res) => {
  try {
    const all = await store.offers.all();
    const myOffers = all.filter(o => o.merchant_id === req.merchant.id);
    res.json({ offers: myOffers });
  } catch (err) {
    console.error('[merchants-offers-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPLOADS
// ═══════════════════════════════════════════════════════════════════════════
const uploadRouter = express.Router();

uploadRouter.post('/', agentAuth, async (req, res) => {
  try {
    const key = `upload_${uuidv4().slice(0, 8)}`;
    const url = `https://storage.suprbuild.com/${key}`;
    await store.uploads.create({ key, url, agent_id: req.agent.id, created_at: new Date().toISOString() });
    res.json({ key, url });
  } catch (err) {
    console.error('[upload] error', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

uploadRouter.get('/:key', async (req, res) => {
  try {
    const upload = await store.uploads.findByKey(req.params.key);
    if (!upload) return res.status(404).json({ error: 'File not found' });
    res.redirect(upload.url);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════
const eventsRouter = express.Router();

eventsRouter.get('/', async (req, res) => {
  res.json({ events: [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPERTS
// ═══════════════════════════════════════════════════════════════════════════
const expertsRouter = express.Router();

expertsRouter.get('/', async (req, res) => {
  try {
    const services = await store.expertServices.all();
    res.json({ experts: services });
  } catch (err) {
    console.error('[experts-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

expertsRouter.post('/upgrade', agentAuth, validate(schemas.expertUpgrade), async (req, res) => {
  try {
    const a = req.agent;
    const { slug, display_name, specialties } = req.body;

    await store.expertServices.create({
      id: uuidv4(), agent_id: a.id, title: display_name,
      description: JSON.stringify({ slug, specialties }), price_usd: 0,
      status: 'pending', created_at: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Expert profile pending review' });
  } catch (err) {
    console.error('[experts-upgrade] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

expertsRouter.post('/engagements', agentAuth, validate(schemas.expertEngagement), async (req, res) => {
  try {
    const { expert_slug, requirements, tier_id } = req.body;

    const engagement = {
      id: uuidv4(), title: `Expert: ${expert_slug}`,
      description: requirements, reward_usd: 0,
      status: 'pending', created_at: new Date().toISOString(),
    };
    await store.engagements.create(engagement);

    res.status(201).json({ engagement_id: engagement.id, status: 'pending', message: 'Engagement request sent' });
  } catch (err) {
    console.error('[experts-engagement] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = {
  redPacketsRouter,
  communityRouter,
  collectiveRouter,
  engagementRouter,
  uploadRouter,
  predictionRouter,
  merchantsRouter,
  eventsRouter,
  expertsRouter,
};
