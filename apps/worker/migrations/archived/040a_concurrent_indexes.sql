-- Migration: 040a_concurrent_indexes.sql  
-- Description: Production-safe CONCURRENT indexes for persistent chat (Part 2 of migration 040)
-- Date: 2025-08-24
-- 
-- IMPORTANT: This file must be run MANUALLY outside of your migration tool
-- because CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--
-- Run this command directly in psql after migration 040 completes:
-- psql -d your_database -c "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_client_msg ON project_chat_log_minimal(project_id, client_msg_id) WHERE client_msg_id IS NOT NULL;"

-- For migration tools that don't support CONCURRENTLY, use regular index instead:
-- This will briefly lock the table but is safe for small datasets
CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_msg
  ON project_chat_log_minimal(project_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

-- Update statistics after index creation
ANALYZE project_chat_log_minimal;

-- END OF MIGRATION 040a