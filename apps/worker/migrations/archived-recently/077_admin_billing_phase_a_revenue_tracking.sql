-- Admin Billing Enhancement Phase A2: Multi-Currency Enhanced Revenue Tracking
-- Date: September 2, 2025
-- Purpose: Expert-validated MRR/ARR tracking across USD/EUR/GBP/EGP/SAR with provider attribution
-- UPDATED: Fixed numeric division, canceled_at column, provider-agnostic LTV

BEGIN;

-- 1. Multi-Currency MRR View (Expert-corrected: numeric division to avoid truncation)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_mrr_by_currency AS
SELECT
  CURRENT_DATE AS as_of_date,
  bs.currency,
  bs.payment_provider,
  SUM(
    CASE 
      WHEN COALESCE(bs.billing_interval, CASE WHEN pi.item_type = 'subscription' THEN 'month' END) = 'month' 
        THEN bs.amount_cents::numeric
      WHEN COALESCE(bs.billing_interval, CASE WHEN pi.item_type = 'subscription' THEN 'month' END) = 'year' 
        THEN bs.amount_cents::numeric / 12.0
      ELSE bs.amount_cents::numeric -- default to monthly
    END
  )::integer AS mrr_cents, -- Cast back to integer for final storage
  COUNT(DISTINCT bs.customer_id) AS active_subscribers
FROM billing_subscriptions bs
JOIN pricing_items pi ON pi.id = bs.pricing_item_id
WHERE bs.status IN ('active', 'trialing', 'past_due')  -- exclude canceled/paused
GROUP BY bs.currency, bs.payment_provider;

-- Create unique index for concurrent refresh (expert recommendation)
CREATE UNIQUE INDEX IF NOT EXISTS ux_mrr_by_currency_unique ON mv_mrr_by_currency(as_of_date, currency, payment_provider);

