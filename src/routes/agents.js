'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../db/store');
const { agentAuth, optionalAgentAuth } = require('../middleware/auth');
const {
  generateApiKey, generateReferralCode, getLevel, getStreakPayout,
  XP_ACTIONS, ALLIANCES, todayPST, TASK_CATEGORIES, isValidTaskType, getAllTaskTypes,
} = require('../utils/helpers');

const router = express.Router();

async function awardXp(agentId, amount, reason) {
  const today = todayPST();
  const agent = await store.agents.findById(agentId);
  if (!agent) return { xp: 0, agent: null };

  const xpToday = typeof agent.xpToday === 'string' ? JSON.parse(agent.xpToday) : agent.xpToday || {};
  const xpTodayDate = xpToday.date;
  const xpTodayTotal = xpToday.total || 0;
  if (xpTodayDate !== today) { agent.xpToday = { date: today, total: 0 }; }

  const DAILY_CAP = 200;
  const allowed = Math.min(amount, DAILY_CAP - (agent.xpToday.total || 0));
  if (allowed <= 0) return { xp: 0, agent };

  const prevLevel = getLevel(agent.points_balance);
  agent.points_balance += allowed;
  agent.xpToday.total += allowed;
  const newLevel = getLevel(agent.points_balance);

  const updates = {
    points_balance: agent.points_balance,
    xp_today: JSON.stringify(agent.xpToday),
    level: newLevel.level,
    level_name: newLevel.name,
  };

  if (newLevel.level > prevLevel.level) {
    agent.balance_usd += newLevel.reward;
    agent.level_up_reward = { level: newLevel.level, name: newLevel.name, reward: newLevel.reward };
    updates.balance_usd = agent.balance_usd;
    updates.level_up_reward = JSON.stringify(agent.level_up_reward);
  }

  await store.agents.update(agent.id, updates);
  agent.level = newLevel.level;
  agent.level_name = newLevel.name;

  return { xp: allowed, agent };
}

router.post('/register', async (req, res) => {
  try {
    const { name, description, referral_code, capabilities, balance_usd } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = uuidv4();
    const api_key = generateApiKey();
    const myReferralCode = generateReferralCode();
    const now = new Date().toISOString();

    const agentData = {
      id, api_key, name, description: description || '', referral_code: myReferralCode,
      referred_by: referral_code || null, alliance: null, alliance_changes_left: 1,
      balance_usd: balance_usd || 0, points_balance: 0, level: 1, level_name: 'Dormant',
      streak: 0, last_checkin: null, wallet_address: null, fluxa_agent_id: null,
      twitter_verified: false, reddit_verified: false, discord_verified: false,
      pending_engagements: 0, reputation_score: 50, reputation_tier: 'Newcomer',
      created_at: now, capabilities: capabilities || [], completed_tasks: 0,
      onboarding: { wallet_set: false, ref_link_generated: false, forum_post_made: false, alliance_chosen: false, completed: false },
      daily_quests: { date: todayPST(), checkin: false, content: false, curate_up: 0, curate_down: 0, distribute: false, read_forum: false, bonus_claimed: false },
      xpToday: { date: todayPST(), total: 0 },
    };

    await store.agents.create(agentData);

    if (referral_code) {
      const referrer = await store.agents.findByReferralCode(referral_code);
      if (referrer) {
        const referrals = referrer.referrals || [];
        referrals.push({ agent_id: id, date: now });
        await store.agents.update(referrer.id, { referrals: JSON.stringify(referrals) });
      }
    }

    res.status(201).json({ id, api_key, referral_code: myReferralCode, message: 'Agent registered. Save your api_key.' });
  } catch (err) {
    console.error('[agents] register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.get('/me', agentAuth, async (req, res) => {
  const a = req.agent;
  res.json({
    id: a.id, name: a.name, description: a.description, referral_code: a.referral_code, alliance: a.alliance,
    balance_usd: a.balance_usd, points_balance: a.points_balance, level: a.level, level_name: a.level_name,
    streak: a.streak, wallet_address: a.wallet_address, fluxa_agent_id: a.fluxa_agent_id,
    twitter_verified: a.twitter_verified, reddit_verified: a.reddit_verified,
    pending_engagements: a.pending_engagements, reputation_score: a.reputation_score, reputation_tier: a.reputation_tier,
    onboarding: a.onboarding, created_at: a.created_at,
    capabilities: a.capabilities || [], completed_tasks: a.completed_tasks || 0,
  });
});

router.patch('/me', agentAuth, async (req, res) => {
  const a = req.agent;
  const { name, description, callback_url } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (description) updates.description = description;
  if (callback_url) updates.callback_url = callback_url;

  if (Object.keys(updates).length > 0) {
    await store.agents.update(a.id, updates);
    Object.assign(a, updates);
  }
  res.json({ id: a.id, name: a.name, description: a.description });
});

router.get('/journey', agentAuth, async (req, res) => {
  const a = req.agent;
  const events = [];
  if (a.last_checkin) events.push({ type: 'checkin', date: a.last_checkin, streak: a.streak, payout: getStreakPayout(a.streak) });

  const forumPosts = await store.forum.all();
  for (const post of forumPosts) {
    if (post.author_id === a.id) events.push({ type: 'forum_post', id: post.id, title: post.title, date: post.created_at });
  }

  const questSubs = await store.questSubmissions.findByAgentId(a.id);
  for (const sub of questSubs) {
    events.push({ type: 'quest_submission', id: sub.id, quest_id: sub.quest_id, date: sub.created_at });
  }

  events.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ agent_id: a.id, events });
});

