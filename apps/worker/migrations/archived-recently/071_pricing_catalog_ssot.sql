-- Migration: Create SSOT Pricing Catalog System  
-- Date: 2025-09-01
-- Description: Implements Single Source of Truth pricing catalog with expert-validated enhancements
-- Expert Review: Incorporated database-level constraints, currency flexibility, and money bug prevention

BEGIN;

-- =====================================================
-- 1. PRICING CATALOG VERSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS pricing_catalog_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_tag TEXT UNIQUE NOT NULL,        -- '2025-09-01'
  is_active BOOLEAN NOT NULL DEFAULT false,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rollover_days INTEGER NOT NULL DEFAULT 90,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pricing_versions_active ON pricing_catalog_versions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_versions_effective ON pricing_catalog_versions(effective_at);

-- Expert recommendation: Database-level enforcement of single active catalog
-- This partial unique index prevents multiple active catalogs at the database level
CREATE UNIQUE INDEX IF NOT EXISTS one_active_pricing_catalog 
ON pricing_catalog_versions ((true)) WHERE is_active;

-- Add comments for documentation
COMMENT ON TABLE pricing_catalog_versions IS 'Versioned pricing catalog with only one active version at a time';
COMMENT ON COLUMN pricing_catalog_versions.version_tag IS 'Human-readable version identifier (e.g. 2025-09-01)';
COMMENT ON COLUMN pricing_catalog_versions.is_active IS 'Only one version can be active at a time';

-- =====================================================
-- 2. PRICING ITEMS TABLE (PLANS & PACKAGES)  
-- =====================================================

CREATE TABLE IF NOT EXISTS pricing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id UUID REFERENCES pricing_catalog_versions(id),
  item_key TEXT NOT NULL,                  -- 'free','starter','builder','pro','ultra','mini','booster','mega','max'
  item_type TEXT NOT NULL,                 -- 'subscription' or 'package'
  
  -- Core attributes (stored in seconds for precision)
  seconds INTEGER NOT NULL DEFAULT 0,      -- included or purchased seconds
  unit_amount_cents INTEGER NOT NULL DEFAULT 0, -- price in cents (renamed for consistency)
  stripe_price_id TEXT,                    -- immutable Stripe price mapping
  
  -- Future-proofing (expert recommendation)
  currency CHAR(3) NOT NULL DEFAULT 'USD', -- future multi-currency support
  tax_inclusive BOOLEAN NOT NULL DEFAULT false, -- tax handling
  
  -- Subscription-specific
  bonus_daily_seconds INTEGER DEFAULT 0,   -- daily bonus (free tier: 900 = 15min)
  bonus_monthly_cap_seconds INTEGER,       -- monthly bonus cap (free: 18000 = 300min) - MUST SET
  rollover_cap_seconds INTEGER DEFAULT 0,  -- rollover limit for paid plans
  
  -- Advisor integration (expert recommendation)
  advisor_eligible BOOLEAN NOT NULL DEFAULT false,
  advisor_payout_cents INTEGER DEFAULT 0,  -- cents per session (renamed for consistency)
  
  -- Package-specific  
  expires_days INTEGER DEFAULT 90,         -- package expiry
  
  -- Display & ordering
  display_name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Expert-enhanced constraints
  UNIQUE(catalog_version_id, item_key, currency), -- currency-aware uniqueness for multi-currency future
  
  -- Validation constraints
  CHECK (item_type IN ('subscription', 'package')),
  CHECK (currency IN ('USD', 'EUR', 'GBP')), -- extend as needed
  CHECK (bonus_daily_seconds <= 900),        -- max 15 minutes daily
  CHECK (CASE WHEN item_key = 'free' THEN bonus_monthly_cap_seconds IS NOT NULL ELSE true END),
  
  -- Expert recommendation: Free tier invariants (defensive programming)
  CHECK (CASE WHEN item_key = 'free' THEN 
    seconds = 0 AND unit_amount_cents = 0 AND advisor_payout_cents = 0
    ELSE true END),
    
  -- Money bug prevention: non-negative constraints
  CHECK (unit_amount_cents >= 0),
  CHECK (advisor_payout_cents >= 0),
  CHECK (seconds >= 0)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pricing_items_catalog ON pricing_items(catalog_version_id);
