-- Migration 105: Add unique constraint for assistant replies (DEV/SMALL TABLES)
-- Purpose: Prevent multiple assistant replies to the same parent message
-- Context: Part of recommendation click fix implementation (V2.1 Final)
-- Date: 2026-01-13
-- Updated: 2026-01-13 (Expert Round 8) - Made project-scoped + matches query pattern
-- Updated: 2026-01-13 (Expert Round 9) - Added CONCURRENTLY note for production
-- Updated: 2026-01-13 (Expert Round 11) - Created separate production CONCURRENTLY variant
--
-- ⚠️ WHICH MIGRATION TO USE:
--
-- ✅ Use THIS migration (105) if:
--   - Dev/staging environment
--   - Small table (<10K rows)
--   - Can use maintenance window (low/no traffic)
--   - Benefit: Faster, atomic, easier to rollback
--
-- ✅ Use 105_PRODUCTION_*_concurrent.sql if:
--   - Production with large table (>10K rows)
--   - Table is actively receiving writes (can't pause traffic)
--   - Benefit: No write lock, builds in background
--   - Requirement: Must configure runner for non-transactional execution
--
-- ⸻

-- Prevent multiple assistant replies to the same parent message (per project)
-- This ensures that each user message gets exactly one assistant response
-- The partial index (WHERE clause) only enforces uniqueness for non-null parent_message_id
-- 🚨 EXPERT FIX: Made project-scoped (project_id, parent_message_id) for:
--   1. Better multi-tenancy support (future-proof)
--   2. Matches actual query pattern: WHERE project_id=$1 AND parent_message_id=$2 AND actor_type='assistant'
--   3. Better index locality (all lookups for a project use same index page)
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_parent_reply
ON project_chat_log_minimal(project_id, parent_message_id)
WHERE actor_type = 'assistant' AND parent_message_id IS NOT NULL;

-- Verify the existing unique constraint on client_msg_id
-- (Already exists from migration 040a, just documenting for reference)
-- This constraint ensures client-side message idempotency
-- CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_msg
-- ON project_chat_log_minimal(project_id, client_msg_id)
-- WHERE client_msg_id IS NOT NULL;

-- Note: This migration is idempotent and can be re-run safely
