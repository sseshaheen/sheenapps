-- Project Collaborators Scalable Table
-- Replaces JSON array approach with proper relational structure

-- Create project_collaborators table
CREATE TABLE project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique user per project
  UNIQUE(project_id, user_id)
);

-- Create indexes for performance
CREATE INDEX idx_project_collaborators_project_id ON project_collaborators(project_id);
CREATE INDEX idx_project_collaborators_user_id ON project_collaborators(user_id);
CREATE INDEX idx_project_collaborators_role ON project_collaborators(role);

-- Enable RLS
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_collaborators
CREATE POLICY "collaborator_access" ON project_collaborators
  FOR ALL USING (
    -- Users can see their own collaborations
    user_id = auth.uid() OR
    -- Users can see collaborators of projects they have access to
    EXISTS (
      SELECT 1 FROM project_collaborators pc2
      WHERE pc2.project_id = project_collaborators.project_id
      AND pc2.user_id = auth.uid()
      AND pc2.role IN ('owner', 'admin', 'editor', 'viewer')
    ) OR
    -- Project owners can see all collaborators
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    )
  );

-- Only owners and admins can manage collaborators
CREATE POLICY "collaborator_management" ON project_collaborators
  FOR INSERT WITH CHECK (
    -- Project owners can add collaborators
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    ) OR
    -- Admins can add collaborators
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_collaborators.project_id
      AND pc.user_id = auth.uid()
      AND pc.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "collaborator_update" ON project_collaborators
  FOR UPDATE USING (
    -- Project owners can update any collaborator
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    ) OR
    -- Admins can update collaborators (except owners)
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_collaborators.project_id
      AND pc.user_id = auth.uid()
      AND pc.role IN ('owner', 'admin')
      AND project_collaborators.role != 'owner'
    ) OR
    -- Users can update their own acceptance status
    (user_id = auth.uid() AND accepted_at IS NULL)
  );

CREATE POLICY "collaborator_delete" ON project_collaborators
  FOR DELETE USING (
    -- Project owners can remove any collaborator
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_collaborators.project_id
      AND p.owner_id = auth.uid()
    ) OR
    -- Admins can remove collaborators (except owners)
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_collaborators.project_id
      AND pc.user_id = auth.uid()
      AND pc.role IN ('owner', 'admin')
      AND project_collaborators.role != 'owner'
    ) OR
    -- Users can remove themselves
    user_id = auth.uid()
  );

-- Update existing RLS policies to use the new table structure
-- Update projects policy to include collaborator access
DROP POLICY IF EXISTS "project_access" ON projects;
CREATE POLICY "project_access" ON projects
  FOR ALL USING (
    -- Original owner access
    owner_id = auth.uid() OR 
    -- New collaborator access via junction table
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = projects.id
      AND pc.user_id = auth.uid()
      AND pc.accepted_at IS NOT NULL
      AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
    )
  );

-- Update commits policy
DROP POLICY IF EXISTS "commit_access" ON commits;
CREATE POLICY "commit_access" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = commits.project_id 
      AND (
        p.owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM project_collaborators pc
          WHERE pc.project_id = p.id
          AND pc.user_id = auth.uid()
          AND pc.accepted_at IS NOT NULL
          AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
        )
      )
    )
  );

-- Update branches policy
DROP POLICY IF EXISTS "branch_access" ON branches;
CREATE POLICY "branch_access" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = branches.project_id 
      AND (
        p.owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM project_collaborators pc
          WHERE pc.project_id = p.id
          AND pc.user_id = auth.uid()
          AND pc.accepted_at IS NOT NULL
          AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
        )
      )
    )
  );

-- Update assets policy
DROP POLICY IF EXISTS "asset_access" ON assets;
CREATE POLICY "asset_access" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = assets.project_id 
      AND (
        p.owner_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM project_collaborators pc
          WHERE pc.project_id = p.id
          AND pc.user_id = auth.uid()
          AND pc.accepted_at IS NOT NULL
          AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
        )
      )
    )
  );

-- Create trigger to automatically add project owner as collaborator
CREATE OR REPLACE FUNCTION add_owner_as_collaborator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_collaborators (project_id, user_id, role, accepted_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', now())
  ON CONFLICT (project_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_add_owner_as_collaborator
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION add_owner_as_collaborator();

-- Create function to invite collaborators
CREATE OR REPLACE FUNCTION invite_collaborator(
  p_project_id uuid,
  p_email text,
  p_role text DEFAULT 'viewer'
)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
  v_project_owner uuid;
  v_collaborator_id uuid;
BEGIN
  -- Check if caller has permission (owner or admin)
  SELECT owner_id INTO v_project_owner
  FROM projects 
  WHERE id = p_project_id;
  
  IF v_project_owner != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM project_collaborators 
    WHERE project_id = p_project_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Find user by email
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Add collaborator
  INSERT INTO project_collaborators (project_id, user_id, role, invited_by)
  VALUES (p_project_id, v_user_id, p_role, auth.uid())
  ON CONFLICT (project_id, user_id) 
  DO UPDATE SET 
    role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by,
    updated_at = now()
  RETURNING id INTO v_collaborator_id;
  
  RETURN json_build_object(
    'success', true, 
    'collaborator_id', v_collaborator_id,
    'user_id', v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get project collaborators with user details
CREATE OR REPLACE FUNCTION get_project_collaborators(p_project_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  invited_at timestamptz,
  accepted_at timestamptz,
  invited_by_email text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.user_id,
    u.email,
    pc.role,
    pc.invited_at,
    pc.accepted_at,
    inviter.email as invited_by_email
  FROM project_collaborators pc
  JOIN auth.users u ON u.id = pc.user_id
  LEFT JOIN auth.users inviter ON inviter.id = pc.invited_by
  WHERE pc.project_id = p_project_id
  AND (
    -- Check RLS permissions
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project_id
      AND p.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM project_collaborators pc2
      WHERE pc2.project_id = p_project_id
      AND pc2.user_id = auth.uid()
      AND pc2.role IN ('owner', 'admin', 'editor', 'viewer')
    )
  )
  ORDER BY 
    CASE pc.role 
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2  
      WHEN 'editor' THEN 3
      WHEN 'viewer' THEN 4
    END,
    pc.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;