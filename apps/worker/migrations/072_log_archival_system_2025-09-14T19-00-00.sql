-- Log Archival System - R2 Object Storage Integration  
-- Expert-validated production-grade archival tracking with metadata for fast discovery
-- Incorporates expert recommendations: TIMESTAMPTZ, UNIQUE constraints, GiST range indexes
-- Follows Phase 3 implementation plan recommendations

BEGIN;

-- Create log tier enum for stronger typing (aligns with TypeScript LogTier)
DO $$ BEGIN
  CREATE TYPE log_tier AS ENUM ('system','build','deploy','action','lifecycle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enhanced archival tracking table with expert-recommended improvements
CREATE TABLE IF NOT EXISTS log_archival_status (
  segment_path TEXT PRIMARY KEY,                    -- TEXT preferred over VARCHAR in PostgreSQL
  r2_key TEXT NOT NULL UNIQUE,                     -- Each segment maps to exactly one R2 object
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Timezone-aware timestamps prevent UTC bugs
  local_deleted_at TIMESTAMPTZ,                    -- Timezone-aware for global consistency
  md5_checksum_hex CHAR(32) NOT NULL,              -- 32 hex chars for verification
  md5_checksum_b64 CHAR(24),                       -- Optional: base64 for AWS Content-MD5 header
  first_timestamp TIMESTAMPTZ NOT NULL,            -- First log entry time (timezone-aware)
  last_timestamp TIMESTAMPTZ NOT NULL,             -- Last log entry time (timezone-aware)
  tier log_tier NOT NULL,                          -- Enum type for stronger typing
  compressed BOOLEAN NOT NULL DEFAULT true,        -- .gz compression flag
  file_size_bytes BIGINT NOT NULL,                 -- Original file size
  
  -- Expert-recommended integrity guards
  CONSTRAINT chk_time_order CHECK (first_timestamp <= last_timestamp),
  CONSTRAINT chk_size_nonneg CHECK (file_size_bytes >= 0),
  CONSTRAINT chk_md5_hex CHECK (md5_checksum_hex ~ '^[0-9a-f]{32}$')
);

-- Generated range column for efficient overlap queries (expert-recommended)
ALTER TABLE log_archival_status
  ADD COLUMN IF NOT EXISTS ts_range tstzrange
  GENERATED ALWAYS AS (tstzrange(first_timestamp, last_timestamp, '[]')) STORED;

-- Enable btree_gist extension for sophisticated range indexing
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Classic B-tree indexes for common queries (kept from original design)
CREATE INDEX IF NOT EXISTS idx_archival_tier_time
  ON log_archival_status(tier, first_timestamp, last_timestamp);
CREATE INDEX IF NOT EXISTS idx_archival_r2_key
  ON log_archival_status(r2_key);
CREATE INDEX IF NOT EXISTS idx_archival_date
  ON log_archival_status(archived_at);
CREATE INDEX IF NOT EXISTS idx_archival_local_deleted
  ON log_archival_status(local_deleted_at)
  WHERE local_deleted_at IS NOT NULL;

-- Expert-recommended: GiST index for fast time window searches by tier
-- This makes "get segments overlapping [start,end] for tier=X" extremely fast
CREATE INDEX IF NOT EXISTS idx_archival_tier_tsrange
  ON log_archival_status
  USING GIST (tier, ts_range);

COMMIT;