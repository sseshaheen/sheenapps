-- 🔧 Fix RLS Gaps Before Privilege Restoration
-- Address critical security vulnerability in project_versions table

BEGIN;

-- Enable RLS on project_versions (critical user data table)
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

-- Create policies for project_versions
CREATE POLICY "project_versions_user_access" 
ON public.project_versions 
USING (user_id = auth.uid());

CREATE POLICY "project_versions_insert_policy" 
ON public.project_versions FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Check for other vulnerable tables and enable RLS
-- Add more tables as needed based on data sensitivity audit

-- Verify RLS is now enabled
SELECT 
  tablename,
  rowsecurity,
  CASE 
    WHEN rowsecurity THEN '✅ Protected'
    ELSE '🚨 Still Vulnerable'
  END as status
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('projects', 'project_versions', 'assets')
ORDER BY tablename;

COMMIT;