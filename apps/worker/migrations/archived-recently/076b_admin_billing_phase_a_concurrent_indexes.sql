-- Admin Billing Enhancement Phase A: Concurrent Indexes
-- Date: September 2, 2025
-- Purpose: Performance indexes for Customer 360 queries
--
-- IMPORTANT: 
-- 1. Run this AFTER 076_admin_billing_phase_a_customer_360.sql completes
-- 2. These must be run OUTSIDE a transaction
-- 3. If your migration tool wraps in transactions, run these manually in psql
--
-- To run manually in psql:
-- psql -U your_user -d your_database
-- Then paste each CREATE INDEX command one by one

-- Make sure we're not in a transaction (this will error if we are, which is what we want)
-- If this errors with "ROLLBACK can only be used in transaction blocks", that's good - it means no transaction
ROLLBACK;

-- Customer health indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_customers_health_score 
  ON billing_customers(health_score, risk_level);
  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_customers_health_update 
  ON billing_customers(last_health_update);

-- Exchange rates optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exchange_rates_lookup 
  ON exchange_rates(from_currency, to_currency, effective_date DESC);

-- Payment analytics indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_payments_currency 
  ON billing_payments(currency, created_at);
  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_payments_provider_status 
  ON billing_payments(payment_provider, status);
  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_payments_error_category 
  ON billing_payments(provider_error_category, created_at) WHERE status = 'failed';

-- MRR analytics optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_mrr_calc 
  ON billing_subscriptions(status, currency, payment_provider) 
  WHERE status IN ('active','trialing','past_due');

-- Regional calendar performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_regional_calendars_lookup 
  ON regional_calendars(region_code, date, is_weekend, is_holiday);