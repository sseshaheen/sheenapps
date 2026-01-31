-- Migration: Mobile Authentication Tables
-- Purpose: Support OTP-based mobile authentication for the SheenApps app
-- Date: 2026-01-31
--
-- IMPORTANT: This uses the EXISTING Supabase auth.users table.
-- Mobile users are the same SheenApps customers who use the web app.
-- We only add mobile-specific session management on top.

BEGIN;

-- =============================================================================
-- MOBILE OTP TABLE
-- Stores one-time password codes for mobile authentication
-- References auth.users (existing Supabase Auth)
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mobile_otp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity - references existing Supabase users
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    platform VARCHAR(10) DEFAULT 'mobile', -- 'ios', 'android', 'mobile'

    -- OTP data (hash only, never store plaintext)
    otp_hash VARCHAR(64) NOT NULL,

    -- Security
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,

    -- Request metadata
    ip_address INET,
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One OTP per email+device pair at a time
    UNIQUE(email, device_id)
);

-- Index for OTP lookups
CREATE INDEX IF NOT EXISTS idx_mobile_otp_email_device ON inhouse_mobile_otp(email, device_id);
CREATE INDEX IF NOT EXISTS idx_mobile_otp_expires ON inhouse_mobile_otp(expires_at) WHERE consumed_at IS NULL;

-- =============================================================================
-- MOBILE SESSIONS TABLE
-- Stores active mobile app sessions with access and refresh tokens
-- References auth.users (existing Supabase Auth)
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mobile_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identification - references existing Supabase users
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    platform VARCHAR(10) DEFAULT 'mobile', -- 'ios', 'android', 'mobile'

    -- Token hashes (never store plaintext tokens)
    access_token_hash VARCHAR(64) NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,

    -- Session lifecycle
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),

    -- Request metadata
    ip_address INET,
    user_agent TEXT,

    -- Push notification token (for sending notifications to this device)
    push_token TEXT,
    push_provider VARCHAR(20), -- 'expo', 'fcm', 'apns'

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One session per user+device pair
    UNIQUE(user_id, device_id)
);

-- Indexes for session lookups
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_user ON inhouse_mobile_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_access_token ON inhouse_mobile_sessions(access_token_hash);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_refresh_token ON inhouse_mobile_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_device ON inhouse_mobile_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_active ON inhouse_mobile_sessions(user_id)
    WHERE revoked_at IS NULL;

-- =============================================================================
-- PUSH NOTIFICATION PREFERENCES TABLE
-- Per-device notification settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mobile_push_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to session
    session_id UUID NOT NULL REFERENCES inhouse_mobile_sessions(id) ON DELETE CASCADE,

    -- Global preferences
    enabled BOOLEAN DEFAULT TRUE,

    -- Per-type preferences (default all enabled)
    prefs JSONB DEFAULT '{
        "leads": true,
        "orders": true,
        "deploys": true,
        "marketing": false,
        "digest": true
    }',

    -- Per-project overrides (optional)
    project_prefs JSONB DEFAULT '{}',

    -- Quiet hours
    quiet_start TIME,
    quiet_end TIME,
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Locale for notification content
    locale VARCHAR(10) DEFAULT 'en',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(session_id)
);

-- =============================================================================
-- CLEANUP TRIGGER: Auto-delete expired OTPs
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_mobile_otp()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete OTPs expired more than 1 hour ago
    DELETE FROM inhouse_mobile_otp
    WHERE expires_at < NOW() - INTERVAL '1 hour';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on insert to periodically clean up
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_cleanup_expired_mobile_otp') THEN
        CREATE TRIGGER trigger_cleanup_expired_mobile_otp
        AFTER INSERT ON inhouse_mobile_otp
        FOR EACH STATEMENT
        EXECUTE FUNCTION cleanup_expired_mobile_otp();
    END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE inhouse_mobile_otp IS 'One-time password codes for mobile authentication (uses auth.users)';
COMMENT ON TABLE inhouse_mobile_sessions IS 'Active mobile app sessions with token pairs (uses auth.users)';
COMMENT ON TABLE inhouse_mobile_push_preferences IS 'Push notification preferences per device';

COMMIT;
