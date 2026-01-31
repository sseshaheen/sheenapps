-- Migration: Unified Integration Platform Foundation (MENA-First)
-- Description: Creates the complete schema for the unified integration platform with MENA-first approach
-- Author: Integration Platform Team
-- Date: 2025-09-08
-- Version: 3.0 (Production-Ready with Expert Review)
--
-- =====================================================
-- KEY IMPROVEMENTS IN THIS VERSION:
-- =====================================================
-- 1. Fixed FK references: projects(id) not projects(project_id)
-- 2. Event deduplication scoped to connection_id (prevents multi-account collisions)
-- 3. Added hash-based uniqueness for events without external event_id
-- 4. Environment and health_state as proper enums
-- 5. GIN indexes on JSONB/arrays for fast MENA provider lookups
-- 6. Comprehensive indexing strategy for scale
-- 7. Unique constraints on aliases and webhook endpoints
--
-- =====================================================
-- SECURITY CONSIDERATIONS:
-- =====================================================
-- 1. Webhook bodies stored in R2/S3 (raw_body_url), not in database
-- 2. All access to raw_body_url must be logged in webhook_access_logs
-- 3. Consider enabling RLS on tenant tables (integration_connections, events, logs)
-- 4. API response bodies should be sampled (1%) or only stored on errors
-- 5. Implement TTL: 72h for webhook bodies, 7-14d for API logs, 30-60d for events
--
-- =====================================================
-- FUTURE CONSIDERATIONS:
-- =====================================================
-- 1. Time-partition integration_events and api_logs by month for scale
-- 2. Consider replacing provider enum with FK to providers table (major refactor)
-- 3. Add data retention policies per tenant/compliance requirements
-- 4. Implement provider manifest system for dynamic configuration

BEGIN;

-- =====================================================
-- 1. CORE INTEGRATION TYPES AND ENUMS (MENA-First Ordering)
-- =====================================================

-- Drop existing types if they exist (for idempotency)
DROP TYPE IF EXISTS integration_provider_type CASCADE;
DROP TYPE IF EXISTS integration_category CASCADE;
DROP TYPE IF EXISTS integration_auth_method CASCADE;
DROP TYPE IF EXISTS integration_connection_status CASCADE;
DROP TYPE IF EXISTS integration_event_status CASCADE;
DROP TYPE IF EXISTS integration_environment CASCADE;
DROP TYPE IF EXISTS integration_health_state CASCADE;

-- Integration provider types (MENA-first ordering)
CREATE TYPE integration_provider_type AS ENUM (
    -- MENA Payment Providers (Priority)
    'tap_payments',
    'paymob',
    'tabby',
    'tamara',
    'moyasar',
    'paytabs',

    -- MENA Communication
    'unifonic',
    'infobip',

    -- MENA Logistics
    'aramex',
    'smsa',
    'fetchr',

    -- MENA Cloud
    'aws_me',
    'azure_me',

    -- Existing Core
    'github',
    'supabase',
    'cloudflare',
    'vercel',

    -- International Payments
    'stripe',
    'paypal',
    'square',
    'paddle',

    -- Communication
    'resend',
    'twilio',
    'sendgrid',
    'slack',
    'discord',

    -- Analytics & Monitoring
    'posthog',
    'sentry',
    'google_analytics',
    'mixpanel',
    'datadog',
    'segment',

    -- Auth & Identity
    'clerk',
    'auth0',

    -- Storage & Media
    'cloudinary',
    'aws_s3',

    -- Development
    'linear',
    'gitlab',
    'bitbucket',
    'jira',

    -- Databases
    'mongodb_atlas',
    'firebase',
    'planetscale',
    'neon',

    -- CRM & Marketing
    'hubspot',
    'salesforce',
    'mailchimp',
    'intercom',
    'customerio'
);

-- Integration categories (payment first for MENA focus)
CREATE TYPE integration_category AS ENUM (
    'payment',
    'communication',
    'logistics',
    'deploy',
    'auth',
    'analytics',
    'development',
    'database',
    'storage',
    'monitoring',
    'marketing',
    'crm'
);

-- Authentication methods
CREATE TYPE integration_auth_method AS ENUM (
    'oauth2',
    'oauth2_pkce',
    'api_key',
    'webhook_secret',
    'jwt',
    'basic_auth',
    'custom'
);

-- Connection status
CREATE TYPE integration_connection_status AS ENUM (
    'pending',
    'connected',
    'failed',
    'expired',
    'refreshing',
    'disconnected',
    'suspended'
);

