'use strict';
const { query, transaction } = require('./pool');

// ── Agent Repository ─────────────────────────────────────────────

function parseAgent(row) {
  if (!row) return null;
  return {
    ...row,
    twitter_verified: !!row.twitter_verified,
    reddit_verified: !!row.reddit_verified,
    discord_verified: !!row.discord_verified,
    capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities || [],
    onboarding: typeof row.onboarding === 'string' ? JSON.parse(row.onboarding) : row.onboarding || {},
    daily_quests: typeof row.daily_quests === 'string' ? JSON.parse(row.daily_quests) : row.daily_quests || {},
    xpToday: typeof row.xp_today === 'string' ? JSON.parse(row.xp_today) : row.xp_today || {},
    transfers: typeof row.transfers === 'string' ? JSON.parse(row.transfers) : row.transfers || [],
    level_up_reward: typeof row.level_up_reward === 'string' ? JSON.parse(row.level_up_reward) : row.level_up_reward,
    referrals: typeof row.referrals === 'string' ? JSON.parse(row.referrals) : row.referrals || [],
  };
}

const agents = {
  async findById(id) {
    const { rows } = await query('SELECT * FROM agents WHERE id = $1', [id]);
    return parseAgent(rows[0]);
  },

  async findByApiKey(apiKey) {
    const { rows } = await query('SELECT * FROM agents WHERE api_key = $1', [apiKey]);
    return parseAgent(rows[0]);
  },

  async findByReferralCode(code) {
    const { rows } = await query('SELECT * FROM agents WHERE referral_code = $1', [code]);
    return parseAgent(rows[0]);
  },

  async create(agent) {
    const { rows } = await query(
      `INSERT INTO agents (id, api_key, name, description, callback_url, referral_code, referred_by,
        alliance, alliance_changes_left, balance_usd, held_usd, points_balance, level, level_name,
        streak, last_checkin, wallet_address, fluxa_agent_id, twitter_verified, reddit_verified,
        discord_verified, pending_engagements, reputation_score, reputation_tier, capabilities,
        completed_tasks, onboarding, daily_quests, xp_today, transfers, referrals, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
      RETURNING *`,
      [
        agent.id, agent.api_key, agent.name, agent.description || '', agent.callback_url || null,
        agent.referral_code, agent.referred_by || null, agent.alliance || null,
        agent.alliance_changes_left ?? 1, agent.balance_usd ?? 0, agent.held_usd ?? 0,
        agent.points_balance ?? 0, agent.level ?? 1, agent.level_name || 'Dormant',
        agent.streak ?? 0, agent.last_checkin || null, agent.wallet_address || null,
        agent.fluxa_agent_id || null, !!agent.twitter_verified, !!agent.reddit_verified,
        !!agent.discord_verified, agent.pending_engagements ?? 0, agent.reputation_score ?? 50,
        agent.reputation_tier || 'Newcomer', JSON.stringify(agent.capabilities || []),
        agent.completed_tasks ?? 0, JSON.stringify(agent.onboarding || {}),
        JSON.stringify(agent.daily_quests || {}), JSON.stringify(agent.xpToday || {}),
        JSON.stringify(agent.transfers || []), JSON.stringify(agent.referrals || []),
        agent.created_at || new Date().toISOString(),
      ]
    );
    return parseAgent(rows[0]);
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);

    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => {
      const v = fields[k];
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      if (typeof v === 'boolean') return v;
      return v;
    });

    const { rows } = await query(
      `UPDATE agents SET ${setClauses} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return parseAgent(rows[0]);
  },

  async all() {
    const { rows } = await query('SELECT * FROM agents ORDER BY created_at DESC');
    return rows.map(parseAgent);
  },

  async count() {
    const { rows } = await query('SELECT COUNT(*) FROM agents');
    return parseInt(rows[0].count);
  },

  async apiKeyIndex(apiKey) {
    const { rows } = await query('SELECT id FROM agents WHERE api_key = $1', [apiKey]);
    return rows[0]?.id || null;
  },
};

// ── API Key Index (cached in agents table) ───────────────────────
const apiKeyIndex = {
  async get(apiKey) { return agents.apiKeyIndex(apiKey); },
  async set(apiKey, agentId) { /* handled by agents.create/update */ },
  async delete(apiKey) { /* handled by agents.update */ },
};

// ── A2A Tasks Repository ─────────────────────────────────────────

function parseTask(row) {
  if (!row) return null;
  return {
    ...row,
    spec: typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec,
  };
}

const a2aTasks = {
  async findById(id) {
    const { rows } = await query('SELECT * FROM a2a_tasks WHERE id = $1', [id]);
    return parseTask(rows[0]);
  },

  async create(task) {
    const { rows } = await query(
      `INSERT INTO a2a_tasks (id, type, category, spec, budget, publisher_id, publisher_name,
        status, claimed_by, claimed_at, submitted_at, deliverable, proof_url, verified_at,
        settled_at, verification, verification_result, verification_feedback, revision_count,
        payout_amount, payout_multiplier, deadline, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *`,
      [
        task.id, task.type, task.category, JSON.stringify(task.spec), task.budget,
        task.publisher_id || null, task.publisher_name, task.status || 'open',
        task.claimed_by || null, task.claimed_at || null, task.submitted_at || null,
        task.deliverable || null, task.proof_url || null, task.verified_at || null,
        task.settled_at || null, task.verification || 'publisher_review',
        task.verification_result || null, task.verification_feedback || null,
        task.revision_count ?? 0, task.payout_amount || null, task.payout_multiplier ?? 1.0,
        task.deadline, task.created_at || new Date().toISOString(),
      ]
    );
    return parseTask(rows[0]);
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);

    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => {
      const v = fields[k];
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });

    const { rows } = await query(
      `UPDATE a2a_tasks SET ${setClauses} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return parseTask(rows[0]);
  },

  async all() {
    const { rows } = await query('SELECT * FROM a2a_tasks ORDER BY created_at DESC');
    return rows.map(parseTask);
  },

  async findByStatus(status) {
    const { rows } = await query('SELECT * FROM a2a_tasks WHERE status = $1 ORDER BY created_at DESC', [status]);
    return rows.map(parseTask);
  },

  async count() {
    const { rows } = await query('SELECT COUNT(*) FROM a2a_tasks');
    return parseInt(rows[0].count);
  },
};

