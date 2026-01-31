-- Migration: 140_mailbox_integrity_and_pending_mx.sql
-- Purpose: Enforce domain ownership at DB level, add pending MX states,
--          add local_part format CHECK constraint
--
-- Changes:
--   1. Composite unique on inhouse_email_domains(id, project_id) + composite FK
--      from inhouse_mailboxes(domain_id, project_id) to prevent cross-project references,
--      then drop the old single-column FKs (now redundant)
--   2. Add 'hosted_pending_mx' and 'resend_pending_mx' to mailbox_mode CHECK
--      - hosted_pending_mx: OpenSRS provisioned, user needs to point MX to OpenSRS
--      - resend_pending_mx: disable requested, user needs to point MX back to Resend
--   3. Add local_part format CHECK (lowercase enforced at DB level)

BEGIN;

-- =============================================================================
-- 1. Composite FK: enforce mailbox.project_id matches domain.project_id
-- =============================================================================

-- Add composite unique on domains (id, project_id) to support the FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_id_project_unique'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_id_project_unique
      UNIQUE (id, project_id);
  END IF;
END $$;

-- Add composite FK from mailboxes to domains
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_mailboxes_domain_project_fk'
  ) THEN
    ALTER TABLE inhouse_mailboxes
      ADD CONSTRAINT inhouse_mailboxes_domain_project_fk
      FOREIGN KEY (domain_id, project_id)
      REFERENCES inhouse_email_domains (id, project_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Same for mailbox events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_mailbox_events_domain_project_fk'
  ) THEN
    ALTER TABLE inhouse_mailbox_events
      ADD CONSTRAINT inhouse_mailbox_events_domain_project_fk
      FOREIGN KEY (domain_id, project_id)
      REFERENCES inhouse_email_domains (id, project_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Drop the old single-column FKs (now redundant with the composite ones above)
ALTER TABLE inhouse_mailboxes
  DROP CONSTRAINT IF EXISTS inhouse_mailboxes_domain_id_fkey;

ALTER TABLE inhouse_mailbox_events
  DROP CONSTRAINT IF EXISTS inhouse_mailbox_events_domain_id_fkey;

-- =============================================================================
-- 2. Add pending MX states to mailbox_mode
-- =============================================================================

-- Drop old constraint and re-create with new allowed values
ALTER TABLE inhouse_email_domains
  DROP CONSTRAINT IF EXISTS inhouse_email_domains_valid_mailbox_mode;

ALTER TABLE inhouse_email_domains
  ADD CONSTRAINT inhouse_email_domains_valid_mailbox_mode
  CHECK (mailbox_mode IN ('resend', 'hosted', 'hosted_pending_mx', 'resend_pending_mx'));

-- =============================================================================
-- 3. local_part format CHECK
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_mailboxes_local_part_format'
  ) THEN
    ALTER TABLE inhouse_mailboxes
      ADD CONSTRAINT inhouse_mailboxes_local_part_format
      CHECK (
        local_part = lower(local_part)
        AND local_part ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'
      );
  END IF;
END $$;

COMMIT;
