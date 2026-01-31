-- Migration: 086_vercel_advanced_features.sql
-- Purpose: Add Phase 3 advanced features for Vercel integration
-- Features: Auto-deploy, PR comments, domains, guardrails, build optimization
-- Author: SheenApps
-- Date: 2025-09-08

BEGIN;

-- =============================================================================
-- 1. DEPLOYMENT APPROVALS (Auto-Deploy)
-- =============================================================================
-- Deployment approval requests table for auto-deploy workflows
CREATE TABLE IF NOT EXISTS vercel_deployment_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vercel_project_id VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(255) NOT NULL,
  commit_message TEXT,
  target_environment VARCHAR(20) NOT NULL CHECK (target_environment IN ('production', 'preview')),
  requested_by VARCHAR(255) NOT NULL,
  approved_by VARCHAR(255),
  pull_request_number INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'deployed')),
  approval_reason TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  deployment_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. PR COMMENTS TRACKING
-- =============================================================================
-- PR comments tracking table for deployment status updates
CREATE TABLE IF NOT EXISTS vercel_pr_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deployment_id VARCHAR(255) NOT NULL,
  pull_request_number INTEGER NOT NULL,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket')),
  repository_id VARCHAR(255) NOT NULL,
  comment_id VARCHAR(255),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'building', 'ready', 'error', 'canceled')),
  deployment_url TEXT,
  preview_url TEXT,
  build_logs_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, pull_request_number, provider)
);

-- =============================================================================
-- 3. DOMAIN MANAGEMENT
-- =============================================================================
-- Vercel domains table for custom domain management
CREATE TABLE IF NOT EXISTS vercel_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vercel_project_id VARCHAR(255) NOT NULL,
  domain_name VARCHAR(253) NOT NULL,
  git_branch VARCHAR(255),
  redirect_target VARCHAR(500),
  https_redirect BOOLEAN DEFAULT true,
  configured_by VARCHAR(255) NOT NULL,
  verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'error')),
  ssl_certificate_info JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vercel_project_id, domain_name)
);

-- =============================================================================
-- 4. DEPLOYMENT GUARDRAILS
-- =============================================================================
-- Deployment override tokens for bypassing guardrails
CREATE TABLE IF NOT EXISTS vercel_deployment_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  override_reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deployment guardrail audit log
CREATE TABLE IF NOT EXISTS vercel_deployment_guardrail_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch VARCHAR(255) NOT NULL,
  target_environment VARCHAR(20) NOT NULL,
  commit_sha VARCHAR(255) NOT NULL,
  requested_by VARCHAR(255) NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  blocking_warnings INTEGER DEFAULT 0,
  override_token_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. BUILD OPTIMIZATION
-- =============================================================================
-- Build metrics tracking for performance analysis
CREATE TABLE IF NOT EXISTS vercel_build_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id VARCHAR(255) UNIQUE NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  build_duration_ms INTEGER,
  bundle_size_bytes BIGINT,
  framework VARCHAR(100),
  node_version VARCHAR(50),
  region VARCHAR(50),
  cache_hit_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimization recommendations cache
CREATE TABLE IF NOT EXISTS vercel_build_optimization_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recommendations JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. PERFORMANCE INDEXES
-- =============================================================================
-- Deployment approvals indexes
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_approvals_project 
  ON vercel_deployment_approvals(project_id, status);
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_approvals_status_expires 
  ON vercel_deployment_approvals(status, expires_at) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_approvals_branch 
  ON vercel_deployment_approvals(project_id, branch, status);

