# Everything In-House Mode: Strategic Analysis & Implementation Plan

## Executive Summary

**Goal**: Transform SheenApps from a "bring your own infrastructure" platform into a "we handle everything" experience where non-technical users can build and deploy complete applications without creating accounts on Supabase, Vercel, Sanity, or GitHub.

**The Problem Today**: Users must navigate 3-4 external services, create accounts, manage API keys, and understand OAuth flows. This is a significant barrier for non-technical users and creates friction in the onboarding journey.

**The Vision**: Users describe what they want, SheenApps builds it, hosts it, manages the database, and delivers a production-ready app on a custom domain - all without leaving our platform.

•	**Big win**: “Easy Mode” removes the 3–4 external accounts problem; Hybrid keeps power users happy.
•	**Core security stance is right**: user apps never hit Postgres directly; everything goes through an API Gateway that enforces project_id, rate limits, logging.
•	**DB safety is key**: no raw SQL from clients; structured query contract + allowlists + parameterized queries; separate server key for migrations/jobs.
•	**Hosting design is correct now**: use Workers for Platforms (dispatch namespace) + a single dispatch router; R2 serves static assets.
•	**Runtime limits are good** (timeouts, memory, response size, per-project rate limits) but: “no outbound network” should be framed as policy + deploy-time gating + monitoring, not a perfect sandbox guarantee.
•	Phase sequencing is sensible: Phase 1 = deploy + DB; Phase 2 = auth + minimal CMS + export; Phase 3 = custom domains; Phase 4 = hardening/scale.
•	**Custom domains choice is solid**: Cloudflare for SaaS / Custom Hostnames for SSL automation without per-domain infra.


Summary:
  1. Phase 1: backend infrastructure:
    - API Gateway service
    - Database with schema-per-tenant
    - Dispatch Worker for hosting
    - SDK packages (@sheenapps/db)
    - Security (rate limiting, quotas)
    - Deployment service
  2. Phase 2: Minimal Auth + Minimal CMS + Export
    - Auth service (email/password, magic link)
    - Minimal CMS service
    - Export functionality
  3. Phase 3: Custom Domains + Polish
    - Custom domains
    - Usage dashboards
    - Guided eject to Pro Mode
  4. Phase 4: "It scales"
    - OAuth, enterprise, multi-region
    - Ongoing hardening

---

## Part 1: Current State Analysis

### What Users Must Do Today

| Step | Service | Complexity | Friction Point |
|------|---------|------------|----------------|
| 1 | Create SheenApps account | Low | None |
| 2 | Connect Supabase (OAuth) | High | Must create Supabase account, understand OAuth, select project |
| 3 | Connect Vercel (OAuth) | High | Must create Vercel account, link to Git, configure project |
| 4 | Connect Sanity (Manual) | Very High | Must create Sanity account, create project, generate API tokens, understand datasets |
| 5 | Connect GitHub (OAuth) | Medium | Must have GitHub account, authorize app |

**Total external accounts needed**: 4 (Supabase, Vercel, Sanity, GitHub)

### Current Integration Architecture

```
User Project
    │
    ├── supabase_connections (OAuth tokens encrypted)
    │   └── Used for: Database schema creation, auth, real-time
    │
    ├── vercel_connections (OAuth tokens encrypted)
    │   └── Used for: Deployment, domains, preview URLs
    │
    ├── sanity_connections (Manual API tokens encrypted)
    │   └── Used for: CMS content sync, schema discovery
    │
    └── (GitHub via Vercel webhook)
        └── Used for: Code push triggers, version control
```

### What Happens During a Build

1. **AI generates code** → stored in SheenApps
2. **Database schema needed** → Worker decrypts Supabase token → calls Supabase API → creates tables
3. **CMS content needed** → Worker decrypts Sanity token → fetches content → injects into build
4. **Deploy triggered** → Worker uses Vercel token → pushes to Vercel → triggers build
5. **User gets URL** → From Vercel (e.g., `myapp.vercel.app`)

---

## Part 2: Competitive Landscape

### How Top Competitors Handle This

| Platform | Database | Hosting | CMS | User Complexity |
|----------|----------|---------|-----|-----------------|
| **Lovable** | Built-in (managed) | Built-in (subdomain + custom) | N/A | **Zero external accounts** |
| **Bolt.new** | Via integrations | Built-in (Netlify) | N/A | Low (one deploy target) |
| **Replit** | Built-in SQLite/Postgres | Built-in (GCP infra) | N/A | **Zero external accounts** |
| **v0 (Vercel)** | N/A (frontend only) | Vercel native | N/A | Medium (Vercel required) |
| **Base44** | Built-in | Built-in | Built-in | **Zero external accounts** |
| **SheenApps** | Supabase (external) | Vercel (external) | Sanity (external) | **High (3-4 accounts)** |

### Key Insight

> **The winners in vibe coding are moving toward "batteries included"** - Lovable, Replit, and Base44 all provide managed infrastructure so users never leave the platform.

### Market Evidence

- Lovable: "Built-in hosting, database, and authentication" - main selling point
- Replit: "One-click deployment with autoscaling on GCP" - zero config
- Base44: "More batteries included so you don't have to stitch together integrations"

---

## Part 3: In-House Mode Architecture Options

### Option A: Fully Managed Multi-Tenant (Recommended)

**Architecture**: SheenApps operates shared infrastructure that all user projects run on.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SheenApps Infrastructure                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │   Shared Postgres │  │   Shared Storage │  │  Shared Hosting│ │
│  │   (Multi-tenant)  │  │   (R2/S3)        │  │  (Edge/CDN)    │ │
│  │                   │  │                   │  │                │ │
│  │  ┌─────────────┐  │  │  /user-123/      │  │  *.sheenapps.com│ │
│  │  │ project_abc │  │  │  /user-456/      │  │                │ │
│  │  │ project_def │  │  │  /user-789/      │  │  Custom domains│ │
│  │  │ project_xyz │  │  │                   │  │  via CNAME     │ │
│  │  └─────────────┘  │  │                   │  │                │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Components**:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Database** | PostgreSQL (Neon/Supabase/self-hosted) with schema-per-tenant | User app data |
| **Hosting** | Cloudflare Pages/Workers OR Coolify on dedicated servers | Static + SSR apps |
| **Storage** | Cloudflare R2 (already have) | User uploads, assets |
| **CMS** | Built-in headless CMS OR file-based MDX | Content management |
| **Domains** | Cloudflare DNS API | Custom domain provisioning |
| **Auth** | Built-in auth system (JWT + sessions) | User app authentication |

**Pros**:
- Zero external accounts for users
- Full control over experience
- Predictable costs (not per-user Supabase/Vercel fees)
- Data stays in our infrastructure

**Cons**:
- Significant infrastructure investment
- Need to build/maintain CMS
- Need to handle scaling ourselves

---

### Option B: White-Label Self-Hosted Stack

**Architecture**: Use open-source BaaS tools but manage them ourselves.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SheenApps Infrastructure                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │    PocketBase    │  │     Coolify      │  │   Payload CMS  │ │
│  │  (Self-hosted)   │  │  (Self-hosted)   │  │  (Self-hosted) │ │
│  │                   │  │                   │  │                │ │
│  │  • Database      │  │  • Deploy apps   │  │  • Content     │ │
│  │  • Auth          │  │  • Manage domains│  │  • Media       │ │
│  │  • Realtime      │  │  • SSL certs     │  │  • Webhooks    │ │
│  │  • File storage  │  │  • Logs          │  │                │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Components**:

| Component | Technology | Why |
|-----------|------------|-----|
| **Database + Auth** | PocketBase | Single Go binary, SQLite-based, built-in auth, real-time, file storage |
| **Hosting** | Coolify | Open-source Vercel/Netlify alternative, Docker-based, auto-SSL |
| **CMS** | Payload CMS | Open-source, self-hosted, headless CMS with great API |

**Pros**:
- Faster to implement (use existing tools)
- Battle-tested solutions
- Active open-source communities
- No vendor lock-in

**Cons**:
- Multiple systems to manage
- Integration complexity
- May hit limits of open-source tools

---

### Option C: Hybrid Mode (Recommended for Phase 1)

**Architecture**: Offer both modes - In-House (default for simplicity) and BYOI (Bring Your Own Infrastructure) for power users.

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Creates Project                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌─────────────────────┐      ┌─────────────────────────────┐ │
│    │   "Easy Mode" ✨     │      │   "Pro Mode" ⚡              │ │
│    │   (Default)          │      │   (Optional)                │ │
│    │                       │      │                             │ │
│    │   • Managed DB       │      │   • Your Supabase          │ │
│    │   • Managed Hosting  │      │   • Your Vercel            │ │
│    │   • Built-in CMS     │      │   • Your Sanity            │ │
│    │   • *.sheenapps.com   │      │   • Your GitHub            │ │
│    │                       │      │                             │ │
│    │   Zero setup needed  │      │   Full control             │ │
│    └─────────────────────┘      └─────────────────────────────┘ │
│                                                                  │
│              Toggle anytime: "Eject to Pro Mode"                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why Hybrid**:
1. Non-tech users get instant gratification (default)
2. Power users/enterprises can use their own infra
3. Creates upgrade path: Easy → Pro (with revenue opportunity)
4. Reduces risk of vendor lock-in perception

