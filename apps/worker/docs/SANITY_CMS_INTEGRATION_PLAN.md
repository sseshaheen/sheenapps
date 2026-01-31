# Sanity CMS Integration Plan - First Class Implementation

## Executive Summary

**Status**: Production-Ready Migration + Breakglass Complete ✅  
**Approach**: First-class integration (following Vercel pattern)  
**Timeline**: 6-8 weeks full implementation  
**Complexity**: High (CMS-specific features, real-time collaboration, content workflows)

## 🚀 Implementation Progress

### ✅ Phase 1: Foundation (Week 1-2) - COMPLETED
- ✅ **Database Migration**: `086_sanity_cms_integration_foundation.sql` - Complete schema with all tables, indexes, RLS policies, and triggers
- ✅ **Core Service**: `sanityService.ts` - Connection management, authentication, health monitoring, circuit breakers
- ✅ **API Routes**: `sanity.ts` - Complete CRUD operations for connections, health checks, schema sync
- ✅ **Webhook Service**: `sanityWebhookService.ts` - Signature validation, event processing, deduplication
- ✅ **Content Service**: `sanityContentService.ts` - Document sync, GROQ queries, intelligent caching
- ✅ **Preview Service**: `sanityPreviewService.ts` - Secure token management, MENA-optimized themes
- ✅ **Breakglass Recovery**: `sanityBreakglassService.ts` - Emergency plaintext token access for encrypted token failures

### ✅ Phase 1.5: Breakglass Security (Added) - COMPLETED  
- ✅ **Database Migration**: `087_sanity_breakglass_recovery.sql` - Plaintext token storage with strict RLS policies
- ✅ **Breakglass Service**: `sanityBreakglassService.ts` - Always-on emergency access with comprehensive audit logging
- ✅ **Admin API Integration**: Breakglass endpoints added to `sanity.ts` with admin-only access controls
- ✅ **Auto-Creation**: Automatic breakglass entry creation during connection setup (required failsafe)

### ✅ Phase 1.6: Expert Review + Production Hardening - COMPLETED
**Critical Fixes Applied:**
- ✅ **`last_modified` Default**: Fixed NOT NULL constraint without default (prevents insert failures)
- ✅ **Token Consistency Checks**: AES-GCM triplet validation (encrypted + IV + auth_tag must all exist or all be null)
- ✅ **RLS Coverage**: Added missing policies for `sanity_webhook_dedup`, `sanity_query_dependencies`, `sanity_document_workflow_state`, `sanity_locales`
- ✅ **Webhook Performance**: Added indexes for unprocessed events and event type queries
- ✅ **Partition Helper**: `sanity_create_webhook_partition()` function for monthly partition management

**High-Value Improvements:**
- ✅ **Locale Validation**: Format checks for locale codes (e.g., 'en', 'ar-SA')
- ✅ **Slug Uniqueness**: Published document slugs unique per connection/type
- ✅ **JSONB Performance**: GIN indexes for metadata, field definitions, and GROQ cache queries

### 🔄 Current Status: Ready for Production Migration
**Implementation Files Created:**
- `/migrations/086_sanity_cms_integration_foundation.sql` (Complete database schema)
- `/migrations/087_sanity_breakglass_recovery.sql` (Emergency plaintext token storage)
- `/src/services/sanityService.ts` (Core connection management + breakglass auto-creation)
- `/src/services/sanityBreakglassService.ts` (Emergency access with audit logging)
- `/src/services/sanityWebhookService.ts` (Real-time event processing)  
- `/src/services/sanityContentService.ts` (Document synchronization)
- `/src/services/sanityPreviewService.ts` (Secure preview system)
- `/src/routes/sanity.ts` (Complete API endpoints + breakglass admin endpoints)

### ✅ Completed Implementation Tasks:
1. ✅ **Install Dependencies**: `pnpm add @sanity/client` 
2. ✅ **Register Routes**: Added `sanityRoutes` to `server.ts`
3. ✅ **TypeScript Compilation**: Fixed all Sanity-related type errors
4. ✅ **Breakglass Security**: Complete emergency access system implemented

### 📋 Next Steps Required:
1. **Run Migrations**: Apply database schemas to production (`086_*` and `087_*`)
2. **Environment Variables**: Configure `TOKEN_ENCRYPTION_KEY` if not already set  
3. **Manual Testing**: Test connection creation and breakglass access flows
4. **Admin Documentation**: Document breakglass procedures for operations team

