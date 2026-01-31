-- =============================================================================
-- Migration 128: In-House Email Admin Enhancements
--
-- Adds rendered content storage + suppression table for admin resend/bounce flows.
-- =============================================================================

-- Add rendered content + headers to email records
ALTER TABLE inhouse_emails
  ADD COLUMN IF NOT EXISTS from_address TEXT,
  ADD COLUMN IF NOT EXISTS reply_to TEXT,
  ADD COLUMN IF NOT EXISTS html TEXT,
  ADD COLUMN IF NOT EXISTS text TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB,
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10);

-- Suppression list for bounced/complaint/manual blocks
CREATE TABLE IF NOT EXISTS inhouse_email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual', -- bounce | complaint | manual | admin
  source TEXT NOT NULL DEFAULT 'system', -- webhook | admin | system
  status TEXT NOT NULL DEFAULT 'active', -- active | cleared
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inhouse_email_suppressions_project
  ON inhouse_email_suppressions(project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inhouse_email_suppressions_active
  ON inhouse_email_suppressions(project_id, email)
  WHERE status = 'active';

-- Add updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_inhouse_email_suppressions_updated_at'
    AND tgrelid = 'inhouse_email_suppressions'::regclass
  ) THEN
    CREATE TRIGGER update_inhouse_email_suppressions_updated_at
      BEFORE UPDATE ON inhouse_email_suppressions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RLS policies
ALTER TABLE inhouse_email_suppressions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_email_suppressions_service_all') THEN
    CREATE POLICY inhouse_email_suppressions_service_all
      ON inhouse_email_suppressions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE inhouse_email_suppressions IS
  'Suppression list for in-house email delivery (bounces/complaints/manual)';
COMMENT ON COLUMN inhouse_email_suppressions.reason IS
  'Reason for suppression: bounce, complaint, manual, admin';
COMMENT ON COLUMN inhouse_email_suppressions.source IS
  'Source of suppression: webhook, admin, system';
COMMENT ON COLUMN inhouse_email_suppressions.status IS
  'active = suppress, cleared = allow';
