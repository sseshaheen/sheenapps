-- Check current database security status
-- Run this with your service role key to audit current privileges

-- 1. Check current privileges for anon and authenticated roles
SELECT 
    schemaname,
    tablename,
    grantor,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges 
WHERE grantee IN ('anon', 'authenticated')
ORDER BY schemaname, tablename, grantee;

-- 2. Check current default privileges
SELECT 
    defaclnamespace::regnamespace as schema,
    defaclrole::regrole as grantor,
    defaclobjtype as object_type,
    (SELECT string_agg(privilege_type, ', ') 
     FROM aclexplode(defaclacl) 
     WHERE grantee::regrole::text IN ('anon', 'authenticated')
    ) as privileges_granted
FROM pg_default_acl
WHERE array_to_string(defaclacl, '') ~* '(anon|authenticated)';

-- 3. Check storage bucket policies (if using storage)
SELECT 
    name as bucket_name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets;

-- 4. List all tables in public schema
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;