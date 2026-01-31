-- Comprehensive fix for admin audit system
-- This ensures all required tables and functions exist

-- 1. Create admin_action_log_app table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_action_log_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  reason TEXT,
  extra JSONB DEFAULT '{}',
  correlation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_admin_action_log_admin_user 
  ON public.admin_action_log_app(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_action 
  ON public.admin_action_log_app(action);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_resource 
  ON public.admin_action_log_app(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created 
  ON public.admin_action_log_app(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_correlation 
  ON public.admin_action_log_app(correlation_id);

-- 3. Drop the function if it exists with wrong signature
DROP FUNCTION IF EXISTS public.rpc_log_admin_action(uuid, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.rpc_log_admin_action(uuid, text, text, text, text, uuid, jsonb);

-- 4. Create the function with correct signature
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

-- 5. Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_log_admin_action TO authenticated;

-- 6. Verify the function exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'rpc_log_admin_action' 
    AND pronargs = 7
  ) THEN
    RAISE NOTICE 'Function rpc_log_admin_action created successfully with 7 parameters';
  ELSE
    RAISE EXCEPTION 'Function rpc_log_admin_action was not created properly';
  END IF;
END $$;

-- 7. Test the function with a sample call (will be rolled back)
BEGIN;
  SELECT public.rpc_log_admin_action(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'test_action'::text,
    'test_resource'::text,
    'test_id'::text,
    'test_reason'::text,
    '00000000-0000-0000-0000-000000000000'::uuid,
    '{"test": "data"}'::jsonb
  );
  RAISE NOTICE 'Function test successful - rolling back test data';
ROLLBACK;

RAISE NOTICE 'Admin audit system fix completed successfully!';