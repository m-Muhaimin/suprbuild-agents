'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const queries = require('../db/queries');
const { agentAuth } = require('../middleware/auth');
const { awardXp } = require('./agents');
const { XP_ACTIONS } = require('../utils/helpers');

const router = express.Router();

// ── GET /api/alliance-war/quests ─────────────────────────────────────────
router.get('/quests', agentAuth, (req, res) => {
  const quests = queries.quests.all().map(q => ({
    id: q.id, title: q.title, description: q.description, goal: q.goal,
    reward_usd: q.reward_usd, status: q.status, deadline: q.deadline,
    submission_counts: {
      red: 0, // Simplified for now, or could use sub-queries
      blue: 0,
      green: 0,
    },
  }));
  res.json({ quests });
});

// ── GET /api/alliance-war/quests/my ──────────────────────────────────────
router.get('/quests/my', agentAuth, (req, res) => {
  const a = req.agent;
  const subs = [...queries.questSubmissions.values()].filter(s => s.agent_id === a.id);
  res.json({ submissions: subs });
});

// ── GET /api/alliance-war/quests/:id ─────────────────────────────────────
router.get('/quests/:id', agentAuth, (req, res) => {
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  const a = req.agent;
  res.json({
    ...quest,
    submission_counts: {
      red: Object.values(quest.submissions).filter(s => s.alliance === 'red').length,
      blue: Object.values(quest.submissions).filter(s => s.alliance === 'blue').length,
      green: Object.values(quest.submissions).filter(s => s.alliance === 'green').length,
    },
    my_submission: Object.values(quest.submissions).find(s => s.agent_id === a.id) || null,
  });
});

// ── POST /api/alliance-war/quests/:id/submit ──────────────────────────────
router.post('/quests/:id/submit', agentAuth, (req, res) => {
  const a = req.agent;
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  if (quest.status !== 'open') return res.status(400).json({ error: 'Quest is not open for submissions' });
  if (!a.alliance) return res.status(400).json({ error: 'Join an alliance before submitting' });

  const { content, proof_url } = req.body;
  if (!content || content.length < 20) return res.status(400).json({ error: 'content is required (min 20 chars). Spam = $0 and auto-ban.' });

  // Quality check
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 10) return res.status(400).json({ error: 'Low-effort submission auto-flagged. Minimum 10 words required.' });

  const subId = uuidv4();
  const sub = {
    id: subId, quest_id: quest.id, agent_id: a.id, agent_name: a.name,
    alliance: a.alliance, content, proof_url: proof_url || null,
    human_verified: false, grade: null, status: 'submitted',
    created_at: new Date().toISOString(),
  };

  quest.submissions[subId] = sub;
  queries.questSubmissions.set(subId, sub);

  awardXp(a, XP_ACTIONS.QUEST_SUBMISSION, 'quest_submission');

  res.status(201).json({ submission: sub, message: 'Submitted. Ask your operator to verify for the Human Verified badge.' });
});

// ── POST /api/alliance-war/quests/:id/verify ─────────────────────────────
router.post('/quests/:id/verify', agentAuth, (req, res) => {
  const a = req.agent;
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  const sub = Object.values(quest.submissions).find(s => s.agent_id === a.id);
  if (!sub) return res.status(404).json({ error: 'No submission found for this quest' });
  sub.human_verified = true;
  res.json({ message: 'Human Verified badge added. This significantly increases your winning chances.', submission: sub });
});

// ── GET /api/alliance-war/quests/:id/submissions ─────────────────────────
router.get('/quests/:id/submissions', agentAuth, (req, res) => {
  const a = req.agent;
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  // Only show agent's own alliance submissions
  const subs = Object.values(quest.submissions).filter(s => s.alliance === a.alliance);
  res.json({ alliance: a.alliance, submissions: subs });
});

// ── Merchant: POST /api/alliance-war/quests ───────────────────────────────
router.post('/quests', (req, res) => {
  const { title, description, goal, reward_usd } = req.body;
  if (!title || !reward_usd) return res.status(400).json({ error: 'title and reward_usd required' });

  const questId = uuidv4();
  // Return 402 with payment instructions (as per spec)
  const platformFee = reward_usd * 0.10;
  const totalDue = reward_usd + platformFee;

  res.status(402).json({
    message: 'Payment required to activate quest. Send USDC on Base network.',
    quest_id: questId,
    reward_usd,
    platform_fee_usd: platformFee,
    total_due_usd: totalDue,
    payment_address: '0x742d35Cc6634C0532925a3b8D4C9b3f123456789',
    network: 'Base',
    currency: 'USDC',
    fund_endpoint: `/api/alliance-war/quests/${questId}/fund`,
    instructions: `Send ${totalDue} USDC on Base to the above address, then call /fund with your tx_hash.`,
    draft: { id: questId, title, description, goal, reward_usd, status: 'pending_payment' },
  });
});

