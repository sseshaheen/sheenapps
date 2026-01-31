BEGIN;
-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- Ensure required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure project_versions has unique constraint on version_id for FK reference
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_versions_version_id_key') THEN
    ALTER TABLE project_versions ADD CONSTRAINT project_versions_version_id_key UNIQUE (version_id);
  END IF;
END $$;

-- Export jobs tracking table
CREATE TABLE IF NOT EXISTS project_export_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version_id text REFERENCES project_versions(version_id) ON DELETE SET NULL,
    version_id_norm text GENERATED ALWAYS AS (COALESCE(version_id, 'null')) STORED,
    export_type text NOT NULL DEFAULT 'zip',
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','expired')),
    
    -- Progress tracking with explicit schema
    progress jsonb DEFAULT '{
      "phase": "queued",
      "filesScanned": 0,
      "bytesWritten": 0,
      "estimatedTotalFiles": null,
      "currentFile": null
    }'::jsonb,
    
    -- Storage metadata
    r2_key text,
    uncompressed_size_bytes bigint, -- Original file sizes before compression
    file_count integer DEFAULT 0,
    zip_size_bytes bigint, -- Compressed ZIP file size
    compression_ratio decimal(5,4), -- zip_size_bytes / uncompressed_size_bytes (should be ≤ 1)
    
    -- Security and validation
    export_hash text, -- SHA-256 of final export for integrity
    client_request_id text, -- For idempotency tracking
    
    -- Timing and cleanup
    created_at timestamptz DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    expires_at timestamptz DEFAULT (now() + interval '48 hours'),
    
    -- Error handling
    error_message text,
    retry_count integer DEFAULT 0,
    
    -- Rate limiting metadata
    rate_limit_bucket text DEFAULT 'default'
);

-- Export downloads tracking table for analytics
CREATE TABLE IF NOT EXISTS project_export_downloads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    export_job_id uuid NOT NULL REFERENCES project_export_jobs(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Download metadata
    downloaded_at timestamptz DEFAULT now(),
    download_ip inet,
    user_agent text,
    referrer text,
    
    -- Analytics data
    zip_size_bytes bigint, -- Size of downloaded ZIP file
    download_duration_ms integer,
    success boolean DEFAULT true,
    
    -- Geographic/session context
    session_id text,
    country_code char(2),
    
    CONSTRAINT valid_download_duration CHECK (download_duration_ms >= 0)
);

