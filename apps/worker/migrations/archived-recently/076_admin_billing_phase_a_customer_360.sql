-- Admin Billing Enhancement Phase A: Customer 360 Financial Profile
-- Date: September 2, 2025
-- Purpose: Expert-validated database schema for customer intelligence and health scoring
-- UPDATED: Incorporated expert feedback - removed superuser requirements, fixed joins, corrected columns
--
-- NOTE: Concurrent indexes are in separate file 076b_admin_billing_phase_a_concurrent_indexes.sql

BEGIN;

-- 1. Enhanced customer health scoring (expert-recommended transparent formula)
ALTER TABLE billing_customers 
ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS health_factors JSONB DEFAULT '{}', -- Transparent breakdown for CS team
ADD COLUMN IF NOT EXISTS last_health_update TIMESTAMP DEFAULT NOW();

-- 2. Add interval snapshot to prevent historical MRR drift (expert critical fix)
ALTER TABLE billing_subscriptions 
ADD COLUMN IF NOT EXISTS billing_interval TEXT CHECK (billing_interval IN ('month', 'year'));

-- Backfill billing interval based on item type (subscriptions are monthly, packages don't have intervals)
UPDATE billing_subscriptions bs
SET billing_interval = 
  CASE 
    WHEN pi.item_type = 'subscription' THEN 'month'
    WHEN pi.item_type = 'package' THEN NULL
    ELSE 'month' -- default to month for any legacy data
  END
FROM pricing_items pi
WHERE pi.id = bs.pricing_item_id
  AND bs.billing_interval IS NULL
  AND pi.item_type IS NOT NULL;

-- 3. Enhanced payment failure categorization for better admin dashboards
ALTER TABLE billing_payments
ADD COLUMN IF NOT EXISTS provider_error_code TEXT,
ADD COLUMN IF NOT EXISTS provider_error_category TEXT CHECK (provider_error_category IN 
  ('insufficient_funds', 'expired_card', 'invalid_card', 'declined', 'processing_error', 'network_error', 'other')),
ADD COLUMN IF NOT EXISTS payment_flow TEXT; -- Expert recommendation for flow analysis

-- 4. Exchange rates table for multi-currency normalization (expert-validated)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency CHAR(3) NOT NULL,
  to_currency CHAR(3) NOT NULL DEFAULT 'USD',
  rate DECIMAL(10,6) NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT DEFAULT 'stripe', -- stripe, manual, api
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, effective_date)
);

-- 5. Regional calendars for weekend/holiday aware dunning (expert-recommended)
CREATE TABLE IF NOT EXISTS regional_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code CHAR(2) NOT NULL,
  date DATE NOT NULL,
  is_weekend BOOLEAN DEFAULT false,
  is_holiday BOOLEAN DEFAULT false,
  holiday_name TEXT,
  UNIQUE(region_code, date)
);

-- Populate basic weekend patterns for Egypt and Saudi Arabia (optimized per expert)
DO $$
BEGIN
  -- Saudi Arabia (Friday/Saturday weekends)
  INSERT INTO regional_calendars (region_code, date, is_weekend, holiday_name)
  SELECT 
    'SA', 
    d::date,
    EXTRACT(dow FROM d)::int IN (5,6),
    CASE WHEN EXTRACT(dow FROM d)::int IN (5,6) THEN 'Weekend' END
  FROM generate_series('2025-01-01'::date, '2026-12-31'::date, '1 day') AS g(d)
  ON CONFLICT (region_code, date) DO NOTHING;

  -- Egypt (Friday weekends)
  INSERT INTO regional_calendars (region_code, date, is_weekend, holiday_name)
  SELECT 
    'EG', 
    d::date,
    EXTRACT(dow FROM d)::int = 5,
    CASE WHEN EXTRACT(dow FROM d)::int = 5 THEN 'Friday' END
  FROM generate_series('2025-01-01'::date, '2026-12-31'::date, '1 day') AS g(d)
  ON CONFLICT (region_code, date) DO NOTHING;
END $$;

-- 6. Insert initial exchange rates (static values, will be updated via API)
INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source)
VALUES 
  ('USD', 'USD', 1.000000, CURRENT_DATE, 'identity'),
  ('EUR', 'USD', 1.089100, CURRENT_DATE, 'manual'), -- Approximate current rate
  ('GBP', 'USD', 1.273400, CURRENT_DATE, 'manual'), -- Approximate current rate
  ('EGP', 'USD', 0.032000, CURRENT_DATE, 'manual'), -- Approximate current rate (1 USD = ~31 EGP)
  ('SAR', 'USD', 0.267000, CURRENT_DATE, 'manual')  -- Approximate current rate (1 USD = ~3.75 SAR)
ON CONFLICT (from_currency, to_currency, effective_date) DO UPDATE
SET rate = EXCLUDED.rate, source = EXCLUDED.source;

-- 7. Performance indexes (non-concurrent within transaction)
CREATE INDEX IF NOT EXISTS idx_billing_payments_flow ON billing_payments(payment_flow);

-- Basic non-concurrent indexes for essential queries
CREATE INDEX IF NOT EXISTS idx_billing_customers_health_score 
  ON billing_customers(health_score, risk_level);
