-- Migration: Inhouse Backups Infrastructure
-- Purpose: Automated daily backups for Easy Mode project databases
-- Date: 2026-01-24

-- =============================================================================
-- BACKUP METADATA TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,

  -- Backup details
  format TEXT NOT NULL DEFAULT 'custom' CHECK (format IN ('custom', 'plain', 'directory')),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL,

  -- Storage location
  r2_bucket TEXT NOT NULL DEFAULT 'sheenapps-backups',
  r2_key TEXT NOT NULL,

  -- Encryption (envelope encryption like secrets)
  encrypted_data_key TEXT, -- DEK encrypted with master key
  data_key_iv TEXT,        -- IV for DEK encryption
  encryption_iv TEXT,      -- IV for backup encryption

  -- Provenance
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system' CHECK (created_by IN ('system', 'user', 'admin')),
  reason TEXT NOT NULL DEFAULT 'daily' CHECK (reason IN ('daily', 'manual', 'pre_destructive', 'pre_restore')),

  -- Database version info (for restore compatibility)
  db_host TEXT,
  db_version TEXT,

  -- Retention
  retention_expires_at TIMESTAMPTZ NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'deleted')),
  error TEXT,
  completed_at TIMESTAMPTZ,

  -- Audit
  downloaded_at TIMESTAMPTZ,
  downloaded_by UUID REFERENCES auth.users(id),
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inhouse_backups_project_id ON inhouse_backups(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_backups_created_at ON inhouse_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_backups_status ON inhouse_backups(status);
CREATE INDEX IF NOT EXISTS idx_inhouse_backups_retention ON inhouse_backups(retention_expires_at)
  WHERE status = 'completed';

-- Note: "One daily backup per project" is enforced at the application level
-- rather than database level, because DATE() is not IMMUTABLE and cannot
-- be used in index expressions. The application checks for existing daily
-- backups before creating new ones.

-- =============================================================================
-- RESTORE TRACKING TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_restores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  backup_id UUID NOT NULL REFERENCES inhouse_backups(id),

  -- Restore details
  target_schema TEXT NOT NULL,        -- The schema being restored to
  temp_schema TEXT,                   -- Temp schema during restore
  old_schema TEXT,                    -- Old schema after swap (kept for 24h)

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'creating_pre_restore_backup',  -- Creating backup before restore
    'restoring',           -- pg_restore running
    'validating',          -- Sanity checks
    'swapping',            -- Schema rename
    'completed',
    'failed',
    'rolled_back'
  )),

  -- Temporary data storage (for in-progress restores)
  temp_dump_data TEXT,                -- Base64-encoded backup data during restore
  pre_restore_backup_id UUID REFERENCES inhouse_backups(id),  -- Backup created before restore

  -- Validation results
  validation_results JSONB,  -- { table_count, row_counts, missing_tables, etc. }

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Provenance
  initiated_by UUID REFERENCES auth.users(id),
  initiated_by_type TEXT NOT NULL DEFAULT 'admin' CHECK (initiated_by_type IN ('admin', 'user', 'system')),

  -- Error tracking
  error TEXT,
  error_details JSONB,

  -- Cleanup
  old_schema_cleanup_at TIMESTAMPTZ,  -- When to drop old schema
  old_schema_dropped_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inhouse_restores_project_id ON inhouse_restores(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_restores_status ON inhouse_restores(status);
CREATE INDEX IF NOT EXISTS idx_inhouse_restores_cleanup ON inhouse_restores(old_schema_cleanup_at)
  WHERE old_schema IS NOT NULL AND old_schema_dropped_at IS NULL;

-- =============================================================================
-- BACKUP AUDIT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_backup_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  backup_id UUID REFERENCES inhouse_backups(id),
  restore_id UUID REFERENCES inhouse_restores(id),

  action TEXT NOT NULL CHECK (action IN (
    'backup_created',
    'backup_completed',
    'backup_failed',
    'backup_downloaded',
    'backup_deleted',
    'restore_initiated',
    'restore_completed',
    'restore_failed',
    'restore_rolled_back',
    'old_schema_dropped'
  )),

  actor_id UUID REFERENCES auth.users(id),
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'user', 'admin')),

  details JSONB,
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inhouse_backup_audit_project ON inhouse_backup_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_backup_audit_created ON inhouse_backup_audit_log(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE inhouse_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_restores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_backup_audit_log ENABLE ROW LEVEL SECURITY;

-- Project owners can view their backups
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_backups_owner_select') THEN
    CREATE POLICY inhouse_backups_owner_select ON inhouse_backups
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- Project owners can view their restores
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_restores_owner_select') THEN
    CREATE POLICY inhouse_restores_owner_select ON inhouse_restores
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- Project owners can view their audit log
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_backup_audit_owner_select') THEN
    CREATE POLICY inhouse_backup_audit_owner_select ON inhouse_backup_audit_log
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get retention period based on user's plan
CREATE OR REPLACE FUNCTION get_backup_retention_days(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_plan_name TEXT;
BEGIN
  SELECT bp.name INTO v_plan_name
  FROM projects p
  JOIN billing_customers bc ON bc.user_id = p.owner_id
  JOIN billing_plans bp ON bp.id = bc.plan_id
  WHERE p.id = p_project_id;

  -- Default retention by plan
  RETURN CASE v_plan_name
    WHEN 'free' THEN 7
    WHEN 'starter' THEN 14
    WHEN 'pro' THEN 30
    WHEN 'enterprise' THEN 90
    ELSE 7  -- Default to free tier
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate retention expiry for new backup
CREATE OR REPLACE FUNCTION calculate_backup_retention(p_project_id UUID)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN NOW() + (get_backup_retention_days(p_project_id) || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- QUOTA INTEGRATION
-- =============================================================================

-- Add backup_storage_bytes to quota tracking if not exists
DO $$
BEGIN
  -- Check if column exists, add if not
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inhouse_quotas' AND column_name = 'backup_storage_bytes'
  ) THEN
    ALTER TABLE inhouse_quotas ADD COLUMN backup_storage_bytes BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE inhouse_quotas ADD COLUMN backup_storage_limit_bytes BIGINT NOT NULL DEFAULT 104857600; -- 100MB default
  END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE inhouse_backups IS 'Automated and manual backups for Easy Mode project schemas';
COMMENT ON TABLE inhouse_restores IS 'Restore operations tracking with schema swap workflow';
COMMENT ON TABLE inhouse_backup_audit_log IS 'Audit trail for all backup/restore operations';
COMMENT ON COLUMN inhouse_backups.format IS 'pg_dump format: custom (recommended), plain (SQL), directory';
COMMENT ON COLUMN inhouse_backups.encrypted_data_key IS 'Data Encryption Key encrypted with master key (envelope encryption)';
COMMENT ON COLUMN inhouse_restores.temp_schema IS 'Temporary schema used during restore, renamed to target after validation';
COMMENT ON COLUMN inhouse_restores.old_schema IS 'Original schema renamed during swap, kept for 24h for rollback';
