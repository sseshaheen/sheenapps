BEGIN;

-- =====================================================================
-- Website Migration Tool Schema (Production-Ready)
-- Migration: 088_website_migration_tool_schema.sql
-- Purpose: Add database tables for website migration and uplift tool
--          Incorporates: audit trails, reproducibility, quality gates
-- =====================================================================

-- Add required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enums with idempotency protection
DO $$ BEGIN
  CREATE TYPE migration_status AS ENUM (
    'analyzing',      -- Initial site crawling and analysis
    'questionnaire',  -- Waiting for user responses to MCQ
    'processing',     -- AI transformation in progress
    'completed',      -- Migration successfully completed
    'failed'          -- Migration failed
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE migration_response_type AS ENUM (
    'mcq',           -- Multiple choice question
    'text',          -- Free text response
    'scale',         -- Numeric scale (1-5, 1-10, etc)
    'boolean',       -- Yes/No response
    'multi_select'   -- Multiple selections allowed
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE migration_phase_status AS ENUM (
    'pending',       -- Phase not started
    'running',       -- Phase currently executing
    'completed',     -- Phase completed successfully
    'failed',        -- Phase failed
    'skipped'        -- Phase skipped based on conditions
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crawl_status AS ENUM ('pending','crawling','complete','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE map_status AS ENUM ('planned','generated','verified','redirected','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued','running','needs_input','failed','complete','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_stage AS ENUM ('ANALYZE','PLAN','TRANSFORM','VERIFY','DEPLOY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main migration projects table (with reproducibility & security)
CREATE TABLE IF NOT EXISTS migration_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  normalized_source_url TEXT,              -- Normalized URL for deduplication
  user_prompt TEXT,
  status migration_status NOT NULL DEFAULT 'analyzing',
  verification_method TEXT,                -- 'dns', 'file', 'manual'
  verification_token_hash TEXT,            -- Store hash, not plaintext
  verification_expires_at TIMESTAMPTZ,     -- TTL for security
  verification_verified_at TIMESTAMPTZ,
  run_seed BIGINT,                         -- For reproducible AI runs
  tool_contract_version TEXT,              -- Track toolbox version
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  target_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,

  -- Enhanced constraints
  CONSTRAINT ck_migration_projects_valid_url CHECK (
    source_url ~* '^https?://' AND length(source_url) <= 2048
  ),
  CONSTRAINT ck_migration_projects_verification CHECK (
    (verification_method IS NULL) OR
    (verification_method IN ('dns', 'file', 'manual'))
  ),
  CONSTRAINT ck_verification_requires_expiry CHECK (
    verification_method IS NULL OR verification_expires_at IS NOT NULL
  )
);

-- Site analysis storage (enhanced with quality metrics)
CREATE TABLE IF NOT EXISTS migration_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL, -- 'preliminary', 'detailed', 'quality_gates'
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure analysis type is valid
  CONSTRAINT ck_migration_analysis_type CHECK (
    analysis_type IN ('preliminary', 'detailed', 'technology_scan', 'content_structure', 'asset_inventory', 'quality_gates')
  )
);

-- URL mapping for SEO preservation (critical for migration success)
CREATE TABLE IF NOT EXISTS migration_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  src_url TEXT NOT NULL,
  target_route TEXT NOT NULL,
  redirect_code SMALLINT NOT NULL DEFAULT 301,
  status map_status NOT NULL DEFAULT 'planned',
  src_http_status SMALLINT,
  canonical_src BOOLEAN DEFAULT false,
  canonical_url TEXT,
  meta_data JSONB,
  verified_at TIMESTAMPTZ,

  -- Constraints for data integrity
  CONSTRAINT redirect_code_ck CHECK (redirect_code IN (301,302,307,308)),
  UNIQUE (migration_project_id, src_url)
);

-- Jobs/queue management (separate from phases for better tracking)
CREATE TABLE IF NOT EXISTS migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'queued',
  stage job_stage NOT NULL,
  progress INT DEFAULT 0,
  idempotency_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Progress bounds
  CONSTRAINT ck_migration_jobs_progress CHECK (progress BETWEEN 0 AND 100)
);

-- User Brief (replaces questionnaire with guided prompts)
CREATE TABLE IF NOT EXISTS migration_user_brief (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  goals TEXT NOT NULL,                    -- 'preserve', 'modernize', 'uplift'
  style_preferences JSONB NOT NULL,       -- colors, typography, spacing, motion
  framework_preferences JSONB NOT NULL,   -- strict URL preservation, etc.
  content_tone TEXT,                      -- 'neutral', 'marketing', 'formal'
  non_negotiables JSONB,                  -- brand colors, legal text, tracking
  risk_appetite TEXT DEFAULT 'balanced',  -- 'conservative', 'balanced', 'bold'
  custom_instructions TEXT,               -- free-form user guidance
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (migration_project_id)
);

-- Migration phases tracking (AI-assisted transformations with audit trail)
CREATE TABLE IF NOT EXISTS migration_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  status migration_phase_status NOT NULL DEFAULT 'pending',
  claude_session_id TEXT,
  prompt_hash TEXT,                       -- Version the prompts for reproducibility
  model TEXT,                            -- Track which model was used
  tool_contract_version TEXT,            -- Track toolbox version
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enhanced constraints
  CONSTRAINT ck_migration_phases_name CHECK (
    phase_name IN (
      'content_extraction',
      'design_analysis',
      'component_mapping',
      'logic_transformation',
      'asset_optimization',
      'project_generation',
      'build_validation'
    )
  ),
  CONSTRAINT ck_migration_phases_order_nonneg CHECK (phase_order >= 0),

  -- Unique constraints
  CONSTRAINT uq_migration_phases_project_phase UNIQUE (migration_project_id, phase_name)
);

