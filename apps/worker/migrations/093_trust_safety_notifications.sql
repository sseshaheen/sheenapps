-- Migration: Trust & Safety Notifications System
-- Purpose: Create tables for user notifications, rate limiting, and appeal flow
-- Implements acceptance criteria from TODO_REMAINING_IMPLEMENTATION_PLAN.md
-- Enhanced with expert feedback: DB-level rate limiting, improved constraints, optimized indexes
-- Date: 2025-09-17

BEGIN;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =====================================================
-- Trust Safety Notifications Table
-- =====================================================

CREATE TABLE IF NOT EXISTS trust_safety_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL CHECK (category IN ('content_violation', 'account_warning', 'temporary_restriction', 'appeal_update')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  appealable BOOLEAN DEFAULT false,
  locale VARCHAR(10) DEFAULT 'en' CHECK (locale IN ('en', 'es', 'fr', 'ar', 'de')),
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Data integrity constraints
  CONSTRAINT notifications_subject_not_empty CHECK (char_length(subject) > 0),
  CONSTRAINT notifications_message_not_empty CHECK (char_length(message) > 0),
  CONSTRAINT notifications_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

-- =====================================================
-- Appeal Tickets Table
-- =====================================================

CREATE TABLE IF NOT EXISTS appeal_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES trust_safety_notifications(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'denied', 'withdrawn')),
  user_statement TEXT,
  admin_response TEXT,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  context_data JSONB DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Data integrity constraints
  CONSTRAINT appeal_resolved_fields CHECK (
    (status IN ('approved', 'denied') AND resolved_at IS NOT NULL) OR
    (status NOT IN ('approved', 'denied') AND resolved_at IS NULL)
  ),
  CONSTRAINT appeals_context_is_object CHECK (jsonb_typeof(context_data) = 'object')
);

-- =====================================================
-- Create Indexes for Performance
-- =====================================================

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON trust_safety_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON trust_safety_notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON trust_safety_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_category ON trust_safety_notifications(user_id, category);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON trust_safety_notifications(user_id, read_at) WHERE read_at IS NULL;

-- Expert-recommended indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_unread_cat_created
  ON trust_safety_notifications (category, created_at DESC)
  WHERE read_at IS NULL;

-- Appeal tickets indexes
CREATE INDEX IF NOT EXISTS idx_appeals_user_id ON appeal_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeal_tickets(status);
CREATE INDEX IF NOT EXISTS idx_appeals_created_at ON appeal_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_notification_id ON appeal_tickets(notification_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_appeals_status_created ON appeal_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_user_status_created
  ON appeal_tickets (user_id, status, created_at DESC);

-- One appeal per notification constraint
CREATE UNIQUE INDEX IF NOT EXISTS uniq_appeal_per_notification
  ON appeal_tickets(notification_id)
  WHERE notification_id IS NOT NULL;

-- =====================================================
-- DB-Level Rate Limiting Constraint
-- =====================================================

-- Create a function to generate 12-hour time buckets for rate limiting
CREATE OR REPLACE FUNCTION get_12h_bucket(ts TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE SQL IMMUTABLE AS $$
  SELECT date_trunc('hour', ts)::TIMESTAMPTZ +
         INTERVAL '12 hours' * (EXTRACT(HOUR FROM ts)::INT / 12);
$$;

-- Add rate limiting bucket column
ALTER TABLE trust_safety_notifications
ADD COLUMN IF NOT EXISTS rate_bucket TIMESTAMPTZ;

-- Create trigger to set rate bucket on insert
CREATE OR REPLACE FUNCTION set_rate_bucket()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.rate_bucket = get_12h_bucket(NEW.created_at);
  RETURN NEW;
END;
$$;

-- Apply trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_notifications_rate_bucket' AND tgrelid = 'trust_safety_notifications'::regclass) THEN
    CREATE TRIGGER set_notifications_rate_bucket
      BEFORE INSERT ON trust_safety_notifications
      FOR EACH ROW EXECUTE FUNCTION set_rate_bucket();
  END IF;
END $$;

-- Enforce "max 1 notification per 12h per category per user" at database level
-- This prevents race conditions that application-level rate limiting might have
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_one_per_12h') THEN
    ALTER TABLE trust_safety_notifications
    ADD CONSTRAINT notifications_one_per_12h
    EXCLUDE USING gist (
      user_id WITH =,
      category WITH =,
      rate_bucket WITH =
    );
  END IF;
END $$;

-- =====================================================
-- Row Level Security Policies
-- =====================================================

-- Enable RLS on both tables
ALTER TABLE trust_safety_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE appeal_tickets ENABLE ROW LEVEL SECURITY;

-- Users can only view/modify their own notifications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'notifications_user_access') THEN
    CREATE POLICY notifications_user_access ON trust_safety_notifications
      FOR ALL USING (user_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Users can only view/modify their own appeals
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'appeals_user_access') THEN
    CREATE POLICY appeals_user_access ON appeal_tickets
      FOR ALL USING (user_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Admin access policies (conditional on role existence)
DO $$
BEGIN
  -- Check if app_admin role exists before creating policies
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN

    -- Admin full access to notifications
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'notifications_admin_access') THEN
      CREATE POLICY notifications_admin_access ON trust_safety_notifications
        FOR ALL TO app_admin USING (true);
    END IF;

    -- Admin full access to appeals
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'appeals_admin_access') THEN
      CREATE POLICY appeals_admin_access ON appeal_tickets
        FOR ALL TO app_admin USING (true);
    END IF;

  END IF;
