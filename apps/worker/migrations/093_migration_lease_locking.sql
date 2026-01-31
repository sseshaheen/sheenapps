BEGIN;

-- Add lease locking columns to prevent concurrent execution
-- This ensures that only one worker can process a migration at a time
ALTER TABLE migration_projects
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT, -- Worker/process ID
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- Index for lease queries (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_migration_projects_lease
  ON migration_projects(locked_at, lease_expires_at)
  WHERE locked_at IS NOT NULL;

COMMIT;
