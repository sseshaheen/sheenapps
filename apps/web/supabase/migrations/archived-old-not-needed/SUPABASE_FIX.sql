-- Quick fix for 406 Not Acceptable errors and guest access
-- Run this in your Supabase Dashboard SQL Editor

-- Step 1: Temporarily disable RLS to get things working
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE commits DISABLE ROW LEVEL SECURITY;
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE assets DISABLE ROW LEVEL SECURITY;

-- Step 2: Clean up any problematic policies
DROP POLICY IF EXISTS "projects_owner_only" ON projects;
DROP POLICY IF EXISTS "commits_via_project_owner" ON commits;
DROP POLICY IF EXISTS "branches_via_project_owner" ON branches;
DROP POLICY IF EXISTS "assets_via_project_owner" ON assets;

-- Step 3: Re-enable RLS with guest-friendly policies
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create a simple policy that allows access to guest projects
CREATE POLICY "projects_allow_guest_access" ON projects
  FOR ALL USING (
    -- Allow access if user owns the project OR it's a guest project
    (auth.uid() IS NOT NULL AND owner_id = auth.uid()) OR
    (owner_id::text LIKE 'guest_%') OR
    (auth.uid() IS NULL)
  );

-- Re-enable other tables with minimal policies
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commits_allow_access" ON commits FOR ALL USING (true);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches_allow_access" ON branches FOR ALL USING (true);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_allow_access" ON assets FOR ALL USING (true);

-- Note: This is a permissive setup for development/demo purposes
-- Tighten security for production use