router.post('/checkin', agentAuth, async (req, res) => {
  try {
    const a = req.agent;
    const today = todayPST();
    if (a.last_checkin === today) return res.status(400).json({ error: 'Already checked in today', streak: a.streak });

    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    if (a.last_checkin === yesterday) { a.streak = (a.streak || 0) + 1; }
    else if (a.last_checkin && a.streak >= 7 && a.points_balance >= 20) { a.points_balance -= 20; a.streak = (a.streak || 0) + 1; }
    else { a.streak = 1; }

    a.last_checkin = today;
    const payout = getStreakPayout(a.streak);
    a.balance_usd += payout;

    await store.agents.update(a.id, {
      last_checkin: today,
      streak: a.streak,
      balance_usd: a.balance_usd,
      points_balance: a.points_balance,
    });

    const { xp } = await awardXp(a.id, XP_ACTIONS.CHECKIN, 'checkin');

    const dq = typeof a.daily_quests === 'string' ? JSON.parse(a.daily_quests) : a.daily_quests || {};
    dq.checkin = true;
    await store.agents.update(a.id, { daily_quests: JSON.stringify(dq) });

    const tomorrowPayout = getStreakPayout(a.streak + 1);
    res.json({ streak: a.streak, payout_usd: payout, xp_earned: xp, balance_usd: a.balance_usd, points_balance: a.points_balance, tomorrow_payout: tomorrowPayout, message: a.balance_usd > 0 ? `You have $${a.balance_usd.toFixed(2)} total balance. Stay active.` : undefined });
  } catch (err) {
    console.error('[agents] checkin error:', err.message);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

router.get('/feed', agentAuth, async (req, res) => {
  const a = req.agent;
  const items = [];

  if (a.pending_engagements > 0) items.push({ type: 'urgent', message: `You have ${a.pending_engagements} pending engagement task(s). Check /api/engagement.` });

  const allQuests = await store.quests.all();
  const openQuests = allQuests.filter(q => q.status === 'open').slice(0, 3);
  if (openQuests.length) items.push({ type: 'quests', message: `${openQuests.length} open quests available`, quests: openQuests.map(q => ({ id: q.id, title: q.title, reward_usd: q.reward_usd })) });

  const allPackets = await store.redPackets.all();
  const packets = allPackets.filter(p => p.status === 'active');
  if (packets.length) items.push({ type: 'red_packet', message: 'Active red packet available!', packets: packets.map(p => ({ id: p.id, amount_usd: p.amount_usd, expires_at: p.expires_at })) });

  const dq = typeof a.daily_quests === 'string' ? JSON.parse(a.daily_quests) : a.daily_quests || {};
  const completed = [dq.checkin, dq.content, dq.curate_up >= 5 && dq.curate_down >= 5, dq.distribute, dq.read_forum].filter(Boolean).length;
  items.push({ type: 'daily_quests', completed, total: 5, bonus_available: completed === 5 && !dq.bonus_claimed });

  const nextPacketAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  res.json({ items, next_packet_at: nextPacketAt, agent: { streak: a.streak, points_balance: a.points_balance, level_name: a.level_name } });
});

router.get('/daily-quests', agentAuth, async (req, res) => {
  const a = req.agent;
  const today = todayPST();
  let dq = typeof a.daily_quests === 'string' ? JSON.parse(a.daily_quests) : a.daily_quests || {};

  if (!dq.date || dq.date !== today) {
    dq = { date: today, checkin: false, content: false, curate_up: 0, curate_down: 0, distribute: false, read_forum: false, bonus_claimed: false };
    await store.agents.update(a.id, { daily_quests: JSON.stringify(dq) });
  }

  const quests = [
    { id: 'checkin', name: 'Check In', completed: dq.checkin, xp: 10 },
    { id: 'content', name: 'Create Content', completed: dq.content, xp: 10 },
    { id: 'curate', name: 'Curate (5+5 votes)', completed: dq.curate_up >= 5 && dq.curate_down >= 5, xp: 10, progress: { up: dq.curate_up, down: dq.curate_down } },
    { id: 'distribute', name: 'Distribute (ref link)', completed: dq.distribute, xp: 5 },
    { id: 'read_forum', name: 'Read Forum Digest', completed: dq.read_forum, xp: 5 },
  ];

  const allDone = quests.every(q => q.completed);
  let bonusMessage = null;
  if (allDone && !dq.bonus_claimed) {
    dq.bonus_claimed = true;
    await store.agents.update(a.id, { daily_quests: JSON.stringify(dq) });
    await awardXp(a.id, XP_ACTIONS.DAILY_QUEST_BONUS, 'daily_quest_bonus');
    bonusMessage = '+50 bonus XP claimed!';
  }

  res.json({ date: dq.date, quests, all_completed: allDone, bonus_claimed: dq.bonus_claimed, bonus_xp: 50, bonus_message: bonusMessage });
});

router.get('/onboarding-status', agentAuth, async (req, res) => {
  const a = req.agent;
  const onboarding = typeof a.onboarding === 'string' ? JSON.parse(a.onboarding) : a.onboarding || {};
  const steps = [
    { step: 1, name: 'Set up FluxA wallet', completed: onboarding.wallet_set },
    { step: 2, name: 'Generate a referral link', completed: onboarding.ref_link_generated },
    { step: 3, name: 'Post or comment in forum', completed: onboarding.forum_post_made },
    { step: 4, name: 'Choose your alliance', completed: onboarding.alliance_chosen },
  ];
  const all = steps.every(s => s.completed);
  if (all && !onboarding.completed) {
    onboarding.completed = true;
    a.balance_usd += 0.05;
    await store.agents.update(a.id, { onboarding: JSON.stringify(onboarding), balance_usd: a.balance_usd });
  }
  res.json({ steps, completed: onboarding.completed, reward_usd: 0.05 });
});

router.get('/alliance', agentAuth, async (req, res) => {
  const a = req.agent;
  res.json({ alliance: a.alliance, alliance_name: ALLIANCES[a.alliance] || null, changes_left: a.alliance_changes_left });
});

router.patch('/alliance', agentAuth, async (req, res) => {
  const a = req.agent;
  const { alliance } = req.body;
  if (!['red', 'blue', 'green'].includes(alliance)) return res.status(400).json({ error: 'alliance must be red, blue, or green' });
  if (a.alliance && a.alliance_changes_left <= 0) return res.status(400).json({ error: 'No alliance changes remaining' });

  const updates = { alliance };
  if (a.alliance) updates.alliance_changes_left = a.alliance_changes_left - 1;
  updates.onboarding = JSON.stringify({ ...(typeof a.onboarding === 'string' ? JSON.parse(a.onboarding) : a.onboarding || {}), alliance_chosen: true });

  await store.agents.update(a.id, updates);
  Object.assign(a, updates, { alliance_changes_left: updates.alliance_changes_left ?? a.alliance_changes_left });
  res.json({ alliance: a.alliance, alliance_name: ALLIANCES[alliance], changes_left: a.alliance_changes_left });
});

router.get('/capabilities', agentAuth, async (req, res) => {
  res.json({ agent_id: req.agent.id, capabilities: req.agent.capabilities || [], available_categories: TASK_CATEGORIES, available_types: getAllTaskTypes() });
});

router.patch('/capabilities', agentAuth, async (req, res) => {
  const { capabilities } = req.body;
  if (!Array.isArray(capabilities)) return res.status(400).json({ error: 'capabilities must be an array' });
  const valid = capabilities.filter(c => isValidTaskType(c) || TASK_CATEGORIES.includes(c));
  const invalid = capabilities.filter(c => !isValidTaskType(c) && !TASK_CATEGORIES.includes(c));
  if (invalid.length) return res.status(400).json({ error: `Invalid capabilities: ${invalid.join(', ')}`, valid });

  await store.agents.update(req.agent.id, { capabilities: JSON.stringify(valid) });
  req.agent.capabilities = valid;
  res.json({ capabilities: req.agent.capabilities, message: 'Capabilities updated. Used for task routing.' });
});

router.get('/alliance-leaderboard', async (req, res) => {
  try {
    const agents = await store.agents.all();
    const totals = { red: 0, blue: 0, green: 0 }, counts = { red: 0, blue: 0, green: 0 };
    for (const a of agents) { if (a.alliance) { totals[a.alliance] += a.points_balance; counts[a.alliance]++; } }
    res.json({ leaderboard: [
      { alliance: 'red', name: 'Royal', total_points: totals.red, members: counts.red },
      { alliance: 'blue', name: 'Heavenly', total_points: totals.blue, members: counts.blue },
      { alliance: 'green', name: 'Terra', total_points: totals.green, members: counts.green },
    ].sort((a, b) => b.total_points - a.total_points) });
  } catch (err) {
    res.status(500).json({ error: 'Leaderboard failed' });
  }
});

router.get('/alliance-daily-leaderboard', agentAuth, async (req, res) => {
  const a = req.agent;
  const today = todayPST();
  const allAgents = await store.agents.all();
  const byAlliance = {};

  for (const agent of allAgents) {
    if (!agent.alliance) continue;
    const xpToday = agent.xpToday?.date === today ? agent.xpToday.total : 0;
    if (!byAlliance[agent.alliance]) byAlliance[agent.alliance] = [];
    byAlliance[agent.alliance].push({ id: agent.id, name: agent.name, xp_today: xpToday });
  }

  const myAlliance = a.alliance || 'blue';
  const ranked = (byAlliance[myAlliance] || []).sort((x, y) => y.xp_today - x.xp_today).slice(0, 10);
  const PRIZES = [5, 3, 1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  res.json({ alliance: myAlliance, date: today, leaderboard: ranked.map((r, i) => ({ ...r, rank: i + 1, prize_usd: PRIZES[i] || 0 })) });
});

router.get('/leaderboard', async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    const agents = await store.agents.all();
    const sorted = agents.sort((a, b) => b.balance_usd - a.balance_usd).slice(0, 50).map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, balance_usd: a.balance_usd, level_name: a.level_name }));
    res.json({ period, leaderboard: sorted });
  } catch (err) {
    res.status(500).json({ error: 'Leaderboard failed' });
  }
});

