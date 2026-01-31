# Run each separately
psql "your_connection" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advisors_multilingual_bio_gin ON advisors USING gin (multilingual_bio);"

psql "your_connection" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advisors_has_multilingual_bio ON advisors (user_id) WHERE multilingual_bio !=
  '{}'::jsonb;"

psql "your_connection" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advisors_multilingual_composite ON advisors (approval_status,
is_accepting_bookings) WHERE multilingual_bio != '{}'::jsonb;"

-- -- FALLBACK: Regular indexes that work in transactions
-- -- Use this if CONCURRENTLY keeps failing due to client transaction wrapping

-- BEGIN;

-- -- Create regular indexes (these work fine in transactions)
-- CREATE INDEX IF NOT EXISTS idx_advisors_multilingual_bio_gin
-- ON advisors USING gin (multilingual_bio);

-- CREATE INDEX IF NOT EXISTS idx_advisors_has_multilingual_bio
-- ON advisors (user_id)
-- WHERE multilingual_bio != '{}'::jsonb;

-- CREATE INDEX IF NOT EXISTS idx_advisors_multilingual_composite
-- ON advisors (approval_status, is_accepting_bookings)
-- WHERE multilingual_bio != '{}'::jsonb;

-- COMMIT;

-- -- Verification
-- SELECT
--   indexname,
--   tablename,
--   indexdef
-- FROM pg_indexes
-- WHERE indexname LIKE 'idx_advisors_multilingual%'
-- ORDER BY indexname;
