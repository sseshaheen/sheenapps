-- Migration: Add user_id tracking to security and adjustment tables
-- Purpose: Enable better user risk assessment and security monitoring
-- Date: 2025-09-07

BEGIN;

-- =====================================================
-- 1. Enhance security_audit_log table
-- =====================================================
ALTER TABLE security_audit_log 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
ADD COLUMN IF NOT EXISTS ip_address INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);

-- Add index for user-based queries
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id 
ON security_audit_log(user_id) 
WHERE user_id IS NOT NULL;

-- Add index for severity filtering
CREATE INDEX IF NOT EXISTS idx_security_audit_log_severity 
ON security_audit_log(severity) 
WHERE severity IS NOT NULL;

-- Add composite index for risk assessment queries
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_created 
ON security_audit_log(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- =====================================================
-- 2. Add user_id to advisor_adjustments
-- =====================================================
ALTER TABLE advisor_adjustments 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Backfill user_id from consultations (if adjustment has consultation_id)
UPDATE advisor_adjustments aa
SET user_id = ac.client_id
FROM advisor_consultations ac
WHERE aa.consultation_id = ac.id
AND aa.user_id IS NULL
AND aa.consultation_id IS NOT NULL;

-- Backfill user_id from advisor ownership (for adjustments without consultation)
UPDATE advisor_adjustments aa
SET user_id = a.user_id
FROM advisors a
WHERE aa.advisor_id = a.id
AND aa.user_id IS NULL
AND aa.consultation_id IS NULL;

-- Add index for user-based queries
CREATE INDEX IF NOT EXISTS idx_advisor_adjustments_user_id 
ON advisor_adjustments(user_id) 
WHERE user_id IS NOT NULL;

-- Add index for chargeback tracking
CREATE INDEX IF NOT EXISTS idx_advisor_adjustments_user_reason 
ON advisor_adjustments(user_id, reason) 
WHERE user_id IS NOT NULL AND reason = 'chargeback';

-- =====================================================
-- 3. Create helper view for risk assessment
-- =====================================================
CREATE OR REPLACE VIEW user_risk_metrics AS
WITH risk_factors AS (
  SELECT 
    u.id as user_id,
    u.email,
    u.created_at as account_created,
    
    -- Chargebacks (now simplified with user_id)
    COALESCE((
      SELECT COUNT(*)::integer 
      FROM advisor_adjustments
      WHERE user_id = u.id 
      AND reason = 'chargeback'
      AND created_at > NOW() - INTERVAL '6 months'
    ), 0) as chargebacks_6m,
    
    -- Security events (now simplified with user_id)
    COALESCE((
      SELECT COUNT(*)::integer 
      FROM security_audit_log
      WHERE user_id = u.id 
      AND severity IN ('high', 'critical')
      AND created_at > NOW() - INTERVAL '3 months'
    ), 0) as high_severity_events_3m,
    
    -- Failed payments
    COALESCE((
      SELECT COUNT(*)::integer 
      FROM billing_payments bp
      JOIN billing_customers bc ON bc.id = bp.customer_id
      WHERE bc.user_id = u.id 
      AND bp.status = 'failed'
      AND bp.created_at > NOW() - INTERVAL '3 months'
    ), 0) as failed_payments_3m,
    
    -- Admin actions against user
    COALESCE((
      SELECT COUNT(*)::integer 
      FROM admin_action_log
      WHERE resource_type = 'user' 
      AND resource_id = u.id::text
      AND action LIKE 'violation.%'
      AND created_at > NOW() - INTERVAL '6 months'
    ), 0) as violations_6m
    
  FROM auth.users u
)
SELECT 
  *,
  -- Calculate risk score (0-100)
  LEAST(100, (
    chargebacks_6m * 15 +           -- 15 points per chargeback
    high_severity_events_3m * 10 +  -- 10 points per high severity event
    failed_payments_3m * 3 +        -- 3 points per failed payment
    violations_6m * 12               -- 12 points per violation
  ))::integer as risk_score,
  
  -- Risk level categorization
  CASE
    WHEN LEAST(100, (
      chargebacks_6m * 15 + 
      high_severity_events_3m * 10 + 
      failed_payments_3m * 3 + 
      violations_6m * 12
    )) > 60 THEN 'critical'
    WHEN LEAST(100, (
      chargebacks_6m * 15 + 
      high_severity_events_3m * 10 + 
      failed_payments_3m * 3 + 
      violations_6m * 12
    )) > 30 THEN 'high'
    WHEN LEAST(100, (
      chargebacks_6m * 15 + 
      high_severity_events_3m * 10 + 
      failed_payments_3m * 3 + 
      violations_6m * 12
    )) > 10 THEN 'medium'
    ELSE 'low'
  END as risk_level
  
FROM risk_factors;

-- Grant appropriate permissions
GRANT SELECT ON user_risk_metrics TO authenticated;

-- =====================================================
-- 4. Create function to log security events
-- =====================================================
CREATE OR REPLACE FUNCTION log_security_event(
  p_user_id UUID,
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'low',
  p_details JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  INSERT INTO security_audit_log (
    user_id, event_type, severity, details, 
    ip_address, user_agent, created_at
  )
  VALUES (
    p_user_id, p_event_type, p_severity, p_details,
    p_ip_address, p_user_agent, NOW()
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. Add comment documentation
-- =====================================================
COMMENT ON COLUMN security_audit_log.user_id IS 'User associated with this security event';
COMMENT ON COLUMN security_audit_log.severity IS 'Event severity: low, medium, high, critical';
COMMENT ON COLUMN security_audit_log.ip_address IS 'IP address from which the event originated';
COMMENT ON COLUMN security_audit_log.user_agent IS 'User agent string if applicable';

COMMENT ON COLUMN advisor_adjustments.user_id IS 'Customer/user affected by this adjustment (refund/chargeback recipient)';

COMMENT ON VIEW user_risk_metrics IS 'Aggregated risk metrics per user for Trust & Safety monitoring';
COMMENT ON FUNCTION log_security_event IS 'Helper function to log security events with proper structure';

COMMIT;