-- Add missing date column to project_metrics_summary table
ALTER TABLE project_metrics_summary 
ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Update the unique constraint to include date
ALTER TABLE project_metrics_summary 
DROP CONSTRAINT IF EXISTS project_metrics_summary_project_id_user_id_key;

ALTER TABLE project_metrics_summary 
ADD CONSTRAINT project_metrics_summary_project_id_user_id_date_key 
UNIQUE (project_id, user_id, date);

-- Add index on date for better query performance
CREATE INDEX IF NOT EXISTS idx_project_metrics_summary_date 
ON project_metrics_summary(date);

-- Add index on project_id and date for common queries
CREATE INDEX IF NOT EXISTS idx_project_metrics_summary_project_date 
ON project_metrics_summary(project_id, date);