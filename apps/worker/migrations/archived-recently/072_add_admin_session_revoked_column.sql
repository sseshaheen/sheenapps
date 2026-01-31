-- Migration: Add is_revoked column to admin_sessions table
-- Purpose: Support session revocation for admin JWT refresh flow
-- Date: 2025-09-07

BEGIN;

-- Add is_revoked column to admin_sessions table
ALTER TABLE admin_sessions 
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false;

-- Add index for faster lookups of non-revoked sessions
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active 
ON admin_sessions(session_id) 
WHERE is_revoked = false;

-- Add comment for documentation
COMMENT ON COLUMN admin_sessions.is_revoked IS 'Whether this session has been manually revoked by an admin';

-- Update any existing sessions to not be revoked (safe default)
UPDATE admin_sessions 
SET is_revoked = false 
WHERE is_revoked IS NULL;

COMMIT;