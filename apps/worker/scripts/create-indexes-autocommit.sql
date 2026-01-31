-- PostgreSQL AUTOCOMMIT solution for CREATE INDEX CONCURRENTLY
-- Run this with: psql DATABASE_URL -f scripts/create-indexes-autocommit.sql

-- Enable autocommit mode (this is the key!)
\set AUTOCOMMIT on

-- Now CREATE INDEX CONCURRENTLY will work
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advisors_multilingual_bio_gin 
ON advisors USING gin (multilingual_bio);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advisors_has_multilingual_bio
ON advisors (user_id) 
WHERE multilingual_bio != '{}'::jsonb;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advisors_multilingual_composite
ON advisors (approval_status, is_accepting_bookings) 
WHERE multilingual_bio != '{}'::jsonb;

-- Verify the indexes were created
\echo 'Verifying indexes were created:'
SELECT indexname, tablename FROM pg_indexes 
WHERE indexname LIKE 'idx_advisors_multilingual%'
ORDER BY indexname;