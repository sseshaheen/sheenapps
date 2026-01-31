-- 🛡️ Security Templates for New Tables
-- Use these templates when creating new tables to ensure consistent security

-- =================================
-- TEMPLATE 1: USER-OWNED TABLE
-- =================================
-- For tables where each row belongs to a specific user
-- Example: user_profiles, user_settings, user_documents

/*
-- 1. Create your table (replace 'your_table_name' and add your columns)
CREATE TABLE public.your_table_name (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  -- your columns here
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Apply security template
*/

-- Template for user-owned tables
CREATE OR REPLACE FUNCTION secure_user_table(table_name text) 
RETURNS void AS $$
BEGIN
  -- Enable FORCE RLS for maximum security
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
  
  -- Create user-only access policy
  EXECUTE format('
    CREATE POLICY "%I_user_access" 
    ON public.%I 
    FOR ALL 
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid())', table_name, table_name);
  
  -- Grant privileges (now that policy exists)
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  
  RAISE NOTICE 'Secured user table: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- Usage: SELECT secure_user_table('your_table_name');

-- =================================
-- TEMPLATE 2: PROJECT-BASED TABLE  
-- =================================
-- For tables where access is based on project ownership/membership
-- Example: project_files, project_comments, project_analytics

CREATE OR REPLACE FUNCTION secure_project_table(table_name text, project_id_column text DEFAULT 'project_id') 
RETURNS void AS $$
BEGIN
  -- Enable FORCE RLS for maximum security
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
  
  -- Create project-based access policy
  EXECUTE format('
    CREATE POLICY "%I_project_access" 
    ON public.%I 
    FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id::text = %I::%s::text
        AND (
          p.owner_id = auth.uid()  -- Project owner
          OR EXISTS (
            SELECT 1 FROM public.project_collaborators pc
            WHERE pc.project_id = p.id
            AND pc.user_id = auth.uid()
            AND pc.role IN (''owner'', ''admin'', ''editor'', ''viewer'')
          )
        )
      )
    )', table_name, table_name, project_id_column, 
    CASE WHEN project_id_column LIKE '%uuid%' THEN 'uuid' ELSE 'text' END);
  
  -- Grant privileges
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  
  RAISE NOTICE 'Secured project table: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- Usage: SELECT secure_project_table('your_project_table');

-- =================================
-- TEMPLATE 3: ADMIN-ONLY TABLE
-- =================================
-- For system/admin tables that regular users shouldn't access
-- Example: system_logs, admin_settings, audit_trails

CREATE OR REPLACE FUNCTION secure_admin_table(table_name text) 
RETURNS void AS $$
BEGIN
  -- Enable FORCE RLS for maximum security
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
  
  -- Create admin-only policy
  EXECUTE format('
    CREATE POLICY "%I_admin_only" 
    ON public.%I 
    FOR ALL 
    USING ((auth.jwt() ->> ''role'') = ''admin'')
    WITH CHECK ((auth.jwt() ->> ''role'') = ''admin'')', table_name, table_name);
  
  -- Grant privileges (only admins will be able to use them)
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  
  RAISE NOTICE 'Secured admin table: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- Usage: SELECT secure_admin_table('your_admin_table');

-- =================================
-- TEMPLATE 4: READ-ONLY REFERENCE TABLE
-- =================================
-- For tables that everyone can read but only admins can modify
-- Example: currencies, countries, feature_flags

CREATE OR REPLACE FUNCTION secure_reference_table(table_name text) 
RETURNS void AS $$
BEGIN
  -- Enable RLS (not FORCE since this is less sensitive)
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  
  -- Allow all authenticated users to read
  EXECUTE format('
    CREATE POLICY "%I_read_all" 
    ON public.%I 
    FOR SELECT 
    USING (auth.role() = ''authenticated'')', table_name, table_name);
  
  -- Only admins can modify
  EXECUTE format('
    CREATE POLICY "%I_admin_modify" 
    ON public.%I 
    FOR INSERT, UPDATE, DELETE
    USING ((auth.jwt() ->> ''role'') = ''admin'')
    WITH CHECK ((auth.jwt() ->> ''role'') = ''admin'')', table_name, table_name);
  
  -- Grant privileges
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  
  RAISE NOTICE 'Secured reference table: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- Usage: SELECT secure_reference_table('currencies');

-- =================================
-- VERIFY SECURITY FUNCTION
-- =================================
-- Check if a table is properly secured

CREATE OR REPLACE FUNCTION verify_table_security(table_name text)
RETURNS TABLE(
  table_name text,
  rls_enabled boolean,
  rls_forced boolean,
  policy_count bigint,
  has_privileges boolean,
  security_status text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    table_name,
    pg_class.relrowsecurity as rls_enabled,
    pg_class.relforcerowsecurity as rls_forced,
    COALESCE(policy_counts.count, 0) as policy_count,
    COALESCE(privilege_exists.exists, false) as has_privileges,
    CASE 
      WHEN NOT pg_class.relrowsecurity THEN 'INSECURE: No RLS'
      WHEN COALESCE(policy_counts.count, 0) = 0 THEN 'INACCESSIBLE: No policies'
      WHEN NOT COALESCE(privilege_exists.exists, false) THEN 'INACCESSIBLE: No privileges'
      WHEN pg_class.relforcerowsecurity THEN 'SECURE: FORCE RLS + policies + privileges'
      ELSE 'SECURE: RLS + policies + privileges'
    END as security_status
  FROM pg_class
  JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  LEFT JOIN (
    SELECT 
      pg_policies.tablename, 
      COUNT(*) as count
    FROM pg_policies 
    WHERE pg_policies.schemaname = 'public' 
    AND pg_policies.tablename = verify_table_security.table_name
    GROUP BY pg_policies.tablename
  ) policy_counts ON policy_counts.tablename = pg_class.relname
  LEFT JOIN (
    SELECT 
      information_schema.role_table_grants.table_name,
      true as exists
    FROM information_schema.role_table_grants
    WHERE information_schema.role_table_grants.grantee = 'authenticated'
    AND information_schema.role_table_grants.table_schema = 'public'
    AND information_schema.role_table_grants.table_name = verify_table_security.table_name
    LIMIT 1
  ) privilege_exists ON privilege_exists.table_name = pg_class.relname
  WHERE pg_namespace.nspname = 'public'
  AND pg_class.relname = verify_table_security.table_name
  AND pg_class.relkind = 'r';
END;
$$ LANGUAGE plpgsql;

-- Usage: SELECT * FROM verify_table_security('your_table_name');

-- =================================
-- USAGE EXAMPLES
-- =================================

/*
-- Example 1: Secure a new user preferences table
CREATE TABLE public.user_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  theme text DEFAULT 'light',
  language text DEFAULT 'en',
  created_at timestamptz DEFAULT now()
);

SELECT secure_user_table('user_preferences');
SELECT * FROM verify_table_security('user_preferences');

-- Example 2: Secure a new project analytics table  
CREATE TABLE public.project_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  page_views integer DEFAULT 0,
  unique_visitors integer DEFAULT 0,
  date date DEFAULT CURRENT_DATE
);

SELECT secure_project_table('project_analytics');
SELECT * FROM verify_table_security('project_analytics');

-- Example 3: Secure a system configuration table
CREATE TABLE public.system_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

SELECT secure_admin_table('system_config');
SELECT * FROM verify_table_security('system_config');
*/