---

## Part 4: Detailed Technical Design

### 4.0 Security Architecture: The Hidden Dragon

> **Critical Insight**: Easy Mode is fundamentally a **security + multi-tenancy + runtime isolation problem** disguised as "better onboarding."

When you host user-generated apps, you're running **untrusted code**. This must be designed for from day one, not bolted on later.

#### The Trust Boundary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           UNTRUSTED ZONE                                 │
│  ┌─────────────────┐                                                    │
│  │  User's Browser │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐     ┌─────────────────────────────────────────┐   │
│  │  User App Code  │     │  Generated server functions              │   │
│  │  (React/Next)   │────▶│  (SANDBOXED: timeouts, no raw network)  │   │
│  └─────────────────┘     └──────────────────┬──────────────────────┘   │
│                                              │                          │
├──────────────────────────────────────────────┼──────────────────────────┤
│                           TRUST BOUNDARY     │                          │
├──────────────────────────────────────────────┼──────────────────────────┤
│                           TRUSTED ZONE       │                          │
│                                              ▼                          │
│                          ┌─────────────────────────────────────────┐   │
│                          │      SheenApps API Gateway              │   │
│                          │  • Enforces project_id on every request │   │
│                          │  • Rate limits per project              │   │
│                          │  • Validates JWT/session                │   │
│                          │  • Logs for abuse detection             │   │
│                          └──────────────────┬──────────────────────┘   │
│                                              │                          │
│              ┌───────────────────────────────┼───────────────────────┐ │
│              ▼                               ▼                       ▼ │
│  ┌─────────────────┐           ┌─────────────────┐     ┌────────────┐ │
│  │  Neon Postgres  │           │  Cloudflare R2  │     │  Auth DB   │ │
│  │  (tenant-iso)   │           │  (path-prefix)  │     │            │ │
│  └─────────────────┘           └─────────────────┘     └────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Key Security Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Can user apps talk directly to Postgres? | **NO** | Direct DB access = SQL injection risk, RLS policy mistakes become existential |
| How do we enforce tenant isolation? | **API Gateway** | Gateway always injects `project_id`, impossible to bypass |
| Can user apps run arbitrary server code? | **Constrained** | Static + limited server functions with strict timeouts |
| Can user apps make outbound network calls? | **Restricted by policy** | We control generated code; scan/reject disallowed calls at deploy time; monitor egress |
| What are isolation boundaries? | **Workers for Platforms** | Dispatch namespace with per-project Worker isolation |

#### MVP Runtime Constraints

For Phase 1, deliberately constrain the runtime:

```typescript
// Server functions have hard limits
const RUNTIME_LIMITS = {
  maxExecutionMs: 10_000,      // 10 second timeout
  maxMemoryMb: 128,            // 128MB memory
  maxRequestsPerMin: 100,      // Per-project rate limit
  maxResponseSizeBytes: 5_000_000,  // 5MB response limit
}

// Outbound network policy (enforced at BUILD/DEPLOY time, not runtime)
const OUTBOUND_POLICY = {
  // We control the generated code, so we can:
  // 1. Scan for fetch() calls at deploy time
  // 2. Reject or rewrite disallowed outbound calls
  // 3. Monitor egress and rate-limit API calls
  // Note: Workers cannot truly block fetch() at runtime
  allowedHosts: ['api.sheenapps.com'],  // Only our gateway
  monitorEgress: true,
  rateLimit: { requestsPerMin: 60 },
}
```

**What this prevents**:
- Crypto miners (CPU/memory limits)
- Spam relays (outbound restricted by deploy-time policy + monitoring)
- Infinite loops (execution timeout)
- Abuse of our bandwidth (response size limit)
- DoS of shared infrastructure (rate limits)

> **Reality check**: Workers cannot truly remove `fetch()` at runtime. Our protection comes from:
> 1. Controlling generated code (we write it)
> 2. Scanning/rejecting at deploy time
> 3. Monitoring egress patterns
> 4. Rate limiting API calls

#### Data Exfiltration / Cross-Tenant Probing

One more abuse class that deserves explicit attention:

