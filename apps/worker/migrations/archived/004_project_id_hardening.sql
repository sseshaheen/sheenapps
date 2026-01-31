-- Migration: Project ID Generation Hardening
-- Purpose: Add server-side project ID generation with audit tracking and ULID support
-- Date: 2025-08-04

-- Add audit tracking column for project creation source (safe for re-running)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'projects' AND column_name = 'created_by_service') THEN
        ALTER TABLE projects ADD COLUMN created_by_service VARCHAR(50) NOT NULL DEFAULT 'worker-service';
    END IF;
END $$;

-- Create ULID generation function (based on TypeScript ulid() library behavior)
-- This provides a PostgreSQL-native ULID generator for consistency
CREATE OR REPLACE FUNCTION generate_ulid() RETURNS TEXT AS $$
DECLARE
    -- ULID format: 10 bytes timestamp (base32) + 16 bytes randomness (base32) = 26 chars
    timestamp_part TEXT;
    random_part TEXT;
    ulid_alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford's Base32
    ts BIGINT;
    random_bytes BYTEA;
    i INT;
    result TEXT := '';
BEGIN
    -- Get current timestamp in milliseconds
    ts := EXTRACT(EPOCH FROM NOW() AT TIME ZONE 'UTC') * 1000;
    
    -- Convert timestamp to 10-character base32 string
    timestamp_part := '';
    FOR i IN 0..9 LOOP
        timestamp_part := SUBSTRING(ulid_alphabet FROM ((ts >> (5 * (9-i))) & 31)::INTEGER + 1 FOR 1) || timestamp_part;
    END LOOP;
    
    -- Generate 16 random bytes for the random part
    random_bytes := gen_random_bytes(10); -- 10 bytes = 16 base32 chars
    
    -- Convert random bytes to 16-character base32 string
    random_part := '';
    FOR i IN 0..9 LOOP
        random_part := random_part || SUBSTRING(ulid_alphabet FROM (GET_BYTE(random_bytes, i) >> 3) + 1 FOR 1);
        IF i < 9 THEN
            random_part := random_part || SUBSTRING(ulid_alphabet FROM ((GET_BYTE(random_bytes, i) & 7) << 2 | (GET_BYTE(random_bytes, i+1) >> 6)) + 1 FOR 1);
        END IF;
    END LOOP;
    
    -- Ensure we have exactly 16 characters for random part
    random_part := SUBSTRING(random_part FROM 1 FOR 16);
    
    RETURN timestamp_part || random_part;
END;
$$ LANGUAGE plpgsql;

-- Create comprehensive project creation function with advisory locking
CREATE OR REPLACE FUNCTION create_complete_project(
  p_user_id UUID,
  p_framework VARCHAR(16) DEFAULT 'react',
  p_prompt TEXT DEFAULT NULL,
  p_name TEXT DEFAULT 'Untitled Project'
) RETURNS TABLE(project_id UUID, version_id TEXT, build_id TEXT, build_metrics_id INTEGER) AS $$
DECLARE
  new_project_id UUID;
  new_version_id TEXT;
  new_build_id TEXT;
  new_metrics_id INTEGER;
BEGIN
  -- Advisory lock prevents accidental double-click project creation (automatic cleanup on transaction end)
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  
  -- Generate all IDs server-side
  new_project_id := gen_random_uuid();
  new_version_id := generate_ulid();
  new_build_id := generate_ulid();
  
  -- Create project with initial build state
  INSERT INTO projects (id, owner_id, name, framework, created_by_service,
                       build_status, current_build_id, current_version_id, 
                       last_build_started)
  VALUES (new_project_id, p_user_id, p_name, p_framework, 'worker-service',
          'building', new_build_id, new_version_id, NOW());
  
  -- Create initial version
  INSERT INTO project_versions (user_id, project_id, version_id, prompt, 
                               framework, status)
  VALUES (p_user_id, new_project_id, new_version_id, p_prompt, 
          p_framework, 'building');
  
  -- Create initial build metrics record
  INSERT INTO project_build_metrics (build_id, version_id, project_id, user_id,
                                   is_initial_build, status, started_at, framework)
  VALUES (new_build_id, new_version_id, new_project_id, p_user_id,
          true, 'started', NOW(), p_framework)
  RETURNING id INTO new_metrics_id;
  
  RETURN QUERY SELECT new_project_id, new_version_id, new_build_id, new_metrics_id;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION create_complete_project IS 'Atomically creates project with all required records and prevents race conditions via advisory locking';
COMMENT ON FUNCTION generate_ulid IS 'PostgreSQL-native ULID generator compatible with TypeScript ulid() library';