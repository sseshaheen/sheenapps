-- E2E Cleanup Indexes
--
-- These indexes improve performance of E2E test data cleanup queries.
-- Only useful when E2E_MODE=true; harmless otherwise.
--
-- The partial index (WHERE jsonb ? 'e2e_run_id') ensures:
-- 1. Index only includes rows with the e2e_run_id tag
-- 2. Non-E2E rows aren't affected by index maintenance
-- 3. Cleanup queries are fast even with large tables
--
-- Note: Different tables use different JSONB column names:
-- - projects: config
-- - unified_chat_sessions: metadata
-- - project_chat_log_minimal: response_data

-- Index for projects table (uses 'config' column)
CREATE INDEX IF NOT EXISTS idx_projects_e2e_run_id
  ON projects ((config->>'e2e_run_id'))
  WHERE (config ? 'e2e_run_id');

-- Index for unified_chat_sessions table (uses 'metadata' column)
CREATE INDEX IF NOT EXISTS idx_sessions_e2e_run_id
  ON unified_chat_sessions ((metadata->>'e2e_run_id'))
  WHERE (metadata ? 'e2e_run_id');

-- Index for project_chat_log_minimal table (uses 'response_data' column)
CREATE INDEX IF NOT EXISTS idx_chat_log_e2e_run_id
  ON project_chat_log_minimal ((response_data->>'e2e_run_id'))
  WHERE (response_data ? 'e2e_run_id');