CREATE INDEX IF NOT EXISTS idx_pricing_items_type ON pricing_items(item_type);
CREATE INDEX IF NOT EXISTS idx_pricing_items_active ON pricing_items(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_items_display_order ON pricing_items(display_order);

-- Expert recommendation: Unique index on Stripe price ID for O(1) webhook lookups
-- Our webhook processor uses getPricingItemByStripeId frequently
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_items_stripe_unique 
ON pricing_items(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE pricing_items IS 'Plans and packages with expert-enhanced structure for subscription and one-time purchases';
COMMENT ON COLUMN pricing_items.seconds IS 'AI time included in seconds (subscriptions) or purchased (packages)';
COMMENT ON COLUMN pricing_items.bonus_daily_seconds IS 'Daily bonus seconds for free tier (max 900 = 15 minutes)';
COMMENT ON COLUMN pricing_items.bonus_monthly_cap_seconds IS 'Monthly bonus cap to prevent free tier abuse';
COMMENT ON COLUMN pricing_items.rollover_cap_seconds IS 'Maximum seconds that can rollover for paid plans';
COMMENT ON COLUMN pricing_items.advisor_eligible IS 'Whether this plan can access advisor features';

-- =====================================================
-- 3. INSERT DEFAULT PRICING CATALOG
-- =====================================================

-- Create initial catalog version
INSERT INTO pricing_catalog_versions (version_tag, is_active, rollover_days, created_at)
VALUES ('2025-09-01', true, 90, NOW())
ON CONFLICT (version_tag) DO NOTHING;

-- Get the catalog version ID for items
DO $$
DECLARE
  catalog_id UUID;
BEGIN
  SELECT id INTO catalog_id FROM pricing_catalog_versions WHERE version_tag = '2025-09-01';
  
  -- Insert subscription plans
  INSERT INTO pricing_items (
    catalog_version_id, item_key, item_type, seconds, unit_amount_cents, 
    bonus_daily_seconds, bonus_monthly_cap_seconds, rollover_cap_seconds,
    advisor_eligible, advisor_payout_cents, display_name, display_order
  ) VALUES
    -- Free tier with daily bonus and monthly cap
    (catalog_id, 'free', 'subscription', 0, 0, 900, 18000, 0, false, 0, 'Free', 1),
    -- Paid subscription tiers with concrete rollover caps (expert-defined)
    (catalog_id, 'starter', 'subscription', 15000, 1900, 0, NULL, 30000, true, 5, 'Starter', 2),
    (catalog_id, 'builder', 'subscription', 36000, 3900, 0, NULL, 72000, true, 5, 'Builder', 3),
    (catalog_id, 'pro', 'subscription', 72000, 6900, 0, NULL, 144000, true, 10, 'Pro', 4),
    (catalog_id, 'ultra', 'subscription', 180000, 12900, 0, NULL, 180000, true, 10, 'Ultra', 5)
  ON CONFLICT (catalog_version_id, item_key, currency) DO UPDATE SET
    seconds = EXCLUDED.seconds,
    unit_amount_cents = EXCLUDED.unit_amount_cents,
    bonus_daily_seconds = EXCLUDED.bonus_daily_seconds,
    bonus_monthly_cap_seconds = EXCLUDED.bonus_monthly_cap_seconds,
    rollover_cap_seconds = EXCLUDED.rollover_cap_seconds,
    advisor_eligible = EXCLUDED.advisor_eligible,
    advisor_payout_cents = EXCLUDED.advisor_payout_cents,
    display_name = EXCLUDED.display_name,
    display_order = EXCLUDED.display_order;
  
  -- Insert one-time packages
  INSERT INTO pricing_items (
    catalog_version_id, item_key, item_type, seconds, unit_amount_cents,
    expires_days, display_name, display_order
  ) VALUES
    (catalog_id, 'mini', 'package', 3600, 500, 90, 'Mini Pack', 10),
    (catalog_id, 'booster', 'package', 18000, 2000, 90, 'Booster Pack', 11),  
    (catalog_id, 'mega', 'package', 60000, 5900, 90, 'Mega Pack', 12),
    (catalog_id, 'max', 'package', 180000, 12000, 90, 'Max Pack', 13)
  ON CONFLICT (catalog_version_id, item_key, currency) DO UPDATE SET
    seconds = EXCLUDED.seconds,
    unit_amount_cents = EXCLUDED.unit_amount_cents,
    expires_days = EXCLUDED.expires_days,
    display_name = EXCLUDED.display_name,
    display_order = EXCLUDED.display_order;
    
END $$;

-- =====================================================
-- 4. CATALOG ACTIVATION SAFETY FUNCTION
-- =====================================================

-- Function to ensure only one catalog is active
CREATE OR REPLACE FUNCTION ensure_single_active_catalog()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting a catalog to active, deactivate all others
  IF NEW.is_active = true THEN
    UPDATE pricing_catalog_versions 
    SET is_active = false 
    WHERE id != NEW.id AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for catalog activation safety
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'ensure_single_active_catalog_trigger' 
    AND tgrelid = 'pricing_catalog_versions'::regclass
  ) THEN
    CREATE TRIGGER ensure_single_active_catalog_trigger
      BEFORE UPDATE ON pricing_catalog_versions
      FOR EACH ROW
      EXECUTE FUNCTION ensure_single_active_catalog();
  END IF;
END $$;

COMMIT;