CREATE INDEX IF NOT EXISTS idx_billing_customers_health_update 
  ON billing_customers(last_health_update);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup 
  ON exchange_rates(from_currency, to_currency, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_payments_currency 
  ON billing_payments(currency, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_payments_provider_status 
  ON billing_payments(payment_provider, status);
CREATE INDEX IF NOT EXISTS idx_billing_payments_error_category 
  ON billing_payments(provider_error_category, created_at) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_subscriptions_mrr_calc 
  ON billing_subscriptions(status, currency, payment_provider) 
  WHERE status IN ('active','trialing','past_due');
CREATE INDEX IF NOT EXISTS idx_regional_calendars_lookup 
  ON regional_calendars(region_code, date, is_weekend, is_holiday);

-- 8. Create materialized view for customer financial summary (corrected per expert)
DROP MATERIALIZED VIEW IF EXISTS mv_customer_financial_summary;

CREATE MATERIALIZED VIEW mv_customer_financial_summary AS
WITH customer_subscriptions AS (
  SELECT 
    bs.customer_id,
    bs.id AS subscription_id,
    pi.display_name AS plan_name,
    bs.status AS subscription_status,
    bs.amount_cents,
    bs.currency,
    bs.payment_provider,
    COALESCE(bs.billing_interval, 
      CASE WHEN pi.item_type = 'subscription' THEN 'month' ELSE NULL END
    ) AS billing_interval,
    bs.created_at AS subscription_start,
    CASE 
      WHEN COALESCE(bs.billing_interval, 
        CASE WHEN pi.item_type = 'subscription' THEN 'month' ELSE NULL END
      ) = 'year' THEN bs.current_period_end
      WHEN COALESCE(bs.billing_interval,
        CASE WHEN pi.item_type = 'subscription' THEN 'month' ELSE NULL END
      ) = 'month' THEN bs.current_period_end
      ELSE bs.current_period_end
    END AS next_billing_date
  FROM billing_subscriptions bs
  JOIN pricing_items pi ON pi.id = bs.pricing_item_id
  WHERE bs.status IN ('active','trialing','past_due')
),
customer_payments AS (
  SELECT 
    bp.customer_id,
    COUNT(*) AS total_payments,
    COUNT(*) FILTER (WHERE bp.status = 'succeeded') AS successful_payments,
    COUNT(*) FILTER (WHERE bp.status = 'failed') AS failed_payments,
    MAX(bp.created_at) AS last_payment_attempt,
    SUM(bp.amount_cents) FILTER (WHERE bp.status = 'succeeded') AS total_paid_cents
  FROM billing_payments bp
  WHERE bp.created_at >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY bp.customer_id
),
customer_usage AS (
  -- Sum ledger deltas; positive=credits, negative=consumption
  SELECT 
    l.user_id AS customer_id,
    SUM(CASE WHEN l.seconds_delta < 0 THEN -l.seconds_delta ELSE 0 END) AS total_time_consumed,
    SUM(l.seconds_delta) AS net_seconds_remaining
  FROM ai_time_ledger l
  WHERE l.occurred_at >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY l.user_id
),
recent_activity AS (
  SELECT 
    u.id AS customer_id,
    COALESCE(u.last_sign_in_at, u.updated_at) AS last_activity
  FROM auth.users u
)
SELECT 
  bc.id AS customer_id,
  bc.user_id,
  bc.payment_provider,
  bc.provider_customer_id,
  bc.email,
  u.created_at AS customer_since,

  -- Subscription (latest active/trialing/past_due)
  cs.subscription_id,
  cs.plan_name,
  cs.subscription_status,
  cs.amount_cents AS subscription_amount_cents,
  cs.currency,
  cs.payment_provider AS subscription_provider,
  cs.next_billing_date,

  -- Payments
  COALESCE(cp.total_payments, 0) AS total_payments,
  COALESCE(cp.successful_payments, 0) AS successful_payments,
  COALESCE(cp.failed_payments, 0) AS failed_payments,
  cp.last_payment_attempt,
  COALESCE(cp.total_paid_cents, 0) AS total_paid_cents,

  -- Usage / balance
  COALESCE(cu.total_time_consumed, 0) AS total_time_consumed,
  COALESCE(cu.net_seconds_remaining, 0) AS remaining_time_seconds,

  -- Activity
  ra.last_activity,

  -- Health
  bc.health_score,
  bc.risk_level,
  bc.health_factors,

  -- Risk indicators
  (COALESCE(cp.failed_payments,0) >= 3
   OR (COALESCE(cp.failed_payments,0) >= 2 AND cp.last_payment_attempt > CURRENT_DATE - INTERVAL '30 days')) AS has_payment_risk,

  (COALESCE(cu.net_seconds_remaining,0) <= 0
   OR COALESCE(cu.net_seconds_remaining,0) < 3600) AS low_balance_risk,

  (ra.last_activity IS NOT NULL AND ra.last_activity < CURRENT_DATE - INTERVAL '30 days') AS inactive_risk

FROM billing_customers bc
JOIN auth.users u ON u.id = bc.user_id
LEFT JOIN customer_subscriptions cs ON cs.customer_id = bc.id
LEFT JOIN customer_payments cp ON cp.customer_id = bc.id
LEFT JOIN customer_usage cu ON cu.customer_id = bc.user_id
LEFT JOIN recent_activity ra ON ra.customer_id = bc.user_id;

-- Create unique index for concurrent refresh support
CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_financial_summary_unique 
  ON mv_customer_financial_summary(customer_id);

-- Initial refresh of the materialized view
REFRESH MATERIALIZED VIEW mv_customer_financial_summary;

COMMIT;

-- NOTE: For better performance in production, run 076b_admin_billing_phase_a_concurrent_indexes.sql
-- separately to create indexes CONCURRENTLY without blocking table access.