-- Migration: 085_vercel_integration_enhancements.sql
-- Purpose: Add missing Vercel integration features: granted_scopes, partition functions, advisory locks, breakglass
-- Author: SheenApps
-- Date: 2025-09-08

BEGIN;

-- =============================================================================
-- 1. ADD GRANTED_SCOPES TO VERCEL_CONNECTIONS
-- =============================================================================
-- Add granted_scopes column to track actually granted OAuth scopes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vercel_connections' AND column_name = 'granted_scopes'
  ) THEN
    ALTER TABLE vercel_connections ADD COLUMN granted_scopes TEXT;
    
    -- Update existing records to use scopes as granted_scopes if they exist
    UPDATE vercel_connections 
    SET granted_scopes = array_to_string(scopes, ' ')
    WHERE scopes IS NOT NULL AND array_length(scopes, 1) > 0;
  END IF;
END $$;

-- =============================================================================
-- 2. PARTITION MANAGEMENT FUNCTIONS
-- =============================================================================
-- Function to create monthly partitions for vercel_deployments
CREATE OR REPLACE FUNCTION create_vercel_deployments_partition(partition_date DATE)
RETURNS TEXT AS $$
DECLARE
  table_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := DATE_TRUNC('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  table_name := 'vercel_deployments_' || TO_CHAR(start_date, 'YYYY_MM');
  
  -- Create partition if it doesn't exist
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF vercel_deployments 
     FOR VALUES FROM (%L) TO (%L)',
    table_name, start_date, end_date
  );
  
  -- Create month-specific indexes for better performance
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I (deployment_state, created_at DESC) 
     WHERE deployment_state IN (''QUEUED'',''INITIALIZING'',''BUILDING'')',
    'idx_' || table_name || '_active_deployments',
    table_name
  );
  
  RETURN 'Created partition: ' || table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old partitions (for cleanup)
CREATE OR REPLACE FUNCTION drop_old_vercel_deployment_partitions(months_to_keep INTEGER DEFAULT 6)
RETURNS TEXT[] AS $$
DECLARE
  partition_record RECORD;
  dropped_tables TEXT[] := '{}';
  cutoff_date DATE;
BEGIN
  cutoff_date := DATE_TRUNC('month', CURRENT_DATE) - (months_to_keep || ' months')::INTERVAL;
  
  FOR partition_record IN 
    SELECT schemaname, tablename 
    FROM pg_tables 
    WHERE tablename LIKE 'vercel_deployments_____%%'
      AND tablename ~ '^vercel_deployments_\d{4}_\d{2}$'
  LOOP
    -- Extract date from table name and check if it's old enough
    IF (TO_DATE(SUBSTRING(partition_record.tablename FROM '\d{4}_\d{2}'), 'YYYY_MM')) < cutoff_date THEN
      EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(partition_record.tablename);
      dropped_tables := array_append(dropped_tables, partition_record.tablename);
    END IF;
  END LOOP;
  
  RETURN dropped_tables;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 3. ADVISORY LOCK FUNCTIONS FOR RACE-FREE PROMOTIONS
-- =============================================================================
-- Function to acquire deployment promotion lock (prevents concurrent promotions)
CREATE OR REPLACE FUNCTION vercel_lock_deployment_promotion(
  deployment_uuid UUID, 
  operation_type VARCHAR DEFAULT 'promotion'
)
RETURNS BOOLEAN AS $$
DECLARE
  lock_id BIGINT;
  acquired BOOLEAN;
BEGIN
  -- Generate deterministic lock ID from deployment UUID
  lock_id := ('x' || SUBSTRING(deployment_uuid::TEXT FROM 1 FOR 15))::BIT(60)::BIGINT;
  
  -- Try to acquire advisory lock (non-blocking)
  SELECT pg_try_advisory_lock(lock_id) INTO acquired;
  
  IF acquired THEN
    -- Log successful lock acquisition for monitoring
    INSERT INTO vercel_deployment_locks (
      deployment_id, operation_type, lock_id, acquired_at
    ) VALUES (
      deployment_uuid, operation_type, lock_id, NOW()
    );
  END IF;
  
  RETURN acquired;
END;
$$ LANGUAGE plpgsql;