-- PR comments indexes
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_project_pr 
  ON vercel_pr_comments(project_id, pull_request_number);
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_deployment 
  ON vercel_pr_comments(deployment_id);
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_status 
  ON vercel_pr_comments(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_vercel_pr_comments_cleanup 
  ON vercel_pr_comments(created_at);

-- Domain management indexes
CREATE INDEX IF NOT EXISTS idx_vercel_domains_project 
  ON vercel_domains(project_id);
CREATE INDEX IF NOT EXISTS idx_vercel_domains_vercel_project 
  ON vercel_domains(vercel_project_id);
CREATE INDEX IF NOT EXISTS idx_vercel_domains_status 
  ON vercel_domains(verification_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_vercel_domains_domain_name 
  ON vercel_domains(domain_name);

-- Deployment guardrails indexes
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_overrides_project 
  ON vercel_deployment_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_overrides_token 
  ON vercel_deployment_overrides(token);
CREATE INDEX IF NOT EXISTS idx_vercel_guardrail_checks_project 
  ON vercel_deployment_guardrail_checks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_guardrail_checks_blocking 
  ON vercel_deployment_guardrail_checks(project_id, blocking_warnings) 
  WHERE blocking_warnings > 0;

-- Build optimization indexes
CREATE INDEX IF NOT EXISTS idx_vercel_build_metrics_project_created 
  ON vercel_build_metrics(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_build_metrics_deployment 
  ON vercel_build_metrics(deployment_id);
CREATE INDEX IF NOT EXISTS idx_vercel_build_metrics_framework 
  ON vercel_build_metrics(framework, build_duration_ms);
CREATE INDEX IF NOT EXISTS idx_vercel_build_optimization_cache_generated 
  ON vercel_build_optimization_cache(generated_at);

-- =============================================================================
-- 7. UPDATED TRIGGER FUNCTIONS
-- =============================================================================
-- Updated trigger to update timestamp on all relevant tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to new tables
DO $$
BEGIN
  -- Deployment approvals
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_vercel_deployment_approvals_updated_at') THEN
    CREATE TRIGGER trigger_vercel_deployment_approvals_updated_at
      BEFORE UPDATE ON vercel_deployment_approvals
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- PR comments
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_vercel_pr_comments_updated_at') THEN
    CREATE TRIGGER trigger_vercel_pr_comments_updated_at
      BEFORE UPDATE ON vercel_pr_comments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- Domains
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_vercel_domains_updated_at') THEN
    CREATE TRIGGER trigger_vercel_domains_updated_at
      BEFORE UPDATE ON vercel_domains
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- Build metrics
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_vercel_build_metrics_updated_at') THEN
    CREATE TRIGGER trigger_vercel_build_metrics_updated_at
      BEFORE UPDATE ON vercel_build_metrics
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- 8. CLEANUP FUNCTIONS FOR MAINTENANCE
-- =============================================================================
-- Function to clean up expired deployment approvals
CREATE OR REPLACE FUNCTION cleanup_expired_deployment_approvals()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Mark expired approvals
  UPDATE vercel_deployment_approvals 
  SET status = 'expired' 
  WHERE status = 'pending' AND expires_at < NOW();

  -- Delete old expired approvals (older than 90 days)
  DELETE FROM vercel_deployment_approvals 
  WHERE status = 'expired' AND expires_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old PR comments (retain 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_pr_comments()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM vercel_pr_comments 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old build metrics (retain 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_build_metrics()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM vercel_build_metrics 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 9. GRANTS AND PERMISSIONS
-- =============================================================================
-- Grant permissions for app_service role (only if role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    -- Grant table permissions
    GRANT ALL ON ALL TABLES IN SCHEMA public TO app_service;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_service;

    -- Grant execute permissions on cleanup functions
    GRANT EXECUTE ON FUNCTION cleanup_expired_deployment_approvals() TO app_service;
    GRANT EXECUTE ON FUNCTION cleanup_old_pr_comments() TO app_service;
    GRANT EXECUTE ON FUNCTION cleanup_old_build_metrics() TO app_service;
    GRANT EXECUTE ON FUNCTION update_updated_at_column() TO app_service;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- =============================================================================
-- Run these to verify the migration worked correctly:
/*
-- 1. Verify all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'vercel_%' 
AND table_schema = 'public'
ORDER BY table_name;

-- 2. Check table row counts (should be 0 for new tables)
SELECT 
  'vercel_deployment_approvals' as table_name, 
  COUNT(*) as row_count 
FROM vercel_deployment_approvals
UNION ALL
SELECT 
  'vercel_pr_comments', 
  COUNT(*) 
FROM vercel_pr_comments
UNION ALL
SELECT 
  'vercel_domains', 
  COUNT(*) 
FROM vercel_domains
UNION ALL
SELECT 
  'vercel_deployment_overrides', 
  COUNT(*) 
FROM vercel_deployment_overrides
UNION ALL
SELECT 
  'vercel_build_metrics', 
  COUNT(*) 
FROM vercel_build_metrics;

-- 3. Test cleanup functions
SELECT cleanup_expired_deployment_approvals();
SELECT cleanup_old_pr_comments();
SELECT cleanup_old_build_metrics();

-- 4. Verify indexes were created
SELECT 
  schemaname, 
  tablename, 
  indexname 
FROM pg_indexes 
WHERE tablename LIKE 'vercel_%'
AND schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. Check constraints and triggers
SELECT 
  t.table_name, 
  t.trigger_name, 
  t.event_manipulation 
FROM information_schema.triggers t
WHERE t.trigger_schema = 'public' 
AND t.table_name LIKE 'vercel_%'
ORDER BY t.table_name;
*/