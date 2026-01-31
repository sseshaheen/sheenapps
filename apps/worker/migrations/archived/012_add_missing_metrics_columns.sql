-- Add missing columns to project_metrics_summary table
ALTER TABLE project_metrics_summary
ADD COLUMN IF NOT EXISTS avg_ai_duration_sec DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_install_duration_sec DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_build_duration_sec DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_deploy_duration_sec DECIMAL(10,2) DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_metrics_summary_project_user
ON project_metrics_summary(project_id, user_id);

-- Update the stored procedure to match the table structure
-- This ensures the update_project_metrics_summary function works correctly
