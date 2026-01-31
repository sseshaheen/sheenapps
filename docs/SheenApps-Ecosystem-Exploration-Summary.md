Architecture Exploration Summary: SheenApps Ecosystem

Last Updated: 26 Jan 2026

Here's the comprehensive architectural overview:

---
1. SHEENAPPSAI - Next.js Frontend Application

Stack & Framework:
- Framework: Next.js 15 (App Router with SSR)
- Runtime: Node.js with force-dynamic for auth routes
- UI Library: React 19 with Radix UI components
- Build System: TypeScript + tsup
- Testing: Vitest + Playwright E2E

Project Structure:
sheenappsai/
├── src/app/api/          # Next.js API routes (RSC server endpoints)
├── src/app/[locale]/     # App Router pages with locale routing
├── src/lib/
│   ├── supabase-*.ts     # Supabase client wrappers (SSR/CSR/middleware)
│   ├── db/               # Database utilities
│   ├── auth/             # Authentication helpers
│   ├── server/           # Server-only modules
│   │   └── repositories/ # Repository pattern classes
│   └── api/              # API utilities (worker-proxy, fetch-with-retry)
├── src/types/
│   ├── supabase.ts       # Auto-generated Supabase types
│   └── auth.ts           # Auth type definitions
└── src/components/       # React components

Authentication & API Pattern:
1. Supabase Auth (RLS-first architecture)
  - Client Tier: createServerClient (SSR-safe with cookie adapter)
  - Key Pattern: Uses RequestCookies/ResponseCookies headers to preserve HttpOnly cookies
  - Auth Routes: All use export const dynamic = 'force-dynamic' + runtime = 'nodejs'
  - OAuth: PKCE flow with encrypted JWT cookies for code verifiers
  - Providers: GitHub, Google, Discord, Twitter, Facebook, LinkedIn
2. API Route Security
  - Routes receive explicit userId parameter (not middleware-based)
  - Pattern: GET uses querystring, POST/PUT/DELETE use request.body
  - Dual-signature HMAC validation for worker calls (createWorkerAuthHeaders())
3. Repository Pattern (src/lib/server/repositories/)
  - Centralized data access layer for Supabase
  - Classes: ProjectRepository, VersionRepository, FileRepository, etc.
  - Enforces owner-based access control (critical: uses owner_id, NOT user_id)
  - Built-in multi-tenant support (org_id) but inactive in current features

Database Models (via Supabase):
- Schema: Primarily public + auth (managed by Supabase)
- Key Tables:
  - auth.users (Supabase-managed, id = UUID)
  - projects (owner_id UUID, NOT user_id)
  - project_versions, project_collaborators, project_advisors
- RLS Enforcement: Database enforces access control, no fallback to service key in production
- Type Generation: supabase gen types typescript → auto-generated types/supabase.ts

Internationalization (i18n):
- Framework: next-intl + custom routing
- Locales: 9 languages (en, ar-eg, ar-sa, ar-ae, ar, fr, fr-ma, es, de)
- Routing: Custom @/i18n/routing prevents double-locale bugs
- Server Pages: params is a Promise, must be awaited
- Client Hooks: Require 'use client' directive

---
2. SHEENAPPS-CLAUDE-WORKER - Fastify Backend Service

Stack & Framework:
- Framework: Fastify 5 with TypeScript
- Runtime: Node.js 22.x
- Build: tsc + nodemon dev
- Database: PostgreSQL (pg pool)
- Job Queue: BullMQ + Redis
- Observability: OpenTelemetry OTLP
- CLI Integration: Puppeteer/Chrome for builds

Project Structure:
sheenapps-claude-worker/
├── src/
│   ├── server.ts         # Fastify app entry point
│   ├── routes/           # 139 route files (admin, billing, auth, etc.)
│   ├── services/         # 166 service classes (business logic)
│   ├── middleware/       # Request handlers (HMAC, auth, correlation)
│   ├── queue/            # BullMQ job queues
│   ├── jobs/             # Scheduled jobs (daily, monthly, cleanup)
│   ├── observability/    # OTEL metrics & tracing
│   └── workers/          # Background workers (deployment, webhooks)
├── migrations/           # 128+ SQL migrations
├── config/               # Environment validation, timeouts
└── __tests__/           # Jest test suites

