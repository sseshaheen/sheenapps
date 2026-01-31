-- CI Baseline Schema
-- Stubs Supabase dependencies so real migrations can run in vanilla PostgreSQL
-- This is NOT a minimal schema - it's a portable baseline for CI testing
--
-- Usage: Run ONLY in CI (excluded from production migrations)

-- Required extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Stub the auth schema (Supabase manages this in production)
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_sso_user BOOLEAN DEFAULT false
);

-- Create roles that Supabase provides (ignore if exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;

-- Build status enum (used by projects table)
DO $$ BEGIN
  CREATE TYPE build_status AS ENUM ('queued', 'building', 'success', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Projects table (base table many migrations reference)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  subdomain TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ,
  build_status build_status DEFAULT 'queued' NOT NULL,
  current_build_id VARCHAR(64),
  current_version_id TEXT,
  framework VARCHAR(16) DEFAULT 'react' NOT NULL,
  preview_url TEXT,
  org_id UUID
);

-- Project advisors table (referenced by migration 086 view)
CREATE TABLE IF NOT EXISTS project_advisors (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited',
  added_by UUID NOT NULL REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (project_id, advisor_id),
  CONSTRAINT project_advisors_status_check CHECK (status IN ('invited', 'pending_approval', 'active', 'removed'))
);

-- Grant basic permissions to roles
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