### 🎯 Key Features Implemented:

#### ✅ Connection Management
- Token encryption using AES-GCM (follows existing Vercel pattern)
- Circuit breaker protection for failed connections
- Health monitoring and automatic recovery
- Support for personal, robot, and JWT token types

#### ✅ Real-Time Webhooks
- Timing-safe signature validation
- Event deduplication with separate table (PostgreSQL partitioning compatible)
- Automatic document synchronization from webhook events
- Intelligent query cache invalidation

#### ✅ Document Synchronization  
- Incremental sync with change detection
- Draft/published version tracking
- Content hashing for efficient updates
- GROQ query caching with dependency tracking

#### ✅ Secure Preview System
- SHA-256 hashed preview secrets (not plaintext storage)
- Single-use and TTL expiry options
- MENA-optimized themes (Arabic fonts, RTL, Eastern numerals)
- Timing-safe secret validation

#### ✅ MENA-Specific Features
- Document-per-locale and field-level i18n strategies
- Arabic slug support with native mode
- RTL-aware preview themes
- Eastern Arabic numeral system support

## Strategic Rationale

### Why First-Class Implementation?

1. **Competitive Advantage**: Superior CMS experience vs competitors (Lovable, v0, Replit)
2. **MENA Market Focus**: Arabic content management, RTL support, multilingual workflows
3. **Feature Completeness**: 100% of Sanity's capabilities vs 30-40% with unified approach
4. **User Experience**: Real-time collaboration, live preview, proper content workflows
5. **Strategic Importance**: CMS is core to many projects, especially content-heavy MENA sites

### Sanity's Unique Requirements

- **Complex Authentication**: Token-based (personal/robot), JWT, third-party providers
- **Real-Time Collaboration**: Live listeners, collaborative editing, concurrent updates
- **Content Versioning**: Draft/published states, revision history, rollback capabilities
- **Advanced Webhooks**: GROQ-powered with custom payloads, document vs transaction webhooks
- **Schema Management**: Dynamic content types, field validation, schema migrations
- **Query Complexity**: GROQ queries, GraphQL support, mutations, transactions

## Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Sanity CMS Integration                    │
├─────────────────────────────────────────────────────────────┤
│  Authentication Layer    │  Real-Time Engine               │
│  ├─ Token Management     │  ├─ WebSocket Connections       │
│  ├─ Robot Tokens         │  ├─ Live Content Updates        │
│  └─ Third-Party Auth     │  └─ Collaborative Editing       │
├─────────────────────────────────────────────────────────────┤
│  Content Management      │  Schema Management              │
│  ├─ Version Control      │  ├─ Dynamic Types               │
│  ├─ Draft/Publish        │  ├─ Field Validation            │
│  └─ Preview URLs         │  └─ Migration Handling          │
├─────────────────────────────────────────────────────────────┤
│  Webhook System          │  Query Engine                   │
│  ├─ GROQ-powered         │  ├─ GROQ Query Builder          │
│  ├─ Document Events      │  ├─ GraphQL Support             │
│  └─ Transaction Events   │  └─ Query Caching               │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema Design

### Core Tables Structure

