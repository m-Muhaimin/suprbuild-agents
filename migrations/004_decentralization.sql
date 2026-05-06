-- Migration: Add decentralization fields to agents and merchants, and create a2a_messages table
ALTER TABLE agents ADD COLUMN did TEXT;
ALTER TABLE agents ADD COLUMN publicKey TEXT;
ALTER TABLE agents ADD COLUMN secretKey TEXT;

ALTER TABLE merchants ADD COLUMN did TEXT;
ALTER TABLE merchants ADD COLUMN publicKey TEXT;
ALTER TABLE merchants ADD COLUMN secretKey TEXT;

CREATE TABLE IF NOT EXISTS a2a_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    sender_did TEXT,
    recipient_id TEXT NOT NULL,
    recipient_did TEXT,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    signature TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES agents(id),
    FOREIGN KEY (recipient_id) REFERENCES agents(id)
);
