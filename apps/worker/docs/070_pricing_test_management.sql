-- Migration: Pricing Test Management System  
-- Date: 2025-01-16
-- Description: Complete database schema for Safe Activation Testing
-- Follows project migration best practices from CLAUDE.md

BEGIN;
-- Use PostgreSQL best practice: bypass RLS triggers during migration
SET session_replication_role = 'replica';

-- ================================
-- Core Test Management Tables
-- ================================

-- Main test configurations table
CREATE TABLE IF NOT EXISTS pricing_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Test identification
    name VARCHAR(255) NOT NULL,
    description TEXT,
    test_type VARCHAR(50) NOT NULL DEFAULT 'ab_test', 
    
    -- Related catalog (references existing pricing_catalog_versions)
    source_catalog_id UUID REFERENCES pricing_catalog_versions(id),
    test_catalog_id UUID REFERENCES pricing_catalog_versions(id),
    
    -- Test status
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    
    -- Schedule and duration
    scheduled_start_at TIMESTAMPTZ,
    actual_start_at TIMESTAMPTZ,
    scheduled_end_at TIMESTAMPTZ,
    actual_end_at TIMESTAMPTZ,
    
    -- Success criteria (JSON configuration)
    success_criteria JSONB DEFAULT '{}',
    auto_promote_on_success BOOLEAN DEFAULT false,
    
    -- Test configuration
    test_config JSONB DEFAULT '{}',
    
    -- Results summary (updated in real-time)
    current_metrics JSONB DEFAULT '{}',
    
    -- Audit fields
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_test_type CHECK (test_type IN ('ab_test', 'gradual_rollout', 'geographic', 'segment')),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
    CONSTRAINT valid_schedule CHECK (scheduled_end_at IS NULL OR scheduled_end_at > scheduled_start_at)
);

-- Test configuration details (normalized from main table)
CREATE TABLE IF NOT EXISTS pricing_test_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES pricing_tests(id) ON DELETE CASCADE,
    
    -- Configuration type and settings
    config_type VARCHAR(100) NOT NULL,
    config_data JSONB NOT NULL,
    
    -- Ordering for staged rollouts
    execution_order INTEGER DEFAULT 1,
    
    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test results tracking (time-series data)
CREATE TABLE IF NOT EXISTS pricing_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES pricing_tests(id) ON DELETE CASCADE,
    
    -- Measurement period
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measurement_window INTERVAL DEFAULT INTERVAL '1 hour',
    
    -- Test group identification
    test_group VARCHAR(100) NOT NULL,
    
    -- Metrics (JSON for flexibility)
    metrics JSONB NOT NULL DEFAULT '{}',
    /*
    Example metrics structure:
    {
        "conversions": 150,
        "total_visitors": 1000,
        "conversion_rate": 0.15,
        "revenue": 12500.00,
        "avg_order_value": 83.33,
        "bounce_rate": 0.35,
        "session_duration": 185.5
    }
    */
    
    -- Statistical significance
    sample_size INTEGER,
    confidence_level DECIMAL(5,4),
    p_value DECIMAL(10,8),
    is_statistically_significant BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rollout progress tracking for gradual deployments
CREATE TABLE IF NOT EXISTS pricing_test_rollout_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES pricing_tests(id) ON DELETE CASCADE,
    
    -- Rollout stage information
    stage_name VARCHAR(100) NOT NULL,
    target_percentage DECIMAL(5,2),
    actual_percentage DECIMAL(5,2),
    
    -- Stage status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    
    -- Success criteria for this stage
    stage_success_criteria JSONB,
    criteria_met BOOLEAN,
    
    -- Error tracking
    error_message TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_percentage CHECK (target_percentage >= 0 AND target_percentage <= 100),
    CONSTRAINT valid_rollout_status CHECK (status IN ('pending', 'active', 'completed', 'failed', 'rolled_back'))
);