-- Tool call audit trail (append-only for governance)
CREATE TABLE IF NOT EXISTS migration_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,                   -- 'planner', 'transformer', 'critic', 'executive'
  tool TEXT NOT NULL,                    -- e.g., "crawl.fetch@1.0.0" (versioned)
  args_json JSONB NOT NULL,
  result_meta JSONB,
  cost_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crawl sessions (normalized URL + storage pointers for SSRF safety)
CREATE TABLE IF NOT EXISTS crawl_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  start_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  status crawl_status DEFAULT 'pending',
  robots_policy JSONB,
  sitemap_urls TEXT[],
  assets_url TEXT,                       -- R2 storage pointer for assets
  har_url TEXT,                          -- HAR file pointer
  snapshots_url TEXT,                    -- Screenshots pointer
  anti_bot_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (migration_project_id, normalized_url)
);

-- Scraped content storage (lean with object storage pointers)
CREATE TABLE IF NOT EXISTS migration_crawl_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL,            -- 'html', 'css', 'js', 'image', 'font', 'other'
  content_data JSONB,                    -- Small structured content only
  content_hash VARCHAR(64),              -- Hash for deduplication
  storage_url TEXT,                      -- R2/S3 pointer for large blobs
  file_size INTEGER,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enhanced constraints
  CONSTRAINT ck_migration_crawl_content_type CHECK (
    content_type IN ('html', 'css', 'js', 'image', 'font', 'document', 'other')
  )
);

-- Quality metrics tracking (for historical reporting)
CREATE TABLE IF NOT EXISTS migration_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  metric_group TEXT NOT NULL,            -- 'lighthouse','a11y','redirects','build'
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration responses (legacy table for backwards compatibility)
CREATE TABLE IF NOT EXISTS migration_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_project_id UUID NOT NULL REFERENCES migration_projects(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  response_type migration_response_type NOT NULL,
  response_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint to prevent duplicate responses to same question
  CONSTRAINT uq_migration_responses_project_question UNIQUE (migration_project_id, question_id)
);

-- =====================================================================
-- Enhanced Indexes for Performance
-- =====================================================================

