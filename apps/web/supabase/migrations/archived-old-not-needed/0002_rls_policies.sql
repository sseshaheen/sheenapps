-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Projects: owners and collaborators
CREATE POLICY "project_access" ON projects
  FOR ALL USING (
    owner_id = auth.uid() OR 
    auth.uid() = ANY((config->>'collaborator_ids')::uuid[])
  );

-- Commits: via project access
CREATE POLICY "commit_access" ON commits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = commits.project_id 
      AND (
        projects.owner_id = auth.uid() OR 
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Branches: via project access  
CREATE POLICY "branch_access" ON branches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = branches.project_id 
      AND (
        projects.owner_id = auth.uid() OR 
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Assets: via project access
CREATE POLICY "asset_access" ON assets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = assets.project_id 
      AND (
        projects.owner_id = auth.uid() OR 
        auth.uid() = ANY((projects.config->>'collaborator_ids')::uuid[])
      )
    )
  );

-- Danger Zone: Project deletion policy
CREATE POLICY "project_delete_owner_only" ON projects
  FOR DELETE USING (owner_id = auth.uid());