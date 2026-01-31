-- Migration 030: Fix Foreign Key Data Type Mismatches
-- Expert feedback: Standardize on UUID types for foreign key consistency

BEGIN;

-- Fix published_by_user_id to use UUID (matching auth.users.id)
ALTER TABLE project_versions_metadata 
  ALTER COLUMN published_by_user_id TYPE UUID USING published_by_user_id::UUID;

-- Now we can add the foreign key constraint safely
ALTER TABLE project_versions_metadata
  ADD CONSTRAINT fk_published_by_user 
    FOREIGN KEY (published_by_user_id) 
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix project_id in project_published_domains to use UUID (matching projects.id)
ALTER TABLE project_published_domains
  ALTER COLUMN project_id TYPE UUID USING project_id::UUID;

-- Now we can add the foreign key constraint safely
ALTER TABLE project_published_domains
  ADD CONSTRAINT fk_project_domain
    FOREIGN KEY (project_id)
    REFERENCES projects(id) ON DELETE CASCADE;

-- Expand SemVer regex to support RC, alpha, beta, etc.
-- Expert feedback: current regex only allows lowercase prerelease
ALTER TABLE project_versions_metadata
  DROP CONSTRAINT IF EXISTS check_semver_format,
  ADD CONSTRAINT check_semver_format 
    CHECK (version_name ~ '^\\d+\\.\\d+\\.\\d+(-[A-Za-z0-9]+)?$');

-- Add SSL status constraint for tighter validation
-- Expert feedback: prevent invalid ssl_status values
ALTER TABLE project_published_domains
  ADD CONSTRAINT check_ssl_status 
    CHECK (ssl_status IN ('pending', 'active', 'failed'));

-- Add observability timestamps for SSL/DNS checking
-- Expert feedback: better user experience with "still working..." vs "failed"
ALTER TABLE project_published_domains
  ADD COLUMN last_ssl_checked_at TIMESTAMPTZ,
  ADD COLUMN last_dns_checked_at TIMESTAMPTZ,
  ADD COLUMN ssl_error_message TEXT,
  ADD COLUMN dns_error_message TEXT;

-- Add indexes for the new timestamp columns
CREATE INDEX idx_ssl_check_status 
  ON project_published_domains(ssl_status, last_ssl_checked_at)
  WHERE ssl_status != 'active';

CREATE INDEX idx_dns_check_status 
  ON project_published_domains(last_dns_checked_at)
  WHERE last_dns_checked_at IS NOT NULL;

-- Create idempotency keys table for publication API
-- Expert feedback: prevent double-publishing from retries/double-clicks
CREATE TABLE publication_idempotency_keys (
  idempotency_key VARCHAR(255) PRIMARY KEY,
  response_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for idempotency key cleanup (without immutable function in predicate)
CREATE INDEX idx_idempotency_cleanup 
  ON publication_idempotency_keys(created_at);

COMMIT;