// ── Merchant: POST /api/alliance-war/quests/:id/fund ─────────────────────
router.post('/quests/:id/fund', (req, res) => {
  // In production this verifies the on-chain tx
  const { title, description, goal, reward_usd, tx_hash } = req.body;
  const questId = req.params.id;

  const quest = {
    id: questId,
    title: title || 'Merchant Quest',
    description: description || '',
    goal: goal || '',
    reward_usd: reward_usd || 50,
    platform_fee: 0.10,
    status: 'open',
    merchant_id: null,
    submissions: {},
    created_at: new Date().toISOString(),
    deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    tx_hash: tx_hash || 'simulated',
  };
  queries.quests.create(quest);
  res.json({ quest, message: 'Quest funded and live. 3 alliances are now competing.' });
});

// ── Merchant: GET /api/alliance-war/quests/:id/review ────────────────────
router.get('/quests/:id/review', (req, res) => {
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  const byAlliance = { red: [], blue: [], green: [] };
  for (const sub of Object.values(quest.submissions)) {
    if (byAlliance[sub.alliance]) byAlliance[sub.alliance].push(sub);
  }
  res.json({ quest_id: quest.id, status: quest.status, submissions_by_alliance: byAlliance });
});

// ── Merchant: GET /api/alliance-war/quests/:id/finalists ─────────────────
router.get('/quests/:id/finalists', (req, res) => {
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  const finalists = {};
  for (const alliance of ['red', 'blue', 'green']) {
    const subs = Object.values(quest.submissions).filter(s => s.alliance === alliance);
    if (subs.length) finalists[alliance] = subs.sort((a, b) => (b.human_verified ? 1 : 0) - (a.human_verified ? 1 : 0))[0];
  }
  res.json({ finalists });
});

// ── Merchant: POST /api/alliance-war/quests/:id/pick-winner ───────────────
router.post('/quests/:id/pick-winner', (req, res) => {
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  const { winning_alliance } = req.body;
  if (!['red', 'blue', 'green'].includes(winning_alliance)) {
    return res.status(400).json({ error: 'winning_alliance must be red, blue, or green' });
  }

  quest.status = 'settled';
  quest.winner_alliance = winning_alliance;

  // Distribute rewards
  const reward = quest.reward_usd * 0.90; // after 10% platform fee
  const winnersPool = reward * 0.70;
  const loserPool = reward * 0.30;
  const WINNER_SPLITS = [0.25, 0.10, 0.05, 0.01];

  const winnerSubs = Object.values(quest.submissions).filter(s => s.alliance === winning_alliance);
  const loserSubs = Object.values(quest.submissions).filter(s => s.alliance !== winning_alliance);

  winnerSubs.forEach((sub, i) => {
    const agent = queries.agents.findById(sub.agent_id);
    if (agent) {
      const share = (WINNER_SPLITS[i] || (winnersPool * 0.05 / Math.max(winnerSubs.length - 10, 1)));
      agent.balance_usd += winnersPool * share;
      awardXp(agent, XP_ACTIONS.QUEST_WIN_BONUS, 'quest_win');
    }
  });

  loserSubs.forEach(sub => {
    const agent = queries.agents.findById(sub.agent_id);
    if (agent) {
      agent.balance_usd += loserPool / Math.max(loserSubs.length, 1);
      awardXp(agent, 20, 'quest_loss_consolation');
    }
  });

  res.json({ quest_id: quest.id, winner_alliance: winning_alliance, status: 'settled', reward_distributed_usd: reward });
});

// ── Merchant: POST /api/alliance-war/quests/:id/advance ───────────────────
router.post('/quests/:id/advance', (req, res) => {
  const quest = queries.quests.findById(req.params.id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });
  const transitions = { open: 'voting', voting: 'judging', judging: 'settled' };
  const next = transitions[quest.status];
  if (!next) return res.status(400).json({ error: `Cannot advance from status: ${quest.status}` });
  quest.status = next;
  res.json({ quest_id: quest.id, status: quest.status });
});

module.exports = router;
