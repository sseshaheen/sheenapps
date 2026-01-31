-- Migration 113: RLS Role Scoping & Security Fixes
--
-- Addresses security issues in migrations 109, 110, 111:
-- 1. Service policies missing TO service_role (applying to PUBLIC)
-- 2. Payment customers missing updated_at trigger
-- 3. Emails missing to_addresses array constraint
-- 4. Cleanup functions missing search_path lock
--
-- Date: 2026-01-24

BEGIN;

-- =============================================================================
-- FIX 1: Payment Events - Add TO service_role to INSERT policy
-- =============================================================================

DROP POLICY IF EXISTS inhouse_payment_events_service_insert ON public.inhouse_payment_events;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_payment_events_service_insert') THEN
    CREATE POLICY inhouse_payment_events_service_insert
      ON public.inhouse_payment_events
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- FIX 2: Payment Events - Add TO service_role to UPDATE policy
-- =============================================================================

DROP POLICY IF EXISTS inhouse_payment_events_service_update_pending ON public.inhouse_payment_events;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_payment_events_service_update_pending') THEN
    CREATE POLICY inhouse_payment_events_service_update_pending
      ON public.inhouse_payment_events
      FOR UPDATE
      TO service_role
      USING (status = 'pending')
      WITH CHECK (status IN ('processed', 'failed'));
  END IF;
END $$;

-- =============================================================================
-- FIX 3: Analytics Events - Add TO service_role to INSERT policy
-- =============================================================================

DROP POLICY IF EXISTS inhouse_analytics_events_service_insert ON public.inhouse_analytics_events;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_analytics_events_service_insert') THEN
    CREATE POLICY inhouse_analytics_events_service_insert
      ON public.inhouse_analytics_events
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- FIX 4: Analytics Users - Add TO service_role to INSERT policy
-- =============================================================================

DROP POLICY IF EXISTS inhouse_analytics_users_service_insert ON public.inhouse_analytics_users;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_analytics_users_service_insert') THEN
    CREATE POLICY inhouse_analytics_users_service_insert
      ON public.inhouse_analytics_users
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- FIX 5: Analytics Users - Add TO service_role to UPDATE policy
-- =============================================================================

DROP POLICY IF EXISTS inhouse_analytics_users_service_update ON public.inhouse_analytics_users;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_analytics_users_service_update') THEN
    CREATE POLICY inhouse_analytics_users_service_update
      ON public.inhouse_analytics_users
      FOR UPDATE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- FIX 6: Payment Customers - Add missing updated_at trigger
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_inhouse_payment_customers_updated_at'
    AND tgrelid = 'public.inhouse_payment_customers'::regclass
  ) THEN
    CREATE TRIGGER update_inhouse_payment_customers_updated_at
      BEFORE UPDATE ON public.inhouse_payment_customers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- FIX 7: Emails - Add to_addresses array shape constraint
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inhouse_emails_to_addresses_is_array'
    AND conrelid = 'public.inhouse_emails'::regclass
  ) THEN
    ALTER TABLE public.inhouse_emails
      ADD CONSTRAINT chk_inhouse_emails_to_addresses_is_array
      CHECK (jsonb_typeof(to_addresses) = 'array');
  END IF;
END $$;

-- =============================================================================
-- FIX 8: Payment Events Cleanup - Lock down search_path
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_payment_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.inhouse_payment_events
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND status = 'processed';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- =============================================================================
-- FIX 9: Analytics Events Cleanup - Lock down search_path
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_analytics_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.inhouse_analytics_events
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMIT;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON FUNCTION cleanup_old_payment_events() IS 'Removes processed payment events older than 90 days (search_path secured)';
COMMENT ON FUNCTION cleanup_old_analytics_events() IS 'Removes analytics events older than 90 days (search_path secured)';
