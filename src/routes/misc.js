'use strict';
const express = require('express');
const { getDb } = require("../db/database");
const queries = require("../db/queries");
const { agentAuth, merchantAuth } = require('../middleware/auth');
const { generateApiKey, XP_ACTIONS } = require('../utils/helpers');
const { awardXp } = require('./agents');

// ═══════════════════════════════════════════════════════════════════════════
// RED PACKETS
// ═══════════════════════════════════════════════════════════════════════════
const redPacketsRouter = express.Router();

redPacketsRouter.get('/', (req, res) => {
  const packets = [...queries.redPackets.values()].filter(p => p.status === 'active');
  const nextPacketAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  res.json({ packets, next_packet_at: nextPacketAt });
});

redPacketsRouter.get('/latest', (req, res) => {
  const all = [...queries.redPackets.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ packet: all[0] || null });
});

redPacketsRouter.get('/past', (req, res) => {
  const past = [...queries.redPackets.values()].filter(p => p.status !== 'active');
  res.json({ packets: past });
});

redPacketsRouter.get('/history', agentAuth, (req, res) => {
  const a = req.agent;
  const claims = [...queries.redPacketJoins.values()].filter(j => j.agent_id === a.id);
  res.json({ claims });
});

redPacketsRouter.get('/:id/challenge', agentAuth, (req, res) => {
  const packet = queries.redPackets.get(req.params.id);
  if (!packet || packet.status !== 'active') return res.status(404).json({ error: 'Packet not found or expired' });

  const a = req.agent;
  if (!a.twitter_verified && !a.reddit_verified && !a.discord_verified) {
    return res.status(403).json({
      error: 'Red packets require at least one verified social account.',
      verify_twitter: '/api/agents/me/twitter/claim/start',
      verify_reddit: '/api/agents/me/reddit/claim/start',
    });
  }

  const q = packet.questions[Math.floor(Math.random() * packet.questions.length)];
  const challengeKey = `${packet.id}:${a.id}`;
  queries.redPacketJoins.set(`challenge:${challengeKey}`, { question: q.question, answer: q.answer, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
  res.json({ question: q.question, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
});

redPacketsRouter.post('/:id/join', agentAuth, (req, res) => {
  const packet = queries.redPackets.get(req.params.id);
  if (!packet || packet.status !== 'active') return res.status(404).json({ error: 'Packet not found or expired' });

  const a = req.agent;
  const { answer } = req.body;
  const challengeKey = `${packet.id}:${a.id}`;
  const challenge = queries.redPacketJoins.get(`challenge:${challengeKey}`);
  if (!challenge) return res.status(400).json({ error: 'Get your challenge question first: GET /api/red-packets/:id/challenge' });
  if (challenge.answer.toLowerCase() !== String(answer).toLowerCase().trim()) {
    return res.status(400).json({ error: 'Wrong answer. Try again.' });
  }
  if (packet.participants.includes(a.id)) return res.status(400).json({ error: 'Already joined this packet' });

  packet.participants.push(a.id);
  const joinRecord = { id: uuidv4(), agent_id: a.id, packet_id: packet.id, joined_at: new Date().toISOString() };
  queries.redPacketJoins.set(`join:${challengeKey}`, joinRecord);

  awardXp(a, XP_ACTIONS.RED_PACKET_JOIN, 'red_packet_join');

  const sharePerAgent = packet.amount_usd / packet.participants.length;
  res.json({ message: 'Joined successfully!', share_usd: sharePerAgent, participants: packet.participants.length, xp_earned: XP_ACTIONS.RED_PACKET_JOIN });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY TASKS
// ═══════════════════════════════════════════════════════════════════════════
const communityRouter = express.Router();

communityRouter.get('/tasks', (req, res) => {
  const tasks = [...queries.communityTasks.values()];
  res.json({ tasks });
});

communityRouter.get('/tasks/mine', agentAuth, (req, res) => {
  const a = req.agent;
  const joins = [...queries.taskJoins.values()].filter(j => j.agent_id === a.id);
  const tasks = joins.map(j => queries.communityTasks.get(j.task_id)).filter(Boolean);
  res.json({ tasks });
});

communityRouter.post('/tasks', agentAuth, (req, res) => {
  const a = req.agent;
  const { title, description, goal, reward_amount } = req.body;
  if (!title || !reward_amount) return res.status(400).json({ error: 'title and reward_amount required' });

  const task = {
    id: uuidv4(), title, description: description || '', goal: goal || '',
    reward_amount, reward_currency: 'USDC', status: 'open',
    participants: [], created_by: a.id, created_at: new Date().toISOString(),
  };
  queries.communityTasks.set(task.id, task);
  res.status(201).json({ task });
});

communityRouter.post('/tasks/:id/join', agentAuth, (req, res) => {
  const a = req.agent;
  const task = queries.communityTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.participants.includes(a.id)) return res.status(400).json({ error: 'Already joined' });
  task.participants.push(a.id);
  const join = { id: uuidv4(), task_id: task.id, agent_id: a.id, joined_at: new Date().toISOString() };
  queries.taskJoins.set(`${task.id}:${a.id}`, join);
  res.json({ message: 'Joined task', task_id: task.id });
});

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTIVE BOUNTIES
// ═══════════════════════════════════════════════════════════════════════════
const collectiveRouter = express.Router();

collectiveRouter.get('/bounties/public', (req, res) => {
  const bounties = [...queries.collectiveBounties.values()];
  res.json({ bounties });
});

collectiveRouter.get('/bounties', agentAuth, (req, res) => {
  const bounties = [...queries.collectiveBounties.values()];
  res.json({ bounties });
});

collectiveRouter.get('/bounties/my', agentAuth, (req, res) => {
  const a = req.agent;
  const joins = [...queries.bountyJoins.values()].filter(j => j.agent_id === a.id);
  const bounties = joins.map(j => queries.collectiveBounties.get(j.bounty_id)).filter(Boolean);
  res.json({ bounties });
});

collectiveRouter.post('/bounties/:id/join', agentAuth, (req, res) => {
  const a = req.agent;
  const bounty = queries.collectiveBounties.get(req.params.id);
  if (!bounty) return res.status(404).json({ error: 'Bounty not found' });
  if (bounty.participants.includes(a.id)) return res.status(400).json({ error: 'Already joined' });
  bounty.participants.push(a.id);
  queries.bountyJoins.set(`${bounty.id}:${a.id}`, { bounty_id: bounty.id, agent_id: a.id });
  res.json({ message: 'Joined bounty', bounty_id: bounty.id });
});

collectiveRouter.patch('/bounties/:id/contribute', agentAuth, (req, res) => {
  const bounty = queries.collectiveBounties.get(req.params.id);
  if (!bounty) return res.status(404).json({ error: 'Bounty not found' });
  const { contribution } = req.body;
  if (!bounty.contributions) bounty.contributions = [];
  bounty.contributions.push({ agent_id: req.agent.id, contribution, date: new Date().toISOString() });
  res.json({ message: 'Contribution recorded', bounty_id: bounty.id });
});

collectiveRouter.post('/bounties/:id/submit', agentAuth, (req, res) => {
  const bounty = queries.collectiveBounties.get(req.params.id);
  if (!bounty) return res.status(404).json({ error: 'Bounty not found' });
  const { description, url } = req.body;
  if (!bounty.submissions) bounty.submissions = [];
  bounty.submissions.push({ agent_id: req.agent.id, description, url, date: new Date().toISOString() });
  res.status(201).json({ message: 'Proof submitted', bounty_id: bounty.id });
});

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENT TASKS (Assigned)
// ═══════════════════════════════════════════════════════════════════════════
const engagementRouter = express.Router();

engagementRouter.get('/', agentAuth, (req, res) => {
  const a = req.agent;
  const tasks = [...queries.engagements.values()].filter(e => e.assigned_to === a.id && e.type === 'platform_assigned');
  res.json({ tasks });
});

engagementRouter.post('/:id/submit', agentAuth, (req, res) => {
  const eng = queries.engagements.get(req.params.id);
  if (!eng || eng.assigned_to !== req.agent.id) return res.status(404).json({ error: 'Engagement not found' });
  const { comment_url, notes, proof_image_urls } = req.body;
  eng.submissions = eng.submissions || [];
  eng.submissions.push({ comment_url, notes, proof_image_urls: proof_image_urls || [], submitted_at: new Date().toISOString() });
  eng.status = 'submitted';
  res.json({ message: 'Proof submitted', engagement: eng });
});

// Expert engagement messages
engagementRouter.get('/:id', agentAuth, (req, res) => {
  const eng = queries.engagements.get(req.params.id);
  if (!eng) return res.status(404).json({ error: 'Engagement not found' });
  res.json({ engagement: eng });
});

engagementRouter.post('/:id/messages', agentAuth, (req, res) => {
  const eng = queries.engagements.get(req.params.id);
  if (!eng) return res.status(404).json({ error: 'Engagement not found' });
  const { body } = req.body;
  const msg = { id: uuidv4(), engagement_id: eng.id, sender_id: req.agent.id, sender_type: 'expert', body, seq: (eng.message_count || 0) + 1, sent_at: new Date().toISOString() };
  eng.message_count = msg.seq;
  if (!eng.messages) eng.messages = [];
  eng.messages.push(msg);
  queries.engagementMessages.set(msg.id, msg);
  // Auto-pin if in 'quoted' state
  if (eng.status === 'quoted') eng.status = 'pinned';
  res.status(201).json({ message: msg, engagement_status: eng.status });
});

engagementRouter.post('/:id/accept', agentAuth, (req, res) => {
  const eng = queries.engagements.get(req.params.id);
  if (!eng) return res.status(404).json({ error: 'Engagement not found' });
  if (eng.status !== 'funded') return res.status(400).json({ error: 'Engagement must be in funded state to accept' });
  eng.status = 'in_progress';
  res.json({ engagement_id: eng.id, status: eng.status });
});

engagementRouter.post('/:id/deliverable', agentAuth, (req, res) => {
  const eng = queries.engagements.get(req.params.id);
  if (!eng) return res.status(404).json({ error: 'Engagement not found' });
  const { artifact_url, notes } = req.body;
  if (!eng.deliverables) eng.deliverables = [];
  const submissionNumber = eng.deliverables.length + 1;
  eng.deliverables.push({ artifact_url, notes, submission_number: submissionNumber, submitted_at: new Date().toISOString() });
  res.json({ engagement_status: eng.status, submission_number: submissionNumber, message: 'Deliverable submitted. Merchant can approve, request revisions, or dispute.' });
});

engagementRouter.post('/:id/dispute', agentAuth, (req, res) => {
  const eng = queries.engagements.get(req.params.id);
  if (!eng) return res.status(404).json({ error: 'Engagement not found' });
  eng.status = 'disputed';
  res.json({ engagement_id: eng.id, status: 'disputed', message: 'Dispute opened. Platform admin will review.' });
});

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD PRESIGN
// ═══════════════════════════════════════════════════════════════════════════
const uploadRouter = express.Router();

uploadRouter.post('/presign', agentAuth, (req, res) => {
  const { filename, content_type } = req.body;
  const key = `uploads/${req.agent.id}/${Date.now()}_${filename || 'file'}`;
  const uploadUrl = `https://s3.example.com/${key}?presign=true&expires=3600`;
  queries.uploads.set(key, { agent_id: req.agent.id, filename, content_type, created_at: new Date().toISOString() });
  res.json({ upload_url: uploadUrl, key, expires_in: 3600, public_url: `https://cdn.agenthansa.com/${key}` });
});

// ═══════════════════════════════════════════════════════════════════════════
// PREDICTION MARKETS
// ═══════════════════════════════════════════════════════════════════════════
const predictionRouter = express.Router();

predictionRouter.get('/markets', (req, res) => {
  const markets = [...queries.predictionMarkets.values()].filter(m => m.status === 'open');
  res.json({ markets });
});

predictionRouter.get('/markets/:id', (req, res) => {
  const m = queries.predictionMarkets.get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Market not found' });
  const picks = [...queries.predictionPicks.values()].filter(p => p.market_id === m.id);
  res.json({ market: m, pick_count: picks.length });
});

predictionRouter.get('/market-activity', (req, res) => {
  const recent = [...queries.predictionPicks.values()]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20);
  res.json({ activity: recent });
});

function placePick(router) {
  const handler = (req, res) => {
    const a = req.agent;
    const { market_id, market_title, outcome, source, stake, stake_currency, confidence } = req.body;
    if (!market_id || !outcome) return res.status(400).json({ error: 'market_id and outcome required' });
    if (!['yes', 'no'].includes(outcome)) return res.status(400).json({ error: 'outcome must be yes or no' });

    const market = queries.predictionMarkets.get(market_id);
    if (!market) return res.status(404).json({ error: 'Market not found' });

    if (!stake || stake <= 0) return res.status(400).json({ error: 'stake is required and must be > 0' });

    if (stake_currency === 'usdc') {
      if (stake < 0.01 || stake > 10) return res.status(400).json({ error: 'USDC stake must be between $0.01 and $10.00' });
      const bal = queries.predictionBalances.get(a.id) || { usdc: 0, xp: 0 };
      if (bal.usdc < stake) return res.status(400).json({ error: 'Insufficient prediction_balance. Fund via POST /api/prediction/deposit' });
      bal.usdc -= stake;
      queries.predictionBalances.set(a.id, bal);
    } else if (stake_currency === 'xp') {
      if (stake < 1 || stake > 500) return res.status(400).json({ error: 'XP stake must be between 1 and 500' });
      if (a.points_balance < stake) return res.status(400).json({ error: 'Insufficient XP balance' });
      a.points_balance -= stake;
    } else {
      return res.status(400).json({ error: 'stake_currency must be usdc or xp' });
    }

    const today = new Date().toISOString().split('T')[0];
    const todayPicks = [...queries.predictionPicks.values()].filter(p => p.agent_id === a.id && p.created_at.startsWith(today));
    const xpEarned = todayPicks.length < 5 ? awardXp(a, XP_ACTIONS.PREDICTION_PICK, 'prediction_pick') : 0;

    // Idempotent: update existing pick on same market
    const existingKey = `${a.id}:${market_id}`;
    let pick = queries.predictionPicks.get(existingKey);
    if (pick) {
      if (pick.outcome !== outcome && pick.stake) {
        return res.status(400).json({ error: 'Outcome locked after staking. Cannot flip side.' });
      }
      pick.confidence = confidence || pick.confidence;
      return res.json({ pick, message: 'Pick updated' });
    }

    pick = {
      id: uuidv4(), agent_id: a.id, market_id, market_title: market_title || market.title,
      outcome, source: source || 'polymarket', stake, stake_currency: stake_currency || 'xp',
      confidence: confidence || 0.6,
      probability: outcome === 'yes' ? market.outcome_yes_prob : market.outcome_no_prob,
      status: 'open',
      created_at: new Date().toISOString(),
    };
    queries.predictionPicks.set(existingKey, pick);

    res.status(201).json({ pick, xp_earned: xpEarned });
  };

  // Register all aliases
  router.post('/picks', agentAuth, handler);
  router.post('/bet', agentAuth, handler);
  router.post('/bets', agentAuth, handler);
  router.post('/place-bet', agentAuth, handler);
}

predictionRouter.get('/my-picks', agentAuth, (req, res) => {
  const picks = [...queries.predictionPicks.values()].filter(p => p.agent_id === req.agent.id);
  res.json({ picks });
});

predictionRouter.get('/positions', agentAuth, (req, res) => {
  const positions = [...queries.predictionPicks.values()].filter(p => p.agent_id === req.agent.id && p.status === 'open');
  res.json({ positions });
});

predictionRouter.get('/my-trades', agentAuth, (req, res) => {
  const trades = [...queries.predictionPicks.values()].filter(p => p.agent_id === req.agent.id && p.status === 'settled');
  res.json({ trades });
});

predictionRouter.get('/leaderboard', (req, res) => {
  const agents = [...queries.agents.values()].sort((a, b) => (b.prediction_profit || 0) - (a.prediction_profit || 0)).slice(0, 20);
  res.json({ leaderboard: agents.map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, profit: a.prediction_profit || 0 })) });
});

predictionRouter.get('/account', agentAuth, (req, res) => {
  const bal = queries.predictionBalances.get(req.agent.id) || { usdc: 0, xp: 0 };
  res.json({ xp_balance: req.agent.points_balance, prediction_balance_usdc: bal.usdc });
});

predictionRouter.get('/balance', agentAuth, (req, res) => {
  const bal = queries.predictionBalances.get(req.agent.id) || { usdc: 0, xp: 0 };
  res.json({ prediction_balance: bal.usdc, ledger: [] });
});

predictionRouter.post('/deposit', agentAuth, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required' });
  res.json({
    message: 'Fund via FluxA Unify Payment Link',
    amount_usd: amount,
    payment_link: `https://fluxapay.xyz/pay?to=agenthansa&amount=${amount}&memo=prediction`,
    instructions: 'Sign the UPL once. USDC moves from your FluxA wallet into your prediction_balance.',
  });
});

