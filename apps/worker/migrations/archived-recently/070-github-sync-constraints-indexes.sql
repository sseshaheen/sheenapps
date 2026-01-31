BEGIN;

-- Migration 070: GitHub Sync Constraints and Performance Indexes
-- Expert feedback implementation for data integrity and query performance

-- Must-add Item 1: Validate sync mode
-- Ensures only valid sync modes can be stored
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_sync_mode_ck') THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_sync_mode_ck
      CHECK (github_sync_mode IN ('direct_commit','protected_pr','hybrid'));
  END IF;
END $$;

-- Must-add Item 2: Conditional integrity when sync is enabled  
-- Ensures that if sync is enabled, required GitHub fields are present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_github_sync_enabled_ck') THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_github_sync_enabled_ck
      CHECK (
        github_sync_enabled = false
        OR (github_repo_owner IS NOT NULL
            AND github_repo_name IS NOT NULL
            AND github_installation_id IS NOT NULL)
      );
  END IF;
END $$;

-- Must-add Item 3: Future-proof SHAs (Git may be 40 or 64 hex)
-- Expand SHA columns to support future Git hash lengths
ALTER TABLE projects
  ALTER COLUMN last_remote_main_sha TYPE VARCHAR(64),
  ALTER COLUMN last_synced_main_sha TYPE VARCHAR(64),
  ALTER COLUMN last_outbound_base_sha TYPE VARCHAR(64);

-- Add regex constraints to validate SHA format (40-64 hex characters)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_sha_ck') THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_sha_ck
      CHECK (
        (last_remote_main_sha IS NULL OR last_remote_main_sha ~ '^[0-9a-f]{40,64}$') AND
        (last_synced_main_sha IS NULL OR last_synced_main_sha ~ '^[0-9a-f]{40,64}$') AND
        (last_outbound_base_sha IS NULL OR last_outbound_base_sha ~ '^[0-9a-f]{40,64}$')
      );
  END IF;
END $$;

-- Must-add Item 4: Composite indexes for actual UI query patterns
-- Recent sync operations for a project (admin dashboards, project settings)
CREATE INDEX IF NOT EXISTS idx_gso_project_created_at
  ON github_sync_operations(project_id, created_at DESC);

-- Filter by status and order by recency (failed operations, completed operations)  
CREATE INDEX IF NOT EXISTS idx_gso_project_status_created
  ON github_sync_operations(project_id, status, created_at DESC);

-- Fast dashboards: active jobs only (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_gso_active
  ON github_sync_operations(project_id)
  WHERE status IN ('pending','processing');

-- Must-add Item 5: Delivery ID lookups for webhook deduplication
-- Fast lookups by GitHub delivery ID stored in metadata
CREATE INDEX IF NOT EXISTS idx_gso_delivery_id
  ON github_sync_operations USING BTREE ((metadata->>'delivery_id'));

-- Nice-to-have: Repo identity that survives renames
-- GitHub repos have numeric IDs that don't change when repos are renamed
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_id BIGINT;

-- Nice-to-have: Case-insensitive owner/name lookups
-- Improves search UX without changing column types
CREATE INDEX IF NOT EXISTS idx_projects_repo_ci
  ON projects (lower(github_repo_owner), lower(github_repo_name));

-- Nice-to-have: Helpful derived field for display
-- Generated column for convenient "owner/repo" format
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS github_repo_full_name TEXT
  GENERATED ALWAYS AS (
    CASE 
      WHEN github_repo_owner IS NOT NULL AND github_repo_name IS NOT NULL 
      THEN github_repo_owner || '/' || github_repo_name 
      ELSE NULL 
    END
  ) STORED;

-- Nice-to-have: Rename for clarity (optional, expert suggestion)
-- More descriptive column name
DO $$
BEGIN
  -- Only rename if column exists and new name doesn't
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'projects' AND column_name = 'github_branch')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'projects' AND column_name = 'github_default_branch') THEN
    ALTER TABLE projects RENAME COLUMN github_branch TO github_default_branch;
  END IF;
END $$;

COMMIT;