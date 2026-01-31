-- Migration 008: Fix published_version foreign key constraint
-- 
-- Problem: The fk_published_version constraint still references the old 
-- "project_versions_metadata-delete" table instead of the consolidated
-- "project_versions" table.
--
-- Solution: Drop the old constraint and create a new one pointing to the
-- correct consolidated table.

BEGIN;

-- Drop the old foreign key constraint
ALTER TABLE projects 
DROP CONSTRAINT IF EXISTS fk_published_version;

-- Add the new foreign key constraint pointing to the consolidated project_versions table
ALTER TABLE projects 
ADD CONSTRAINT fk_published_version 
FOREIGN KEY (published_version_id) 
REFERENCES project_versions(version_id) 
ON DELETE SET NULL;

-- Verify the constraint was created correctly
-- This will show the new constraint details
SELECT 
    conname, 
    conrelid::regclass as table_name, 
    confrelid::regclass as references_table
FROM pg_constraint 
WHERE conname = 'fk_published_version';

COMMIT;