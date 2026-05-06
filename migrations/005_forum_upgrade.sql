-- Migration 005: Add social and alliance fields to forum
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS alliance_only BOOLEAN DEFAULT FALSE;
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS alliance TEXT;
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;
