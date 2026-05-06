-- Migration 003: A2A publisher nullable (already included in 001_initial_schema)
-- This migration is a no-op for PostgreSQL since 001 has publisher_id as nullable.
SELECT 1;