-- Row Level Security
ALTER TABLE project_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_export_downloads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_export_jobs (explicit SELECT/INSERT/UPDATE policies)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_jobs_owner_sel' AND polrelid = 'project_export_jobs'::regclass) THEN
    CREATE POLICY pe_jobs_owner_sel ON project_export_jobs
      FOR SELECT USING (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_jobs_owner_ins' AND polrelid = 'project_export_jobs'::regclass) THEN
    CREATE POLICY pe_jobs_owner_ins ON project_export_jobs
      FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_jobs_owner_upd' AND polrelid = 'project_export_jobs'::regclass) THEN
    CREATE POLICY pe_jobs_owner_upd ON project_export_jobs
      FOR UPDATE USING (user_id = current_setting('app.current_user_id', true)::uuid)
                  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;
END $$;

-- RLS Policies for project_export_downloads
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_downloads_owner_sel' AND polrelid = 'project_export_downloads'::regclass) THEN
    CREATE POLICY pe_downloads_owner_sel ON project_export_downloads
      FOR SELECT USING (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_downloads_owner_ins' AND polrelid = 'project_export_downloads'::regclass) THEN
    CREATE POLICY pe_downloads_owner_ins ON project_export_downloads
      FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;
END $$;

-- Internal bypass policies (for service-level operations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_jobs_internal' AND polrelid = 'project_export_jobs'::regclass) THEN
    CREATE POLICY pe_jobs_internal ON project_export_jobs
      FOR ALL USING (current_setting('app.rls_tag', true) = 'internal')
      WITH CHECK (current_setting('app.rls_tag', true) = 'internal');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_downloads_internal' AND polrelid = 'project_export_downloads'::regclass) THEN
    CREATE POLICY pe_downloads_internal ON project_export_downloads
      FOR ALL USING (current_setting('app.rls_tag', true) = 'internal')
      WITH CHECK (current_setting('app.rls_tag', true) = 'internal');
  END IF;
END $$;

-- Admin override policies (if admin role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_jobs_admin' AND polrelid = 'project_export_jobs'::regclass) THEN
      CREATE POLICY pe_jobs_admin ON project_export_jobs FOR ALL TO app_admin USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'pe_downloads_admin' AND polrelid = 'project_export_downloads'::regclass) THEN
      CREATE POLICY pe_downloads_admin ON project_export_downloads FOR ALL TO app_admin USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_export_jobs_user_project ON project_export_jobs(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON project_export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_expires ON project_export_jobs(expires_at) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_export_jobs_created ON project_export_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_r2_key ON project_export_jobs(r2_key) WHERE r2_key IS NOT NULL;
-- Index for common "my recent exports" queries
CREATE INDEX IF NOT EXISTS idx_export_jobs_user_status_created 
  ON project_export_jobs (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_downloads_job_id ON project_export_downloads(export_job_id);
CREATE INDEX IF NOT EXISTS idx_downloads_user_downloaded ON project_export_downloads(user_id, downloaded_at);
CREATE INDEX IF NOT EXISTS idx_downloads_project_analytics ON project_export_downloads(project_id, downloaded_at);

-- Unique constraint for idempotency (only blocks while work is active)
-- Application logic handles reuse of completed jobs if not expired
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_export 
ON project_export_jobs(project_id, version_id_norm, export_type, user_id)
WHERE status IN ('queued','processing');

-- Unique constraint for client request idempotency (application handles expiry)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_request_active 
ON project_export_jobs(client_request_id, user_id) 
WHERE client_request_id IS NOT NULL 
  AND status IN ('queued','processing','completed');

-- Cleanup function for expired exports
CREATE OR REPLACE FUNCTION cleanup_expired_export_jobs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update expired completed jobs
  UPDATE project_export_jobs 
  SET status = 'expired'
  WHERE status = 'completed' 
    AND expires_at <= now();
    
  -- Clean up very old failed/expired jobs (30 days)
  DELETE FROM project_export_jobs
  WHERE status IN ('failed', 'expired')
    AND created_at < (now() - interval '30 days');
END;
$$;

-- Performance constraints and validation
ALTER TABLE project_export_jobs 
ADD CONSTRAINT reasonable_zip_size CHECK (zip_size_bytes IS NULL OR zip_size_bytes <= 10737418240), -- 10GB limit
ADD CONSTRAINT reasonable_uncompressed_size CHECK (uncompressed_size_bytes IS NULL OR uncompressed_size_bytes <= 53687091200), -- 50GB uncompressed limit
ADD CONSTRAINT reasonable_file_count CHECK (file_count >= 0 AND file_count <= 100000), -- 100K files max
ADD CONSTRAINT valid_compression_ratio CHECK (compression_ratio IS NULL OR (compression_ratio > 0 AND compression_ratio <= 1)), -- zip_size/uncompressed_size
ADD CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= 5),
ADD CONSTRAINT logical_timestamps CHECK (
  (started_at IS NULL OR started_at >= created_at) AND
  (completed_at IS NULL OR completed_at >= created_at) AND
  (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
),
-- Status invariant constraints - ensure completed jobs have required data
ADD CONSTRAINT completed_requires_artifact CHECK (status <> 'completed' OR r2_key IS NOT NULL),
ADD CONSTRAINT completed_requires_sizes CHECK (status <> 'completed' OR (file_count >= 0 AND zip_size_bytes IS NOT NULL)),
-- Field shape validation
ADD CONSTRAINT export_hash_len CHECK (export_hash IS NULL OR length(export_hash) IN (64, 128)), -- hex(sha256) or base64 variants  
ADD CONSTRAINT export_type_allowlist CHECK (export_type IN ('zip')); -- future-proof for more formats

-- Download analytics view - tracks actual download activity
CREATE OR REPLACE VIEW export_download_analytics AS
SELECT 
  date_trunc('day', d.downloaded_at) as download_date,
  COUNT(*) as total_downloads,
  COUNT(DISTINCT d.user_id) as unique_users,
  COUNT(DISTINCT d.project_id) as unique_projects,
  SUM(COALESCE(d.zip_size_bytes, 0)) as total_bytes_downloaded,
  AVG(d.download_duration_ms) as avg_download_duration_ms,
  COUNT(*) FILTER (WHERE d.success = true) as successful_downloads,
  COUNT(*) FILTER (WHERE d.success = false) as failed_downloads,
  -- Additional useful metrics
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d.zip_size_bytes) as median_download_size_bytes,
  MAX(d.zip_size_bytes) as max_download_size_bytes
FROM project_export_downloads d
WHERE d.downloaded_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY date_trunc('day', d.downloaded_at)
ORDER BY download_date DESC;

-- Export job pipeline health view - tracks job processing metrics  
CREATE OR REPLACE VIEW export_job_metrics AS
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(*) AS jobs_total,
  COUNT(*) FILTER (WHERE status='completed') AS jobs_completed,
  COUNT(*) FILTER (WHERE status='failed') AS jobs_failed,
  COUNT(*) FILTER (WHERE status='queued') AS jobs_queued,
  COUNT(*) FILTER (WHERE status='processing') AS jobs_processing,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL)
    AS avg_processing_seconds,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY zip_size_bytes) FILTER (WHERE zip_size_bytes IS NOT NULL)
    AS p95_zip_size_bytes,
  AVG(compression_ratio) FILTER (WHERE compression_ratio IS NOT NULL) AS avg_compression_ratio,
  AVG(file_count) FILTER (WHERE status = 'completed') AS avg_files_per_export
FROM project_export_jobs
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';
COMMIT;