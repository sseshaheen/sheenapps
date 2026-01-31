-- Migration: Admin Session Tracking
-- Date: 2025-08-31
-- Description: Add session tracking table for admin JWT tokens

BEGIN;

-- Create admin_sessions table for tracking active admin sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by UUID REFERENCES auth.users(id),
  revoked_reason TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_session_id ON admin_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

-- RLS Policies for admin_sessions
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

-- Only super admins can see all sessions (using JWT claims, not database columns)
CREATE POLICY admin_sessions_super_admin_all 
  ON admin_sessions FOR ALL 
  TO authenticated 
  USING (
    -- Check JWT claims for super_admin role (consistent with other admin policies)
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (auth.jwt() ->> 'is_admin')::boolean = true
    OR EXISTS (
      SELECT 1 
      FROM jsonb_array_elements_text(COALESCE(auth.jwt() -> 'admin_permissions', '[]'::jsonb)) p
      WHERE p = 'admin.super'
    )
  );

-- Admins can see their own sessions
CREATE POLICY admin_sessions_own_sessions 
  ON admin_sessions FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_admin_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM admin_sessions 
  WHERE expires_at < NOW() - INTERVAL '7 days'; -- Keep expired sessions for 7 days for audit
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_admin_sessions() TO authenticated;

-- Add environment variable validation
DO $$
BEGIN
  IF current_setting('app.admin_jwt_secret', true) IS NULL THEN
    RAISE WARNING 'ADMIN_JWT_SECRET environment variable should be set for admin JWT signing';
  END IF;
END $$;

COMMIT;

-- Add comment for documentation
COMMENT ON TABLE admin_sessions IS 'Tracks active admin JWT sessions for audit and revocation purposes';
COMMENT ON COLUMN admin_sessions.session_id IS 'Unique session identifier embedded in JWT claims';
COMMENT ON COLUMN admin_sessions.permissions IS 'Snapshot of admin permissions at token issuance';
COMMENT ON FUNCTION cleanup_expired_admin_sessions() IS 'Cleans up expired admin sessions older than 7 days';