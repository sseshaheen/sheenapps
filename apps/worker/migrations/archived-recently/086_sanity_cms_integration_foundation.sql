-- Migration: Sanity CMS Integration Foundation
-- First-class Sanity CMS integration with complete feature set
-- Based on comprehensive technical plan and expert review

BEGIN;

-- Ensure required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Connection status enums for type safety
DO $$ BEGIN
  CREATE TYPE sanity_connection_status AS ENUM ('connected', 'disconnected', 'error', 'revoked', 'expired');
  CREATE TYPE sanity_preview_status AS ENUM ('active', 'expired', 'invalidated');
  CREATE TYPE sanity_version_type AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Sanity Connections (follows supabase_connections pattern)
CREATE TABLE IF NOT EXISTS public.sanity_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  
  -- Sanity project details
  sanity_project_id VARCHAR(255) NOT NULL,
  dataset_name VARCHAR(100) DEFAULT 'production',
  project_title TEXT,
  
  -- Authentication tokens (encrypted using GCM pattern for consistency)
  auth_token_encrypted TEXT NOT NULL,
  auth_token_iv VARCHAR(255) NOT NULL,
  auth_token_auth_tag VARCHAR(255) NOT NULL,
  robot_token_encrypted TEXT,
  robot_token_iv VARCHAR(255),
  robot_token_auth_tag VARCHAR(255),
  token_type VARCHAR(20) DEFAULT 'personal' CHECK (token_type IN ('personal', 'robot', 'jwt')),
  token_expires_at TIMESTAMPTZ,
  
  -- API configuration
  api_version VARCHAR(20) DEFAULT '2023-05-03',
  use_cdn BOOLEAN DEFAULT true,
  perspective VARCHAR(20) DEFAULT 'published', -- 'published' or 'previewDrafts'
  
  -- Real-time configuration
  realtime_enabled BOOLEAN DEFAULT true,
  webhook_secret TEXT,
  
  -- Schema tracking
  schema_version VARCHAR(50),
  content_types JSONB DEFAULT '[]'::JSONB,
  last_schema_sync TIMESTAMPTZ,
  
  -- Connection health with enum
  status sanity_connection_status DEFAULT 'connected',
  error_message TEXT,
  last_health_check TIMESTAMPTZ,
  
  -- Circuit breaker state (following Vercel pattern)
  circuit_breaker_state JSONB DEFAULT '{
    "consecutive_failures": 0,
    "is_open": false,
    "last_failure_at": null,
    "open_until": null
  }'::JSONB,
  
  -- Real-time connection tracking
  last_webhook_event_id VARCHAR(255), -- Replay cursor for reconnection
  
  -- MENA-specific configuration
  i18n_strategy VARCHAR(20) DEFAULT 'document' CHECK (i18n_strategy IN ('document', 'field')),
  slug_policy JSONB DEFAULT '{"mode":"native","transliterate":false}',
  
  -- Bridge to unified platform (nullable for future extensibility)
  integration_connection_id UUID,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT unique_sanity_project_dataset UNIQUE(sanity_project_id, dataset_name),
  CONSTRAINT valid_perspective CHECK (perspective IN ('published', 'previewDrafts')),
  
  -- Token consistency checks (AES-GCM requires all three components)
  CONSTRAINT ck_auth_token_triplet CHECK (
    (auth_token_encrypted IS NULL AND auth_token_iv IS NULL AND auth_token_auth_tag IS NULL)
    OR (auth_token_encrypted IS NOT NULL AND auth_token_iv IS NOT NULL AND auth_token_auth_tag IS NOT NULL)
  ),
  CONSTRAINT ck_robot_token_triplet CHECK (
    (robot_token_encrypted IS NULL AND robot_token_iv IS NULL AND robot_token_auth_tag IS NULL)
    OR (robot_token_encrypted IS NOT NULL AND robot_token_iv IS NOT NULL AND robot_token_auth_tag IS NOT NULL)
  )
);

