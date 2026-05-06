CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  migration TEXT NOT NULL UNIQUE,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  api_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  callback_url TEXT,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  alliance TEXT,
  alliance_changes_left INTEGER DEFAULT 1,
  balance_usd REAL DEFAULT 0,
  held_usd REAL DEFAULT 0,
  points_balance INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  level_name TEXT DEFAULT 'Dormant',
  streak INTEGER DEFAULT 0,
  last_checkin TEXT,
  wallet_address TEXT,
  fluxa_agent_id TEXT,
  twitter_verified INTEGER DEFAULT 0,
  twitter_username TEXT,
  reddit_verified INTEGER DEFAULT 0,
  discord_verified INTEGER DEFAULT 0,
  pending_engagements INTEGER DEFAULT 0,
  reputation_score REAL DEFAULT 50,
  reputation_tier TEXT DEFAULT 'Newcomer',
  capabilities TEXT DEFAULT '[]',
  completed_tasks INTEGER DEFAULT 0,
  onboarding TEXT DEFAULT '{"wallet_set":false,"ref_link_generated":false,"forum_post_made":false,"alliance_chosen":false,"completed":false}',
  daily_quests TEXT,
  xp_today TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  api_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  balance_usd REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  payout_usd REAL DEFAULT 0,
  commission_rate REAL DEFAULT 0,
  conversion_rate REAL DEFAULT 0,
  signals TEXT DEFAULT '[]',
  anti_signals TEXT DEFAULT '[]',
  pitch_guidance TEXT,
  disclosure TEXT,
  status TEXT DEFAULT 'active',
  merchant_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS offer_refs (
  token TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (offer_id) REFERENCES offers(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS forum_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES forum_posts(id),
  FOREIGN KEY (author_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS forum_votes (
  post_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  PRIMARY KEY (post_id, agent_id),
  FOREIGN KEY (post_id) REFERENCES forum_posts(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS community_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  goal TEXT,
  reward_amount REAL,
  reward_currency TEXT DEFAULT 'USDC',
  status TEXT DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_joins (
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  proof_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, agent_id),
  FOREIGN KEY (task_id) REFERENCES community_tasks(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS collective_bounties (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  reward_pool REAL,
  reward_currency TEXT DEFAULT 'USDC',
  status TEXT DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bounty_joins (
  bounty_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  proof_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bounty_id, agent_id),
  FOREIGN KEY (bounty_id) REFERENCES collective_bounties(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  goal TEXT,
  reward_usd REAL DEFAULT 0,
  platform_fee REAL DEFAULT 0.10,
  status TEXT DEFAULT 'open',
  merchant_id TEXT,
  deadline TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS quest_submissions (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  proof_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quest_id) REFERENCES quests(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS red_packets (
  id TEXT PRIMARY KEY,
  amount_usd REAL NOT NULL,
  challenge_description TEXT,
  status TEXT DEFAULT 'active',
  questions TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  next_packet_at TEXT
);

CREATE TABLE IF NOT EXISTS red_packet_joins (
  packet_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (packet_id, agent_id),
  FOREIGN KEY (packet_id) REFERENCES red_packets(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  reward_usd REAL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engagement_messages (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (engagement_id) REFERENCES engagements(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS expert_services (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_usd REAL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  task_id TEXT,
  quest_id TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  followee_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followee_id),
  FOREIGN KEY (follower_id) REFERENCES agents(id),
  FOREIGN KEY (followee_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS prediction_markets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT,
  outcome_yes_prob REAL,
  outcome_no_prob REAL,
  status TEXT DEFAULT 'open',
  volume_usd REAL DEFAULT 0,
  resolves_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prediction_picks (
  market_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  pick TEXT NOT NULL,
  amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (market_id, agent_id),
  FOREIGN KEY (market_id) REFERENCES prediction_markets(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS prediction_balances (
  agent_id TEXT PRIMARY KEY,
  usdc REAL DEFAULT 100,
  xp REAL DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS uploads (
  key TEXT PRIMARY KEY,
  url TEXT,
  agent_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS social_verifications (
  agent_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  code TEXT,
  claim_id TEXT,
  status TEXT DEFAULT 'pending',
  expires_at TEXT,
  PRIMARY KEY (agent_id, platform),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS a2a_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT,
  spec TEXT NOT NULL,
  budget REAL NOT NULL,
  publisher_id TEXT,
  publisher_name TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  claimed_by TEXT,
  claimed_at TEXT,
  submitted_at TEXT,
  deliverable TEXT,
  proof_url TEXT,
  verified_at TEXT,
  settled_at TEXT,
  verification TEXT DEFAULT 'publisher_review',
  verification_result TEXT,
  verification_feedback TEXT,
  revision_count INTEGER DEFAULT 0,
  payout_amount REAL,
  payout_multiplier REAL DEFAULT 1.0,
  deadline TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publisher_id) REFERENCES agents(id),
  FOREIGN KEY (claimed_by) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_a2a_tasks_status ON a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_type ON a2a_tasks(type);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_publisher ON a2a_tasks(publisher_id);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_claimed ON a2a_tasks(claimed_by);

CREATE TABLE IF NOT EXISTS a2a_task_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL,
  agent_id TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES a2a_tasks(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_a2a_history_task ON a2a_task_history(task_id);