| Attack Vector | Mitigation |
|---------------|------------|
| **Cross-tenant data access** | Gateway enforces `project_id` on every DB query |
| **Probing other projects** | Rate limits + anomaly detection on failed lookups |
| **Exfil via outbound network** | Deploy-time scanning + egress monitoring (can't truly block `fetch()` at runtime) |
| **Exfil via logs/errors** | Sanitize error messages; don't leak other project IDs |
| **Shared runtime weirdness** | Workers for Platforms provides isolation-by-default |

**Defense layers**:
1. Gateway enforces tenant boundaries (primary)
2. Workers for Platforms isolates user code (secondary)
3. Per-project rate limits detect anomalies (monitoring)
4. RLS on database (defense-in-depth)

---

### 4.1 In-House Database Service

**Critical Architecture Decision**: User apps **never talk directly to Postgres**. All database access goes through the SheenApps API Gateway.

#### Why Gateway-First (Not Direct DB Access)

| Approach | Security | Complexity | DX |
|----------|----------|------------|-----|
| Direct Postgres (Supabase-style) | Requires perfect RLS policies on every table, JWT validation, SQL injection prevention | High | Familiar |
| **API Gateway** | Gateway enforces `project_id` on every request, impossible to access other tenants | **Low** | Slightly different |

**We choose Gateway-first** because:
1. Security becomes the gateway's job, not every table's RLS policy
2. No risk of RLS policy mistakes leaking data
3. Easier to add rate limiting, logging, abuse detection
4. Can still provide Supabase-like SDK experience

#### Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  User App       │     │  SheenApps API Gateway              │
│  (browser/SSR)  │────▶│  POST /api/db/query                 │
│                 │     │                                     │
│  @sheenapps/db  │     │  1. Validate project API key        │
│  SDK calls      │     │  2. Parse query                     │
│  gateway, NOT   │     │  3. Inject project_id filter        │
│  Postgres       │     │  4. Execute against Neon            │
│                 │     │  5. Return results                  │
└─────────────────┘     └──────────────────┬──────────────────┘
                                           │
                                           ▼
                        ┌─────────────────────────────────────┐
                        │  Neon PostgreSQL                    │
                        │  Schema: project_{id}               │
                        │  RLS as defense-in-depth only       │
                        └─────────────────────────────────────┘
```

#### Database Isolation Model

```sql
-- Each project gets its own schema (namespace isolation)
CREATE SCHEMA project_abc123;

-- Tables created within the schema
CREATE TABLE project_abc123.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Defense-in-depth: RLS as backup (gateway is primary enforcement)
ALTER TABLE project_abc123.users ENABLE ROW LEVEL SECURITY;
```

**Why Neon**:
- Serverless PostgreSQL (scales to zero, pay-per-use)
- HTTP/WebSocket driver (works with CF Workers - no raw TCP needed)
- Branching for preview environments
- Same SQL users know from Supabase

**Optimization: Hyperdrive**

For Workers → Postgres, use **Cloudflare Hyperdrive** where possible:
- Connection pooling (reduces handshake overhead)
- Fewer round trips per query
- Cloudflare explicitly recommends Hyperdrive for Workers↔Postgres

```typescript
// wrangler.toml
// [[hyperdrive]]
// binding = "HYPERDRIVE"
// id = "your-hyperdrive-config-id"

// In Worker code
const sql = postgres(env.HYPERDRIVE.connectionString)
```

#### The Query Contract (Critical Security)

> **Warning**: If you ship `POST /db/query { sql: '...' }` you've created SQL injection as a service.

The gateway must enforce a **strict query contract**:

| Rule | Implementation |
|------|----------------|
| **No raw SQL from clients** | SDK generates structured AST, not SQL strings |
| **Parameterized queries only** | All values are bound parameters, never interpolated |
| **Table allowlist** | Only tables defined in project's migrations are queryable |
| **Column allowlist** | Derived from schema, prevents `SELECT *` on sensitive columns |
| **Operation allowlist** | `select`, `insert`, `update`, `delete` only - no DDL from clients |
| **Separate server key** | Migrations/background jobs use privileged key, never exposed to browser |

```typescript
// What the SDK sends (structured, not raw SQL)
{
  "operation": "select",
  "table": "users",
  "columns": ["id", "email", "created_at"],
  "filters": [
    { "column": "email", "op": "eq", "value": "user@example.com" }
  ],
  "limit": 10
}

// What the gateway generates (parameterized)
const query = sql`
  SELECT id, email, created_at
  FROM ${sql(schema)}.users
  WHERE email = ${email}
  LIMIT ${limit}
`
// Schema and table names validated against allowlist BEFORE query execution
```

**The gateway is the security perimeter.** RLS is defense-in-depth only.

#### SDK Design (Familiar API, Gateway Under the Hood)

```typescript
// @sheenapps/db - looks like Supabase, calls our gateway
import { createClient } from '@sheenapps/db'

const db = createClient({
  projectId: 'abc123',
  apiKey: 'sheen_pk_xxx'  // Public key, safe for client-side
})

// Familiar Supabase-like API
const { data, error } = await db
  .from('users')
  .select('*')
  .eq('email', 'user@example.com')

// Under the hood, this becomes:
// POST https://api.sheenapps.com/v1/db/query
// Headers: { x-project-id: abc123, x-api-key: sheen_pk_xxx }
// Body: { table: 'users', operation: 'select', filters: [...] }
```

---

### 4.2 In-House Hosting Service

**Critical Architecture Decision**: Use **Workers for Platforms** (dispatch namespaces) for SSR, NOT "load JS from R2 and execute."

#### Why Workers for Platforms (Critical Correction)

> **Warning**: Cloudflare Workers **cannot** dynamically execute arbitrary JS loaded from R2. No `eval()`, no `new Function()`, no dynamic imports of fetched code. This is a fundamental security constraint of the Workers runtime.

The correct solution is **Workers for Platforms** - Cloudflare's product specifically designed for multi-tenant platforms running user code:

| Approach | Works? | Why |
|----------|--------|-----|
| Load JS from R2 + execute | **NO** | Workers block dynamic code execution |
| One Worker per project (main account) | Kinda | Hits account script limits at scale |
| **Workers for Platforms (dispatch namespace)** | **YES** | Designed for this exact use case |

**What Workers for Platforms gives us**:
- One dispatch namespace with **no per-account script limits** inside it
- Each project's SSR is a deployed Worker script in the namespace
- Isolation-by-default between user Workers
- Dynamic dispatch from routing Worker → project Worker

#### Architecture (Corrected)

```
                    ┌─────────────────────────────────────────────────────┐
                    │              Cloudflare Edge                         │
                    │                                                      │
  myblog.sheenapps.com                                                     │
  myshop.sheenapps.com  ───────▶  ┌─────────────────────────────────────┐ │
  custom.usersite.com            │   Dispatch Worker (routing)         │ │
                                 │                                     │ │
                                 │  1. Parse hostname                  │ │
                                 │  2. Lookup: hostname → project_id   │ │
                                 │  3. Dynamic dispatch to user Worker │ │
                                 └──────────────┬──────────────────────┘ │
                                                │                        │
                    ┌───────────────────────────┴───────────────────────┐│
                    │                                                    ││
                    ▼                                                    ▼│
     ┌──────────────────────────────┐    ┌───────────────────────────────┤
     │  Static Assets (R2)          │    │  Dispatch Namespace           │
     │                              │    │  (Workers for Platforms)      │
     │  /builds/{project}/{build}/  │    │                               │
     │  └── _next/static/...        │    │  ┌─────────────────────────┐ │
     │  └── public/...              │    │  │ project-abc Worker      │ │
     │                              │    │  │ project-def Worker      │ │
     │  Served directly by          │    │  │ project-xyz Worker      │ │
     │  routing worker              │    │  │ ...                     │ │
     └──────────────────────────────┘    │  └─────────────────────────┘ │
                                         │  Each is a DEPLOYED script,  │
                                         │  not fetched-and-executed    │
                                         └───────────────────────────────┘
```

#### How It Works

```typescript
// Dispatch Worker (routing) - runs on every request
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    const hostname = url.hostname

    // 1. Lookup project from hostname (KV cache)
    const projectId = await env.HOSTNAME_MAP.get(hostname)
    if (!projectId) return new Response('Not found', { status: 404 })

    // 2. Check if static asset
    const path = url.pathname
    if (isStaticAsset(path)) {
      const buildId = await env.PROJECT_BUILDS.get(projectId)
      const asset = await env.ASSETS.get(`builds/${projectId}/${buildId}${path}`)
      return new Response(asset.body, { headers: assetHeaders(path) })
    }

    // 3. Dynamic dispatch to project's user Worker
    // This invokes the DEPLOYED Worker script for this project
    const userWorker = env.DISPATCH_NAMESPACE.get(projectId)
    return await userWorker.fetch(request)
  }
}

