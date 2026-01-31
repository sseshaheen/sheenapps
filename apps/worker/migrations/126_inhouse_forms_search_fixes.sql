-- Migration: 126_inhouse_forms_search_fixes.sql
-- Description: Fix schema mismatches and add search_vector trigger
-- Based on code review findings

BEGIN;

-- ============================================================================
-- FORMS SCHEMA FIXES
-- ============================================================================

-- 1) Add description column to form schemas
ALTER TABLE inhouse_form_schemas
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2) Fix fields default: should be {} (object) not [] (array)
-- Note: This only affects new rows; existing rows keep their values
ALTER TABLE inhouse_form_schemas
  ALTER COLUMN fields SET DEFAULT '{}'::jsonb;

-- 3) Fix submissions status values and add timestamp columns
-- First drop any existing CHECK constraint on status
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'inhouse_form_submissions'::regclass
      AND contype = 'c'
      AND conname LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE inhouse_form_submissions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Add new timestamp columns
ALTER TABLE inhouse_form_submissions
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Update default status from 'pending' to 'unread'
ALTER TABLE inhouse_form_submissions
  ALTER COLUMN status SET DEFAULT 'unread';

-- Add new CHECK constraint with correct status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_form_submissions_status_check'
    AND conrelid = 'inhouse_form_submissions'::regclass
  ) THEN
    ALTER TABLE inhouse_form_submissions
      ADD CONSTRAINT inhouse_form_submissions_status_check
      CHECK (status IN ('unread', 'read', 'archived', 'spam', 'deleted'));
  END IF;
END $$;

-- Migrate existing 'pending' status to 'unread'
UPDATE inhouse_form_submissions
SET status = 'unread'
WHERE status = 'pending';

-- 4) metadata: allow NULL (simpler than forcing {} everywhere)
-- Change from NOT NULL to nullable
ALTER TABLE inhouse_form_submissions
  ALTER COLUMN metadata DROP NOT NULL;

-- ============================================================================
-- SEARCH VECTOR TRIGGER (fix broken tsvector building)
-- ============================================================================

-- Function: builds a weighted tsvector from JSONB content
CREATE OR REPLACE FUNCTION inhouse_build_search_vector(
  content JSONB,
  fields TEXT[],
  weights JSONB,
  lang REGCONFIG
) RETURNS TSVECTOR AS $$
DECLARE
  vec TSVECTOR := ''::tsvector;
  f TEXT;
  w TEXT;
  txt TEXT;
BEGIN
  FOREACH f IN ARRAY fields LOOP
    txt := COALESCE(content ->> f, '');
    IF txt <> '' THEN
      w := COALESCE(weights ->> f, 'D');
      vec := vec || setweight(to_tsvector(lang, txt), w::"char");
    END IF;
  END LOOP;
  RETURN vec;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to set search_vector on insert/update
CREATE OR REPLACE FUNCTION inhouse_search_documents_set_vector()
RETURNS TRIGGER AS $$
DECLARE
  idx RECORD;
BEGIN
  SELECT language, searchable_fields, field_weights
    INTO idx
  FROM inhouse_search_indexes
  WHERE id = NEW.index_id;

  IF idx IS NOT NULL THEN
    NEW.search_vector :=
      inhouse_build_search_vector(
        NEW.content,
        idx.searchable_fields,
        idx.field_weights,
        idx.language::regconfig
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_inhouse_search_documents_vector'
      AND tgrelid = 'inhouse_search_documents'::regclass
  ) THEN
    CREATE TRIGGER trg_inhouse_search_documents_vector
    BEFORE INSERT OR UPDATE OF content ON inhouse_search_documents
    FOR EACH ROW
    EXECUTE FUNCTION inhouse_search_documents_set_vector();
  END IF;
END $$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION inhouse_build_search_vector IS 'Builds weighted tsvector from JSONB content using field weights';
COMMENT ON FUNCTION inhouse_search_documents_set_vector IS 'Trigger function to auto-compute search_vector on document insert/update';

COMMIT;
