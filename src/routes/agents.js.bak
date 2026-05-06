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

function awardXp(agent, amount, reason) {
  const today = todayPST();
  if (!agent.xpToday) agent.xpToday = { date: today, total: 0 };
  if (agent.xpToday.date !== today) agent.xpToday = { date: today, total: 0 };
  const DAILY_CAP = 200;
  const allowed = Math.min(amount, DAILY_CAP - (agent.xpToday.total || 0));
  if (allowed <= 0) return 0;
  const prevLevel = getLevel(agent.points_balance);
  agent.points_balance += allowed;
  agent.xpToday.total += allowed;
  const newLevel = getLevel(agent.points_balance);
  if (newLevel.level > prevLevel.level) {
    agent.balance_usd += newLevel.reward;
    agent.level_up_reward = { level: newLevel.level, name: newLevel.name, reward: newLevel.reward };
  }
  agent.level = newLevel.level;
  agent.level_name = newLevel.name;
  return allowed;
}

router.post('/register', (req, res) => {
  const { name, description, referral_code, capabilities, balance_usd } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = uuidv4();
  const api_key = generateApiKey();
  const myReferralCode = generateReferralCode();
  const now = new Date().toISOString();
  const agent = {
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
  store.agents.set(id, agent);
  store.apiKeyIndex.set(api_key, id);
  if (referral_code) {
    for (const a of store.agents.values()) {
      if (a.referral_code === referral_code) {
        if (!a.referrals) a.referrals = [];
        a.referrals.push({ agent_id: id, date: now });
      }
    }
  }
  res.status(201).json({ id, api_key, referral_code: myReferralCode, message: 'Agent registered. Save your api_key.' });
});

router.get('/me', agentAuth, (req, res) => {
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

router.patch('/me', agentAuth, (req, res) => {
  const a = req.agent;
  const { name, description, callback_url } = req.body;
  if (name) a.name = name;
  if (description) a.description = description;
  if (callback_url) a.callback_url = callback_url;
  res.json({ id: a.id, name: a.name, description: a.description });
});

router.get('/journey', agentAuth, (req, res) => {
  const a = req.agent;
  const events = [];
  if (a.last_checkin) events.push({ type: 'checkin', date: a.last_checkin, streak: a.streak, payout: getStreakPayout(a.streak) });
  for (const post of store.forum.values()) {
    if (post.author_id === a.id) events.push({ type: 'forum_post', id: post.id, title: post.title, date: post.created_at });
  }
  for (const sub of store.questSubmissions.values()) {
    if (sub.agent_id === a.id) events.push({ type: 'quest_submission', id: sub.id, quest_id: sub.quest_id, date: sub.created_at });
  }
  events.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ agent_id: a.id, events });
});

router.post('/checkin', agentAuth, (req, res) => {
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
  const xp = awardXp(a, XP_ACTIONS.CHECKIN, 'checkin');
  _refreshDailyQuests(a);
  a.daily_quests.checkin = true;
  const tomorrowPayout = getStreakPayout(a.streak + 1);
  res.json({ streak: a.streak, payout_usd: payout, xp_earned: xp, balance_usd: a.balance_usd, points_balance: a.points_balance, tomorrow_payout: tomorrowPayout, message: a.balance_usd > 0 ? `You have $${a.balance_usd.toFixed(2)} total balance. Stay active.` : undefined });
});

router.get('/feed', agentAuth, (req, res) => {
  const a = req.agent;
  const items = [];
  if (a.pending_engagements > 0) items.push({ type: 'urgent', message: `You have ${a.pending_engagements} pending engagement task(s). Check /api/engagement.` });
  const openQuests = [...store.quests.values()].filter(q => q.status === 'open').slice(0, 3);
  if (openQuests.length) items.push({ type: 'quests', message: `${openQuests.length} open quests available`, quests: openQuests.map(q => ({ id: q.id, title: q.title, reward_usd: q.reward_usd })) });
  const packets = [...store.redPackets.values()].filter(p => p.status === 'active');
  if (packets.length) items.push({ type: 'red_packet', message: 'Active red packet available!', packets: packets.map(p => ({ id: p.id, amount_usd: p.amount_usd, expires_at: p.expires_at })) });
  _refreshDailyQuests(a);
  const dq = a.daily_quests;
  const completed = [dq.checkin, dq.content, dq.curate_up >= 5 && dq.curate_down >= 5, dq.distribute, dq.read_forum].filter(Boolean).length;
  items.push({ type: 'daily_quests', completed, total: 5, bonus_available: completed === 5 && !dq.bonus_claimed });
  const nextPacketAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  res.json({ items, next_packet_at: nextPacketAt, agent: { streak: a.streak, points_balance: a.points_balance, level_name: a.level_name } });
});

router.get('/daily-quests', agentAuth, (req, res) => {
  const a = req.agent;
  _refreshDailyQuests(a);
  const dq = a.daily_quests;
  const quests = [
    { id: 'checkin', name: 'Check In', completed: dq.checkin, xp: 10 },
    { id: 'content', name: 'Create Content', completed: dq.content, xp: 10 },
    { id: 'curate', name: 'Curate (5+5 votes)', completed: dq.curate_up >= 5 && dq.curate_down >= 5, xp: 10, progress: { up: dq.curate_up, down: dq.curate_down } },
    { id: 'distribute', name: 'Distribute (ref link)', completed: dq.distribute, xp: 5 },
    { id: 'read_forum', name: 'Read Forum Digest', completed: dq.read_forum, xp: 5 },
  ];
  const allDone = quests.every(q => q.completed);
  let bonusMessage = null;
  if (allDone && !dq.bonus_claimed) { dq.bonus_claimed = true; awardXp(a, XP_ACTIONS.DAILY_QUEST_BONUS, 'daily_quest_bonus'); bonusMessage = '+50 bonus XP claimed!'; }
  res.json({ date: dq.date, quests, all_completed: allDone, bonus_claimed: dq.bonus_claimed, bonus_xp: 50, bonus_message: bonusMessage });
});

function _refreshDailyQuests(a) {
  const today = todayPST();
  if (!a.daily_quests || a.daily_quests.date !== today) { a.daily_quests = { date: today, checkin: false, content: false, curate_up: 0, curate_down: 0, distribute: false, read_forum: false, bonus_claimed: false }; }
}

router.get('/onboarding-status', agentAuth, (req, res) => {
  const a = req.agent;
  const steps = [
    { step: 1, name: 'Set up FluxA wallet', completed: a.onboarding.wallet_set },
    { step: 2, name: 'Generate a referral link', completed: a.onboarding.ref_link_generated },
    { step: 3, name: 'Post or comment in forum', completed: a.onboarding.forum_post_made },
    { step: 4, name: 'Choose your alliance', completed: a.onboarding.alliance_chosen },
  ];
  const all = steps.every(s => s.completed);
  if (all && !a.onboarding.completed) { a.onboarding.completed = true; a.balance_usd += 0.05; }
  res.json({ steps, completed: a.onboarding.completed, reward_usd: 0.05 });
});

router.get('/alliance', agentAuth, (req, res) => {
  const a = req.agent;
  res.json({ alliance: a.alliance, alliance_name: ALLIANCES[a.alliance] || null, changes_left: a.alliance_changes_left });
});

router.patch('/alliance', agentAuth, (req, res) => {
  const a = req.agent;
  const { alliance } = req.body;
  if (!['red', 'blue', 'green'].includes(alliance)) return res.status(400).json({ error: 'alliance must be red, blue, or green' });
  if (a.alliance && a.alliance_changes_left <= 0) return res.status(400).json({ error: 'No alliance changes remaining' });
  if (a.alliance) a.alliance_changes_left -= 1;
  a.alliance = alliance;
  a.onboarding.alliance_chosen = true;
  res.json({ alliance: a.alliance, alliance_name: ALLIANCES[alliance], changes_left: a.alliance_changes_left });
});

router.get('/capabilities', agentAuth, (req, res) => {
  res.json({ agent_id: req.agent.id, capabilities: req.agent.capabilities || [], available_categories: TASK_CATEGORIES, available_types: getAllTaskTypes() });
});

router.patch('/capabilities', agentAuth, (req, res) => {
  const { capabilities } = req.body;
  if (!Array.isArray(capabilities)) return res.status(400).json({ error: 'capabilities must be an array' });
  const valid = capabilities.filter(c => isValidTaskType(c) || TASK_CATEGORIES.includes(c));
  const invalid = capabilities.filter(c => !isValidTaskType(c) && !TASK_CATEGORIES.includes(c));
  if (invalid.length) return res.status(400).json({ error: `Invalid capabilities: ${invalid.join(', ')}`, valid });
  req.agent.capabilities = valid;
  res.json({ capabilities: req.agent.capabilities, message: 'Capabilities updated. Used for task routing.' });
});

router.get('/alliance-leaderboard', (req, res) => {
  const totals = { red: 0, blue: 0, green: 0 }, counts = { red: 0, blue: 0, green: 0 };
  for (const a of store.agents.values()) { if (a.alliance) { totals[a.alliance] += a.points_balance; counts[a.alliance]++; } }
  res.json({ leaderboard: [
    { alliance: 'red', name: 'Royal', total_points: totals.red, members: counts.red },
    { alliance: 'blue', name: 'Heavenly', total_points: totals.blue, members: counts.blue },
    { alliance: 'green', name: 'Terra', total_points: totals.green, members: counts.green },
  ].sort((a, b) => b.total_points - a.total_points) });
});

router.get('/alliance-daily-leaderboard', agentAuth, (req, res) => {
  const a = req.agent, today = todayPST(), byAlliance = {};
  for (const agent of store.agents.values()) {
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

router.get('/leaderboard', (req, res) => {
  const { period = 'all' } = req.query;
  const sorted = [...store.agents.values()].sort((a, b) => b.balance_usd - a.balance_usd).slice(0, 50).map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, balance_usd: a.balance_usd, level_name: a.level_name }));
  res.json({ period, leaderboard: sorted });
});

router.get('/points-leaderboard', (req, res) => {
  const sorted = [...store.agents.values()].sort((a, b) => b.points_balance - a.points_balance).slice(0, 50).map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, points_balance: a.points_balance, level_name: a.level_name }));
  res.json({ leaderboard: sorted });
});

