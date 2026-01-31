-- Migration: 133_inhouse_inbox.sql
-- Purpose: Add inbox tables for Easy Mode Email (Level 0 - SheenApps Inbox)
-- Tables: inhouse_inbox_messages, inhouse_inbox_threads, inhouse_inbox_config, inhouse_inbox_aliases

BEGIN;

-- =============================================================================
-- inhouse_inbox_messages: Received emails
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Envelope
  from_email VARCHAR(320) NOT NULL,
  from_name VARCHAR(200),
  to_email VARCHAR(320) NOT NULL,  -- The inbox address that received it
  reply_to VARCHAR(320),

  -- Message
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  snippet VARCHAR(500),  -- First ~500 chars of text, for list view

  -- Threading
  message_id VARCHAR(500),  -- Email Message-ID header
  in_reply_to VARCHAR(500),
  "references" TEXT[],  -- "references" is a reserved word, quote it
  thread_id UUID,  -- Our internal thread grouping (FK added after threads table)

  -- Routing
  tag VARCHAR(100),  -- Extracted from +tag in recipient

  -- Metadata from provider
  provider_id VARCHAR(255),  -- Resend/SES message ID
  raw_headers JSONB,

  -- Attachments (metadata only; files stored separately or dropped)
  -- Format: [{ "filename": "doc.pdf", "mime_type": "application/pdf", "size_bytes": 12345, "content_id": "cid123", "storage_key": "s3://..." | null }]
  attachments JSONB NOT NULL DEFAULT '[]',

  -- Status
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_spam BOOLEAN NOT NULL DEFAULT FALSE,

  -- Processing status (for debugging webhook/job issues)
  processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'processed' | 'failed'
  processed_at TIMESTAMPTZ,
  last_processing_error TEXT,

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add constraint for from_email validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_inbox_messages_valid_from_email'
  ) THEN
    ALTER TABLE inhouse_inbox_messages
      ADD CONSTRAINT inhouse_inbox_messages_valid_from_email
      CHECK (from_email ~* '^[^@]+@[^@]+$');
  END IF;
