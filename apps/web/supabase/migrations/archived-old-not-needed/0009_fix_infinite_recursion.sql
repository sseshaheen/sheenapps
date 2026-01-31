-- Fix infinite recursion in project_collaborators RLS policy
-- The issue: policy references the same table it's applied to

-- Drop the problematic policy
DROP POLICY IF EXISTS "collaborator_access" ON project_collaborators;

-- Create a simpler, non-recursive policy
CREATE POLICY "collaborator_access_simple" ON project_collaborators
  FOR ALL USING (
    -- Users can see their own collaborations
    user_id = auth.uid() OR
    -- Project owners can see all collaborators of their projects
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    )
  );

-- Also simplify the management policies to avoid potential recursion
DROP POLICY IF EXISTS "collaborator_management" ON project_collaborators;
DROP POLICY IF EXISTS "collaborator_update" ON project_collaborators;
DROP POLICY IF EXISTS "collaborator_delete" ON project_collaborators;

-- Create simpler management policies
CREATE POLICY "collaborator_insert" ON project_collaborators
  FOR INSERT WITH CHECK (
    -- Only project owners can add collaborators
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "collaborator_update_simple" ON project_collaborators
  FOR UPDATE USING (
    -- Project owners can update any collaborator
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    ) OR
    -- Users can update their own acceptance status
    user_id = auth.uid()
  );

CREATE POLICY "collaborator_delete_simple" ON project_collaborators
  FOR DELETE USING (
    -- Project owners can remove any collaborator
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    ) OR
    -- Users can remove themselves
    user_id = auth.uid()
  );