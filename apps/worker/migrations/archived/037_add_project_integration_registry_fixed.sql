-- Migration 037: Project Integration Registry (Fixed)
-- Creates a centralized registry for all project integrations (Supabase, Sanity, Stripe, etc.)
-- This version handles missing projects table gracefully

-- Enum types keep status/type consistent (optional but nice)
DO $$ BEGIN
  CREATE TYPE integration_type AS ENUM ('supabase', 'sanity', 'stripe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE integration_status AS ENUM ('connected','pending','disconnected','error','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Project integrations registry table
CREATE TABLE IF NOT EXISTS project_integrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL, -- FK to projects(id) - will be added later if table exists
  type              integration_type NOT NULL,
  status            integration_status NOT NULL DEFAULT 'connected',
  connection_id     UUID,                    -- points at the per-integration connection row (e.g., supabase_connections.id)
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at   TIMESTAMPTZ,
  error_reason      TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_type UNIQUE (project_id, type)
);

-- Fast paths for common queries
CREATE INDEX IF NOT EXISTS idx_pi_project ON project_integrations(project_id);
CREATE INDEX IF NOT EXISTS idx_pi_type_status ON project_integrations(type, status);
CREATE INDEX IF NOT EXISTS idx_pi_connected ON project_integrations(project_id) WHERE status='connected';

-- Try to add foreign key constraints if the referenced tables exist
DO $$
BEGIN
  -- Add foreign key for projects table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    BEGIN
      ALTER TABLE project_integrations ADD CONSTRAINT fk_project_integrations_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
  END IF;
END $$;

-- Backfill from existing Supabase connections (only if both tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'supabase_connections') 
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    
    INSERT INTO project_integrations (project_id, type, status, connection_id, connected_at, metadata)
    SELECT
      sc.project_id,
      'supabase'::integration_type,
      CASE sc.connection_status
        WHEN 'active'      THEN 'connected'::integration_status
        WHEN 'revoked'     THEN 'revoked'::integration_status
        WHEN 'expired'     THEN 'error'::integration_status
        ELSE 'error'::integration_status
      END,
      sc.id,
      COALESCE(sc.updated_at, sc.created_at, now()),
      '{}'::jsonb
    FROM supabase_connections sc
    ON CONFLICT (project_id, type) DO UPDATE
    SET status       = EXCLUDED.status,
        connection_id= EXCLUDED.connection_id,
        connected_at = LEAST(project_integrations.connected_at, EXCLUDED.connected_at),
        updated_at   = now();
  END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE project_integrations IS 'Centralized registry for all project integrations (Supabase, Sanity, Stripe, etc.)';
COMMENT ON COLUMN project_integrations.connection_id IS 'Soft FK to integration-specific connection table (e.g., supabase_connections.id)';
COMMENT ON COLUMN project_integrations.metadata IS 'Integration-specific data (project refs, dataset names, etc.)';
COMMENT ON INDEX idx_pi_connected IS 'Partial index for fast dashboard queries of active integrations';