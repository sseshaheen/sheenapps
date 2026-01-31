-- =====================================================
-- Migration 081: Career Portal Foundation
-- =====================================================
-- Author: Claude Assistant
-- Created: 2025-09-07
-- Purpose: Create career portal database schema with multilingual support
-- Dependencies: pg_trgm extension for trigram search
-- 
-- Features:
-- - Multilingual job postings (ar/en primary support)
-- - Generated search_text column for fast trigram search
-- - Application tracking with file uploads
-- - Admin audit logging support
-- - SEO-optimized structure
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: Enable required extensions
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- Step 2: Create career categories table
-- =====================================================
CREATE TABLE IF NOT EXISTS career_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  multilingual_name JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"ar": "التكنولوجيا", "en": "Technology"}
  multilingual_description JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Step 3: Create career companies table
-- =====================================================
CREATE TABLE IF NOT EXISTS career_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  multilingual_name JSONB NOT NULL DEFAULT '{}'::jsonb,
  multilingual_description JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_url TEXT,
  website_url TEXT,
  industry TEXT,
  company_size TEXT, -- "1-10", "11-50", "51-200", etc.
  location JSONB, -- {"country": "EG", "city": "Cairo", "remote_ok": true}
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"linkedin": "url", "twitter": "url"}
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Step 4: Create career jobs table with search column
-- =====================================================
CREATE TABLE IF NOT EXISTS career_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  company_id UUID NOT NULL REFERENCES career_companies(id),
  category_id UUID REFERENCES career_categories(id) ON DELETE SET NULL,
  
  -- Multilingual content (following existing pattern)
  multilingual_title JSONB NOT NULL DEFAULT '{}'::jsonb,
  multilingual_description JSONB NOT NULL DEFAULT '{}'::jsonb, -- Sanitized HTML
  multilingual_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  multilingual_benefits JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Job details
  employment_type TEXT NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),
  experience_level TEXT CHECK (experience_level IN ('entry', 'mid', 'senior', 'executive')),
  salary JSONB, -- {"min": 15000, "max": 25000, "currency": "EGP", "period": "monthly"}
  location JSONB, -- {"country": "EG", "city": "Cairo", "remote_ok": true}
  
  -- Status and metadata
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'closed', 'expired')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  application_count INTEGER NOT NULL DEFAULT 0,
  
  -- Admin fields
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Generated search column for fast trigram search (ar + en combined)
  search_text TEXT GENERATED ALWAYS AS (
    COALESCE(multilingual_title->>'ar', '') || ' ' ||
    COALESCE(multilingual_title->>'en', '') || ' ' ||
    COALESCE(multilingual_description->>'ar', '') || ' ' ||
    COALESCE(multilingual_description->>'en', '')
  ) STORED
);

-- =====================================================
-- Step 5: Create career applications table
-- =====================================================
CREATE TABLE IF NOT EXISTS career_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES career_jobs(id) ON DELETE CASCADE,
  applicant_email TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT,
  
  -- Application content
  cover_letter TEXT,
  resume_url TEXT, -- R2/S3 storage URL
  resume_filename TEXT,
  portfolio_url TEXT,
  linkedin_url TEXT,
  
  -- Application metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'shortlisted', 'rejected', 'hired')),
  source TEXT NOT NULL DEFAULT 'direct',
  
  -- Admin review
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  
  -- Timestamps
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Step 6: Create optimized indexes
-- =====================================================