-- 2. Content Versions & Document Tracking
CREATE TABLE IF NOT EXISTS public.sanity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  
  -- Sanity document identifiers
  document_id VARCHAR(255) NOT NULL, -- Sanity document ID
  document_type VARCHAR(100) NOT NULL,
  document_path TEXT, -- Document path in Studio
  
  -- Version tracking with improved draft/published semantics
  revision_id VARCHAR(255) NOT NULL,
  last_seen_rev VARCHAR(255), -- For optimistic concurrency control
  version_type sanity_version_type NOT NULL,
  canonical_document_id VARCHAR(255) NOT NULL, -- Published ID without "drafts." prefix
  is_draft BOOLEAN GENERATED ALWAYS AS (version_type = 'draft') STORED,
  
  -- Content metadata
  title TEXT,
  slug VARCHAR(255),
  language VARCHAR(10) DEFAULT 'en', -- Important for MENA
  content_hash VARCHAR(64), -- SHA256 for change detection
  
  -- Preview and publishing
  preview_url TEXT,
  published_at TIMESTAMPTZ,
  last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- GROQ query cache for this document
  cached_groq_queries JSONB DEFAULT '{}'::JSONB,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique per connection, document, and version type
  UNIQUE(connection_id, document_id, version_type)
);

-- 3. Schema Management
CREATE TABLE IF NOT EXISTS public.sanity_schema_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  
  -- Schema type information
  type_name VARCHAR(100) NOT NULL,
  type_category VARCHAR(50) NOT NULL, -- 'document', 'object', 'array', etc.
  
  -- Field definitions (stored as JSONB for flexibility)
  field_definitions JSONB NOT NULL DEFAULT '[]'::JSONB,
  
  -- Validation rules
  validation_rules JSONB DEFAULT '[]'::JSONB,
  
  -- Preview configuration
  preview_config JSONB DEFAULT '{}'::JSONB,
  
  -- I18n configuration (critical for MENA)
  i18n_config JSONB DEFAULT '{}'::JSONB,
  
  -- Schema metadata
  title TEXT,
  description TEXT,
  icon VARCHAR(50),
  
  -- Version tracking
  schema_version VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(connection_id, type_name)
);

-- 4. Real-Time Listeners & Subscriptions
CREATE TABLE IF NOT EXISTS public.sanity_realtime_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  
  -- Subscription details
  subscription_id VARCHAR(255) NOT NULL,
  groq_query TEXT NOT NULL,
  query_params JSONB DEFAULT '{}'::JSONB,
  
  -- WebSocket connection info
  websocket_id VARCHAR(255),
  user_session_id VARCHAR(255),
  
  -- Subscription status
  is_active BOOLEAN DEFAULT true,
  last_heartbeat TIMESTAMPTZ,
  
  -- Event filtering
  event_types TEXT[] DEFAULT ARRAY['mutation'], -- 'mutation', 'reconnect', 'welcome'
  include_drafts BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  UNIQUE(connection_id, subscription_id)
);

-- 5. Webhook Events (GROQ-powered)
-- First create the deduplication table (non-partitioned for global unique constraints)
CREATE TABLE IF NOT EXISTS public.sanity_webhook_dedup (
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  event_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (connection_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.sanity_webhook_events (
  id UUID DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  
  -- Webhook event details
  event_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL, -- 'document.create', 'document.update', 'document.delete'
  webhook_id VARCHAR(255),
  
  -- Document information
  document_id VARCHAR(255),
  document_type VARCHAR(100),
  previous_revision VARCHAR(255),
  current_revision VARCHAR(255),
  
  -- GROQ query and projection used
  groq_query TEXT,
  projection JSONB,
  
  -- Event payload (processed)
  payload JSONB NOT NULL,
  raw_payload_url TEXT, -- Link to R2/S3 for raw webhook body
  
  -- Processing status
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Composite primary key including partition key
  PRIMARY KEY (id, created_at)
  
  -- Deduplication handled by separate table due to partitioning constraints
  -- PostgreSQL requires partition key in unique constraints
) PARTITION BY RANGE (created_at);

-- Create initial partition
CREATE TABLE IF NOT EXISTS public.sanity_webhook_events_default PARTITION OF public.sanity_webhook_events DEFAULT;

-- MENA-specific locale configuration
CREATE TABLE IF NOT EXISTS public.sanity_locales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  locale_code VARCHAR(10) NOT NULL, -- 'ar', 'ar-SA', 'en', etc.
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, locale_code)
);