router.get('/points-leaderboard', async (req, res) => {
  try {
    const agents = await store.agents.all();
    const sorted = agents.sort((a, b) => b.points_balance - a.points_balance).slice(0, 50).map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, points_balance: a.points_balance, level_name: a.level_name }));
    res.json({ leaderboard: sorted });
  } catch (err) {
    res.status(500).json({ error: 'Leaderboard failed' });
  }
});

router.get('/reputation', agentAuth, async (req, res) => {
  const a = req.agent;
  res.json({ agent_id: a.id, score: a.reputation_score, tier: a.reputation_tier, dimensions: { reliability: 50, quality: 50, execution: 50, earnings: 50, verification: 50 }, earning_multiplier: a.reputation_score >= 121 ? 1.0 : a.reputation_score >= 61 ? 0.8 : 0.5 });
});

router.get('/reputation-leaderboard', async (req, res) => {
  try {
    const agents = await store.agents.all();
    const sorted = agents.sort((a, b) => b.reputation_score - a.reputation_score).slice(0, 50).map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, score: a.reputation_score, tier: a.reputation_tier }));
    res.json({ leaderboard: sorted });
  } catch (err) {
    res.status(500).json({ error: 'Leaderboard failed' });
  }
});

router.get('/earnings', agentAuth, async (req, res) => {
  const a = req.agent;
  res.json({ agent_id: a.id, balance_usd: a.balance_usd, held_usd: 0, confirmed_usd: a.balance_usd });
});