API Route Pattern (Fastify):
1. Route Registration: Each route in routes/*.ts exports async function
2. Type Safety: Generic FastifyInstance.post<{ Body, Querystring, Params }>
3. Signature Validation: HMAC middleware with dual v1/v2 signature support
4. Auth Pattern: NO request.user — explicit userId in query/body
5. Error Handling: Structured error responses with correlation IDs
6. Response Format: { ok, data, error } pattern (never throws)

Authentication & Security:
- HMAC Signing: Dual-signature validation for Next.js → Worker calls
- Admin JWT: Exchange Supabase token for admin JWT with 10-15min TTL
- Session Management: JWT stored in Redis with expiration tracking
- Admin Audit: All admin operations logged with user/IP/action
- MFA Compliance: Optional MFA check middleware

Database Architecture:
- Pool: pg Pool (max 10 connections, 30s idle timeout, 10s connection timeout)
- Transactions: Use dedicated client + BEGIN/COMMIT/ROLLBACK
- Connection Management: Always release in finally block
- Query Timeout: 30s with SET statement_timeout in transactions
- RLS Bypass: Migrations use SET session_replication_role = 'replica' to bypass triggers

Database Models (PostgreSQL):
-- Core tables
auth.users (id UUID, email, encrypted_password)
projects (id UUID, owner_id UUID, build_status, current_build_id, current_version_id)
project_versions (id, project_id, name, status ENUM, created_at)
project_build_metrics (id, project_id, build_id, duration_ms, status)

-- Billing/Quotas
billing_customers (user_id UUID, stripe_customer_id, region)
ai_usage_tracking (user_id, operation_type, duration_ms, tokens_used)
promotion_reservations (user_id, code, region, status)

-- In-House Mode
inhouse_projects (id, domain TEXT, infra_mode ENUM, services JSONB)
inhouse_activity_logs (event_type, actor_type, project_id, metadata JSONB)
inhouse_database_schemas (project_id, schema_json JSONB)

-- Realtime/Chat
unified_chat_sessions (id UUID, project_id, sequence INT, status ENUM)
chat_messages (id UUID, session_id, actor_type, text, seq INT)
presence_events (session_id, user_id, event_type, last_heartbeat)

Service Architecture:
- Service Singleton Pattern: Stateful services (Redis, DB connections) created once
- Dependency Injection: Services passed to routes during initialization
- Error Classification: claudeErrorClassifier → maps provider errors to user-friendly codes
- Middleware Chaining: preHandler hooks for auth, HMAC, metrics

Key Services:
- aiTimeBillingService - Tracks AI operation costs (build=180s, update=120s, etc.)
- enhancedChatService - Persistent chat with sequence-based pagination
- cloudflareThreeLaneDeployment - Deployment to CF Pages with domain management
- advisorMatchingService - Algorithm for advisor network matching
- supabaseManagementAPI - OAuth2 integration for user's Supabase projects

---
3. SHEENAPPS-PACKAGES - Modular SDK Architecture

Design Pattern:
- Monorepo Structure: 18 independent SDKs, each published to npm (private GitHub registry)
- Build Tool: tsup (TypeScript bundler)
- Module Format: CJS + ESM + Types exports
- Zero Dependencies: Minimal footprint (core SDKs use only built-in APIs)

Package Structure (Consistent):
@sheenapps/{service}/
├── src/
│   ├── client.ts        # Main class (SheenApps{Service}Client)
│   ├── types.ts         # Type definitions
│   └── index.ts         # Public exports
├── dist/                # Built outputs (js, mjs, d.ts)
├── package.json         # With publishConfig for GitHub registry
├── tsconfig.json        # TypeScript config
└── tsup.config.ts       # Bundle config

8 Core SDKs (Easy Mode Infrastructure):

1. @sheenapps/auth
  - Methods: signUp(), signIn(), createMagicLink(), getUser(), refreshSession()
  - API Endpoints: /v1/inhouse/auth/*
  - Key Pattern: Bearer token in Authorization header, refresh token in localStorage
  - Error Handling: Returns { data, error, status, requestId } (never throws)
2. @sheenapps/db
  - Supabase-like QueryBuilder API: .from('table').select().eq().order().limit()
  - Supports: select, insert, update, delete, joins, aggregations
  - Operations: .single(), .multiple(), all chain-able
  - No direct DB connection — all via API Gateway
3. @sheenapps/storage
  - Server generates signed PUT URL → client uploads directly to storage
  - Methods: createSignedUploadUrl(), deleteFile(), getSignedUrl()
  - Security: No sheen_sk_ exposed to browser
4. @sheenapps/jobs
  - Queue background tasks at-least-once delivery semantics
  - Methods: enqueue(), cancel(), getStatus()
  - Reserved prefix: sys:* for system jobs
5. @sheenapps/secrets
  - Retrieve third-party API keys (Stripe, OpenAI, etc.)
  - Methods: get(key) → { value?, error }
  - Server-only (never expose to client)
6. @sheenapps/email
  - Template system: welcome, magic-link, password-reset, receipt, notification
  - Methods: send({ to, template, variables })
  - Variables injected into templates server-side
7. @sheenapps/payments (Stripe integration)
  - Methods: createCheckoutSession(), getSubscription(), cancelSubscription()
  - Webhooks: verifyWebhook({ payload, signature })
  - Customer management: createCustomer(), getCustomer()
8. @sheenapps/analytics
  - Public key for browser: auto-generates anonymous ID in localStorage
  - Methods: track(event, properties), identify(userId, traits), page(path)
  - Server key for querying: listEvents(), getCounts(), getUser()

Additional SDKs:
- @sheenapps/core - Shared HTTP utilities, error types, validation
- @sheenapps/ai - AI model interactions
- @sheenapps/notifications - Push/in-app notifications
- @sheenapps/realtime - WebSocket subscriptions
- @sheenapps/search - Full-text search
- @sheenapps/forms - Form schema validation & submission
- @sheenapps/connectors - Third-party API integrations
- @sheenapps/templates - Component templates
- @sheenapps/cms - Content management
- @sheenapps/edge-functions - Serverless function SDK
- @sheenapps/flags - Feature flags
- Others...

API Key Pattern (Universal):
- Public Keys (sheen_pk_*): Safe for browser, limited permissions
- Server Keys (sheen_sk_*): Server-only, full permissions
- Validation: All SDKs check key format at construction time
- Context Detection: isBrowserContext() prevents server keys in browser

Common HTTP Client Pattern:
// Every SDK shares this pattern
async function fetch<T>(path, options): Promise<FetchResult<T>> {
  // 1. Add timeout controller
  // 2. Add SDK headers (x-api-key, X-SheenApps-SDK version)
  // 3. Parse response (safe JSON with content-type check)
  // 4. Return { ok, status, statusText, requestId, data, error }
}

---
Key Architectural Patterns

1. Authentication & Authorization
┌────────────────────┬─────────────────────────────────────────────┐
│       Layer        │               Implementation                │
├────────────────────┼─────────────────────────────────────────────┤
│ Frontend (Next.js) │ Supabase SSR client + RLS                   │
├────────────────────┼─────────────────────────────────────────────┤
│ Worker (Fastify)   │ JWT exchange + admin permission cache       │
├────────────────────┼─────────────────────────────────────────────┤
│ SDKs               │ API key (public/server) + Bearer token      │
├────────────────────┼─────────────────────────────────────────────┤
│ Database           │ PostgreSQL RLS policies (FORCE RLS in prod) │
└────────────────────┴─────────────────────────────────────────────┘
2. API Security
┌──────────────────┬────────────────────────────────────────────────────────────┐
│     Pattern      │                          Details                           │
├──────────────────┼────────────────────────────────────────────────────────────┤
│ HMAC Signing     │ Dual v1/v2 signatures for Next.js → Worker calls           │
├──────────────────┼────────────────────────────────────────────────────────────┤
│ Explicit User ID │ GET: query params, POST/PUT/DELETE: body (no middleware)   │
├──────────────────┼────────────────────────────────────────────────────────────┤
│ Ownership Checks │ Always verify owner_id matches requesting user             │
├──────────────────┼────────────────────────────────────────────────────────────┤
│ Correlation IDs  │ Trace requests through system with x-correlation-id header │
└──────────────────┴────────────────────────────────────────────────────────────┘
3. Database Models
┌────────────┬────────────────────────────────────────────────────────────┐
│  Category  │                          Pattern                           │
├────────────┼────────────────────────────────────────────────────────────┤
│ Ownership  │ All user data uses owner_id UUID REFERENCES auth.users(id) │
├────────────┼────────────────────────────────────────────────────────────┤
│ Versioning │ project_versions only created for successful deploys       │
├────────────┼────────────────────────────────────────────────────────────┤
│ Audit Logs │ admin_audit_logs for all admin changes                     │
├────────────┼────────────────────────────────────────────────────────────┤
│ Quotas     │ ai_usage_tracking + promotion_reservations for limits      │
├────────────┼────────────────────────────────────────────────────────────┤
│ Migrations │ SQL numbered 000-128, use conditional CREATE IF NOT EXISTS │
└────────────┴────────────────────────────────────────────────────────────┘
4. OAuth Implementation
┌───────────────────────┬────────────────────────────────────────────────────────────────┐
│         Flow          │                           Technology                           │
├───────────────────────┼────────────────────────────────────────────────────────────────┤
│ PKCE                  │ 128 bytes randomness → SHA256 → base64url challenge            │
├───────────────────────┼────────────────────────────────────────────────────────────────┤
│ Code Verifier Storage │ Encrypted JWT cookie (10min TTL)                               │
├───────────────────────┼────────────────────────────────────────────────────────────────┤
│ Providers             │ GitHub, Google via Supabase (can extend to Facebook, LinkedIn) │
├───────────────────────┼────────────────────────────────────────────────────────────────┤
│ Nonce Protection      │ JWT subject = nonce, prevents CSRF                             │
├───────────────────────┼────────────────────────────────────────────────────────────────┤
│ Return-To Redirect    │ Sanitized & validated, prevents auth loops                     │
└───────────────────────┴────────────────────────────────────────────────────────────────┘
5. API Endpoint Organization

Next.js Routes:
/api/v1/advisors/           → Advisor network
/api/v1/billing/            → Billing operations
/api/auth/                  → Authentication
/api/projects/[id]/         → Project management
/api/workspace/             → Workspace features
/api/admin/                 → Admin operations

Worker Routes:
/v1/admin/                  → Admin API (40+ routes)
/v1/inhouse/                → Easy Mode API
/v1/advisor-network/        → Advisor features
/webhook                    → Stripe/external webhooks
/builds/                    → Build operations
/integrations/              → Third-party integrations

6. Service Organization Pattern

Next.js: Repository classes + utility modules
class ProjectRepository extends BaseRepository {
  async getById(userId, projectId) { /* RLS query */ }
  async create(userId, data) { /* Insert with owner_id */ }
}

