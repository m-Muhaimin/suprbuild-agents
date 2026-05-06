CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  migration TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  callback_url TEXT,
  referral_code TEXT UNIQUE,
  referred_by TEXT REFERENCES agents(id),
  alliance TEXT,
  alliance_changes_left INTEGER DEFAULT 1,
  balance_usd DOUBLE PRECISION DEFAULT 0,
  held_usd DOUBLE PRECISION DEFAULT 0,
  points_balance INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  level_name TEXT DEFAULT 'Dormant',
  streak INTEGER DEFAULT 0,
  last_checkin TEXT,
  wallet_address TEXT,
  fluxa_agent_id TEXT,
  twitter_verified BOOLEAN DEFAULT FALSE,
  twitter_username TEXT,
  reddit_verified BOOLEAN DEFAULT FALSE,
  discord_verified BOOLEAN DEFAULT FALSE,
  pending_engagements INTEGER DEFAULT 0,
  reputation_score DOUBLE PRECISION DEFAULT 50,
  reputation_tier TEXT DEFAULT 'Newcomer',
  capabilities TEXT DEFAULT '[]',
  completed_tasks INTEGER DEFAULT 0,
  onboarding TEXT DEFAULT '{"wallet_set":false,"ref_link_generated":false,"forum_post_made":false,"alliance_chosen":false,"completed":false}',
  daily_quests TEXT,
  xp_today TEXT,
  transfers TEXT DEFAULT '[]',
  level_up_reward TEXT,
  referrals TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  did TEXT,
  "publicKey" TEXT,
  "secretKey" TEXT,
  balance_usd DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  payout_usd DOUBLE PRECISION DEFAULT 0,
  commission_rate DOUBLE PRECISION DEFAULT 0,
  conversion_rate DOUBLE PRECISION DEFAULT 0,
  signals TEXT DEFAULT '[]',
  anti_signals TEXT DEFAULT '[]',
  pitch_guidance TEXT,
  disclosure TEXT,
  status TEXT DEFAULT 'active',
  merchant_id UUID REFERENCES merchants(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_refs (
  token TEXT PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES offers(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES agents(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_votes (
  post_id UUID NOT NULL REFERENCES forum_posts(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  direction TEXT NOT NULL,
  PRIMARY KEY (post_id, agent_id)
);

CREATE TABLE IF NOT EXISTS community_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  goal TEXT,
  reward_amount DOUBLE PRECISION,
  reward_currency TEXT DEFAULT 'USDC',
  status TEXT DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_joins (
  task_id UUID NOT NULL REFERENCES community_tasks(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  proof_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, agent_id)
);

CREATE TABLE IF NOT EXISTS collective_bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reward_pool DOUBLE PRECISION,
  reward_currency TEXT DEFAULT 'USDC',
  status TEXT DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bounty_joins (
  bounty_id UUID NOT NULL REFERENCES collective_bounties(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  proof_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bounty_id, agent_id)
);

CREATE TABLE IF NOT EXISTS quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  goal TEXT,
  reward_usd DOUBLE PRECISION DEFAULT 0,
  platform_fee DOUBLE PRECISION DEFAULT 0.10,
  status TEXT DEFAULT 'open',
  merchant_id UUID REFERENCES merchants(id),
  deadline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quest_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES quests(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  proof_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS red_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_usd DOUBLE PRECISION NOT NULL,
  challenge_description TEXT,
  status TEXT DEFAULT 'active',
  questions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TEXT,
  next_packet_at TEXT
);

CREATE TABLE IF NOT EXISTS red_packet_joins (
  packet_id UUID NOT NULL REFERENCES red_packets(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (packet_id, agent_id)
);

CREATE TABLE IF NOT EXISTS engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  reward_usd DOUBLE PRECISION,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expert_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT,
  price_usd DOUBLE PRECISION,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  task_id TEXT,
  quest_id TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES agents(id),
  followee_id UUID NOT NULL REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS prediction_markets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT,
  outcome_yes_prob DOUBLE PRECISION,
  outcome_no_prob DOUBLE PRECISION,
  status TEXT DEFAULT 'open',
  volume_usd DOUBLE PRECISION DEFAULT 0,
  resolves_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prediction_picks (
  market_id TEXT NOT NULL REFERENCES prediction_markets(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  pick TEXT NOT NULL,
  amount DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (market_id, agent_id)
);

CREATE TABLE IF NOT EXISTS prediction_balances (
  agent_id UUID PRIMARY KEY REFERENCES agents(id),
  usdc DOUBLE PRECISION DEFAULT 100,
  xp DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE IF NOT EXISTS uploads (
  key TEXT PRIMARY KEY,
  url TEXT,
  agent_id UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_verifications (
  agent_id UUID NOT NULL REFERENCES agents(id),
  platform TEXT NOT NULL,
  code TEXT,
  claim_id TEXT,
  status TEXT DEFAULT 'pending',
  expires_at TEXT,
  PRIMARY KEY (agent_id, platform)
);

CREATE TABLE IF NOT EXISTS a2a_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT,
  spec TEXT NOT NULL,
  budget DOUBLE PRECISION NOT NULL,
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
  payout_amount DOUBLE PRECISION,
  payout_multiplier DOUBLE PRECISION DEFAULT 1.0,
  deadline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_tasks_status ON a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_type ON a2a_tasks(type);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_publisher ON a2a_tasks(publisher_id);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_claimed ON a2a_tasks(claimed_by);

CREATE TABLE IF NOT EXISTS a2a_task_history (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL,
  agent_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_history_task ON a2a_task_history(task_id);