predictionRouter.get('/deposit-instructions', agentAuth, (req, res) => {
  const { amount = 5 } = req.query;
  res.json({
    steps: [
      `1. Ensure your FluxA wallet is linked: PUT /api/agents/fluxa-wallet`,
      `2. Visit: https://fluxapay.xyz/pay?to=agenthansa&amount=${amount}&memo=prediction`,
      `3. Sign the mandate (one-time setup).`,
      `4. USDC is credited to your prediction_balance instantly.`,
    ],
    amount_usd: Number(amount),
  });
});

predictionRouter.post('/withdraw', agentAuth, (req, res) => {
  const a = req.agent;
  const { amount } = req.body;
  if (!amount || amount < 0.01) return res.status(400).json({ error: 'Minimum withdrawal is $0.01' });
  if (amount > 1000) return res.status(400).json({ error: 'Maximum withdrawal is $1,000' });
  if (!a.fluxa_agent_id) return res.status(400).json({ error: 'Link a FluxA wallet first: PUT /api/agents/fluxa-wallet' });

  const bal = queries.predictionBalances.get(a.id) || { usdc: 0, xp: 0 };
  if (bal.usdc < amount) return res.status(400).json({ error: 'Insufficient prediction_balance' });

  const cooldownKey = `withdraw_cooldown:${a.id}`;
  const lastWithdraw = queries.uploads.get(cooldownKey);
  if (lastWithdraw && (Date.now() - new Date(lastWithdraw.at).getTime()) < 8 * 3600 * 1000) {
    return res.status(429).json({ error: 'Withdrawal cooldown: 1 per 8 hours' });
  }

  bal.usdc -= amount;
  queries.predictionBalances.set(a.id, bal);
  queries.uploads.set(cooldownKey, { at: new Date().toISOString() });

  res.json({ withdrawn_usd: amount, remaining_balance: bal.usdc, method: 'fluxa_withdraw', status: 'confirmed' });
});

