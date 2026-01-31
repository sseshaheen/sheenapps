-- Intelligent Advisor Matching System Foundation
-- Production-ready implementation with expert PostgreSQL optimizations
-- Incorporates race-safe assignment, idempotency patterns, and concurrency safety

BEGIN;

-- Enable required extensions for range operations
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create advisor availability status enum
DO $$ BEGIN
  CREATE TYPE advisor_status AS ENUM ('available', 'busy', 'offline');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create match request status enum for state machine
DO $$ BEGIN
  CREATE TYPE match_status AS ENUM (
    'pending', 'matched', 'client_approved', 'client_declined', 
    'advisor_accepted', 'advisor_declined', 'finalized', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create notification status enum
DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('pending', 'queued', 'delivered', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Advisor Availability System
CREATE TABLE IF NOT EXISTS advisor_availability (
  advisor_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status advisor_status NOT NULL DEFAULT 'available',
  max_concurrent_projects INTEGER DEFAULT 3 CHECK (max_concurrent_projects > 0),
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  availability_preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drift-proof capacity tracking via derived view (replaces mutable counter)
CREATE OR REPLACE VIEW advisor_active_projects AS
SELECT 
  advisor_id, 
  COUNT(*)::int AS active_count
FROM project_advisors
WHERE status IN ('pending_approval','active')
GROUP BY advisor_id;

-- Overlap-safe work hours with int4range + exclusion constraints (expert recommendation)
CREATE TABLE IF NOT EXISTS advisor_work_hours (
  advisor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tz TEXT NOT NULL,                                   -- e.g. 'America/Los_Angeles'
  dow INTEGER NOT NULL CHECK (dow BETWEEN 0 AND 6),  -- 0=Sun, 6=Sat
  minutes int4range NOT NULL,                         -- [start,end) in minutes from midnight
  PRIMARY KEY (advisor_id, dow, minutes)
);

-- Prevent overlapping work hours per advisor/day (handles split/overnight shifts)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'excl_hours_no_overlap') THEN
    ALTER TABLE advisor_work_hours
      ADD CONSTRAINT excl_hours_no_overlap
      EXCLUDE USING gist (advisor_id WITH =, dow WITH =, minutes WITH &&);
  END IF;
END $$;

-- Time-off & OOO tracking (expert recommendation)
CREATE TABLE IF NOT EXISTS advisor_time_off (
  advisor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  period tstzrange NOT NULL,                          -- Time-off period with timezone awareness
  reason TEXT,                                        -- 'vacation', 'sick', 'conference', etc.
  PRIMARY KEY (advisor_id, period)
);

-- 2. Advisor Skills & Expertise
CREATE TABLE IF NOT EXISTS advisor_skills (
  advisor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_category TEXT NOT NULL, -- 'framework', 'language', 'specialty'
  skill_name TEXT NOT NULL,     -- 'react', 'typescript', 'ecommerce'
  proficiency_level INTEGER CHECK (proficiency_level BETWEEN 1 AND 5),
  years_experience DECIMAL(3,1),
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (advisor_id, skill_category, skill_name)
);

-- Admin-preferred advisors for specific scenarios
CREATE TABLE IF NOT EXISTS advisor_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL, -- 'preferred', 'priority', 'specialized'
  criteria JSONB NOT NULL,       -- {"framework": "react", "project_type": "ecommerce"}
  priority_score INTEGER DEFAULT 100,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enhanced Project Metadata for Matching
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technology_stack JSONB DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_complexity TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_advisor_hours DECIMAL(4,1);

-- Add constraint for project complexity
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_project_complexity') THEN
    ALTER TABLE projects
      ADD CONSTRAINT chk_project_complexity
      CHECK (project_complexity IN ('simple', 'medium', 'complex'));
  END IF;
END $$;

-- 4. Project Matching Requests with Idempotency and State Machine
CREATE TABLE IF NOT EXISTS advisor_match_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Project owner
  match_criteria JSONB NOT NULL,
  -- Explicit state machine transitions
  status match_status NOT NULL DEFAULT 'pending',
  matched_advisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  match_score DECIMAL(5,2),
  match_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  -- Explainability snapshot for debugging and future ML readiness (expert recommendation)
  scoring_features JSONB,                            -- {availability:1, skills:0.78, tz:0.6, preference:0.1, notes:"..."}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Production constraint: expires_at must be in future
  CONSTRAINT chk_expires_in_future CHECK (expires_at > created_at)
);

-- 5. Enhanced Outbox Pattern with Idempotency and Dead Letter Queue
CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_request_id UUID REFERENCES advisor_match_requests(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'advisor_matched', 'client_approval', 'advisor_accepted'
  delivery_method TEXT NOT NULL,   -- 'email', 'sms', 'push', 'in_app'
  payload JSONB NOT NULL,          -- Minimal data: project name, stack tags (no secrets)
  status notification_status NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  dead_letter BOOLEAN DEFAULT false,                  -- Mark failed messages for manual review
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification delivery tracking (after successful delivery)
CREATE TABLE IF NOT EXISTS advisor_match_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES notification_outbox(id) ON DELETE SET NULL,
  match_request_id UUID REFERENCES advisor_match_requests(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  delivery_method TEXT NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_data JSONB -- Email provider response, etc.
);

-- Approval workflow tracking
CREATE TABLE IF NOT EXISTS advisor_match_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_request_id UUID REFERENCES advisor_match_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_type TEXT NOT NULL CHECK (approver_type IN ('client', 'advisor')),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'declined')),
  reason TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes

-- Advisor availability lookups
CREATE INDEX IF NOT EXISTS idx_availability_status_active 
  ON advisor_availability (status, last_active DESC);

-- Work hours range queries
CREATE INDEX IF NOT EXISTS idx_work_hours_advisor_dow 
  ON advisor_work_hours (advisor_id, dow);

-- Time-off range queries with GiST
CREATE INDEX IF NOT EXISTS idx_time_off_period 
  ON advisor_time_off USING gist (period);

-- Fast skill lookups for matching algorithm
CREATE INDEX IF NOT EXISTS idx_skills_category_name 
  ON advisor_skills (skill_category, skill_name, proficiency_level DESC);
CREATE INDEX IF NOT EXISTS idx_skills_advisor 
  ON advisor_skills (advisor_id);

-- Match request queries
CREATE INDEX IF NOT EXISTS idx_match_requests_project_status 
  ON advisor_match_requests (project_id, status);
CREATE INDEX IF NOT EXISTS idx_match_requests_expiry 
  ON advisor_match_requests (expires_at) 
  WHERE status IN ('pending','matched');

-- Outbox processing
CREATE INDEX IF NOT EXISTS idx_outbox_processing 
  ON notification_outbox (status, next_attempt_at);

-- Unique Constraints for Idempotency

-- Idempotency: prevent multiple open requests per project (DEFERRABLE for race condition safety)
DROP INDEX IF EXISTS uniq_open_match_per_project;
CREATE UNIQUE INDEX uniq_open_match_per_project
  ON advisor_match_requests(project_id)
  WHERE status IN ('pending','matched');

-- Add deferrable constraint for race-safe enforcement
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_open_match_per_project') THEN
    ALTER TABLE advisor_match_requests 
      ADD CONSTRAINT ux_open_match_per_project 
      EXCLUDE (project_id WITH =) 
      WHERE (status IN ('pending','matched'))
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Prevent duplicate notifications (idempotency) - DEFERRABLE for race condition safety
DROP INDEX IF EXISTS uniq_outbox_dedupe;
CREATE UNIQUE INDEX uniq_outbox_dedupe
  ON notification_outbox(match_request_id, recipient_id, notification_type, delivery_method)
  WHERE status IN ('pending','queued');

-- Add deferrable constraint for race-safe enforcement
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_outbox_dedupe') THEN
    ALTER TABLE notification_outbox 
      ADD CONSTRAINT ux_outbox_dedupe 
      EXCLUDE (match_request_id WITH =, recipient_id WITH =, notification_type WITH =, delivery_method WITH =) 
      WHERE (status IN ('pending','queued'))
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Single active advisor per project constraint (expert recommendation) - DEFERRABLE for race condition safety
DROP INDEX IF EXISTS uniq_one_active_advisor_per_project;
CREATE UNIQUE INDEX uniq_one_active_advisor_per_project
  ON project_advisors(project_id)
  WHERE status IN ('pending_approval','active');

-- Add deferrable constraint for race-safe enforcement
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_one_active_advisor_per_project') THEN
    ALTER TABLE project_advisors 
      ADD CONSTRAINT ux_one_active_advisor_per_project 
      EXCLUDE (project_id WITH =) 
      WHERE (status IN ('pending_approval','active'))
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE advisor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_work_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_match_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_match_approvals ENABLE ROW LEVEL SECURITY;

