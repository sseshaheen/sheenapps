-- 🔒 SECURITY RESTORE: Re-enable proper RLS policies
-- Run this IMMEDIATELY to restore database security after debugging

-- =====================================
-- STEP 1: Re-enable RLS on all tables
-- =====================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- =====================================
-- STEP 2: Drop overly permissive policies
-- =====================================

DROP POLICY IF EXISTS "projects_allow_guest_access" ON projects;
DROP POLICY IF EXISTS "projects_flexible_access" ON projects;
DROP POLICY IF EXISTS "commits_allow_access" ON commits;
DROP POLICY IF EXISTS "commits_flexible_access" ON commits;
DROP POLICY IF EXISTS "branches_allow_access" ON branches;
DROP POLICY IF EXISTS "branches_flexible_access" ON branches;
DROP POLICY IF EXISTS "assets_allow_access" ON assets;
DROP POLICY IF EXISTS "assets_flexible_access" ON assets;

-- =====================================
-- STEP 3: Create secure, but functional policies
-- =====================================

-- Projects: Secure policy that allows authenticated users + limited guest access
CREATE POLICY "projects_secure_access" ON projects
  FOR ALL USING (
    -- Authenticated users can access their own projects
    (auth.uid() IS NOT NULL AND owner_id = auth.uid()) OR
    -- Limited guest access: only for demo projects with specific naming
    (owner_id::text LIKE 'demo_%' AND created_at > NOW() - INTERVAL '7 days')
  );

-- Commits: Access only through owned projects
CREATE POLICY "commits_secure_access" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = commits.project_id 
      AND (
        (auth.uid() IS NOT NULL AND projects.owner_id = auth.uid()) OR
        (projects.owner_id::text LIKE 'demo_%' AND projects.created_at > NOW() - INTERVAL '7 days')
      )
    )
  );

-- Branches: Access only through owned projects
CREATE POLICY "branches_secure_access" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = branches.project_id 
      AND (
        (auth.uid() IS NOT NULL AND projects.owner_id = auth.uid()) OR
        (projects.owner_id::text LIKE 'demo_%' AND projects.created_at > NOW() - INTERVAL '7 days')
      )
    )
  );

-- Assets: Access only through owned projects
CREATE POLICY "assets_secure_access" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = assets.project_id 
      AND (
        (auth.uid() IS NOT NULL AND projects.owner_id = auth.uid()) OR
        (projects.owner_id::text LIKE 'demo_%' AND projects.created_at > NOW() - INTERVAL '7 days')
      )
    )
  );

-- =====================================
-- STEP 4: Add INSERT policies for authenticated users
-- =====================================

CREATE POLICY "projects_insert_policy" ON projects
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND owner_id = auth.uid()
  );

CREATE POLICY "commits_insert_policy" ON commits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = commits.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "branches_insert_policy" ON branches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = branches.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "assets_insert_policy" ON assets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = assets.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

-- =====================================
-- NOTES
-- =====================================
-- This restore script:
-- 1. Re-enables RLS on all tables
-- 2. Removes overly permissive policies from debugging
-- 3. Creates secure policies that still allow demo functionality
-- 4. Requires authentication for most operations
-- 5. Only allows limited guest access to demo projects (7-day expiry)
--
-- Demo mode now requires projects to be prefixed with 'demo_' instead of 'guest_'
-- This provides better security while maintaining functionality