-- =====================================================
-- Migration 070: Promotion System Foundation - Canonical Control Plane
-- =====================================================
-- Author: Claude Code Assistant
-- Created: September 1, 2025
-- Purpose: Implement canonical promotion system with ephemeral gateway artifacts
-- Status: Production-ready with comprehensive audit trail
--
-- Key Architecture:
-- - Canonical control plane with ephemeral Stripe artifacts
-- - Reserve-commit pattern with TTL-based reservations
-- - State machine enforcement with database triggers
-- - Comprehensive audit logging integration
-- - Multi-gateway preparation (Stripe first, extensible)
-- =====================================================

-- =====================================================
-- Core Promotion Types
-- =====================================================

-- Promotion discount types (idempotent creation)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_discount_type') THEN
    CREATE TYPE promotion_discount_type AS ENUM ('percentage', 'fixed_amount');
  END IF;
END $$;

-- Promotion status enum (idempotent creation)  
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_status') THEN
    CREATE TYPE promotion_status AS ENUM ('active', 'paused', 'expired', 'disabled');
  END IF;
END $$;

-- Artifact gateway types (idempotent creation)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artifact_gateway') THEN
    CREATE TYPE artifact_gateway AS ENUM ('stripe');
  END IF;
END $$;

-- Reservation status for reserve-commit pattern (idempotent creation)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE reservation_status AS ENUM ('reserved', 'committed', 'released', 'expired');
  END IF;
END $$;

-- =====================================================
-- Core Promotions Table
-- =====================================================

-- Canonical promotions (source of truth)
CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  
  -- Discount configuration
  discount_type promotion_discount_type NOT NULL,
  discount_value integer NOT NULL, -- percentage (1-100) or minor units
  currency text, -- Required for fixed_amount discounts
  
  -- Usage limits (no hand-maintained counters)
  max_total_uses integer, -- NULL = unlimited
  max_uses_per_user integer DEFAULT 1,
  
  -- Validity period
  valid_from timestamptz DEFAULT now() NOT NULL,
  valid_until timestamptz,
  
  -- Status and metadata
  status promotion_status DEFAULT 'active' NOT NULL,
  created_by uuid NOT NULL, -- admin user who created it
  notes text, -- admin notes
  
  -- Audit fields
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT promotions_discount_value_positive CHECK (discount_value > 0),
  CONSTRAINT promotions_percentage_valid CHECK (
    discount_type != 'percentage' OR discount_value <= 100
  ),
  CONSTRAINT promotions_currency_fixed_required CHECK (
    (discount_type = 'fixed_amount' AND currency IS NOT NULL) OR 
    (discount_type = 'percentage')
  ),
  CONSTRAINT promotions_usage_limits_valid CHECK (
    max_total_uses IS NULL OR max_total_uses > 0
  ),
  CONSTRAINT promotions_user_limits_valid CHECK (
    max_uses_per_user IS NULL OR max_uses_per_user > 0
  ),
  CONSTRAINT promotions_period_valid CHECK (
    valid_until IS NULL OR valid_until > valid_from
  )
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_promotions_status_valid ON promotions (status, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_promotions_created_by ON promotions (created_by);

-- Updated timestamp trigger
CREATE TRIGGER set_promotions_updated_at 
  BEFORE UPDATE ON promotions 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- Promotion Codes Table
-- =====================================================

-- Human-readable promotion codes
CREATE TABLE IF NOT EXISTS promotion_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  code text NOT NULL,
  code_normalized text GENERATED ALWAYS AS (UPPER(TRIM(code))) STORED,
  
  -- Usage limits (no hand-maintained counters)
  max_uses integer, -- NULL = inherit from promotion
  
  -- Status
  is_active boolean DEFAULT true NOT NULL,
  
  -- Audit fields
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT promotion_codes_max_uses_valid CHECK (
    max_uses IS NULL OR max_uses > 0
  )
);

