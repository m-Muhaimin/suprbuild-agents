'use strict';
const { getDb } = require('./database');

function jsonParse(val, fallback) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

const AGENT_FIELDS = new Set([
  'name', 'description', 'callback_url', 'alliance', 'alliance_changes_left',
  'balance_usd', 'held_usd', 'points_balance', 'level', 'level_name',
  'streak', 'last_checkin', 'wallet_address', 'fluxa_agent_id',
  'twitter_verified', 'twitter_username', 'reddit_verified', 'discord_verified',
  'pending_engagements', 'reputation_score', 'reputation_tier',
  'capabilities', 'completed_tasks', 'onboarding', 'daily_quests', 'xp_today', 'transfers',
  'level_up_reward', 'referrals', 'callback_url',
]);

function syncAgentToDb(a, field, value) {
  if (!a.id || !AGENT_FIELDS.has(field)) return;
  const db = getDb();
  let dbVal = value;
  if (['capabilities', 'onboarding', 'daily_quests', 'xp_today', 'transfers', 'level_up_reward', 'referrals'].includes(field)) {
    dbVal = typeof value === 'string' ? value : JSON.stringify(value);
  } else if (field === 'twitter_verified' || field === 'reddit_verified' || field === 'discord_verified') {
    dbVal = value ? 1 : 0;
  }
  try {
    db.prepare(`UPDATE agents SET ${field} = ? WHERE id = ?`).run(dbVal, a.id);
  } catch { /* ignore */ }
}

function createAgentProxy(row) {
  if (!row) return null;
  const target = {
    id: row.id,
    api_key: row.api_key,
    name: row.name,
    description: row.description,
    callback_url: row.callback_url,
    referral_code: row.referral_code,
    referred_by: row.referred_by,
    alliance: row.alliance,
    alliance_changes_left: row.alliance_changes_left,
    balance_usd: row.balance_usd,
    held_usd: row.held_usd,
    points_balance: row.points_balance,
    level: row.level,
    level_name: row.level_name,
    streak: row.streak,
    last_checkin: row.last_checkin,
    wallet_address: row.wallet_address,
    fluxa_agent_id: row.fluxa_agent_id,
    twitter_verified: !!row.twitter_verified,
    twitter_username: row.twitter_username,
    reddit_verified: !!row.reddit_verified,
    discord_verified: !!row.discord_verified,
    pending_engagements: row.pending_engagements,
    reputation_score: row.reputation_score,
    reputation_tier: row.reputation_tier,
    capabilities: jsonParse(row.capabilities, []),
    completed_tasks: row.completed_tasks || 0,
    onboarding: jsonParse(row.onboarding, {}),
    daily_quests: jsonParse(row.daily_quests, {}),
    xpToday: jsonParse(row.xp_today, {}),
    created_at: row.created_at,
    transfers: jsonParse(row.transfers, []),
  };

  return new Proxy(target, {
    set(obj, prop, value) {
      obj[prop] = value;
      syncAgentToDb(obj, prop, value);
      return true;
    },
  });
}

