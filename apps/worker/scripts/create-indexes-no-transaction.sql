-- =====================================================
-- Run each command separately via psql with autocommit
-- =====================================================

-- Command 1: Run this first
CREATE INDEX CONCURRENTLY idx_advisors_multilingual_bio_gin 
ON advisors USING gin (multilingual_bio);

-- Command 2: Run this second (wait for first to complete)
CREATE INDEX CONCURRENTLY idx_advisors_has_multilingual_bio
ON advisors (user_id) 
WHERE multilingual_bio != '{}'::jsonb;

-- Command 3: Run this third (wait for second to complete)
CREATE INDEX CONCURRENTLY idx_advisors_multilingual_composite
ON advisors (approval_status, is_accepting_bookings) 
WHERE multilingual_bio != '{}'::jsonb;