```sql
-- Ensure required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Connection status enums for type safety
DO $$ BEGIN
  CREATE TYPE sanity_connection_status AS ENUM ('connected', 'disconnected', 'error', 'revoked', 'expired');
  CREATE TYPE sanity_preview_status AS ENUM ('active', 'expired', 'invalidated');
  CREATE TYPE sanity_version_type AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Sanity Connections (similar to vercel_connections pattern)
CREATE TABLE sanity_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
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
  
  -- Bridge to unified platform
  integration_connection_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT unique_sanity_project_dataset UNIQUE(sanity_project_id, dataset_name),
  CONSTRAINT valid_perspective CHECK (perspective IN ('published', 'previewDrafts'))
);

-- 2. Content Versions & Document Tracking
CREATE TABLE sanity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  
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
  last_modified TIMESTAMPTZ NOT NULL,
  
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
CREATE TABLE sanity_schema_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  
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
CREATE TABLE sanity_realtime_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  
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
CREATE TABLE IF NOT EXISTS sanity_webhook_dedup (
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  event_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (connection_id, event_id)
);

CREATE TABLE sanity_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  
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
  
  -- Deduplication handled by separate table due to partitioning constraints
  -- PostgreSQL requires partition key in unique constraints
) PARTITION BY RANGE (created_at);

-- Create initial partition
CREATE TABLE sanity_webhook_events_default PARTITION OF sanity_webhook_events DEFAULT;

-- MENA-specific locale configuration
CREATE TABLE IF NOT EXISTS sanity_locales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  locale_code VARCHAR(10) NOT NULL, -- 'ar', 'ar-SA', 'en', etc.
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, locale_code)
);

-- Query cache dependencies (separate table for precise invalidation)
CREATE TABLE IF NOT EXISTS sanity_query_dependencies (
  query_cache_id UUID REFERENCES sanity_query_cache(id) ON DELETE CASCADE,
  document_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (query_cache_id, document_id)
);

-- Document workflow state tracking (for dashboard queries)
CREATE TABLE IF NOT EXISTS sanity_document_workflow_state (
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
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
CREATE TRIGGER t_sanity_connections_updated BEFORE UPDATE ON sanity_connections
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_sanity_documents_updated BEFORE UPDATE ON sanity_documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_sanity_schema_types_updated BEFORE UPDATE ON sanity_schema_types
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_sanity_realtime_subscriptions_updated BEFORE UPDATE ON sanity_realtime_subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_sanity_preview_deployments_updated BEFORE UPDATE ON sanity_preview_deployments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_sanity_query_cache_updated BEFORE UPDATE ON sanity_query_cache
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Essential performance indexes
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_type ON sanity_documents(connection_id, document_type);
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_modified ON sanity_documents(connection_id, last_modified DESC);
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_canonical ON sanity_documents(connection_id, canonical_document_id, is_draft);
CREATE INDEX IF NOT EXISTS idx_sanity_documents_connection_slug ON sanity_documents(connection_id, slug);
CREATE INDEX IF NOT EXISTS idx_sanity_webhook_events_connection_created ON sanity_webhook_events(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sanity_realtime_subscriptions_connection_active ON sanity_realtime_subscriptions(connection_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sanity_schema_types_connection_active ON sanity_schema_types(connection_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sanity_query_dependencies_document ON sanity_query_dependencies(document_id);
CREATE INDEX IF NOT EXISTS idx_sanity_connections_circuit_breaker ON sanity_connections((circuit_breaker_state->>'is_open'));

-- Row Level Security Policies (including service accounts for webhooks/workers)
ALTER TABLE sanity_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanity_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanity_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanity_realtime_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanity_schema_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanity_preview_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanity_query_cache ENABLE ROW LEVEL SECURITY;

-- Service policies for background workers/webhooks
CREATE POLICY sanity_service_connections ON sanity_connections FOR ALL TO app_service USING (true);
CREATE POLICY sanity_service_documents ON sanity_documents FOR ALL TO app_service USING (true);
CREATE POLICY sanity_service_webhook_events ON sanity_webhook_events FOR ALL TO app_service USING (true);
CREATE POLICY sanity_service_subscriptions ON sanity_realtime_subscriptions FOR ALL TO app_service USING (true);
CREATE POLICY sanity_service_schema ON sanity_schema_types FOR ALL TO app_service USING (true);
CREATE POLICY sanity_service_previews ON sanity_preview_deployments FOR ALL TO app_service USING (true);
CREATE POLICY sanity_service_cache ON sanity_query_cache FOR ALL TO app_service USING (true);

-- User policies for normal app sessions (critical for app access)
CREATE POLICY sanity_connections_owner ON sanity_connections
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY sanity_documents_owner ON sanity_documents
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM sanity_connections
      WHERE user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

CREATE POLICY sanity_webhook_events_owner ON sanity_webhook_events
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM sanity_connections
      WHERE user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

CREATE POLICY sanity_subscriptions_owner ON sanity_realtime_subscriptions
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM sanity_connections
      WHERE user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

CREATE POLICY sanity_schema_owner ON sanity_schema_types
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM sanity_connections
      WHERE user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

CREATE POLICY sanity_previews_owner ON sanity_preview_deployments
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM sanity_connections
      WHERE user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

CREATE POLICY sanity_cache_owner ON sanity_query_cache
  FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM sanity_connections
      WHERE user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- 6. Content Workflows & Approval Processes
CREATE TABLE sanity_content_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  
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
CREATE TABLE sanity_preview_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  
  -- Preview deployment details
  preview_url TEXT NOT NULL,
  preview_secret_hash VARCHAR(64), -- SHA-256 hash, not plaintext for security
  deployment_id VARCHAR(255),
  
  -- Preview security and rotation
  preview_secret_ttl TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  used_at TIMESTAMPTZ,
  single_use BOOLEAN DEFAULT false,
  
  -- MENA preview configuration
  preview_theme JSONB DEFAULT '{\"fontFamily\":\"Cairo,Tajawal\",\"numeralSystem\":\"eastern\",\"rtl\":true}',
  
  -- Associated documents
  document_ids TEXT[] NOT NULL,
  content_hash VARCHAR(64), -- Combined hash of all documents
  
  -- Preview status with enum
  status sanity_preview_status DEFAULT 'active'
  
  -- Expiration
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Query Performance & Caching
CREATE TABLE sanity_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sanity_connections(id) ON DELETE CASCADE,
  
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
```

