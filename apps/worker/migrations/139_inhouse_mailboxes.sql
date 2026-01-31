-- Migration: 139_inhouse_mailboxes.sql
-- Purpose: Add real mailbox support via OpenSRS Hosted Email (Phase 4: Business Email)
-- Tables: alter inhouse_email_domains, new inhouse_mailboxes, new inhouse_mailbox_events

BEGIN;

-- =============================================================================
-- ALTER inhouse_email_domains: Add mailbox mode + OpenSRS cluster
-- =============================================================================

ALTER TABLE inhouse_email_domains
  ADD COLUMN IF NOT EXISTS mailbox_mode VARCHAR(20) NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS opensrs_email_cluster VARCHAR(1);

-- Mailbox mode constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_valid_mailbox_mode'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_valid_mailbox_mode
      CHECK (mailbox_mode IN ('resend', 'hosted'));
  END IF;
END $$;

-- OpenSRS cluster constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_valid_cluster'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_valid_cluster
      CHECK (opensrs_email_cluster IS NULL OR opensrs_email_cluster IN ('a', 'b'));
  END IF;
END $$;

-- =============================================================================
-- inhouse_mailboxes: Real email mailboxes provisioned via OpenSRS Hosted Email
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES inhouse_email_domains(id) ON DELETE CASCADE,

  -- Mailbox identity
  local_part VARCHAR(64) NOT NULL,
  email_address VARCHAR(320) NOT NULL,
  display_name VARCHAR(255),

  -- Provider
  provider VARCHAR(30) NOT NULL DEFAULT 'opensrs_email',

  -- Provisioning state machine:
  -- pending_create -> active -> suspended / pending_delete -> deleted / error
  provisioning_status VARCHAR(20) NOT NULL DEFAULT 'pending_create',
  provisioning_error TEXT,
  provisioned_at TIMESTAMPTZ,

  -- Quota
  quota_mb INTEGER NOT NULL DEFAULT 5120,
  quota_used_mb INTEGER NOT NULL DEFAULT 0,
  quota_last_synced_at TIMESTAMPTZ,

  -- Service flags
  imap_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  webmail_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  smtp_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Forwarding
  forward_to VARCHAR(320),
  forward_keep_copy BOOLEAN NOT NULL DEFAULT TRUE,

  -- Autoresponder
  autoresponder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  autoresponder_subject VARCHAR(255),
  autoresponder_body TEXT,

  -- Activity tracking
  last_login_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provisioning status constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_mailboxes_valid_status'
  ) THEN
    ALTER TABLE inhouse_mailboxes
      ADD CONSTRAINT inhouse_mailboxes_valid_status
      CHECK (provisioning_status IN (
        'pending_create', 'active', 'suspended',
        'pending_delete', 'deleted', 'error'
      ));
  END IF;
END $$;

-- Provider constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_mailboxes_valid_provider'
  ) THEN
    ALTER TABLE inhouse_mailboxes
      ADD CONSTRAINT inhouse_mailboxes_valid_provider
      CHECK (provider IN ('opensrs_email'));
  END IF;
END $$;

