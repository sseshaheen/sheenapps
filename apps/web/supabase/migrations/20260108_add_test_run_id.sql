-- Migration: Add test_run_id column for E2E test data isolation
-- Date: 2026-01-08
-- Purpose: Enable RUN_ID-based test data isolation for parallel E2E test runs
--
-- This allows:
-- 1. Tagging all test-created data with a unique run ID
-- 2. Cleaning up ONLY data from a specific test run (not destroying debug info)
-- 3. Running parallel test shards without data collisions
-- 4. TTL-based cleanup of old test data

-- Add test_run_id to projects (main test entity)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS test_run_id text;

COMMENT ON COLUMN public.projects.test_run_id IS
  'E2E test run identifier. Format: gh-{github_run_id}-{attempt} or local-{timestamp}. NULL for production data.';

-- Add test_run_id to chat messages
ALTER TABLE public.project_chat_log_minimal
ADD COLUMN IF NOT EXISTS test_run_id text;

COMMENT ON COLUMN public.project_chat_log_minimal.test_run_id IS
  'E2E test run identifier for cleanup. NULL for production data.';

-- Add test_run_id to unified chat sessions
ALTER TABLE public.unified_chat_sessions
ADD COLUMN IF NOT EXISTS test_run_id text;

COMMENT ON COLUMN public.unified_chat_sessions.test_run_id IS
  'E2E test run identifier for cleanup. NULL for production data.';

-- Partial indexes for efficient cleanup (only indexes non-null values)
-- This means production queries aren't slowed down at all
CREATE INDEX IF NOT EXISTS idx_projects_test_run
ON public.projects(test_run_id)
WHERE test_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_chat_log_minimal_test_run
ON public.project_chat_log_minimal(test_run_id)
WHERE test_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unified_chat_sessions_test_run
ON public.unified_chat_sessions(test_run_id)
WHERE test_run_id IS NOT NULL;

-- Compound index for TTL cleanup queries (older than N days + has test_run_id)
CREATE INDEX IF NOT EXISTS idx_projects_test_run_created
ON public.projects(created_at, test_run_id)
WHERE test_run_id IS NOT NULL;

-- RLS policy: service role can clean up test data
-- Note: Test cleanup uses admin/service context, not RLS-protected user context
-- The existing RLS policies don't need modification since:
-- 1. Test data is created with user's auth (test user)
-- 2. Cleanup uses admin context which bypasses RLS
-- 3. test_run_id is just a label, not an access control mechanism
