-- Migration 091: Migration Integration Enhancement
-- Adds tables and schema updates for Phase 2 & 3 migration integration
-- Includes retry management, SSE events, idempotency, analytics, and enterprise features
-- Incorporates expert feedback: race condition fixes, performance optimizations, and security hardening

BEGIN;

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add AI time tracking fields to migration_projects if not already present
ALTER TABLE migration_projects
  ADD COLUMN IF NOT EXISTS ai_time_consumed_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_ai_time_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS soft_budget_seconds INTEGER DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS hard_budget_seconds INTEGER DEFAULT 3600;

-- Add constraints for data integrity
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ai_time_nonneg_mp') THEN
    ALTER TABLE migration_projects
      ADD CONSTRAINT ck_ai_time_nonneg_mp CHECK (ai_time_consumed_seconds >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ai_estimate_nonneg_mp') THEN
    ALTER TABLE migration_projects
      ADD CONSTRAINT ck_ai_estimate_nonneg_mp CHECK (estimated_ai_time_seconds >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_retry_nonneg_mp') THEN
    ALTER TABLE migration_projects
      ADD CONSTRAINT ck_retry_nonneg_mp CHECK (retry_count >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_budget_positive_mp') THEN
    ALTER TABLE migration_projects
      ADD CONSTRAINT ck_budget_positive_mp CHECK (soft_budget_seconds > 0 AND hard_budget_seconds > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_budget_hierarchy_mp') THEN
    ALTER TABLE migration_projects
      ADD CONSTRAINT ck_budget_hierarchy_mp CHECK (soft_budget_seconds <= hard_budget_seconds);
  END IF;
END $$;

-- Add deterministic retry fields to migration_projects
ALTER TABLE migration_projects
  ADD COLUMN IF NOT EXISTS run_seed INTEGER,
  ADD COLUMN IF NOT EXISTS prompt_hash TEXT,
  ADD COLUMN IF NOT EXISTS tool_contract_version TEXT DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'claude-3-5-sonnet-20241022';

-- Migration retry attempts table
CREATE TABLE IF NOT EXISTS migration_retries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  retry_reason TEXT NOT NULL CHECK (retry_reason IN ('tool_timeout', 'ownership_failed', 'budget_exceeded', 'builder_incompatibility', 'deployment_error')),
  previous_phase TEXT,
  new_settings JSONB,
  initiated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project creation tracking with idempotent UPSERT support
CREATE TABLE IF NOT EXISTS migration_project_links (
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  target_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (migration_project_id, target_project_id)
);

-- SSE events for backfill support with BIGSERIAL id cursor
-- Note: seq column kept for backward compatibility but id used as primary cursor to avoid race conditions
CREATE TABLE IF NOT EXISTS migration_events (
  id BIGSERIAL PRIMARY KEY,
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  seq BIGINT, -- Deprecated: use id as cursor to avoid MAX(seq)+1 race conditions
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL CHECK (type IN (
    'phase_update', 'metric', 'log', 'error', 'done',
    'migration.budget_warning', 'migration_started', 'verification_completed',
    'verification_failed', 'phase_started', 'phase_completed',
    'migration_completed', 'migration_failed', 'migration_cancelled'
  )),
  payload JSONB NOT NULL
);

-- Idempotency replay storage
CREATE TABLE IF NOT EXISTS migration_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  status INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dead letter queue for poison messages
CREATE TABLE IF NOT EXISTS migration_job_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  original_job_id UUID NOT NULL,
  original_error TEXT,
  retry_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  poison_reason TEXT NOT NULL,
  requires_manual_intervention BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tracking context for avoiding trackingId parsing
CREATE TABLE IF NOT EXISTS migration_tracking_context (
  tracking_id TEXT PRIMARY KEY,
  migration_id UUID NOT NULL,
  phase TEXT NOT NULL,
  context_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retry reasons for analytics (with constrained reason types for consistency)
CREATE TABLE IF NOT EXISTS migration_retry_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  reason_type TEXT NOT NULL CHECK (reason_type IN (
    'tool_timeout', 'ownership_failed', 'budget_exceeded',
    'builder_incompatibility', 'deployment_error', 'user_request',
    'ai_error', 'network_error', 'rate_limit', 'system_error'
  )),
  context_data JSONB,
  retryable BOOLEAN DEFAULT true,
  user_action_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verification polling attempts for enhanced UX
CREATE TABLE IF NOT EXISTS migration_verification_attempts (
  migration_project_id UUID PRIMARY KEY REFERENCES migration_projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('dns', 'file')),
  token TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  next_check_at TIMESTAMPTZ,
  error_message TEXT
);

-- Analytics events for tracking migration metrics
CREATE TABLE IF NOT EXISTS migration_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('started', 'completed', 'failed', 'retry', 'cancelled')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User feedback for satisfaction tracking
CREATE TABLE IF NOT EXISTS migration_user_feedback (
  migration_project_id UUID PRIMARY KEY REFERENCES migration_projects(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily metrics aggregation for performance monitoring
CREATE TABLE IF NOT EXISTS migration_metrics_daily (
  date DATE PRIMARY KEY,
  total_migrations INTEGER DEFAULT 0,
  successful_migrations INTEGER DEFAULT 0,
  failed_migrations INTEGER DEFAULT 0,
  total_ai_time INTEGER DEFAULT 0,
  avg_duration INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization migration configuration for enterprise features
CREATE TABLE IF NOT EXISTS organization_migration_config (
  org_id UUID PRIMARY KEY,
  custom_budgets JSONB DEFAULT '{}',
  priority_level TEXT DEFAULT 'standard' CHECK (priority_level IN ('standard', 'premium', 'enterprise')),
  dedicated_support JSONB DEFAULT '{"enabled": false}',
  advanced_features JSONB DEFAULT '{}',
  migration_limits JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization migration customization (prompts, hooks, quality gates)
CREATE TABLE IF NOT EXISTS organization_migration_customization (
  org_id UUID PRIMARY KEY,
  custom_prompts JSONB DEFAULT '{}',
  integration_hooks JSONB DEFAULT '{}',
  quality_gates JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bulk migration jobs for enterprise batch operations
CREATE TABLE IF NOT EXISTS bulk_migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  urls JSONB NOT NULL,
  user_brief JSONB DEFAULT '{}',
  scheduling JSONB DEFAULT '{}',
  notifications JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job system hygiene: Add attempts, last_error, last_attempt_at to migration_jobs
ALTER TABLE migration_jobs
  ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_migration_retries_project
  ON migration_retries(migration_project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_project_links_project
  ON migration_project_links(migration_project_id);

CREATE INDEX IF NOT EXISTS idx_migration_project_links_target
  ON migration_project_links(target_project_id);

-- Composite index for efficient backfill queries: WHERE migration_project_id=$1 AND id > $sinceId
CREATE INDEX IF NOT EXISTS idx_migration_events_project_id_cursor
  ON migration_events(migration_project_id, id);

-- Legacy seq-based index (deprecated, use id cursor instead)
CREATE INDEX IF NOT EXISTS idx_migration_events_project_seq
  ON migration_events(migration_project_id, seq) WHERE seq IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_migration_idempotency_cleanup
  ON migration_idempotency(created_at);

CREATE INDEX IF NOT EXISTS idx_migration_job_dlq_project
  ON migration_job_dlq(migration_project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_tracking_context_migration
  ON migration_tracking_context(migration_id, phase);

CREATE INDEX IF NOT EXISTS idx_migration_retry_reasons_project
  ON migration_retry_reasons(migration_project_id, reason_type, created_at DESC);

-- Enable RLS on new tables
ALTER TABLE migration_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_job_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_tracking_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_retry_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_migration_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_migration_customization ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_migration_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DO $$
BEGIN
  -- Migration retries policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_retries_user_access') THEN
    CREATE POLICY migration_retries_user_access ON migration_retries
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration project links policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_project_links_user_access') THEN
    CREATE POLICY migration_project_links_user_access ON migration_project_links
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration events policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_events_user_access') THEN
    CREATE POLICY migration_events_user_access ON migration_events
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration idempotency policy (service-level access only)
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_idempotency_service_access') THEN
    CREATE POLICY migration_idempotency_service_access ON migration_idempotency
      FOR ALL USING (
        COALESCE(current_setting('app.service_role', true)::boolean, false) = true
        OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role'
      );
  END IF;

  -- Migration job DLQ policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_job_dlq_user_access') THEN
    CREATE POLICY migration_job_dlq_user_access ON migration_job_dlq
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration tracking context policy (service-level access only)
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_tracking_context_service_access') THEN
    CREATE POLICY migration_tracking_context_service_access ON migration_tracking_context
      FOR ALL USING (
        COALESCE(current_setting('app.service_role', true)::boolean, false) = true
        OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role'
      );
  END IF;

  -- Migration retry reasons policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_retry_reasons_user_access') THEN
    CREATE POLICY migration_retry_reasons_user_access ON migration_retry_reasons
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration verification attempts policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_verification_attempts_user_access') THEN
    CREATE POLICY migration_verification_attempts_user_access ON migration_verification_attempts
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration analytics events policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_analytics_events_user_access') THEN
    CREATE POLICY migration_analytics_events_user_access ON migration_analytics_events
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration user feedback policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_user_feedback_user_access') THEN
    CREATE POLICY migration_user_feedback_user_access ON migration_user_feedback
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM migration_projects mp
          WHERE mp.id = migration_project_id
          AND mp.user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;

  -- Migration metrics daily policy (read-only for all users)
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_metrics_daily_read_access') THEN
    CREATE POLICY migration_metrics_daily_read_access ON migration_metrics_daily
      FOR SELECT USING (true);
  END IF;

  -- Organization migration config policy (org admins only)
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'organization_migration_config_org_access') THEN
    CREATE POLICY organization_migration_config_org_access ON organization_migration_config
      FOR ALL USING (
        org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)::UUID
          AND role IN ('admin', 'owner')
        )
      );
  END IF;

  -- Organization migration customization policy (org admins only)
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'organization_migration_customization_org_access') THEN
    CREATE POLICY organization_migration_customization_org_access ON organization_migration_customization
      FOR ALL USING (
        org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)::UUID
          AND role IN ('admin', 'owner')
        )
      );
  END IF;

  -- Bulk migration jobs policy (org members)
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'bulk_migration_jobs_org_access') THEN
    CREATE POLICY bulk_migration_jobs_org_access ON bulk_migration_jobs
      FOR ALL USING (
        org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;
END $$;

-- Normalized URL dedupe improvement (prevent duplicates on retries)
-- Update existing unique index to include user_id for cross-tenant dedupe
DROP INDEX IF EXISTS idx_migration_projects_normalized_url_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_projects_normalized_url_user_active
  ON migration_projects(user_id, normalized_source_url)
  WHERE status IN ('analyzing', 'questionnaire', 'processing');

-- Create cleanup function for old idempotency records
CREATE OR REPLACE FUNCTION cleanup_migration_idempotency()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM migration_idempotency
  WHERE created_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Create cleanup function for old tracking context
CREATE OR REPLACE FUNCTION cleanup_migration_tracking_context()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM migration_tracking_context
  WHERE created_at < NOW() - INTERVAL '48 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Migration budget enforcement function (optimized for concurrency and performance)
CREATE OR REPLACE FUNCTION check_migration_budget_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if AI time consumed exceeds hard budget
  IF NEW.ai_time_consumed_seconds > NEW.hard_budget_seconds THEN
    RAISE EXCEPTION 'Migration AI time consumed (% seconds) exceeds hard budget (% seconds)',
      NEW.ai_time_consumed_seconds, NEW.hard_budget_seconds;
  END IF;

  -- Only emit warning on threshold crossing (not every update) to reduce event spam
  -- Check if we crossed the 90% soft budget threshold
  IF COALESCE(OLD.ai_time_consumed_seconds, 0) <= (NEW.soft_budget_seconds * 0.9)
     AND NEW.ai_time_consumed_seconds > (NEW.soft_budget_seconds * 0.9) THEN

    -- Use id-based cursor instead of racy MAX(seq)+1 pattern
    INSERT INTO migration_events (migration_project_id, type, payload)
    VALUES (
      NEW.id,
      'migration.budget_warning',
      jsonb_build_object(
        'consumed', NEW.ai_time_consumed_seconds,
        'soft_budget', NEW.soft_budget_seconds,
        'hard_budget', NEW.hard_budget_seconds,
        'percentage_used', ROUND((NEW.ai_time_consumed_seconds::numeric / NEW.soft_budget_seconds) * 100, 2)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for budget enforcement (AFTER UPDATE to reduce hot-spotting)
DO $$
BEGIN
  -- Drop old BEFORE UPDATE trigger if it exists
  DROP TRIGGER IF EXISTS tr_migration_budget_check ON migration_projects;

  -- Create new AFTER UPDATE trigger for better performance
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_migration_budget_check_after' AND tgrelid = 'migration_projects'::regclass) THEN
    CREATE TRIGGER tr_migration_budget_check_after
      AFTER UPDATE OF ai_time_consumed_seconds ON migration_projects
      FOR EACH ROW
      EXECUTE FUNCTION check_migration_budget_limits();
  END IF;
END $$;

-- Auto-update updated_at columns (expert feedback: missing triggers)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

-- Add updated_at triggers for tables that need them
DO $$
BEGIN
  -- migration_tracking_context updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_mtc_updated_at') THEN
    CREATE TRIGGER tr_mtc_updated_at
      BEFORE UPDATE ON migration_tracking_context
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  -- migration_user_feedback updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_muf_updated_at') THEN
    CREATE TRIGGER tr_muf_updated_at
      BEFORE UPDATE ON migration_user_feedback
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  -- migration_metrics_daily updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_mmd_updated_at') THEN
    CREATE TRIGGER tr_mmd_updated_at
      BEFORE UPDATE ON migration_metrics_daily
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  -- organization_migration_config updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_org_cfg_updated_at') THEN
    CREATE TRIGGER tr_org_cfg_updated_at
      BEFORE UPDATE ON organization_migration_config
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  -- organization_migration_customization updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_org_cust_updated_at') THEN
    CREATE TRIGGER tr_org_cust_updated_at
      BEFORE UPDATE ON organization_migration_customization
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE migration_retries IS 'Tracks retry attempts for failed migrations with reason taxonomy';
COMMENT ON TABLE migration_project_links IS 'Links migration projects to created target projects (idempotent)';
COMMENT ON TABLE migration_events IS 'Stores SSE events for migration progress with cursor-based pagination';
COMMENT ON TABLE migration_idempotency IS 'Stores idempotency keys and responses for replay protection';
COMMENT ON TABLE migration_job_dlq IS 'Dead letter queue for poison migration jobs requiring manual intervention';
COMMENT ON TABLE migration_tracking_context IS 'Stores tracking context to avoid parsing UUIDs from trackingId';
COMMENT ON TABLE migration_retry_reasons IS 'Analytics table for retry reason taxonomy and patterns';

COMMENT ON COLUMN migration_projects.ai_time_consumed_seconds IS 'Total AI time consumed across all migration phases';
COMMENT ON COLUMN migration_projects.soft_budget_seconds IS 'Warning threshold for AI time consumption';
COMMENT ON COLUMN migration_projects.hard_budget_seconds IS 'Hard limit for AI time consumption';
COMMENT ON COLUMN migration_projects.run_seed IS 'Seed for deterministic retry reproducibility';
COMMENT ON COLUMN migration_projects.prompt_hash IS 'Hash of prompts for deterministic retry detection';

-- Add organization foreign key constraints for data integrity (expert feedback)
-- Note: Only add if organizations table exists to avoid breaking in dev environments
DO $$
BEGIN
  -- Check if organizations table exists before adding constraints
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public') THEN

    -- organization_migration_config FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_org_cfg_org') THEN
      ALTER TABLE organization_migration_config
        ADD CONSTRAINT fk_org_cfg_org
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;

    -- organization_migration_customization FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_org_cust_org') THEN
      ALTER TABLE organization_migration_customization
        ADD CONSTRAINT fk_org_cust_org
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;

    -- bulk_migration_jobs FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bulk_jobs_org') THEN
      ALTER TABLE bulk_migration_jobs
        ADD CONSTRAINT fk_bulk_jobs_org
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;

  ELSE
    -- Log that organizations table not found (for debugging)
    RAISE NOTICE 'organizations table not found - skipping FK constraints';
  END IF;
END $$;

-- Optional: Add cleanup scheduling with pg_cron (if available in environment)
-- Uncomment and modify for production deployment with pg_cron support
/*
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Cleanup idempotency records daily at 2:05 AM
    PERFORM cron.schedule('cleanup_migration_idempotency_daily', '5 2 * * *',
      'SELECT cleanup_migration_idempotency();');

    -- Cleanup tracking context every 2 hours
    PERFORM cron.schedule('cleanup_migration_tracking_ctx_hourly', '0 0,2,4,6,8,10,12,14,16,18,20,22 * * *',
      'SELECT cleanup_migration_tracking_context();');

    RAISE NOTICE 'pg_cron cleanup jobs scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron not available - cleanup must be scheduled externally';
  END IF;
END $$;
*/

COMMIT;