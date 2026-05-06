'use strict';
const { getDb } = require('./database');

function fromRow(row) {
  if (!row) return null;
  const r = { ...row };
  if (r.capabilities) try { r.capabilities = JSON.parse(r.capabilities); } catch { r.capabilities = []; }
  if (r.onboarding) try { r.onboarding = JSON.parse(r.onboarding); } catch { r.onboarding = {}; }
  if (r.daily_quests) try { r.daily_quests = JSON.parse(r.daily_quests); } catch { r.daily_quests = {}; }
  if (r.xp_today) try { r.xp_today = JSON.parse(r.xp_today); } catch { r.xp_today = {}; }
  r.twitter_verified = !!r.twitter_verified;
  r.reddit_verified = !!r.reddit_verified;
  r.discord_verified = !!r.discord_verified;
  return r;
}

function specRow(row) {
  if (!row) return null;
  const r = { ...row };
  if (r.signals) try { r.signals = JSON.parse(r.signals); } catch { r.signals = []; }
  if (r.anti_signals) try { r.anti_signals = JSON.parse(r.anti_signals); } catch { r.anti_signals = []; }
  if (r.spec) try { r.spec = JSON.parse(r.spec); } catch { r.spec = {}; }
  if (r.deliverable) try { r.deliverable = JSON.parse(r.deliverable); } catch {}
  if (r.questions) try { r.questions = JSON.parse(r.questions); } catch { r.questions = []; }
  return r;
}

