-- Migration 111: RLS Security Fixes
-- Addresses issues found during security review of migrations 109 and 110
--
-- Issues Fixed:
-- 1. Payment events: Service role can update ANY event (should restrict to pending)
-- 2. Analytics users: Service role has FOR ALL bypassing project isolation

BEGIN;

-- =============================================================================
-- FIX 1: Payment Events - Restrict UPDATE to pending events only
-- =============================================================================
-- The service role should only be able to update events that are still pending.
-- Once an event is processed or failed, it should be immutable via RLS.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS inhouse_payment_events_service_update ON public.inhouse_payment_events;

-- Create restrictive policy: can only update pending events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_payment_events_service_update_pending') THEN
    CREATE POLICY inhouse_payment_events_service_update_pending
      ON public.inhouse_payment_events
      FOR UPDATE
      USING (status = 'pending')
      WITH CHECK (status IN ('processed', 'failed'));
  END IF;
END $$;

-- =============================================================================
-- FIX 2: Analytics Users - Split FOR ALL into specific operations
-- =============================================================================
-- The service role should be able to INSERT and UPDATE, but reads should go
-- through the owner policy to maintain project isolation.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS inhouse_analytics_users_service_all ON public.inhouse_analytics_users;

-- Create specific policies for INSERT and UPDATE only
DO $$
BEGIN
  -- Service role can insert new user profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_analytics_users_service_insert') THEN
    CREATE POLICY inhouse_analytics_users_service_insert
      ON public.inhouse_analytics_users
      FOR INSERT
      WITH CHECK (true);
  END IF;

  -- Service role can update existing user profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_analytics_users_service_update') THEN
    CREATE POLICY inhouse_analytics_users_service_update
      ON public.inhouse_analytics_users
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Note: Reads still go through the owner policy which enforces project isolation

COMMIT;