-- 6. Content Workflows & Approval Processes
CREATE TABLE IF NOT EXISTS public.sanity_content_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  
  -- Workflow definition
  workflow_name VARCHAR(100) NOT NULL,
  document_types TEXT[] NOT NULL, -- Which document types this applies to
  
  -- Workflow stages
  stages JSONB NOT NULL, -- [{"name": "draft", "required_roles": [], "actions": []}]
  
  -- Approval settings
  requires_approval BOOLEAN DEFAULT false,
  approval_roles TEXT[],
  auto_publish_conditions JSONB DEFAULT '{}'::JSONB,
  
  -- Notification settings
  notification_config JSONB DEFAULT '{}'::JSONB,
  
  -- Workflow status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(connection_id, workflow_name)
);

-- 7. Live Preview Management
CREATE TABLE IF NOT EXISTS public.sanity_preview_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  
  -- Preview deployment details
  preview_url TEXT NOT NULL,
  preview_secret_hash VARCHAR(64), -- SHA-256 hash, not plaintext for security
  deployment_id VARCHAR(255),
  
  -- Preview security and rotation
  preview_secret_ttl TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  used_at TIMESTAMPTZ,
  single_use BOOLEAN DEFAULT false,
  
  -- MENA preview configuration
  preview_theme JSONB DEFAULT '{"fontFamily":"Cairo,Tajawal","numeralSystem":"eastern","rtl":true}',
  
  -- Associated documents
  document_ids TEXT[] NOT NULL,
  content_hash VARCHAR(64), -- Combined hash of all documents
  
  -- Preview status with enum
  status sanity_preview_status DEFAULT 'active',
  
  -- Expiration
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Query Performance & Caching
CREATE TABLE IF NOT EXISTS public.sanity_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  
  -- Query information
  query_hash VARCHAR(64) NOT NULL, -- SHA256 of normalized query
  groq_query TEXT NOT NULL,
  query_params JSONB DEFAULT '{}'::JSONB,
  
  -- Cache data
  result_data JSONB,
  result_hash VARCHAR(64),
  
  -- Cache metadata
  hit_count INTEGER DEFAULT 0,
  last_hit TIMESTAMPTZ,
  
  -- Cache invalidation
  depends_on_documents TEXT[], -- Document IDs this query depends on
  invalidated_at TIMESTAMPTZ,
  
  -- TTL
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(connection_id, query_hash)
);

-- Query cache dependencies (separate table for precise invalidation)
CREATE TABLE IF NOT EXISTS public.sanity_query_dependencies (
  query_cache_id UUID REFERENCES public.sanity_query_cache(id) ON DELETE CASCADE,
  document_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (query_cache_id, document_id)
);

