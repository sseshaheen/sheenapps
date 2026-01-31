
The platform consists of 2 main applications:

A. sheenappsai (Next.js 15 Frontend + Full-Stack)

- Marketing website + AI builder + Admin dashboard
- Location: /Users/sh/Sites/sheenapps/sheenappsai
- Tech: Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Deployment: Vercel

B. sheenapps-claude-worker (Fastify Backend)
- AI code generation, build processing, worker queue management
- Location: /Users/sh/Sites/sheenapps/sheenapps-claude-worker
- Tech: Fastify 5, Node.js 22, TypeScript, PostgreSQL
- Architecture: Stream mode with BullMQ queues

Note: The packages/ structure mentioned in the CLAUDE.md guide doesn't exist. Instead, there's a reference to @sheenapps/templates imported a a dependency in both app package.json files (imported from npm, not a local monorepo package).

---
2. SHEENAPPSAI (Next.js 15 FRONTEND)
Project Structure

src/ ├── app/# Next.js App Router (15)
├── components/# React components (UI, layout, sections)
├── lib/# Utilities, database, actions, helpers
├── hooks/     # Custom React hooks
├── types/     # TypeScript definitions
├── i18n/      # Internationalization├── styles/    # Global CSS
├── stores/    # Zustand state management
└── server/    # Server-only modules
Key Features
Architecture & State Management:
- Next.js 15 App Router (SSR, streaming)
- Server Actions for secure operations
- Zustand for client state (no context subscriptions scattered)
- next-intl for 9 locales: en, ar-eg, ar-sa, ar-ae, ar, fr, fr-ma, es, de
- RTL support with Tailwind CSS

Database & Authentication:
- Supabase (PostgreSQL) with RLS (Row-Level Security)
- Auth: Supabase Auth + In-House Auth Service (Easy Mode) - RLS-First Design: No service role key in production web routes
  - Server actions use authenticated client context  - Admin operations use service role (server-only)  - Database access via repository pattern

AI Builder System: - Claude AI (3.5 Haiku) code generation via worker
- Real-time build events via SSE (Server-Sent Events)
- Streaming preview with iframe sandbox
- Build versioning (distinct from build status)
- Build recommendations system
In-House (Easy Mode) Infrastructure (Phase 1-3):
This is a major recent feature supporting complete SheenApps-managed infrastructure:

1. Mode Enum: infrastructure_mode = 'easy' (SheenApps-managed) or 'pro' (BYOI)
2. Per-Project Isolation: Each Easy Mode project gets:
  - Unique PostgreSQL schema
  - Subdomain: {subdomain}.sheenapps.com
  - Custom domain support (Phase 3)
  - Private database with allowlist validation
3. Auth Service: Built-in email/password + magic link
4. CMS Service: Minimal content types + entries + media
5. Phase 3 Features:
  - Custom domains with verification   - Eject requests (export to self-hosted)
  - Quote management

Integration Status System:
- Unified endpoint: GET /api/integrations/status?projectId={id}
- Real-time status via SSE
- Supports: GitHub, Vercel, Sanity, Supabase- Performance: <500ms with circuit breakers
Billing & Payments:- Stripe integration with webhooks
- Plans: Free, Starter, Growth, Scale- Usage tracking per plan
- Subscription management (Supabase tables: customers, subscriptions, payments)

Analytics & Observability:
- Google Analytics 4
- PostHog event tracking
- Microsoft Clarity (session recordings)
- Grafana Faro (frontend observability)
- OpenTelemetry for tracing
- Sentry error tracking

Performance Optimizations:
- Bundle size limits: Homepage 250KB, Builder 250KB- Web Vitals tracking (RUM data with aggregation)
- Image optimization with remote patterns
- Cache headers: 1-year for static, 1-hour for pages
- Lazy loading components

Mobile & RTL:
- Responsive design (Tailwind v4)
- Touch-optimized UI (44px+ tap targets)
- Proper RTL layout (not just mirroring)
- Safe-area insets for notched devices

Environment Variables