// wrangler.toml for dispatch worker
// [[dispatch_namespaces]]
// binding = "DISPATCH_NAMESPACE"
// namespace = "sheenapps-user-projects"
```

#### Deployment Flow (Corrected)

```typescript
// Internal deployment service
class DeploymentService {
  async deploy(projectId: string, buildArtifacts: BuildOutput) {
    const buildId = generateBuildId()

    // 1. Upload static assets to R2 (versioned path)
    await this.uploadToR2(
      `builds/${projectId}/${buildId}/`,
      buildArtifacts.static
    )

    // 2. Deploy SSR as a Worker script to dispatch namespace
    // This is a REAL deployment, not just uploading to R2
    await cf.workers.scripts.update({
      account_id: ACCOUNT_ID,
      dispatch_namespace: 'sheenapps-user-projects',
      script_name: projectId,  // Worker name = project ID
      // The bundled SSR code as a Worker script
      body: buildArtifacts.serverBundle,
      metadata: {
        main_module: 'index.js',
        bindings: [
          // Inject project-specific bindings
          { type: 'plain_text', name: 'PROJECT_ID', text: projectId },
          { type: 'plain_text', name: 'BUILD_ID', text: buildId },
        ],
      },
    })

    // 3. Update build pointer
    await env.PROJECT_BUILDS.put(projectId, buildId)

    // 4. Ensure hostname mapping exists
    const subdomain = await this.getSubdomain(projectId)
    await env.HOSTNAME_MAP.put(`${subdomain}.sheenapps.com`, projectId)

    return {
      url: `https://${subdomain}.sheenapps.com`,
      buildId,
      status: 'deployed',
    }
  }
}
```

#### Why This Works

| Concern | How Workers for Platforms Solves It |
|---------|-------------------------------------|
| Script limits | No limits inside dispatch namespace |
| Code execution | Each project is a deployed Worker, not dynamic eval |
| Isolation | User Workers are isolated by default |
| Scaling | CF handles all the scaling |
| Untrusted code | Designed for exactly this use case |

#### SSR Compatibility Constraint

> **Important**: Phase 1 supports **Workers-compatible SSR** (or static export). Node-specific server APIs may be disallowed or auto-adapted.

Not all Node.js code runs in Workers. We must either:
1. Generate Workers-compatible SSR from the start
2. Use static export for Phase 1, add SSR later
3. Auto-adapt common Node APIs (via polyfills or build transforms)

This avoids the "why doesn't this npm package work on edge?" support spiral.

#### Custom Domains via Cloudflare for SaaS

For custom domains, use **Cloudflare for SaaS / Custom Hostnames** (not generic DNS API):

```typescript
// Custom domain provisioning
async addCustomDomain(projectId: string, domain: string) {
  // 1. Create Custom Hostname via CF API
  const hostname = await cf.customHostnames.create({
    zone_id: SHEENAPPS_ZONE_ID,
    hostname: domain,
    ssl: {
      method: 'http',          // Auto HTTP validation
      type: 'dv',              // Domain validation
      wildcard: false,
    },
    custom_metadata: { projectId },
  })

  // 2. Return CNAME target for user
  return {
    cname_target: 'proxy.sheenapps.com',  // Our proxy hostname
    status: 'pending_validation',
    instructions: `Add CNAME record: ${domain} → proxy.sheenapps.com`
  }

  // 3. CF automatically provisions SSL when CNAME is added
  // 4. Our routing worker handles traffic via hostname lookup
}
```

---

### 4.3 In-House CMS Service

**Recommendation**: Built-in minimal CMS with file-based option

**Two-Tier Approach**:

1. **Simple Content** (built-in): For blogs, pages, basic structured data
2. **Power Users**: Eject to Sanity if they need advanced features

**Built-in CMS Schema**:

```sql
-- Content types defined per-project
CREATE TABLE inhouse_content_types (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  schema JSONB NOT NULL,  -- Field definitions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content entries
CREATE TABLE inhouse_content_entries (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  content_type_id UUID REFERENCES inhouse_content_types(id),
  slug VARCHAR(255),
  data JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',  -- draft, published, archived
  locale VARCHAR(10) DEFAULT 'en',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media library
CREATE TABLE inhouse_media (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  url TEXT NOT NULL,  -- R2 URL
  alt_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**CMS UI in Workspace**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Project: My Blog                                    [Settings] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Content Types          │  Blog Posts (12)                      │
│  ─────────────         │  ──────────────────────────────────── │
│  📄 Blog Posts    ←    │                                        │
│  📄 Authors            │  □ Getting Started with AI      Draft │
│  📄 Categories         │  ☑ Why Vibe Coding Matters   Published│
│  📄 Pages              │  ☑ Our Journey So Far       Published│
│                         │                                        │
│  [+ Add Type]          │  [+ New Post]                          │
│                         │                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Content API for User Apps**:

```typescript
// Content fetching in user apps
import { cms } from '@sheenapps/cms'

// Get all published posts
const posts = await cms.content('blog-posts')
  .filter({ status: 'published' })
  .locale('en')
  .orderBy('published_at', 'desc')
  .limit(10)
  .fetch()

// Get single entry
const post = await cms.content('blog-posts')
  .slug('getting-started')
  .locale('en')
  .fetch()
```

---

### 4.4 In-House Auth Service

**Recommendation**: Start simple, add OAuth later.

#### Why Delay OAuth

OAuth for user apps (Google, GitHub, Apple) is **deceptively complex**:
- Each provider requires domain verification
- Redirect URIs must be pre-registered (per custom domain!)
- App review processes (Apple is notorious)
- Token refresh, scope management, consent screens

**Phase 1**: Email/Password + Magic Link only
**Phase 3+**: Add OAuth once Easy Mode is stable and we see demand

**Supported Auth Methods (MVP)**:
- Email/Password (with email verification)
- Magic Link (passwordless)

**Implementation Note (2026-01-15)**:
- Passwords are stored with scrypt hashes.
- Magic link delivery is backend-generated; email delivery integration is deferred
  (token is returned so the app can deliver it via its own email provider).

**CMS MVP Note (2026-01-15)**:
- Minimal CMS: content types + entries with JSON schema and JSON data.
- Write operations require server API keys; read operations allow public keys.
- Media upload now supported via admin HMAC routes (base64 upload to R2 + metadata).
- Frontend CMS UI uses React Query (avoid adding new SWR hooks).
- `@sheenapps/cms` SDK added under `/packages/cms/` for user apps.
- CMS editor now supports schema validation + form-based entry editing + richer field types + range/length validation + format hints + range UI + required badges + quick fill.

**Future (when justified)**:
- OAuth: Google, GitHub, Apple
- SSO (enterprise tier)
- `@sheenapps/auth` SDK for user apps (wraps in-house auth endpoints)

**Database Schema**:

```sql
-- User auth for in-house projects
CREATE TABLE inhouse_auth_users (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  email VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash TEXT,  -- scrypt
  provider VARCHAR(50),  -- email, google, github, apple
  provider_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sign_in TIMESTAMPTZ,

  UNIQUE(project_id, email)
);

CREATE TABLE inhouse_auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES inhouse_auth_users(id),
  project_id UUID REFERENCES projects(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);
```

**Auth Client for User Apps**:

```typescript
// Auth in user apps
import { auth } from '@sheenapps/auth'

// Sign up
await auth.signUp({
  email: 'user@example.com',
  password: 'securepassword',
})

// Sign in
const { user, session } = await auth.signIn({
  email: 'user@example.com',
  password: 'securepassword',
})

// Magic link (passwordless)
await auth.signInWithMagicLink({
  email: 'user@example.com',
})

// Get current user
const user = await auth.getUser()

// Sign out
await auth.signOut()

// FUTURE (Phase 3+): OAuth providers
// await auth.signInWithProvider('google')
```

---

## Part 5: User Experience Design

### 5.1 New Project Flow (In-House Mode)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Create New Project                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  What do you want to build?                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ A blog for my photography business                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✨ Easy Mode (Recommended)                               │   │
│  │                                                          │   │
│  │ Everything handled for you:                              │   │
│  │ • Database & auth included                               │   │
│  │ • Instant hosting at yoursite.sheenapps.com              │   │
│  │ • Built-in CMS for your content                         │   │
│  │ • Custom domain support (Pro)                            │   │
│  │                                                          │   │
│  │ Zero external accounts needed                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⚡ Pro Mode                                              │   │
│  │                                                          │   │
│  │ Connect your own services:                               │   │
│  │ Supabase • Vercel • Sanity • GitHub                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│                              [Create Project →]                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Workspace Integration Panel (In-House Mode)

```
┌─────────────────────────────────────────────────────────────────┐
│  Infrastructure                                      Easy Mode  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🗄️ Database                                    Active ● │   │
│  │    Tables: users, posts, comments                        │   │
│  │    Storage: 12.4 MB of 500 MB                           │   │
│  │    [View Tables] [Query Console]                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🌐 Hosting                                     Live ●   │   │
│  │    URL: myblog.sheenapps.com                              │   │
│  │    Last deploy: 5 minutes ago                            │   │
│  │    [Open Site] [Deploy] [Logs]                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📝 Content                                    12 items  │   │
│  │    Blog Posts (8) • Authors (2) • Pages (2)             │   │
│  │    [Manage Content]                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔐 Auth                                      24 users   │   │
│  │    Sign-ups this week: 12                                │   │
│  │    [User Management] [Auth Settings]                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ────────────────────────────────────────────────────────────  │
│  Need more control? [Upgrade to Pro Mode →]                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Eject to Pro Mode Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Upgrade to Pro Mode                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  You're about to switch to Pro Mode. This will:                 │
│                                                                  │
│  ✓ Export your database to your Supabase project               │
│  ✓ Transfer hosting to your Vercel account                      │
│  ✓ Migrate content to your Sanity workspace                    │
│  ✓ Push code to your GitHub repository                          │
│                                                                  │
│  Your current setup:                                             │
│  ┌───────────────────┬───────────────────────────────────────┐ │
│  │ Database          │ 12.4 MB, 3 tables, 1,247 rows         │ │
│  │ Content           │ 12 items across 3 content types        │ │
│  │ Users             │ 24 authenticated users                 │ │
│  │ Media             │ 45 files, 234 MB                       │ │
│  └───────────────────┴───────────────────────────────────────┘ │
│                                                                  │
│  Connect your services to proceed:                              │
│                                                                  │
│  [Connect Supabase] ○  [Connect Vercel] ○                      │
│  [Connect Sanity] ○    [Connect GitHub] ○                      │
│                                                                  │
│                 [Cancel]  [Begin Migration →]                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Implementation Phases (Realistic MVP)

> **Philosophy**: Ship a deliberately constrained MVP. Earn the right to add complexity.

### Phase 1: Hosting + DB via API Gateway (MVP)

**Goal**: Users can create Easy Mode projects that deploy and have a working database.

| Task | Description | Priority |
|------|-------------|----------|
| **API Gateway** | Central gateway enforcing tenant boundaries | P0 |
| **Neon integration** | Schema-per-project (or db-per-project if affordable) | P0 |
| **Dispatch Worker + Workers for Platforms** | Routing worker + per-project Workers in dispatch namespace | P0 |
| **Hostname mapping** | KV-based `*.sheenapps.com` → project routing | P0 |
| **`@sheenapps/db` SDK** | Supabase-like API that calls gateway | P0 |
| **Hard quotas + rate limits** | From day one, not bolted on later | P0 |
| **Mode toggle** | Project-level Easy/Pro setting | P1 |

**Deliverables**:
- Users can create "Easy Mode" projects
- Apps deploy to `{name}.sheenapps.com`
- Database works via SDK (gateway-backed)
- Quotas prevent abuse
- Existing Pro Mode unchanged

**What we explicitly DON'T build yet**:
- CMS (use JSON files or hardcoded data)
- Auth (apps can be public-only initially)
- Custom domains
- Migration/eject wizard

**Constraint**: Phase 1 supports Workers-compatible SSR or static export only. Node-specific server APIs may be disallowed.

---

### Phase 2: Minimal Auth + Minimal CMS + Export

**Goal**: User apps can have authenticated users and basic content management.

| Task | Description | Priority |
|------|-------------|----------|
| **Auth: Email/Password** | Basic signup/signin flow | P0 |
| **Auth: Magic Link** | Passwordless option | P1 |
| **CMS: Collections** | Define content types via JSON schema | P0 |
| **CMS: Rich Text** | Basic block editor (keep it boring) | P1 |
| **`@sheenapps/auth` SDK** | Auth client for user apps | P0 (scaffolded) |
| **`@sheenapps/cms` SDK** | Content queries for user apps | P0 |
| **One-way Export** | SQL dump + content JSON + asset bundle | P0 |

**Deliverables**:
- Users can add auth to their apps (email/password, magic link)
- Users can create content collections (blog posts, etc.)
- Users can export their data (not migrate, just download)

**What we explicitly DON'T build yet**:
- OAuth providers (Google, GitHub, etc.)
- Full migration wizard to Pro Mode
- Custom domains

---

### Phase 3: Custom Domains + Polish

**Goal**: Production-ready for paying customers with custom domains.

| Task | Description | Priority |
|------|-------------|----------|
| **Cloudflare for SaaS** | Custom Hostnames API integration | P0 |
| **SSL automation** | Auto-provisioning when CNAME verified | P0 |
| **Usage dashboards** | Per-project resource usage visibility | P1 |
| **Guided Eject** | Migration wizard to Pro Mode (if demand) | P2 |

**Status**: Placeholder scaffolding added (tools panel + worker routes gated by env flags + persistence for domains/eject).

**Deliverables**:
- Custom domains with auto-SSL (Pro tier)
- Clear visibility into usage/limits
- Optional: guided migration to BYOI

---

### Phase 4: Scale & Harden (Ongoing)

| Task | Description |
|------|-------------|
| **Abuse detection** | Automated monitoring for crypto miners, spam |
| **Multi-region SSR** | Deploy routing worker to more regions |
| **OAuth for user apps** | Add Google/GitHub/Apple when justified |
| **Enterprise features** | Dedicated resources, SLA, SSO |
| **Performance** | Edge caching, CDN optimization |

---

### Phase Summary

```
Phase 1: "It works"
├── Deploy to *.sheenapps.com
├── Database via gateway
└── Hard limits from day one

Phase 2: "It's useful"
├── Auth (email + magic link)
├── Basic CMS
└── Export your data

Phase 3: "It's professional"
├── Custom domains
└── Production polish

Phase 4: "It scales"
├── OAuth, enterprise, multi-region
└── Ongoing hardening
```

---

## Part 7: Pricing Strategy

### Recommended Tier Structure

| Tier | In-House Limits | Price |
|------|-----------------|-------|
| **Free** | 1 project, 100MB DB, `*.sheenapps.com` only | $0 |
| **Starter** | 3 projects, 500MB DB, custom domain | $19/mo |
| **Growth** | 10 projects, 2GB DB, priority support | $49/mo |
| **Scale** | Unlimited, 10GB DB, dedicated resources | $149/mo |
| **Pro Mode** | BYOI (no limits, user pays providers) | Same tiers |

### Revenue Comparison

**Current Model** (BYOI only):
- User pays SheenApps for AI time
- User pays Supabase/Vercel/Sanity separately
- We capture: AI value only

**In-House Model**:
- User pays SheenApps for everything
- We capture: AI + Infrastructure margin
- Higher ARPU, lower churn (switching cost)

---

## Part 8: Risk Analysis & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Security breach (tenant isolation failure)** | Critical | Medium | API Gateway enforces project_id; defense-in-depth RLS |
| **Abuse (crypto mining, spam, infinite loops)** | High | High | Hard runtime limits; deploy-time code scanning; egress monitoring |
| **Infrastructure costs exceed revenue** | High | Medium | Usage-based pricing, hard quotas per tier |
| **Dispatch namespace misconfiguration / abuse** | High | Medium | Least-privilege bindings, per-project limits, deploy-time scanning, kill-switch per project |
| **Performance issues at scale** | Medium | Medium | Start constrained, monitor closely, expand limits |
| **Users want features we can't match** | Medium | High | Clear "Eject to Pro" path + one-way export |
| **Vendor lock-in perception** | Medium | Low | Emphasize export capability, Pro Mode option |
| **OAuth complexity for user apps** | Medium | Medium | Delay OAuth; ship email + magic link first |

### The "Hidden Dragon" Risks (Per Expert Review)

These are the risks that look easy on paper but cause "why is the pager screaming" in production:

1. **"We host arbitrary generated code"** is a security product, not a feature
   - Mitigation: Constrained runtime, deploy-time code scanning, egress monitoring, strict timeouts

2. **Direct Postgres access** creates SQL injection + RLS policy mistake risks
   - Mitigation: API Gateway pattern; SDK calls gateway, never DB directly

3. **Per-project Workers** hit Cloudflare account limits at scale
   - Mitigation: Single routing worker + R2 assets

4. **Edge + Postgres connectivity** requires special drivers
   - Mitigation: Neon's HTTP/WebSocket driver (no raw TCP)

---

## Part 9: Recommendations

### Immediate Actions

1. **Start with Hybrid Mode**: Don't remove current integrations. Add Easy Mode as default, keep Pro Mode for power users.

2. **Use Managed Services First**: Neon (DB), Cloudflare (hosting), R2 (storage). Don't self-host initially.

3. **Build Migration Path**: Every Easy Mode project should be exportable to Pro Mode.

4. **Limit Scope**: Start with database + hosting. Add CMS + Auth in Phase 2.

### Architecture Decisions

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| Database | Neon (serverless PostgreSQL) | Supabase-compatible, scales to zero |
| Hosting | Cloudflare Pages + Workers | Already integrated, global edge |
| Storage | Cloudflare R2 | Already integrated, S3-compatible |
| CMS | Build simple, allow Sanity eject | Most users need simple, power users eject |
| Auth | Build in-house | Table stakes, must be seamless |

### Success Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| Easy Mode adoption | 70% of new projects |
| Time to first deploy | < 5 minutes (from signup) |
| Eject rate | < 10% (Easy → Pro) |
| Support tickets (infra) | 50% reduction |

---

## Appendix A: Competitive Feature Matrix

| Feature | SheenApps (Today) | SheenApps (In-House) | Lovable | Bolt.new | Replit |
|---------|-------------------|----------------------|---------|----------|--------|
| Zero external accounts | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| Built-in database | ❌ | ✅ | ✅ | ❌ | ✅ |
| Built-in hosting | ❌ | ✅ | ✅ | ✅ | ✅ |
| Built-in CMS | ❌ | ✅ | ❌ | ❌ | ❌ |
| Custom domains | Via Vercel | ✅ | ✅ | ✅ | ✅ |
| BYOI option | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| Code export | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-language (9 locales) | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Appendix B: Technical Stack Summary (Revised)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 SheenApps In-House Architecture (v2)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  UNTRUSTED: User Apps (Browser + Generated SSR)                         │
│  ├── @sheenapps/db  → calls API Gateway (never Postgres directly)      │
│  ├── @sheenapps/auth → calls API Gateway                                │
│  ├── @sheenapps/cms  → calls API Gateway                                │
│  └── @sheenapps/storage → calls API Gateway                             │
│                                                                          │
│  ═══════════════════════ TRUST BOUNDARY ════════════════════════════════│
│                                                                          │
│  TRUSTED: SheenApps Infrastructure                                      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  API Gateway (enforces project_id on EVERY request)               │ │
│  │  ├── Rate limiting per project                                     │ │
│  │  ├── JWT/session validation                                        │ │
│  │  ├── Abuse detection logging                                       │ │
│  │  └── Routes to appropriate backend service                         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                           │                                              │
│       ┌───────────────────┼───────────────────┐                         │
│       ▼                   ▼                   ▼                         │
│  ┌──────────┐      ┌──────────────┐    ┌──────────────┐                │
│  │ Neon     │      │ Cloudflare   │    │ Auth + CMS   │                │
│  │ Postgres │      │ R2 Storage   │    │ Services     │                │
│  │ (HTTP)   │      │              │    │              │                │
│  └──────────┘      └──────────────┘    └──────────────┘                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Dispatch Worker (routing) + Workers for Platforms                 │ │
│  │  ├── Hostname → project_id lookup (KV)                            │ │
│  │  ├── Static assets served from R2                                  │ │
│  │  └── SSR: dynamic dispatch to per-project Worker in namespace     │ │
│  │                                                                    │ │
│  │  Dispatch Namespace: "sheenapps-user-projects"                    │ │
│  │  └── Each project = deployed Worker script (not fetched JS)       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Existing SheenApps Platform (unchanged)                                │
│  ├── Next.js 15 (marketing + workspace)                                 │
│  ├── Claude Worker (AI builds)                                          │
│  └── Supabase (PLATFORM DB - not user apps)                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Architecture Decisions

| Component | Choice | Why |
|-----------|--------|-----|
| User app DB access | Via API Gateway | Security: gateway enforces tenant isolation |
| DB query contract | Structured AST, not raw SQL | Prevents SQL injection as a service |
| DB connection | Hyperdrive + Neon HTTP driver | Connection pooling, edge-compatible |
| SSR hosting | **Workers for Platforms** | Can't `eval()` in Workers; dispatch namespaces designed for this |
| Static assets | R2 with versioned paths | Simple, cheap, globally distributed |
| Custom domains | Cloudflare for SaaS | Automatic SSL, no per-domain workers |
| Auth (MVP) | Email + Magic Link | Complexity: OAuth is a Phase 3+ feature |
| CMS | Simple collections | Boring is good: JSON schema + rich text |

---

## Appendix C: Sources & Research

### Competitor Analysis
- [Lovable vs Bolt: Practical Comparison](https://www.softr.io/blog/lovable-vs-bolt)
- [Enterprise Vibe Coding Tools Guide](https://www.superblocks.com/blog/best-enterprise-vibe-coding-tools)
- [Vibe Coding Platforms 2025](https://www.leanware.co/insights/vibe-coding-platforms-in-2025-best-tools-to-build-smarter)

### Self-Hosted Infrastructure
- [Coolify - Open Source PaaS](https://coolify.io/)
- [PocketBase - Lightweight BaaS](https://pocketbase.io/)
- [Appwrite - Self-Hosted Backend](https://appwrite.io/)

### Multi-Tenant Database
- [AWS Multi-Tenant PostgreSQL](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/welcome.html)
- [Neon Multi-Tenancy](https://neon.com/blog/multi-tenancy-and-database-per-user-design-in-postgres)
- [Citus for Multi-Tenant SaaS](https://www.citusdata.com/use-cases/multi-tenant-apps)

---

*Document generated: January 2026*
*Status: Implementation In Progress*

---

## Part 10: Implementation Log

### Phase 1 Progress Tracker

| Task | Status | Notes |
|------|--------|-------|
| Database schema (infra_mode column) | ✅ Done | Migration: `20260112_inhouse_mode_infrastructure.sql` |
| In-house schema tables | ✅ Done | 8 tables: schemas, tables, columns, deployments, api_keys, quotas, request_log |
| API Gateway service | ✅ Done | `InhouseGatewayService.ts` + `inhouseGateway.ts` routes |
| Query contract validation | ✅ Done | Structured AST types, allowlist enforcement |
| @sheenapps/db SDK | ✅ Done | `/packages/db/` - Supabase-like fluent API |
| Rate limiting | ✅ Done | In-memory (will move to Redis for production) |
| Dispatch Worker | ✅ Done | `/packages/dispatch-worker/` - Routes to user Workers |
| Hostname mapping (KV) | ✅ Done | KV bindings in dispatch worker |
| Easy Mode deployment | ✅ Done | `InhouseDeploymentService.ts` + routes |
| Project creation flow | ✅ Done | `InhouseProjectService.ts` + routes |
| Easy Mode build pipeline integration | ✅ Done | `/api/projects` triggers AI build; build worker deploys via in-house hosting |
| Easy Mode static worker fallback | ✅ Done | User Workers bind R2 + PROJECT_BUILDS for static asset routing |

### Implementation Discoveries

#### 2026-01-12: Codebase Analysis

**Existing Patterns to Leverage**:
1. **DbCtx pattern** (`/src/lib/db/context.ts`) - Already supports user/admin modes, perfect foundation
2. **Repository pattern** (`/src/lib/server/repositories/`) - Will extend for in-house operations
3. **Worker auth** (`/src/utils/worker-auth.ts`) - HMAC dual-signature for gateway auth
4. **Integration registry** (`project_integrations` table) - Can track in-house vs external mode

**Key Architecture Decisions Made**:
- Will use existing `project_integrations` table to track in-house mode status
- API Gateway will be a new service in `sheenapps-claude-worker`
- SDK packages will live in a new `/packages/` directory at monorepo root

#### 2026-01-12: Implementation Progress

**Files Created**:
1. **Database Migration**: `/sheenappsai/supabase/migrations/20260112_inhouse_mode_infrastructure.sql`
   - Added `infra_mode` enum and column to projects table
   - Created 8 new tables for in-house infrastructure
   - RLS policies for all tables
   - Helper functions for subdomain/schema generation

2. **TypeScript Types**: `/sheenappsai/src/types/inhouse.ts`
   - Query contract types
   - Database table types
   - Tier limits configuration
   - Runtime limits constants

3. **API Gateway Service**: `/sheenapps-claude-worker/src/services/inhouse/InhouseGatewayService.ts`
   - API key validation with SHA-256 hashing
   - Table/column metadata caching

#### 2026-01-15: Easy Mode Build Pipeline Integration

**Updates**:
1. Easy Mode project creation now triggers AI build pipeline via `/v1/create-preview-for-new-project`
2. Build worker routes Easy Mode deployments to in-house hosting (R2 + dispatch namespace)
3. User Workers bind `PROJECT_BUILDS` + `ASSETS` for static asset fallback
   - Query contract validation
   - Parameterized SQL generation (no SQL injection!)
   - Rate limiting (in-memory, will upgrade to Redis)
   - Quota checking
   - Request logging

4. **API Gateway Routes**: `/sheenapps-claude-worker/src/routes/inhouseGateway.ts`
   - POST `/v1/inhouse/db/query` - Execute queries
   - GET `/v1/inhouse/db/schema` - Get schema metadata
   - GET `/v1/inhouse/db/health` - Health check

5. **@sheenapps/db SDK**: `/packages/db/`
   - Supabase-like fluent API
   - Full TypeScript support with generics
   - All filter operators (eq, neq, gt, gte, lt, lte, like, ilike, in, is, contains, etc.)
   - Insert/update/delete support
   - Pagination with limit/offset/range

### Improvement Ideas

_Space for future improvements discovered during implementation_

1. **Rate Limiting**: Currently in-memory. Should move to Redis for multi-instance support.
2. **Query Caching**: Consider adding query result caching with configurable TTL.
3. **Batch Queries**: `/v1/inhouse/db/batch` endpoint for multiple operations in one request.
4. **Real-time Subscriptions**: WebSocket support for live data updates (Phase 2+).
5. **Schema Migrations**: Automatic schema migration tool for Easy Mode projects.

---

### Phase 1 Implementation Complete

**Date**: 2026-01-12

**Summary**: All Phase 1 infrastructure components have been implemented. The codebase now supports Easy Mode projects with:

1. **Database Infrastructure**
   - New `infra_mode` column on projects table (`easy` vs `pro`)
   - 8 new tables for in-house infrastructure tracking
   - Schema-per-tenant isolation model
   - Automatic subdomain and schema name generation

2. **API Gateway** (Security Boundary)
   - API key authentication with SHA-256 hashing
   - Query contract validation (no raw SQL!)
   - Table/column allowlist enforcement
   - Rate limiting (100 req/min default)
   - Quota tracking per project
   - Request logging for analytics

3. **@sheenapps/db SDK**
   - Supabase-like fluent API
   - Full TypeScript support
   - All filter operators (eq, neq, gt, gte, lt, lte, like, ilike, in, is, contains, containedBy, overlaps)
   - Insert/update/delete operations
   - Pagination with limit/offset/range

4. **Cloudflare Dispatch Worker**
   - Routes *.sheenapps.com requests
   - Serves static assets from R2
   - Dispatches dynamic requests to user Workers
   - Hostname → project mapping via KV

5. **Deployment Service**
   - Upload static assets to R2
   - Deploy Workers to dispatch namespace
   - Update KV hostname/build mappings
   - Rollback support

6. **Project Service**
   - Create Easy Mode projects
   - Generate/revoke API keys
   - Create tables in project schemas
   - Track quotas

**Files Created** (in addition to those listed above):
- `/sheenapps-claude-worker/src/services/inhouse/InhouseProjectService.ts`
- `/sheenapps-claude-worker/src/routes/inhouseProjects.ts`
- `/sheenapps-claude-worker/src/routes/inhouseDeployment.ts`
- `/packages/dispatch-worker/` (full Cloudflare Worker package)

**Next Steps** (Phase 2):
1. Wire up routes in worker server.ts ✅
2. Create UI components for Easy Mode project creation ✅
3. Integrate build pipeline with in-house deployment ✅
4. Add email/password auth (InhouseAuthService) ✅
5. Add basic CMS (InhouseCmsService) ✅ (admin routes + dashboard UI)
6. Auth UI kit for end-user apps ✅

---

### Expert Review Fixes (2026-01-12)

Applied fixes from expert code review in `20260112_inhouse_mode_fixes.sql`:

**P0 - Critical Fixes:**
1. **RLS USING vs WITH CHECK** - FOR ALL policies only had USING, missing WITH CHECK for INSERT/UPDATE. Fixed with separate INSERT/UPDATE/DELETE policies with proper WITH CHECK clauses.

2. **Request log FKs** - Added FK constraints to `inhouse_request_log` for project_id and api_key_id. Removed misleading "partitioned" comment.

3. **Redundant quota columns** - Removed `inhouse_quota_*` columns from projects table. `inhouse_quotas` table is the single source of truth.

**P1 - Important Fixes:**
4. **Easy/Pro field constraints** - Added constraints to ensure:
   - Easy mode projects MUST have subdomain + schema_name
   - Pro mode projects must NOT have inhouse-specific fields

5. **Empty subdomain fallback** - Fixed `generate_inhouse_subdomain()` to handle names that normalize to empty string (emojis, special chars only). Now falls back to `project-{short_id}`.

6. **API key prefix uniqueness** - Changed from global unique to per-project unique (safer at scale). Added global unique constraint on key_hash.

**Design Fixes:**
7. **updated_at triggers** - Added triggers to maintain updated_at on all relevant tables.

8. **Pro→Easy transition** - Updated infra_mode change trigger to clear inhouse fields when switching to pro mode.

**Lessons Learned:**
- PostgreSQL RLS: `USING` = row visibility for SELECT/UPDATE/DELETE existing rows. `WITH CHECK` = validation for INSERT and UPDATE new values. FOR ALL without WITH CHECK can behave unexpectedly.
- Don't claim features you haven't built (partitioning).
- Two sources of truth = eventual bugs. Pick one canonical location.
- Edge cases in string normalization (empty result) will find you in production.

---

### P0 Security Fixes (2026-01-12)

Applied critical security fixes from second expert review:

**1. Deployment ID Type Mismatch** - `20260112_inhouse_mode_fixes_p0.sql`
- **Issue**: Service generates readable IDs like `dpl_xxx` but DB column was UUID type
- **Fix**: Changed `inhouse_deployments.id` from UUID to VARCHAR(64)

**2. R2 Upload Auth** - `InhouseDeploymentService.ts`
- **Issue**: Used Bearer token with S3-compatible API (requires SigV4 signing)
- **Fix**: Switched to Cloudflare's direct REST API which supports Bearer tokens
- **Bonus**: Added batch uploads with concurrency limit (10 parallel)

**3. SQL Injection in createTable()** - `InhouseProjectService.ts`
- **Issue**: Table names, column names, types, and defaults were interpolated directly into SQL
- **Fix**: Added comprehensive validation:
  - `validateIdentifier()`: PostgreSQL identifier regex + reserved word check
  - `validateColumnType()`: Allowlist of safe types (integer, text, varchar, etc.)
  - `validateColumnDefault()`: Pattern matching for safe defaults only (NULL, booleans, numbers, quoted strings, NOW(), gen_random_uuid())

**4. Gateway Validation Expansion** - `InhouseGatewayService.ts`
- **Issue**: Only validated SELECT columns and filter columns
- **Fix**: Now validates ALL column references:
  - SELECT columns (with read permission check)
  - Filter columns
  - Sort columns
  - RETURNING columns (with read permission check)
  - INSERT data keys (with write permission check)
  - UPDATE set keys (with write permission check)
- Added `canReadColumn()` and `canWriteColumn()` helpers for column-level permissions

**5. Filterless UPDATE/DELETE Prevention** - `InhouseGatewayService.ts`
- **Issue**: Empty filters would allow "UPDATE all rows" or "DELETE all rows"
- **Fix**: Added check requiring at least one filter for UPDATE/DELETE operations
- New error code: `FILTERLESS_MUTATION`

**Security Lessons Learned:**
- S3-compatible APIs always need SigV4 - Bearer tokens don't work there
- SQL injection via DDL (CREATE TABLE) is different from DML - need identifier validation + type allowlists
- "Validate columns" means validate ALL column references, not just the obvious ones
- Filterless mutations are dangerous defaults - require explicit filters

**P1 Fixes Also Applied:**
- **crypto.randomUUID() import** - Added `randomUUID` to imports, changed `crypto.randomUUID()` to `randomUUID()`
- **Misleading docstring** - Updated gateway docstring to accurately describe schema-per-project isolation (not project_id injection)

**P1/P2 Items - Additional Fixes Implemented:**

**8. Quotas Fail Closed** - `InhouseGatewayService.ts:checkQuotas()`
- **Issue**: On DB error, was returning "within limits" (fail open)
- **Fix**: Now returns `withinLimits: false` with a violation on DB error
- **Security**: Prevents abuse if database is temporarily unavailable

**9. Quota Counter Reset** - `InhouseGatewayService.ts:checkQuotas()`
- **Issue**: `requests_used_today` incremented forever, no reset logic
- **Fix**: Atomic reset when `requests_reset_at < NOW()`:
  ```sql
  UPDATE inhouse_quotas
  SET requests_used_today = 0,
      bandwidth_used_bytes = 0,
      requests_reset_at = NOW() + INTERVAL '1 day'
  WHERE project_id = $1
    AND (requests_reset_at IS NULL OR requests_reset_at < NOW())
  ```
- **Benefit**: No cron job needed - reset happens inline on first request after midnight

**11. Request Size DoS Protection** - `inhouseDeployment.ts`
- **Issue**: Deploy endpoint accepted unlimited payload sizes
- **Fix**: Added comprehensive limits:
  | Limit | Value | Purpose |
  |-------|-------|---------|
  | `DEPLOY_BODY_LIMIT_BYTES` | 150MB | Raw HTTP body limit |
  | `MAX_ASSETS_COUNT` | 2000 | Prevent file count bombs |
  | `MAX_ASSET_SIZE_BYTES` | 10MB | Per-file limit |
  | `MAX_TOTAL_DEPLOYMENT_BYTES` | 100MB | Total decoded size |
  | `MAX_SERVER_BUNDLE_BYTES` | 5MB | SSR bundle limit |
- **Validation**: Returns specific error codes (`TOO_MANY_ASSETS`, `ASSET_TOO_LARGE`, `DEPLOYMENT_TOO_LARGE`, `SERVER_BUNDLE_TOO_LARGE`)

**Remaining Deferred Items:**
| Priority | Issue | Status | Notes |
|----------|-------|--------|-------|
| P1 | Rate limiting memory leak | ✅ Fixed | TTL cleanup added; Redis for horizontal scaling documented in `HORIZONTAL_SCALING_NOTES.md` |
| P2 | KV mapping not checked | ✅ Fixed | See Third Expert Review Fixes below |

**API Response Pattern Decision (P2 #13):**

The expert noted "inconsistent API responses" - but this is actually a **deliberate design decision**:

| Route Type | Pattern | Consumers | Rationale |
|------------|---------|-----------|-----------|
| Gateway (`/v1/inhouse/db/*`) | Supabase-style: `{data, error, status}` | External SDK (`@sheenapps/db`) | Matches Supabase SDK ergonomics that users expect |
| Internal (`/v1/inhouse/projects/*`, `/v1/inhouse/deploy/*`) | Platform-style: `{ok, data, error}` | SheenApps platform (HMAC-protected) | Explicit boolean, cleaner than legacy `{success, error}` |

The SDK only hits gateway routes, so SDK ergonomics are consistent. Internal routes use a cleaner pattern than the legacy `{success, error}` found elsewhere in the codebase.

---

### Third Expert Review Fixes (2026-01-12)

Applied critical security fixes from third expert review:

**1. SELECT */RETURNING * Column Leakage** - `InhouseGatewayService.ts`
- **Issue**: `SELECT *` and `RETURNING *` would return all columns including sensitive ones
- **Fix**: Added column resolution that expands `*` to only readable columns:
  ```typescript
  function resolveSelectColumns(columns, tableMeta, apiKeyType) {
    const readableColumns = getReadableColumnNames(tableMeta, apiKeyType)
    if (!columns || columns.includes('*')) {
      return readableColumns  // Expand to safe columns only
    }
    return columns
  }
  ```
- **Applied to**: SELECT columns, INSERT/UPDATE/DELETE RETURNING columns
- **Security**: Public keys now cannot see `isSensitive=true` or `allowClientRead=false` columns

**2. Filter/Sort Inference Attack Prevention** - `InhouseGatewayService.ts:validateQuery()`
- **Issue**: Filtering/sorting by sensitive columns could reveal values through result presence
- **Fix**: Added read permission checks for filter and sort columns:
  ```typescript
  // For each filter column:
  if (!canReadColumn(colMeta, ctx.apiKeyType)) {
    return createError(
      'SENSITIVE_COLUMN_ACCESS',
      `Column '${filter.column}' cannot be used in filters with this API key`,
      'Filtering by sensitive columns could reveal their values'
    )
  }
  ```
- **Attack prevented**: Binary search via filters like `WHERE ssn > '500-00-0000'`

**3. `is` Operator SQL Injection** - `InhouseGatewayService.ts:generateSQL()`
- **Issue**: Values other than null/true/false fell through to invalid SQL: `col IS $1`
- **Fix**: Throw error for invalid values:
  ```typescript
  case 'is':
    if (f.value === null) return `${col} IS NULL`
    else if (f.value === true) return `${col} IS TRUE`
    else if (f.value === false) return `${col} IS FALSE`
    throw new Error(`Invalid value for 'is' operator: only null, true, or false are allowed`)
  ```

**4. statement_timeout for Runaway Query Cancellation** - `InhouseGatewayService.ts:executeQuery()`
- **Issue**: `Promise.race()` with timeout doesn't actually cancel the database query
- **Fix**: Use PostgreSQL's `SET LOCAL statement_timeout`:
  ```typescript
  const result = await db.query(
    `SET LOCAL statement_timeout = '${timeoutMs}ms'; ${sql}`,
    params
  )
  ```
- **Benefit**: Query is actually cancelled server-side, not just abandoned client-side

**5. KV Mapping Failure Handling** - `InhouseDeploymentService.ts`
- **Issue**: KV write return values were ignored; deployment marked successful even if site unreachable
- **Fix**: Check return values and fail deployment if KV writes fail:
  ```typescript
  const [hostnameSuccess, buildSuccess] = await Promise.all([
    updateHostnameMapping(...),
    updateBuildMapping(...),
  ])
  if (!hostnameSuccess) {
    throw new Error('Failed to update hostname mapping - site will not be reachable')
  }
  if (!buildSuccess) {
    throw new Error('Failed to update build mapping - site will serve wrong build')
  }
  ```
- **Also applied to**: Rollback operation

**Security Summary:**

| Vulnerability | Attack Vector | Fix |
|--------------|---------------|-----|
| Sensitive data leakage | `SELECT * FROM users` returns password hashes | Expand `*` to readable columns only |
| Inference attack | `WHERE ssn LIKE '123%'` reveals SSN prefix | Check read permissions on filter columns |
| Invalid SQL | `.is('col', 'arbitrary')` | Throw for values other than null/true/false |
| Resource exhaustion | Slow query runs forever | `statement_timeout` actually cancels query |
| Silent deployment failure | KV write fails but deployment "succeeds" | Fail deployment on KV errors |

**Remaining Items:**
| Priority | Issue | Status | Notes |
|----------|-------|--------|-------|
| P1 | Rate limiting memory leak | ✅ Fixed | Added TTL cleanup; Redis deferred to horizontal scaling. See `HORIZONTAL_SCALING_NOTES.md` |

---

### Fourth Expert Review Fixes (2026-01-12)

Applied critical correctness and security fixes from fourth expert review:

**1. SSR Rollback Broken with Worker Bindings** - `InhouseDeploymentService.ts:157-206`
- **Issue**: `BUILD_ID` was baked into Worker bindings at deploy time. Rollback only updated KV, so Worker kept serving old build.
- **Fix**: Removed `BUILD_ID` from bindings. Workers now read current buildId from KV namespace (`PROJECT_BUILDS`) on each request.
- **Benefit**: Instant rollback via KV update - no Worker redeploy needed.

**2. statement_timeout Not Working** - `InhouseGatewayService.ts:1002-1014`
- **Issue**: `SET LOCAL statement_timeout` only works inside a transaction block. Without transaction, it's ignored.
- **Fix**: Wrapped query execution in proper transaction: `BEGIN`, `SET LOCAL`, execute, `COMMIT/ROLLBACK`.
- **Result**: Runaway queries are now actually cancelled server-side.

**3. Schema Endpoint Leaking Sensitive Column Metadata** - `inhouseGateway.ts:237-255`
- **Issue**: Public keys could see names/types of sensitive columns (just not query them). Information leakage.
- **Fix**: Added `canReadColumn()` filter. Public keys now only see columns they can actually read.
- **Before**: Public key sees `password_hash` column exists
- **After**: Public key doesn't know `password_hash` column exists

**4. Byte Accounting Bug** - `InhouseDeploymentService.ts:356-368`
- **Issue**: Conditional was identical both sides (`a.content.length` twice), and `string.length` ≠ bytes.
- **Fix**: Use `Buffer.byteLength(str, 'utf8')` for strings, `.length` for Buffers.

**5. Asset Path Validation** - `inhouseDeployment.ts:47-102`
- **Issue**: `asset.path` was trusted directly. Missing `/`, `..`, backslashes, control chars could cause issues.
- **Fix**: Added `validateAssetPath()` function enforcing:
  - Must start with `/`
  - No `..` (path traversal)
  - No backslashes
  - No null bytes or control characters
  - No double slashes
  - Max 500 chars

**6. tableMetadataCache Memory Growth** - `InhouseGatewayService.ts:166-179`
- **Issue**: Like rate limiting, expired entries were never actively cleaned up.
- **Fix**: Added `cleanupStaleMetadataCacheEntries()` running every 5 minutes.

**Security Summary (Fourth Review):**

| Issue | Attack/Bug | Fix |
|-------|------------|-----|
| Rollback broken | SSR serves old build after rollback | Worker reads buildId from KV, not binding |
| statement_timeout ignored | Queries run forever | Wrap in transaction for SET LOCAL to work |
| Column metadata leak | Public keys learn sensitive column names | Filter columns by `canReadColumn()` |
| Byte accounting | Wrong storage stats in DB | Use `Buffer.byteLength()` for strings |
| Path traversal | `..` in asset paths | Validate/reject unsafe paths |
| Memory growth | Cache grows unbounded | Periodic cleanup for tableMetadataCache |

**Should-Fix Items (Deferred):**
| Priority | Issue | Status | Notes |
|----------|-------|--------|-------|
| P2 | Base64 validation | ✅ Fixed | Added pre-decode size estimate + contentType validation |
| P2 | HMAC replay resistance | Needs audit | Check if middleware has timestamp/nonce |
| P3 | Deployment size naming | Cosmetic | `MAX_TOTAL_DEPLOYMENT_BYTES` only counts static assets |

---

### Fifth Expert Review Fixes (2026-01-12)

Applied correctness and security fixes from fifth expert review:

**1. Nullable Logic Inconsistent (Bug)** - `InhouseProjectService.ts:332-389`
- **Issue**: SQL defaulted to NOT NULL when nullable undefined, but metadata defaulted to nullable
- **Fix**: Normalize columns once at start, use same values for both SQL and metadata:
  ```typescript
  const normalizedColumns = input.columns.map(col => ({
    nullable: col.nullable ?? true, // Explicit default
    type: validatedType,  // Use validated type, not raw col.type
    ...
  }))
  ```

**2. KV Keys Not URL-Encoded** - `InhouseDeploymentService.ts:264-310`
- **Issue**: Hostname/projectId used directly in URL path could break or be exploited
- **Fix**: `encodeURIComponent(hostname)` and `encodeURIComponent(projectId)` for all KV paths

**3. Quotas Fail Open** - `InhouseGatewayService.ts:1072-1095`
- **Issue**: Quota increment was inside fire-and-forget `logRequest()` - could fail silently
- **Fix**: Separated `incrementRequestQuota()` as awaited operation, logging remains fire-and-forget:
  ```typescript
  // Reliable
  await incrementRequestQuota(ctx.projectId)
  // Fire and forget
  logRequest(ctx, query, 200, durationMs).catch(() => {})
  ```

**4. Env Binding Collisions** - `InhouseDeploymentService.ts:164-187`
- **Issue**: User env vars could override reserved bindings (`PROJECT_ID`, `PROJECT_BUILDS`)
- **Fix**: Validate against reserved names + enforce naming pattern:
  ```typescript
  const RESERVED_BINDING_NAMES = new Set(['PROJECT_ID', 'PROJECT_BUILDS', 'BUILD_ID'])
  const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/
  ```

**5. Base64 Memory/CPU Attack** - `inhouseDeployment.ts:212-234`
- **Issue**: Decoding allocates buffers before size validation
- **Fix**: Pre-decode size estimate + contentType validation:
  ```typescript
  // Reject before allocating buffer
  const estimatedSize = Math.ceil((asset.content.length * 3) / 4)
  if (estimatedSize > MAX_ASSET_SIZE_BYTES) return error

  // Validate contentType
  if (contentType.length > 255 || /[\x00-\x1f]/.test(contentType)) return error
  ```

**Security Summary (Fifth Review):**

| Issue | Bug/Attack | Fix |
|-------|------------|-----|
| Nullable mismatch | DB/metadata disagree on nullability | Normalize once, use everywhere |
| KV path injection | Special chars in keys break paths | URL-encode all KV keys |
| Quota bypass | Fire-and-forget fails silently | Separate awaited quota increment |
| Binding collision | Override PROJECT_ID via env vars | Block reserved names + validate pattern |
| Memory exhaustion | Decode large base64 before validation | Pre-decode size estimate |

**Remaining Items:**
| Priority | Issue | Status | Notes |
|----------|-------|--------|-------|
| P2 | HMAC replay resistance | Needs audit | Check if middleware has timestamp/nonce |
| P3 | `in` operator type casting | Edge case | May need explicit array cast for Postgres |
| P3 | userId from request body | Acceptable | Routes are HMAC-protected |