-- Event processing status
CREATE TYPE integration_event_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'retrying',
    'dead_letter'
);

-- Environment type for better data integrity
CREATE TYPE integration_environment AS ENUM (
    'dev',
    'staging',
    'prod'
);

-- Health state for consistent status tracking
CREATE TYPE integration_health_state AS ENUM (
    'unknown',
    'healthy',
    'degraded',
    'unhealthy'
);

-- =====================================================
-- 2. PROVIDER REGISTRY TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider integration_provider_type UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category integration_category NOT NULL,
    auth_methods integration_auth_method[] NOT NULL,
    capabilities JSONB DEFAULT '{}', -- Including payment_capabilities array for payment providers
    webhook_support BOOLEAN DEFAULT false,
    realtime_support BOOLEAN DEFAULT false,
    rate_limits JSONB DEFAULT '{}',
    required_scopes TEXT[],
    optional_scopes TEXT[],

    -- MENA-specific metadata
    is_mena_provider BOOLEAN DEFAULT false,
    supported_countries TEXT[], -- ISO 3166-1 alpha-2 codes
    supported_currencies TEXT[], -- ISO 4217 currency codes
    data_residency_regions TEXT[], -- Cloud region identifiers
    primary_locale VARCHAR(10) DEFAULT 'en', -- 'ar' for MENA providers

    documentation_url TEXT,
    icon_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for active providers lookup
CREATE INDEX IF NOT EXISTS idx_integration_providers_active
ON integration_providers(is_active, category)
WHERE is_active = true;

-- Create index for MENA providers
CREATE INDEX IF NOT EXISTS idx_integration_providers_mena
ON integration_providers(is_mena_provider, category)
WHERE is_mena_provider = true;

-- GIN indexes for fast lookups on JSONB and arrays (critical for MENA provider selection)
CREATE INDEX IF NOT EXISTS idx_providers_capabilities_gin
ON integration_providers USING GIN (capabilities);

CREATE INDEX IF NOT EXISTS idx_providers_countries_gin
ON integration_providers USING GIN (supported_countries);

CREATE INDEX IF NOT EXISTS idx_providers_currencies_gin
ON integration_providers USING GIN (supported_currencies);

-- =====================================================
-- 3. INTEGRATION CONNECTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, -- Fixed: projects.id not project_id
    provider integration_provider_type NOT NULL,
    status integration_connection_status NOT NULL DEFAULT 'pending',
    auth_method integration_auth_method NOT NULL,

    -- Encrypted credentials storage
    credentials JSONB NOT NULL DEFAULT '{}', -- Will be encrypted at application layer

    -- OAuth specific fields
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,

    -- API Key specific fields
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,

    -- Webhook specific fields
    webhook_secret_encrypted TEXT,
    webhook_url TEXT,

    -- Environment separation (dev/staging/prod)
    environment integration_environment NOT NULL DEFAULT 'prod',
    alias TEXT, -- User-friendly name like "Marketing Slack" or "EU Stripe"

    -- Connection metadata
    external_account_id VARCHAR(255), -- e.g., Slack workspace ID, Stripe account ID
    external_account_name TEXT,
    metadata JSONB DEFAULT '{}',

    -- Health tracking
    last_health_check TIMESTAMPTZ,
    health_state integration_health_state DEFAULT 'unknown',
    health_message TEXT,

    -- Timestamps
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

    -- NO UNIQUE constraint - allow multiple connections per provider
    -- Users can have multiple Stripe accounts, Slack workspaces, etc.
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_connections_project
ON integration_connections(project_id, status);

CREATE INDEX IF NOT EXISTS idx_integration_connections_provider_env
ON integration_connections(project_id, provider, environment);

CREATE INDEX IF NOT EXISTS idx_integration_connections_provider
ON integration_connections(provider, status)
WHERE status = 'connected';

CREATE INDEX IF NOT EXISTS idx_integration_connections_expiry
ON integration_connections(expires_at)
WHERE expires_at IS NOT NULL AND status = 'connected';

CREATE INDEX IF NOT EXISTS idx_integration_connections_health
ON integration_connections(last_health_check, provider)
WHERE status = 'connected';

-- External account lookups (important for multi-account scenarios)
CREATE INDEX IF NOT EXISTS idx_connections_provider_extacct
ON integration_connections(provider, external_account_id)
WHERE external_account_id IS NOT NULL;

-- Unique alias per project/provider/environment (prevent duplicate friendly names)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_connections_alias
ON integration_connections(project_id, provider, environment, COALESCE(alias,''))
WHERE status IN ('pending', 'connected', 'refreshing');

