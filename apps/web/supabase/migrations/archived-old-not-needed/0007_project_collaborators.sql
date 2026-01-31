-- Project Collaborators Table for Scalable User Management
-- Replaces JSON array approach with proper relational structure

-- 👥 Project collaborators junction table
CREATE TABLE project_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer', 'admin')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(project_id, user_id)
);

-- Performance indexes
CREATE INDEX idx_project_collaborators_project ON project_collaborators(project_id);
CREATE INDEX idx_project_collaborators_user ON project_collaborators(user_id);
CREATE INDEX idx_project_collaborators_role ON project_collaborators(role);
CREATE INDEX idx_project_collaborators_status ON project_collaborators(status);

-- Trigger for updated_at
CREATE TRIGGER update_project_collaborators_updated_at 
  BEFORE UPDATE ON project_collaborators 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;

-- Users can see collaborations they're part of
CREATE POLICY "collaborators_read_own" ON project_collaborators
  FOR SELECT USING (
    user_id = auth.uid() OR
    -- Or if they're already a collaborator on this project
    EXISTS (
      SELECT 1 FROM project_collaborators pc2
      WHERE pc2.project_id = project_collaborators.project_id
      AND pc2.user_id = auth.uid()
      AND pc2.status = 'accepted'
    )
  );

-- Project owners and admins can manage collaborators
CREATE POLICY "collaborators_manage" ON project_collaborators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_collaborators.project_id 
      AND projects.owner_id = auth.uid()
    ) OR
    -- Or if user is an admin collaborator
    EXISTS (
      SELECT 1 FROM project_collaborators pc2
      WHERE pc2.project_id = project_collaborators.project_id
      AND pc2.user_id = auth.uid()
      AND pc2.role IN ('admin', 'owner')
      AND pc2.status = 'accepted'
    )
  );

-- Add project owner as initial collaborator function
CREATE OR REPLACE FUNCTION add_project_owner_as_collaborator()
RETURNS TRIGGER AS $$
BEGIN
  -- Add the project owner as an accepted collaborator with owner role
  INSERT INTO project_collaborators (
    project_id,
    user_id,
    role,
    status,
    accepted_at,
    invited_by
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    'owner',
    'accepted',
    NOW(),
    NEW.owner_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-add owner as collaborator
CREATE TRIGGER add_owner_collaborator 
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION add_project_owner_as_collaborator();

-- Helper function to get project collaborators with user info
CREATE OR REPLACE FUNCTION get_project_collaborators(project_uuid UUID)
RETURNS TABLE (
  collaborator_id UUID,
  user_email TEXT,
  user_name TEXT,
  role TEXT,
  status TEXT,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'name', au.email) as user_name,
    pc.role,
    pc.status,
    pc.invited_at,
    pc.accepted_at
  FROM project_collaborators pc
  JOIN auth.users au ON pc.user_id = au.id
  WHERE pc.project_id = project_uuid
  AND pc.status IN ('accepted', 'pending')
  ORDER BY 
    CASE pc.role 
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'editor' THEN 3
      WHEN 'viewer' THEN 4
    END,
    pc.accepted_at ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to invite collaborator
CREATE OR REPLACE FUNCTION invite_collaborator(
  project_uuid UUID,
  user_email TEXT,
  collaborator_role TEXT DEFAULT 'viewer'
)
RETURNS JSONB AS $$
DECLARE
  target_user_id UUID;
  invitation_id UUID;
  project_name TEXT;
BEGIN
  -- Validate role
  IF collaborator_role NOT IN ('viewer', 'editor', 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid role. Must be viewer, editor, or admin.'
    );
  END IF;
  
  -- Check if user has permission to invite
  IF NOT EXISTS (
    SELECT 1 FROM projects 
    WHERE id = project_uuid 
    AND owner_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM project_collaborators 
    WHERE project_id = project_uuid 
    AND user_id = auth.uid() 
    AND role IN ('admin', 'owner')
    AND status = 'accepted'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You do not have permission to invite collaborators to this project.'
    );
  END IF;
  
  -- Find user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found with that email address.'
    );
  END IF;
  
  -- Check if already a collaborator
  IF EXISTS (
    SELECT 1 FROM project_collaborators
    WHERE project_id = project_uuid 
    AND user_id = target_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is already a collaborator on this project.'
    );
  END IF;
  
  -- Get project name for the invitation
  SELECT name INTO project_name
  FROM projects
  WHERE id = project_uuid;
  
  -- Create invitation
  INSERT INTO project_collaborators (
    project_id,
    user_id,
    role,
    invited_by,
    status
  ) VALUES (
    project_uuid,
    target_user_id,
    collaborator_role,
    auth.uid(),
    'pending'
  ) RETURNING id INTO invitation_id;
  
  -- TODO: Send invitation email (implement via webhook)
  
  RETURN jsonb_build_object(
    'success', true,
    'invitation_id', invitation_id,
    'message', 'Invitation sent successfully.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing RLS policies to use the new collaborators table
-- This will replace the JSON array approach

-- Updated project access policy
DROP POLICY IF EXISTS "project_access" ON projects;
CREATE POLICY "project_access_v2" ON projects
  FOR ALL USING (
    owner_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM project_collaborators 
      WHERE project_collaborators.project_id = projects.id
      AND project_collaborators.user_id = auth.uid()
      AND project_collaborators.status = 'accepted'
    )
  );

-- Updated commit access policy  
DROP POLICY IF EXISTS "commit_access" ON commits;
CREATE POLICY "commit_access_v2" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = commits.project_id 
      AND (
        projects.owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM project_collaborators
          WHERE project_collaborators.project_id = projects.id
          AND project_collaborators.user_id = auth.uid()
          AND project_collaborators.status = 'accepted'
        )
      )
    )
  );

-- Updated branch access policy
DROP POLICY IF EXISTS "branch_access" ON branches;
CREATE POLICY "branch_access_v2" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = branches.project_id 
      AND (
        projects.owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM project_collaborators
          WHERE project_collaborators.project_id = projects.id
          AND project_collaborators.user_id = auth.uid()
          AND project_collaborators.status = 'accepted'
        )
      )
    )
  );

-- Updated asset access policy
DROP POLICY IF EXISTS "asset_access" ON assets;
CREATE POLICY "asset_access_v2" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = assets.project_id 
      AND (
        projects.owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM project_collaborators
          WHERE project_collaborators.project_id = projects.id
          AND project_collaborators.user_id = auth.uid()
          AND project_collaborators.status = 'accepted'
        )
      )
    )
  );