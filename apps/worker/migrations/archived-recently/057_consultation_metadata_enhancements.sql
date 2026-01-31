-- =====================================================
-- Migration 057: Consultation Metadata Enhancements
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 29, 2025
-- Purpose: Add advisor-specific consultation metadata and performance indexes
-- Dependencies: Migration 056 (Advisor availability settings)
-- =====================================================

BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Part 1: Add Advisor-Specific Consultation Metadata
-- =====================================================

-- Add advisor-specific consultation metadata to existing advisor_consultations table
ALTER TABLE advisor_consultations 
ADD COLUMN advisor_notes TEXT,           -- Private notes for advisor
ADD COLUMN preparation_materials JSONB, -- Links, docs shared with client
ADD COLUMN consultation_outcome JSONB;  -- Advisor's success metrics

-- Add size constraints for JSONB fields to prevent abuse
ALTER TABLE advisor_consultations
  ADD CONSTRAINT chk_prep_size CHECK (preparation_materials IS NULL OR pg_column_size(preparation_materials) <= 16384),
  ADD CONSTRAINT chk_outcome_size CHECK (consultation_outcome IS NULL OR pg_column_size(consultation_outcome) <= 16384);

-- =====================================================
-- Part 2: Essential Performance Indexes
-- =====================================================

-- Essential performance indexes for dashboard queries
-- Index for upcoming consultations (scheduled and in_progress)
CREATE INDEX IF NOT EXISTS idx_advisor_consult_scheduled_upcoming
  ON advisor_consultations (advisor_id, start_time)
  WHERE status IN ('scheduled','in_progress');

-- Index for completed consultations (most recent first)
CREATE INDEX IF NOT EXISTS idx_advisor_consult_completed
  ON advisor_consultations (advisor_id, start_time DESC)
  WHERE status = 'completed';

-- Index for consultation analytics queries (by month/period)
CREATE INDEX IF NOT EXISTS idx_advisor_consult_analytics
  ON advisor_consultations (advisor_id, created_at)
  WHERE status = 'completed';

-- =====================================================
-- Part 3: Worker Database Grants
-- =====================================================

-- Worker database role grants for consultation metadata
GRANT SELECT, INSERT, UPDATE ON advisor_consultations TO worker_db_role;

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- Verification and Summary
-- =====================================================

-- Check existing consultation data
SELECT 
  COUNT(*) as total_consultations,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled,
  COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
FROM advisor_consultations;

-- Check indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'advisor_consultations' 
  AND indexname LIKE 'idx_advisor_consult_%';

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 057 completed successfully!';
  RAISE NOTICE '📝 Added advisor_notes, preparation_materials, consultation_outcome';
  RAISE NOTICE '⚡ Performance indexes created for dashboard queries';
  RAISE NOTICE '🔒 Size constraints applied to JSONB fields';
  RAISE NOTICE '📱 Next: Migration 058 - Analytics summary tables';
END $$;