-- Migration: 135_inhouse_registered_domains.sql
-- Description: Domain registration tracking for Easy Mode (Phase 3: Domain Registration)
-- Part of easy-mode-email-plan.md

BEGIN;

-- =============================================================================
-- inhouse_registered_domains: Domains purchased through SheenApps
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_registered_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Domain information
  domain VARCHAR(255) NOT NULL UNIQUE,
  tld VARCHAR(50) NOT NULL,  -- com, net, org, io, etc.

  -- OpenSRS tracking
  opensrs_order_id VARCHAR(100),
  opensrs_domain_id VARCHAR(100),

  -- Registration dates
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_renewed_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- Possible values:
  -- 'pending'     - Registration in progress
  -- 'active'      - Registered and active
  -- 'expired'     - Past expiration date
  -- 'grace'       - In grace period after expiration
  -- 'redemption'  - In redemption period (can still be recovered with fee)
  -- 'suspended'   - Suspended for abuse/non-payment
  -- 'transferred' - Transferred out to another registrar

  -- Settings
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  whois_privacy BOOLEAN NOT NULL DEFAULT TRUE,
  locked BOOLEAN NOT NULL DEFAULT TRUE,

  -- Nameservers (JSON array of strings)
  nameservers JSONB NOT NULL DEFAULT '["ns1.sheenapps.com", "ns2.sheenapps.com"]',

  -- Contact information (stored encrypted in practice, here as JSONB for schema)
  contacts JSONB NOT NULL,
  -- Structure: { owner: {...}, admin: {...}, billing: {...}, tech: {...} }

  -- Billing
  last_payment_id VARCHAR(100),  -- Stripe payment/invoice ID
  next_renewal_price_cents INTEGER,  -- Price for next renewal in cents
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Linked to email domain (if email is configured)
  email_domain_id UUID REFERENCES inhouse_email_domains(id) ON DELETE SET NULL,

  -- Cloudflare zone (if we manage DNS)
  cloudflare_zone_id VARCHAR(64),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_registered_domains_project
  ON inhouse_registered_domains(project_id);
CREATE INDEX IF NOT EXISTS idx_registered_domains_status
  ON inhouse_registered_domains(status);
CREATE INDEX IF NOT EXISTS idx_registered_domains_expires
  ON inhouse_registered_domains(expires_at);
CREATE INDEX IF NOT EXISTS idx_registered_domains_auto_renew
  ON inhouse_registered_domains(auto_renew, expires_at)
  WHERE status = 'active' AND auto_renew = TRUE;

