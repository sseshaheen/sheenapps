-- 🎭 GUEST ACCESS HOTFIX: Allow unauthenticated users to create projects
-- This enables the builder to work for demo/guest users without requiring authentication

-- =====================================
-- STEP 1: Create guest-friendly policies for projects
-- =====================================

-- Drop the strict owner-only policy
DROP POLICY IF EXISTS "projects_owner_only" ON projects;

-- Create a new policy that allows:
-- 1. Authenticated users to access their own projects
-- 2. Guest users (where owner_id starts with 'guest_') to access their projects
-- 3. Public read access to published projects (for demo purposes)
CREATE POLICY "projects_flexible_access" ON projects
  FOR ALL USING (
    -- Authenticated users can access their own projects
    (auth.uid() IS NOT NULL AND owner_id = auth.uid()) OR
    -- Guest users can access their guest projects (no auth required)
    (auth.uid() IS NULL AND owner_id::text LIKE 'guest_%') OR
    -- Anyone can read projects with owner_id starting with 'guest_' (demo mode)
    (owner_id::text LIKE 'guest_%')
  );

-- =====================================
-- STEP 2: Update related tables to match
-- =====================================

-- Update commits policy to handle guest projects
DROP POLICY IF EXISTS "commits_via_project_owner" ON commits;
CREATE POLICY "commits_flexible_access" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = commits.project_id 
      AND (
        -- Authenticated users access their own projects
        (auth.uid() IS NOT NULL AND projects.owner_id = auth.uid()) OR
        -- Guest access to guest projects
        (projects.owner_id::text LIKE 'guest_%')
      )
    )
  );

-- Update branches policy to handle guest projects
DROP POLICY IF EXISTS "branches_via_project_owner" ON branches;
CREATE POLICY "branches_flexible_access" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = branches.project_id 
      AND (
        -- Authenticated users access their own projects
        (auth.uid() IS NOT NULL AND projects.owner_id = auth.uid()) OR
        -- Guest access to guest projects
        (projects.owner_id::text LIKE 'guest_%')
      )
    )
  );

-- Update assets policy to handle guest projects
DROP POLICY IF EXISTS "assets_via_project_owner" ON assets;
CREATE POLICY "assets_flexible_access" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = assets.project_id 
      AND (
        -- Authenticated users access their own projects
        (auth.uid() IS NOT NULL AND projects.owner_id = auth.uid()) OR
        -- Guest access to guest projects
        (projects.owner_id::text LIKE 'guest_%')
      )
    )
  );

-- =====================================
-- NOTES
-- =====================================
-- This migration enables guest/demo mode by:
-- 1. Allowing projects with owner_id starting with 'guest_' to be accessed without authentication
-- 2. Maintaining security for authenticated users (they can only access their own projects)
-- 3. Enabling the builder to work for demos and testing without requiring users to sign up
--
-- Security considerations:
-- - Guest projects are effectively public (anyone can access if they know the project ID)
-- - This is acceptable for demo purposes but should be monitored
-- - Real authentication should still be encouraged for production use