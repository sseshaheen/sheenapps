-- Migration: 134_inhouse_email_domains.sql
-- Purpose: Add custom domain table for Easy Mode Email (Level 1 - Custom Domain)
-- Table: inhouse_email_domains

BEGIN;

-- =============================================================================
-- inhouse_email_domains: Custom domain configuration
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Domain info
  domain VARCHAR(255) NOT NULL,  -- e.g., "their-domain.com" or "mail.their-domain.com"
  is_subdomain BOOLEAN NOT NULL DEFAULT FALSE,  -- true for mail.domain.com style

  -- DNS authority level
  -- 'manual': User added records manually, we can only verify
  -- 'subdomain': We control mail.domain.com via NS delegation (Phase 2B)
  -- 'nameservers': User switched NS to Cloudflare, we manage via API (Phase 2B)
  authority_level VARCHAR(20) NOT NULL DEFAULT 'manual',

  -- Email provider for this domain
  provider VARCHAR(20) NOT NULL DEFAULT 'resend',  -- 'resend' | 'ses' | 'postmark'

  -- Resend domain integration
  resend_domain_id VARCHAR(64),  -- Resend's domain ID after adding to their API

  -- DNS verification status
  -- Each record type has: verified (bool), value (string), last_checked (timestamp), error (string)
  dns_status JSONB NOT NULL DEFAULT '{
    "spf": { "verified": false },
    "dkim": { "verified": false },
    "dmarc": { "verified": false },
    "mx": { "verified": false },
    "return_path": { "verified": false }
  }',

  -- For authority_level = 'nameservers': Cloudflare zone info (Phase 2B)
  cloudflare_zone_id VARCHAR(64),
  imported_records JSONB,  -- Snapshot of records we imported when they switched NS

  -- Domain ownership verification
  verification_token VARCHAR(64) NOT NULL,  -- TXT record for domain ownership proof
  ownership_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ownership_verified_at TIMESTAMPTZ,

  -- Overall status
  -- 'pending': Domain added but not verified
  -- 'verifying': DNS verification in progress
  -- 'verified': SPF + DKIM verified, ready for sending
  -- 'error': Verification failed
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  last_error TEXT,

  -- Timestamps
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one domain per project
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_uq_project_domain'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_uq_project_domain
      UNIQUE (project_id, domain);
  END IF;
END $$;

-- Domain format validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_valid_domain'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_valid_domain
      CHECK (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');
  END IF;
END $$;

-- Authority level validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_valid_authority'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_valid_authority
      CHECK (authority_level IN ('manual', 'subdomain', 'nameservers'));
  END IF;
END $$;

-- Status validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_valid_status'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_valid_status
      CHECK (status IN ('pending', 'verifying', 'verified', 'error'));
  END IF;
END $$;

-- Provider validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_email_domains_provider_chk'
  ) THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT inhouse_email_domains_provider_chk
      CHECK (provider IN ('resend', 'ses', 'postmark'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_domains_project
  ON inhouse_email_domains(project_id);

CREATE INDEX IF NOT EXISTS idx_email_domains_status
  ON inhouse_email_domains(project_id, status);

CREATE INDEX IF NOT EXISTS idx_email_domains_domain
  ON inhouse_email_domains(domain);

-- Index for domains that need verification check
CREATE INDEX IF NOT EXISTS idx_email_domains_needs_check
  ON inhouse_email_domains(last_checked_at)
  WHERE status IN ('pending', 'verifying');

-- Unique verification token (avoids collisions, simplifies lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_domains_verification_token
  ON inhouse_email_domains(verification_token);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE inhouse_email_domains ENABLE ROW LEVEL SECURITY;

-- Domain owner access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'email_domains_owner_access' AND tablename = 'inhouse_email_domains'
  ) THEN
    CREATE POLICY email_domains_owner_access ON inhouse_email_domains
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
-- Comments
-- =============================================================================
COMMENT ON TABLE inhouse_email_domains IS 'Custom domain configuration for Easy Mode Email (Level 1)';
COMMENT ON COLUMN inhouse_email_domains.authority_level IS 'DNS authority: manual (user adds records), subdomain (NS delegation), nameservers (we manage via CF API)';
COMMENT ON COLUMN inhouse_email_domains.dns_status IS 'JSONB with verification status for each DNS record type (spf, dkim, dmarc, mx, return_path)';
COMMENT ON COLUMN inhouse_email_domains.verification_token IS 'Random token for TXT record to prove domain ownership';
COMMENT ON COLUMN inhouse_email_domains.resend_domain_id IS 'Resend API domain ID after domain is added to their system';

COMMIT;
