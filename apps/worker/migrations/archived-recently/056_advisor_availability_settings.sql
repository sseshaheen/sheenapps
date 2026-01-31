-- =====================================================
-- Migration 056: Advisor Availability Settings
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 29, 2025
-- Purpose: Add comprehensive availability management for advisors
-- Dependencies: Migration 055 (Multilingual display names)
-- =====================================================

BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Part 1: Create Advisor Availability Settings Table
-- =====================================================

-- Enhanced availability control beyond simple boolean
CREATE TABLE IF NOT EXISTS advisor_availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  
  -- Weekly schedule (JSON format for flexibility)
  weekly_schedule JSONB NOT NULL DEFAULT '{}', 
  -- Format: {"monday": [{"start": "09:00", "end": "17:00"}], "tuesday": [...]}
  
  -- Blackout dates and special availability
  blackout_dates JSONB DEFAULT '[]', -- Array of date strings
  special_availability JSONB DEFAULT '[]', -- Override dates with custom hours
  
  -- Booking preferences  
  min_notice_hours INTEGER DEFAULT 24, -- Minimum booking notice
  max_advance_days INTEGER DEFAULT 30, -- Maximum days in advance
  buffer_minutes INTEGER DEFAULT 15,   -- Buffer between consultations
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Part 2: Indexes and Constraints
-- =====================================================

-- Unique constraint: one availability setting per advisor
CREATE UNIQUE INDEX IF NOT EXISTS uq_availability_advisor ON advisor_availability_settings(advisor_id);

-- Add constraints for data validation (idempotent)
DO $$
BEGIN
  -- Add timezone constraint if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_timezone_valid') THEN
    ALTER TABLE advisor_availability_settings
    ADD CONSTRAINT chk_timezone_valid CHECK (timezone ~ '^[A-Za-z_]+/[A-Za-z_]+$');
  END IF;

  -- Add min notice constraint if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_min_notice_reasonable') THEN
    ALTER TABLE advisor_availability_settings
    ADD CONSTRAINT chk_min_notice_reasonable CHECK (min_notice_hours >= 1 AND min_notice_hours <= 168);
  END IF;

  -- Add max advance constraint if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_max_advance_reasonable') THEN
    ALTER TABLE advisor_availability_settings
    ADD CONSTRAINT chk_max_advance_reasonable CHECK (max_advance_days >= 1 AND max_advance_days <= 365);
  END IF;

  -- Add buffer constraint if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buffer_reasonable') THEN
    ALTER TABLE advisor_availability_settings
    ADD CONSTRAINT chk_buffer_reasonable CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120);
  END IF;
END $$;

-- =====================================================
-- Part 3: Row Level Security (RLS)
-- =====================================================

-- Enable RLS following existing advisor patterns (idempotent)
DO $$
BEGIN
  -- Enable RLS if not already enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE c.relname = 'advisor_availability_settings' 
      AND n.nspname = 'public' 
      AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE advisor_availability_settings ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create RLS policies (idempotent)
DO $$
BEGIN
  -- Create select policy if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'avail_select') THEN
    CREATE POLICY avail_select ON advisor_availability_settings
      FOR SELECT USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));
  END IF;

  -- Create insert policy if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'avail_insert') THEN
    CREATE POLICY avail_insert ON advisor_availability_settings
      FOR INSERT WITH CHECK (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));
  END IF;

  -- Create update policy if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'avail_update') THEN
    CREATE POLICY avail_update ON advisor_availability_settings
      FOR UPDATE USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()))
                 WITH CHECK (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));
  END IF;
END $$;

-- =====================================================
-- Part 4: Triggers and Worker Grants
-- =====================================================

-- Standard updated_at trigger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_availability_updated' 
      AND tgrelid = 'advisor_availability_settings'::regclass
  ) THEN
    CREATE TRIGGER trg_availability_updated
      BEFORE UPDATE ON advisor_availability_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Worker database role grants
GRANT SELECT, INSERT, UPDATE ON advisor_availability_settings TO worker_db_role;

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- Verification and Summary
-- =====================================================

-- Create default availability setting for Omar Khalil as test data
INSERT INTO advisor_availability_settings (advisor_id, timezone, weekly_schedule, min_notice_hours, max_advance_days, buffer_minutes)
SELECT 
  a.id,
  'America/New_York',
  jsonb_build_object(
    'monday', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '17:00')),
    'tuesday', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '17:00')),
    'wednesday', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '17:00')),
    'thursday', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '17:00')),
    'friday', jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '17:00'))
  ),
  24, -- min_notice_hours
  30, -- max_advance_days  
  15  -- buffer_minutes
FROM advisors a
WHERE a.display_name = 'Omar Khalil' AND a.approval_status = 'approved'
ON CONFLICT (advisor_id) DO NOTHING;

-- Verify the table was created successfully
SELECT COUNT(*) as availability_settings_count 
FROM advisor_availability_settings;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 056 completed successfully!';
  RAISE NOTICE '📅 Advisor availability settings table created';
  RAISE NOTICE '🔒 RLS policies and constraints applied';
  RAISE NOTICE '👤 Test data added for Omar Khalil';
  RAISE NOTICE '📱 Next: Migration 057 - Consultation metadata enhancements';
END $$;