## Implementation Phases

### Phase 1: Foundation (2 weeks)

#### Week 1: Core Schema & Authentication
- [ ] Create database migration with core tables
- [ ] Implement Sanity authentication (token-based)
- [ ] Set up basic connection management
- [ ] Create connection health monitoring
- [ ] Build token encryption/decryption utilities

#### Week 2: Basic Document Management
- [ ] Document synchronization from Sanity
- [ ] Basic GROQ query execution
- [ ] Content versioning (draft/published)
- [ ] Simple webhook receiver setup
- [ ] Basic schema type detection

### Phase 2: Advanced Features (3 weeks)

#### Week 3: Real-Time & Webhooks
- [ ] WebSocket connection management
- [ ] Real-time document listeners
- [ ] GROQ-powered webhook processing
- [ ] Document change notifications
- [ ] Event deduplication system

#### Week 4: Schema Management
- [ ] Dynamic schema synchronization
- [ ] Field validation system
- [ ] Schema migration handling
- [ ] Content type management UI
- [ ] I18n configuration for MENA

#### Week 5: Query Engine & Caching
- [ ] GROQ query builder
- [ ] Query result caching layer
- [ ] Cache invalidation logic
- [ ] Query performance monitoring
- [ ] GraphQL endpoint (if needed)

### Phase 3: Enterprise Features (2 weeks)

#### Week 6: Content Workflows
- [ ] Approval workflow system
- [ ] Multi-stage publishing
- [ ] Role-based content access
- [ ] Notification system
- [ ] Scheduled publishing

#### Week 7: Live Preview & Performance
- [ ] Preview URL management
- [ ] Live preview synchronization
- [ ] CDN integration
- [ ] Performance optimization
- [ ] Arabic/RTL content support

### Phase 4: Polish & Production (1 week)

#### Week 8: Production Readiness
- [ ] Comprehensive testing suite
- [ ] Error handling & recovery
- [ ] Monitoring & alerting
- [ ] Documentation & examples
- [ ] Performance tuning

## MENA-Specific Features

### Arabic & RTL Support
- **Language Strategy**: Support both document-per-locale and field-level i18n approaches via configuration
- **Schema Configuration**: Dedicated `sanity_locales` table with regional locale support (ar, ar-SA, en, etc.)
- **Content Direction**: RTL layout detection and handling
- **Language Switching**: Seamless Arabic/English content management
- **Cultural Localization**: Date formats, number systems, cultural context
- **Arabic Slugs**: Native Arabic slug support with optional transliteration

### Regional Optimizations  
- **CDN Configuration**: Middle East edge locations
- **Data Residency**: Regional data storage compliance
- **Performance**: Optimized for MENA internet infrastructure
- **Preview Fidelity**: Arabic font stacks (Cairo, Tajawal), Eastern Arabic numerals, proper RTL rendering in previews

## Integration Patterns

### Following Vercel Pattern
- **Dedicated Tables**: Sanity-specific schema (not generic integration tables)
- **Type Safety**: Custom enums for Sanity-specific values
- **Performance**: Optimized indexes for CMS query patterns
- **Partitioning**: Time-based partitioning for webhook events
- **RLS**: Row-level security for multi-tenant isolation

