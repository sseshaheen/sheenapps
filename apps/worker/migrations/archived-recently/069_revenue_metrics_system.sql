-- Migration 069: Revenue Metrics System
-- Creates materialized views and functions for MRR, LTV, ARPU calculations
-- Implements the revenue analytics system needed by the admin panel

BEGIN;

-- =====================================================
-- Exchange Rate Table (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL DEFAULT 'USD',
  rate DECIMAL(10,6) NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, effective_date)
);

-- Insert default exchange rates (as of Jan 2025)
-- NOTE: These are initial rates only. Run updateExchangeRates job daily for current rates
-- Or integrate with your payment provider's exchange rate API
INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source) 
VALUES 
  ('USD', 'USD', 1.000000, CURRENT_DATE, 'system'),
  ('EUR', 'USD', 1.040000, CURRENT_DATE, 'initial'),  -- ~0.96 EUR per USD
  ('GBP', 'USD', 1.250000, CURRENT_DATE, 'initial'),  -- ~0.80 GBP per USD
  ('EGP', 'USD', 0.020000, CURRENT_DATE, 'initial'),  -- ~50 EGP per USD
  ('SAR', 'USD', 0.266000, CURRENT_DATE, 'initial'),  -- ~3.75 SAR per USD
  ('AED', 'USD', 0.272000, CURRENT_DATE, 'initial'),  -- ~3.67 AED per USD
  ('CAD', 'USD', 0.700000, CURRENT_DATE, 'initial'),  -- ~1.43 CAD per USD
  ('AUD', 'USD', 0.630000, CURRENT_DATE, 'initial')   -- ~1.59 AUD per USD
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- =====================================================
-- MRR by Currency Materialized View
-- =====================================================
-- Drop dependent views first to avoid dependency errors
DROP MATERIALIZED VIEW IF EXISTS mv_mrr_usd_normalized CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_mrr_by_currency CASCADE;

-- Now create with the correct schema
CREATE MATERIALIZED VIEW mv_mrr_by_currency AS
SELECT
  CURRENT_DATE AS as_of_date,
  currency,
  payment_provider,
  item_key as plan_name,
  COUNT(DISTINCT customer_id) AS active_subscribers,
  SUM(
    CASE 
      WHEN billing_interval = 'year' THEN amount_cents / 12.0
      WHEN billing_interval = 'quarter' THEN amount_cents / 3.0
      ELSE amount_cents -- monthly
    END
  )::BIGINT AS mrr_cents,
  SUM(
    CASE 
      WHEN billing_interval = 'year' THEN amount_cents
      WHEN billing_interval = 'quarter' THEN amount_cents * 4
      ELSE amount_cents * 12 -- monthly to yearly
    END
  )::BIGINT AS arr_cents
FROM (
  SELECT
    bs.id,
    bs.customer_id,
    bs.pricing_item_id,
    bs.amount_cents,
    bs.currency,
    bs.status,
    bs.current_period_start,
    bs.current_period_end,
    COALESCE(bs.payment_provider, 'stripe') as payment_provider,
    COALESCE(bs.billing_interval, 'month') as billing_interval,
    pi.item_key,
    bc.user_id
  FROM billing_subscriptions bs
  JOIN pricing_items pi ON pi.id = bs.pricing_item_id
  JOIN billing_customers bc ON bc.id = bs.customer_id
  WHERE bs.status IN ('active', 'trialing')
    AND (bs.canceled_at IS NULL OR bs.canceled_at > CURRENT_DATE)
) active_subs
GROUP BY currency, payment_provider, item_key;

-- Create unique index for concurrent refresh capability
CREATE UNIQUE INDEX idx_mrr_by_currency_unique 
ON mv_mrr_by_currency (as_of_date, currency, payment_provider, plan_name);