Server-Only (.env.server-only):
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEYOPENAI_API_KEY, ANTHROPIC_API_KEY
WORKER_BASE_URL, WORKER_SHARED_SECRET, CLAUDE_SHARED_SECRET
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_IDsOAUTH_STATE_SECRET, JWT_SECRETADMIN_EMAILS
Client-Safe (.env.client-safe → merged to .env.local):
NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_CLARITY_PROJECT_ID
NEXT_PUBLIC_FARO_URL
NEXT_PUBLIC_ENABLE_* (feature flags) STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_WORKER_BASE_URL

API Authentication Pattern

Worker API Calls:
- Use dual-signature HMAC validation - Helper: createWorkerAuthHeaders(method, path, body)
- Header: x-sheen-locale for i18n
- Never manually create single signatures (causes 403)

Admin API Routes:
- Helper: requireAdmin(permission) enforces auth + permissions
- Example: POST /api/admin/feature-flags
- Never use NEXT_PUBLIC_* for server credentials
- Browser sends httpOnly cookies automatically

---
3. SHEENAPPS-CLAUDE-WORKER (FASTIFY BACKEND)
Project Structure

src/ ├── server.ts# Main entry point (Fastify)
├── routes/  # API endpoints
├── services/# Business logic ├── middleware/     # Authentication, validation
├── lib/     # Utilities
├── types/   # TypeScript definitions└── migrations/     # Database migrations

Key Architecture

Mode: Stream Mode
- ARCH_MODE=stream in production
- Uses BullMQ for job queue management
- Redis for queue persistence - Supports SKIP_QUEUE=true for direct execution

API Structure:
- RESTful endpoints with explicit userId parameters (not request.user)
- GET: userId as query string - POST/PUT/DELETE: userId in request body
- Dual-signature HMAC for security

Key Endpoints:
POST /generate# Main build generationPOST /generate/stream# Streaming build output
GET /builds/:buildId # Get build status
GET /builds/:buildId/events # SSE stream for build events POST /projects/:id/recommend # Get build recommendations
GET /integrations/status    # Multi-integration status
POST /integrations/actions  # Quick actions (deploy, sync)GET /integrations/events    # Real-time integration updates

Database Integration:
- PostgreSQL with Node.js pg client
- Connection pooling via ioredis for Redis
- Supabase support (optional) - RLS bypassed via service role for worker operations

AI Provider Support:
- Claude (Anthropic SDK) - default
- OpenAI (GPT-4o mini)
- Configurable via AI_PROVIDER env var

Build Queue System:- BullMQ job processing
- Timeout control via environment variables - Event emitters for progress tracking
- Retry logic with exponential backoff

File Access & Security:
- workspaceFileAccessService - rate-limited file reads
- workspacePathValidator - directory listing with security- Path traversal protection (segments-based validation)
- Resource limits (base64 size, cumulative size, env var limits)

Observability:
- OpenTelemetry instrumentation for:   - HTTP requests
  - Database queries (PostgreSQL instrumentation)
  - Redis operations
  - Custom spans for AI operations
- Metrics export via OTLP HTTP- Distributed tracing support
Key Services
AI Time Billing:
- Operation types: main_build, metadata_generation, update, plan operations, website_migration
- Budget enforcement per user - Cost tracking in dollars

Persistent Chat System:
- Sequence-based pagination (prevents race conditions)
- Idempotency via client_msg_id UUID - i18n system messages with locale codes
- Presence tracking via Redis TTL
- Real-time SSE with Last-Event-ID resumption

Migration Service (Website migration tool): - Operations: ANALYZE, plan, TRANSFORM, VERIFY, DEPLOY
- Uses website_migration AI time operation type
- Budget validation before each phase
Integration Adapters:
- GitHub actions querying/status
- Vercel deployment triggering- Sanity content sync
- Supabase schema introspection

Environment Variables

Core:NODE_ENV, PORT, APP_VERSION, LOG_LEVEL
ARCH_MODE (stream|monolith|modular|direct)

