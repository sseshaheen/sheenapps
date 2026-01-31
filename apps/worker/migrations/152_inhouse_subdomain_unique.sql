-- Migration: Add UNIQUE constraint on projects.inhouse_subdomain
-- Purpose: Prevent race conditions where parallel project creates generate same subdomain
-- Date: 2026-01-30
--
-- The InhouseProjectService now has retry logic that handles constraint violations
-- by generating a new subdomain with a random suffix.

BEGIN;

-- Add partial unique index (only for non-null subdomains)
-- Using partial index to allow multiple NULL values (non-Easy Mode projects)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_inhouse_subdomain_unique
  ON projects (inhouse_subdomain)
  WHERE inhouse_subdomain IS NOT NULL;

-- Also add index for inbox_id uniqueness (already has higher entropy now)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inhouse_inbox_config_inbox_id_unique
  ON inhouse_inbox_config (inbox_id)
  WHERE inbox_id IS NOT NULL;

COMMIT;
