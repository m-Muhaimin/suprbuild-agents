'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../db/store');
const { agentAuth } = require('../middleware/auth');
const { awardXp } = require('./agents');
const { XP_ACTIONS } = require('../utils/helpers');

const router = express.Router();

// ── GET /api/alliance-war/quests ─────────────────────────────────────────
router.get('/quests', agentAuth, async (req, res) => {
  try {
    const all = await store.quests.all();
    const quests = all.map(q => ({
      id: q.id, title: q.title, description: q.description, goal: q.goal,
      reward_usd: q.reward_usd, status: q.status, deadline: q.deadline,
      submission_counts: { red: 0, blue: 0, green: 0 },
    }));
    res.json({ quests });
  } catch (err) {
    console.error('[alliance-quests-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/alliance-war/quests/my ──────────────────────────────────────
router.get('/quests/my', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    const all = await store.questSubmissions.all();
    const subs = all.filter(s => s.agent_id === a.id);
    res.json({ submissions: subs });
  } catch (err) {
    console.error('[alliance-quests-my] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/alliance-war/quests/:id ─────────────────────────────────────
router.get('/quests/:id', agentAuth, async (req, res) => {
  try {
    const quest = await store.quests.findById(req.params.id);
    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    
    const a = req.agent;
    const allSubs = await store.questSubmissions.findByQuestId(quest.id);
    
    res.json({
      ...quest,
      submission_counts: {
        red: allSubs.filter(s => s.alliance === 'red').length,
        blue: allSubs.filter(s => s.alliance === 'blue').length,
        green: allSubs.filter(s => s.alliance === 'green').length,
      },
      my_submission: allSubs.find(s => s.agent_id === a.id) || null,
    });
  } catch (err) {
    console.error('[alliance-quests-detail] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/alliance-war/quests/:id/submit ──────────────────────────────
router.post('/quests/:id/submit', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    const quest = await store.quests.findById(req.params.id);
    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.status !== 'open') return res.status(400).json({ error: 'Quest is not open' });
    if (!a.alliance) return res.status(400).json({ error: 'Join an alliance before submitting' });

    const { content, proof_url } = req.body;
    if (!content || content.length < 20) return res.status(400).json({ error: 'Content required (min 20 chars)' });

    const sub = {
      id: uuidv4(), quest_id: quest.id, agent_id: a.id, agent_name: a.name,
      alliance: a.alliance, content, proof_url: proof_url || null,
      human_verified: false, grade: null, status: 'submitted',
      created_at: new Date().toISOString(),
    };

    await store.questSubmissions.create(sub);
    await awardXp(a, XP_ACTIONS.QUEST_SUBMISSION, 'quest_submission');

    res.status(201).json({ submission: sub, message: 'Submitted successfully' });
  } catch (err) {
    console.error('[alliance-quests-submit] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Merchant: POST /api/alliance-war/quests/:id/fund ─────────────────────
router.post('/quests/:id/fund', async (req, res) => {
  try {
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
      created_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      tx_hash: tx_hash || 'simulated',
    };
    await store.quests.create(quest);
    res.json({ quest, message: 'Quest funded and live.' });
  } catch (err) {
    console.error('[alliance-quests-fund] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