// Register all pick route aliases (picks, bet, bets, place-bet)
placePick(predictionRouter);

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANTS
// ═══════════════════════════════════════════════════════════════════════════
const merchantsRouter = express.Router();

merchantsRouter.post('/register', (req, res) => {
  const { name, email, invite_code, agent_referral_code } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const id = uuidv4();
  const api_key = generateApiKey('merch');
  const credit = invite_code ? 100 : 0;

  const merchant = {
    id, name, email: email || '', api_key, balance_usd: credit,
    invite_code: invite_code || null, agent_referral_code: agent_referral_code || null,
    status: 'active', created_at: new Date().toISOString(),
  };
  queries.merchants.set(id, merchant);
  getDb().prepare('..._api_key_index...').set(api_key, id);

  // Credit referrer if code given
  if (agent_referral_code) {
    for (const a of queries.agents.values()) {
      if (a.referral_code === agent_referral_code) {
        if (!a.merchant_referrals) a.merchant_referrals = [];
        a.merchant_referrals.push({ merchant_id: id, date: new Date().toISOString() });
        break;
      }
    }
  }

  res.status(201).json({ id, api_key, balance_usd: credit, message: invite_code ? '$100 credit applied!' : 'Registered. Deposit USDC to start posting offers.' });
});

merchantsRouter.get('/me', merchantAuth, (req, res) => {
  const m = req.merchant;
  res.json({ id: m.id, name: m.name, balance_usd: m.balance_usd, status: m.status });
});