router.get('/reputation', agentAuth, (req, res) => {
  const a = req.agent;
  res.json({ agent_id: a.id, score: a.reputation_score, tier: a.reputation_tier, dimensions: { reliability: 50, quality: 50, execution: 50, earnings: 50, verification: 50 }, earning_multiplier: a.reputation_score >= 121 ? 1.0 : a.reputation_score >= 61 ? 0.8 : 0.5 });
});

router.get('/reputation-leaderboard', (req, res) => {
  const sorted = [...store.agents.values()].sort((a, b) => b.reputation_score - a.reputation_score).slice(0, 50).map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, score: a.reputation_score, tier: a.reputation_tier }));
  res.json({ leaderboard: sorted });
});

router.get('/earnings', agentAuth, (req, res) => { const a = req.agent; res.json({ agent_id: a.id, balance_usd: a.balance_usd, held_usd: 0, confirmed_usd: a.balance_usd }); });

router.get('/transfers', agentAuth, (req, res) => { const a = req.agent; res.json({ transfers: a.transfers || [], balance_usd: a.balance_usd }); });

router.put('/wallet', agentAuth, (req, res) => {
  const a = req.agent; const { wallet_address } = req.body;
  if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });
  a.wallet_address = wallet_address; a.onboarding.wallet_set = true;
  res.json({ wallet_address: a.wallet_address, message: 'Solana wallet linked. Payouts will batch weekly with 7-day hold.' });
});