-- Function to release deployment promotion lock
CREATE OR REPLACE FUNCTION vercel_unlock_deployment_promotion(
  deployment_uuid UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  lock_id BIGINT;
  released BOOLEAN;
BEGIN
  -- Generate same lock ID
  lock_id := ('x' || SUBSTRING(deployment_uuid::TEXT FROM 1 FOR 15))::BIT(60)::BIGINT;
  
  -- Release advisory lock
  SELECT pg_advisory_unlock(lock_id) INTO released;
  
  -- Update lock record
  UPDATE vercel_deployment_locks 
  SET released_at = NOW() 
  WHERE deployment_id = deployment_uuid AND released_at IS NULL;
  
  RETURN released;
END;
$$ LANGUAGE plpgsql;

-- Table to track advisory locks for monitoring/debugging
CREATE TABLE IF NOT EXISTS vercel_deployment_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL,
  operation_type VARCHAR(50) NOT NULL,
  lock_id BIGINT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lock monitoring and cleanup
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_locks_active 
  ON vercel_deployment_locks(deployment_id, acquired_at) 
  WHERE released_at IS NULL;

-- =============================================================================
-- 4. BREAKGLASS ACCESS SYSTEM TABLES
-- =============================================================================
-- Vercel-specific security audit log for all breakglass operations
CREATE TABLE IF NOT EXISTS vercel_security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  service VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vercel breakglass access requests tracking
CREATE TABLE IF NOT EXISTS vercel_breakglass_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(255) UNIQUE NOT NULL,
  requested_by VARCHAR(255) NOT NULL,
  justification TEXT NOT NULL,
  access_level VARCHAR(50) NOT NULL CHECK (access_level IN ('read_metadata', 'decrypt_tokens', 'emergency_recovery')),
  required_approvers TEXT[] NOT NULL,
  approved_by TEXT[] DEFAULT '{}',
  connection_ids UUID[] DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'expired', 'denied')),
  expires_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit and monitoring
