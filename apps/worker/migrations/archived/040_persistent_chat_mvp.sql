-- Migration: 040_persistent_chat_mvp.sql
-- Description: Add atomic per-project sequencing, client message IDs, and actor types for persistent chat MVP
-- Date: 2025-08-24
-- Note: This is Part 1 - run 040a_concurrent_indexes.sql after this completes

-- 1) Per-project sequence counters (atomic, race-safe)
CREATE TABLE IF NOT EXISTS project_chat_seq (
  project_id UUID PRIMARY KEY,
  last_seq   BIGINT NOT NULL DEFAULT 0
);

-- Simplified atomic sequence generator (expert's UPSERT approach)
CREATE OR REPLACE FUNCTION next_project_chat_seq(p_project_id UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_next BIGINT;
BEGIN
  INSERT INTO project_chat_seq (project_id, last_seq)
  VALUES (p_project_id, 1)
  ON CONFLICT (project_id)
  DO UPDATE SET last_seq = project_chat_seq.last_seq + 1
  RETURNING last_seq INTO v_next;
  RETURN v_next;
END$$;

-- 2) Add new columns to existing table (consistent naming: seq, not pseq)
ALTER TABLE project_chat_log_minimal
  ADD COLUMN IF NOT EXISTS seq BIGINT,
  ADD COLUMN IF NOT EXISTS client_msg_id UUID,
  ADD COLUMN IF NOT EXISTS actor_type TEXT 
    CHECK (actor_type IN ('client','assistant','advisor')) DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS visibility TEXT 
    CHECK (visibility IN ('public','internal')) DEFAULT 'public';

-- 3) Automatic sequence assignment trigger (consistent naming)
CREATE OR REPLACE FUNCTION set_chat_seq()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.seq := next_project_chat_seq(NEW.project_id);
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_set_chat_seq ON project_chat_log_minimal;
CREATE TRIGGER trg_set_chat_seq
  BEFORE INSERT ON project_chat_log_minimal
  FOR EACH ROW EXECUTE FUNCTION set_chat_seq();

-- 4) Production-safe backfill with safety constraints
CREATE TABLE IF NOT EXISTS chat_seq_backfill AS
SELECT
  id,
  project_id,
  ROW_NUMBER() OVER (
    PARTITION BY project_id
    ORDER BY COALESCE(timeline_seq, 0), created_at, id
  )::BIGINT AS seq,
  CASE 
    WHEN message_type = 'assistant' THEN 'assistant'
    ELSE 'client' 
  END AS actor_type
FROM project_chat_log_minimal
WHERE seq IS NULL;

-- Regular indexes for backfill (not CONCURRENTLY since we're in transaction)
CREATE INDEX IF NOT EXISTS idx_backfill_proj ON chat_seq_backfill(project_id);
CREATE INDEX IF NOT EXISTS idx_backfill_id ON chat_seq_backfill(id);

-- Update in chunks to avoid long locks
DO $$
DECLARE batch_size INT := 5000;
DECLARE processed_rows INT := 0;
BEGIN
  LOOP
    WITH picked AS (
      SELECT id, seq, actor_type FROM chat_seq_backfill LIMIT batch_size
    ),
    updated AS (
      UPDATE project_chat_log_minimal m
      SET seq = p.seq, actor_type = p.actor_type
      FROM picked p
      WHERE m.id = p.id
      RETURNING m.id
    ),
    deleted AS (
      DELETE FROM chat_seq_backfill 
      WHERE id IN (SELECT id FROM updated)
      RETURNING id
    )
    SELECT COUNT(*) FROM deleted INTO processed_rows;
    
    EXIT WHEN processed_rows = 0;
    
    RAISE NOTICE 'Backfill batch completed: % rows processed, remaining: %', 
      processed_rows, (SELECT COUNT(*) FROM chat_seq_backfill);
  END LOOP;
END$$;

-- Clean up mapping table
DROP TABLE IF EXISTS chat_seq_backfill;

-- 5) Add constraints after backfill with safety checks
ALTER TABLE project_chat_log_minimal 
  ALTER COLUMN seq SET NOT NULL,
  ADD CONSTRAINT chk_seq_pos CHECK (seq > 0); -- Prevent negative/zero sequences

-- Add regular unique index (CONCURRENTLY indexes in separate file)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_seq 
  ON project_chat_log_minimal(project_id, seq);

-- Update statistics for optimal query planning
ANALYZE project_chat_log_minimal;

-- END OF MIGRATION 040
-- Next: Run migration 040a_concurrent_indexes.sql for production-safe concurrent indexes