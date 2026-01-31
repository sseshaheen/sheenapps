-- Performance index for project_collaborators as suggested by SSE expert
-- This improves the performance of the project access authorization queries

CREATE INDEX IF NOT EXISTS idx_pc_project_user ON project_collaborators(project_id, user_id);

-- This index will help with queries like:
-- SELECT 1 FROM project_collaborators pc WHERE pc.project_id = $1 AND pc.user_id = $2