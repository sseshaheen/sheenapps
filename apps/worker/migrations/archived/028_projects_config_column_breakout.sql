-- Migration 028: Break down projects.config JSONB column into proper database columns
-- This improves query performance, adds type safety, and enables better indexing

BEGIN;

-- 1. Create enum for build status (with future states)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'build_status') THEN
    CREATE TYPE build_status AS ENUM (
      'queued',
      'building', 
      'deployed',
      'failed',
      'canceled',
      'superseded'
    );
  END IF;
END
$$;

-- 2. Add new columns with appropriate defaults and constraints
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS build_status        build_status   NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS current_build_id    varchar(64),
  ADD COLUMN IF NOT EXISTS current_version_id  text,
  ADD COLUMN IF NOT EXISTS framework           varchar(16)    NOT NULL DEFAULT 'react',
  ADD COLUMN IF NOT EXISTS preview_url         text,
  ADD COLUMN IF NOT EXISTS last_build_started  timestamptz,
  ADD COLUMN IF NOT EXISTS last_build_completed timestamptz;

-- 3. Add check constraints for data validation (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_framework_valid') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_framework_valid 
      CHECK (framework IN ('react', 'nextjs', 'vue', 'svelte'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_preview_url_format') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_preview_url_format
      CHECK (preview_url IS NULL OR preview_url ~* '^https?://');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_build_timing_logical') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_build_timing_logical
      CHECK (last_build_completed IS NULL OR last_build_started IS NULL OR last_build_completed >= last_build_started);
  END IF;
END
$$;

-- 4. Back-fill data from existing config JSON column
UPDATE projects
SET
  build_status         = COALESCE(
    CASE 
      WHEN (config ->> 'status') = 'queued' THEN 'queued'::build_status
      WHEN (config ->> 'status') = 'building' THEN 'building'::build_status  
      WHEN (config ->> 'status') = 'deployed' THEN 'deployed'::build_status
      WHEN (config ->> 'status') = 'failed' THEN 'failed'::build_status
      ELSE 'queued'::build_status
    END, 
    'queued'::build_status
  ),
  current_build_id     = config ->> 'buildId',
  current_version_id   = config ->> 'versionId',
  framework            = COALESCE(
    CASE 
      WHEN config ->> 'framework' IN ('react', 'nextjs', 'vue', 'svelte') 
      THEN config ->> 'framework' 
      ELSE NULL 
    END, 
    'react'
  ),
  preview_url          = CASE 
    WHEN config ->> 'previewUrl' ~* '^https?://' 
    THEN config ->> 'previewUrl' 
    ELSE NULL 
  END,
  last_build_started   = CASE 
    WHEN config ->> 'lastBuildStarted' IS NOT NULL 
    THEN (config ->> 'lastBuildStarted')::timestamptz 
    ELSE NULL 
  END,
  last_build_completed = CASE 
    WHEN config ->> 'lastBuildCompleted' IS NOT NULL 
    THEN (config ->> 'lastBuildCompleted')::timestamptz 
    ELSE NULL 
  END,
  -- Clean up config JSON: remove promoted keys but preserve other data
  config = CASE 
    WHEN config IS NOT NULL 
    THEN config - ARRAY[
      'status', 'buildId', 'versionId', 'framework',
      'previewUrl', 'lastBuildStarted', 'lastBuildCompleted'
    ]
    ELSE '{}'::jsonb
  END
WHERE config IS NOT NULL;

-- 5. Add foreign key constraints (deferred to avoid temporary violations, idempotent)
DO $$
BEGIN  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_current_build_fk') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_current_build_fk
      FOREIGN KEY (current_build_id) REFERENCES project_build_metrics(build_id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_current_version_fk') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_current_version_fk  
      FOREIGN KEY (current_version_id) REFERENCES project_versions(version_id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

-- 6. Create performance indexes
CREATE INDEX IF NOT EXISTS projects_build_status_idx 
  ON projects(build_status);

CREATE INDEX IF NOT EXISTS projects_framework_idx
  ON projects(framework);

CREATE INDEX IF NOT EXISTS projects_last_build_started_idx
  ON projects(last_build_started DESC);

CREATE INDEX IF NOT EXISTS projects_current_build_lookup_idx
  ON projects(current_build_id) WHERE current_build_id IS NOT NULL;

-- 7. Add helpful comment for future reference
COMMENT ON COLUMN projects.build_status IS 'Current build status: queued, building, deployed, failed, canceled, superseded';
COMMENT ON COLUMN projects.current_build_id IS 'ID of the currently active build (FK to project_build_metrics.build_id)';
COMMENT ON COLUMN projects.current_version_id IS 'UUID of the current project version (FK to project_versions.version_id)';
COMMENT ON COLUMN projects.framework IS 'Frontend framework: react, nextjs, vue, svelte';
COMMENT ON COLUMN projects.config IS 'Remaining configuration data not promoted to dedicated columns';

-- 8. Update any empty config columns to empty JSON object for consistency
UPDATE projects SET config = '{}'::jsonb WHERE config IS NULL;

COMMIT;

-- Post-migration verification queries (run these manually to verify):
-- SELECT build_status, count(*) FROM projects GROUP BY build_status;
-- SELECT framework, count(*) FROM projects GROUP BY framework;  
-- SELECT count(*) FROM projects WHERE config != '{}'::jsonb; -- Should show remaining non-promoted config data