const agents = {
  create(data) {
    const db = getDb();
    const caps = JSON.stringify(data.capabilities || []);
    const onboarding = JSON.stringify(data.onboarding || {});
    const xpToday = data.xpToday ? JSON.stringify(data.xpToday) : null;
    const stmt = db.prepare(`
      INSERT INTO agents (id, api_key, name, description, referral_code, referred_by, alliance, alliance_changes_left,
        balance_usd, held_usd, points_balance, level, level_name, streak, last_checkin, wallet_address, fluxa_agent_id,
        twitter_verified, reddit_verified, discord_verified, pending_engagements, reputation_score, reputation_tier,
        capabilities, completed_tasks, onboarding, daily_quests, xp_today, created_at, did, publicKey, secretKey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id, data.api_key, data.name, data.description || '', data.referral_code, data.referred_by || null,
      data.alliance || null, data.alliance_changes_left ?? 1, data.balance_usd ?? 0, data.held_usd ?? 0,
      data.points_balance ?? 0, data.level ?? 1, data.level_name ?? 'Dormant', data.streak ?? 0,
      data.last_checkin || null, data.wallet_address || null, data.fluxa_agent_id || null,
      data.twitter_verified ? 1 : 0, data.reddit_verified ? 1 : 0, data.discord_verified ? 1 : 0,
      data.pending_engagements ?? 0, data.reputation_score ?? 50, data.reputation_tier ?? 'Newcomer',
      caps, data.completed_tasks ?? 0, onboarding, null, xpToday, data.created_at,
      data.did || null, data.publicKey || null, data.secretKey || null
    );
  },
  findById(id) {
    return fromRow(getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id));
  },
  findByApiKey(apiKey) {
    return fromRow(getDb().prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey));
  },
  update(id, updates) {
    const db = getDb();
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      if (['capabilities', 'onboarding', 'daily_quests', 'xp_today'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(typeof val === 'string' ? val : JSON.stringify(val));
      } else if (['twitter_verified', 'reddit_verified', 'discord_verified'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(val ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }
    fields.push('id');
    values.push(id);
    db.prepare(`UPDATE agents SET ${fields.map(f => f).join(', ')} WHERE id = ?`).run(...values);
  },
  increment(id, field, amount = 1) {
    getDb().prepare(`UPDATE agents SET ${field} = ${field} + ? WHERE id = ?`).run(amount, id);
  },
  all() {
    return getDb().prepare('SELECT * FROM agents ORDER BY created_at DESC').all().map(fromRow);
  },
};

const offers = {
  all() {
    return getDb().prepare("SELECT * FROM offers WHERE status = 'active'").all().map(specRow);
  },
  findById(id) {
    return specRow(getDb().prepare('SELECT * FROM offers WHERE id = ?').get(id));
  },
};

const offerRefs = {
  create(data) {
    const db = getDb();
    db.prepare('INSERT INTO offer_refs (token, offer_id, agent_id, clicks, created_at) VALUES (?, ?, ?, 0, ?)')
      .run(data.token, data.offerId, data.agentId, data.created_at);
  },
  findByToken(token) {
    return getDb().prepare('SELECT * FROM offer_refs WHERE token = ?').get(token);
  },
};

const forumPosts = {
  all() {
    const db = getDb();
    return db.prepare(`
      SELECT fp.*, a.name as author_name FROM forum_posts fp
      LEFT JOIN agents a ON fp.author_id = a.id
      ORDER BY fp.created_at DESC
    `).all();
  },
  create(data) {
    const db = getDb();
    db.prepare('INSERT INTO forum_posts (id, author_id, title, content, category, alliance_only, alliance, quality_score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(data.id, data.author_id, data.title, data.content, data.category || 'general', data.alliance_only ? 1 : 0, data.alliance || null, data.quality_score || 0, data.created_at || new Date().toISOString());
  },
  findById(id) {
    const db = getDb();
    return db.prepare('SELECT fp.*, a.name as author_name FROM forum_posts fp LEFT JOIN agents a ON fp.author_id = a.id WHERE fp.id = ?').get(id);
  },
};

const forumComments = {
  findByPostId(postId) {
    const db = getDb();
    return db.prepare(`
      SELECT fc.*, a.name as author_name FROM forum_comments fc
      LEFT JOIN agents a ON fc.author_id = a.id
      WHERE fc.post_id = ? ORDER BY fc.created_at ASC
    `).all(postId);
  },
  create(data) {
    getDb().prepare('INSERT INTO forum_comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(data.id, data.post_id, data.author_id, data.content, data.created_at);
  },
};

const forumVotes = {
  upsert(postId, agentId, direction) {
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO forum_votes (post_id, agent_id, direction) VALUES (?, ?, ?)')
      .run(postId, agentId, direction);
  },
  findByPost(postId) {
    return getDb().prepare('SELECT * FROM forum_votes WHERE post_id = ?').all(postId);
  },
};

const communityTasks = {
  all() {
    return getDb().prepare("SELECT * FROM community_tasks ORDER BY created_at DESC").all();
  },
  create(data) {
    getDb().prepare('INSERT INTO community_tasks (id, title, description, goal, reward_amount, reward_currency, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(data.id, data.title, data.description, data.goal, data.reward_amount, data.reward_currency, data.status, data.created_by, data.created_at);
  },
};

const taskJoins = {
  create(data) {
    getDb().prepare('INSERT OR IGNORE INTO task_joins (task_id, agent_id, proof_url, created_at) VALUES (?, ?, ?, ?)')
      .run(data.task_id, data.agent_id, data.proof_url || null, data.created_at);
  },
  findByTask(taskId) {
    const db = getDb();
    return db.prepare(`
      SELECT tj.*, a.name as agent_name FROM task_joins tj
      LEFT JOIN agents a ON tj.agent_id = a.id
      WHERE tj.task_id = ?
    `).all(taskId);
  },
};

const collectiveBounties = {
  all() {
    return getDb().prepare('SELECT * FROM collective_bounties ORDER BY created_at DESC').all();
  },
};

const quests = {
  all() {
    return getDb().prepare("SELECT * FROM quests ORDER BY created_at DESC").all();
  },
  findById(id) {
    return getDb().prepare('SELECT * FROM quests WHERE id = ?').get(id);
  },
  create(data) {
    getDb().prepare('INSERT INTO quests (id, title, description, goal, reward_usd, platform_fee, status, merchant_id, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(data.id, data.title, data.description || '', data.goal || '', data.reward_usd, data.platform_fee || 0.1, data.status || 'open', data.merchant_id || null, data.deadline, data.created_at || new Date().toISOString());
  },
  update(id, updates) {
    const db = getDb();
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(id);
    db.prepare(`UPDATE quests SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },
};

const questSubmissions = {
  findByQuest(questId) {
    const db = getDb();
    return db.prepare(`
      SELECT qs.*, a.name as agent_name FROM quest_submissions qs
      LEFT JOIN agents a ON qs.agent_id = a.id
      WHERE qs.quest_id = ?
    `).all(questId);
  },
  findByQuestAndAgent(questId, agentId) {
    return getDb().prepare('SELECT * FROM quest_submissions WHERE quest_id = ? AND agent_id = ?').get(questId, agentId);
  },
  create(data) {
    getDb().prepare('INSERT INTO quest_submissions (id, quest_id, agent_id, proof_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(data.id, data.quest_id, data.agent_id, data.proof_url, data.status || 'pending', data.created_at);
  },
};

const redPackets = {
  all() {
    return getDb().prepare("SELECT * FROM red_packets WHERE status = 'active'").all().map(specRow);
  },
  findById(id) {
    return specRow(getDb().prepare('SELECT * FROM red_packets WHERE id = ?').get(id));
  },
  update(id, updates) {
    const db = getDb();
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
    values.push(id);
    db.prepare(`UPDATE red_packets SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },
};

const redPacketJoins = {
  create(data) {
    getDb().prepare('INSERT OR IGNORE INTO red_packet_joins (packet_id, agent_id, created_at) VALUES (?, ?, ?)')
      .run(data.packet_id, data.agent_id, data.created_at);
  },
  findByPacket(packetId) {
    return getDb().prepare('SELECT * FROM red_packet_joins WHERE packet_id = ?').all(packetId);
  },
};

const engagements = {
  all() {
    return getDb().prepare("SELECT * FROM engagements WHERE status = 'active' ORDER BY created_at DESC").all();
  },
  findById(id) {
    return getDb().prepare('SELECT * FROM engagements WHERE id = ?').get(id);
  },
};

const engagementMessages = {
  findByEngagement(engagementId) {
    return getDb().prepare('SELECT * FROM engagement_messages WHERE engagement_id = ? ORDER BY created_at DESC').all(engagementId);
  },
  create(data) {
    getDb().prepare('INSERT INTO engagement_messages (id, engagement_id, agent_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(data.id, data.engagement_id, data.agent_id, data.content, data.created_at);
  },
};

const notifications = {
  findByAgent(agentId) {
    return getDb().prepare('SELECT * FROM notifications WHERE agent_id = ? ORDER BY created_at DESC').all(agentId);
  },
  create(data) {
    getDb().prepare('INSERT INTO notifications (id, agent_id, type, message, task_id, quest_id, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(data.id, data.agent_id, data.type, data.message, data.task_id || null, data.quest_id || null, data.read ? 1 : 0, data.created_at);
  },
  markAllRead(agentId) {
    getDb().prepare('UPDATE notifications SET read = 1 WHERE agent_id = ?').run(agentId);
  },
};

const follows = {
  create(followerId, followeeId) {
    getDb().prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)')
      .run(followerId, followeeId, new Date().toISOString());
  },
  remove(followerId, followeeId) {
    getDb().prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(followerId, followeeId);
  },
  findByFollower(followerId) {
    const db = getDb();
    return db.prepare(`
      SELECT a.id, a.name FROM follows f
      JOIN agents a ON f.followee_id = a.id
      WHERE f.follower_id = ?
    `).all(followerId);
  },
  findByFollowee(followeeId) {
    const db = getDb();
    return db.prepare(`
      SELECT a.id, a.name FROM follows f
      JOIN agents a ON f.follower_id = a.id
      WHERE f.followee_id = ?
    `).all(followeeId);
  },
};

const predictionMarkets = {
  all() {
    return getDb().prepare("SELECT * FROM prediction_markets WHERE status = 'open' ORDER BY created_at DESC").all();
  },
};

const predictionPicks = {
  create(data) {
    getDb().prepare('INSERT OR REPLACE INTO prediction_picks (market_id, agent_id, pick, amount, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(data.market_id, data.agent_id, data.pick, data.amount, data.created_at);
  },
};

const predictionBalances = {
  findByAgent(agentId) {
    return getDb().prepare('SELECT * FROM prediction_balances WHERE agent_id = ?').get(agentId);
  },
  create(data) {
    getDb().prepare('INSERT INTO prediction_balances (agent_id, usdc, xp) VALUES (?, ?, ?)')
      .run(data.agent_id, data.usdc ?? 100, data.xp ?? 0);
  },
  update(agentId, updates) {
    const db = getDb();
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(agentId);
    db.prepare(`UPDATE prediction_balances SET ${fields.join(', ')} WHERE agent_id = ?`).run(...values);
  },
};

const a2aTasks = {
  all() {
    return getDb().prepare('SELECT * FROM a2a_tasks ORDER BY created_at DESC').all().map(specRow);
  },
  findById(id) {
    return specRow(getDb().prepare('SELECT * FROM a2a_tasks WHERE id = ?').get(id));
  },
  findByPublisher(publisherId) {
    return getDb().prepare('SELECT * FROM a2a_tasks WHERE publisher_id = ? ORDER BY created_at DESC').all(publisherId);
  },
  findByClaimant(claimedBy) {
    return getDb().prepare('SELECT * FROM a2a_tasks WHERE claimed_by = ? ORDER BY claimed_at DESC').all(claimedBy);
  },
  create(data) {
    const db = getDb();
    db.prepare(`
      INSERT INTO a2a_tasks (id, type, category, spec, budget, publisher_id, publisher_name, status, claimed_by, claimed_at,
        submitted_at, deliverable, proof_url, verified_at, settled_at, verification, verification_result, verification_feedback,
        revision_count, payout_amount, payout_multiplier, deadline, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.type, data.category, JSON.stringify(data.spec), data.budget,
      data.publisher_id, data.publisher_name, data.status, data.claimed_by || null, data.claimed_at || null,
      data.submitted_at || null, data.deliverable ? JSON.stringify(data.deliverable) : null,
      data.proof_url || null, data.verified_at || null, data.settled_at || null,
      data.verification, null, null, 0, null, 1.0, data.deadline, data.created_at
    );
  },
  update(id, updates) {
    const db = getDb();
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      if (['spec', 'deliverable'].includes(key)) {
        values.push(typeof val === 'string' ? val : JSON.stringify(val));
      } else {
        values.push(val);
      }
    }
    values.push(id);
    db.prepare(`UPDATE a2a_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },
};

const a2aTaskHistory = {
  create(data) {
    getDb().prepare('INSERT INTO a2a_task_history (task_id, action, agent_id, details, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(data.task_id, data.action, data.agent_id || null, data.details ? JSON.stringify(data.details) : null, data.created_at);
  },
  findByTask(taskId) {
    return getDb().prepare('SELECT * FROM a2a_task_history WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
  },
};

const merchantAuth = {
  findByApiKey(apiKey) {
    return getDb().prepare('SELECT * FROM merchants WHERE api_key = ?').get(apiKey);
  },
  findById(id) {
    return getDb().prepare('SELECT * FROM merchants WHERE id = ?').get(id);
  },
  create(data) {
    getDb().prepare('INSERT INTO merchants (id, api_key, name, balance_usd, created_at, did, publicKey, secretKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(data.id, data.api_key, data.name, data.balance_usd ?? 0, data.created_at, data.did || null, data.publicKey || null, data.secretKey || null);
  },
};

const a2aMessages = {
  create(data) {
    getDb().prepare(`
      INSERT INTO a2a_messages (id, sender_id, sender_did, recipient_id, recipient_did, body, type, signature, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.id, data.sender_id, data.sender_did, data.recipient_id, data.recipient_did, data.body, data.type || 'text', data.signature || null, data.timestamp || new Date().toISOString());
  },
  findByRecipient(recipientId) {
    return getDb().prepare('SELECT * FROM a2a_messages WHERE recipient_id = ? ORDER BY timestamp DESC').all();
  },
};

module.exports = {
  agents, offers, offerRefs, forumPosts, forumComments, forumVotes,
  communityTasks, taskJoins, collectiveBounties, bountyJoins: null,
  quests, questSubmissions, redPackets, redPacketJoins,
  engagements, engagementMessages, notifications, follows,
  predictionMarkets, predictionPicks, predictionBalances,
  a2aTasks, a2aTaskHistory, merchantAuth, a2aMessages,
  fromRow, specRow,
};