-- =====================================================
-- MRR USD Normalized View
-- =====================================================
-- Recreate since it depends on mv_mrr_by_currency
CREATE MATERIALIZED VIEW mv_mrr_usd_normalized AS
WITH latest_rates AS (
  SELECT DISTINCT ON (from_currency)
    from_currency,
    rate
  FROM exchange_rates
  WHERE to_currency = 'USD'
    AND effective_date <= CURRENT_DATE
  ORDER BY from_currency, effective_date DESC
),
mrr_data AS (
  SELECT * FROM mv_mrr_by_currency
)
SELECT
  CURRENT_DATE AS as_of_date,
  -- Total metrics
  SUM(
    m.mrr_cents * COALESCE(r.rate, 1.0)
  )::BIGINT AS total_mrr_usd_cents,
  SUM(
    m.arr_cents * COALESCE(r.rate, 1.0)
  )::BIGINT AS total_arr_usd_cents,
  SUM(m.active_subscribers) AS total_subscribers,
  
  -- MRR by plan
  jsonb_object_agg(
    m.plan_name, 
    (m.mrr_cents * COALESCE(r.rate, 1.0))::BIGINT
  ) FILTER (WHERE m.plan_name IS NOT NULL) AS mrr_by_plan,
  
  -- MRR by gateway
  jsonb_object_agg(
    m.payment_provider,
    (m.mrr_cents * COALESCE(r.rate, 1.0))::BIGINT
  ) FILTER (WHERE m.payment_provider IS NOT NULL) AS mrr_by_gateway,
  
  -- MRR by currency (original)
  jsonb_object_agg(
    m.currency,
    m.mrr_cents::BIGINT
  ) FILTER (WHERE m.currency IS NOT NULL) AS mrr_by_currency_native,
  
  -- Subscribers by plan
  jsonb_object_agg(
    m.plan_name || '_subscribers',
    m.active_subscribers
  ) FILTER (WHERE m.plan_name IS NOT NULL) AS subscribers_by_plan
  
FROM mrr_data m
LEFT JOIN latest_rates r ON r.from_currency = m.currency
GROUP BY as_of_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mrr_usd_normalized_date 
ON mv_mrr_usd_normalized (as_of_date);

-- =====================================================
-- Customer LTV Summary
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
    COUNT(DISTINCT CASE WHEN bp.status = 'succeeded' THEN bp.id END) AS successful_payments,
    MAX(bp.created_at) AS last_payment_date,
    MIN(bp.created_at) AS first_payment_date
  FROM billing_customers bc
  LEFT JOIN billing_invoices bi ON bi.customer_id = bc.id
  LEFT JOIN billing_payments bp ON bp.invoice_id = bi.id
  GROUP BY bc.user_id, bc.id, bc.created_at
),
subscription_info AS (
  SELECT
    customer_id,
    MAX(amount_cents) as current_subscription_value,
    MAX(
      CASE 
        WHEN status IN ('active', 'trialing') THEN 1 
        ELSE 0 
      END
    ) as is_active
  FROM billing_subscriptions
  GROUP BY customer_id
),
churn_probability AS (
  -- Simple churn probability based on payment history
  SELECT
    customer_id,
    CASE
      WHEN last_payment_date < CURRENT_DATE - INTERVAL '60 days' THEN 0.8
      WHEN last_payment_date < CURRENT_DATE - INTERVAL '30 days' THEN 0.5
      ELSE 0.2
    END as churn_risk
  FROM customer_revenue
)
SELECT
  cr.user_id,
  cr.customer_id,
  cr.total_revenue_cents,
  (CURRENT_DATE - cr.customer_since::DATE) / 30.44 as customer_months,
  
  -- Calculate LTV (simplified: total revenue / months * expected lifetime months)
  CASE
    WHEN (CURRENT_DATE - cr.customer_since::DATE) / 30.44 > 0 THEN
      (cr.total_revenue_cents / GREATEST((CURRENT_DATE - cr.customer_since::DATE) / 30.44, 1)) * 
      CASE 
        WHEN cp.churn_risk < 0.3 THEN 24  -- Expected 24 month lifetime
        WHEN cp.churn_risk < 0.6 THEN 12  -- Expected 12 month lifetime
        ELSE 6                             -- Expected 6 month lifetime
      END
    ELSE si.current_subscription_value * 12 -- New customer, use annual value
  END::BIGINT as estimated_ltv_cents,
  
  si.current_subscription_value,
  si.is_active,
  cp.churn_risk,
  cr.last_payment_date,
  cr.successful_payments,
  cr.total_invoices
  
