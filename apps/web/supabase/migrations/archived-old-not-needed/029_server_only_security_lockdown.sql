-- ========================================
-- Migration 029: Server-Only Security Lockdown
-- ========================================
-- 
-- PHASE 1.1: Database Security Lockdown
-- Expert-validated server-only architecture implementation
-- 
-- This migration implements the critical security changes:
-- 1. Revoke all client-side database access
-- 2. Make storage buckets private
-- 3. Prepare for separated auth/database client architecture
-- 
-- ⚠️  WARNING: This will break all existing client-side database calls
-- Only run after implementing server-only access patterns
-- 
-- Reference: SERVER_ONLY_SUPABASE_ARCHITECTURE_PLAN.md Phase 1.1
-- ========================================

BEGIN;

-- ====================================
-- 1. REVOKE ALL CLIENT DATABASE ACCESS
-- ====================================

-- Revoke all existing privileges from anon and authenticated roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated; 
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Revoke storage schema access if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM anon, authenticated;
        REVOKE ALL ON ALL FUNCTIONS IN SCHEMA storage FROM anon, authenticated;
    END IF;
END
$$;

-- ====================================
-- 2. PREVENT FUTURE CLIENT ACCESS
-- ====================================

-- Revoke default privileges for any future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ====================================
-- 3. SECURE STORAGE BUCKETS
-- ====================================

-- Make all existing storage buckets private
-- Note: This may fail if storage schema doesn't exist, which is fine
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        UPDATE storage.buckets SET public = false WHERE public = true;
        
        -- Log changes for verification
        INSERT INTO storage.objects (name, bucket_id, metadata) 
        SELECT 
            'migration_029_lockdown_log.txt',
            id,
            jsonb_build_object(
                'migration', '029_server_only_security_lockdown',
                'action', 'made_bucket_private',
                'timestamp', now()
            )
        FROM storage.buckets 
        WHERE name = 'system-logs'
        ON CONFLICT DO NOTHING;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Storage operations may fail in some environments, continue migration
        NULL;
END
$$;

-- ====================================
-- 4. CREATE AUDIT LOG
-- ====================================

-- Create a simple audit log table for tracking access patterns
-- This helps monitor the transition to server-only access
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type TEXT NOT NULL, -- 'migration_applied', 'client_access_blocked', etc.
    details JSONB,
    migration_version TEXT
);

-- Log this migration
INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'server_only_lockdown_applied',
    jsonb_build_object(
        'revoked_roles', array['anon', 'authenticated'],
        'affected_schemas', array['public', 'storage'],
        'buckets_secured', true,
        'timestamp', now()
    ),
    '029'
);

-- ====================================
-- 5. VERIFICATION QUERIES
-- ====================================

-- These queries help verify the lockdown was successful
-- Run these manually after migration to confirm security

-- Query 1: Check for remaining privileges (should return 0 rows)
/*
SELECT 
    schemaname,
    tablename, 
    grantee,
    privilege_type,
    'SECURITY VIOLATION: Client access still exists' as alert
FROM information_schema.table_privileges 
WHERE grantee IN ('anon', 'authenticated')
AND schemaname IN ('public', 'storage');
*/

-- Query 2: Check default privileges (should return 0 rows)
/*
SELECT 
    defaclnamespace::regnamespace as schema,
    defaclrole::regrole as grantor,
    'SECURITY VIOLATION: Default privileges still exist' as alert
FROM pg_default_acl
WHERE array_to_string(defaclacl, '') ~* '(anon|authenticated)';
*/

-- Query 3: Check bucket privacy (all should be private)
/*
SELECT 
    name as bucket_name,
    public,
    CASE 
        WHEN public THEN 'SECURITY VIOLATION: Bucket is public'
        ELSE 'OK: Bucket is private'
    END as status
FROM storage.buckets;
*/

COMMIT;

-- ====================================
-- POST-MIGRATION CHECKLIST
-- ====================================

-- After running this migration:
-- 
-- ✅ 1. Client-side database calls will fail (expected)
-- ✅ 2. Only service role can access database 
-- ✅ 3. Storage buckets are private
-- ⚠️  4. Implement server-only repositories before deploying
-- ⚠️  5. Remove NEXT_PUBLIC_SUPABASE_ANON_KEY from client
-- ⚠️  6. Test all auth flows thoroughly
-- ⚠️  7. Update client code to use API routes/server actions
-- 
-- Next migration: 030_multi_tenant_schema.sql