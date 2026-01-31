-- =====================================================
-- Migration 082: Career Portal Schema Fixes  
-- =====================================================
-- Author: Claude Assistant
-- Created: 2025-09-08
-- Purpose: Add missing columns to career_jobs table for application compatibility
-- Dependencies: Migration 081 (career portal foundation)
-- 
-- Fixes:
-- - Add department column for simpler API handling
-- - Add missing is_active, is_remote columns
-- - Add posted_at, application_deadline columns  
-- - Add multilingual_location, multilingual_meta_description, multilingual_meta_keywords
-- - Update indexes for new columns
-- - Recreate search_text generated column with all fields
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: Add missing columns to career_jobs
-- =====================================================

-- Add department column for simpler API handling
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'department'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN department TEXT;
  END IF;
END $$;

-- Add missing boolean columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'is_remote'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN is_remote BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add date columns expected by application
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'posted_at'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN posted_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'application_deadline'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN application_deadline TIMESTAMPTZ;
  END IF;
END $$;

-- Add missing multilingual fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'multilingual_location'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN multilingual_location JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'multilingual_meta_description'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN multilingual_meta_description JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'multilingual_meta_keywords'
  ) THEN
    ALTER TABLE career_jobs ADD COLUMN multilingual_meta_keywords JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- =====================================================
-- Step 2: Drop and recreate search_text column with all fields
-- =====================================================

-- Drop existing search_text column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'career_jobs' AND column_name = 'search_text'
  ) THEN
    ALTER TABLE career_jobs DROP COLUMN search_text;
  END IF;
END $$;

-- Add enhanced search_text column with all multilingual fields
ALTER TABLE career_jobs ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
  COALESCE(multilingual_title->>'ar', '') || ' ' ||
  COALESCE(multilingual_title->>'en', '') || ' ' ||
  COALESCE(multilingual_description->>'ar', '') || ' ' ||
  COALESCE(multilingual_description->>'en', '') || ' ' ||
  COALESCE(multilingual_requirements->>'ar', '') || ' ' ||
  COALESCE(multilingual_requirements->>'en', '') || ' ' ||
  COALESCE(multilingual_benefits->>'ar', '') || ' ' ||
  COALESCE(multilingual_benefits->>'en', '') || ' ' ||
  COALESCE(multilingual_location->>'ar', '') || ' ' ||
  COALESCE(multilingual_location->>'en', '') || ' ' ||
  COALESCE(multilingual_meta_keywords->>'ar', '') || ' ' ||
  COALESCE(multilingual_meta_keywords->>'en', '')
) STORED;

-- =====================================================
-- Step 3: Create additional indexes for new columns
-- =====================================================

-- Index for department filtering
CREATE INDEX IF NOT EXISTS idx_jobs_department ON career_jobs(department) WHERE department IS NOT NULL;

-- Index for active jobs
CREATE INDEX IF NOT EXISTS idx_jobs_active ON career_jobs(is_active, posted_at DESC) WHERE is_active = true;

-- Index for remote jobs
CREATE INDEX IF NOT EXISTS idx_jobs_remote ON career_jobs(is_remote, posted_at DESC) WHERE is_remote = true;

-- Index for posted_at ordering
CREATE INDEX IF NOT EXISTS idx_jobs_status_posted ON career_jobs(status, posted_at DESC);

-- Recreate trigram search index on enhanced search_text
DROP INDEX IF EXISTS idx_jobs_search_trgm;
CREATE INDEX idx_jobs_search_trgm ON career_jobs USING GIN (search_text gin_trgm_ops);

-- =====================================================
-- Step 4: Update existing records with default values
-- =====================================================

-- Set posted_at to created_at for existing records where NULL
UPDATE career_jobs 
SET posted_at = created_at 
WHERE posted_at IS NULL;

-- Set reasonable defaults for existing records
UPDATE career_jobs 
SET 
  is_active = COALESCE(is_active, true),
  is_remote = COALESCE(is_remote, false)
WHERE is_active IS NULL OR is_remote IS NULL;

COMMIT;

-- =====================================================
-- Post-migration verification queries
-- =====================================================
-- Run these manually to verify the migration worked:
--
-- 1. Check all expected columns exist:
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'career_jobs' 
-- ORDER BY ordinal_position;
--
-- 2. Verify search_text is working:
-- SELECT id, search_text FROM career_jobs LIMIT 3;
--
-- 3. Check indexes were created:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'career_jobs';
-- =====================================================