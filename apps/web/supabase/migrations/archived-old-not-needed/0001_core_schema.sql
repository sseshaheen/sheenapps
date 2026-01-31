-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core tables with proper constraints
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users,
  parent_ids UUID[] NOT NULL DEFAULT '{}',
  tree_hash TEXT NOT NULL,
  message TEXT,
  payload_size INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: cap single commit at ~250KB
  CONSTRAINT check_payload_size CHECK (payload_size <= 256000)
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'main',
  head_id UUID REFERENCES commits(id) ON DELETE SET NULL,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, name)
);

CREATE TABLE assets (
  hash TEXT PRIMARY KEY,
  project_id UUID REFERENCES projects ON DELETE CASCADE,
  mime_type TEXT,
  size INT8,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploader_id UUID REFERENCES auth.users
);

-- Performance indexes
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_commits_project ON commits(project_id);
CREATE INDEX idx_commits_author ON commits(author_id);
CREATE INDEX idx_branches_project ON branches(project_id);
CREATE INDEX idx_assets_project ON assets(project_id);

-- GIN index for JSON queries on collaborators
CREATE INDEX idx_projects_collaborators ON projects USING GIN ((config->'collaborator_ids'));

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at 
  BEFORE UPDATE ON projects 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branches_updated_at 
  BEFORE UPDATE ON branches 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commits_updated_at 
  BEFORE UPDATE ON commits 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();