CREATE INDEX IF NOT EXISTS idx_vercel_audit_log_timestamp 
  ON vercel_security_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_audit_log_action 
  ON vercel_security_audit_log(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_audit_log_service_severity 
  ON vercel_security_audit_log(service, severity, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_breakglass_requests_status 
  ON vercel_breakglass_access_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_vercel_breakglass_requests_requested_by 
  ON vercel_breakglass_access_requests(requested_by, created_at DESC);

-- =============================================================================
-- 5. STATE TRANSITION VALIDATION FUNCTION
-- =============================================================================
-- Function to validate deployment state transitions
CREATE OR REPLACE FUNCTION validate_vercel_deployment_state_transition(
  from_state vercel_deploy_state,
  to_state vercel_deploy_state
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN CASE 
    WHEN from_state = 'QUEUED' THEN to_state IN ('INITIALIZING', 'CANCELED')
    WHEN from_state = 'INITIALIZING' THEN to_state IN ('BUILDING', 'ERROR', 'CANCELED')
    WHEN from_state = 'BUILDING' THEN to_state IN ('READY', 'ERROR', 'CANCELED')
    WHEN from_state = 'READY' THEN to_state IN ('CANCELED')
    WHEN from_state = 'ERROR' THEN FALSE -- Terminal state
    WHEN from_state = 'CANCELED' THEN FALSE -- Terminal state
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to enforce state transition validation
CREATE OR REPLACE FUNCTION enforce_deployment_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if deployment_state is changing
  IF OLD.deployment_state IS DISTINCT FROM NEW.deployment_state THEN
    IF NOT validate_vercel_deployment_state_transition(OLD.deployment_state, NEW.deployment_state) THEN
      RAISE EXCEPTION 'Invalid deployment state transition from % to %', OLD.deployment_state, NEW.deployment_state
        USING ERRCODE = 'check_violation',
              HINT = 'Valid transitions: QUEUED→{INITIALIZING,CANCELED}, INITIALIZING→{BUILDING,ERROR,CANCELED}, BUILDING→{READY,ERROR,CANCELED}, READY→{CANCELED}';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_vercel_deployment_state_transition' 
    AND tgrelid = 'vercel_deployments'::regclass
  ) THEN
    CREATE TRIGGER enforce_vercel_deployment_state_transition
      BEFORE UPDATE ON vercel_deployments
      FOR EACH ROW EXECUTE FUNCTION enforce_deployment_state_transition();
  END IF;
END $$;

-- =============================================================================
-- 6. UTILITY FUNCTIONS FOR OPERATIONS
-- =============================================================================
-- Function to get deployment statistics (for monitoring dashboards)
CREATE OR REPLACE FUNCTION get_vercel_deployment_stats(
  project_uuid UUID DEFAULT NULL,
  days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_deployments BIGINT,
  successful_deployments BIGINT,
  failed_deployments BIGINT,
  avg_build_time_ms NUMERIC,
  deployments_by_state JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH deployment_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE deployment_state = 'READY') as successful,
      COUNT(*) FILTER (WHERE deployment_state = 'ERROR') as failed,
      AVG(build_duration_ms) FILTER (WHERE build_duration_ms IS NOT NULL) as avg_build_time,
      jsonb_object_agg(deployment_state, state_count) as by_state
    FROM (
      SELECT 
        deployment_state,
        COUNT(*) as state_count,
        build_duration_ms
      FROM vercel_deployments 
      WHERE 
        created_at >= NOW() - (days_back || ' days')::INTERVAL
        AND (project_uuid IS NULL OR project_id = project_uuid)
      GROUP BY deployment_state, build_duration_ms
    ) grouped
  )
  SELECT 
    total,
    successful,
    failed,
    avg_build_time,
    by_state
  FROM deployment_stats;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 7. CLEANUP FUNCTIONS
-- =============================================================================
-- Function to clean up old audit logs (retain 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_retain INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM vercel_security_audit_log 
  WHERE timestamp < NOW() - (days_to_retain || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup operation
  INSERT INTO vercel_security_audit_log (timestamp, action, details, severity, service)
  VALUES (
    NOW(), 
    'AUDIT_LOG_CLEANUP', 
    jsonb_build_object('deleted_count', deleted_count, 'retention_days', days_to_retain),
    'INFO',
    'system'
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired breakglass requests
CREATE OR REPLACE FUNCTION cleanup_expired_breakglass_requests()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM vercel_breakglass_access_requests 
  WHERE status = 'pending' AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Update expired status for tracking
  UPDATE vercel_breakglass_access_requests 
  SET status = 'expired' 
  WHERE status = 'pending' AND expires_at < NOW();
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 8. GRANTS AND PERMISSIONS
-- =============================================================================
-- Grant permissions for app_service role (only if role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    -- Grant table permissions
    GRANT ALL ON ALL TABLES IN SCHEMA public TO app_service;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_service;

    -- Grant execute permissions on functions
    GRANT EXECUTE ON FUNCTION create_vercel_deployments_partition(DATE) TO app_service;
    GRANT EXECUTE ON FUNCTION drop_old_vercel_deployment_partitions(INTEGER) TO app_service;
    GRANT EXECUTE ON FUNCTION vercel_lock_deployment_promotion(UUID, VARCHAR) TO app_service;
    GRANT EXECUTE ON FUNCTION vercel_unlock_deployment_promotion(UUID) TO app_service;
    GRANT EXECUTE ON FUNCTION validate_vercel_deployment_state_transition(vercel_deploy_state, vercel_deploy_state) TO app_service;
    GRANT EXECUTE ON FUNCTION get_vercel_deployment_stats(UUID, INTEGER) TO app_service;
    GRANT EXECUTE ON FUNCTION cleanup_old_audit_logs(INTEGER) TO app_service;
    GRANT EXECUTE ON FUNCTION cleanup_expired_breakglass_requests() TO app_service;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- =============================================================================
-- Run these to verify the migration worked correctly:
/*
-- 1. Verify granted_scopes column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vercel_connections' AND column_name = 'granted_scopes';

-- 2. Test partition function
SELECT create_vercel_deployments_partition(CURRENT_DATE + INTERVAL '1 month');

-- 3. Test state transition validation
SELECT validate_vercel_deployment_state_transition('QUEUED'::vercel_deploy_state, 'BUILDING'::vercel_deploy_state); -- Should return false
SELECT validate_vercel_deployment_state_transition('QUEUED'::vercel_deploy_state, 'INITIALIZING'::vercel_deploy_state); -- Should return true

-- 4. Verify breakglass tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('security_audit_log', 'breakglass_access_requests');

-- 5. Test deployment stats function
SELECT * FROM get_vercel_deployment_stats(null, 30);
*/