Authentication & Secrets:
SHARED_SECRET (32-char for HMAC)
JWT_SECRET, OAUTH_STATE_SECRET
Database:
DATABASE_URL (PostgreSQL connection string) NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

Cloudflare (R2 Storage, Pages, Workers):
CF_ACCOUNT_ID, CF_ZONE_ID, CF_PAGES_PROJECT_ID
CF_API_TOKEN_WORKERS, CF_API_TOKEN_R2R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
CF_KV_NAMESPACE_ID, CF_PAGES_PROJECT_NAME
CF_WEBHOOK_SECRET

Redis:
REDIS_HOST, REDIS_PORT (or REDIS_URL)
AI Providers:
AI_PROVIDER (claude-cli|openai)
DEBUG_CLAUDE_MAIN_PROCESS=true
Timeouts (milliseconds):
CLAUDE_INITIAL_TIMEOUT: 1200000 (20 min)
BUILD_COMMAND_TIMEOUT: 600000 (10 min)
NPM_INSTALL_TIMEOUT: 300000 (5 min)

Rate Limiting:
MAX_GLOBAL_CALLS_PER_HR: 800
IP_RATE_LIMIT: 100
OpenTelemetry:
OTEL_EXPORTER_OTLP_ENDPOINT: http://127.0.0.1:4318
OTEL_TRACES_SAMPLER: parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG: 0.1

---
4. DATABASE SCHEMA (SUPABASE POSTGRESQL)

Core Tables
Public Tables (User-facing):

projects
├── id (UUID PK)
├── owner_id (UUID FK → auth.users) [CRITICAL: NOT user_id!]
├── name, description, config (JSONB)├── created_at, updated_at
├── infra_mode ('easy'|'pro') ├── inhouse_subdomain, inhouse_custom_domain├── inhouse_schema_name, inhouse_build_id
├── test_run_id (for E2E test isolation)
└── RLS: owner OR collaborator access
project_collaborators
├── project_id, user_id, role └── RLS: project owner or admin

project_versions
├── project_id, version_name, version_id
├── status ('deployed'|'rollback')
├── created_by, deployed_at
└── Created ONLY on successful build/deploy
project_build_metrics
├── project_id, build_id, buildStatus├── currentBuildId, currentVersionId ├── metrics (JSONB)└── Event tracking
project_chat_log_minimal
├── project_id, user_id, message, role
├── seq (sequence for pagination)
├── client_msg_id (idempotency)
├── created_at, test_run_id
└── Persistent chat messages

unified_chat_sessions
├── project_id, user_id, actor_type
├── seq, last_read_seq
├── preferred_locale
├── test_run_id
└── Chat session management

voice_recordings
├── project_id, user_id, audio_url
├── transcription, detected_language ├── cost_usd, provider (openai|assemblyai)
└── message_id (FK - nullable)
web_vitals_raw / web_vitals_hourly
├── Metric data (INP, LCP, CLS, TTFB, FCP)
├── Rating (good|needs-improvement|poor)
├── Route, device_class, browser, build_version
└── Aggregated hourly with percentiles

Billing Tables:

customers
├── user_id (UUID FK → auth.users UNIQUE)
├── stripe_customer_id (TEXT UNIQUE) └── email, created_at, updated_at

subscriptions
├── customer_id, stripe_subscription_id
├── plan_name ('free'|'starter'|'growth'|'scale')
├── status, current_period_start/end ├── cancel_at_period_end, canceled_at└── Trial dates, created_at, updated_at

payments
├── customer_id, stripe_payment_intent_id
├── amount_cents, currency
├── status (succeeded|pending|failed|canceled)
└── created_at

plan_limits ├── plan_name (PK) ├── max_projects, max_ai_generations, max_exports, max_storage_mb
├── features (JSONB)
└── created_at, updated_at

usage_tracking
├── user_id, metric_name, period_start/end
├── metric_value (INT)
└── created_at, updated_at

In-House Mode Tables (Easy Mode):