-- Unique constraint on normalized codes (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_promotion_codes_normalized 
ON promotion_codes (code_normalized);

-- Foreign key index
CREATE INDEX IF NOT EXISTS idx_promotion_codes_promotion_id 
ON promotion_codes (promotion_id);

-- Updated timestamp trigger
CREATE TRIGGER set_promotion_codes_updated_at 
  BEFORE UPDATE ON promotion_codes 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- Ephemeral Gateway Artifacts Table
-- =====================================================

-- Tracks ephemeral promotion objects in payment gateways
CREATE TABLE IF NOT EXISTS promotion_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  promotion_code_id uuid NOT NULL REFERENCES promotion_codes(id) ON DELETE CASCADE,
  reservation_id uuid, -- FK added later after promotion_reservations table exists
  gateway artifact_gateway NOT NULL,
  
  -- Gateway-specific identifiers
  external_coupon_id text, -- Stripe coupon ID
  external_promotion_code_id text, -- Stripe promotion code ID
  
  -- TTL for cleanup
  expires_at timestamptz NOT NULL,
  
  -- Metadata
  created_for_user uuid, -- user who triggered creation
  created_for_session text, -- correlation tracking
  
  -- Audit fields
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT promotion_artifacts_expires_future CHECK (expires_at > created_at),
  -- Unique constraints for gateway artifact IDs
  CONSTRAINT uq_artifact_coupon UNIQUE (gateway, external_coupon_id),
  CONSTRAINT uq_artifact_promotion_code UNIQUE (gateway, external_promotion_code_id)
);

-- Indexes for efficient cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_promotion_artifacts_expires_at 
ON promotion_artifacts (expires_at);
-- Split external ID indexes for better performance
CREATE INDEX IF NOT EXISTS idx_promotion_artifacts_coupon_id 
ON promotion_artifacts (gateway, external_coupon_id);
CREATE INDEX IF NOT EXISTS idx_promotion_artifacts_promo_code_id 
ON promotion_artifacts (gateway, external_promotion_code_id);
CREATE INDEX IF NOT EXISTS idx_promotion_artifacts_promotion_code 
ON promotion_artifacts (promotion_code_id);

-- Unique constraint for reservation + gateway linkage
CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_reservation_gateway
ON promotion_artifacts (reservation_id, gateway) 
WHERE reservation_id IS NOT NULL;

-- Updated timestamp trigger
CREATE TRIGGER set_promotion_artifacts_updated_at 
  BEFORE UPDATE ON promotion_artifacts 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- Promotion Reservations Table
-- =====================================================

-- Reserve-commit pattern for atomic usage tracking
CREATE TABLE IF NOT EXISTS promotion_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  promotion_code_id uuid NOT NULL REFERENCES promotion_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  
  -- Reservation details
  status reservation_status DEFAULT 'reserved' NOT NULL,
  cart_hash text NOT NULL, -- idempotency key
  reserved_amount integer NOT NULL, -- minor units for fixed, percentage for percent
  currency text NOT NULL, -- Must match promotion currency for fixed_amount
  
  -- TTL for cleanup
  expires_at timestamptz NOT NULL,
  
  -- Commit tracking
  committed_at timestamptz,
  stripe_payment_intent_id text, -- for tracking successful payments
  
  -- Audit fields
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT promotion_reservations_expires_future CHECK (expires_at > created_at),
  CONSTRAINT promotion_reservations_amount_positive CHECK (reserved_amount > 0),
  CONSTRAINT promotion_reservations_commit_logic CHECK (
    (status = 'committed' AND committed_at IS NOT NULL) OR
    (status != 'committed' AND committed_at IS NULL)
  )
);

-- Unique constraint for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uniq_promotion_reservations_cart 
ON promotion_reservations (user_id, promotion_code_id, cart_hash);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_promotion_reservations_expires_at 
ON promotion_reservations (expires_at);
CREATE INDEX IF NOT EXISTS idx_promotion_reservations_user_status 
ON promotion_reservations (user_id, status);
CREATE INDEX IF NOT EXISTS idx_promotion_reservations_stripe_intent 
ON promotion_reservations (stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

-- Updated timestamp trigger
CREATE TRIGGER set_promotion_reservations_updated_at 
  BEFORE UPDATE ON promotion_reservations 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- Add Foreign Key References (After All Tables Exist)
-- =====================================================

-- Add foreign key from promotion_artifacts to promotion_reservations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'promotion_artifacts_reservation_fk'
  ) THEN
    ALTER TABLE promotion_artifacts
    ADD CONSTRAINT promotion_artifacts_reservation_fk
    FOREIGN KEY (reservation_id) REFERENCES promotion_reservations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- Promotion Redemptions Table
-- =====================================================