END $$;

-- =====================================================
-- Triggers for Updated At
-- =====================================================

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to both tables
DO $$
BEGIN
  -- Notifications updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_notifications_updated_at' AND tgrelid = 'trust_safety_notifications'::regclass) THEN
    CREATE TRIGGER update_notifications_updated_at
      BEFORE UPDATE ON trust_safety_notifications
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- Appeals updated_at trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_appeals_updated_at' AND tgrelid = 'appeal_tickets'::regclass) THEN
    CREATE TRIGGER update_appeals_updated_at
      BEFORE UPDATE ON appeal_tickets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =====================================================
-- Add Comments for Documentation
-- =====================================================

COMMENT ON TABLE trust_safety_notifications IS 'User notifications for trust & safety actions with i18n support and DB-level rate limiting';
COMMENT ON COLUMN trust_safety_notifications.category IS 'Type of trust & safety notification';
COMMENT ON COLUMN trust_safety_notifications.appealable IS 'Whether this notification can be appealed';
COMMENT ON COLUMN trust_safety_notifications.locale IS 'Locale for notification content (en, es, fr, ar, de)';
COMMENT ON COLUMN trust_safety_notifications.rate_bucket IS 'Time bucket for 12-hour rate limiting (set via trigger)';
COMMENT ON COLUMN trust_safety_notifications.metadata IS 'JSONB object with notification metadata';
COMMENT ON COLUMN trust_safety_notifications.updated_at IS 'Timestamp tracking when notification was last modified (e.g., marked as read)';

COMMENT ON TABLE appeal_tickets IS 'User appeal tickets for trust & safety actions';
COMMENT ON COLUMN appeal_tickets.context_data IS 'Auto-appended context from original notification (JSONB object)';
COMMENT ON COLUMN appeal_tickets.status IS 'Appeal processing status';
COMMENT ON COLUMN appeal_tickets.updated_at IS 'Timestamp tracking appeal status changes';

COMMIT;

-- =====================================================
-- Migration Verification
-- =====================================================

DO $$
BEGIN
  -- Check tables were created
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trust_safety_notifications') THEN
    RAISE EXCEPTION 'Migration failed: trust_safety_notifications table not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'appeal_tickets') THEN
    RAISE EXCEPTION 'Migration failed: appeal_tickets table not created';
  END IF;

  -- Check required columns exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trust_safety_notifications' AND column_name = 'locale') THEN
    RAISE EXCEPTION 'Migration failed: locale column not added to notifications';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trust_safety_notifications' AND column_name = 'updated_at') THEN
    RAISE EXCEPTION 'Migration failed: updated_at column not added to notifications';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trust_safety_notifications' AND column_name = 'rate_bucket') THEN
    RAISE EXCEPTION 'Migration failed: rate_bucket column not added to notifications';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appeal_tickets' AND column_name = 'context_data') THEN
    RAISE EXCEPTION 'Migration failed: context_data column not added to appeals';
  END IF;

  -- Check critical constraints exist
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_one_per_12h') THEN
    RAISE EXCEPTION 'Migration failed: DB-level rate limiting constraint not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_metadata_is_object') THEN
    RAISE EXCEPTION 'Migration failed: JSONB shape constraint not created for notifications';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appeals_context_is_object') THEN
    RAISE EXCEPTION 'Migration failed: JSONB shape constraint not created for appeals';
  END IF;

  RAISE NOTICE '✅ Trust & Safety notifications migration completed successfully with enhanced security and rate limiting';
END $$;