-- =====================================================
-- 4. INTEGRATION EVENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
    provider integration_provider_type NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255), -- External event ID for deduplication

    -- Event data
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',

    -- Raw body storage pointer (not in DB for security/performance)
    raw_body_url TEXT, -- Signed URL to R2/S3
    event_hash VARCHAR(64), -- SHA256 of raw body
    signature TEXT, -- Provider signature

    -- Processing
    status integration_event_status NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    processing_duration_ms INTEGER,

    -- Error handling
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    -- Metadata
    source_ip INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate events - scoped to connection, not provider
    -- This prevents collisions when multiple accounts use the same provider
    UNIQUE(connection_id, event_id)
);

-- Indexes for event processing
CREATE INDEX IF NOT EXISTS idx_integration_events_status
ON integration_events(status, created_at)
WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_integration_events_connection
ON integration_events(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_events_provider_type
ON integration_events(provider, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_events_retry
ON integration_events(next_retry_at)
WHERE status = 'retrying' AND next_retry_at IS NOT NULL;

-- Optimized retry processing index
CREATE INDEX IF NOT EXISTS idx_events_status_nextretry
ON integration_events(status, next_retry_at)
WHERE status = 'retrying' AND next_retry_at IS NOT NULL;

-- Event creation time for purging/archival
CREATE INDEX IF NOT EXISTS idx_events_created
ON integration_events(created_at);

-- Fallback uniqueness for events without external event_id (using hash)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_conn_hash_nullid
ON integration_events(connection_id, event_hash)
WHERE event_id IS NULL;

-- =====================================================
-- 5. WEBHOOK RAW BODY ACCESS AUDIT
-- =====================================================

CREATE TABLE IF NOT EXISTS webhook_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES integration_events(id) ON DELETE CASCADE,
    accessed_by UUID, -- User ID who accessed
    access_reason TEXT NOT NULL,
    ip_address INET,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_webhook_access_logs_event
ON webhook_access_logs(event_id, accessed_at DESC);

-- =====================================================
-- 6. WEBHOOK CONFIGURATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_webhook_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    webhook_id VARCHAR(255), -- External webhook ID
    endpoint_url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT true,

    -- Security
    signing_secret TEXT, -- Encrypted
    verification_method VARCHAR(50), -- hmac-sha256, rsa, etc.

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(connection_id, webhook_id)
);

-- Index for active webhooks
CREATE INDEX IF NOT EXISTS idx_webhook_configs_active
ON integration_webhook_configs(connection_id)
WHERE is_active = true;

-- Unique endpoint when no webhook_id from provider
CREATE UNIQUE INDEX IF NOT EXISTS uniq_webhook_endpoint
ON integration_webhook_configs(connection_id, endpoint_url)
WHERE webhook_id IS NULL;

-- =====================================================
-- 7. OAUTH STATE MANAGEMENT TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_oauth_states (
    state VARCHAR(255) PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, -- Fixed: projects.id
    provider integration_provider_type NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_verifier TEXT, -- For PKCE
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry
ON integration_oauth_states(expires_at);

-- Lookup pattern for OAuth states
CREATE INDEX IF NOT EXISTS idx_oauth_states_lookup
ON integration_oauth_states(project_id, provider);

-- =====================================================
-- 8. API CALL LOGS TABLE (For debugging and analytics)
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
    provider integration_provider_type NOT NULL,

    -- Request details
    method VARCHAR(10) NOT NULL,
    endpoint TEXT NOT NULL,
    request_headers JSONB,
    request_body JSONB,

    -- Response details
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    response_time_ms INTEGER,

    -- Error tracking
    error_message TEXT,
    is_error BOOLEAN DEFAULT false,

    -- Rate limiting
    rate_limit_remaining INTEGER,
    rate_limit_reset_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for log analysis
CREATE INDEX IF NOT EXISTS idx_api_logs_connection
ON integration_api_logs(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_logs_errors
ON integration_api_logs(provider, is_error, created_at DESC)
WHERE is_error = true;

-- Partial index for recent logs only (last 7 days)
CREATE INDEX IF NOT EXISTS idx_api_logs_recent
ON integration_api_logs(provider, created_at DESC)
WHERE created_at > NOW() - INTERVAL '7 days';

-- =====================================================
-- 9. INTEGRATION METRICS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_metrics_hourly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider integration_provider_type NOT NULL,
    hour TIMESTAMPTZ NOT NULL,

    -- Connection metrics
    total_connections INTEGER DEFAULT 0,
    new_connections INTEGER DEFAULT 0,
    failed_connections INTEGER DEFAULT 0,

    -- API metrics
    api_calls_total INTEGER DEFAULT 0,
    api_calls_success INTEGER DEFAULT 0,
    api_calls_failed INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER,

    -- Webhook metrics
    webhooks_received INTEGER DEFAULT 0,
    webhooks_processed INTEGER DEFAULT 0,
    webhooks_failed INTEGER DEFAULT 0,

    -- Rate limiting
    rate_limit_hits INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(provider, hour)
);

-- Index for metric queries
CREATE INDEX IF NOT EXISTS idx_metrics_hourly_provider_time
ON integration_metrics_hourly(provider, hour DESC);

-- =====================================================
-- 10. SEED INITIAL PROVIDER DATA (MENA-First)
-- =====================================================

INSERT INTO integration_providers (
    provider, name, category, auth_methods, capabilities,
    webhook_support, realtime_support, is_mena_provider,
    supported_countries, supported_currencies, primary_locale,
    documentation_url
) VALUES

-- =====================================================
-- MENA PAYMENT PROVIDERS (Priority)
-- =====================================================
('tap_payments', 'Tap Payments', 'payment', ARRAY['api_key']::integration_auth_method[],
 '{"payment_capabilities": ["one_time", "recurring", "installments", "wallets"], "card_payments": true, "apple_pay": true, "google_pay": true, "mada": true, "knet": true, "benefit": true, "omannet": true, "invoicing": true}'::jsonb,
 true, false, true,
 ARRAY['SA', 'AE', 'KW', 'BH', 'QA', 'OM', 'EG', 'JO', 'LB'],
 ARRAY['SAR', 'AED', 'KWD', 'BHD', 'QAR', 'OMR', 'EGP', 'JOD', 'LBP', 'USD', 'EUR', 'GBP'],
 'ar',
 'https://developers.tap.company/docs'),

('paymob', 'Paymob', 'payment', ARRAY['api_key']::integration_auth_method[],
 '{"payment_capabilities": ["one_time", "recurring", "installments", "cash_collection"], "card_payments": true, "mobile_wallets": true, "valu": true, "fawry": true, "aman": true, "masary": true}'::jsonb,
 true, false, true,
 ARRAY['EG', 'SA', 'AE', 'PK', 'OM', 'PS'],
 ARRAY['EGP', 'SAR', 'AED', 'PKR', 'OMR', 'USD'],
 'ar',
 'https://docs.paymob.com'),

('tabby', 'Tabby', 'payment', ARRAY['api_key']::integration_auth_method[],
 '{"payment_capabilities": ["installments", "bnpl"], "split_payments": true, "merchant_portal": true}'::jsonb,
 true, false, true,
 ARRAY['SA', 'AE', 'KW', 'BH', 'QA', 'EG'],
 ARRAY['SAR', 'AED', 'KWD', 'BHD', 'QAR', 'EGP'],
 'ar',
 'https://docs.tabby.ai'),

('tamara', 'Tamara', 'payment', ARRAY['api_key']::integration_auth_method[],
 '{"payment_capabilities": ["installments", "bnpl"], "split_in_3": true, "split_in_4": true, "pay_later": true}'::jsonb,
 true, false, true,
 ARRAY['SA', 'AE', 'KW'],
 ARRAY['SAR', 'AED', 'KWD'],
 'ar',
 'https://docs.tamara.co'),

('moyasar', 'Moyasar', 'payment', ARRAY['api_key']::integration_auth_method[],
 '{"payment_capabilities": ["one_time", "recurring", "tokenization"], "mada": true, "visa": true, "mastercard": true, "apple_pay": true, "stc_pay": true}'::jsonb,
 true, false, true,
 ARRAY['SA'],
 ARRAY['SAR'],
 'ar',
 'https://docs.moyasar.com'),

('paytabs', 'PayTabs', 'payment', ARRAY['api_key']::integration_auth_method[],
 '{"payment_capabilities": ["one_time", "recurring", "tokenization", "marketplace"], "card_payments": true, "alternative_payments": true, "invoicing": true}'::jsonb,
 true, false, true,
 ARRAY['SA', 'AE', 'EG', 'JO', 'BH', 'KW', 'OM', 'QA'],
 ARRAY['SAR', 'AED', 'EGP', 'JOD', 'BHD', 'KWD', 'OMR', 'QAR', 'USD', 'EUR', 'GBP'],
 'ar',
 'https://site.paytabs.com/docs'),

-- =====================================================
-- MENA COMMUNICATION PROVIDERS
-- =====================================================
('unifonic', 'Unifonic', 'communication', ARRAY['api_key']::integration_auth_method[],
 '{"sms": true, "voice": true, "whatsapp_business": true, "2fa": true, "number_lookup": true, "templates": true}'::jsonb,
 true, false, true,
 ARRAY['SA', 'AE', 'EG', 'JO', 'KW', 'BH', 'QA', 'OM'],
 NULL,
 'ar',
 'https://docs.unifonic.com'),

('infobip', 'Infobip', 'communication', ARRAY['api_key']::integration_auth_method[],
 '{"sms": true, "whatsapp": true, "viber": true, "voice": true, "email": true, "push": true, "rcs": true}'::jsonb,
 true, true, true,
 ARRAY['SA', 'AE', 'EG', 'KW', 'BH', 'QA', 'OM', 'JO', 'LB', 'MA', 'TN', 'DZ'],
 NULL,
 'ar',
 'https://www.infobip.com/docs'),

-- =====================================================
-- MENA LOGISTICS PROVIDERS
-- =====================================================
('aramex', 'Aramex', 'logistics', ARRAY['api_key']::integration_auth_method[],
 '{"shipping": true, "tracking": true, "pickup": true, "cod": true, "label_printing": true, "rate_calculation": true}'::jsonb,
 true, false, true,
 ARRAY['SA', 'AE', 'EG', 'KW', 'BH', 'QA', 'OM', 'JO', 'LB'],
 NULL,
 'ar',
 'https://www.aramex.com/developers'),

('smsa', 'SMSA Express', 'logistics', ARRAY['api_key']::integration_auth_method[],
 '{"shipping": true, "tracking": true, "cod": true, "reverse_pickup": true, "same_day": true}'::jsonb,
 true, false, true,
 ARRAY['SA'],
 NULL,
 'ar',
 'https://smsaexpress.com/api'),

('fetchr', 'Fetchr', 'logistics', ARRAY['api_key']::integration_auth_method[],
 '{"shipping": true, "tracking": true, "cod": true, "scheduled_delivery": true}'::jsonb,
 true, false, true,
 ARRAY['AE', 'SA', 'EG', 'JO', 'BH'],
 NULL,
 'ar',
 'https://fetchr.com/api'),

-- =====================================================
-- MENA CLOUD PROVIDERS
-- =====================================================
('aws_me', 'AWS Middle East', 'storage', ARRAY['api_key']::integration_auth_method[],
 '{"compute": true, "storage": true, "database": true, "data_residency": true, "region": "me-south-1"}'::jsonb,
 false, false, true,
 ARRAY['BH', 'SA', 'AE', 'KW', 'QA', 'OM'],
 NULL,
 'ar',
 'https://aws.amazon.com/me-south-1/'),

('azure_me', 'Azure Middle East', 'storage', ARRAY['api_key']::integration_auth_method[],
 '{"compute": true, "storage": true, "database": true, "data_residency": true, "regions": ["uae-north", "uae-central"]}'::jsonb,
 false, false, true,
 ARRAY['AE', 'SA', 'KW', 'QA', 'BH', 'OM'],
 NULL,
 'ar',
 'https://azure.microsoft.com/regions/middle-east/'),

-- =====================================================
-- EXISTING CORE PROVIDERS (Updated with complete metadata)
-- =====================================================
('github', 'GitHub', 'development', ARRAY['oauth2']::integration_auth_method[],
 '{"version_control": true, "ci_cd": true, "issue_tracking": true, "two_way_sync": true}'::jsonb,
 true, true, false,
 NULL, NULL, 'en',
 'https://docs.github.com'),

('supabase', 'Supabase', 'database', ARRAY['oauth2_pkce']::integration_auth_method[],
 '{"database": true, "auth": true, "storage": true, "realtime": true}'::jsonb,
 true, true, false,
 NULL, NULL, 'en',
 'https://supabase.com/docs'),

('stripe', 'Stripe', 'payment', ARRAY['api_key']::integration_auth_method[],
 '{"payment_capabilities": ["one_time", "recurring", "marketplace", "connect"], "card_payments": true, "subscriptions": true, "invoicing": true, "webhooks": true}'::jsonb,
 true, false, false,
 ARRAY['US', 'GB', 'EU', 'CA', 'AU', 'JP', 'SG', 'HK', 'NZ', 'MY', 'AE'],
 ARRAY['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD', 'HKD', 'NZD', 'MYR', 'AED'],
 'en',
 'https://stripe.com/docs'),

('twilio', 'Twilio', 'communication', ARRAY['api_key']::integration_auth_method[],
 '{"sms": true, "voice": true, "video": true, "whatsapp": true, "verify": true}'::jsonb,
 true, false, false,
 NULL, NULL, 'en',
 'https://www.twilio.com/docs'),

('resend', 'Resend', 'communication', ARRAY['api_key']::integration_auth_method[],
 '{"email": true, "templates": true, "analytics": true, "react_email": true}'::jsonb,
 true, false, false,
 NULL, NULL, 'en',
 'https://resend.com/docs'),

('posthog', 'PostHog', 'analytics', ARRAY['api_key']::integration_auth_method[],
 '{"product_analytics": true, "session_recording": true, "feature_flags": true, "a_b_testing": true}'::jsonb,
 true, true, false,
 NULL, NULL, 'en',
 'https://posthog.com/docs'),

('clerk', 'Clerk', 'auth', ARRAY['api_key']::integration_auth_method[],
 '{"authentication": true, "user_management": true, "organizations": true, "social_login": true}'::jsonb,
 true, false, false,
 NULL, NULL, 'en',
 'https://clerk.com/docs'),

('auth0', 'Auth0', 'auth', ARRAY['oauth2', 'api_key']::integration_auth_method[],
 '{"authentication": true, "user_management": true, "social_login": true, "mfa": true, "sso": true}'::jsonb,
 true, false, false,
 NULL, NULL, 'en',
 'https://auth0.com/docs'),

('vercel', 'Vercel', 'deploy', ARRAY['api_key']::integration_auth_method[],
 '{"deployment": true, "preview_urls": true, "edge_functions": true, "analytics": true}'::jsonb,
 true, false, false,
 NULL, NULL, 'en',
 'https://vercel.com/docs'),

('cloudflare', 'Cloudflare', 'deploy', ARRAY['api_key']::integration_auth_method[],
 '{"cdn": true, "workers": true, "r2_storage": true, "pages": true, "ddos_protection": true}'::jsonb,
 true, false, false,
 NULL, NULL, 'en',
 'https://developers.cloudflare.com'),

('sentry', 'Sentry', 'monitoring', ARRAY['api_key']::integration_auth_method[],
 '{"error_tracking": true, "performance": true, "release_tracking": true}'::jsonb,
 true, false, false,
 NULL, NULL, 'en',
 'https://docs.sentry.io'),

('linear', 'Linear', 'development', ARRAY['oauth2', 'api_key']::integration_auth_method[],
 '{"issue_tracking": true, "project_management": true, "roadmaps": true, "automation": true}'::jsonb,
 true, true, false,
 NULL, NULL, 'en',
 'https://developers.linear.app'),

('planetscale', 'PlanetScale', 'database', ARRAY['api_key']::integration_auth_method[],
 '{"mysql": true, "branching": true, "scaling": true, "insights": true}'::jsonb,
 false, false, false,
 NULL, NULL, 'en',
 'https://docs.planetscale.com'),

('neon', 'Neon', 'database', ARRAY['api_key']::integration_auth_method[],
 '{"postgres": true, "branching": true, "autoscaling": true, "serverless": true}'::jsonb,
 false, false, false,
 NULL, NULL, 'en',
 'https://neon.tech/docs')

ON CONFLICT (provider) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    auth_methods = EXCLUDED.auth_methods,
    capabilities = EXCLUDED.capabilities,
    webhook_support = EXCLUDED.webhook_support,
    realtime_support = EXCLUDED.realtime_support,
    is_mena_provider = EXCLUDED.is_mena_provider,
    supported_countries = EXCLUDED.supported_countries,
    supported_currencies = EXCLUDED.supported_currencies,
    primary_locale = EXCLUDED.primary_locale,
    documentation_url = EXCLUDED.documentation_url,
    updated_at = NOW();

-- =====================================================
-- 11. HELPER FUNCTIONS
-- =====================================================

-- Function to clean up expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
    DELETE FROM integration_oauth_states
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update integration connection health
CREATE OR REPLACE FUNCTION update_integration_health(
    p_connection_id UUID,
    p_is_healthy BOOLEAN,
    p_message TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE integration_connections
    SET
        last_health_check = NOW(),
        health_state = CASE
            WHEN p_is_healthy THEN 'healthy'::integration_health_state
            ELSE 'unhealthy'::integration_health_state
        END,
        health_message = p_message,
        updated_at = NOW()
    WHERE id = p_connection_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record integration metrics
CREATE OR REPLACE FUNCTION record_integration_metric(
    p_provider integration_provider_type,
    p_metric_type TEXT,
    p_value INTEGER DEFAULT 1
)
RETURNS void AS $$
DECLARE
    v_hour TIMESTAMPTZ;
BEGIN
    v_hour := date_trunc('hour', NOW());

    INSERT INTO integration_metrics_hourly (provider, hour)
    VALUES (p_provider, v_hour)
    ON CONFLICT (provider, hour) DO NOTHING;

    -- Update the specific metric
    EXECUTE format('
        UPDATE integration_metrics_hourly
        SET %I = COALESCE(%I, 0) + $1
        WHERE provider = $2 AND hour = $3',
        p_metric_type, p_metric_type
    ) USING p_value, p_provider, v_hour;
END;
$$ LANGUAGE plpgsql;

-- Function to get payment providers by capability
CREATE OR REPLACE FUNCTION get_payment_providers_by_capability(
    p_capability TEXT,
    p_country_code TEXT DEFAULT NULL
)
RETURNS TABLE(
    provider integration_provider_type,
    name VARCHAR(100),
    is_mena_provider BOOLEAN,
    supported_countries TEXT[],
    supported_currencies TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.provider,
        p.name,
        p.is_mena_provider,
        p.supported_countries,
        p.supported_currencies
    FROM integration_providers p
    WHERE
        p.category = 'payment'
        AND p.is_active = true
        AND p.capabilities->'payment_capabilities' ? p_capability
        AND (
            p_country_code IS NULL
            OR p.supported_countries IS NULL
            OR p_country_code = ANY(p.supported_countries)
        )
    ORDER BY
        p.is_mena_provider DESC, -- MENA providers first
        p.provider;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 12. TRIGGERS
-- =====================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
DO $$
BEGIN
    -- Drop existing triggers if they exist
    DROP TRIGGER IF EXISTS update_integration_providers_updated_at ON integration_providers;
    DROP TRIGGER IF EXISTS update_integration_connections_updated_at ON integration_connections;
    DROP TRIGGER IF EXISTS update_integration_events_updated_at ON integration_events;
    DROP TRIGGER IF EXISTS update_webhook_configs_updated_at ON integration_webhook_configs;

    -- Create triggers
    CREATE TRIGGER update_integration_providers_updated_at
        BEFORE UPDATE ON integration_providers
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER update_integration_connections_updated_at
        BEFORE UPDATE ON integration_connections
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER update_integration_events_updated_at
        BEFORE UPDATE ON integration_events
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE TRIGGER update_webhook_configs_updated_at
        BEFORE UPDATE ON integration_webhook_configs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
END $$;

-- =====================================================
-- 13. MIGRATION OF EXISTING DATA (If applicable)
-- =====================================================

-- Only run migrations if the source tables exist
DO $$
BEGIN
    -- Migrate existing GitHub integrations if projects table has github columns
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects'
        AND column_name = 'github_repo_owner'
    ) THEN
        INSERT INTO integration_connections (
            project_id,
            provider,
            status,
            auth_method,
            external_account_id,
            external_account_name,
            webhook_secret_encrypted,
            metadata,
            connected_at,
            last_sync_at
        )
        SELECT
            project_id,
            'github'::integration_provider_type,
            CASE
                WHEN github_sync_enabled THEN 'connected'::integration_connection_status
                ELSE 'disconnected'::integration_connection_status
            END,
            'oauth2'::integration_auth_method,
            github_installation_id::TEXT,
            CONCAT(github_repo_owner, '/', github_repo_name),
            github_webhook_secret,
            jsonb_build_object(
                'repo_owner', github_repo_owner,
                'repo_name', github_repo_name,
                'branch', github_branch,
                'sync_mode', github_sync_mode
            ),
            COALESCE(last_github_sync_at, NOW()),
            last_github_sync_at
        FROM projects
        WHERE github_repo_owner IS NOT NULL
        ON CONFLICT DO NOTHING;
    END IF;

    -- Migrate existing Supabase connections if table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'supabase_oauth_connections'
    ) THEN
        INSERT INTO integration_connections (
            project_id,
            provider,
            status,
            auth_method,
            access_token_encrypted,
            refresh_token_encrypted,
            token_expires_at,
            metadata,
            connected_at
        )
        SELECT
            p.project_id,
            'supabase'::integration_provider_type,
            CASE
                WHEN soc.connection_status = 'active' THEN 'connected'::integration_connection_status
                WHEN soc.connection_status = 'expired' THEN 'expired'::integration_connection_status
                ELSE 'disconnected'::integration_connection_status
            END,
            'oauth2_pkce'::integration_auth_method,
            soc.access_token_encrypted,
            soc.refresh_token_encrypted,
            soc.token_expires_at,
            soc.discovery_data,
            soc.created_at
        FROM supabase_oauth_connections soc
        JOIN projects p ON p.user_id = soc.user_id
        WHERE soc.connection_status = 'active'
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- 14. OPTIONAL: ROW LEVEL SECURITY (Uncomment if using RLS)
-- =====================================================
-- Prevents cross-tenant data leakage. Enable if using RLS elsewhere in your system.


-- Enable RLS on tenant-scoped tables
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_access_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for app user (adjust user role as needed)
CREATE POLICY integration_connections_tenant_isolation ON integration_connections
    FOR ALL
    USING (project_id IN (
        SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid
    ));

CREATE POLICY integration_events_tenant_isolation ON integration_events
    FOR ALL
    USING (connection_id IN (
        SELECT id FROM integration_connections
        WHERE project_id IN (
            SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid
        )
    ));

CREATE POLICY integration_api_logs_tenant_isolation ON integration_api_logs
    FOR ALL
    USING (connection_id IN (
        SELECT id FROM integration_connections
        WHERE project_id IN (
            SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid
        )
    ));


-- =====================================================
-- 15. GRANTS (Adjust based on your user roles)
-- =====================================================

-- Grant necessary permissions to application user (uncomment and adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;

COMMIT;

-- =====================================================
-- ROLLBACK SCRIPT (Save separately)
-- =====================================================
/*
BEGIN;

-- Drop RLS policies if created
DROP POLICY IF EXISTS integration_connections_tenant_isolation ON integration_connections;
DROP POLICY IF EXISTS integration_events_tenant_isolation ON integration_events;
DROP POLICY IF EXISTS integration_api_logs_tenant_isolation ON integration_api_logs;

-- Drop triggers
DROP TRIGGER IF EXISTS update_integration_providers_updated_at ON integration_providers;
DROP TRIGGER IF EXISTS update_integration_connections_updated_at ON integration_connections;
DROP TRIGGER IF EXISTS update_integration_events_updated_at ON integration_events;
DROP TRIGGER IF EXISTS update_webhook_configs_updated_at ON integration_webhook_configs;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at();
DROP FUNCTION IF EXISTS cleanup_expired_oauth_states();
DROP FUNCTION IF EXISTS update_integration_health(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS record_integration_metric(integration_provider_type, TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_payment_providers_by_capability(TEXT, TEXT);

-- Drop indexes (including new GIN indexes)
DROP INDEX IF EXISTS idx_providers_capabilities_gin;
DROP INDEX IF EXISTS idx_providers_countries_gin;
DROP INDEX IF EXISTS idx_providers_currencies_gin;
DROP INDEX IF EXISTS idx_connections_provider_extacct;
DROP INDEX IF EXISTS uniq_connections_alias;
DROP INDEX IF EXISTS idx_events_status_nextretry;
DROP INDEX IF EXISTS idx_events_created;
DROP INDEX IF EXISTS uniq_events_conn_hash_nullid;
DROP INDEX IF EXISTS uniq_webhook_endpoint;
DROP INDEX IF EXISTS idx_oauth_states_lookup;

-- Drop tables
DROP TABLE IF EXISTS webhook_access_logs CASCADE;
DROP TABLE IF EXISTS integration_metrics_hourly CASCADE;
DROP TABLE IF EXISTS integration_api_logs CASCADE;
DROP TABLE IF EXISTS integration_oauth_states CASCADE;
DROP TABLE IF EXISTS integration_webhook_configs CASCADE;
DROP TABLE IF EXISTS integration_events CASCADE;
DROP TABLE IF EXISTS integration_connections CASCADE;
DROP TABLE IF EXISTS integration_providers CASCADE;

-- Drop types
DROP TYPE IF EXISTS integration_health_state CASCADE;
DROP TYPE IF EXISTS integration_environment CASCADE;
DROP TYPE IF EXISTS integration_event_status CASCADE;
DROP TYPE IF EXISTS integration_connection_status CASCADE;
DROP TYPE IF EXISTS integration_auth_method CASCADE;
DROP TYPE IF EXISTS integration_category CASCADE;
DROP TYPE IF EXISTS integration_provider_type CASCADE;

COMMIT;
*/
