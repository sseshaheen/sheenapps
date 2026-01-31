-- Rename claude_json column to ai_json in project_versions table
ALTER TABLE project_versions 
RENAME COLUMN claude_json TO ai_json;