-- =====================================================
-- Migration 046: Advisor Phase 2 Application System
-- =====================================================
-- Author: Claude Code Assistant
-- Created: August 27, 2025
-- Purpose: Phase 2 advisor application draft system with event timeline
-- Dependencies: Migration 045 (advisor network MVP)
-- Status: Builds on existing advisor infrastructure with expert-validated improvements
--
-- Key Features:
-- - Draft application system with auto-save capability
-- - Event timeline for admin review process
-- - Enhanced onboarding flow with multi-step validation
-- - Expert-recommended UPSERT patterns and indexing
-- - RLS-based permission system (safer than REVOKE approach)
-- - i18n-ready event system following existing patterns
-- =====================================================

-- Application status enum for drafts
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'advisor_application_status') THEN
    CREATE TYPE advisor_application_status AS ENUM (
      'draft', 'submitted', 'under_review', 'approved', 'rejected', 'returned_for_changes'
    );
    RAISE NOTICE '✅ Created advisor_application_status enum';
  ELSE
    RAISE NOTICE 'ℹ️ advisor_application_status enum already exists, skipping';
  END IF;
END $$;

-- Event type enum for timeline (expert recommendation: separate enum for type safety)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'advisor_event_type') THEN
    CREATE TYPE advisor_event_type AS ENUM (
      'draft_created', 'draft_updated', 'profile_updated', 'application_submitted',
      'review_started', 'review_completed', 'status_changed', 'admin_note_added',
      'documents_uploaded', 'interview_scheduled', 'interview_completed'
    );
    RAISE NOTICE '✅ Created advisor_event_type enum';
  ELSE
    RAISE NOTICE 'ℹ️ advisor_event_type enum already exists, skipping';
  END IF;
END $$;

-- =====================================================
-- Core Phase 2 Tables
-- =====================================================

-- Advisor application drafts table
CREATE TABLE IF NOT EXISTS advisor_application_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  
  -- Application status and workflow
  status advisor_application_status DEFAULT 'draft',
  submitted_at timestamptz,
  
  -- Professional data (JSONB for flexibility)
  professional_data jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Expert recommendation: Soft delete pattern
  is_active boolean DEFAULT true
);

-- EXPERT CRITICAL FIX: Partial unique constraint for active drafts only
CREATE UNIQUE INDEX IF NOT EXISTS uq_drafts_user_active 
  ON advisor_application_drafts (user_id) 
  WHERE is_active = true;

-- Advisor event timeline table
CREATE TABLE IF NOT EXISTS advisor_event_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  advisor_id uuid REFERENCES advisors(id), -- NULL for pre-approval events
  
  -- Event details
  event_type advisor_event_type NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  
  -- Actor information
  created_by uuid REFERENCES auth.users(id), -- NULL for system events
  actor_type text CHECK (actor_type IN ('system','user','admin')) DEFAULT 'system',
  
  -- i18n-ready event system (following existing patterns)
  event_code text, -- Machine-readable code for frontend localization
  
  created_at timestamptz DEFAULT now()
);

-- Enhanced advisor onboarding steps
ALTER TABLE advisors 
ADD COLUMN IF NOT EXISTS onboarding_steps jsonb DEFAULT '{
  "profile_completed": false,
  "skills_added": false,
  "availability_set": false,
  "stripe_connected": false,
  "cal_connected": false,
  "admin_approved": false
}'::jsonb;

-- Admin review tracking
ALTER TABLE advisors 
ADD COLUMN IF NOT EXISTS review_started_at timestamptz,
ADD COLUMN IF NOT EXISTS review_completed_at timestamptz;

-- =====================================================
-- Essential indexes for performance
-- =====================================================

-- Application drafts indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_drafts_user_status') THEN
    CREATE INDEX idx_drafts_user_status ON advisor_application_drafts (user_id, status, updated_at);
    RAISE NOTICE '✅ Created index idx_drafts_user_status';
  END IF;

  -- EXPERT SUGGESTION: GIN index for JSONB queries on professional_data
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_drafts_professional_data_gin') THEN
    CREATE INDEX idx_drafts_professional_data_gin ON advisor_application_drafts USING GIN (professional_data);
    RAISE NOTICE '✅ Created GIN index idx_drafts_professional_data_gin';
  END IF;

  -- EXPERT SUGGESTION: Additional GIN index for frequent language/specialty filtering
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_drafts_languages_specialties_gin') THEN
    CREATE INDEX idx_drafts_languages_specialties_gin 
      ON advisor_application_drafts USING GIN ((professional_data->'languages'), (professional_data->'specialties'));
    RAISE NOTICE '✅ Created GIN index idx_drafts_languages_specialties_gin';
  END IF;
END $$;

-- Event timeline indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_timeline_user_time') THEN
    CREATE INDEX idx_timeline_user_time ON advisor_event_timeline (user_id, created_at DESC);
    RAISE NOTICE '✅ Created index idx_timeline_user_time';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_timeline_advisor_time') THEN
    CREATE INDEX idx_timeline_advisor_time ON advisor_event_timeline (advisor_id, created_at DESC);
    RAISE NOTICE '✅ Created index idx_timeline_advisor_time';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_timeline_event_type') THEN
    CREATE INDEX idx_timeline_event_type ON advisor_event_timeline (event_type, created_at DESC);
    RAISE NOTICE '✅ Created index idx_timeline_event_type';
  END IF;

  -- EXPERT SUGGESTION: GIN index for event_data JSONB queries
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_timeline_event_data_gin') THEN
    CREATE INDEX idx_timeline_event_data_gin ON advisor_event_timeline USING GIN (event_data);
    RAISE NOTICE '✅ Created GIN index idx_timeline_event_data_gin';
  END IF;
