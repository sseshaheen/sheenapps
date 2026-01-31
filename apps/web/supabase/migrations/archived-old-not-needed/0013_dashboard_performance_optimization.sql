-- Dashboard Performance Optimization Migration
-- Adds performance indexes and metadata fields for project management dashboard

-- Add dashboard metadata fields to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Expert advice: Add updated_at index for sort-by-recent performance
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- Composite index for user's projects sorted by update time (dashboard main query)
CREATE INDEX IF NOT EXISTS idx_projects_owner_updated ON projects(owner_id, updated_at DESC);

-- Index for non-archived projects (common filter)
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(owner_id, archived_at) WHERE archived_at IS NULL;

-- Index for project search by name (dashboard search functionality)
CREATE INDEX IF NOT EXISTS idx_projects_name_search ON projects USING gin(to_tsvector('english', name));

-- Add update trigger to maintain updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to projects table if it doesn't exist
DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update last_accessed_at when project is accessed (future use)
CREATE OR REPLACE FUNCTION update_project_access(project_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE projects 
    SET last_accessed_at = NOW() 
    WHERE id = project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON INDEX idx_projects_updated_at IS 'Performance index for dashboard sort-by-recent functionality';
COMMENT ON INDEX idx_projects_owner_updated IS 'Composite index for user dashboard main query';
COMMENT ON INDEX idx_projects_active IS 'Partial index for non-archived projects only';
COMMENT ON INDEX idx_projects_name_search IS 'Full-text search index for project names';
COMMENT ON COLUMN projects.archived_at IS 'Timestamp when project was archived (NULL = active)';
COMMENT ON COLUMN projects.last_accessed_at IS 'Last time project was opened in builder';
COMMENT ON COLUMN projects.thumbnail_url IS 'URL to project thumbnail image for dashboard cards';