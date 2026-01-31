-- =============================================================================
-- Migration 107: In-House Job Schedules Table
--
-- Creates the inhouse_job_schedules table for Easy Mode project scheduled jobs.
-- Part of EASY_MODE_SDK_PLAN.md - @sheenapps/jobs SDK support.
-- =============================================================================

-- Create the job schedules table
CREATE TABLE IF NOT EXISTS inhouse_job_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Foreign key to projects table
  CONSTRAINT fk_job_schedules_project
    FOREIGN KEY (project_id)
    REFERENCES projects(id)
    ON DELETE CASCADE,

  -- Unique schedule name per project
  CONSTRAINT uq_job_schedules_name_per_project
    UNIQUE (project_id, name)
);

-- Create index for project lookups
CREATE INDEX IF NOT EXISTS idx_job_schedules_project_id
  ON inhouse_job_schedules(project_id);

-- Create index for finding active schedules due to run
CREATE INDEX IF NOT EXISTS idx_job_schedules_active_next_run
  ON inhouse_job_schedules(active, next_run_at)
  WHERE active = true;

-- Add updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_job_schedules_updated_at'
    AND tgrelid = 'inhouse_job_schedules'::regclass
  ) THEN
    CREATE TRIGGER update_job_schedules_updated_at
      BEFORE UPDATE ON inhouse_job_schedules
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Add RLS policies
ALTER TABLE inhouse_job_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'job_schedules_service_all') THEN
    CREATE POLICY job_schedules_service_all
      ON inhouse_job_schedules
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Comment on table
COMMENT ON TABLE inhouse_job_schedules IS
  'Scheduled jobs for Easy Mode projects - stores cron-based job definitions';

-- Comment on columns
COMMENT ON COLUMN inhouse_job_schedules.name IS
  'Job name - unique per project, used to identify the scheduled task';
COMMENT ON COLUMN inhouse_job_schedules.cron_expression IS
  'Cron expression (5 or 6 parts) defining when the job runs';
COMMENT ON COLUMN inhouse_job_schedules.payload IS
  'JSON payload passed to the job when it runs';
COMMENT ON COLUMN inhouse_job_schedules.timezone IS
  'Timezone for interpreting the cron expression (IANA timezone name)';
COMMENT ON COLUMN inhouse_job_schedules.active IS
  'Whether the schedule is active (true) or paused (false)';
COMMENT ON COLUMN inhouse_job_schedules.next_run_at IS
  'Calculated next run time based on cron expression';
COMMENT ON COLUMN inhouse_job_schedules.last_run_at IS
  'Timestamp of the last successful job run';
