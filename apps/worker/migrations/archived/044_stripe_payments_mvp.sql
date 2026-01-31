-- =====================================================
-- Migration 044: Stripe Payments MVP - Security Hardened
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 25, 2025
-- Purpose: Add essential Stripe payment security features for MVP
-- Status: Production-ready security enhancements
--
-- Key Security Features:
-- - Unique active subscription per user (race condition protection)
-- - Webhook deduplication table
-- - Advisory lock functions for concurrency
-- - SECURITY DEFINER functions with proper permissions
-- - Raw event storage for debugging
-- =====================================================

-- Add unique constraint on user_id for billing_customers (race condition protection)
-- This prevents duplicate customer records during concurrent customer creation
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE billing_customers 
    ADD CONSTRAINT billing_customers_user_unique UNIQUE (user_id);
    RAISE NOTICE '✅ Added unique constraint billing_customers_user_unique';
  EXCEPTION 
    WHEN duplicate_object THEN
      RAISE NOTICE 'ℹ️ Constraint billing_customers_user_unique already exists, skipping';
  END;
END $$;

-- =====================================================
-- Webhook Infrastructure
-- =====================================================

-- Webhook deduplication table (prevents duplicate processing)
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  user_id uuid, -- User-centric for MVP (no org complexity)
  correlation_id text,
  processed_at timestamptz DEFAULT now()
);

-- Index for efficient user-based queries
CREATE INDEX IF NOT EXISTS idx_processed_events_user_id 
ON processed_stripe_events (user_id);

-- Index for cleanup operations (TTL-style cleanup)
CREATE INDEX IF NOT EXISTS idx_processed_events_created_at 
ON processed_stripe_events (processed_at);

-- Raw event storage for debugging and replay capabilities
CREATE TABLE IF NOT EXISTS stripe_raw_events (
  id text PRIMARY KEY, -- stripe event id
  payload text NOT NULL, -- raw JSON payload
  received_at timestamptz DEFAULT now()
);

-- Index for debugging queries by timestamp
CREATE INDEX IF NOT EXISTS idx_stripe_raw_events_received_at 
ON stripe_raw_events (received_at);

-- =====================================================
-- CRITICAL: Subscription Race Protection
-- =====================================================

-- Unique active subscription per user (was missing in v2.0!)
-- Prevents multiple active subscriptions during concurrent processing
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_sub_per_user
ON billing_subscriptions (customer_id)
WHERE status IN ('trialing','active','past_due','paused');

-- =====================================================
-- Security-Hardened Database Functions
-- =====================================================

-- Advisory lock function for user-based concurrency control
-- SECURITY DEFINER ensures consistent permissions regardless of caller
CREATE OR REPLACE FUNCTION stripe_lock_user(p_user_id uuid)
RETURNS void 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext('stripe:user')
  );
$$;

-- Comment explaining the security model
COMMENT ON FUNCTION stripe_lock_user(uuid) IS 
'Advisory lock for user-based Stripe operations. SECURITY DEFINER ensures consistent execution regardless of caller permissions.';

-- =====================================================
-- Subscription Management Function
-- =====================================================