-- Migration projects indexes
CREATE INDEX IF NOT EXISTS idx_migration_projects_user_id ON migration_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_migration_projects_status ON migration_projects(status);
CREATE INDEX IF NOT EXISTS idx_migration_projects_created_at ON migration_projects(created_at);
CREATE INDEX IF NOT EXISTS idx_migration_projects_target_project_id ON migration_projects(target_project_id);
CREATE INDEX IF NOT EXISTS idx_migration_projects_verif_exp ON migration_projects(verification_expires_at);

-- Prevent duplicate active migrations for same normalized URL (cost control)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_project_per_normalized_url
  ON migration_projects(user_id, normalized_source_url)
  WHERE status IN ('analyzing','processing','questionnaire') AND normalized_source_url IS NOT NULL;

-- Migration analysis indexes
CREATE INDEX IF NOT EXISTS idx_migration_analysis_project_id ON migration_analysis(migration_project_id);
CREATE INDEX IF NOT EXISTS idx_migration_analysis_type ON migration_analysis(analysis_type);

-- Migration map indexes (SEO critical)
CREATE INDEX IF NOT EXISTS idx_migration_map_proj_status ON migration_map(migration_project_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_map_target_unique
  ON migration_map(migration_project_id, target_route)
  WHERE status IN ('planned','generated','verified');

-- Migration jobs indexes
CREATE INDEX IF NOT EXISTS idx_migration_jobs_project_created ON migration_jobs(migration_project_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_jobs_idempotency
  ON migration_jobs(migration_project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- User brief indexes
CREATE INDEX IF NOT EXISTS idx_migration_brief_project_id ON migration_user_brief(migration_project_id);

-- Migration phases indexes (with unique order constraint)
CREATE INDEX IF NOT EXISTS idx_migration_phases_project_id ON migration_phases(migration_project_id);
CREATE INDEX IF NOT EXISTS idx_migration_phases_status ON migration_phases(status);
CREATE INDEX IF NOT EXISTS idx_migration_phases_order ON migration_phases(migration_project_id, phase_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_phase_order ON migration_phases(migration_project_id, phase_order);

-- Tool calls audit indexes
CREATE INDEX IF NOT EXISTS idx_migration_tool_calls_project ON migration_tool_calls(migration_project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_tool_calls_agent ON migration_tool_calls(agent);

-- Crawl sessions indexes
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_project_id ON crawl_sessions(migration_project_id);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_status ON crawl_sessions(status);

-- Crawl data indexes (with deduplication)
CREATE INDEX IF NOT EXISTS idx_migration_crawl_project_url ON migration_crawl_data(migration_project_id, url);
CREATE INDEX IF NOT EXISTS idx_migration_crawl_content_type ON migration_crawl_data(content_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crawl_dedupe
  ON migration_crawl_data(migration_project_id, url, content_type, COALESCE(content_hash, ''));

-- Quality metrics indexes
CREATE INDEX IF NOT EXISTS idx_mqm_proj_group ON migration_quality_metrics(migration_project_id, metric_group);

-- Additional useful indexes for lookups
CREATE INDEX IF NOT EXISTS idx_migration_map_src ON migration_map(migration_project_id, src_url);

-- Legacy responses indexes (for backwards compatibility)
CREATE INDEX IF NOT EXISTS idx_migration_responses_project_id ON migration_responses(migration_project_id);

-- =====================================================================
-- Helper Functions & Triggers
-- =====================================================================

-- Generic function to update updated_at timestamp
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_migration_projects_updated_at'
    AND tgrelid = 'migration_projects'::regclass
  ) THEN
    CREATE TRIGGER tr_migration_projects_updated_at
      BEFORE UPDATE ON migration_projects
      FOR EACH ROW
      EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_migration_user_brief_updated_at'
    AND tgrelid = 'migration_user_brief'::regclass
  ) THEN
    CREATE TRIGGER tr_migration_user_brief_updated_at
      BEFORE UPDATE ON migration_user_brief
      FOR EACH ROW
      EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_migration_responses_updated_at'
    AND tgrelid = 'migration_responses'::regclass
  ) THEN
    CREATE TRIGGER tr_migration_responses_updated_at
      BEFORE UPDATE ON migration_responses
      FOR EACH ROW
      EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_crawl_sessions_updated_at'
    AND tgrelid = 'crawl_sessions'::regclass
  ) THEN
    CREATE TRIGGER tr_crawl_sessions_updated_at
      BEFORE UPDATE ON crawl_sessions
      FOR EACH ROW
      EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_migration_jobs_updated_at'
    AND tgrelid = 'migration_jobs'::regclass
  ) THEN
    CREATE TRIGGER tr_migration_jobs_updated_at
      BEFORE UPDATE ON migration_jobs
      FOR EACH ROW
      EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

-- =====================================================================
-- Enhanced Row Level Security (RLS) Policies
-- =====================================================================

-- Enable RLS on all migration tables
ALTER TABLE migration_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_user_brief ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_crawl_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_quality_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_responses ENABLE ROW LEVEL SECURITY;

-- Migration projects policies (split by operation with WITH CHECK)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_projects_user_select') THEN
    CREATE POLICY migration_projects_user_select ON migration_projects
      FOR SELECT USING (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_projects_user_insert') THEN
    CREATE POLICY migration_projects_user_insert ON migration_projects
      FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_projects_user_update') THEN
    CREATE POLICY migration_projects_user_update ON migration_projects
      FOR UPDATE USING (user_id = current_setting('app.current_user_id', true)::uuid)
                 WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;
END $$;

-- Service role policies (for background workers)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND
     NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_projects_service') THEN
    CREATE POLICY migration_projects_service ON migration_projects
      FOR ALL TO app_service USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Helper function for user ownership check (reduces repetition)
CREATE OR REPLACE FUNCTION user_owns_migration(migration_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_temp, public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM migration_projects mp
    WHERE mp.id = migration_id
    AND mp.user_id = current_setting('app.current_user_id', true)::uuid
  );
END;
$$;

-- Migration analysis policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_analysis_user_access') THEN
    CREATE POLICY migration_analysis_user_access ON migration_analysis
      FOR ALL USING (user_owns_migration(migration_project_id))
      WITH CHECK (user_owns_migration(migration_project_id));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND
     NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_analysis_service') THEN
    CREATE POLICY migration_analysis_service ON migration_analysis
      FOR ALL TO app_service USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Migration map policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_map_user_access') THEN
    CREATE POLICY migration_map_user_access ON migration_map
      FOR ALL USING (user_owns_migration(migration_project_id))
      WITH CHECK (user_owns_migration(migration_project_id));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND
     NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'migration_map_service') THEN
    CREATE POLICY migration_map_service ON migration_map
      FOR ALL TO app_service USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Apply same pattern to remaining tables
DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
  service_policy_name TEXT;
BEGIN
  FOR table_name IN VALUES
    ('migration_jobs'), ('migration_user_brief'), ('migration_phases'),
    ('migration_tool_calls'), ('crawl_sessions'), ('migration_crawl_data'),
    ('migration_quality_metrics'), ('migration_responses')
  LOOP
    policy_name := table_name || '_user_access';
    service_policy_name := table_name || '_service';

    -- User access policy
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = policy_name) THEN
      EXECUTE format('
        CREATE POLICY %I ON %I
        FOR ALL USING (user_owns_migration(migration_project_id))
        WITH CHECK (user_owns_migration(migration_project_id))',
        policy_name, table_name);
    END IF;

    -- Service role policy (if role exists)
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND
       NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = service_policy_name) THEN
      EXECUTE format('
        CREATE POLICY %I ON %I
        FOR ALL TO app_service USING (true) WITH CHECK (true)',
        service_policy_name, table_name);
    END IF;
  END LOOP;
END $$;

COMMIT;