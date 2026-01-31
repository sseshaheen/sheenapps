-- Migration 093: Add idempotency support to voice_recordings
--
-- Adds:
-- 1. client_recording_id column for idempotent upserts
-- 2. source column to track 'hero' vs 'project' recordings (with CHECK constraint)
-- 3. Makes project_id nullable (hero recordings have no project)
-- 4. Unique constraint on (user_id, client_recording_id) for idempotency
--
-- Required for the server-auth voice transcription flow where:
-- - recordingId is generated at recording START (client-side)
-- - Same recordingId = same record (update on retry/double-tap)

BEGIN;

-- 1. Add client_recording_id column (nullable for existing rows)
-- New rows should always provide this; partial unique index enforces idempotency
ALTER TABLE voice_recordings
ADD COLUMN IF NOT EXISTS client_recording_id UUID;

-- 2. Add source column with default for existing rows
-- Values: 'hero' (homepage recordings) or 'project' (within a project)
ALTER TABLE voice_recordings
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'project';

-- 2b. Add CHECK constraint to prevent typos/invalid values
-- Only 'hero' and 'project' are currently used in the codebase
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voice_recordings_source_check'
  ) THEN
    ALTER TABLE voice_recordings
    ADD CONSTRAINT voice_recordings_source_check
    CHECK (source IN ('hero', 'project'));
  END IF;
END $$;

-- 3. Make project_id nullable (hero recordings have no project)
-- Note: FK constraint remains intact, only removing NOT NULL
ALTER TABLE voice_recordings
ALTER COLUMN project_id DROP NOT NULL;

-- 4. Add unique constraint for idempotency
-- Only applies to rows WITH a client_recording_id (partial index)
-- This allows existing rows without client_recording_id to remain
CREATE UNIQUE INDEX IF NOT EXISTS ux_voice_recordings_user_client_id
ON voice_recordings (user_id, client_recording_id)
WHERE client_recording_id IS NOT NULL;

-- 5. Add composite index on (source, created_at) for "latest recordings by source" queries
-- More useful than plain source index since queries typically want "latest first"
CREATE INDEX IF NOT EXISTS idx_voice_recordings_source_created_at
ON voice_recordings (source, created_at DESC);

-- 6. Add index on client_recording_id for lookups
CREATE INDEX IF NOT EXISTS idx_voice_recordings_client_recording_id
ON voice_recordings (client_recording_id)
WHERE client_recording_id IS NOT NULL;

-- 7. Add UPDATE RLS policy for UPSERT flows
-- CRITICAL: Without this, UPSERT fails because ON CONFLICT requires UPDATE permission
-- The INSERT policy alone is not sufficient for upsert operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'Users can update own voice recordings'
    AND polrelid = 'voice_recordings'::regclass
  ) THEN
    CREATE POLICY "Users can update own voice recordings"
    ON voice_recordings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

COMMIT;
