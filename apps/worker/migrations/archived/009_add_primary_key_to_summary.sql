-- Migration: Add primary key to project_metrics_summary
-- Date: 2025-07-25
-- Purpose: Add an id column as primary key to allow row deletion and updates

-- Add an id column as primary key
ALTER TABLE project_metrics_summary 
  ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;

-- The existing unique constraint on (project_id, user_id, date) remains intact
-- This ensures we still have only one summary per project per day

-- Add comment
COMMENT ON COLUMN project_metrics_summary.id IS 'Primary key for row identification and management';