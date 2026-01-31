-- Migration: Admin Audit Foundation (Phase A)
-- Creates tables, RLS, indexes, and RPCs for admin action logging, idempotency, and two-person approval
-- Based on expert specifications for comprehensive admin compliance system

BEGIN;

-- =============================================================================
-- 1. HELPER FUNCTIONS
-- =============================================================================

-- is_admin() helper: JWT claims + email allowlist + ban/suspension check
CREATE OR REPLACE FUNCTION public.is_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $is_admin$
  WITH claims AS (
    SELECT coalesce(auth.jwt(), '{}'::jsonb) AS c
  )
  SELECT (
    -- Primary: JWT-based admin claims
    ((c->>'is_admin')::boolean
     OR (c->>'role') IN ('admin','super_admin')
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(coalesce(c->'admin_permissions','[]'::jsonb)) p 
       WHERE p LIKE 'admin.%'
     ))
    -- Fallback: email allowlist (app.admin_emails database setting)
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = p_uid
        AND u.email = ANY (string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ','))
    )
  )
  -- Hard stop: not banned/suspended
  AND NOT EXISTS (
    SELECT 1 FROM public.user_admin_status s
    WHERE s.user_id = p_uid
      AND (s.is_banned = true
           OR (s.is_suspended = true AND coalesce(s.suspended_until, now()) > now()))
  )
  FROM claims;
$is_admin$;

-- =============================================================================
-- 2. ADMIN ACTION LOG TABLE
-- =============================================================================

-- Table: audit trail for all admin actions
CREATE TABLE IF NOT EXISTS public.admin_action_log_app (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   uuid NOT NULL,
  action          text NOT NULL,                -- e.g. 'refund.issue', 'user.suspend.temporary'
  resource_type   text NOT NULL,                -- e.g. 'invoice','user','advisor','ticket'
  resource_id     text,                         -- uuid or external id as text
  reason          text,                         -- "[F02] chargeback risk"
  correlation_id  uuid NOT NULL,
  extra           jsonb NOT NULL DEFAULT '{}',  -- optional: stripe ids, deltas, etc.
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_action_log_app_created 
  ON public.admin_action_log_app (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_app_admin 
  ON public.admin_action_log_app (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_app_corr 
  ON public.admin_action_log_app (correlation_id);

-- RLS: admin-only access
ALTER TABLE public.admin_action_log_app ENABLE ROW LEVEL SECURITY;

DO $policies_aal$
BEGIN
  -- Read policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polname='aal_read' AND polrelid='public.admin_action_log_app'::regclass
  ) THEN
    CREATE POLICY aal_read ON public.admin_action_log_app
      FOR SELECT USING ( public.is_admin(auth.uid()) );
  END IF;

  -- Insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polname='aal_insert' AND polrelid='public.admin_action_log_app'::regclass
  ) THEN
    CREATE POLICY aal_insert ON public.admin_action_log_app
      FOR INSERT WITH CHECK ( public.is_admin(auth.uid()) );
  END IF;
END$policies_aal$;

-- RPC: atomic admin action logging
CREATE OR REPLACE FUNCTION public.rpc_log_admin_action(
  p_admin_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_reason text,
  p_correlation_id uuid,
  p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $rpc_log$
  INSERT INTO public.admin_action_log_app(
    admin_user_id, action, resource_type, resource_id, reason, correlation_id, extra
  )
  VALUES (
    p_admin_user_id, p_action, p_resource_type, p_resource_id, p_reason, p_correlation_id, 
    coalesce(p_extra, '{}'::jsonb)
  );
$rpc_log$;

-- =============================================================================
-- 3. IDEMPOTENCY KEYS TABLE
-- =============================================================================

-- Table: prevent duplicate admin operations
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key             text PRIMARY KEY,            -- same UUID used in API header + Stripe Idempotency-Key
  admin_user_id   uuid NOT NULL,
  action          text NOT NULL,               -- 'refund.issue'
  resource_type   text NOT NULL,               -- 'invoice','user', etc.
  resource_id     text,
  request_hash    text NOT NULL,               -- sha256 of request payload
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance and integrity
CREATE INDEX IF NOT EXISTS idx_idemp_created 
  ON public.idempotency_keys (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idemp_action_resource 
  ON public.idempotency_keys (action, resource_type, coalesce(resource_id,''));

-- RLS: admin-only access
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $policies_idemp$
BEGIN
  -- Read policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polname='idemp_read' AND polrelid='public.idempotency_keys'::regclass
  ) THEN
    CREATE POLICY idemp_read ON public.idempotency_keys
      FOR SELECT USING ( public.is_admin(auth.uid()) );
  END IF;

  -- Insert policy  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polname='idemp_insert' AND polrelid='public.idempotency_keys'::regclass
  ) THEN
    CREATE POLICY idemp_insert ON public.idempotency_keys
      FOR INSERT WITH CHECK ( public.is_admin(auth.uid()) );
  END IF;
END$policies_idemp$;

-- RPC: atomic idempotency claim (returns true if inserted, false if duplicate)
CREATE OR REPLACE FUNCTION public.claim_idempotency(
  p_key text,
  p_admin_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_request_hash text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $claim_idemp$
BEGIN
  INSERT INTO public.idempotency_keys(
    key, admin_user_id, action, resource_type, resource_id, request_hash
  )
  VALUES (p_key, p_admin_user_id, p_action, p_resource_type, p_resource_id, p_request_hash);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END$claim_idemp$;

-- =============================================================================
-- 4. TWO-PERSON APPROVAL QUEUE TABLE
-- =============================================================================

-- Table: queue for actions requiring dual approval
CREATE TABLE IF NOT EXISTS public.admin_two_person_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action         text NOT NULL,                -- 'refund.issue' | 'ban.permanent'
  resource_type  text NOT NULL,                -- 'invoice','user'
  resource_id    text,
  payload        jsonb NOT NULL,               -- original request body (sanitized)
  threshold      numeric NOT NULL,             -- e.g., 500
  requested_by   uuid NOT NULL,
  approved_by    uuid,
  state          text NOT NULL DEFAULT 'pending' 
                 CHECK (state IN ('pending','approved','rejected')),
  reason         text,                         -- approver's reason
  correlation_id uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  approved_at    timestamptz
);

-- Indexes and integrity constraints
CREATE INDEX IF NOT EXISTS idx_tpq_state 
  ON public.admin_two_person_queue (state, created_at DESC);

-- Unique constraint: prevent multiple pending requests for same resource
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tpq_pending
  ON public.admin_two_person_queue (action, resource_type, coalesce(resource_id,''))
  WHERE state = 'pending';

-- Constraint: different admin for approval
DO $constraint_tpq$
BEGIN
  -- Drop if exists, then add constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'two_person_different_admin' 
      AND conrelid = 'public.admin_two_person_queue'::regclass
  ) THEN
    ALTER TABLE public.admin_two_person_queue DROP CONSTRAINT two_person_different_admin;
  END IF;
  
  ALTER TABLE public.admin_two_person_queue 
    ADD CONSTRAINT two_person_different_admin 
    CHECK (approved_by IS NULL OR approved_by <> requested_by);
