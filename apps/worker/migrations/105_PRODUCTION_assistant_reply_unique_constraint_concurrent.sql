-- Migration 105 PRODUCTION: Add unique constraint for assistant replies (CONCURRENTLY)
-- Purpose: Prevent multiple assistant replies to the same parent message
-- Context: Part of recommendation click fix implementation (V2.1 Final)
-- Date: 2026-01-13
-- Updated: 2026-01-13 (Expert Round 11) - Production CONCURRENTLY variant
--
-- ⚠️ PRODUCTION VARIANT - USE THIS INSTEAD OF 105 ON LARGE/HOT TABLES
--
-- When to use this migration:
--   ✅ Use this if: project_chat_log_minimal has >10K rows AND is actively receiving writes
--   ✅ Benefit: No write lock - inserts/updates can continue during index creation
--   ❌ Don't use if: Small table (<10K rows) or can use maintenance window
--   ❌ Tradeoff: Slower (builds in background), requires non-transactional migration
--
-- ⚠️ CRITICAL REQUIREMENT: This migration MUST run WITHOUT a transaction wrapper!
--
-- Migration runner configuration examples:
--
-- node-pg-migrate:
--   - Add "noTransaction: true" to migration metadata
--   - Or use CLI flag: --no-transaction
--
-- Knex:
--   - Use .transacting(false) or configure migration as non-transactional
--
-- Custom runner:
--   - Do NOT wrap this file in BEGIN/COMMIT
--   - Execute statements directly against the connection
--
-- Why CONCURRENTLY requires no transaction:
--   CREATE INDEX CONCURRENTLY uses multiple internal transactions and cannot run
--   inside an explicit BEGIN/COMMIT block. It will error immediately if attempted.
--
-- ⸻
--
-- For dev/small tables, use the regular 105 migration instead (faster, atomic, easier to rollback)

-- Prevent multiple assistant replies to the same parent message (per project)
-- This ensures that each user message gets exactly one assistant response
-- The partial index (WHERE clause) only enforces uniqueness for non-null parent_message_id
--
-- 🚨 EXPERT FIX (Round 8): Made project-scoped (project_id, parent_message_id) for:
--   1. Better multi-tenancy support (future-proof)
--   2. Matches actual query pattern: WHERE project_id=$1 AND parent_message_id=$2 AND actor_type='assistant'
--   3. Better index locality (all lookups for a project use same index page)
--
-- 🚨 PRODUCTION (Round 11): CONCURRENTLY = no write lock, builds in background
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_assistant_parent_reply
ON project_chat_log_minimal(project_id, parent_message_id)
WHERE actor_type = 'assistant' AND parent_message_id IS NOT NULL;

-- Verify the existing unique constraint on client_msg_id
-- (Already exists from migration 040a, just documenting for reference)
-- This constraint ensures client-side message idempotency
-- CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_msg
-- ON project_chat_log_minimal(project_id, client_msg_id)
-- WHERE client_msg_id IS NOT NULL;

-- Note: This migration is idempotent and can be re-run safely
-- IF NOT EXISTS handles the case where index already exists
