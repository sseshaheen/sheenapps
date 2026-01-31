-- =============================================================================
-- Migration 108: In-House Emails Table
--
-- Creates the inhouse_emails table for Easy Mode project email tracking.
-- Part of EASY_MODE_SDK_PLAN.md - @sheenapps/email SDK support.
-- =============================================================================

-- Create the emails table
CREATE TABLE IF NOT EXISTS inhouse_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  to_addresses JSONB NOT NULL,
  subject VARCHAR(500) NOT NULL,
  template_name VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  resend_id VARCHAR(100),
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Foreign key to projects table
  CONSTRAINT fk_emails_project
    FOREIGN KEY (project_id)
    REFERENCES projects(id)
    ON DELETE CASCADE,

  -- Valid status values
  CONSTRAINT chk_email_status
    CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'failed'))
);

-- Create index for project lookups
CREATE INDEX IF NOT EXISTS idx_inhouse_emails_project_id
  ON inhouse_emails(project_id);

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_inhouse_emails_status
  ON inhouse_emails(project_id, status);

-- Create index for idempotency lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_inhouse_emails_idempotency
  ON inhouse_emails(project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Create index for created_at queries (for list pagination)
CREATE INDEX IF NOT EXISTS idx_inhouse_emails_created_at
  ON inhouse_emails(project_id, created_at DESC);

-- Add updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_inhouse_emails_updated_at'
    AND tgrelid = 'inhouse_emails'::regclass
  ) THEN
    CREATE TRIGGER update_inhouse_emails_updated_at
      BEFORE UPDATE ON inhouse_emails
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Add RLS policies
ALTER TABLE inhouse_emails ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_emails_service_all') THEN
    CREATE POLICY inhouse_emails_service_all
      ON inhouse_emails
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Comment on table
COMMENT ON TABLE inhouse_emails IS
  'Email tracking for Easy Mode projects - stores sent email records and delivery status';

-- Comment on columns
COMMENT ON COLUMN inhouse_emails.to_addresses IS
  'JSON array of recipient email addresses';
COMMENT ON COLUMN inhouse_emails.subject IS
  'Email subject line';
COMMENT ON COLUMN inhouse_emails.template_name IS
  'Name of built-in template used (welcome, magic-link, etc.)';
COMMENT ON COLUMN inhouse_emails.status IS
  'Delivery status: queued, sent, delivered, bounced, failed';
COMMENT ON COLUMN inhouse_emails.resend_id IS
  'External ID from Resend API for tracking';
COMMENT ON COLUMN inhouse_emails.idempotency_key IS
  'Client-provided key to prevent duplicate sends';
COMMENT ON COLUMN inhouse_emails.error_message IS
  'Error message if send/delivery failed';
