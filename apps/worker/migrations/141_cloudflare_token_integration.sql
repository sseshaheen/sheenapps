-- Migration 141: Cloudflare API Token Integration
--
-- Adds columns for user-provided Cloudflare API tokens (encrypted at rest)
-- and expands authority_level to include 'cf_token'.
--
-- Part of Phase 2C: Cloudflare "one-click" DNS provisioning.

BEGIN;

-- Add columns for user-provided CF token (encrypted)
ALTER TABLE inhouse_email_domains
  ADD COLUMN IF NOT EXISTS cf_user_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS cf_user_token_iv TEXT,
  ADD COLUMN IF NOT EXISTS cf_user_zone_id VARCHAR(64);

-- Expand authority_level CHECK constraint to include 'cf_token'
-- Drop the existing constraint first, then re-add with new value
DO $$
BEGIN
  -- Drop existing constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_email_domains_authority_level_check'
      AND conrelid = 'inhouse_email_domains'::regclass
  ) THEN
    ALTER TABLE inhouse_email_domains
      DROP CONSTRAINT inhouse_email_domains_authority_level_check;
  END IF;

  -- Add updated constraint
  ALTER TABLE inhouse_email_domains
    ADD CONSTRAINT inhouse_email_domains_authority_level_check
    CHECK (authority_level IN ('manual', 'subdomain', 'nameservers', 'cf_token'));
END $$;

-- Ensure encrypted token and IV are always both present or both absent
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cf_token_pair_check') THEN
    ALTER TABLE inhouse_email_domains
      ADD CONSTRAINT cf_token_pair_check
      CHECK (
        (cf_user_token_encrypted IS NULL AND cf_user_token_iv IS NULL)
        OR
        (cf_user_token_encrypted IS NOT NULL AND cf_user_token_iv IS NOT NULL)
      );
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN inhouse_email_domains.cf_user_token_encrypted IS 'User-provided Cloudflare API token (AES-256-GCM encrypted)';
COMMENT ON COLUMN inhouse_email_domains.cf_user_token_iv IS 'IV for cf_user_token_encrypted';
COMMENT ON COLUMN inhouse_email_domains.cf_user_zone_id IS 'Cloudflare zone ID discovered from user token';

COMMIT;
