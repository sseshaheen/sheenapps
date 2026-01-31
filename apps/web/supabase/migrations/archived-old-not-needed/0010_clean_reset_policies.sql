-- 🧹 CLEAN RESET: Remove all conflicting RLS policies and create simple working ones
-- This addresses the infinite recursion issue caused by overlapping migrations

-- =====================================
-- STEP 1: Drop ALL existing policies
-- =====================================

-- Drop all variations of project policies
DROP POLICY IF EXISTS "project_access" ON projects;
DROP POLICY IF EXISTS "project_access_v2" ON projects;
DROP POLICY IF EXISTS "project_access_simple" ON projects;
DROP POLICY IF EXISTS "project_delete_owner_only" ON projects;

-- Drop all variations of commit policies  
DROP POLICY IF EXISTS "commit_access" ON commits;
DROP POLICY IF EXISTS "commit_access_v2" ON commits;
DROP POLICY IF EXISTS "commit_access_simple" ON commits;

-- Drop all variations of branch policies
DROP POLICY IF EXISTS "branch_access" ON branches;
DROP POLICY IF EXISTS "branch_access_v2" ON branches;
DROP POLICY IF EXISTS "branch_access_simple" ON branches;

-- Drop all variations of asset policies
DROP POLICY IF EXISTS "asset_access" ON assets;
DROP POLICY IF EXISTS "asset_access_v2" ON assets;
DROP POLICY IF EXISTS "asset_access_simple" ON assets;

-- Drop any collaborator policies (they may not exist yet)
DROP POLICY IF EXISTS "collaborator_access" ON project_collaborators;
DROP POLICY IF EXISTS "collaborator_access_simple" ON project_collaborators;
DROP POLICY IF EXISTS "collaborator_insert" ON project_collaborators;
DROP POLICY IF EXISTS "collaborator_update_simple" ON project_collaborators;
DROP POLICY IF EXISTS "collaborator_delete_simple" ON project_collaborators;
DROP POLICY IF EXISTS "collaborator_management" ON project_collaborators;

-- =====================================
-- STEP 2: Create clean, simple policies
-- =====================================

-- Projects: ONLY owner access (simplest possible)
CREATE POLICY "projects_owner_only" ON projects
  FOR ALL USING (owner_id = auth.uid());

-- Commits: via project ownership only
CREATE POLICY "commits_via_project_owner" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = commits.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

-- Branches: via project ownership only
CREATE POLICY "branches_via_project_owner" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = branches.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

-- Assets: via project ownership only
CREATE POLICY "assets_via_project_owner" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = assets.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

-- =====================================
-- STEP 3: Ensure RLS is enabled
-- =====================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Note: This creates the simplest possible policies that should work
-- Collaboration features can be added later once basic functionality is stable