END $$;

-- Enhanced advisor indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisors_onboarding_gin') THEN
    CREATE INDEX idx_advisors_onboarding_gin ON advisors USING GIN (onboarding_steps);
    RAISE NOTICE '✅ Created GIN index idx_advisors_onboarding_gin';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisors_review_timeline') THEN
    CREATE INDEX idx_advisors_review_timeline ON advisors (review_started_at, review_completed_at, approval_status);
    RAISE NOTICE '✅ Created index idx_advisors_review_timeline';
  END IF;
END $$;

-- =====================================================
-- Updated Row Level Security Policies
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE advisor_application_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_event_timeline ENABLE ROW LEVEL SECURITY;

-- Application drafts: Users can manage their own drafts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_application_drafts' AND policyname = 'drafts_user_full_access') THEN
    CREATE POLICY drafts_user_full_access ON advisor_application_drafts
      FOR ALL USING (user_id = auth.uid());
    RAISE NOTICE '✅ Created RLS policy: drafts_user_full_access';
  END IF;
END $$;

-- Event timeline: Users see their own events, advisors see events for their advisor_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_event_timeline' AND policyname = 'timeline_user_read') THEN
    CREATE POLICY timeline_user_read ON advisor_event_timeline
      FOR SELECT USING (
        user_id = auth.uid() OR 
        advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid())
      );
    RAISE NOTICE '✅ Created RLS policy: timeline_user_read';
  END IF;
END $$;

-- EXPERT FIX: RLS approach for advisor profile updates (safer than REVOKE)
-- Restrict users from modifying admin-controlled fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisors' AND policyname = 'advisors_user_update_profile') THEN
    CREATE POLICY advisors_user_update_profile ON advisors
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND NEW.onboarding_steps IS NOT DISTINCT FROM OLD.onboarding_steps
        AND NEW.review_started_at IS NOT DISTINCT FROM OLD.review_started_at
        AND NEW.review_completed_at IS NOT DISTINCT FROM OLD.review_completed_at
        AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
      );
    RAISE NOTICE '✅ Created RLS policy: advisors_user_update_profile';
  END IF;
END $$;

-- =====================================================
-- Grant permissions to worker role
-- =====================================================

DO $$
BEGIN
  -- Check if worker_db_role exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_db_role') THEN
    GRANT SELECT, INSERT, UPDATE ON advisor_application_drafts TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_event_timeline TO worker_db_role;
    RAISE NOTICE '✅ Granted permissions to worker_db_role for Phase 2 tables';
  ELSE
    RAISE NOTICE 'ℹ️ worker_db_role does not exist, skipping permission grants';
  END IF;
END $$;

-- =====================================================
-- Helper functions for application management
-- =====================================================

-- EXPERT RECOMMENDATION: Atomic draft upsert function
CREATE OR REPLACE FUNCTION upsert_advisor_draft(
  p_user_id uuid,
  p_professional_data jsonb,
  p_status advisor_application_status DEFAULT 'draft'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft_id uuid;
BEGIN
  -- EXPERT CRITICAL FIX: Use ON CONFLICT ON CONSTRAINT with partial unique index
  INSERT INTO advisor_application_drafts (user_id, professional_data, status, updated_at)
  VALUES (p_user_id, p_professional_data, p_status, now())
  ON CONFLICT ON CONSTRAINT uq_drafts_user_active DO UPDATE SET
    professional_data = EXCLUDED.professional_data,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING id INTO v_draft_id;
  
  RETURN v_draft_id;
END;
$$;

-- Event timeline helper function
CREATE OR REPLACE FUNCTION add_advisor_event(
  p_user_id uuid,
  p_advisor_id uuid,
  p_event_type advisor_event_type,
  p_event_data jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_event_code text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO advisor_event_timeline (
    user_id, advisor_id, event_type, event_data, 
    created_by, actor_type, event_code
  )
  VALUES (
    p_user_id, p_advisor_id, p_event_type, p_event_data,
    p_created_by, p_actor_type, p_event_code
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Grant function permissions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_db_role') THEN
    GRANT EXECUTE ON FUNCTION upsert_advisor_draft(uuid, jsonb, advisor_application_status) TO worker_db_role;
    GRANT EXECUTE ON FUNCTION add_advisor_event(uuid, uuid, advisor_event_type, jsonb, uuid, text, text) TO worker_db_role;
    RAISE NOTICE '✅ Granted function permissions to worker_db_role';
  END IF;
END $$;

-- =====================================================
-- Migration completion
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '🎯 Migration 046 completed successfully: Advisor Phase 2 Application System';
  RAISE NOTICE '📊 Tables created: advisor_application_drafts, advisor_event_timeline';
  RAISE NOTICE '📊 Columns added: onboarding_steps, review_started_at, review_completed_at to advisors';
  RAISE NOTICE '🔒 RLS policies updated with expert-recommended safety approach';
  RAISE NOTICE '⚡ Performance indexes created including expert-recommended GIN indexes';
  RAISE NOTICE '🔧 Helper functions: upsert_advisor_draft, add_advisor_event';
  RAISE NOTICE '🌐 i18n-ready event system following existing codebase patterns';
END $$;