-- Audit log for all test-related actions
CREATE TABLE IF NOT EXISTS pricing_test_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES pricing_tests(id) ON DELETE CASCADE,
    
    -- Action details
    action VARCHAR(100) NOT NULL,
    actor_id UUID REFERENCES auth.users(id),
    actor_email VARCHAR(255),
    
    -- Action context
    reason TEXT,
    correlation_id UUID,
    
    -- Before/after state for sensitive actions
    before_state JSONB,
    after_state JSONB,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- Indexes for Performance
-- ================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_pricing_tests_status ON pricing_tests(status);
CREATE INDEX IF NOT EXISTS idx_pricing_tests_created_by ON pricing_tests(created_by);
CREATE INDEX IF NOT EXISTS idx_pricing_tests_catalog ON pricing_tests(source_catalog_id, test_catalog_id);
CREATE INDEX IF NOT EXISTS idx_pricing_tests_schedule ON pricing_tests(scheduled_start_at, scheduled_end_at);

-- Test configurations
CREATE INDEX IF NOT EXISTS idx_test_configurations_test ON pricing_test_configurations(test_id, config_type);
CREATE INDEX IF NOT EXISTS idx_test_configurations_active ON pricing_test_configurations(test_id) WHERE is_active = true;

-- Results time-series queries
CREATE INDEX IF NOT EXISTS idx_test_results_time ON pricing_test_results(test_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_group ON pricing_test_results(test_id, test_group, measured_at);
CREATE INDEX IF NOT EXISTS idx_test_results_significance ON pricing_test_results(test_id, is_statistically_significant);

-- Rollout progress
CREATE INDEX IF NOT EXISTS idx_rollout_progress_test ON pricing_test_rollout_progress(test_id, stage_name);
CREATE INDEX IF NOT EXISTS idx_rollout_progress_status ON pricing_test_rollout_progress(status, started_at);

-- Audit logs
CREATE INDEX IF NOT EXISTS idx_test_audit_logs_test ON pricing_test_audit_logs(test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_audit_logs_actor ON pricing_test_audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_audit_logs_correlation ON pricing_test_audit_logs(correlation_id);

-- ================================
-- Row Level Security (RLS)
-- ================================

-- Enable RLS on all tables
ALTER TABLE pricing_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_test_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_test_rollout_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_test_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only access policies (following project conventions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_pricing_tests') THEN
    CREATE POLICY admin_pricing_tests ON pricing_tests
      FOR ALL TO authenticated 
      USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_pricing_test_configurations') THEN
    CREATE POLICY admin_pricing_test_configurations ON pricing_test_configurations
      FOR ALL TO authenticated 
      USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_pricing_test_results') THEN
    CREATE POLICY admin_pricing_test_results ON pricing_test_results
      FOR ALL TO authenticated 
      USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_pricing_test_rollout_progress') THEN
    CREATE POLICY admin_pricing_test_rollout_progress ON pricing_test_rollout_progress
      FOR ALL TO authenticated 
      USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_pricing_test_audit_logs') THEN
    CREATE POLICY admin_pricing_test_audit_logs ON pricing_test_audit_logs
      FOR ALL TO authenticated 
      USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'));
  END IF;
END $$;

-- ================================
-- Database Functions for Test Management
-- ================================

-- Function to create a new test with initial configuration
CREATE OR REPLACE FUNCTION create_pricing_test(
    p_name VARCHAR(255),
    p_description TEXT,
    p_test_type VARCHAR(50),
    p_source_catalog_id UUID,
    p_test_catalog_id UUID,
    p_test_config JSONB,
    p_success_criteria JSONB,
    p_created_by UUID,
    p_reason TEXT DEFAULT NULL,
    p_correlation_id UUID DEFAULT NULL
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_test_id UUID;
    v_correlation_id UUID;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid());
    
    -- Insert the main test record
    INSERT INTO pricing_tests (
        name, description, test_type, source_catalog_id, test_catalog_id,
        test_config, success_criteria, created_by
    ) VALUES (
        p_name, p_description, p_test_type, p_source_catalog_id, p_test_catalog_id,
        p_test_config, p_success_criteria, p_created_by
    ) RETURNING id INTO v_test_id;
    
    -- Create audit log entry
    INSERT INTO pricing_test_audit_logs (
        test_id, action, actor_id, reason, correlation_id,
        after_state, metadata
    ) VALUES (
        v_test_id, 'test_created', p_created_by, p_reason, v_correlation_id,
        jsonb_build_object('test_type', p_test_type, 'name', p_name),
        jsonb_build_object('source_catalog_id', p_source_catalog_id, 'test_catalog_id', p_test_catalog_id)
    );
    
    RETURN v_test_id;
END;
$$;

-- Function to start a test
CREATE OR REPLACE FUNCTION start_pricing_test(
    p_test_id UUID,
    p_actor_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_correlation_id UUID DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_correlation_id UUID;
    v_current_status VARCHAR(50);
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid());
    
    -- Check current status
    SELECT status INTO v_current_status FROM pricing_tests WHERE id = p_test_id;
    
    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Test not found';
    END IF;
    
    IF v_current_status NOT IN ('draft', 'scheduled') THEN
        RAISE EXCEPTION 'Test cannot be started from status: %', v_current_status;
    END IF;
    
    -- Update test status
    UPDATE pricing_tests 
    SET status = 'running', 
        actual_start_at = NOW(),
        updated_at = NOW()
    WHERE id = p_test_id;
    
    -- Create audit log entry
    INSERT INTO pricing_test_audit_logs (
        test_id, action, actor_id, reason, correlation_id,
        before_state, after_state
    ) VALUES (
        p_test_id, 'test_started', p_actor_id, p_reason, v_correlation_id,
        jsonb_build_object('status', v_current_status),
        jsonb_build_object('status', 'running', 'started_at', NOW())
    );
    
    RETURN true;
END;
$$;

-- Function to record test metrics
CREATE OR REPLACE FUNCTION record_test_metrics(
    p_test_id UUID,
    p_test_group VARCHAR(100),
    p_metrics JSONB,
    p_measurement_window INTERVAL DEFAULT INTERVAL '1 hour',
    p_measured_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_result_id UUID;
BEGIN
    INSERT INTO pricing_test_results (
        test_id, test_group, metrics, measurement_window, measured_at,
        sample_size
    ) VALUES (
        p_test_id, p_test_group, p_metrics, p_measurement_window, p_measured_at,
        COALESCE((p_metrics->>'total_visitors')::INTEGER, (p_metrics->>'sample_size')::INTEGER, 0)
    ) RETURNING id INTO v_result_id;
    
    -- Update current_metrics on main test record
    UPDATE pricing_tests 
    SET current_metrics = jsonb_set(
        COALESCE(current_metrics, '{}'::jsonb),
        ARRAY[p_test_group], 
        p_metrics
    ),
    updated_at = NOW()
    WHERE id = p_test_id;
    
    RETURN v_result_id;
END;
$$;

-- ================================
-- Triggers for Automatic Updates
-- ================================

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers with idempotency checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'pricing_tests_updated_at' 
    AND tgrelid = 'pricing_tests'::regclass
  ) THEN
    CREATE TRIGGER pricing_tests_updated_at 
      BEFORE UPDATE ON pricing_tests 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'pricing_test_configurations_updated_at' 
    AND tgrelid = 'pricing_test_configurations'::regclass
  ) THEN
    CREATE TRIGGER pricing_test_configurations_updated_at 
      BEFORE UPDATE ON pricing_test_configurations 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'pricing_test_rollout_progress_updated_at' 
    AND tgrelid = 'pricing_test_rollout_progress'::regclass
  ) THEN
    CREATE TRIGGER pricing_test_rollout_progress_updated_at 
      BEFORE UPDATE ON pricing_test_rollout_progress 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ================================
-- Table Comments for Documentation
-- ================================

COMMENT ON TABLE pricing_tests IS 'Main table for pricing test configurations and status tracking';
COMMENT ON TABLE pricing_test_results IS 'Time-series data for test metrics and results';
COMMENT ON TABLE pricing_test_rollout_progress IS 'Progress tracking for gradual rollout tests';
COMMENT ON TABLE pricing_test_audit_logs IS 'Comprehensive audit trail for all test-related actions';

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';
COMMIT;