inhouse_project_schemas
├── project_id (FK), schema_name
├── table_count, row_count_estimate, size_bytes
├── migration_version, last_migration_at
└── status ('active'|'suspended'|'deleted')
inhouse_tables
├── schema_id, project_id, table_name├── display_name, description, row_count, size_bytes
├── allow_client_read, allow_client_write, is_system_table└── RLS: admin via service role

inhouse_columns
├── table_id, column_name, data_type └── Metadata for query validation

inhouse_auth_users ├── project_id, email, password_hash ├── provider, provider_id, metadata
├── email_verified, last_sign_in
└── RLS: service role only

inhouse_auth_sessions
├── user_id (FK → inhouse_auth_users)├── token_hash (UNIQUE), expires_at
├── ip_address, user_agent, revoked_at
└── RLS: service role only

inhouse_auth_magic_links
├── project_id, email, token_hash
├── expires_at, consumed_at
└── RLS: service role only

inhouse_content_types
├── project_id, name, slug (UNIQUE per project)
├── schema (JSONB) └── created_at, updated_at

inhouse_content_entries
├── project_id, content_type_id, slug├── data (JSONB), status, locale
├── published_at, created_at, updated_at
└── RLS: service role only

inhouse_media
├── project_id, filename, mime_type, size_bytes
├── url, alt_text, metadata (JSONB)
└── created_at

inhouse_custom_domains
├── project_id, domain
├── status, verification_status, ssl_status ├── verification_method, verification_token └── RLS: service role only

inhouse_eject_requests
├── project_id, user_id, status
├── reason, details (JSONB), resolved_at
└── RLS: service role only

Key Indexes
- idx_projects_owner_id - User's projects
- idx_projects_inhouse_subdomain - Subdomain routing
- idx_projects_test_run_created - TTL cleanup
- idx_project_chat_log_minimal_seq - Pagination
- idx_web_vitals_metric_created - Performance dashboard
- Partial indexes on nullable columns for efficiency

RLS Strategy
RLS-First Design:
- No Supabase service role in production web routes- makeUserCtx() for user operations (authenticated)- makeAdminCtx() for admin/system (service role, server-only)
- Force RLS on sensitive tables
- In-House tables bypass RLS (service role context)
Policies:
- User can see own data + collaborator's shared data
- Owner can manage collaborators
- Service role can do everything (admin context)
- Test data cleanup via test_run_id (admin context)
---
5. INTERNATIONALIZATION (i18n)
Configuration:
- 9 Locales: English, Egyptian Arabic, Saudi Arabic, UAE Arabic, Standard Arabic, French, Moroccan French, Spanish, German
- Implementation: next-intl with locale routing
- Message files structure must be identical across all 9 locales
- RTL support for Arabic (CSS logical properties, dir attribute)

Navigation Gotchas (from CLAUDE.md): - Use @/i18n/routing for locale-aware navigation (not next/navigation)
- Double-locale bug: router.push('/${locale}/path') becomes /en/en/path (router auto-prefixes)
- Correct: router.push('/path') - router adds locale prefix

