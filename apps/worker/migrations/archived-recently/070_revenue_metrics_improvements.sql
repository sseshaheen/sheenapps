-- =====================================================
-- Migration: Revenue Metrics System Improvements
-- Description: Follow-up fixes for revenue metrics system
-- Author: System
-- Date: 2025-01-03
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Add Exchange Rate Constraint
-- =====================================================
ALTER TABLE exchange_rates
ADD CONSTRAINT chk_rate_positive CHECK (rate > 0);

-- =====================================================
-- 2. Add Unique Indexes for REFRESH CONCURRENTLY
-- =====================================================

-- Unique index for monthly revenue history (one row per month)
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_rev_unique
  ON mv_monthly_revenue_history (month);

-- Unique index for customer LTV summary (one row per customer)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ltv_unique
  ON mv_customer_ltv_summary (customer_id);

-- =====================================================
-- 3. Fix REFRESH Function - Remove CONCURRENTLY
-- =====================================================
-- REFRESH CONCURRENTLY cannot be used inside transactions/functions
-- We'll create two versions: one for functions, one for standalone

-- Drop and recreate the function without CONCURRENTLY
CREATE OR REPLACE FUNCTION refresh_revenue_metrics()
RETURNS void AS $$
BEGIN
  -- Refresh in dependency order (without CONCURRENTLY for use in functions)
  REFRESH MATERIALIZED VIEW mv_mrr_by_currency;
  REFRESH MATERIALIZED VIEW mv_mrr_usd_normalized;
  REFRESH MATERIALIZED VIEW mv_customer_ltv_summary;
  REFRESH MATERIALIZED VIEW mv_monthly_revenue_history;
  REFRESH MATERIALIZED VIEW mv_arpu_metrics;
  
  -- Log the refresh
  INSERT INTO system_logs (log_type, message, details)
  VALUES ('info', 'Revenue metrics views refreshed', jsonb_build_object(
    'timestamp', NOW(),
    'function', 'refresh_revenue_metrics'
  ));
END;
$$ LANGUAGE plpgsql;

-- Create a separate function for getting refresh commands (for cron jobs)
CREATE OR REPLACE FUNCTION get_revenue_metrics_refresh_commands()
RETURNS TABLE(refresh_command text) AS $$
BEGIN
  RETURN QUERY
  SELECT 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_by_currency;'::text
  UNION ALL
  SELECT 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_usd_normalized;'::text
  UNION ALL
  SELECT 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_ltv_summary;'::text
  UNION ALL
  SELECT 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_revenue_history;'::text
  UNION ALL
  SELECT 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_arpu_metrics;'::text;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_revenue_metrics_refresh_commands() IS 
'Returns REFRESH CONCURRENTLY commands for external execution by cron jobs';

-- =====================================================
-- 4. Fix Customer LTV View with Explicit Numeric Types
-- =====================================================
DROP MATERIALIZED VIEW IF EXISTS mv_customer_ltv_summary CASCADE;

CREATE MATERIALIZED VIEW mv_customer_ltv_summary AS
WITH customer_revenue AS (
  SELECT
    bc.user_id,
    bc.id as customer_id,
    bc.created_at as customer_since,
    COALESCE(SUM(
      CASE 
        WHEN bp.status = 'succeeded' THEN bp.amount_cents 
        ELSE 0 
      END
    ), 0) AS total_revenue_cents,
    COUNT(DISTINCT bi.id) AS total_invoices,
    MAX(
      CASE 
        WHEN bp.status = 'succeeded' THEN bp.created_at
        ELSE NULL
      END
    ) AS last_payment_date,
    MIN(
      CASE 
        WHEN bp.status = 'succeeded' THEN bp.created_at
        ELSE NULL
      END
    ) AS first_payment_date
  FROM billing_customers bc
  LEFT JOIN billing_invoices bi ON bi.customer_id = bc.id
  LEFT JOIN billing_payments bp ON bp.customer_id = bc.id
  GROUP BY bc.user_id, bc.id, bc.created_at
),
subscription_info AS (
  SELECT
    bs.customer_id,
    MAX(
      CASE 
        WHEN bs.status IN ('active', 'trialing') THEN 1
        ELSE 0
      END
    ) as is_active
  FROM billing_subscriptions bs
  GROUP BY bs.customer_id
)
SELECT
  cr.user_id,
  cr.customer_id,
  cr.total_revenue_cents,
  -- Use explicit numeric casting for date calculations
  ((CURRENT_DATE - cr.customer_since::date)::numeric / 30.44)::numeric as customer_months,
  
  -- Calculate LTV with explicit numeric types
  CASE
    WHEN ((CURRENT_DATE - cr.customer_since::date)::numeric / 30.44) > 0 THEN
      (cr.total_revenue_cents / GREATEST(((CURRENT_DATE - cr.customer_since::date)::numeric / 30.44), 1::numeric)) * 
      CASE 
        WHEN si.is_active = 1 THEN 24::numeric  -- Active: expect 24 months
        ELSE 12::numeric                         -- Inactive: use 12 months
      END
    ELSE cr.total_revenue_cents
  END::BIGINT as estimated_ltv_cents,
  
  cr.last_payment_date,
  cr.first_payment_date,
  si.is_active,
  cr.total_invoices,
  NOW() as calculated_at
FROM customer_revenue cr
LEFT JOIN subscription_info si ON si.customer_id = cr.customer_id;

-- Re-add the unique index for CONCURRENTLY refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_ltv_unique
  ON mv_customer_ltv_summary (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_ltv_user 
ON mv_customer_ltv_summary (user_id);

CREATE INDEX IF NOT EXISTS idx_customer_ltv_active 
ON mv_customer_ltv_summary (is_active);

-- =====================================================
-- 5. Refresh All Views After Changes
-- =====================================================
-- Run these as separate statements (not in transaction)
-- These will be executed after the migration transaction commits

-- Note: The following commands should be run separately after this migration:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_by_currency;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_usd_normalized;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_ltv_summary;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_revenue_history;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_arpu_metrics;

COMMIT;

-- =====================================================
-- Post-Migration Commands (run these separately)
-- =====================================================
-- After the transaction commits, run these commands individually:

REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_by_currency;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_usd_normalized;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_ltv_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_revenue_history;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_arpu_metrics;