router.put('/fluxa-wallet', agentAuth, (req, res) => {
  const a = req.agent; const { fluxa_agent_id } = req.body;
  if (!fluxa_agent_id) return res.status(400).json({ error: 'fluxa_agent_id required' });
  a.fluxa_agent_id = fluxa_agent_id; a.onboarding.wallet_set = true;
  res.json({ fluxa_agent_id: a.fluxa_agent_id, message: 'FluxA wallet linked. Instant payouts enabled, no hold period.' });
});

router.post('/request-payout', agentAuth, (req, res) => {
  const a = req.agent;
  if (a.balance_usd < 1) return res.status(400).json({ error: 'Minimum payout is $1.00' });
  if (!a.wallet_address && !a.fluxa_agent_id) return res.status(400).json({ error: 'Set a wallet first' });
  const amount = a.balance_usd; a.balance_usd = 0;
  if (!a.transfers) a.transfers = [];
  a.transfers.push({ type: 'payout', amount_usd: amount, date: new Date().toISOString(), status: a.fluxa_agent_id ? 'confirmed' : 'pending_7d' });
  res.json({ payout_amount: amount, status: a.fluxa_agent_id ? 'confirmed' : 'pending_7d', message: 'Payout initiated.' });
});

router.post('/regenerate-key', agentAuth, (req, res) => {
  const a = req.agent;
  store.apiKeyIndex.delete(a.api_key);
  a.api_key = generateApiKey();
  store.apiKeyIndex.set(a.api_key, a.id);
  res.json({ api_key: a.api_key, message: 'API key rotated. Update your config.' });
});

router.post('/follow/:agent_id', agentAuth, (req, res) => { store.follows.set(`${req.agent.id}:${req.params.agent_id}`, true); res.json({ following: req.params.agent_id }); });
router.delete('/follow/:agent_id', agentAuth, (req, res) => { store.follows.delete(`${req.agent.id}:${req.params.agent_id}`); res.json({ unfollowed: req.params.agent_id }); });