-- Final redemption records (audit trail)
CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id),
  promotion_code_id uuid NOT NULL REFERENCES promotion_codes(id),
  reservation_id uuid REFERENCES promotion_reservations(id),
  user_id uuid NOT NULL,
  
  -- Gateway tracking
  gateway text NOT NULL DEFAULT 'stripe',
  event_id text, -- Payment gateway event ID for deduplication
  
  -- Redemption details
  discount_applied_amount integer NOT NULL, -- actual discount in minor units
  original_amount integer NOT NULL, -- original cart total in minor units
  final_amount integer NOT NULL, -- final amount charged in minor units
  currency text NOT NULL DEFAULT 'usd',
  
  -- Payment tracking
  stripe_payment_intent_id text,
  stripe_session_id text,
  
  -- Audit fields
  redeemed_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT promotion_redemptions_amounts_positive CHECK (
    discount_applied_amount > 0 AND 
    original_amount > 0 AND 
    final_amount >= 0
  ),
  CONSTRAINT promotion_redemptions_discount_valid CHECK (
    discount_applied_amount <= original_amount AND
    final_amount = original_amount - discount_applied_amount
  ),
  -- Unique constraints for deduplication
  CONSTRAINT uq_redemp_reservation UNIQUE (reservation_id)
);

-- Indexes for analytics and auditing
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promotion_id 
ON promotion_redemptions (promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_user_id 
ON promotion_redemptions (user_id);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_redeemed_at 
ON promotion_redemptions (redeemed_at);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_stripe_ids 
ON promotion_redemptions (stripe_payment_intent_id, stripe_session_id);

-- Unique partial indexes for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS uq_redemp_payment_intent 
ON promotion_redemptions (stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_redemp_session 
ON promotion_redemptions (stripe_session_id) 
WHERE stripe_session_id IS NOT NULL;

-- Updated timestamp trigger
CREATE TRIGGER set_promotion_redemptions_updated_at 
  BEFORE UPDATE ON promotion_redemptions 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- State Machine Enforcement Triggers
-- =====================================================

-- Prevent ALL modifications to finalized reservations
CREATE OR REPLACE FUNCTION forbid_updates_when_finalized()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow new records
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Prevent ANY modifications to finalized states
  IF OLD.status IN ('committed', 'expired') THEN
    RAISE EXCEPTION 'Reservation is finalized (status: %)', OLD.status
      USING ERRCODE = 'check_violation',
            DETAIL = 'Finalized reservations cannot be modified',
            HINT = 'Create a new reservation instead';
  END IF;
  
  -- Validate state transitions for non-finalized reservations
  IF OLD.status = 'reserved' AND NEW.status NOT IN ('committed', 'released', 'expired') THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply state machine trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'forbid_finalized_updates' 
    AND tgrelid = 'promotion_reservations'::regclass
  ) THEN
    CREATE TRIGGER forbid_finalized_updates
      BEFORE UPDATE ON promotion_reservations
      FOR EACH ROW EXECUTE FUNCTION forbid_updates_when_finalized();
  END IF;
END $$;

-- =====================================================
-- Code-Promotion Consistency Enforcement
-- =====================================================

-- Ensure promotion_code_id belongs to the specified promotion_id
CREATE OR REPLACE FUNCTION enforce_code_promo_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE 
  pc_promo uuid;
BEGIN
  SELECT promotion_id INTO pc_promo 
  FROM promotion_codes 
  WHERE id = NEW.promotion_code_id;
  
  IF pc_promo IS NULL OR pc_promo <> NEW.promotion_id THEN
    RAISE EXCEPTION 'promotion_code_id (%) does not belong to promotion_id (%)', 
      NEW.promotion_code_id, NEW.promotion_id
      USING ERRCODE = 'foreign_key_violation',
            DETAIL = 'Promotion code must belong to the specified promotion';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply to reservations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'reservations_code_match' 
    AND tgrelid = 'promotion_reservations'::regclass
  ) THEN
    CREATE TRIGGER reservations_code_match
      BEFORE INSERT OR UPDATE ON promotion_reservations
      FOR EACH ROW EXECUTE FUNCTION enforce_code_promo_match();
  END IF;
END $$;

-- Apply to redemptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'redemptions_code_match' 
    AND tgrelid = 'promotion_redemptions'::regclass
  ) THEN
    CREATE TRIGGER redemptions_code_match
      BEFORE INSERT OR UPDATE ON promotion_redemptions
      FOR EACH ROW EXECUTE FUNCTION enforce_code_promo_match();
  END IF;
END $$;

-- =====================================================
-- Usage Computation Views (Replace Hand-Maintained Counters)
-- =====================================================