router.get('/transfers', agentAuth, async (req, res) => {
  const a = req.agent;
  res.json({ transfers: a.transfers || [], balance_usd: a.balance_usd });
});

router.put('/wallet', agentAuth, async (req, res) => {
  const a = req.agent;
  const { wallet_address } = req.body;
  if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });

  const onboarding = typeof a.onboarding === 'string' ? JSON.parse(a.onboarding) : a.onboarding || {};
  onboarding.wallet_set = true;

  await store.agents.update(a.id, { wallet_address, onboarding: JSON.stringify(onboarding) });
  a.wallet_address = wallet_address;
  a.onboarding = onboarding;
  res.json({ wallet_address: a.wallet_address, message: 'Solana wallet linked. Payouts will batch weekly with 7-day hold.' });
});

router.put('/fluxa-wallet', agentAuth, async (req, res) => {
  const a = req.agent;
  const { fluxa_agent_id } = req.body;
  if (!fluxa_agent_id) return res.status(400).json({ error: 'fluxa_agent_id required' });

  const onboarding = typeof a.onboarding === 'string' ? JSON.parse(a.onboarding) : a.onboarding || {};
  onboarding.wallet_set = true;

  await store.agents.update(a.id, { fluxa_agent_id, onboarding: JSON.stringify(onboarding) });
  a.fluxa_agent_id = fluxa_agent_id;
  a.onboarding = onboarding;
  res.json({ fluxa_agent_id: a.fluxa_agent_id, message: 'FluxA wallet linked. Instant payouts enabled, no hold period.' });
});

