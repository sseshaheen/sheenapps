-- Migration: 124_inhouse_forms.sql
-- Description: Schema for @sheenapps/forms SDK - form schemas and submissions

BEGIN;

-- ============================================================================
-- Form Schemas Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_form_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique form name per project
  CONSTRAINT uq_inhouse_form_schemas_project_name UNIQUE (project_id, name)
);

-- Index for listing forms by project
CREATE INDEX IF NOT EXISTS idx_inhouse_form_schemas_project
  ON inhouse_form_schemas(project_id);

-- Index for searching forms by name
CREATE INDEX IF NOT EXISTS idx_inhouse_form_schemas_name
  ON inhouse_form_schemas(project_id, name);

-- ============================================================================
-- Form Submissions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES inhouse_form_schemas(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'read', 'archived', 'spam')),
  metadata JSONB NOT NULL DEFAULT '{}',
  source_ip INET,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing submissions by form
CREATE INDEX IF NOT EXISTS idx_inhouse_form_submissions_form
  ON inhouse_form_submissions(form_id);

-- Index for listing submissions by project
CREATE INDEX IF NOT EXISTS idx_inhouse_form_submissions_project
  ON inhouse_form_submissions(project_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_inhouse_form_submissions_status
  ON inhouse_form_submissions(form_id, status);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_inhouse_form_submissions_created
  ON inhouse_form_submissions(form_id, created_at DESC);

-- Index for full-text search on submission data (GIN index on JSONB)
CREATE INDEX IF NOT EXISTS idx_inhouse_form_submissions_data_gin
  ON inhouse_form_submissions USING GIN (data jsonb_path_ops);

-- ============================================================================
-- Rate Limiting Table (for spam protection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_form_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES inhouse_form_schemas(id) ON DELETE CASCADE,
  source_ip INET NOT NULL,
  submission_count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One rate limit entry per form+IP combo
  CONSTRAINT uq_inhouse_form_rate_limits_form_ip UNIQUE (form_id, source_ip)
);

-- Index for cleanup of old rate limit entries
CREATE INDEX IF NOT EXISTS idx_inhouse_form_rate_limits_window
  ON inhouse_form_rate_limits(window_start);

-- ============================================================================
-- Updated At Trigger
-- ============================================================================

-- Function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_inhouse_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for form schemas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_inhouse_form_schemas_updated_at'
    AND tgrelid = 'inhouse_form_schemas'::regclass
  ) THEN
    CREATE TRIGGER trg_inhouse_form_schemas_updated_at
      BEFORE UPDATE ON inhouse_form_schemas
      FOR EACH ROW
      EXECUTE FUNCTION update_inhouse_forms_updated_at();
  END IF;
END $$;

-- Trigger for form submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_inhouse_form_submissions_updated_at'
    AND tgrelid = 'inhouse_form_submissions'::regclass
  ) THEN
    CREATE TRIGGER trg_inhouse_form_submissions_updated_at
      BEFORE UPDATE ON inhouse_form_submissions
      FOR EACH ROW
      EXECUTE FUNCTION update_inhouse_forms_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE inhouse_form_schemas IS 'Form definitions for @sheenapps/forms SDK';
COMMENT ON TABLE inhouse_form_submissions IS 'Form submission data for @sheenapps/forms SDK';
COMMENT ON TABLE inhouse_form_rate_limits IS 'Rate limiting for form spam protection';

COMMENT ON COLUMN inhouse_form_schemas.fields IS 'Array of field definitions: [{name, type, label, required, validation}]';
COMMENT ON COLUMN inhouse_form_schemas.settings IS 'Form settings: {submitLabel, successMessage, notifyEmail, spam: {honeypot, rateLimit, captcha}}';
COMMENT ON COLUMN inhouse_form_submissions.status IS 'Submission status: pending, read, archived, spam';
COMMENT ON COLUMN inhouse_form_submissions.metadata IS 'Custom metadata attached to submission';

COMMIT;