-- Job listing indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status_published ON career_jobs(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON career_jobs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON career_jobs(category_id, status) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_country ON career_jobs((location->>'country'));
CREATE INDEX IF NOT EXISTS idx_jobs_remote ON career_jobs(((location->>'remote_ok')::boolean)) WHERE location->>'remote_ok' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_featured ON career_jobs(is_featured, published_at DESC) WHERE status = 'published';

-- Trigram search index on generated search_text column
CREATE INDEX IF NOT EXISTS idx_jobs_search_trgm ON career_jobs USING GIN (search_text gin_trgm_ops);

-- Application indexes
CREATE INDEX IF NOT EXISTS idx_apps_job ON career_applications(job_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_status ON career_applications(status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_email ON career_applications(applicant_email);

-- =====================================================
-- Step 7: Add constraints
-- =====================================================

-- Ensure Arabic title is always present (primary locale)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_title_has_arabic'
  ) THEN
    ALTER TABLE career_jobs ADD CONSTRAINT job_title_has_arabic 
      CHECK (multilingual_title ? 'ar');
  END IF;
END $$;

-- Add salary sanity check: min <= max
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'career_jobs_salary_min_le_max'
  ) THEN
    ALTER TABLE career_jobs ADD CONSTRAINT career_jobs_salary_min_le_max
      CHECK (
        -- allow NULL or missing fields
        (salary->>'min') IS NULL OR (salary->>'max') IS NULL
        OR (
          -- ensure both are numeric-looking
          (salary->>'min') ~ '^[0-9]+(\.[0-9]+)?$'
          AND (salary->>'max') ~ '^[0-9]+(\.[0-9]+)?$'
          AND (salary->>'min')::numeric <= (salary->>'max')::numeric
        )
      );
  END IF;
END $$;

-- =====================================================
-- Step 8: Create update triggers for updated_at
-- =====================================================

-- Create or replace the update function
CREATE OR REPLACE FUNCTION update_career_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_career_categories_updated_at'
  ) THEN
    CREATE TRIGGER update_career_categories_updated_at 
      BEFORE UPDATE ON career_categories
      FOR EACH ROW EXECUTE FUNCTION update_career_updated_at_column();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_career_companies_updated_at'
  ) THEN
    CREATE TRIGGER update_career_companies_updated_at 
      BEFORE UPDATE ON career_companies
      FOR EACH ROW EXECUTE FUNCTION update_career_updated_at_column();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_career_jobs_updated_at'
  ) THEN
    CREATE TRIGGER update_career_jobs_updated_at 
      BEFORE UPDATE ON career_jobs
      FOR EACH ROW EXECUTE FUNCTION update_career_updated_at_column();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_career_applications_updated_at'
  ) THEN
    CREATE TRIGGER update_career_applications_updated_at 
      BEFORE UPDATE ON career_applications
      FOR EACH ROW EXECUTE FUNCTION update_career_updated_at_column();
  END IF;
END $$;

-- =====================================================
-- Step 9: Insert default data (optional)
-- =====================================================

-- Insert default categories
INSERT INTO career_categories (slug, multilingual_name, multilingual_description, sort_order)
VALUES 
  ('engineering', 
   '{"ar": "الهندسة", "en": "Engineering"}',
   '{"ar": "وظائف الهندسة والتطوير", "en": "Engineering and development positions"}',
   1),
  ('design', 
   '{"ar": "التصميم", "en": "Design"}',
   '{"ar": "وظائف التصميم والإبداع", "en": "Design and creative positions"}',
   2),
  ('marketing', 
   '{"ar": "التسويق", "en": "Marketing"}',
   '{"ar": "وظائف التسويق والمبيعات", "en": "Marketing and sales positions"}',
   3),
  ('operations', 
   '{"ar": "العمليات", "en": "Operations"}',
   '{"ar": "وظائف العمليات والإدارة", "en": "Operations and management positions"}',
   4),
  ('customer-success', 
   '{"ar": "نجاح العملاء", "en": "Customer Success"}',
   '{"ar": "وظائف خدمة ودعم العملاء", "en": "Customer service and support positions"}',
   5)
ON CONFLICT (slug) DO NOTHING;

-- Insert default company (your organization)
INSERT INTO career_companies (slug, multilingual_name, multilingual_description, is_active)
VALUES 
  ('sheenapps',
   '{"ar": "شين آبس", "en": "SheenApps"}',
   '{"ar": "منصة رائدة في تطوير التطبيقات والحلول الرقمية", "en": "Leading platform for application development and digital solutions"}',
   true)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- Step 10: Grant permissions (adjust as needed)
-- =====================================================

-- Grant usage on tables to authenticated users (for future user features)
-- GRANT SELECT ON career_jobs, career_categories, career_companies TO authenticated;
-- GRANT INSERT ON career_applications TO authenticated;

COMMIT;

-- =====================================================
-- Post-migration notes:
-- 1. Run this migration with: psql -U your_user -d your_db -f 081_career_portal_foundation.sql
-- 2. Verify indexes created successfully: \di career*
-- 3. Test trigram search: SELECT * FROM career_jobs WHERE search_text % 'keyword';
-- 4. Set up cron job for expiring jobs: UPDATE career_jobs SET status = 'expired' WHERE expires_at < NOW() AND status = 'published';
-- =====================================================