class AgentMap {
  constructor() { this._cache = new Map(); }
  _load(id) {
    const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id);
    const a = createAgentProxy(row);
    if (a) this._cache.set(id, a);
    return a;
  }
  get(id) { return this._cache.get(id) || this._load(id); }
  set(id, data) {
    const db = getDb();
    db.prepare(`
      INSERT INTO agents (id, api_key, name, description, referral_code, referred_by, alliance, alliance_changes_left,
        balance_usd, held_usd, points_balance, level, level_name, streak, last_checkin, wallet_address, fluxa_agent_id,
        twitter_verified, reddit_verified, discord_verified, pending_engagements, reputation_score, reputation_tier,
        capabilities, completed_tasks, onboarding, daily_quests, xp_today, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.api_key, data.name, data.description || '', data.referral_code, data.referred_by || null,
      data.alliance || null, data.alliance_changes_left ?? 1, data.balance_usd ?? 0, data.held_usd ?? 0,
      data.points_balance ?? 0, data.level ?? 1, data.level_name ?? 'Dormant', data.streak ?? 0,
      data.last_checkin || null, data.wallet_address || null, data.fluxa_agent_id || null,
      data.twitter_verified ? 1 : 0, data.reddit_verified ? 1 : 0, data.discord_verified ? 1 : 0,
      data.pending_engagements ?? 0, data.reputation_score ?? 50, data.reputation_tier ?? 'Newcomer',
      JSON.stringify(data.capabilities || []), data.completed_tasks ?? 0,
      JSON.stringify(data.onboarding || {}), JSON.stringify(data.daily_quests || {}),
      data.xpToday ? JSON.stringify(data.xpToday) : null, data.created_at
    );
    this._load(id);
  }
  values() {
    const rows = getDb().prepare('SELECT * FROM agents').all();
    return rows.map(r => {
      if (this._cache.has(r.id)) return this._cache.get(r.id);
      return this._load(r.id);
    }).filter(Boolean);
  }
  delete(id) {
    getDb().prepare('DELETE FROM agents WHERE id = ?').run(id);
    this._cache.delete(id);
  }
  get size() { return this._cache.size; }
  forEach(fn) { this.values().forEach((v, k) => fn(v, k)); }
}

class MapProxy {
  constructor(table, rowMapper) { this._table = table; this._mapper = rowMapper; this._cache = new Map(); this._pkCols = null; }

  _getPkCols() {
    if (this._pkCols) return this._pkCols;
    const info = getDb().pragma(`table_info(${this._table})`);
    this._pkCols = info.filter(c => c.pk).map(c => c.name);
    if (!this._pkCols.length) this._pkCols = ['id'];
    return this._pkCols;
  }

  _buildKey(row) {
    const cols = this._getPkCols();
    if (cols.length === 1) return row[cols[0]] || row.id;
    return cols.map(c => row[c]).join(':');
  }

  _load(id) {
    const cols = this._getPkCols();
    let row;
    if (cols.length === 1) {
      row = getDb().prepare(`SELECT * FROM ${this._table} WHERE ${cols[0]} = ?`).get(id);
    } else {
      const parts = id.split(':');
      const where = cols.map((c, i) => `${c} = ?`).join(' AND ');
      row = getDb().prepare(`SELECT * FROM ${this._table} WHERE ${where}`).get(...parts);
    }
    if (!row) return null;
    const v = this._mapper ? this._mapper(row) : { ...row };
    const key = this._buildKey(row);
    this._cache.set(key, v);
    return v;
  }

  get(id) { return this._cache.get(id) || this._load(id); }

  set(id, data) {
    const db = getDb();
    const cols = Object.keys(data);
    const placeholders = cols.map(() => '?');
    const vals = cols.map(k => {
      const v = data[k];
      return (Array.isArray(v) || (v && typeof v === 'object')) ? JSON.stringify(v) : v;
    });

    const insertCols = [...cols];
    const insertVals = [...vals];

    if (id !== undefined) {
      insertCols.push('id');
      insertVals.push(id);
    }

    db.prepare(`INSERT OR REPLACE INTO ${this._table} (${insertCols.join(',')}) VALUES (${insertVals.map(() => '?').join(',')})`).run(...insertVals);

    const merged = { id, ...data };
    if (this._mapper) {
      const mapped = this._mapper(merged);
      this._cache.set(id || this._buildKey(merged), mapped);
    } else {
      this._cache.set(id || this._buildKey(merged), merged);
    }
  }

  values() {
    const rows = getDb().prepare(`SELECT * FROM ${this._table}`).all();
    const result = [];
    rows.forEach(r => {
      const key = this._buildKey(r);
      if (this._cache.has(key)) {
        result.push(this._cache.get(key));
      } else {
        const v = this._mapper ? this._mapper(r) : { ...r };
        this._cache.set(key, v);
        result.push(v);
      }
    });
    return result;
  }

  delete(id) {
    const cols = this._getPkCols();
    if (cols.length === 1) {
      getDb().prepare(`DELETE FROM ${this._table} WHERE ${cols[0]} = ?`).run(id);
    } else {
      const parts = id.split(':');
      const where = cols.map((c, i) => `${c} = ?`).join(' AND ');
      getDb().prepare(`DELETE FROM ${this._table} WHERE ${where}`).run(...parts);
    }
    this._cache.delete(id);
  }

  get size() { return this.values().length; }
  forEach(fn) { this.values().forEach((v, k) => fn(v, k)); }
}

class CompositeKeyMap {
  constructor(table) { this._table = table; this._cache = new Map(); }
  _load() {
    const rows = getDb().prepare(`SELECT * FROM ${this._table}`).all();
    rows.forEach(r => { this._cache.set(r.id, r); });
  }
  get(key) { if (!this._cache.size) this._load(); return this._cache.get(key); }
  set(key, data) {
    const db = getDb();
    const cols = Object.keys(data);
    cols.push('id');
    const vals = cols.map(k => {
      const v = data[k] !== undefined ? data[k] : key;
      return (Array.isArray(v) || (v && typeof v === 'object')) ? JSON.stringify(v) : v;
    });
    db.prepare(`INSERT OR REPLACE INTO ${this._table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    this._cache.set(key, data);
  }
  delete(key) {
    getDb().prepare(`DELETE FROM ${this._table} WHERE id = ?`).run(key);
    this._cache.delete(key);
  }
  values() { if (!this._cache.size) this._load(); return [...this._cache.values()]; }
  keys() { if (!this._cache.size) this._load(); return [...this._cache.keys()]; }
  get size() { if (!this._cache.size) this._load(); return this._cache.size; }
  forEach(fn) { this.values().forEach((v, k) => fn(v, k)); }
}

class KeyValueMap {
  constructor() { this._cache = new Map(); }
  _load() {
    const rows = getDb().prepare('SELECT api_key, id FROM agents').all();
    rows.forEach(r => this._cache.set(r.api_key, r.id));
  }
  get(key) { if (!this._cache.size) this._load(); return this._cache.get(key); }
  set(key, id) { this._cache.set(key, id); }
  delete(key) { this._cache.delete(key); }
}

const store = {
  agents: new AgentMap(),
  merchants: new MapProxy('merchants'),
  offers: new MapProxy('offers'),
  offerRefs: new MapProxy('offer_refs'),
  forum: new MapProxy('forum_posts'),
  forumComments: new MapProxy('forum_comments'),
  forumVotes: new MapProxy('forum_votes'),
  communityTasks: new MapProxy('community_tasks'),
  taskJoins: new MapProxy('task_joins'),
  collectiveBounties: new MapProxy('collective_bounties'),
  bountyJoins: new MapProxy('bounty_joins'),
  quests: new MapProxy('quests'),
  questSubmissions: new MapProxy('quest_submissions'),
  redPackets: new MapProxy('red_packets', row => {
    const r = { ...row };
    if (r.questions) try { r.questions = JSON.parse(r.questions); } catch { r.questions = []; }
    return r;
  }),
  redPacketJoins: new MapProxy('red_packet_joins'),
  engagements: new MapProxy('engagements'),
  engagementMessages: new MapProxy('engagement_messages'),
  experts: new MapProxy('experts'),
  expertServices: new MapProxy('expert_services'),
  notifications: new MapProxy('notifications'),
  follows: new CompositeKeyMap('follows'),
  checkins: new Map(),
  predictionMarkets: new MapProxy('prediction_markets'),
  predictionPicks: new MapProxy('prediction_picks'),
  predictionBalances: new MapProxy('prediction_balances'),
  uploads: new MapProxy('uploads'),
  socialVerifications: new CompositeKeyMap('social_verifications'),
  apiKeyIndex: new KeyValueMap(),
  merchantKeyIndex: new Map(),
  a2aTasks: new MapProxy('a2a_tasks', row => {
    const r = { ...row };
    if (r.spec) try { r.spec = JSON.parse(r.spec); } catch { r.spec = {}; }
    if (r.deliverable) try { r.deliverable = JSON.parse(r.deliverable); } catch {}
    return r;
  }),
  a2aSubmissions: new Map(),
};

module.exports = store;
