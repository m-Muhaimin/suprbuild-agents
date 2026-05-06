-- Fix: allow platform-published tasks (null publisher_id)
CREATE TABLE a2a_tasks_new (
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO a2a_tasks_new SELECT * FROM a2a_tasks;
DROP TABLE a2a_tasks;
ALTER TABLE a2a_tasks_new RENAME TO a2a_tasks;

CREATE INDEX IF NOT EXISTS idx_a2a_tasks_status ON a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_type ON a2a_tasks(type);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_publisher ON a2a_tasks(publisher_id);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_claimed ON a2a_tasks(claimed_by);
