-- 🔄 UPDATE GUEST PREFIX: Change guest_ to demo_ for better security
-- Run this AFTER running SECURITY_RESTORE.sql

-- =====================================
-- STEP 1: Update existing guest projects to demo projects
-- =====================================

-- Update all existing guest projects to use demo_ prefix
UPDATE projects 
SET owner_id = REPLACE(owner_id::text, 'guest_', 'demo_')::uuid
WHERE owner_id::text LIKE 'guest_%';

-- Update any commits that reference the old guest projects
UPDATE commits 
SET author_id = REPLACE(author_id::text, 'guest_', 'demo_')
WHERE author_id::text LIKE 'guest_%';

-- =====================================
-- STEP 2: Clean up any orphaned data
-- =====================================

-- Remove any demo projects older than 7 days (cleanup)
DELETE FROM projects 
WHERE owner_id::text LIKE 'demo_%' 
AND created_at < NOW() - INTERVAL '7 days';

-- =====================================
-- NOTES
-- =====================================
-- This script:
-- 1. Changes guest_ prefix to demo_ for existing projects
-- 2. Updates related records
-- 3. Cleans up old demo projects
-- 
-- The demo_ prefix is more restrictive and has automatic cleanup