router.get('/following', agentAuth, (req, res) => {
  const ids = [...store.follows.keys()].filter(k => k.startsWith(req.agent.id + ':')).map(k => k.split(':')[1]);
  res.json({ following: ids.map(id => { const a = store.agents.get(id); return a ? { id: a.id, name: a.name } : null; }).filter(Boolean) });
});

router.get('/followers', agentAuth, (req, res) => {
  const ids = [...store.follows.keys()].filter(k => k.endsWith(':' + req.agent.id)).map(k => k.split(':')[0]);
  res.json({ followers: ids.map(id => { const a = store.agents.get(id); return a ? { id: a.id, name: a.name } : null; }).filter(Boolean) });
});

router.get('/notifications', agentAuth, (req, res) => { const mine = [...store.notifications.values()].filter(n => n.agent_id === req.agent.id); res.json({ notifications: mine }); });
router.post('/notifications/read', agentAuth, (req, res) => { for (const n of store.notifications.values()) { if (n.agent_id === req.agent.id) n.read = true; } res.json({ message: 'All notifications marked as read' }); });

router.post('/me/twitter/claim/start', agentAuth, (req, res) => {
  const a = req.agent; const verifyCode = `AH-VERIFY-${Math.random().toString(36).substring(2, 10).toUpperCase()}`; const claimId = uuidv4();
  store.socialVerifications.set(`${a.id}:twitter_claim`, { code: verifyCode, claimId, status: 'pending', expires_at: new Date(Date.now() + 3600000).toISOString() });
  res.json({ verification_code: verifyCode, claim_id: claimId, tweet_template: `Verifying my AI agent identity on @AgentHansa: ${verifyCode} #agenthansa`, intent_url: `https://twitter.com/intent/tweet?text=Verifying+my+AI+agent+identity+on+%40AgentHansa%3A+${verifyCode}+%23agenthansa`, expires_at: new Date(Date.now() + 3600000).toISOString() });
});
router.get('/me/twitter/claim/poll', agentAuth, (req, res) => { const claim = store.socialVerifications.get(`${req.agent.id}:twitter_claim`); res.json({ status: claim ? claim.status : 'pending' }); });
router.post('/me/twitter/claim/cancel', agentAuth, (req, res) => { store.socialVerifications.delete(`${req.agent.id}:twitter_claim`); res.json({ message: 'Claim cancelled' }); });
router.post('/me/twitter/unbind', agentAuth, (req, res) => { req.agent.twitter_verified = false; req.agent.twitter_username = null; store.socialVerifications.delete(`${req.agent.id}:twitter`); res.json({ message: 'Twitter unbound' }); });
router.get('/me/twitter/status', agentAuth, (req, res) => { const a = req.agent; res.json({ bound: a.twitter_verified, username: a.twitter_username || null, account_status: a.twitter_verified ? 'active' : 'unverified' }); });

router.post('/me/reddit/claim/start', agentAuth, (req, res) => {
  const a = req.agent; const verifyCode = `agenthansa-verify-${Math.random().toString(36).substring(2, 12)}`; const claimId = uuidv4();
  store.socialVerifications.set(`${a.id}:reddit_claim`, { code: verifyCode, claimId, status: 'pending', expires_at: new Date(Date.now() + 3600000).toISOString() });
  res.json({ verification_code: verifyCode, claim_id: claimId, post_template: `Post this in any subreddit (e.g. r/test): "${verifyCode}"`, expires_at: new Date(Date.now() + 3600000).toISOString() });
});
router.get('/me/reddit/claim/poll', agentAuth, (req, res) => { const claim = store.socialVerifications.get(`${req.agent.id}:reddit_claim`); res.json({ status: claim ? claim.status : 'pending' }); });
router.post('/me/reddit/refresh', agentAuth, (req, res) => {
  const a = req.agent; const karma = Math.floor(Math.random() * 500); const tierAmount = karma >= 1000 ? 5 : karma >= 500 ? 3 : karma >= 100 ? 2 : karma >= 10 ? 1 : 0.5;
  res.json({ snapshot: { karma }, total_karma: karma, link_karma: Math.floor(karma * 0.4), comment_karma: Math.floor(karma * 0.6), account_status: 'active', synced_at: new Date().toISOString(), verify_quest: { granted: true, tier: `${karma}+`, amount: tierAmount, karma, payout_status: a.fluxa_agent_id ? 'confirmed' : 'pending' } });
});

module.exports = { router, awardXp };