### Connection to Unified Platform
```sql
-- Bridge to unified integration platform
ALTER TABLE sanity_connections 
ADD COLUMN integration_connection_id UUID 
REFERENCES integration_connections(id);
```

**Benefits**:
- ✅ Leverage unified platform for basic monitoring, health checks
- ✅ Consistent auth patterns where applicable  
- ✅ Unified metrics and logging
- ✅ Maintain full CMS feature set
- ✅ **Platform Integration**: Emit normalized health metrics (latency, errors, circuit breaker status) to unified metrics stream for dashboard visibility

## API Design - IMPLEMENTED ✅

### REST Endpoints
```typescript
// ✅ Connection Management
POST   /api/integrations/sanity/connect                              // Create new connection
GET    /api/integrations/sanity/connections                          // List connections
GET    /api/integrations/sanity/connections/:connectionId            // Get connection details  
PUT    /api/integrations/sanity/connections/:connectionId            // Update connection
DELETE /api/integrations/sanity/connections/:connectionId            // Delete connection
POST   /api/integrations/sanity/test-connection                      // Test credentials
POST   /api/integrations/sanity/connections/:connectionId/health-check // Health check

// ✅ Schema Management
POST   /api/integrations/sanity/connections/:connectionId/sync-schema // Sync schema from Studio

// ✅ Webhook System
POST   /api/integrations/sanity/webhook/:connectionId                 // Receive webhooks
GET    /api/integrations/sanity/connections/:connectionId/webhooks    // List webhook events
POST   /api/integrations/sanity/webhooks/:eventId/retry               // Retry failed webhook

// ✅ Preview Management
POST   /api/integrations/sanity/connections/:connectionId/preview     // Create preview
GET    /api/integrations/sanity/preview/:previewId/validate           // Validate preview secret
GET    /api/integrations/sanity/preview/:previewId/content            // Get preview content
GET    /api/integrations/sanity/connections/:connectionId/previews    // List previews  
DELETE /api/integrations/sanity/preview/:previewId                    // Invalidate preview

// ✅ Utility Endpoints
GET    /api/integrations/sanity/cache-stats                           // Get cache statistics
POST   /api/integrations/sanity/clear-cache                           // Clear client cache
```

### 🔐 Security Features
- **HMAC Signature Validation**: All API endpoints except webhooks (which use Sanity signatures)
- **Token Encryption**: AES-GCM with separate IV and auth_tag columns  
- **Breakglass Recovery**: Always-on plaintext token storage for emergency access (24h TTL, 10 max access, audit logging)
- **Preview Security**: SHA-256 hashed secrets with timing-safe comparison
- **Row-Level Security**: Database policies for user isolation
- **Circuit Breakers**: Automatic failure detection and recovery

### 📊 Monitoring & Observability
- **Comprehensive Logging**: All operations logged with structured data
- **Performance Metrics**: Query execution times, cache hit rates, sync performance
- **Error Tracking**: Circuit breaker states, webhook failures, connection health
- **Cache Statistics**: Hit rates, popular queries, cache size metrics

### WebSocket Events
```typescript
// Real-time events
type SanityRealtimeEvent = 
  | { type: 'document.mutation'; document: SanityDocument; mutation: Mutation }
  | { type: 'document.published'; document: SanityDocument }
  | { type: 'schema.updated'; schema: SchemaType[] }
  | { type: 'connection.status'; status: 'connected' | 'disconnected' | 'error' };
```

## Security Considerations

### Token Management
- **Encryption**: AES-GCM encryption with separate IV and auth_tag columns (following Vercel pattern)
- **Token Types**: Support for personal, robot, and JWT tokens with appropriate rotation policies
- **Rotation**: Automatic token refresh handling
- **Scoping**: Minimal required permissions per connection
- **Audit**: Token usage logging and monitoring

### Webhook Security
- **Signature Validation**: Timing-safe comparison to prevent timing attacks
```typescript
import crypto from 'crypto';

export function verifySanitySignature(rawBody: Buffer, secret: string, header?: string) {
  if (!header) return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
    'utf8'
  );
  const actual = Buffer.from(header, 'utf8');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
```
- **Payload Storage**: Store payload hash + minimal headers, full encrypted payloads in R2/S3 with TTL
- **Deduplication**: Separate non-partitioned table for reliable event deduplication

