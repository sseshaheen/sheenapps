-- Migration 020: Create R2 cleanup logs table
-- Date: July 27, 2025
-- Purpose: Track R2 cleanup job execution for monitoring and debugging

BEGIN;

-- Create table for R2 cleanup job logs
CREATE TABLE IF NOT EXISTS r2_cleanup_logs (
  id SERIAL PRIMARY KEY,
  cleanup_date DATE NOT NULL UNIQUE, -- One entry per day
  files_deleted INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying recent cleanup history
CREATE INDEX idx_r2_cleanup_logs_cleanup_date 
ON r2_cleanup_logs(cleanup_date DESC);

-- Index for monitoring queries
CREATE INDEX idx_r2_cleanup_logs_created_at 
ON r2_cleanup_logs(created_at DESC);

-- Add comment
COMMENT ON TABLE r2_cleanup_logs IS 'Daily R2 cleanup job execution logs for monitoring storage cleanup operations';
COMMENT ON COLUMN r2_cleanup_logs.cleanup_date IS 'Date of cleanup execution (YYYY-MM-DD)';
COMMENT ON COLUMN r2_cleanup_logs.files_deleted IS 'Number of orphaned diff packs deleted';
COMMENT ON COLUMN r2_cleanup_logs.errors_count IS 'Number of errors encountered during cleanup';
COMMENT ON COLUMN r2_cleanup_logs.duration_ms IS 'Cleanup execution time in milliseconds';

COMMIT;