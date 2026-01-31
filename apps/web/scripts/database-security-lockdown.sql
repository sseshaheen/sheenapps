-- 🛡️ Database Security Lockdown Script
-- WARNING: This will revoke all client-side database access
-- Run with service role key, test thoroughly after execution

-- ===================================
-- PHASE 1: REVOKE ALL PUBLIC ACCESS
-- ===================================

-- Revoke all table privileges for anon and authenticated roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Revoke default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Also handle other schemas if they exist
-- REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM anon, authenticated;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON TABLES FROM anon, authenticated;

-- ===================================
-- PHASE 2: SECURE STORAGE BUCKETS
-- ===================================

-- Make all storage buckets private (no anonymous access)
UPDATE storage.buckets SET public = false WHERE public = true;

-- List affected buckets for verification
SELECT 
    name as bucket_name, 
    public,
    'Made private' as action
FROM storage.buckets;

-- ===================================
-- PHASE 3: VERIFICATION QUERIES
-- ===================================

-- Verify no privileges remain for anon/authenticated
SELECT 
    'Remaining table privileges' as check_type,
    table_schema,
    table_name,
    grantee,
    privilege_type
FROM information_schema.table_privileges 
WHERE grantee IN ('anon', 'authenticated');

-- Should return no rows if successful

-- Verify no default privileges remain
SELECT 
    'Remaining default privileges' as check_type,
    defaclnamespace::regnamespace as schema,
    defaclrole::regrole as grantor,
    (SELECT string_agg(privilege_type, ', ') 
     FROM aclexplode(defaclacl) 
     WHERE grantee::regrole::text IN ('anon', 'authenticated')
    ) as remaining_privileges
FROM pg_default_acl
WHERE array_to_string(defaclacl, '') ~* '(anon|authenticated)';

-- Should return no rows if successful

COMMIT;

-- ===================================
-- POST-EXECUTION NOTES
-- ===================================

-- After running this script:
-- 1. ✅ All client-side database calls will fail (expected)
-- 2. ✅ Only service role can access database
-- 3. ✅ Storage buckets are private
-- 4. ⚠️  You MUST implement server-only access patterns
-- 5. ⚠️  Test all auth flows to ensure they still work

-- Next steps:
-- - Remove NEXT_PUBLIC_SUPABASE_ANON_KEY from client bundle
-- - Implement separated auth/database clients
-- - Create server-only repositories
-- - Test OAuth flows work with anon key server-side only