### Data Protection
- **RLS**: Row-level security on all tables with service account policies for background workers
- **Webhook Bodies**: Store encrypted in R2/S3 with TTL, never in database
- **PII Handling**: Proper handling of user content
- **Access Logging**: Comprehensive audit trails with query plan visibility (normalized GROQ + document ID counts)

## Performance Optimizations

### Query Performance
- **GROQ Caching**: Intelligent query result caching
- **CDN Integration**: Sanity CDN for published content
- **Incremental Sync**: Only sync changed documents
- **Connection Pooling**: Efficient Sanity API connections

### Database Performance
- **Partitioning**: Time-based partitioning for webhook events with pre-created monthly partitions
- **Indexes**: Essential indexes for hot query paths (connection + type, modified date, canonical document lookups)
- **Archival**: Automatic cleanup of webhook events older than 90 days
- **Connection Limits**: Circuit breaker state tracking with fast scan indexes
- **Cache Dependencies**: Join table for precise query cache invalidation instead of arrays

### Operational Reliability
- **Replay Cursors**: Track `last_webhook_event_id` per connection for reconnection recovery
- **Partition Management**: Daily job for partition creation and cleanup
```sql
-- Automated partition management
DELETE FROM sanity_webhook_events 
WHERE created_at < NOW() - INTERVAL '90 days';
```
- **Live Listener Fallback**: Automatic rescan on WebSocket drops using last sync timestamps
- **Preview Security**: Store SHA-256 hashes of preview secrets, not plaintext. Generate secrets, hash with `crypto.createHash('sha256').update(secret).digest('hex')`, then compare with `crypto.timingSafeEqual()`. Support TTL expiry and single-use options

## Monitoring & Observability

### Metrics
- Document sync performance
- Query execution times
- Webhook processing latency
- Real-time connection health
- Cache hit rates

### Alerts
- Connection failures
- Webhook processing delays
- Schema sync issues
- Performance degradation
- Token expiration warnings

## Testing Strategy

### Unit Tests
- Token management and encryption
- Document synchronization logic
- GROQ query parsing and execution
- Webhook payload processing
- Schema validation

### Integration Tests
- End-to-end document workflows
- Real-time subscription handling
- Preview URL generation
- Multi-language content handling
- Error recovery scenarios

### Load Testing
- Concurrent document updates
- High-volume webhook processing
- Real-time subscription scaling
- Query cache performance
- Database performance under load

## Success Metrics

### Technical KPIs
- **Document Sync Latency**: < 500ms average
- **Real-time Event Delivery**: < 100ms
- **Query Cache Hit Rate**: > 80%
- **Webhook Processing**: < 1s average
- **System Uptime**: 99.9%

### User Experience KPIs
- **Content Publishing Time**: < 5s end-to-end
- **Live Preview Load Time**: < 2s
- **Collaborative Editing Latency**: < 200ms
- **Search Response Time**: < 300ms
- **Mobile Performance**: Optimized for MENA networks

## Risk Mitigation

### Technical Risks
- **Sanity API Changes**: Version pinning and migration strategies
- **Rate Limiting**: Circuit breakers and intelligent backoff
- **Real-time Connection Drops**: Automatic reconnection with state recovery
- **Data Consistency**: Transaction-based updates with rollback
- **Performance Degradation**: Query optimization and caching strategies

### Business Risks
- **Vendor Lock-in**: Abstract core CMS operations for portability
- **Cost Scaling**: Monitor and optimize Sanity API usage
- **Compliance**: Ensure MENA data residency requirements
- **User Adoption**: Comprehensive documentation and examples
- **Competitive Response**: Maintain feature differentiation

## Conclusion

This first-class Sanity CMS integration provides a significant competitive advantage in the MENA market by offering:

1. **Complete Feature Coverage**: 100% of Sanity's capabilities
2. **Superior Performance**: Optimized for CMS-specific operations
3. **MENA Optimization**: Arabic support, RTL layouts, regional performance
4. **Enterprise Readiness**: Workflows, approval processes, collaboration tools
5. **Developer Experience**: Intuitive APIs, real-time updates, comprehensive docs

**Investment**: 6-8 weeks development time  
**ROI**: Superior CMS experience as competitive differentiator in MENA market  
**Maintenance**: Moderate (CMS-specific but well-contained)

This approach positions SheenApps as the premier choice for content-heavy applications in the Middle East market.