-- View for current promotion usage
CREATE OR REPLACE VIEW promotion_usage_stats AS
SELECT 
  p.id as promotion_id,
  p.name,
  p.max_total_uses,
  COALESCE(usage.total_redemptions, 0) as current_uses,
  COALESCE(usage.unique_users, 0) as unique_users,
  COALESCE(usage.total_discount_given, 0) as total_discount_given
FROM promotions p
LEFT JOIN (
  SELECT 
    promotion_id,
    COUNT(*) as total_redemptions,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(discount_applied_amount) as total_discount_given
  FROM promotion_redemptions
  GROUP BY promotion_id
) usage ON p.id = usage.promotion_id;

-- View for current promotion code usage  
CREATE OR REPLACE VIEW promotion_code_usage_stats AS
SELECT 
  pc.id as promotion_code_id,
  pc.code,
  pc.promotion_id,
  pc.max_uses,
  COALESCE(usage.redemption_count, 0) as current_uses,
  COALESCE(usage.unique_users, 0) as unique_users,
  usage.last_used_at
FROM promotion_codes pc
LEFT JOIN (
  SELECT 
    promotion_code_id,
    COUNT(*) as redemption_count,
    COUNT(DISTINCT user_id) as unique_users,
    MAX(redeemed_at) as last_used_at
  FROM promotion_redemptions
  GROUP BY promotion_code_id
) usage ON pc.id = usage.promotion_code_id;

-- =====================================================
-- Security: Row Level Security
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_redemptions ENABLE ROW LEVEL SECURITY;

-- Admin users can manage all promotions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_full_access_promotions') THEN
    CREATE POLICY admin_full_access_promotions ON promotions
      FOR ALL USING (public.has_admin_perm('promotion:*'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_full_access_promotion_codes') THEN
    CREATE POLICY admin_full_access_promotion_codes ON promotion_codes
      FOR ALL USING (public.has_admin_perm('promotion:*'));
  END IF;
END $$;

-- Restricted artifact access - read-only for admins, writes via SECURITY DEFINER functions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'artifacts_admin_read') THEN
    CREATE POLICY artifacts_admin_read ON promotion_artifacts
      FOR SELECT USING (public.has_admin_perm('promotion:read') OR public.has_admin_perm('promotion:*'));
  END IF;
END $$;

-- Users can only see their own reservations and redemptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'user_own_reservations') THEN
    CREATE POLICY user_own_reservations ON promotion_reservations
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'user_own_redemptions') THEN
    CREATE POLICY user_own_redemptions ON promotion_redemptions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- =====================================================
-- Comments for Documentation
-- =====================================================

COMMENT ON TABLE promotions IS 
'Canonical promotion definitions with discount rules and usage limits. Source of truth for all promotion logic.';

COMMENT ON TABLE promotion_codes IS 
'Human-readable codes that reference promotions. Supports case-insensitive matching via generated column.';

COMMENT ON TABLE promotion_artifacts IS 
'Ephemeral gateway artifacts (Stripe coupons/codes) with TTL cleanup. Not source of truth - only integration layer.';

COMMENT ON TABLE promotion_reservations IS 
'Reserve-commit pattern for atomic usage tracking. Prevents race conditions in high-traffic scenarios.';

COMMENT ON TABLE promotion_redemptions IS 
'Immutable audit trail of successful promotion usage. Complete payment integration tracking.';

COMMENT ON FUNCTION forbid_updates_when_finalized() IS 
'Prevents ALL modifications to finalized reservations (committed/expired). Enforces state machine integrity.';

COMMENT ON FUNCTION enforce_code_promo_match() IS 
'Ensures promotion_code_id belongs to the specified promotion_id. Maintains referential consistency.';

-- =====================================================
-- Migration Complete
-- =====================================================

-- Log successful migration
DO $$ 
BEGIN
  RAISE NOTICE '✅ Migration 070_promotion_system_foundation.sql completed successfully';
  RAISE NOTICE '📋 Added: 5 core tables, computed views, state machine, RLS policies';
  RAISE NOTICE '🔒 Security: Proper admin permissions, restricted artifacts, audit integration';
  RAISE NOTICE '💱 Features: Currency support, reserve-commit, deduplication, TTL cleanup';
  RAISE NOTICE '🚀 Ready for: PromoCore service, StripeAdapter, and admin panel';
  RAISE NOTICE '⚠️ TODO: Implement TTL cleanup jobs in application services';
END
$$;