END $$;

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_inbox_messages_project_received
  ON inhouse_inbox_messages(project_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_project_thread
  ON inhouse_inbox_messages(project_id, thread_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_project_unread
  ON inhouse_inbox_messages(project_id, is_read, received_at DESC)
  WHERE is_read = FALSE AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_message_id
  ON inhouse_inbox_messages(message_id)
  WHERE message_id IS NOT NULL;

-- Dedupe constraint: prevent duplicate messages from webhook retries
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_dedupe
  ON inhouse_inbox_messages(provider_id, to_email)
  WHERE provider_id IS NOT NULL;

-- =============================================================================
-- inhouse_inbox_threads: Thread grouping for conversations
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  subject TEXT,  -- Normalized subject (stripped Re:/Fwd:)
  participant_emails TEXT[] NOT NULL DEFAULT '{}',

  -- Counts (denormalized for performance)
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,

  -- Latest message info (denormalized for list view)
  last_message_at TIMESTAMPTZ,
  last_message_snippet VARCHAR(500),
  last_message_from VARCHAR(320),

  -- Status
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for threads
CREATE INDEX IF NOT EXISTS idx_inbox_threads_project_updated
  ON inhouse_inbox_threads(project_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_project_unread
  ON inhouse_inbox_threads(project_id, unread_count DESC, last_message_at DESC)
  WHERE is_archived = FALSE;

-- Add FK from messages to threads (now that threads table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_inbox_messages_thread_id_fkey'
  ) THEN
    ALTER TABLE inhouse_inbox_messages
      ADD CONSTRAINT inhouse_inbox_messages_thread_id_fkey
      FOREIGN KEY (thread_id) REFERENCES inhouse_inbox_threads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- inhouse_inbox_config: Per-project inbox settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_config (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,

  -- Non-guessable inbox ID (e.g., "p_7h2k9x")
  -- Real address: p_7h2k9x@inbox.sheenapps.com
  inbox_id VARCHAR(20) NOT NULL UNIQUE,

  -- Display name for UI (from project name)
  display_name VARCHAR(100),

  -- Settings
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_message TEXT,
  forward_to_email VARCHAR(320),  -- Optional email forwarding

  -- Retention
  retention_days INTEGER NOT NULL DEFAULT 90,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inbox ID format: p_ prefix + 6-10 lowercase alphanumeric chars
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_inbox_config_valid_inbox_id'
  ) THEN
    ALTER TABLE inhouse_inbox_config
      ADD CONSTRAINT inhouse_inbox_config_valid_inbox_id
      CHECK (inbox_id ~ '^p_[a-z0-9]{6,10}$');
  END IF;
END $$;

-- =============================================================================
-- inhouse_inbox_aliases: Friendly aliases that map to real inbox
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  alias VARCHAR(100) NOT NULL,  -- e.g., "support", "hello", "sales"
  -- Maps to: <alias>@inbox.sheenapps.com -> p_<inbox_id>@inbox.sheenapps.com

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project-level uniqueness (each project can only have one of each alias)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_inbox_aliases_uq_project_alias'
  ) THEN
    ALTER TABLE inhouse_inbox_aliases
      ADD CONSTRAINT inhouse_inbox_aliases_uq_project_alias
      UNIQUE (project_id, alias);
  END IF;
END $$;

-- Alias format validation: lowercase alphanumeric with dots, hyphens, underscores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_inbox_aliases_valid_alias'
  ) THEN
    ALTER TABLE inhouse_inbox_aliases
      ADD CONSTRAINT inhouse_inbox_aliases_valid_alias
      CHECK (alias ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' AND LENGTH(alias) >= 2);
  END IF;
END $$;

-- Global uniqueness: aliases must be unique across all projects
-- (prevents hello@inbox.sheenapps.com from being claimed by multiple projects)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_aliases_global
  ON inhouse_inbox_aliases(alias);

-- Index for looking up aliases
CREATE INDEX IF NOT EXISTS idx_inbox_aliases_project
  ON inhouse_inbox_aliases(project_id);

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE inhouse_inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_inbox_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_inbox_aliases ENABLE ROW LEVEL SECURITY;

-- Messages: project owner can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'inbox_messages_owner_access' AND tablename = 'inhouse_inbox_messages'
  ) THEN
    CREATE POLICY inbox_messages_owner_access ON inhouse_inbox_messages
      FOR ALL
      USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      )
      WITH CHECK (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Threads: project owner can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'inbox_threads_owner_access' AND tablename = 'inhouse_inbox_threads'
  ) THEN
    CREATE POLICY inbox_threads_owner_access ON inhouse_inbox_threads
      FOR ALL
      USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      )
      WITH CHECK (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Config: project owner can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'inbox_config_owner_access' AND tablename = 'inhouse_inbox_config'
  ) THEN
    CREATE POLICY inbox_config_owner_access ON inhouse_inbox_config
      FOR ALL
      USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      )
      WITH CHECK (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Aliases: project owner can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'inbox_aliases_owner_access' AND tablename = 'inhouse_inbox_aliases'
  ) THEN
    CREATE POLICY inbox_aliases_owner_access ON inhouse_inbox_aliases
      FOR ALL
      USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      )
      WITH CHECK (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE inhouse_inbox_messages IS 'Received emails for SheenApps Inbox (Easy Mode Level 0)';
COMMENT ON TABLE inhouse_inbox_threads IS 'Thread grouping for inbox conversations';
COMMENT ON TABLE inhouse_inbox_config IS 'Per-project inbox configuration and settings';
COMMENT ON TABLE inhouse_inbox_aliases IS 'Friendly email aliases that map to project inbox addresses';

COMMENT ON COLUMN inhouse_inbox_config.inbox_id IS 'Non-guessable inbox ID (e.g., p_7h2k9x). Real address: p_7h2k9x@inbox.sheenapps.com';
COMMENT ON COLUMN inhouse_inbox_messages.processing_status IS 'Webhook processing status: pending, processing, processed, failed';
COMMENT ON COLUMN inhouse_inbox_messages.attachments IS 'Attachment metadata as JSON array. Files stored in S3 if kept.';

-- =============================================================================
-- Additional constraints and indexes (from code review)
-- =============================================================================

-- Constrain processing_status to valid values (prevents typos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_inbox_messages_processing_status_chk'
  ) THEN
    ALTER TABLE inhouse_inbox_messages
      ADD CONSTRAINT inhouse_inbox_messages_processing_status_chk
      CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed'));
  END IF;
END $$;

-- GIN index for "find threads involving email X" queries
CREATE INDEX IF NOT EXISTS idx_inbox_threads_participants_gin
  ON inhouse_inbox_threads USING GIN (participant_emails);

-- Reserve RFC-required and common admin aliases
-- postmaster/abuse are RFC 5321/2142 required, others prevent confusion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_inbox_aliases_reserved_chk'
  ) THEN
    ALTER TABLE inhouse_inbox_aliases
      ADD CONSTRAINT inhouse_inbox_aliases_reserved_chk
      CHECK (alias NOT IN ('admin', 'postmaster', 'abuse', 'security', 'root', 'hostmaster', 'webmaster'));
  END IF;
END $$;

COMMIT;