END$constraint_tpq$;

-- RLS: admin-only access
ALTER TABLE public.admin_two_person_queue ENABLE ROW LEVEL SECURITY;

DO $policies_tpq$
BEGIN
  -- Read policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polname='tpq_read' AND polrelid='public.admin_two_person_queue'::regclass
  ) THEN
    CREATE POLICY tpq_read ON public.admin_two_person_queue
      FOR SELECT USING ( public.is_admin(auth.uid()) );
  END IF;

  -- Insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polname='tpq_insert' AND polrelid='public.admin_two_person_queue'::regclass
  ) THEN
    CREATE POLICY tpq_insert ON public.admin_two_person_queue
      FOR INSERT WITH CHECK ( public.is_admin(auth.uid()) );
  END IF;

  -- Update policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polname='tpq_update' AND polrelid='public.admin_two_person_queue'::regclass
  ) THEN
    CREATE POLICY tpq_update ON public.admin_two_person_queue
      FOR UPDATE USING ( public.is_admin(auth.uid()) )
      WITH CHECK ( public.is_admin(auth.uid()) );
  END IF;
END$policies_tpq$;

-- RPCs: atomic approve/reject operations
CREATE OR REPLACE FUNCTION public.approve_two_person(
  p_id uuid,
  p_approver uuid,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $approve_tp$
BEGIN
  UPDATE public.admin_two_person_queue
     SET approved_by = p_approver,
         reason      = p_reason,
         state       = 'approved',
         approved_at = now()
   WHERE id = p_id
     AND state = 'pending'
     AND requested_by <> p_approver;
  RETURN FOUND;
END$approve_tp$;

CREATE OR REPLACE FUNCTION public.reject_two_person(
  p_id uuid,
  p_approver uuid,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $reject_tp$
BEGIN
  UPDATE public.admin_two_person_queue
     SET approved_by = p_approver,
         reason      = p_reason,
         state       = 'rejected',
         approved_at = now()
   WHERE id = p_id
     AND state = 'pending'
     AND requested_by <> p_approver;
  RETURN FOUND;
END$reject_tp$;

-- =============================================================================
-- 5. RETENTION & CLEANUP (STUB)
-- =============================================================================

-- Retention function (to be scheduled via pg_cron or Supabase scheduler)
CREATE OR REPLACE FUNCTION public.gc_admin_tables() 
RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
AS $gc_admin$
BEGIN
  -- Clean up old idempotency keys (180 days)
  DELETE FROM public.idempotency_keys 
  WHERE created_at < now() - INTERVAL '180 days';
  
  -- Optional: archive old admin action logs (2 years) - uncomment if needed
  -- DELETE FROM public.admin_action_log_app 
  -- WHERE created_at < now() - INTERVAL '2 years';
  
  -- Note: Keep admin_two_person_queue records for audit purposes (no auto-cleanup)
END$gc_admin$;

COMMIT;