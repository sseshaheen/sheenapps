-- 🔧 Restore Minimal Privileges for Authenticated Role
-- This enables our existing RLS policies to function
-- Run with service role key to fix immediate permission errors

BEGIN;

-- Restore base privileges for authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT EXECUTE
ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- Verify our RLS policies are still enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('projects', 'versions', 'files', 'assets')
AND rowsecurity = true;

-- Create temporary debug function (expert recommendation)
-- This helps verify that requests arrive as authenticated with the expected sub
CREATE OR REPLACE FUNCTION debug_auth_context()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'current_role', current_setting('role', true),
    'auth_uid', auth.uid(),
    'auth_role', auth.role(),
    'jwt_claims', auth.jwt(),
    'timestamp', now()
  ) INTO result;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'error', 'Debug function failed',
    'message', SQLERRM,
    'current_user', current_user,
    'timestamp', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on debug function to authenticated
GRANT EXECUTE ON FUNCTION debug_auth_context() TO authenticated;

-- Log the restoration
INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'minimal_privileges_restored',
    jsonb_build_object(
        'restored_to_role', 'authenticated',
        'rls_policies_remain', 'enabled',
        'security_model', 'rls_based',
        'debug_function_created', true,
        'timestamp', now()
    ),
    '029_recovery'
);

COMMIT;

-- Post-execution verification
-- These should return rows showing RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;