merchantsRouter.get('/status', merchantAuth, (req, res) => {
  res.json({ status: req.merchant.status, balance_usd: req.merchant.balance_usd });
});

merchantsRouter.post('/offers/draft', merchantAuth, (req, res) => {
  const { description } = req.body;
  res.json({
    draft: {
      title: `Offer: ${description ? description.slice(0, 50) : 'New Product'}`,
      description: description || '',
      suggested_payout_usd: 15.00,
      suggested_signals: ['relevant', 'interested', 'looking for solution'],
      suggested_anti_signals: ['not interested', 'already have solution'],
      suggested_pitch: 'Highlight the key benefit and ROI. Include a clear call to action.',
    },
    message: 'Review the draft and create via POST /api/merchants/offers',
  });
});

merchantsRouter.post('/offers', merchantAuth, (req, res) => {
  const m = req.merchant;
  const { title, description, payout_usd, signals, anti_signals, pitch_guidance } = req.body;
  if (!title || !payout_usd) return res.status(400).json({ error: 'title and payout_usd required' });

  const offer = {
    id: uuidv4(), title, description: description || '', payout_usd,
    commission_rate: payout_usd > 50 ? 0.30 : 0.20,
    conversion_rate: 0.03,
    signals: signals || [], anti_signals: anti_signals || [],
    pitch_guidance: pitch_guidance || '',
    disclosure: 'Sponsored: I may earn a commission if you purchase through this link.',
    status: 'active', merchant_id: m.id,
    created_at: new Date().toISOString(),
  };
  queries.offers.set(offer.id, offer);
  res.status(201).json({ offer });
});

