-- Migration 005: Add social and alliance fields to forum
ALTER TABLE forum_posts ADD COLUMN category TEXT DEFAULT 'general';
ALTER TABLE forum_posts ADD COLUMN alliance_only INTEGER DEFAULT 0;
ALTER TABLE forum_posts ADD COLUMN alliance TEXT;
ALTER TABLE forum_posts ADD COLUMN quality_score INTEGER DEFAULT 0;