-- Security Definer function for safe subscription upserts
-- Validates user existence and handles all subscription updates atomically
CREATE OR REPLACE FUNCTION stripe_upsert_subscription(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_stripe_price_id text,  
  p_plan_name text,
  p_status subscription_status,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_customer_id uuid;
BEGIN
  -- Find customer for user (MVP: user-centric approach)
  SELECT id INTO v_customer_id 
  FROM billing_customers 
  WHERE user_id = p_user_id;
  
  -- Fail fast if customer doesn't exist
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'No customer found for user %', p_user_id
      USING ERRCODE = 'foreign_key_violation',
            DETAIL = 'Customer record must exist before subscription operations',
            HINT = 'Create customer record first using stripe_upsert_customer';
  END IF;
  
  -- Upsert subscription with conflict resolution
  INSERT INTO billing_subscriptions (
    customer_id, stripe_subscription_id, stripe_price_id,
    plan_name, status, current_period_start, current_period_end
  ) VALUES (
    v_customer_id, p_stripe_subscription_id, p_stripe_price_id,
    p_plan_name, p_status, p_current_period_start, p_current_period_end
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    status = EXCLUDED.status,
    plan_name = EXCLUDED.plan_name,
    stripe_price_id = EXCLUDED.stripe_price_id,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();
    
  -- Log the operation (correlation_id for tracing)
  IF p_correlation_id IS NOT NULL THEN
    INSERT INTO processed_stripe_events (stripe_event_id, event_type, user_id, correlation_id)
    VALUES (p_correlation_id || '_sub_upsert', 'subscription.upserted', p_user_id, p_correlation_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Function documentation
COMMENT ON FUNCTION stripe_upsert_subscription(uuid,text,text,text,subscription_status,timestamptz,timestamptz,text) IS 
'Safely upsert subscription data with user validation. SECURITY DEFINER ensures atomic operations and consistent permissions.';

-- =====================================================
-- Payment Recording Function  
-- =====================================================

-- Security Definer function for payment recording
-- Handles both successful and failed payments with proper validation
CREATE OR REPLACE FUNCTION stripe_record_payment(
  p_user_id uuid,
  p_stripe_payment_intent_id text,
  p_amount bigint,
  p_status payment_status,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_customer_id uuid;
BEGIN
  -- Find customer for user
  SELECT id INTO v_customer_id 
  FROM billing_customers 
  WHERE user_id = p_user_id;
  
  -- Validation: customer must exist
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'No customer found for user %', p_user_id
      USING ERRCODE = 'foreign_key_violation',
            DETAIL = 'Customer record required for payment operations';
  END IF;
  
  -- Record payment with conflict resolution
  INSERT INTO billing_payments (
    customer_id, stripe_payment_intent_id, amount, status
  ) VALUES (
    v_customer_id, p_stripe_payment_intent_id, p_amount, p_status
  )
  ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
    status = EXCLUDED.status,
    amount = EXCLUDED.amount,
    updated_at = now();
    
  -- Log the operation for traceability
  IF p_correlation_id IS NOT NULL THEN
    INSERT INTO processed_stripe_events (stripe_event_id, event_type, user_id, correlation_id)
    VALUES (p_correlation_id || '_payment_record', 'payment.recorded', p_user_id, p_correlation_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Function documentation  
COMMENT ON FUNCTION stripe_record_payment(uuid,text,bigint,payment_status,text) IS 
'Record payment transactions with validation. SECURITY DEFINER ensures atomic operations and audit trail.';

-- =====================================================
-- Security: Database Permissions
-- =====================================================

-- Revoke public access to security-sensitive functions
-- Only specific database roles should have access
REVOKE ALL ON FUNCTION stripe_lock_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION stripe_upsert_subscription(uuid,text,text,text,subscription_status,timestamptz,timestamptz,text) FROM PUBLIC;  
REVOKE ALL ON FUNCTION stripe_record_payment(uuid,text,bigint,payment_status,text) FROM PUBLIC;

-- Create worker database role if it doesn't exist
-- This role will be used by the worker application
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_db_role') THEN
    CREATE ROLE worker_db_role;
  END IF;
END
$$;

-- Grant execute permissions to worker role
GRANT EXECUTE ON FUNCTION stripe_lock_user(uuid) TO worker_db_role;
GRANT EXECUTE ON FUNCTION stripe_upsert_subscription(uuid,text,text,text,subscription_status,timestamptz,timestamptz,text) TO worker_db_role;
GRANT EXECUTE ON FUNCTION stripe_record_payment(uuid,text,bigint,payment_status,text) TO worker_db_role;

-- Grant table access to worker role for webhook processing
GRANT SELECT, INSERT ON processed_stripe_events TO worker_db_role;
GRANT SELECT, INSERT ON stripe_raw_events TO worker_db_role;

-- Grant read access to billing tables for status checks
GRANT SELECT ON billing_customers TO worker_db_role;
GRANT SELECT ON billing_subscriptions TO worker_db_role;
GRANT SELECT ON billing_payments TO worker_db_role;

-- =====================================================
-- Data Integrity Comments
-- =====================================================

COMMENT ON TABLE processed_stripe_events IS 
'Webhook deduplication table. Prevents duplicate processing of Stripe events using atomic insert operations.';

COMMENT ON TABLE stripe_raw_events IS 
'Raw Stripe webhook payloads for debugging and replay. Useful for troubleshooting payment issues in production.';

COMMENT ON INDEX uniq_active_sub_per_user IS 
'CRITICAL: Prevents multiple active subscriptions per user. Essential for billing consistency and race condition protection.';

-- =====================================================
-- Migration Complete
-- =====================================================

-- Log successful migration
DO $$ 
BEGIN
  RAISE NOTICE '✅ Migration 044_stripe_payments_mvp.sql completed successfully';
  RAISE NOTICE '📋 Added: Webhook deduplication, unique subscription constraint, security functions';
  RAISE NOTICE '🔒 Security: DEFINER functions with worker_db_role permissions';
  RAISE NOTICE '🚀 Ready for: Stripe webhook processing and payment management';
END
$$;