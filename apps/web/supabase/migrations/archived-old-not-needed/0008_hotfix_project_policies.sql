-- 🚨 HOTFIX: Revert to simple project policies to fix infinite recursion
-- This fixes the immediate "infinite recursion detected in policy" error

-- Drop the problematic policies from migration 0007
DROP POLICY IF EXISTS "project_access_v2" ON projects;
DROP POLICY IF EXISTS "commit_access_v2" ON commits;
DROP POLICY IF EXISTS "branch_access_v2" ON branches;
DROP POLICY IF EXISTS "asset_access_v2" ON assets;

-- Restore simple, working policies that don't depend on project_collaborators table
CREATE POLICY "project_access_simple" ON projects
  FOR ALL USING (
    owner_id = auth.uid()
  );

CREATE POLICY "commit_access_simple" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = commits.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "branch_access_simple" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = branches.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "asset_access_simple" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = assets.project_id 
      AND projects.owner_id = auth.uid()
    )
  );

-- Note: After running migrations 0006 and 0007, we can upgrade to the 
-- collaboration-aware policies with project_collaborators table