-- =====================================================
-- Migration 049: Multilingual Advisor Profiles - Performance Indexes (Fallback)
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 28, 2025
-- Purpose: Create indexes for multilingual advisor profiles (non-concurrent fallback)
-- Dependencies: Migration 048 (multilingual advisor profiles schema)
-- Status: Regular index creation (works in transactions)
--
-- NOTE: This uses regular CREATE INDEX instead of CONCURRENTLY to avoid
-- transaction block issues. Safe for low-traffic or development environments.
-- =====================================================

BEGIN;

-- Create GIN index for efficient multilingual bio queries
-- This enables fast searches within JSONB bio content
CREATE INDEX IF NOT EXISTS idx_advisors_multilingual_bio_gin 
ON advisors USING gin (multilingual_bio);

-- Partial index for advisors with multilingual content
-- This optimizes queries that filter for advisors with translated bios
CREATE INDEX IF NOT EXISTS idx_advisors_has_multilingual_bio
ON advisors (user_id) 
WHERE multilingual_bio != '{}'::jsonb;

-- Composite index for efficient language-specific queries
-- This optimizes the main advisor search endpoint with multilingual filtering
CREATE INDEX IF NOT EXISTS idx_advisors_multilingual_composite
ON advisors (approval_status, is_accepting_bookings) 
WHERE multilingual_bio != '{}'::jsonb;

COMMIT;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 049 FALLBACK completed successfully!';
  RAISE NOTICE '📊 Created 3 performance indexes for multilingual advisor profiles';
  RAISE NOTICE '⚠️  Used regular CREATE INDEX (not CONCURRENTLY) due to transaction constraints';
  RAISE NOTICE '🚀 Multilingual advisor profile system is now fully optimized';
END $$;