-- Document workflow state tracking (for dashboard queries)
CREATE TABLE IF NOT EXISTS public.sanity_document_workflow_state (
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  document_id VARCHAR(255) NOT NULL,
  workflow_name VARCHAR(100) NOT NULL,
  current_stage VARCHAR(100) NOT NULL,
  assignees TEXT[],
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (connection_id, document_id)
);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- Updated at triggers for all tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't_sanity_connections_updated' AND tgrelid = 'sanity_connections'::regclass) THEN
    CREATE TRIGGER t_sanity_connections_updated BEFORE UPDATE ON public.sanity_connections
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't_sanity_documents_updated' AND tgrelid = 'sanity_documents'::regclass) THEN
    CREATE TRIGGER t_sanity_documents_updated BEFORE UPDATE ON public.sanity_documents
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't_sanity_schema_types_updated' AND tgrelid = 'sanity_schema_types'::regclass) THEN
    CREATE TRIGGER t_sanity_schema_types_updated BEFORE UPDATE ON public.sanity_schema_types
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't_sanity_realtime_subscriptions_updated' AND tgrelid = 'sanity_realtime_subscriptions'::regclass) THEN
    CREATE TRIGGER t_sanity_realtime_subscriptions_updated BEFORE UPDATE ON public.sanity_realtime_subscriptions
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't_sanity_preview_deployments_updated' AND tgrelid = 'sanity_preview_deployments'::regclass) THEN
    CREATE TRIGGER t_sanity_preview_deployments_updated BEFORE UPDATE ON public.sanity_preview_deployments
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't_sanity_query_cache_updated' AND tgrelid = 'sanity_query_cache'::regclass) THEN
    CREATE TRIGGER t_sanity_query_cache_updated BEFORE UPDATE ON public.sanity_query_cache
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't_sanity_content_workflows_updated' AND tgrelid = 'sanity_content_workflows'::regclass) THEN
    CREATE TRIGGER t_sanity_content_workflows_updated BEFORE UPDATE ON public.sanity_content_workflows
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

