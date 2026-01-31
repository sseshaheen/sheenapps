-- Add denormalized columns to usage_tracking table
-- The check_and_consume_quota function expects these columns to exist

-- Add the new columns for each metric type
ALTER TABLE usage_tracking 
ADD COLUMN IF NOT EXISTS ai_generations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS projects_created INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS exports INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_mb INTEGER DEFAULT 0;

-- Drop any columns that are no longer needed
ALTER TABLE usage_tracking 
DROP COLUMN IF EXISTS metric_name CASCADE,
DROP COLUMN IF EXISTS metric_value CASCADE,
DROP COLUMN IF EXISTS usage_amount CASCADE,
DROP COLUMN IF EXISTS period_end CASCADE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_usage_tracking_period 
ON usage_tracking(user_id, period_start DESC);

-- Add comment to clarify the table structure
COMMENT ON TABLE usage_tracking IS 'Tracks usage metrics per user per billing period with denormalized columns for each metric type';
COMMENT ON COLUMN usage_tracking.ai_generations IS 'Number of AI generations used in the period';
COMMENT ON COLUMN usage_tracking.projects_created IS 'Number of projects created in the period';
COMMENT ON COLUMN usage_tracking.exports IS 'Number of exports made in the period';
COMMENT ON COLUMN usage_tracking.storage_mb IS 'Storage used in MB in the period';