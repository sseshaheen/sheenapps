-- Migration 032: Add rollback states to build_status enum
-- IDEMPOTENT: Safe to run multiple times

-- Add rollback states to build_status enum if they don't exist
DO $$
BEGIN
    -- Check if 'rollingBack' value exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'rollingBack' 
                   AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'build_status')) THEN
        ALTER TYPE build_status ADD VALUE 'rollingBack';
        RAISE NOTICE 'Added rollingBack to build_status enum';
    ELSE
        RAISE NOTICE 'rollingBack already exists in build_status enum';
    END IF;

    -- Check if 'rollbackFailed' value exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'rollbackFailed' 
                   AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'build_status')) THEN
        ALTER TYPE build_status ADD VALUE 'rollbackFailed';
        RAISE NOTICE 'Added rollbackFailed to build_status enum';
    ELSE
        RAISE NOTICE 'rollbackFailed already exists in build_status enum';
    END IF;
END $$;

-- Update any rows that might be in invalid states (cleanup)
UPDATE projects 
SET build_status = 'deployed' 
WHERE build_status IS NULL;

-- Add comment about rollback states
COMMENT ON TYPE build_status IS 'Build status enum including rollback states: rollingBack (transitional), rollbackFailed (final error state)';