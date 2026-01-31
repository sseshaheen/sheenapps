-- ============================================================================
-- Migration: 114_inhouse_activity_constraints.sql
-- Purpose: Add CHECK constraints to inhouse_activity_log for data integrity
-- ============================================================================

-- Add status constraint to ensure only valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_activity_status_check'
  ) THEN
    ALTER TABLE inhouse_activity_log
      ADD CONSTRAINT inhouse_activity_status_check
      CHECK (status IN ('success', 'error', 'pending'));
  END IF;
END $$;

-- Add service constraint to ensure only valid services
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_activity_service_check'
  ) THEN
    ALTER TABLE inhouse_activity_log
      ADD CONSTRAINT inhouse_activity_service_check
      CHECK (service IN ('auth', 'db', 'storage', 'jobs', 'email', 'payments', 'analytics', 'secrets', 'backups'));
  END IF;
END $$;