Worker: Service singletons + middleware stack
class CloudflareThreeLaneDeployment {
  async deploy(buildId) { /* Deployment logic */ }
}
fastify.post('/deploy', { preHandler: [hmacValidation, metrics] }, handler)

SDKs: Client class with method overloading
class SheenAppsClient {
  async fetch<T>(path, options) { /* Universal HTTP client */ }
  async post<T>(path, body) { return this.fetch(path, { method: 'POST', body }) }
}

7. Error Handling Consistency
┌────────────┬────────────────────────────────────────────────────┐
│   Layer    │                      Pattern                       │
├────────────┼────────────────────────────────────────────────────┤
│ API Routes │ { ok: false, error: { code, message, retryable } } │
├────────────┼────────────────────────────────────────────────────┤
│ Services   │ Never throw, return error in response object       │
├────────────┼────────────────────────────────────────────────────┤
│ SDKs       │ { data: null, error: SheenError, status }          │
├────────────┼────────────────────────────────────────────────────┤
│ Database   │ Query returns null on RLS denial (not error)       │
└────────────┴────────────────────────────────────────────────────┘
8. Middleware & Security

Next.js:
- supabase-mw.ts - SSR cookie sync
- auth-middleware.ts - Permission checks
- worker-auth-server.ts - HMAC signature generation