-- Advisor availability: advisors can manage their own availability
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_availability_self_access') THEN
    CREATE POLICY advisor_availability_self_access ON advisor_availability
      FOR ALL TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Work hours: advisors can manage their own schedules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_work_hours_self_access') THEN
    CREATE POLICY advisor_work_hours_self_access ON advisor_work_hours
      FOR ALL TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Time-off: advisors can manage their own time-off
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_time_off_self_access') THEN
    CREATE POLICY advisor_time_off_self_access ON advisor_time_off
      FOR ALL TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Skills: advisors can manage their own skills
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_skills_self_access') THEN
    CREATE POLICY advisor_skills_self_access ON advisor_skills
      FOR ALL TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Match requests: project owners and matched advisors can see requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'match_requests_stakeholder_access') THEN
    CREATE POLICY match_requests_stakeholder_access ON advisor_match_requests
      FOR ALL TO authenticated
      USING (
        requested_by = current_setting('app.current_user_id', true)::UUID OR
        matched_advisor_id = current_setting('app.current_user_id', true)::UUID
      )
      WITH CHECK (
        requested_by = current_setting('app.current_user_id', true)::UUID OR
        matched_advisor_id = current_setting('app.current_user_id', true)::UUID
      );
  END IF;
END $$;

-- Notifications: recipients can see their notifications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'notifications_recipient_access') THEN
    CREATE POLICY notifications_recipient_access ON notification_outbox
      FOR ALL TO authenticated
      USING (recipient_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (recipient_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Approvals: stakeholders can see their approvals
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'approvals_stakeholder_access') THEN
    CREATE POLICY approvals_stakeholder_access ON advisor_match_approvals
      FOR ALL TO authenticated
      USING (approver_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (approver_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Admin policies (if app_admin role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    -- Admin can see all data for system management
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_advisor_matching_full_access') THEN
      CREATE POLICY admin_advisor_matching_full_access ON advisor_availability
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON advisor_work_hours
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON advisor_time_off
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON advisor_skills
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON advisor_preferences
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON advisor_match_requests
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON notification_outbox
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON advisor_match_notifications
        FOR ALL TO app_admin USING (true);
      CREATE POLICY admin_advisor_matching_full_access ON advisor_match_approvals
        FOR ALL TO app_admin USING (true);
    END IF;
  END IF;
END $$;

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'advisor_availability_updated_at' 
                 AND tgrelid = 'advisor_availability'::regclass) THEN
    CREATE TRIGGER advisor_availability_updated_at
      BEFORE UPDATE ON advisor_availability
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'match_requests_updated_at' 
                 AND tgrelid = 'advisor_match_requests'::regclass) THEN
    CREATE TRIGGER match_requests_updated_at
      BEFORE UPDATE ON advisor_match_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- State machine enforcement for match status transitions
CREATE OR REPLACE FUNCTION enforce_match_status_transitions()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow setting initial status on INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending') THEN
      RAISE EXCEPTION 'New match requests must start with status "pending", got "%"', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- Enforce valid status transitions on UPDATE
  IF OLD.status = NEW.status THEN
    RETURN NEW; -- No status change, allow update
  END IF;

  -- Valid transition matrix based on match workflow
  IF (OLD.status = 'pending' AND NEW.status IN ('matched', 'expired')) OR
     (OLD.status = 'matched' AND NEW.status IN ('client_approved', 'client_declined', 'expired')) OR
     (OLD.status = 'client_approved' AND NEW.status IN ('advisor_accepted', 'advisor_declined')) OR
     (OLD.status = 'client_declined' AND NEW.status IN ('finalized')) OR
     (OLD.status = 'advisor_accepted' AND NEW.status IN ('finalized')) OR
     (OLD.status = 'advisor_declined' AND NEW.status IN ('finalized')) THEN
    RETURN NEW;
  END IF;

  -- Invalid transition
  RAISE EXCEPTION 'Invalid match status transition from "%" to "%"', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

-- Add state machine enforcement trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'match_status_transition_guard' 
                 AND tgrelid = 'advisor_match_requests'::regclass) THEN
    CREATE TRIGGER match_status_transition_guard
      BEFORE INSERT OR UPDATE OF status ON advisor_match_requests
      FOR EACH ROW EXECUTE FUNCTION enforce_match_status_transitions();
  END IF;
END $$;

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_work_hours TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_time_off TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_match_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_match_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_match_approvals TO authenticated;
GRANT SELECT ON advisor_active_projects TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;