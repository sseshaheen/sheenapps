-- Migration: 127_inhouse_activity_service_constraint.sql
-- Description: Update service constraint to include forms, search, and other new services
-- Critical: Without this, forms/search activity logs silently fail due to CHECK constraint

BEGIN;

-- Drop existing service constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_activity_service_check'
    AND conrelid = 'inhouse_activity_log'::regclass
  ) THEN
    ALTER TABLE inhouse_activity_log DROP CONSTRAINT inhouse_activity_service_check;
  END IF;
END $$;

-- Add updated constraint with all services
ALTER TABLE inhouse_activity_log
  ADD CONSTRAINT inhouse_activity_service_check
  CHECK (service IN (
    'auth',
    'db',
    'storage',
    'jobs',
    'email',
    'payments',
    'analytics',
    'secrets',
    'backups',
    'flags',
    'connectors',
    'edge-functions',
    'ai',
    'realtime',
    'notifications',
    'forms',
    'search'
  ));

-- Add indexes for common query patterns (if not exists)
CREATE INDEX IF NOT EXISTS idx_inhouse_activity_project_created
  ON inhouse_activity_log (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inhouse_activity_project_service_created
  ON inhouse_activity_log (project_id, service, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inhouse_activity_correlation
  ON inhouse_activity_log (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMIT;