-- 2. USD Normalized MRR View (Executive reporting with time-aware exchange rates)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_mrr_usd_normalized AS
WITH base AS (
  SELECT * FROM mv_mrr_by_currency
),
rates AS (
  SELECT DISTINCT ON (from_currency)
         from_currency, rate
  FROM exchange_rates
  WHERE to_currency = 'USD'
    AND effective_date <= date_trunc('month', CURRENT_DATE)
  ORDER BY from_currency, effective_date DESC
)
SELECT
  CURRENT_DATE AS as_of_date,
  SUM(
    CASE b.currency
      WHEN 'USD' THEN b.mrr_cents::numeric
      ELSE b.mrr_cents::numeric * COALESCE(r.rate, 1.0)
    END
  )::integer AS total_mrr_usd_cents,
  SUM(b.active_subscribers) AS total_subscribers,
  
  -- Currency breakdown (with numeric precision)
  SUM(CASE WHEN b.currency = 'USD' THEN b.mrr_cents ELSE 0 END) as usd_mrr_cents,
  (SUM(CASE WHEN b.currency = 'EUR' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as eur_mrr_usd_cents,
  (SUM(CASE WHEN b.currency = 'GBP' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as gbp_mrr_usd_cents,
  (SUM(CASE WHEN b.currency = 'EGP' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as egp_mrr_usd_cents,
  (SUM(CASE WHEN b.currency = 'SAR' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as sar_mrr_usd_cents,
  
  -- Provider breakdown (USD normalized with numeric precision)
  (SUM(CASE WHEN b.payment_provider = 'stripe' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as stripe_mrr_usd_cents,
  (SUM(CASE WHEN b.payment_provider = 'fawry' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as fawry_mrr_usd_cents,
  (SUM(CASE WHEN b.payment_provider = 'paymob' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as paymob_mrr_usd_cents,
  (SUM(CASE WHEN b.payment_provider = 'stcpay' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as stcpay_mrr_usd_cents,
  (SUM(CASE WHEN b.payment_provider = 'paytabs' THEN b.mrr_cents::numeric * COALESCE(r.rate, 1.0) ELSE 0 END))::integer as paytabs_mrr_usd_cents
  
FROM base b
LEFT JOIN rates r ON r.from_currency = b.currency;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS ux_mrr_usd_normalized_unique ON mv_mrr_usd_normalized(as_of_date);

-- 3. Package Revenue Daily View (NOT included in MRR, expert-corrected join chain)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_package_revenue_daily AS
SELECT 
  DATE(bp.created_at) AS revenue_date,
  bp.currency,
  bp.payment_provider,
  SUM(bp.amount_cents) AS package_revenue_cents,
  COUNT(*) AS package_purchases,
  COUNT(DISTINCT bp.customer_id) AS unique_customers,
  AVG(bp.amount_cents)::integer AS avg_package_amount_cents
FROM billing_payments bp
JOIN billing_invoices bi ON bi.id = bp.invoice_id
JOIN pricing_items pi ON pi.id = bi.pricing_item_id
WHERE bp.status = 'succeeded'
  AND pi.item_type = 'package'
  AND bp.created_at >= CURRENT_DATE - INTERVAL '18 months'
GROUP BY DATE(bp.created_at), bp.currency, bp.payment_provider;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS ux_package_revenue_unique ON mv_package_revenue_daily(revenue_date, currency, payment_provider);

-- 4. Monthly revenue history view for trending and cohort analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_revenue_history AS
WITH monthly_cohorts AS (
  SELECT 
    DATE_TRUNC('month', bs.created_at) as cohort_month,
    bs.currency,
    bs.payment_provider,
    COUNT(DISTINCT bs.customer_id) as new_subscribers,
    SUM(
      CASE 
        WHEN COALESCE(bs.billing_interval, CASE WHEN pi.item_type = 'subscription' THEN 'month' END) = 'month' 
          THEN bs.amount_cents::numeric
        WHEN COALESCE(bs.billing_interval, CASE WHEN pi.item_type = 'subscription' THEN 'month' END) = 'year' 
          THEN bs.amount_cents::numeric / 12.0
        ELSE bs.amount_cents::numeric
      END
    )::integer as new_mrr_cents
  FROM billing_subscriptions bs
  JOIN pricing_items pi ON pi.id = bs.pricing_item_id
  WHERE bs.created_at >= CURRENT_DATE - INTERVAL '24 months'
  GROUP BY DATE_TRUNC('month', bs.created_at), bs.currency, bs.payment_provider
),
monthly_churn AS (
  SELECT 
    DATE_TRUNC('month', bs.canceled_at) as churn_month,  -- Fixed: canceled_at not ended_at
    bs.currency,
    bs.payment_provider,
    COUNT(DISTINCT bs.customer_id) as churned_subscribers,
    SUM(
      CASE 
        WHEN COALESCE(bs.billing_interval, CASE WHEN pi.item_type = 'subscription' THEN 'month' END) = 'month' 
          THEN bs.amount_cents::numeric
        WHEN COALESCE(bs.billing_interval, CASE WHEN pi.item_type = 'subscription' THEN 'month' END) = 'year' 
          THEN bs.amount_cents::numeric / 12.0
        ELSE bs.amount_cents::numeric
      END
    )::integer as churned_mrr_cents
  FROM billing_subscriptions bs
  JOIN pricing_items pi ON pi.id = bs.pricing_item_id
  WHERE bs.canceled_at IS NOT NULL   -- Fixed: canceled_at not ended_at
    AND bs.canceled_at >= CURRENT_DATE - INTERVAL '24 months'
  GROUP BY DATE_TRUNC('month', bs.canceled_at), bs.currency, bs.payment_provider
)
SELECT 
  mc.cohort_month as month_date,
  mc.currency,
  mc.payment_provider,
  mc.new_subscribers,
  mc.new_mrr_cents,
  COALESCE(ch.churned_subscribers, 0) as churned_subscribers,
  COALESCE(ch.churned_mrr_cents, 0) as churned_mrr_cents,
  mc.new_mrr_cents - COALESCE(ch.churned_mrr_cents, 0) as net_mrr_change_cents
FROM monthly_cohorts mc
LEFT JOIN monthly_churn ch ON ch.churn_month = mc.cohort_month 
  AND ch.currency = mc.currency 
  AND ch.payment_provider = mc.payment_provider
ORDER BY mc.cohort_month DESC, mc.currency, mc.payment_provider;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS ux_monthly_revenue_history_unique ON mv_monthly_revenue_history(month_date, currency, payment_provider);

-- 5. Provider performance metrics (multi-provider specific)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_provider_performance AS
WITH payment_stats AS (
  SELECT 
    bp.payment_provider,
    bp.currency,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN bp.status = 'succeeded' THEN 1 ELSE 0 END) as successful_payments,
    SUM(CASE WHEN bp.status = 'failed' THEN 1 ELSE 0 END) as failed_payments,
    SUM(CASE WHEN bp.status = 'succeeded' THEN bp.amount_cents ELSE 0 END) as successful_amount_cents,
    AVG(CASE WHEN bp.status = 'succeeded' THEN bp.amount_cents ELSE NULL END)::integer as avg_successful_amount_cents
  FROM billing_payments bp
  WHERE bp.created_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY bp.payment_provider, bp.currency
),
error_breakdown AS (
  SELECT 
    bp.payment_provider,
    bp.currency,
    bp.provider_error_category,
    COUNT(*) as error_count
  FROM billing_payments bp
  WHERE bp.status = 'failed' 
    AND bp.created_at >= CURRENT_DATE - INTERVAL '30 days'
    AND bp.provider_error_category IS NOT NULL
  GROUP BY bp.payment_provider, bp.currency, bp.provider_error_category
)
SELECT 
  ps.payment_provider,
  ps.currency,
  ps.total_attempts,
  ps.successful_payments,
  ps.failed_payments,
  ROUND(
    (ps.successful_payments::numeric / NULLIF(ps.total_attempts, 0)) * 100, 2
  )::numeric as success_rate_pct,
  ps.successful_amount_cents,
  ps.avg_successful_amount_cents,
  
  -- Top error category for this provider/currency
  (
    SELECT eb.provider_error_category
    FROM error_breakdown eb
    WHERE eb.payment_provider = ps.payment_provider 
      AND eb.currency = ps.currency
    ORDER BY eb.error_count DESC
    LIMIT 1
  ) as top_error_category,
  
  (
    SELECT eb.error_count
    FROM error_breakdown eb
    WHERE eb.payment_provider = ps.payment_provider 
      AND eb.currency = ps.currency
    ORDER BY eb.error_count DESC
    LIMIT 1
  ) as top_error_count

FROM payment_stats ps;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_performance_unique ON mv_provider_performance(payment_provider, currency);

-- 6. Customer lifetime value calculation view (Provider-agnostic per expert)
DROP MATERIALIZED VIEW IF EXISTS mv_customer_ltv_summary;

CREATE MATERIALIZED VIEW mv_customer_ltv_summary AS
SELECT 
  bc.id AS customer_id,
  bc.provider_customer_id,  -- Fixed: provider-agnostic
  bc.payment_provider,       -- Fixed: provider-agnostic
  
  -- Subscription value
  bs.currency AS primary_currency,
  bs.payment_provider AS primary_subscription_provider,
  COALESCE(bs.amount_cents, 0) AS monthly_subscription_cents,
  
  -- Historical spend
  SUM(CASE WHEN bp.status = 'succeeded' THEN bp.amount_cents ELSE 0 END) AS total_spent_cents,
  COUNT(*) FILTER (WHERE bp.status = 'succeeded') AS successful_transactions,
  MIN(bp.created_at) AS first_payment_date,
  MAX(bp.created_at) AS last_payment_date,
  
  -- Tenure calculation (with numeric precision)
  EXTRACT(EPOCH FROM (COALESCE(MAX(bp.created_at), NOW()) - MIN(bp.created_at))) / (30.44 * 24 * 3600) AS tenure_months,
  
  -- Simple LTV estimate (with numeric precision to avoid truncation)
  CASE 
    WHEN MIN(bp.created_at) IS NOT NULL AND MAX(bp.created_at) > MIN(bp.created_at) THEN
      (SUM(CASE WHEN bp.status = 'succeeded' THEN bp.amount_cents ELSE 0 END)::numeric) /
      GREATEST(EXTRACT(EPOCH FROM (MAX(bp.created_at) - MIN(bp.created_at))) / (30.44 * 24 * 3600), 1) * 12.0
    ELSE COALESCE(bs.amount_cents, 0)::numeric * 12.0
  END::integer AS estimated_annual_ltv_cents

FROM billing_customers bc
LEFT JOIN billing_subscriptions bs 
  ON bs.customer_id = bc.id AND bs.status IN ('active', 'trialing', 'past_due')
LEFT JOIN billing_payments bp ON bp.customer_id = bc.id
GROUP BY bc.id, bc.provider_customer_id, bc.payment_provider, 
         bs.currency, bs.payment_provider, bs.amount_cents;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_ltv_summary_unique ON mv_customer_ltv_summary(customer_id);

COMMIT;

-- ============================================================================
-- Initial materialized view refresh
-- For production: Use REFRESH MATERIALIZED VIEW CONCURRENTLY in scheduled jobs
-- ============================================================================

-- First refresh must be non-concurrent (no data exists yet)
REFRESH MATERIALIZED VIEW mv_mrr_by_currency;
REFRESH MATERIALIZED VIEW mv_mrr_usd_normalized;
REFRESH MATERIALIZED VIEW mv_package_revenue_daily;
REFRESH MATERIALIZED VIEW mv_monthly_revenue_history;
REFRESH MATERIALIZED VIEW mv_provider_performance;
REFRESH MATERIALIZED VIEW mv_customer_ltv_summary;

-- Future refreshes in scheduled jobs should use:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mrr_by_currency;
-- etc.