-- =============================================================================
-- inhouse_domain_events: Domain lifecycle events for audit trail
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES inhouse_registered_domains(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL,
  -- Possible values:
  -- 'registered'   - Domain was registered
  -- 'renewed'      - Domain was renewed
  -- 'expired'      - Domain expired
  -- 'grace_period' - Entered grace period
  -- 'redemption'   - Entered redemption period
  -- 'transferred'  - Transfer initiated/completed
  -- 'nameservers_updated' - Nameservers changed
  -- 'contacts_updated'    - Contacts changed
  -- 'settings_updated'    - Settings changed (auto-renew, privacy, lock)
  -- 'payment_failed'      - Renewal payment failed
  -- 'payment_succeeded'   - Payment succeeded
  -- 'suspension'          - Domain suspended
  -- 'reactivation'        - Domain reactivated

  -- Event metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  -- Structure depends on event_type, e.g.:
  -- For 'renewed': { orderId, newExpiresAt, price, paymentId }
  -- For 'nameservers_updated': { oldNs, newNs }
  -- For 'payment_failed': { reason, retryAt }

  -- Actor (who triggered the event)
  actor_type VARCHAR(20) NOT NULL DEFAULT 'system',
  -- 'user', 'system', 'webhook'
  actor_id VARCHAR(100),  -- User ID or 'cron', 'webhook', etc.

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_domain
  ON inhouse_domain_events(domain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_type
  ON inhouse_domain_events(event_type, created_at DESC);

-- =============================================================================
-- inhouse_domain_pricing: Cache TLD pricing from OpenSRS
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_domain_pricing (
  tld VARCHAR(50) PRIMARY KEY,

  -- Pricing in cents (USD)
  registration_price_cents INTEGER NOT NULL,
  renewal_price_cents INTEGER NOT NULL,
  transfer_price_cents INTEGER NOT NULL,

  -- Our markup (if any)
  markup_percent INTEGER NOT NULL DEFAULT 0,

  -- Availability
  available BOOLEAN NOT NULL DEFAULT TRUE,
  premium_only BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cache tracking
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert common TLD pricing (placeholder - will be synced from OpenSRS)
INSERT INTO inhouse_domain_pricing (tld, registration_price_cents, renewal_price_cents, transfer_price_cents)
VALUES
  ('com', 1299, 1599, 1299),
  ('net', 1299, 1599, 1299),
  ('org', 1299, 1599, 1299),
  ('io', 4999, 5999, 4999),
  ('co', 2999, 2999, 2999),
  ('app', 1999, 1999, 1999),
  ('dev', 1599, 1599, 1599),
  ('ai', 7999, 7999, 7999)
ON CONFLICT (tld) DO NOTHING;

-- =============================================================================
-- CHECK Constraints (prevent typos in string enum fields)
-- =============================================================================

-- Registered domain status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_registered_domains_status_chk') THEN
    ALTER TABLE inhouse_registered_domains
      ADD CONSTRAINT inhouse_registered_domains_status_chk
      CHECK (status IN ('pending', 'active', 'expired', 'grace', 'redemption', 'suspended', 'transferred'));
  END IF;
END $$;

-- Domain event types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_domain_events_type_chk') THEN
    ALTER TABLE inhouse_domain_events
      ADD CONSTRAINT inhouse_domain_events_type_chk
      CHECK (event_type IN (
        'registered', 'renewed', 'expired', 'grace_period', 'redemption',
        'transferred', 'nameservers_updated', 'contacts_updated', 'settings_updated',
        'payment_failed', 'payment_succeeded', 'suspension', 'reactivation',
        'expiry_warning', 'auth_code_requested'
      ));
  END IF;
END $$;

-- Actor types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_domain_events_actor_chk') THEN
    ALTER TABLE inhouse_domain_events
      ADD CONSTRAINT inhouse_domain_events_actor_chk
      CHECK (actor_type IN ('user', 'system', 'webhook', 'cron'));
  END IF;
END $$;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE inhouse_registered_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_domain_events ENABLE ROW LEVEL SECURITY;
-- Note: inhouse_domain_pricing is public read-only, accessed via service role
-- If direct client access needed, add: GRANT SELECT ON inhouse_domain_pricing TO authenticated;

-- Policy: Users can view/edit domains they own via project ownership
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'registered_domains_project_access' AND tablename = 'inhouse_registered_domains') THEN
    CREATE POLICY registered_domains_project_access ON inhouse_registered_domains
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

-- Policy: Users can view/edit events for domains they own
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'domain_events_project_access' AND tablename = 'inhouse_domain_events') THEN
    CREATE POLICY domain_events_project_access ON inhouse_domain_events
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
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'registered_domains_service_full' AND tablename = 'inhouse_registered_domains') THEN
      CREATE POLICY registered_domains_service_full ON inhouse_registered_domains
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'domain_events_service_full' AND tablename = 'inhouse_domain_events') THEN
      CREATE POLICY domain_events_service_full ON inhouse_domain_events
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- Updated at trigger
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_registered_domains_timestamp') THEN
    CREATE TRIGGER update_registered_domains_timestamp
      BEFORE UPDATE ON inhouse_registered_domains
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE inhouse_registered_domains IS 'Domains purchased through SheenApps via OpenSRS';
COMMENT ON TABLE inhouse_domain_events IS 'Audit log for domain lifecycle events';
COMMENT ON TABLE inhouse_domain_pricing IS 'Cached TLD pricing from OpenSRS';

COMMIT;