Worker:
- hmacValidation.ts - Signature validation
- correlationIdMiddleware.ts - Request tracing
- requireSignedActor.ts - Identity assertion
- reasonEnforcement.ts - Audit trail annotations

---
Critical Design Insights

1. RLS-First Architecture: Production code never uses service role key; all queries enforce RLS at database level
2. No User in Request: Authentication is explicit, not middleware-based (request.user doesn't exist)
3. Repository Pattern: Centralizes all data access, prevents query duplication and authorization drift
4. Dual-Signature Rollout: Worker supports v1 + v2 HMAC simultaneously during migration
5. Singleton Services: Stateful connections (DB, Redis) created once and reused
6. SDK Key Validation: Every SDK validates key format at construction time
7. Idempotency: All mutations use client_msg_id UUID for safe retries
8. Correlation IDs: All requests traced through system with unique IDs
9. Structured Errors: Never plain strings, always { code, message, retryable }
10. Type Safety: TypeScript enforced at compile time + runtime validation with Zod

---
This architecture enables:
- Multi-tenant isolation via RLS + explicit ownership checks
- API-first design with consistent SDK patterns across 18+ services
- Scalability through job queues, caching, and stateless route handlers
- Observability via correlation IDs, audit logs, and OpenTelemetry
- Easy Mode infrastructure for generated apps with pre-built SDKs
