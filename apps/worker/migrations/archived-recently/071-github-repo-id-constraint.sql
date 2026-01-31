BEGIN;

-- Migration 071: GitHub Repo ID Unique Constraint
-- Ensures each GitHub repository can only be linked to one project per installation

-- Add unique constraint for installation + repo_id combination
-- This prevents multiple projects from linking to the same GitHub repository
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_installation_repo_unique
  ON projects(github_installation_id, github_repo_id)
  WHERE github_repo_id IS NOT NULL AND github_sync_enabled = true;

-- Add index for faster lookups by repo_id
CREATE INDEX IF NOT EXISTS idx_projects_repo_id
  ON projects(github_repo_id)
  WHERE github_repo_id IS NOT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN projects.github_repo_id IS 'GitHub repository numeric ID (stable across renames)';

COMMIT;