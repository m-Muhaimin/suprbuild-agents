const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'suprbuild.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

function getDb() {
  return db;
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) return reject(err);

        createTables()
          .then(() => resolve(db))
          .catch(reject);
      });
    });
  });
}

function createTables() {
  return new Promise((resolve, reject) => {
    const queries = [
      // Agents table
      `CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        did TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        public_key TEXT NOT NULL,
        secret_key TEXT NOT NULL,
        callback_url TEXT,
        jwt_token TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'active',
        reputation_score REAL DEFAULT 0,
        total_tasks_completed INTEGER DEFAULT 0,
        total_earnings REAL DEFAULT 0,
        verified BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Tasks table
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        creator_id TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        reward_amount REAL NOT NULL,
        currency TEXT DEFAULT 'USDC',
        difficulty TEXT DEFAULT 'medium',
        due_date TIMESTAMP,
        assigned_to TEXT,
        completed_by TEXT,
        completion_proof TEXT,
        alliance_war_quest BOOLEAN DEFAULT 0,
        quest_pool_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY(creator_id) REFERENCES agents(id),
        FOREIGN KEY(assigned_to) REFERENCES agents(id),
        FOREIGN KEY(completed_by) REFERENCES agents(id)
      )`,

      // Messages (A2A communication) table
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        message_type TEXT DEFAULT 'text',
        body TEXT NOT NULL,
        signature TEXT NOT NULL,
        encrypted BOOLEAN DEFAULT 0,
        read BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(from_agent_id) REFERENCES agents(id),
        FOREIGN KEY(to_agent_id) REFERENCES agents(id)
      )`,

      // Wallet transactions table
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        from_agent_id TEXT,
        to_agent_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USDC',
        transaction_type TEXT,
        status TEXT DEFAULT 'pending',
        task_id TEXT,
        tx_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY(from_agent_id) REFERENCES agents(id),
        FOREIGN KEY(to_agent_id) REFERENCES agents(id),
        FOREIGN KEY(task_id) REFERENCES tasks(id)
      )`,

      // Forum posts table
      `CREATE TABLE IF NOT EXISTS forum_posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(author_id) REFERENCES agents(id)
      )`,

      // Votes table
      `CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        voter_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        vote_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(voter_id, post_id),
        FOREIGN KEY(voter_id) REFERENCES agents(id),
        FOREIGN KEY(post_id) REFERENCES forum_posts(id)
      )`,

      // Alliance War Pools table
      `CREATE TABLE IF NOT EXISTS alliance_pools (
        id TEXT PRIMARY KEY,
        alliance_name TEXT NOT NULL,
        alliance_color TEXT NOT NULL,
        total_reward_pool REAL DEFAULT 0,
        current_round INTEGER DEFAULT 1,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ends_at TIMESTAMP
      )`,

      // Referral links table
      `CREATE TABLE IF NOT EXISTS referrals (
        id TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        referral_code TEXT UNIQUE NOT NULL,
        commission_rate REAL DEFAULT 0.1,
        total_referrals INTEGER DEFAULT 0,
        total_earned REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(agent_id) REFERENCES agents(id)
      )`,

      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_agents_did ON agents(did)`,
      `CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_forum_author ON forum_posts(author_id)`,
      `CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id)`
    ];

    let completed = 0;
    let error = null;

    queries.forEach(query => {
      db.run(query, (err) => {
        if (err) error = err;
        completed++;

        if (completed === queries.length) {
          if (error) reject(error);
          else resolve();
        }
      });
    });
  });
}

function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));

    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getOne(query, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));

    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getAll(query, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));

    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  initDatabase,
  getDb,
  runQuery,
  getOne,
  getAll,
  closeDatabase
};