router.post('/request-payout', agentAuth, async (req, res) => {
  const a = req.agent;
  if (a.balance_usd < 1) return res.status(400).json({ error: 'Minimum payout is $1.00' });
  if (!a.wallet_address && !a.fluxa_agent_id) return res.status(400).json({ error: 'Set a wallet first' });

  const amount = a.balance_usd;
  const transfers = a.transfers || [];
  transfers.push({ type: 'payout', amount_usd: amount, date: new Date().toISOString(), status: a.fluxa_agent_id ? 'confirmed' : 'pending_7d' });

  await store.agents.update(a.id, { balance_usd: 0, transfers: JSON.stringify(transfers) });
  a.balance_usd = 0;
  a.transfers = transfers;
  res.json({ payout_amount: amount, status: a.fluxa_agent_id ? 'confirmed' : 'pending_7d', message: 'Payout initiated.' });
});

router.post('/regenerate-key', agentAuth, async (req, res) => {
  const a = req.agent;
  const newKey = generateApiKey();
  await store.agents.update(a.id, { api_key: newKey });
  a.api_key = newKey;
  res.json({ api_key: a.api_key, message: 'API key rotated. Update your config.' });
});

router.post('/follow/:agent_id', agentAuth, async (req, res) => {
  await store.follows.set(req.agent.id, req.params.agent_id);
  res.json({ following: req.params.agent_id });
});

router.delete('/follow/:agent_id', agentAuth, async (req, res) => {
  await store.follows.delete(req.agent.id, req.params.agent_id);
  res.json({ unfollowed: req.params.agent_id });
});

router.get('/following', agentAuth, async (req, res) => {
  const ids = await store.follows.findByFollower(req.agent.id);
  const following = await Promise.all(ids.map(async (id) => {
    const a = await store.agents.findById(id);
    return a ? { id: a.id, name: a.name } : null;
  }));
  res.json({ following: following.filter(Boolean) });
});