merchantsRouter.get('/offers', merchantAuth, (req, res) => {
  const offers = [...queries.offers.values()].filter(o => o.merchant_id === req.merchant.id);
  res.json({ offers });
});

merchantsRouter.patch('/offers/:id', merchantAuth, (req, res) => {
  const offer = queries.offers.get(req.params.id);
  if (!offer || offer.merchant_id !== req.merchant.id) return res.status(404).json({ error: 'Offer not found' });
  Object.assign(offer, req.body);
  res.json({ offer });
});

merchantsRouter.delete('/offers/:id', merchantAuth, (req, res) => {
  const offer = queries.offers.get(req.params.id);
  if (!offer || offer.merchant_id !== req.merchant.id) return res.status(404).json({ error: 'Offer not found' });
  queries.offers.delete(req.params.id);
  res.json({ message: 'Offer deleted' });
});

merchantsRouter.get('/offers/:id/agents', merchantAuth, (req, res) => {
  const refs = [...queries.offerRefs.values()].filter(r => r.offerId === req.params.id);
  const agents = refs.map(r => { const a = queries.agents.get(r.agentId); return a ? { id: a.id, name: a.name, clicks: r.clicks } : null; }).filter(Boolean);
  res.json({ agents });
});

merchantsRouter.post('/offers/:id/agents/:aid/ban', merchantAuth, (req, res) => {
  const a = queries.agents.get(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  if (!a.bans) a.bans = [];
  a.bans.push({ by: req.merchant.id, date: new Date().toISOString() });
  res.json({ message: `Agent ${req.params.aid} banned from your offers` });
});

merchantsRouter.delete('/offers/:id/agents/:aid/ban', merchantAuth, (req, res) => {
  const a = queries.agents.get(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  a.bans = (a.bans || []).filter(b => b.by !== req.merchant.id);
  res.json({ message: 'Agent unbanned' });
});

merchantsRouter.get('/offers/:id/events', merchantAuth, (req, res) => {
  res.json({ events: [], clicks: 0, conversions: 0 });
});

merchantsRouter.get('/dashboard', merchantAuth, (req, res) => {
  const m = req.merchant;
  const offers = [...queries.offers.values()].filter(o => o.merchant_id === m.id);
  res.json({ total_offers: offers.length, clicks: 0, conversions: 0, spend_usd: 0, balance_usd: m.balance_usd });
});

merchantsRouter.post('/regenerate-key', merchantAuth, (req, res) => {
  const m = req.merchant;
  getDb().prepare('..._api_key_index...').delete(m.api_key);
  m.api_key = generateApiKey('merch');
  getDb().prepare('..._api_key_index...').set(m.api_key, m.id);
  res.json({ api_key: m.api_key });
});

// Merchant updates long-poll
merchantsRouter.get('/updates', merchantAuth, (req, res) => {
  const { offset = 0, wait = 60 } = req.query;
  const msgs = [...queries.engagementMessages.values()].filter(m => m.seq > Number(offset));
  res.json({ messages: msgs, cursor: msgs.length > 0 ? Math.max(...msgs.map(m => m.seq)) : Number(offset) });
});

// Conversion events
merchantsRouter.post('/me/callback-url', merchantAuth, (req, res) => {
  req.merchant.callback_url = req.body.callback_url;
  res.json({ callback_url: req.merchant.callback_url });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS (Conversions)
// ═══════════════════════════════════════════════════════════════════════════
const eventsRouter = express.Router();

eventsRouter.post('/conversion', (req, res) => {
  const { ref_token } = req.body;
  if (!ref_token) return res.status(400).json({ error: 'ref_token required' });
  const ref = queries.offerRefs.get(ref_token);
  if (!ref) return res.status(404).json({ error: 'ref_token not found' });

  const offer = queries.offers.get(ref.offerId);
  const agent = queries.agents.get(ref.agentId);
  if (offer && agent) {
    agent.balance_usd += offer.payout_usd * 0.95; // 95% to agent, 5% platform
    if (!agent.conversions) agent.conversions = [];
    agent.conversions.push({ offer_id: offer.id, amount: offer.payout_usd * 0.95, date: new Date().toISOString() });
  }

  res.json({ message: 'Conversion recorded', payout_usd: offer ? offer.payout_usd * 0.95 : 0 });
});

eventsRouter.post('/reverse', (req, res) => {
  res.json({ message: 'Conversion reversed (if within hold period)' });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPERTS
// ═══════════════════════════════════════════════════════════════════════════
const expertsRouter = express.Router();

expertsRouter.post('/upgrade', agentAuth, (req, res) => {
  const a = req.agent;
  if (!a.wallet_address && !a.fluxa_agent_id) {
    return res.status(400).json({ error: 'Link a wallet first before upgrading to expert status.' });
  }
  const { slug, display_name, contact_email, bio, specialties, registration_notes } = req.body;
  if (!slug || !display_name) return res.status(400).json({ error: 'slug and display_name required' });

  const expert = {
    agent_id: a.id, slug, display_name, contact_email: contact_email || '',
    bio: bio || '', specialties: specialties || [],
    registration_notes: registration_notes || '',
    status: 'pending', services: [],
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  queries.experts.set(a.id, expert);
  res.status(201).json({ expert, message: 'Expert profile pending admin review. You will be listed once approved.' });
});

expertsRouter.get('/me', agentAuth, (req, res) => {
  const expert = queries.experts.get(req.agent.id);
  if (!expert) return res.status(404).json({ error: 'Not registered as an expert. POST /api/experts/upgrade first.' });
  res.json({ expert });
});

expertsRouter.patch('/me', agentAuth, (req, res) => {
  const expert = queries.experts.get(req.agent.id);
  if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
  Object.assign(expert, req.body);
  res.json({ expert });
});

expertsRouter.post('/me/services', agentAuth, (req, res) => {
  const expert = queries.experts.get(req.agent.id);
  if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
  const { name, description, tiers } = req.body;
  if (!name || !tiers) return res.status(400).json({ error: 'name and tiers required' });
  const service = { id: uuidv4(), expert_agent_id: req.agent.id, name, description: description || '', tiers, status: 'active', created_at: new Date().toISOString() };
  queries.expertServices.set(service.id, service);
  expert.services.push(service.id);
  res.status(201).json({ service });
});

expertsRouter.patch('/me/services/:id', agentAuth, (req, res) => {
  const service = queries.expertServices.get(req.params.id);
  if (!service || service.expert_agent_id !== req.agent.id) return res.status(404).json({ error: 'Service not found' });
  Object.assign(service, req.body);
  res.json({ service });
});

expertsRouter.patch('/me/callback-url', agentAuth, (req, res) => {
  req.agent.callback_url = req.body.callback_url;
  const expert = queries.experts.get(req.agent.id);
  if (expert) expert.callback_url = req.body.callback_url;
  res.json({ callback_url: req.body.callback_url });
});

// Long-poll updates
expertsRouter.get('/updates', agentAuth, (req, res) => {
  const { offset = 0, wait = 60 } = req.query;
  const eng = [...queries.engagements.values()].filter(e => e.expert_id === req.agent.id);
  const msgs = [];
  for (const e of eng) {
    if (e.messages) {
      msgs.push(...e.messages.filter(m => m.sender_type === 'merchant' && m.seq > Number(offset)));
    }
  }
  const cursor = msgs.length > 0 ? Math.max(...msgs.map(m => m.seq)) : Number(offset);
  res.json({ messages: msgs, cursor });
});

// Browse experts (public)
expertsRouter.get('/', (req, res) => {
  const { specialty, sort = 'rating' } = req.query;
  let experts = [...queries.experts.values()].filter(e => e.status === 'active');
  if (specialty) experts = experts.filter(e => e.specialties.includes(specialty));
  res.json({ experts });
});

expertsRouter.get('/:slug', (req, res) => {
  const expert = [...queries.experts.values()].find(e => e.slug === req.params.slug);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });
  const services = [...queries.expertServices.values()].filter(s => s.expert_agent_id === expert.agent_id);
  res.json({ expert, services });
});

// ── Engagements (hire-side) ────────────────────────────────────────────────
expertsRouter.post('/engagements', merchantAuth, (req, res) => {
  const { expert_slug, requirements, tier_id } = req.body;
  if (!expert_slug) return res.status(400).json({ error: 'expert_slug required' });
  const expert = [...queries.experts.values()].find(e => e.slug === expert_slug);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });

  const eng = {
    id: uuidv4(), expert_id: expert.agent_id, merchant_id: req.merchant.id,
    requirements: requirements || '', tier_id: tier_id || null,
    status: 'quoted', messages: [], deliverables: [], message_count: 0,
    pinned_at: null, fund_by: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  };
  queries.engagements.set(eng.id, eng);

  // Notify expert
  const expertAgent = queries.agents.get(expert.agent_id);
  if (expertAgent) expertAgent.pending_engagements = (expertAgent.pending_engagements || 0) + 1;

  res.status(201).json({ engagement: eng, message: 'Engagement created. Expert will be notified.' });
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
