-- Migration: Add sample security alerts for testing
-- Purpose: Populate security_audit_log with sample alerts for admin panel
-- Date: 2025-09-07
-- NOTE: This is for development/testing only

BEGIN;

-- Only insert sample data if the table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM security_audit_log LIMIT 1) THEN
    -- Insert various types of security alerts
    INSERT INTO security_audit_log (user_id, event_type, severity, details, ip_address, user_agent, created_at)
    VALUES 
      -- Critical security breach
      (
        (SELECT id FROM auth.users LIMIT 1),
        'security_breach_detected',
        'critical',
        '{"reason": "Multiple unauthorized access attempts", "attempt_count": 15}'::jsonb,
        '192.168.1.100'::inet,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        NOW() - INTERVAL '2 hours'
      ),
      
      -- High severity login failures
      (
        (SELECT id FROM auth.users OFFSET 1 LIMIT 1),
        'login_failure_repeated',
        'high',
        '{"reason": "Failed login attempts", "attempt_count": 5}'::jsonb,
        '10.0.0.50'::inet,
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        NOW() - INTERVAL '4 hours'
      ),
      
      -- Medium severity rate limit
      (
        (SELECT id FROM auth.users OFFSET 2 LIMIT 1),
        'rate_limit_exceeded',
        'medium',
        '{"endpoint": "/api/data", "requests_count": 150, "time_window": "1 minute"}'::jsonb,
        '172.16.0.25'::inet,
        'curl/7.68.0',
        NOW() - INTERVAL '6 hours'
      ),
      
      -- New location access
      (
        (SELECT id FROM auth.users OFFSET 3 LIMIT 1),
        'new_location_access',
        'medium',
        '{"location": "Tokyo, Japan", "previous_location": "New York, USA"}'::jsonb,
        '203.0.113.45'::inet,
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1)',
        NOW() - INTERVAL '1 day'
      ),
      
      -- Suspicious activity
      (
        (SELECT id FROM auth.users OFFSET 4 LIMIT 1),
        'suspicious_activity_detected',
        'high',
        '{"pattern": "Rapid API calls", "action_count": 500}'::jsonb,
        '198.51.100.75'::inet,
        'Python/3.9 aiohttp/3.8.1',
        NOW() - INTERVAL '2 days'
      ),
      
      -- Another login failure (resolved)
      (
        (SELECT id FROM auth.users OFFSET 5 LIMIT 1),
        'login_failure',
        'low',
        '{"reason": "Incorrect password", "attempt_count": 1}'::jsonb,
        '192.0.2.100'::inet,
        'Mozilla/5.0 (X11; Linux x86_64)',
        NOW() - INTERVAL '3 days'
      ),
      
      -- Anomaly detected
      (
        (SELECT id FROM auth.users OFFSET 6 LIMIT 1),
        'anomaly_detected',
        'medium',
        '{"type": "Unusual access pattern", "confidence": 0.85}'::jsonb,
        '172.31.0.50'::inet,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
        NOW() - INTERVAL '4 days'
      ),
      
      -- Geo-location anomaly
      (
        (SELECT id FROM auth.users OFFSET 7 LIMIT 1),
        'geo_anomaly',
        'high',
        '{"locations": ["USA", "Russia", "China"], "time_span": "30 minutes"}'::jsonb,
        '185.220.100.240'::inet,
        'Unknown',
        NOW() - INTERVAL '5 days'
      );
    
    -- Mark some alerts as resolved
    UPDATE security_audit_log 
    SET 
      resolved_at = created_at + INTERVAL '2 hours',
      resolved_by = (SELECT id FROM auth.users WHERE email LIKE '%admin%' LIMIT 1)
    WHERE event_type IN ('login_failure', 'anomaly_detected')
    AND resolved_at IS NULL;
    
    RAISE NOTICE 'Sample security alerts inserted successfully';
  ELSE
    RAISE NOTICE 'Security alerts already exist, skipping sample data insertion';
  END IF;
END $$;

COMMIT;