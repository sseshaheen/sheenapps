-- =====================================================
-- Migration 049: Multilingual Advisor Profiles - Performance Indexes
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 28, 2025
-- Purpose: Create concurrent indexes for multilingual advisor profiles
-- Dependencies: Migration 048 (multilingual advisor profiles schema)
-- Status: Concurrent index creation (non-transactional)
--
-- NOTE: This migration contains ONLY CREATE INDEX CONCURRENTLY commands
-- to avoid PostgreSQL transaction block conflicts. This is the recommended
-- best practice for concurrent index creation in migrations.
-- =====================================================

-- Create GIN index for efficient multilingual bio queries
-- This enables fast searches within JSONB bio content
CREATE INDEX CONCURRENTLY idx_advisors_multilingual_bio_gin 
ON advisors USING gin (multilingual_bio);

-- Partial index for advisors with multilingual content
-- This optimizes queries that filter for advisors with translated bios
CREATE INDEX CONCURRENTLY idx_advisors_has_multilingual_bio
ON advisors (user_id) 
WHERE multilingual_bio != '{}'::jsonb;

-- Composite index for efficient language-specific queries
-- This optimizes the main advisor search endpoint with multilingual filtering
CREATE INDEX CONCURRENTLY idx_advisors_multilingual_composite
ON advisors (approval_status, is_accepting_bookings) 
WHERE multilingual_bio != '{}'::jsonb;