Server Pages Pattern:
export default async function Page({   params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params // Must await!
  // ... load messages and render
}

---
6. KEY LEARNINGS & GOTCHAS

Critical Issues Fixed

1. Projects Table Column Bug: Uses owner_id, NOT user_id. This was copy-pasted wrong across 10+ files.
2. Double-Locale Navigation: Router auto-prefixes locale; don't include in .push().3. Build Status vs Version:
  - buildStatus = latest build attempt (can fail)
  - currentVersionId = last successful build only
  - Failed builds create NO version record
  - UI must show both as separate indicators4. Worker Auth Signatures: Always use createWorkerAuthHeaders(). Single manual signatures fail during dual-mode rollout.5. HMAC Validation: Never use JSON.parse/stringify for HMAC (property order breaks). Use raw request body.6. Admin API Caching: Never cache /api/admin/* routes. Admin needs fresh auth checks.
7. Service Role in Production Web: Never reintroduce service role for user-facing routes. RLS is the security boundary. 8. In-House Auth: Service role only. User context cannot read/write in-house auth tables (password hashes, magic links).
---
7. BUILD & DEPLOYMENT

Next.js Build:
- npm run build includes template CSS generation + linting + type checking
- Exports to .next/ directory - Sentry source maps uploaded to Grafana Faro
- Console logging removed in production
- Webpack config: memory cache in dev, optimized imports

Worker Deployment: - npm run build runs tsc
- Output: dist/server.js
- Deployed to Railway or custom Docker
- BullMQ dashboard available at /bull for queue monitoring
Environment Validation:
- Worker: npm run validate:env checks required variables
- Next.js: Build fails if env vars missing for feature flags

---
8. TESTING & CI/CD
E2E Tests:
- Playwright with chromium
- test_run_id column for data isolation
- Parallel test shards supported
- Cleanup via TTL queries (rows with non-null test_run_id)- Bootstrap endpoints: /api/test/login, /api/test/cleanup
Local Development: - Next.js: npm run dev:safe (clears cache, polling mode)
- Worker: npm run dev (nodemon with ts-node)- Supabase local: supabase start, supabase db reset
---
9. INFRASTRUCTURE MODES

Pro Mode (Traditional, Existing)

- External Supabase, Vercel, Sanity
- User manages integrations
- Custom code deployment to Vercel

Easy Mode (SheenApps-Managed, Phase 1-3)

Phase 1: Infrastructure foundation
- Per-project PostgreSQL schemas
- Subdomain hosting- Quota tracking (DB, storage, requests)

Phase 2: Auth + CMS- Email/password authentication
- Magic link sign-in
- Content types + entries
- Media management
Phase 3: Custom Domains + Eject
- Custom domain verification (CNAME/TXT)
- SSL certificate provisioning- Eject to self-hosted (export project)
- Quote management for upgrades

---
10. FEATURE FLAGS (Production Kill Switches)
Client-Safe:NEXT_PUBLIC_ENABLE_VOICE_INPUT=true
NEXT_PUBLIC_ENABLE_ARABIC_DIALECTS=true
NEXT_PUBLIC_ENABLE_DEMO_MODE=true
NEXT_PUBLIC_ENABLE_CHAT_PLAN_MODE=true
NEXT_PUBLIC_ENABLE_EASY_DEPLOY=true (default)
NEXT_PUBLIC_ENABLE_PLAN_CONTEXT=true (default)
NEXT_PUBLIC_ENABLE_SYNCHRONOUS_AUTH_BOOTSTRAP=true

Server-Only:ENABLE_SUPABASE=true
FEATURE_CLIENT_SUPABASE=false (always disabled in prod)
ENABLE_SERVER_AUTH=true
MULTI_TENANT_READY=true
INHOUSE_CUSTOM_DOMAINS_ENABLED=false INHOUSE_EXPORTS_ENABLED=false INHOUSE_EJECT_ENABLED=false

---
11. CRITICAL PATTERNS TO FOLLOW

From CLAUDE.md, the essential rules:
1. All projects queries use .eq('owner_id', user.id) NOT user_id
2. Workers use createWorkerAuthHeaders() function
3. Database access: makeUserCtx() for web, makeAdminCtx() for system 4. No Supabase service key in production browser
5. Cache patterns: 3-layer (route + headers + client busting)
6. i18n navigation uses @/i18n/routing only 7. Translations must exist in all 9 locales 8. Versions created ONLY on successful deployment
9. In-House auth is service-role-only10. RLS enforcement is the security boundary
---
12. KEY RECENT FEATURES (Jan 2026)

- Web Vitals RUM tracking: Metric aggregation with percentiles
- Voice recordings: Audio transcription with cost tracking- In-House Phase 3: Custom domains + eject requests- E2E test isolation: test_run_id for parallel CI/CD
- Persistent chat: Sequence-based pagination + idempotency- Integration status endpoint: Unified multi-service status

---
This architecture supports a complete AI-powered web builder platform with options for both SheenApps-managed infrastructure (Easy Mode) and bring-your-own infrastructure (Pro Mode), all while maintaining strict security boundaries via RLS and careful separation of concerns betweenclient and server code.