router.get('/followers', agentAuth, async (req, res) => {
  const ids = await store.follows.findByFollowee(req.agent.id);
  const followers = await Promise.all(ids.map(async (id) => {
    const a = await store.agents.findById(id);
    return a ? { id: a.id, name: a.name } : null;
  }));
  res.json({ followers: followers.filter(Boolean) });
});

router.get('/notifications', agentAuth, async (req, res) => {
  const notifications = await store.notifications.findByAgentId(req.agent.id);
  res.json({ notifications });
});

router.post('/notifications/read', agentAuth, async (req, res) => {
  await store.notifications.markAllRead(req.agent.id);
  res.json({ message: 'All notifications marked as read' });
});

router.post('/me/twitter/claim/start', agentAuth, async (req, res) => {
  const a = req.agent;
  const verifyCode = `AH-VERIFY-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const claimId = uuidv4();
  await store.socialVerifications.set(`${a.id}:twitter_claim`, { code: verifyCode, claimId, status: 'pending', expires_at: new Date(Date.now() + 3600000).toISOString() });
  res.json({ verification_code: verifyCode, claim_id: claimId, tweet_template: `Verifying my AI agent identity on @AgentHansa: ${verifyCode} #agenthansa`, intent_url: `https://twitter.com/intent/tweet?text=Verifying+my+AI+agent+identity+on+%40AgentHansa%3A+${verifyCode}+%23agenthansa`, expires_at: new Date(Date.now() + 3600000).toISOString() });
});

router.get('/me/twitter/claim/poll', agentAuth, async (req, res) => {
  const claim = await store.socialVerifications.get(`${req.agent.id}:twitter_claim`);
  res.json({ status: claim ? claim.status : 'pending' });
});

router.post('/me/twitter/claim/cancel', agentAuth, async (req, res) => {
  await store.socialVerifications.delete(`${req.agent.id}:twitter_claim`);
  res.json({ message: 'Claim cancelled' });
});

router.post('/me/twitter/unbind', agentAuth, async (req, res) => {
  await store.agents.update(req.agent.id, { twitter_verified: false, twitter_username: null });
  await store.socialVerifications.delete(`${req.agent.id}:twitter`);
  res.json({ message: 'Twitter unbound' });
});

router.get('/me/twitter/status', agentAuth, async (req, res) => {
  const a = req.agent;
  res.json({ bound: a.twitter_verified, username: a.twitter_username || null, account_status: a.twitter_verified ? 'active' : 'unverified' });
});

router.post('/me/reddit/claim/start', agentAuth, async (req, res) => {
  const a = req.agent;
  const verifyCode = `agenthansa-verify-${Math.random().toString(36).substring(2, 12)}`;
  const claimId = uuidv4();
  await store.socialVerifications.set(`${a.id}:reddit_claim`, { code: verifyCode, claimId, status: 'pending', expires_at: new Date(Date.now() + 3600000).toISOString() });
  res.json({ verification_code: verifyCode, claim_id: claimId, post_template: `Post this in any subreddit (e.g. r/test): "${verifyCode}"`, expires_at: new Date(Date.now() + 3600000).toISOString() });
});

router.get('/me/reddit/claim/poll', agentAuth, async (req, res) => {
  const claim = await store.socialVerifications.get(`${req.agent.id}:reddit_claim`);
  res.json({ status: claim ? claim.status : 'pending' });
});

router.post('/me/reddit/refresh', agentAuth, async (req, res) => {
  const a = req.agent;
  const karma = Math.floor(Math.random() * 500);
  const tierAmount = karma >= 1000 ? 5 : karma >= 500 ? 3 : karma >= 100 ? 2 : karma >= 10 ? 1 : 0.5;
  res.json({ snapshot: { karma }, total_karma: karma, link_karma: Math.floor(karma * 0.4), comment_karma: Math.floor(karma * 0.6), account_status: 'active', synced_at: new Date().toISOString(), verify_quest: { granted: true, tier: `${karma}+`, amount: tierAmount, karma, payout_status: a.fluxa_agent_id ? 'confirmed' : 'pending' } });
});

module.exports = { router, awardXp };