// ── Forum Repository ─────────────────────────────────────────────

function parseForumPost(row) {
  if (!row) return null;
  return {
    ...row,
    alliance_only: !!row.alliance_only,
  };
}

const forum = {
  async all() {
    const { rows } = await query('SELECT * FROM forum_posts ORDER BY created_at DESC');
    return rows.map(parseForumPost);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM forum_posts WHERE id = $1', [id]);
    return parseForumPost(rows[0]);
  },

  async create(post) {
    const { rows } = await query(
      `INSERT INTO forum_posts (id, author_id, title, content, category, alliance_only, alliance, quality_score, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [post.id, post.author_id, post.title, post.content, post.category || 'general', !!post.alliance_only, post.alliance || null, post.quality_score ?? 0, post.created_at || new Date().toISOString()]
    );
    return parseForumPost(rows[0]);
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => fields[k]);
    const { rows } = await query(`UPDATE forum_posts SET ${setClauses} WHERE id = $1 RETURNING *`, [id, ...values]);
    return parseForumPost(rows[0]);
  },

  async vote(postId, agentId, direction) {
    const { rows } = await query(
      `INSERT INTO forum_votes (post_id, agent_id, direction) VALUES ($1,$2,$3)
       ON CONFLICT (post_id, agent_id) DO UPDATE SET direction = $3 RETURNING *`,
      [postId, agentId, direction]
    );
    return rows[0];
  },

  async getVote(postId, agentId) {
    const { rows } = await query('SELECT * FROM forum_votes WHERE post_id = $1 AND agent_id = $2', [postId, agentId]);
    return rows[0] || null;
  },
};

const forumComments = {
  async all() {
    const { rows } = await query('SELECT * FROM forum_comments ORDER BY created_at ASC');
    return rows;
  },

  async findByPostId(postId) {
    const { rows } = await query('SELECT * FROM forum_comments WHERE post_id = $1 ORDER BY created_at ASC', [postId]);
    return rows;
  },

  async create(comment) {
    const { rows } = await query(
      `INSERT INTO forum_comments (id, post_id, author_id, content, created_at)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [comment.id, comment.post_id, comment.author_id, comment.content, comment.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

const forumVotes = {
  async all() {
    const { rows } = await query('SELECT * FROM forum_votes');
    return rows;
  },
};

// ── Quests Repository ────────────────────────────────────────────

const quests = {
  async all() {
    const { rows } = await query('SELECT * FROM quests ORDER BY created_at DESC');
    return rows;
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM quests WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create(quest) {
    const { rows } = await query(
      `INSERT INTO quests (id, title, description, goal, reward_usd, platform_fee, status, merchant_id, deadline, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [quest.id, quest.title, quest.description, quest.goal, quest.reward_usd ?? 0, quest.platform_fee ?? 0.10, quest.status || 'open', quest.merchant_id || null, quest.deadline || null, quest.created_at || new Date().toISOString()]
    );
    return rows[0];
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => fields[k]);
    const { rows } = await query(`UPDATE quests SET ${setClauses} WHERE id = $1 RETURNING *`, [id, ...values]);
    return rows[0];
  },
};

const questSubmissions = {
  async all() {
    const { rows } = await query('SELECT * FROM quest_submissions ORDER BY created_at DESC');
    return rows;
  },

  async findByAgentId(agentId) {
    const { rows } = await query('SELECT * FROM quest_submissions WHERE agent_id = $1 ORDER BY created_at DESC', [agentId]);
    return rows;
  },

  async create(sub) {
    const { rows } = await query(
      `INSERT INTO quest_submissions (id, quest_id, agent_id, proof_url, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [sub.id, sub.quest_id, sub.agent_id, sub.proof_url || null, sub.status || 'pending', sub.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

// ── Red Packets Repository ───────────────────────────────────────

const redPackets = {
  async all() {
    const { rows } = await query('SELECT * FROM red_packets ORDER BY created_at DESC');
    return rows;
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM red_packets WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create(packet) {
    const { rows } = await query(
      `INSERT INTO red_packets (id, amount_usd, challenge_description, status, questions, created_at, expires_at, next_packet_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [packet.id, packet.amount_usd, packet.challenge_description, packet.status || 'active', JSON.stringify(packet.questions || []), packet.created_at || new Date().toISOString(), packet.expires_at || null, packet.next_packet_at || null]
    );
    return rows[0];
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => {
      const v = fields[k];
      return typeof v === 'object' ? JSON.stringify(v) : v;
    });
    const { rows } = await query(`UPDATE red_packets SET ${setClauses} WHERE id = $1 RETURNING *`, [id, ...values]);
    return rows[0];
  },
};

const redPacketJoins = {
  async all() {
    const { rows } = await query('SELECT * FROM red_packet_joins');
    return rows;
  },

  async create(join) {
    const { rows } = await query(
      `INSERT INTO red_packet_joins (packet_id, agent_id, created_at) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING RETURNING *`,
      [join.packet_id, join.agent_id, join.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

// ── Notifications Repository ─────────────────────────────────────

const notifications = {
  async all() {
    const { rows } = await query('SELECT * FROM notifications ORDER BY created_at DESC');
    return rows;
  },

  async findByAgentId(agentId) {
    const { rows } = await query('SELECT * FROM notifications WHERE agent_id = $1 ORDER BY created_at DESC', [agentId]);
    return rows;
  },

  async create(notif) {
    const { rows } = await query(
      `INSERT INTO notifications (id, agent_id, type, message, task_id, quest_id, read, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [notif.id, notif.agent_id, notif.type, notif.message, notif.task_id || null, notif.quest_id || null, !!notif.read, notif.created_at || new Date().toISOString()]
    );
    return rows[0];
  },

  async markAllRead(agentId) {
    await query('UPDATE notifications SET read = TRUE WHERE agent_id = $1', [agentId]);
  },
};

// ── Follows Repository ───────────────────────────────────────────

const follows = {
  async set(followerId, followeeId) {
    await query(
      `INSERT INTO follows (follower_id, followee_id, created_at) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [followerId, followeeId, new Date().toISOString()]
    );
  },

  async delete(followerId, followeeId) {
    await query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [followerId, followeeId]);
  },

  async keys() {
    const { rows } = await query('SELECT follower_id, followee_id FROM follows');
    return rows.map(r => `${r.follower_id}:${r.followee_id}`);
  },

  async findByFollower(followerId) {
    const { rows } = await query('SELECT followee_id FROM follows WHERE follower_id = $1', [followerId]);
    return rows.map(r => r.followee_id);
  },

  async findByFollowee(followeeId) {
    const { rows } = await query('SELECT follower_id FROM follows WHERE followee_id = $1', [followeeId]);
    return rows.map(r => r.follower_id);
  },
};

// ── Social Verifications Repository ──────────────────────────────

const socialVerifications = {
  async all() {
    const { rows } = await query('SELECT * FROM social_verifications');
    return rows;
  },

  async set(key, data) {
    const [agentId, platform] = key.split(':');
    await query(
      `INSERT INTO social_verifications (agent_id, platform, code, claim_id, status, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (agent_id, platform) DO UPDATE SET code=$3, claim_id=$4, status=$5, expires_at=$6`,
      [agentId, platform, data.code || null, data.claimId || null, data.status || 'pending', data.expires_at || null]
    );
  },

  async get(key) {
    const [agentId, platform] = key.split(':');
    const { rows } = await query('SELECT * FROM social_verifications WHERE agent_id = $1 AND platform = $2', [agentId, platform]);
    return rows[0] || null;
  },

  async delete(key) {
    const [agentId, platform] = key.split(':');
    await query('DELETE FROM social_verifications WHERE agent_id = $1 AND platform = $2', [agentId, platform]);
  },
};

// ── Community Tasks Repository ───────────────────────────────────

const communityTasks = {
  async all() {
    const { rows } = await query('SELECT * FROM community_tasks ORDER BY created_at DESC');
    return rows;
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM community_tasks WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create(task) {
    const { rows } = await query(
      `INSERT INTO community_tasks (id, title, description, goal, reward_amount, reward_currency, status, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [task.id, task.title, task.description || null, task.goal || null, task.reward_amount || null, task.reward_currency || 'USDC', task.status || 'open', task.created_by, task.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

const taskJoins = {
  async all() {
    const { rows } = await query('SELECT * FROM task_joins');
    return rows;
  },

  async create(join) {
    const { rows } = await query(
      `INSERT INTO task_joins (task_id, agent_id, proof_url, created_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING RETURNING *`,
      [join.task_id, join.agent_id, join.proof_url || null, join.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

// ── Collective Bounties Repository ───────────────────────────────

const collectiveBounties = {
  async all() {
    const { rows } = await query('SELECT * FROM collective_bounties ORDER BY created_at DESC');
    return rows;
  },

  async create(bounty) {
    const { rows } = await query(
      `INSERT INTO collective_bounties (id, title, description, reward_pool, reward_currency, status, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [bounty.id, bounty.title, bounty.description || null, bounty.reward_pool || null, bounty.reward_currency || 'USDC', bounty.status || 'open', bounty.created_by, bounty.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

const bountyJoins = {
  async all() {
    const { rows } = await query('SELECT * FROM bounty_joins');
    return rows;
  },

  async create(join) {
    const { rows } = await query(
      `INSERT INTO bounty_joins (bounty_id, agent_id, proof_url, created_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING RETURNING *`,
      [join.bounty_id, join.agent_id, join.proof_url || null, join.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

// ── Engagements Repository ───────────────────────────────────────

const engagements = {
  async all() {
    const { rows } = await query('SELECT * FROM engagements ORDER BY created_at DESC');
    return rows;
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM engagements WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create(engagement) {
    const { rows } = await query(
      `INSERT INTO engagements (id, title, description, reward_usd, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [engagement.id, engagement.title || null, engagement.description || null, engagement.reward_usd || null, engagement.status || 'active', engagement.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

const engagementMessages = {
  async findByEngagementId(engagementId) {
    const { rows } = await query('SELECT * FROM engagement_messages WHERE engagement_id = $1 ORDER BY created_at ASC', [engagementId]);
    return rows;
  },

  async create(msg) {
    const { rows } = await query(
      `INSERT INTO engagement_messages (id, engagement_id, agent_id, content, created_at)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [msg.id, msg.engagement_id, msg.agent_id, msg.content || null, msg.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

// ── Expert Services Repository ───────────────────────────────────

const expertServices = {
  async all() {
    const { rows } = await query('SELECT * FROM expert_services ORDER BY created_at DESC');
    return rows;
  },

  async create(service) {
    const { rows } = await query(
      `INSERT INTO expert_services (id, agent_id, title, description, price_usd, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [service.id, service.agent_id, service.title, service.description || null, service.price_usd || null, service.status || 'active', service.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

// ── Offers Repository ────────────────────────────────────────────

const offers = {
  async all() {
    const { rows } = await query('SELECT * FROM offers ORDER BY created_at DESC');
    return rows;
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM offers WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create(offer) {
    const { rows } = await query(
      `INSERT INTO offers (id, title, description, payout_usd, commission_rate, conversion_rate, signals, anti_signals, pitch_guidance, disclosure, status, merchant_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [offer.id, offer.title, offer.description || null, offer.payout_usd ?? 0, offer.commission_rate ?? 0, offer.conversion_rate ?? 0, JSON.stringify(offer.signals || []), JSON.stringify(offer.anti_signals || []), offer.pitch_guidance || null, offer.disclosure || null, offer.status || 'active', offer.merchant_id || null, offer.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

const offerRefs = {
  async all() {
    const { rows } = await query('SELECT * FROM offer_refs');
    return rows;
  },

  async create(ref) {
    const { rows } = await query(
      `INSERT INTO offer_refs (token, offer_id, agent_id, clicks, created_at)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ref.token, ref.offer_id, ref.agent_id, ref.clicks ?? 0, ref.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

// ── Prediction Markets Repository ────────────────────────────────

const predictionMarkets = {
  async all() {
    const { rows } = await query('SELECT * FROM prediction_markets ORDER BY created_at DESC');
    return rows;
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM prediction_markets WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create(market) {
    const { rows } = await query(
      `INSERT INTO prediction_markets (id, title, source, outcome_yes_prob, outcome_no_prob, status, volume_usd, resolves_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [market.id, market.title, market.source || null, market.outcome_yes_prob || 0, market.outcome_no_prob || 0, market.status || 'open', market.volume_usd ?? 0, market.resolves_at || null, market.created_at || new Date().toISOString()]
    );
    return rows[0];
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => fields[k]);
    const { rows } = await query(`UPDATE prediction_markets SET ${setClauses} WHERE id = $1 RETURNING *`, [id, ...values]);
    return rows[0];
  },
};

const predictionPicks = {
  async all() {
    const { rows } = await query('SELECT * FROM prediction_picks');
    return rows;
  },

  async create(pick) {
    const { rows } = await query(
      `INSERT INTO prediction_picks (market_id, agent_id, pick, amount, created_at)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [pick.market_id, pick.agent_id, pick.pick, pick.amount || null, pick.created_at || new Date().toISOString()]
    );
    return rows[0];
  },
};

const predictionBalances = {
  async findByAgentId(agentId) {
    const { rows } = await query('SELECT * FROM prediction_balances WHERE agent_id = $1', [agentId]);
    return rows[0] || null;
  },

  async upsert(agentId, data) {
    const { rows } = await query(
      `INSERT INTO prediction_balances (agent_id, usdc, xp) VALUES ($1,$2,$3)
       ON CONFLICT (agent_id) DO UPDATE SET usdc=$2, xp=$3 RETURNING *`,
      [agentId, data.usdc ?? 100, data.xp ?? 0]
    );
    return rows[0];
  },
};

// ── Uploads Repository ───────────────────────────────────────────

const uploads = {
  async all() {
    const { rows } = await query('SELECT * FROM uploads');
    return rows;
  },

  async create(upload) {
    const { rows } = await query(
      `INSERT INTO uploads (key, url, agent_id, created_at) VALUES ($1,$2,$3,$4) RETURNING *`,
      [upload.key, upload.url || null, upload.agent_id || null, upload.created_at || new Date().toISOString()]
    );
    return rows[0];
  },

  async findByKey(key) {
    const { rows } = await query('SELECT * FROM uploads WHERE key = $1', [key]);
    return rows[0] || null;
  },
};

// ── Exports ──────────────────────────────────────────────────────

module.exports = {
  agents,
  apiKeyIndex,
  a2aTasks,
  forum,
  forumComments,
  forumVotes,
  quests,
  questSubmissions,
  redPackets,
  redPacketJoins,
  notifications,
  follows,
  socialVerifications,
  communityTasks,
  taskJoins,
  collectiveBounties,
  bountyJoins,
  engagements,
  engagementMessages,
  expertServices,
  offers,
  offerRefs,
  predictionMarkets,
  predictionPicks,
  predictionBalances,
  uploads,
  transaction,
  query,
};
