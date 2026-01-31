-- Migration: Add auto-calculating yearly pricing with discount percentage
-- This migration implements the Backend Pricing Discount Migration Plan
-- Moving hardcoded 20% yearly discount from frontend to backend

BEGIN;

-- Add discount percentage column (what admin controls)
-- This is the source of truth for yearly pricing discounts
ALTER TABLE public.pricing_items 
ADD COLUMN IF NOT EXISTS yearly_discount_percentage numeric(5,2) DEFAULT 0.00;

-- Add auto-calculated yearly price column (derived from monthly + discount)
-- Uses GENERATED ALWAYS AS to prevent drift between monthly and yearly pricing
-- Formula: (monthly_price * 12 months) * (1 - discount_percentage/100)
-- STORED ensures value is computed once and stored for performance
-- Cast unit_amount_cents early to prevent potential integer overflow
ALTER TABLE public.pricing_items 
ADD COLUMN IF NOT EXISTS unit_amount_yearly_cents integer
  GENERATED ALWAYS AS (
    round((unit_amount_cents::numeric * 12) * (1 - coalesce(yearly_discount_percentage, 0) / 100))::int
  ) STORED;

-- Populate discount percentages for existing plans
-- Standard 20% discount for paid subscription tiers
UPDATE pricing_items 
SET yearly_discount_percentage = 20.00
WHERE item_type = 'subscription' 
  AND item_key != 'free' 
  AND is_active = true
  AND yearly_discount_percentage = 0.00; -- Only update if not already set

-- Free tier: 0% discount (yearly = monthly * 12)
-- Free tier should have same effective rate for monthly and yearly
UPDATE pricing_items 
SET yearly_discount_percentage = 0.00
WHERE item_key = 'free' 
  AND is_active = true
  AND yearly_discount_percentage = 0.00; -- Only update if not already set

-- Add optimized index for efficient querying of yearly pricing
-- Covers common query patterns: catalog joins, subscription filtering, currency filtering
-- More selective with subscription + paid tier filtering in WHERE clause
DROP INDEX IF EXISTS idx_pricing_items_yearly_active;
CREATE INDEX IF NOT EXISTS idx_pricing_items_yearly_paid_active
  ON pricing_items (catalog_version_id, item_type, currency)
  WHERE is_active = true AND item_type = 'subscription' AND yearly_discount_percentage > 0;

-- Add data integrity constraints using DO blocks (PostgreSQL doesn't support ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  -- Ensure yearly discount percentage is between 0-100
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_yearly_discount_pct' 
    AND conrelid = 'pricing_items'::regclass
  ) THEN
    ALTER TABLE public.pricing_items
      ADD CONSTRAINT chk_yearly_discount_pct
      CHECK (yearly_discount_percentage BETWEEN 0 AND 100);
  END IF;

  -- Ensure yearly amount is non-negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_yearly_amount_nonneg' 
    AND conrelid = 'pricing_items'::regclass
  ) THEN
    ALTER TABLE public.pricing_items
      ADD CONSTRAINT chk_yearly_amount_nonneg
      CHECK (unit_amount_yearly_cents >= 0);
  END IF;

  -- Ensure monthly price is non-negative (expert-recommended guardrail)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_monthly_amount_nonneg' 
    AND conrelid = 'pricing_items'::regclass
  ) THEN
    ALTER TABLE public.pricing_items
      ADD CONSTRAINT chk_monthly_amount_nonneg
      CHECK (unit_amount_cents >= 0);
  END IF;
END $$;

-- Set NOT NULL constraint for data integrity (we have a default, so this is safe)
ALTER TABLE public.pricing_items
  ALTER COLUMN yearly_discount_percentage SET NOT NULL;

-- Add comments documenting the auto-calculation behavior
COMMENT ON COLUMN pricing_items.yearly_discount_percentage IS 
  'Discount percentage applied to yearly subscriptions (0–100). Auto-calculates unit_amount_yearly_cents.';
COMMENT ON COLUMN pricing_items.unit_amount_yearly_cents IS 
  'Auto-calculated yearly price in cents: (unit_amount_cents * 12) * (1 - yearly_discount_percentage/100). Uses round() for mathematical precision, floor() applied in service layer for customer trust.';

COMMIT;