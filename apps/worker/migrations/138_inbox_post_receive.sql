-- Migration 138: Inbox Post-Receive Features
-- Adds metadata column for spam flags and extensible data,
-- plus indexes for retention cleanup and spam filtering.
--
-- Part of easy-mode-email-plan.md (Phase 1.5: Post-Receive Pipeline)

-- Add metadata column for spam flags and other extensible data
ALTER TABLE inhouse_inbox_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for retention cleanup (created_at by inbox, for batch deletes)
-- Note: inbox_id lives on inhouse_inbox_config, but messages reference project_id.
-- We index (project_id, created_at) since retention deletes are per-project.
CREATE INDEX IF NOT EXISTS idx_inhouse_inbox_messages_retention
  ON inhouse_inbox_messages (project_id, created_at);

-- Partial index for spam messages ordered by time (supports "list spam for project, newest first")
-- Uses JSONB containment (@>) instead of text cast to avoid errors on non-boolean values
CREATE INDEX IF NOT EXISTS idx_inhouse_inbox_messages_spam
  ON inhouse_inbox_messages (project_id, created_at DESC) WHERE metadata @> '{"spam": true}';