-- Essential performance indexes
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_type ON public.sanity_documents(connection_id, document_type);
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_modified ON public.sanity_documents(connection_id, last_modified DESC);
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_canonical ON public.sanity_documents(connection_id, canonical_document_id, is_draft);
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_slug ON public.sanity_documents(connection_id, slug);
CREATE INDEX IF NOT EXISTS idx_sanity_webhook_events_connection_created ON public.sanity_webhook_events(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sanity_realtime_subscriptions_connection_active ON public.sanity_realtime_subscriptions(connection_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sanity_schema_types_connection_active ON public.sanity_schema_types(connection_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sanity_query_dependencies_document ON public.sanity_query_dependencies(document_id);
CREATE INDEX IF NOT EXISTS idx_sanity_connections_circuit_breaker ON public.sanity_connections((circuit_breaker_state->>'is_open'));

-- Webhook performance indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_sanity_webhook_events_unprocessed ON public.sanity_webhook_events(connection_id, created_at) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_sanity_webhook_events_type ON public.sanity_webhook_events(connection_id, event_type, created_at DESC);

-- Row Level Security Policies (including service accounts for webhooks/workers)
ALTER TABLE public.sanity_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_webhook_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_query_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_document_workflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_realtime_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_schema_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_preview_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanity_query_cache ENABLE ROW LEVEL SECURITY;

-- Service policies for background workers/webhooks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_connections') THEN
    CREATE POLICY sanity_service_connections ON public.sanity_connections FOR ALL TO service_role USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_documents') THEN
    CREATE POLICY sanity_service_documents ON public.sanity_documents FOR ALL TO service_role USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_webhook_events') THEN
    CREATE POLICY sanity_service_webhook_events ON public.sanity_webhook_events FOR ALL TO service_role USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_subscriptions') THEN
    CREATE POLICY sanity_service_subscriptions ON public.sanity_realtime_subscriptions FOR ALL TO service_role USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_schema') THEN
    CREATE POLICY sanity_service_schema ON public.sanity_schema_types FOR ALL TO service_role USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_previews') THEN
    CREATE POLICY sanity_service_previews ON public.sanity_preview_deployments FOR ALL TO service_role USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_cache') THEN
    CREATE POLICY sanity_service_cache ON public.sanity_query_cache FOR ALL TO service_role USING (true);
  END IF;
  
  -- Missing service policies for RLS coverage
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_dedup') THEN
    CREATE POLICY sanity_service_dedup ON public.sanity_webhook_dedup FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_qdep') THEN
    CREATE POLICY sanity_service_qdep ON public.sanity_query_dependencies FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_workflow') THEN
    CREATE POLICY sanity_service_workflow ON public.sanity_document_workflow_state FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_service_locales') THEN
    CREATE POLICY sanity_service_locales ON public.sanity_locales FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- User policies for normal app sessions (critical for app access)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_connections_owner') THEN
    CREATE POLICY sanity_connections_owner ON public.sanity_connections
      FOR ALL
      USING (user_id = current_setting('app.current_user_id', true)::uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_documents_owner') THEN
    CREATE POLICY sanity_documents_owner ON public.sanity_documents
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_webhook_events_owner') THEN
    CREATE POLICY sanity_webhook_events_owner ON public.sanity_webhook_events
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_subscriptions_owner') THEN
    CREATE POLICY sanity_subscriptions_owner ON public.sanity_realtime_subscriptions
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_schema_owner') THEN
    CREATE POLICY sanity_schema_owner ON public.sanity_schema_types
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_previews_owner') THEN
    CREATE POLICY sanity_previews_owner ON public.sanity_preview_deployments
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_cache_owner') THEN
    CREATE POLICY sanity_cache_owner ON public.sanity_query_cache
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

-- Missing user owner policies for RLS coverage
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_dedup_owner') THEN
    CREATE POLICY sanity_dedup_owner ON public.sanity_webhook_dedup
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_qdep_owner') THEN
    CREATE POLICY sanity_qdep_owner ON public.sanity_query_dependencies
      FOR ALL
      USING (
        query_cache_id IN (
          SELECT qc.id FROM public.sanity_query_cache qc
          JOIN public.sanity_connections sc ON sc.id = qc.connection_id
          WHERE sc.user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_workflow_owner') THEN
    CREATE POLICY sanity_workflow_owner ON public.sanity_document_workflow_state
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'sanity_locales_owner') THEN
    CREATE POLICY sanity_locales_owner ON public.sanity_locales
      FOR ALL
      USING (
        connection_id IN (
          SELECT id FROM public.sanity_connections
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      );
  END IF;
END $$;

-- Partitioning helper function for webhook events management
CREATE OR REPLACE FUNCTION sanity_create_webhook_partition(p_ym TEXT) RETURNS VOID AS $func$
DECLARE 
  tbl TEXT := 'sanity_webhook_events_' || p_ym; -- e.g., 2025_09
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF public.sanity_webhook_events
       FOR VALUES FROM (%L) TO (%L);',
    tbl,
    to_char(to_date(p_ym, 'YYYY_MM'), 'YYYY-MM-01 00:00:00+00'),
    to_char((to_date(p_ym, 'YYYY_MM') + INTERVAL '1 month'), 'YYYY-MM-01 00:00:00+00')
  );
END$func$ LANGUAGE plpgsql;

-- Additional improvements for production readiness

-- Locale and language format validation
ALTER TABLE public.sanity_locales 
  ADD CONSTRAINT ck_locale_format CHECK (locale_code ~ '^[A-Za-z]{2,3}(-[A-Za-z]{2,3})?$');

ALTER TABLE public.sanity_documents 
  ADD CONSTRAINT ck_language_format CHECK (language ~ '^[A-Za-z]{2,3}(-[A-Za-z]{2,3})?$');

-- Published document slug uniqueness (per connection/type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_published_slug
  ON public.sanity_documents(connection_id, document_type, slug)
  WHERE is_draft = false AND slug IS NOT NULL;

-- JSONB GIN indexes for frequent queries
CREATE INDEX IF NOT EXISTS gin_sanity_documents_metadata
  ON public.sanity_documents USING GIN (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS gin_sanity_schema_fields
  ON public.sanity_schema_types USING GIN (field_definitions jsonb_path_ops);

CREATE INDEX IF NOT EXISTS gin_sanity_documents_groq_cache
  ON public.sanity_documents USING GIN (cached_groq_queries jsonb_path_ops);

COMMIT;