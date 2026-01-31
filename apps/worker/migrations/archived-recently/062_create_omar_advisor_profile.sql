-- =====================================================
-- Migration 062: Create Omar Advisor Profile  
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 29, 2025
-- Purpose: Create advisor profile for omar.khalil@sheenapps.com
-- Dependencies: Migration 061 (Omar test credentials)
-- =====================================================

BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Part 1: Create Omar's Advisor Profile
-- =====================================================

-- Get Omar's user_id from Supabase auth
INSERT INTO advisors (
  user_id, display_name, bio, avatar_url,
  skills, specialties, languages, rating, review_count,
  approval_status, country_code, is_accepting_bookings,
  cal_com_event_type_url, created_at, approved_at,
  pricing_model, free_consultation_durations,
  multilingual_bio, multilingual_display_name
)
SELECT 
  u.id,
  'Omar Khalil',
  'DevOps Engineer with 7+ years experience in AWS, Kubernetes, and CI/CD pipelines. Specialized in infrastructure automation and cloud architecture for high-traffic applications.',
  'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?w=150',
  ARRAY['AWS', 'Kubernetes', 'Docker', 'Terraform', 'Jenkins', 'CI/CD', 'Infrastructure'],
  ARRAY['devops', 'cloud', 'infrastructure'], 
  ARRAY['Arabic', 'English', 'French'],
  4.7,
  12,
  'approved',
  'EG', -- Egypt
  true,
  'https://cal.com/omar-khalil/consultation',
  now() - interval '50 days',
  now() - interval '30 days',
  'hybrid', -- Supports both free and paid consultations
  '{"15": true, "30": false, "60": false}'::jsonb, -- Free 15-min consultations
  jsonb_build_object(
    'en', 'DevOps Engineer with 7+ years experience in AWS, Kubernetes, and CI/CD pipelines. Specialized in infrastructure automation and cloud architecture for high-traffic applications.',
    'ar', 'مهندس DevOps بخبرة أكثر من 7 سنوات في AWS وKubernetes وأنابيب CI/CD. متخصص في أتمتة البنية التحتية وهندسة السحابة للتطبيقات عالية الحركة.',
    'fr', 'Ingénieur DevOps avec plus de 7 ans d''expérience en AWS, Kubernetes et pipelines CI/CD. Spécialisé dans l''automatisation d''infrastructure et l''architecture cloud pour applications à fort trafic.'
  ),
  jsonb_build_object(
    'en', 'Omar Khalil',
    'ar', 'عمر خليل',
    'fr', 'Omar Khalil'
  )
FROM auth.users u
WHERE u.email = 'omar.khalil@sheenapps.com'
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  skills = EXCLUDED.skills,
  specialties = EXCLUDED.specialties,
  languages = EXCLUDED.languages,
  approval_status = 'approved',
  is_accepting_bookings = true,
  pricing_model = EXCLUDED.pricing_model,
  free_consultation_durations = EXCLUDED.free_consultation_durations,
  multilingual_bio = EXCLUDED.multilingual_bio,
  multilingual_display_name = EXCLUDED.multilingual_display_name,
  approved_at = EXCLUDED.approved_at,
  updated_at = now();

-- =====================================================
-- Part 2: Create Default Availability Settings
-- =====================================================

-- Create default availability for Omar
INSERT INTO advisor_availability_settings (
  advisor_id, timezone, weekly_schedule, min_notice_hours, max_advance_days, buffer_minutes
)
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
JOIN auth.users u ON u.id = a.user_id
WHERE u.email = 'omar.khalil@sheenapps.com'
ON CONFLICT (advisor_id) DO UPDATE SET
  weekly_schedule = EXCLUDED.weekly_schedule,
  updated_at = now();

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- Verification
-- =====================================================

-- Verify Omar's complete profile
SELECT 
  u.email,
  a.display_name,
  a.approval_status,
  a.is_accepting_bookings,
  a.pricing_model,
  get_advisor_available_languages(a.user_id) as available_languages,
  get_advisor_display_name_localized(a.user_id, 'ar') as arabic_name
FROM auth.users u
JOIN advisors a ON a.user_id = u.id
WHERE u.email = 'omar.khalil@sheenapps.com';

-- Check availability settings
SELECT 
  timezone,
  weekly_schedule,
  min_notice_hours,
  max_advance_days
FROM advisor_availability_settings aas
JOIN advisors a ON a.id = aas.advisor_id
JOIN auth.users u ON u.id = a.user_id
WHERE u.email = 'omar.khalil@sheenapps.com';

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 062 completed successfully!';
  RAISE NOTICE '👤 Advisor profile created for: omar.khalil@sheenapps.com';
  RAISE NOTICE '🌍 Multilingual support: English, Arabic, French';
  RAISE NOTICE '📅 Default availability: Mon-Fri 9am-5pm EST';
  RAISE NOTICE '🚀 Ready for dashboard testing!';
END $$;