FROM customer_revenue cr
LEFT JOIN subscription_info si ON si.customer_id = cr.customer_id
LEFT JOIN churn_probability cp ON cp.customer_id = cr.customer_id;

CREATE INDEX IF NOT EXISTS idx_customer_ltv_user_id ON mv_customer_ltv_summary (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_ltv_active ON mv_customer_ltv_summary (is_active);

-- =====================================================
-- Monthly Revenue History (for growth calculations)
-- =====================================================
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_revenue_history CASCADE;
CREATE MATERIALIZED VIEW mv_monthly_revenue_history AS
WITH monthly_mrr AS (
  SELECT
    DATE_TRUNC('month', bs.created_at) as month,
    bs.currency,
    SUM(
      CASE 
        WHEN COALESCE(bs.billing_interval, 'month') = 'year' THEN bs.amount_cents / 12.0
        WHEN COALESCE(bs.billing_interval, 'month') = 'quarter' THEN bs.amount_cents / 3.0
        ELSE bs.amount_cents
      END
    )::BIGINT AS mrr_cents,
    COUNT(DISTINCT bs.customer_id) AS subscribers
  FROM billing_subscriptions bs
  WHERE bs.status IN ('active', 'trialing')
  GROUP BY DATE_TRUNC('month', bs.created_at), bs.currency
),
currency_normalized AS (
  SELECT
    m.month,
    SUM(m.mrr_cents * COALESCE(e.rate, 1.0))::BIGINT as mrr_usd_cents,
    SUM(m.subscribers) as total_subscribers
  FROM monthly_mrr m
  LEFT JOIN LATERAL (
    SELECT rate 
    FROM exchange_rates 
    WHERE from_currency = m.currency 
      AND to_currency = 'USD'
      AND effective_date <= m.month
    ORDER BY effective_date DESC
    LIMIT 1
  ) e ON true
  GROUP BY m.month
)
SELECT
  month,
  mrr_usd_cents,
  total_subscribers,
  LAG(mrr_usd_cents, 1) OVER (ORDER BY month) as previous_month_mrr,
  CASE
    WHEN LAG(mrr_usd_cents, 1) OVER (ORDER BY month) > 0 THEN
      ((mrr_usd_cents::FLOAT - LAG(mrr_usd_cents, 1) OVER (ORDER BY month)) / 
       LAG(mrr_usd_cents, 1) OVER (ORDER BY month)) * 100
    ELSE NULL
  END as growth_rate_percentage
FROM currency_normalized
ORDER BY month DESC;

CREATE INDEX IF NOT EXISTS idx_monthly_revenue_history_month 
ON mv_monthly_revenue_history (month DESC);

-- =====================================================
-- ARPU Calculations View (Simplified)
-- =====================================================
DROP MATERIALIZED VIEW IF EXISTS mv_arpu_metrics CASCADE;
CREATE MATERIALIZED VIEW mv_arpu_metrics AS
SELECT
  CURRENT_DATE as as_of_date,
  -- Overall ARPU
  (SELECT AVG(monthly_value)::BIGINT FROM (
    SELECT
      CASE 
        WHEN COALESCE(bs.billing_interval, 'month') = 'year' THEN bs.amount_cents / 12.0
        WHEN COALESCE(bs.billing_interval, 'month') = 'quarter' THEN bs.amount_cents / 3.0
        ELSE bs.amount_cents
      END as monthly_value
    FROM billing_subscriptions bs
    WHERE bs.status IN ('active', 'trialing')
      AND (bs.canceled_at IS NULL OR bs.canceled_at > CURRENT_DATE)
  ) t) as overall_arpu_cents,
  
  -- Total customers
  (SELECT COUNT(DISTINCT customer_id) 
   FROM billing_subscriptions 
   WHERE status IN ('active', 'trialing')
     AND (canceled_at IS NULL OR canceled_at > CURRENT_DATE)) as total_customers,
  
  -- ARPU by plan
  (SELECT jsonb_object_agg(item_key, avg_monthly::BIGINT)
   FROM (
     SELECT 
       pi.item_key,
       AVG(
         CASE 
           WHEN COALESCE(bs.billing_interval, 'month') = 'year' THEN bs.amount_cents / 12.0
           WHEN COALESCE(bs.billing_interval, 'month') = 'quarter' THEN bs.amount_cents / 3.0
           ELSE bs.amount_cents
         END
       ) as avg_monthly
     FROM billing_subscriptions bs
     JOIN pricing_items pi ON pi.id = bs.pricing_item_id
     WHERE bs.status IN ('active', 'trialing')
       AND (bs.canceled_at IS NULL OR bs.canceled_at > CURRENT_DATE)
     GROUP BY pi.item_key
   ) plans) as arpu_by_plan,
  
  -- ARPU by country (placeholder - country data not available in auth.users)
  '{}'::jsonb as arpu_by_country;

CREATE UNIQUE INDEX IF NOT EXISTS idx_arpu_metrics_date 
ON mv_arpu_metrics (as_of_date);

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to refresh all revenue metrics views
CREATE OR REPLACE FUNCTION refresh_revenue_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_by_currency;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_usd_normalized;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_ltv_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_revenue_history;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_arpu_metrics;
END;
$$ LANGUAGE plpgsql;

-- Function to get revenue growth metrics
CREATE OR REPLACE FUNCTION get_revenue_growth_metrics()
RETURNS jsonb AS $$
DECLARE
  current_mrr BIGINT;
  previous_mrr BIGINT;
  growth_rate NUMERIC;
  new_mrr BIGINT;
  expansion_mrr BIGINT;
  contraction_mrr BIGINT;
  churn_mrr BIGINT;
BEGIN
  -- Get current and previous month MRR
  SELECT mrr_usd_cents INTO current_mrr
  FROM mv_monthly_revenue_history
  WHERE month = DATE_TRUNC('month', CURRENT_DATE)
  LIMIT 1;
  
  SELECT mrr_usd_cents INTO previous_mrr
  FROM mv_monthly_revenue_history
  WHERE month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
  LIMIT 1;
  
  -- Calculate growth rate
  IF previous_mrr > 0 THEN
    growth_rate := ((current_mrr - previous_mrr)::NUMERIC / previous_mrr) * 100;
  ELSE
    growth_rate := 0;
  END IF;
  
  -- Calculate components (simplified - in production, track actual movements)
  new_mrr := GREATEST((current_mrr - previous_mrr) * 0.4, 0)::BIGINT; -- Estimate 40% from new
  expansion_mrr := GREATEST((current_mrr - previous_mrr) * 0.3, 0)::BIGINT; -- Estimate 30% from expansion
  contraction_mrr := LEAST((current_mrr - previous_mrr) * 0.2, 0)::BIGINT; -- Estimate 20% contraction
  churn_mrr := LEAST((current_mrr - previous_mrr) * 0.1, 0)::BIGINT; -- Estimate 10% churn
  
  RETURN jsonb_build_object(
    'current_mrr', COALESCE(current_mrr, 0),
    'previous_mrr', COALESCE(previous_mrr, 0),
    'growth_rate', COALESCE(growth_rate, 0),
    'new_business', COALESCE(new_mrr, 0),
    'expansion', COALESCE(expansion_mrr, 0),
    'contraction', COALESCE(contraction_mrr, 0),
    'churn', COALESCE(churn_mrr, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON mv_mrr_by_currency TO authenticated;
GRANT SELECT ON mv_mrr_usd_normalized TO authenticated;
GRANT SELECT ON mv_customer_ltv_summary TO authenticated;
GRANT SELECT ON mv_monthly_revenue_history TO authenticated;
GRANT SELECT ON mv_arpu_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_revenue_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_growth_metrics() TO authenticated;

COMMIT;