-- Unique email address (only among non-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_email_address
  ON inhouse_mailboxes(email_address)
  WHERE deleted_at IS NULL;

-- Unique local_part per domain (only among non-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_domain_local
  ON inhouse_mailboxes(domain_id, local_part)
  WHERE deleted_at IS NULL;

-- Project lookup
CREATE INDEX IF NOT EXISTS idx_mailboxes_project
  ON inhouse_mailboxes(project_id);

-- Domain lookup
CREATE INDEX IF NOT EXISTS idx_mailboxes_domain
  ON inhouse_mailboxes(domain_id);

-- Provisioning status for pending/error states
CREATE INDEX IF NOT EXISTS idx_mailboxes_provisioning
  ON inhouse_mailboxes(provisioning_status)
  WHERE provisioning_status IN ('pending_create', 'pending_delete', 'error');

-- Quota sync candidates
CREATE INDEX IF NOT EXISTS idx_mailboxes_quota_sync
  ON inhouse_mailboxes(quota_last_synced_at)
  WHERE provisioning_status = 'active' AND deleted_at IS NULL;

-- =============================================================================
-- inhouse_mailbox_events: Audit log for mailbox operations
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_mailbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID REFERENCES inhouse_mailboxes(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES inhouse_email_domains(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  event_type VARCHAR(40) NOT NULL,
  metadata JSONB DEFAULT '{}',

  actor_type VARCHAR(20) NOT NULL DEFAULT 'system',
  actor_id VARCHAR(64),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event type constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_mailbox_events_valid_type'
  ) THEN
    ALTER TABLE inhouse_mailbox_events
      ADD CONSTRAINT inhouse_mailbox_events_valid_type
      CHECK (event_type IN (
        'created', 'provisioned', 'password_reset', 'suspended', 'unsuspended',
        'quota_changed', 'deleted', 'restored', 'error',
        'sso_token_generated', 'mx_switched_to_hosted', 'mx_switched_to_resend'
      ));
  END IF;
END $$;

-- Actor type constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_mailbox_events_valid_actor'
  ) THEN
    ALTER TABLE inhouse_mailbox_events
      ADD CONSTRAINT inhouse_mailbox_events_valid_actor
      CHECK (actor_type IN ('system', 'user', 'api', 'admin'));
  END IF;
END $$;

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_mailbox_events_mailbox
  ON inhouse_mailbox_events(mailbox_id, created_at DESC)
  WHERE mailbox_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mailbox_events_domain
  ON inhouse_mailbox_events(domain_id, created_at DESC)
  WHERE domain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mailbox_events_project
  ON inhouse_mailbox_events(project_id, created_at DESC);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE inhouse_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_mailbox_events ENABLE ROW LEVEL SECURITY;

-- Mailbox owner access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mailboxes_owner_access' AND tablename = 'inhouse_mailboxes'
  ) THEN
    CREATE POLICY mailboxes_owner_access ON inhouse_mailboxes
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

-- Mailbox events owner access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mailbox_events_owner_access' AND tablename = 'inhouse_mailbox_events'
  ) THEN
    CREATE POLICY mailbox_events_owner_access ON inhouse_mailbox_events
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

-- Service role bypass for both tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'mailboxes_service_role' AND tablename = 'inhouse_mailboxes'
    ) THEN
      CREATE POLICY mailboxes_service_role ON inhouse_mailboxes
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'mailbox_events_service_role' AND tablename = 'inhouse_mailbox_events'
    ) THEN
      CREATE POLICY mailbox_events_service_role ON inhouse_mailbox_events
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- updated_at trigger (reuses set_updated_at() from migration 091)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inhouse_mailboxes_updated_at'
    AND tgrelid = 'inhouse_mailboxes'::regclass
  ) THEN
    CREATE TRIGGER trg_inhouse_mailboxes_updated_at
    BEFORE UPDATE ON inhouse_mailboxes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE inhouse_mailboxes IS 'Real email mailboxes provisioned via OpenSRS Hosted Email (Phase 4)';
COMMENT ON COLUMN inhouse_mailboxes.provisioning_status IS 'State machine: pending_create -> active -> suspended / pending_delete -> deleted / error';
COMMENT ON COLUMN inhouse_mailboxes.quota_mb IS 'Mailbox storage quota in MB (default 5GB)';
COMMENT ON COLUMN inhouse_email_domains.mailbox_mode IS 'MX routing mode: resend (programmatic inbound) or hosted (real mailboxes via OpenSRS)';
COMMENT ON COLUMN inhouse_email_domains.opensrs_email_cluster IS 'OpenSRS Hosted Email cluster: a or b';
COMMENT ON TABLE inhouse_mailbox_events IS 'Audit log for mailbox lifecycle events';

COMMIT;
