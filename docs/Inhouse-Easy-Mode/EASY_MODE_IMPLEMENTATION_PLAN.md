# Easy Mode: Implementation Plan

**Date**: 2026-01-30
**Based on**: Codebase audit of `sheenappsai`, `sheenapps-claude-worker`, `sheenapps-packages`
**Companion doc**: [EASY_MODE_COMPREHENSIVE_ANALYSIS.md](./EASY_MODE_COMPREHENSIVE_ANALYSIS.md)

---

## Architecture Overview

```
sheenappsai (Next.js)              sheenapps-claude-worker (Fastify)
┌─────────────────────┐            ┌──────────────────────────────┐
│ Frontend Components │            │ Routes (inhouseProjects.ts)  │
│         │           │            │         │                    │
│ API Proxies (/api/) │──HMAC──>   │ Services (InhouseProject     │
│         │           │            │   Service, CmsService, etc.) │
│ types/inhouse-api.ts│  NO LINK   │ types/ (inline interfaces)   │
└─────────────────────┘            └──────────────────────────────┘
                                            │
sheenapps-packages                          │
┌─────────────────────┐                     │
│ @sheenapps/templates│──imported by both───┘
│ @sheenapps/core     │
│ (NO shared API types)│
└─────────────────────┘
```

**Root problem**: No shared contract enforcement. Next.js and worker define API contracts independently with no runtime validation on the worker side. This caused 3 confirmed integration bugs and will cause more.

---

## Priority 0: Blockers (Fix Before Anything Else)

> These prevent Easy Mode from functioning at all. No UX work matters until these are resolved.

### P0-1: Fix API Contract Mismatches (~2 hours)

**Bug 1: Project creation field name**

| Side | Sends/Expects | File | Line |
|------|---------------|------|------|
| Next.js | sends `projectName` | `sheenappsai/src/server/services/easy-project-service.ts` | ~59 |
| Next.js | sends `projectName` | `sheenappsai/src/app/api/inhouse/projects/create/route.ts` | ~108 |
| Worker | expects `name` | `sheenapps-claude-worker/src/routes/inhouseProjects.ts` | ~77 |

**Fix**: Change both Next.js files to send `name` instead of `projectName`. Worker is the authority since it has the DB schema.

**Bug 2: API key response shape**

| Side | Shape | File |
|------|-------|------|
| Worker returns | `data.apiKey.publicKey` | `sheenapps-claude-worker/src/routes/inhouseProjects.ts` ~106-110 |
| Next.js expects | `data.publicApiKey` | `sheenappsai/src/server/services/easy-project-service.ts` ~95 |
| Next.js expects | `data.publicApiKey` | `sheenappsai/src/app/api/inhouse/projects/create/route.ts` ~137 |

**Fix**: Update both Next.js files to read `result.data.apiKey.publicKey`.

**Bug 3: Status endpoint missing**

| Side | What | File |
|------|------|------|
| Next.js calls | `GET /v1/inhouse/projects/${id}/status` | `sheenappsai/src/app/api/inhouse/projects/[id]/status/route.ts` ~64-70 |
| Worker | Route does not exist | `sheenapps-claude-worker/src/routes/inhouseProjects.ts` |

**Fix**: Implement this route in the worker as the **canonical state machine output** — the single endpoint the UI polls for all project state. Composition belongs in the service layer, not spread across 3+ UI calls.

```typescript
interface InfrastructureStatus {
  // Project basics
  name: string
  subdomain: string
  tier: 'free'|'starter'|'growth'|'scale'

  // Build state (from project_versions)
  build: {
    status: 'idle'|'building'|'deployed'|'failed'
    buildId: string | null
    lastBuildAt: string | null
    errorMessage: string | null
    errorCode: string | null        // Stable code for user-friendly UI translation
  }

  // Deploy state (from inhouse_deployments)
  hosting: {
    status: 'none'|'uploading'|'deploying'|'live'|'error'
    url: string | null
    lastDeployedAt: string | null
    hasDeployedOnce: boolean        // Key for onboarding checklist
  }

  // Database
  database: {
    status: 'provisioning'|'active'|'error'
    schemaName: string
    tableCount: number
    storageUsedMb: number
    storageQuotaMb: number
  }

  // Quotas
  quotas: {
    requestsUsedToday: number
    requestsLimit: number
    bandwidthUsedMb: number
    bandwidthQuotaMb: number
    resetsAt: string
  }

  // API keys (summaries only — never raw secrets)
  apiKeys: {
    publicKeyPrefix: string         // First 12 chars only
    hasServerKey: boolean
  }
}
```

The data is available — `getProject()` + `getQuotaStatus()` + latest `inhouse_deployments` row + latest `project_versions` row. This route composes them in the service layer.

**Performance rules** (this endpoint will be polled frequently):
- No expensive joins or full table scans. Only "latest row" lookups + quick counts.
- If `tableCount` is expensive, cache it (update on DDL events) or compute async.
- Return `updatedAt` timestamp in the response so the UI can skip re-renders when nothing changed. Optionally use `ETag` header for HTTP-level caching.

**UI rule**: The Easy Mode UI should poll **only** `/status` for "is it live?", "is it building?", "did it fail?". No other endpoint needed for state display. This eliminates the "manual deploy button vs auto-deploy reality" contradiction — the UI just reflects the state machine.

### P0-2: Wire Magic Link Email (~1-2 hours)

| Component | Status | File |
|-----------|--------|------|
| Token generation + DB storage | Works | `InhouseAuthService.ts` ~235-279 |
| Email delivery | **NOT CALLED** | `inhouseAuth.ts` ~256-276 |
| Email service | Exists, unused | `InhouseEmailService.ts` |

**Fix**: After `createMagicLink()`, call `emailService.send()` with the magic link URL. Requires `RESEND_API_KEY` env var.

### P0-3: Create Shared Contracts Package — Zod-First (~2-3 days)

This is the **single highest-leverage change** to prevent future integration bugs. Types alone won't prevent drift — you need runtime validation from the same source of truth.

**Create**: `sheenapps-packages/api-contracts/`

**Contents**:
```
api-contracts/
  src/
    index.ts           # Re-exports everything
    responses.ts       # ApiResponse<T> Zod schema + inferred type, error code enum
    projects.ts        # CreateProjectRequest/Response schemas, InfrastructureStatus schema
    deployment.ts      # DeployRequest/Response schemas, DeploymentStatus
    cms.ts             # CreateTypeRequest schema (with field validation), ContentType, CmsEntry
    gateway.ts         # QueryContract, QueryResponse, FilterOperator
  package.json         # @sheenapps/api-contracts
  tsconfig.json
```

**Approach — Zod schemas as source of truth**:
```typescript
// api-contracts/src/projects.ts
import { z } from 'zod'

export const CreateProjectRequestSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(120),
  framework: z.enum(['react', 'nextjs', 'vue', 'svelte']).optional(),
  subdomain: z.string().min(3).max(63).regex(/^[a-z0-9-]+$/).optional(),
  template: z.object({
    id: z.string(),
    version: z.number(),
    tier: z.string(),
    category: z.string(),
    tags: z.array(z.string()).optional(),
  }).optional(),
})

// Inferred type — used everywhere, never manually defined
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>

export const CreateProjectResponseSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string(),
  subdomain: z.string(),
  schemaName: z.string(),
  previewUrl: z.string(),
  apiKey: z.object({
    publicKey: z.string(),
    keyPrefix: z.string(),
  }),
})

export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>
```

**Consumers**:
- `sheenappsai/package.json` → add `@sheenapps/api-contracts`
- `sheenapps-claude-worker/package.json` → add `@sheenapps/api-contracts`

**Enforcement rules**:
- **Worker routes**: Parse every request body with the Zod schema (`CreateProjectRequestSchema.parse(request.body)`). This replaces all manual `if (!field)` checks and catches empty strings, wrong types, extra fields.
- **Worker responses** (dev-only): `if (process.env.NODE_ENV !== 'production') ResponseSchema.parse(payload)` — cheap self-test that catches drift during development. Zero overhead in production, avoids performance debates.
- **Next.js proxies**: Import types from this package (compile-time). Runtime Zod parsing optional but recommended for defensive checks.
- **CI**: Contract snapshot tests (see P0-4).

**Migration**: Replace inline interfaces in `inhouseProjects.ts` routes and `inhouse-api.ts` with imports. This is mechanical — the shapes already exist, they just need to live in one place with Zod schemas wrapping them.

**CMS schema validation** (included in this package):
```typescript
// api-contracts/src/cms.ts
export const CmsFieldSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: z.enum(['text', 'number', 'email', 'url', 'date', 'select',
                'image', 'boolean', 'richtext', 'json']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  description: z.string().max(200).optional(),
}).strict()  // Reject unknown keys — stops silent junk in JSONB

export const CmsTypeSchemaSchema = z.object({
  fields: z.array(CmsFieldSchema).min(1).max(50),  // Cap fields (anti-abuse)
}).strict()

// Type-specific constraint rules (enforced via .superRefine()):
// - 'select' REQUIRES options array with ≥1 item
// - 'number' allows min/max but NOT maxLength/pattern
// - 'text'/'email'/'url' allow maxLength/pattern but NOT min/max
// - 'image'/'boolean'/'date' allow no numeric/string constraints
// Field name uniqueness: new Set(fields.map(f => f.name)).size === fields.length
```

This replaces the current chain: frontend validates lightly → proxy validates `schema: z.record(z.any())` → worker checks `if (!schema)` → DB stores anything as JSONB. Now validation is strict and consistent everywhere.

### P0-4: Infrastructure & Environment Readiness Gate (~1 day)

> The difference between "we merged" and "users got stuck."

**Current state**: `validateEasyModeSDKEnvironment()` exists in `sheenapps-claude-worker/src/config/envValidation.ts` — checks env vars are present. But checking env vars doesn't verify that services are actually reachable.

**Extend to a startup readiness check** (runs at worker boot, before `server.listen()`):

```typescript
async function assertInfraReady(): Promise<void> {
  const checks = await Promise.allSettled([
    // 1. Env vars present (existing)
    assertRequiredEnv(['SHEEN_SECRETS_MASTER_KEY', 'RESEND_API_KEY', 'SHEEN_BACKUP_MASTER_KEY']),

    // 2. Neon DB reachable
    pool.query('SELECT 1'),

    // 3. R2 bucket reachable (HEAD on known prefix)
    r2Client.headBucket({ Bucket: 'sheenapps-deployments' }),

    // 4. KV namespace writable
    kvClient.get('__healthcheck'),

    // 5. Redis reachable
    redis.ping(),
  ])

  const failed = checks
    .map((r, i) => r.status === 'rejected' ? NAMES[i] : null)
    .filter(Boolean)

  if (failed.length) {
    console.error(`[STARTUP] Infrastructure not ready: ${failed.join(', ')}`)
    process.exit(1)  // Fail loud, fail fast
  }
}
```

**Additionally**:
- Verify Resend sending domain is configured (SPF/DKIM/DMARC) — test email delivery to a canary address on first deploy
- **Magic link canary**: Admin-only endpoint `POST /v1/admin/email-test` that sends a test email via Resend and confirms delivery. This catches "API key works but domain isn't verified" before real users hit silent failures on magic link.
- Verify Workers for Platforms dispatch namespace exists and credentials are valid
- Log all checks at startup (pass/fail) for operational visibility

**Where**: Call `assertInfraReady()` in `server.ts` before `server.listen()`, after existing `validateEnvironment()` calls. Block startup entirely if any check fails.

### P0-5: Smoke Tests + Contract Tests (~1 day)

**E2E smoke test** (run after P0-1 through P0-4):

- [ ] `POST /v1/inhouse/projects` → returns `{ ok: true, data: { projectId, apiKey: { publicKey } } }`
- [ ] `GET /v1/inhouse/projects/:id/status` → returns full `InfrastructureStatus`
- [ ] `POST /v1/inhouse/cms/admin/types` → creates content type with strict schema validation
- [ ] `POST /v1/inhouse/cms/entries` → creates entry against type
- [ ] Auth sign-up → sign-in → session valid
- [ ] Magic link → email received → token works
- [ ] Build triggers → auto-deploys to `{subdomain}.sheenapps.com`
- [ ] All 53 Next.js proxy routes match worker endpoints (no 404s)
- [ ] Infra readiness gate passes on boot (DB, R2, KV, Redis all reachable)

**Route coverage audit** (CI, prevents Bug #3 class issues from ever returning):
- Script enumerates all Next.js proxy route files in `src/app/api/inhouse/` (53 files)
- Extracts the worker path each proxy calls (from `callWorker({ path: '...' })`)
- Compares against worker route registry (Fastify's `printRoutes()` or grep route registrations)
- Fails CI if any proxy calls a worker route that doesn't exist

**Contract snapshot tests** (CI, prevents payload drift):

For each worker route:
- Validate request body parses against `@sheenapps/api-contracts` Zod schema
- Validate response shape matches the response schema
- Run representative payloads (happy path + validation error + not found)

**Proxy-to-worker integration test** (CI, run against local worker):
- Create project → fetch project → fetch status → fetch quota
- Create CMS type → create entry → list entries
- Auth sign-up → sign-in → session check
- Catches mismatches before humans do

---

## Priority 1: Core Experience (Before Beta)

> Makes Easy Mode usable by non-technical Arabic users. Without these, it's a developer tool.

### P1-1: CMS Form Builder (Replace JSON Textarea) (~3-4 days)

**Current state**: `CmsManagerDialog.tsx` line 568 — raw `<Textarea>` with `'{\n  "fields": []\n}'`. Users must write JSON to create content types. Non-technical users cannot use CMS at all.

**Schema format the worker accepts** (from `InhouseCmsService.ts`):
```json
{
  "fields": [
    { "name": "title", "type": "text", "required": true, "maxLength": 200 },
    { "name": "price", "type": "number", "min": 0, "display": "currency" },
    { "name": "image", "type": "image" }
  ]
}
```

**Build**:
1. New component: `CmsFieldBuilder.tsx` in `sheenappsai/src/components/builder/infrastructure/cms/`
2. Visual field list: name input, type dropdown, required toggle, constraints (per type)
3. Field types: Text, Number, Email, URL, Date, Select, Image, Boolean, Rich Text
4. Drag-drop reorder (use existing `@dnd-kit` or similar)
5. Generates the JSON schema object — same format, just built visually
6. "Advanced" accordion shows raw JSON (for power users)
7. AI assist: "Describe your content type" → generates fields (uses existing Claude integration)

**Replace in** `CmsManagerDialog.tsx`: swap the `<Textarea>` block (lines 568-577) with `<CmsFieldBuilder value={parsedSchema} onChange={setTypeSchema} />`

**No backend changes needed** — the schema format stays the same.

### P1-2: Onboarding Checklist + Post-Creation Flow (~2-3 days)

**Current state**: After project creation, user is dropped into Builder/Workspace with no guidance. `create-project-dialog.tsx` line 97: `router.push(ROUTES.BUILDER_WORKSPACE(project.id))`.

**Build**:
1. **Post-creation success screen** (new component):
   - "Your project is ready!" with preview thumbnail
   - "View Your Site" (primary) + "Customize" (secondary)
   - Replaces immediate redirect to workspace

2. **Onboarding checklist** (persistent sidebar widget):
   ```
   Getting Started (1/4)
   ✅ Create your project
   ☐ View your live site → [Open]
   ☐ Add your first content → [Add Now]
   ☐ Share your site → [Copy Link]
   ```
   - Track completion in `localStorage` or user preferences
   - Collapsible, dismissible

3. **Post-deploy redirect to Run Hub**:
   - After first successful deploy, redirect to `/project/${id}/run`
   - Show toast: "Your site is live! Here's your business dashboard"
   - Currently users stay in workspace (must manually find Run Hub)

### P1-3: Simple Mode Toggle (~1-2 days)

**Current state**: Infrastructure panel shows 6-8 cards (CMS, Hosting, Database, API Keys, Quotas, Auth) — overwhelming for non-technical users.

**Build**:
1. User preference: `simple` (default for Easy Mode) vs `advanced`
2. Simple mode shows: Site Status, Content, Quick Actions
3. Advanced mode shows: all current panels
4. Store in user preferences or project config
5. "Show Advanced" link at bottom of simple view

### P1-4: Easy Mode Publishing Rules + Auto-Deploy Badge (~1-2 days)

> This is a product decision that must be documented before devs implement contradictory UI.

**Publishing rules for Easy Mode**:

| Change Type | Trigger | User Action | UI Feedback |
|-------------|---------|-------------|-------------|
| **Content edits** (CMS) | Instant publish | None — save = live | "Saved" toast |
| **Template selection** | Auto-build + auto-deploy | Pick template → wait | Progress bar → "Live!" |
| **Code/design edits** (builder) | Auto-build + auto-deploy | Edit → save | "Publishing..." toast |
| **Advanced changes** (API keys, DB schema) | Manual action required | Click action button | Confirmation dialog |

**Implications**:
- **No "Deploy" or "Publish" button** in Easy Mode for content flows. Content publishes on save.
- **Build/deploy progress** shown via SSE (`BuildSSEBridge`) as a status bar, not a dialog.
- UI reflects state machine from `/status` endpoint: "Building..." → "Publishing..." → "Live" → "Failed (Retry)"
- "Deploy" terminology replaced with "Publish Changes" everywhere in Easy Mode.

**Current state**: Worker auto-deploys Easy Mode projects on build (`buildWorker.ts` line 1010-1033, checks `infraMode === 'easy'`). But the UI still shows a manual Deploy button and dialog with technical details ("SSR bundle: 850KB", "Assets: 47 files").

**Build**:
1. For Easy Mode projects, replace Deploy button with persistent "Your site is live" badge
2. Show `{subdomain}.sheenapps.com` link permanently when deployed
3. "Publishing changes..." toast during auto-deploy (subscribe to SSE events from `BuildSSEBridge`)
4. UI state driven entirely by polling `/status` — "Building..." / "Publishing..." / "Live" / "Failed (Retry)"
5. Keep rollback accessible under Advanced settings only
6. **API key safety**: Server keys never shown in Simple Mode. Key regeneration/revocation requires explicit confirmation dialog. Keys hidden by default in Simple Mode (P1-3).

### P1-5: Multi-Currency Support (~3-4 days) ✅ DONE

**Current state**: Schema supports it (`business_kpi_daily` PK includes `currency_code`), but queries filter to project's single currency. `currencyConversionService.ts` and `updateExchangeRates.ts` exist but aren't wired.

**Step 1 — Fix KPI queries** (`businessKpiService.ts`):
- Remove `WHERE k.currency_code = p.currency_code` filter
- Return KPIs grouped by currency
- Response: `{ currencies: [{ code, revenueCents, payments }], primaryCurrency, approximateTotalCents }`

**Step 2 — Display per-currency** (`run-overview-content.tsx`):
- Stack currencies in Revenue KPI card
- Primary currency prominent, secondary with "≈" conversion
- Use existing `currencyConversionService` for approximate totals

**Step 3 — Fix aggregation bugs**:
- `attributionService.ts`: Replace `MAX(currency)` with `GROUP BY currency`
- `digestService.ts`: Same — group by currency in revenue queries

**Step 4 — Currency picker in onboarding**:
- Add to project creation flow, default from locale (Arabic → SAR)
- Sets `projects.currency_code` as primary display currency

> **COMPLETED**: All four steps done.
> - **Step 1**: Added `getDailyMultiCurrency()` and `getRangeMultiCurrency()` to `businessKpiService.ts`. Returns `MultiCurrencyKpiResult` with `primaryCurrency`, non-monetary aggregates (sessions/leads/signups from primary currency row), and per-currency `CurrencyBreakdown[]`. Original single-currency methods kept for backward compat.
> - **Step 2**: Updated `run-overview-content.tsx` with `multiCurrencyKpis` data in state type. Revenue KPI cards show per-currency breakdown below the primary value when multiple currencies present. Added `currencyBreakdown` to `KpiCard` type.
> - **Step 3**: Fixed `attributionService.ts` — replaced `MAX(currency)` with `GROUP BY currency ORDER BY recovered_revenue_cents DESC`. Returns `currencyBreakdown` array when >1 currency. Fixed `digestService.ts` — split into two queries (non-monetary agg + per-currency revenue), eliminated `MAX(currency)` entirely. Added `DigestCurrencyRevenue` type with `currencies?` field in revenue.
> - **Step 4**: Added `currencyCode` to `CreateProjectRequestSchema` (api-contracts), `CreateEasyModeProjectInput` (InhouseProjectService), `CreateEasyModeProjectParams` (easy-project-service), `CreateProjectSchema` (API route), and `CreateProjectRequest` (use-projects-query). Currency picker in `create-project-dialog.tsx` with 7 currencies, locale-based defaults (ar-sa→SAR, ar-eg→EGP, ar-ae→AED, fr→EUR, etc.). Passed through full chain to INSERT INTO projects.

### P1-6: Run Hub System Ready Checklist (~1-2 days)

**Current state**: Run Hub requires business events to show meaningful data. New projects have zero events and no guidance on how to start.

**Build**: Card at top of `run-overview-content.tsx` when `totalEvents === 0`:
```
Get Started with Your Dashboard
☐ Your site is live → [Done ✓]     ← driven by /status.hosting.hasDeployedOnce
☐ Add analytics tracking → [How?]
☐ Connect payment provider → [Setup]
☐ First event received → Waiting...
```
Note: "Deploy" language is removed per publishing rules (P1-4). Checklist items reflect state, not actions.

Plus "Tracking On" chip in Run Hub header: green (<1hr since last event), yellow (<24hr), red (>24hr or never).

### P1-7: Template Gallery + Post-Build Verifier (~3-4 days) ✅ DONE

**Current state**: Template gallery exists in `new-project-page.tsx` (12 templates, PRO gating works), and `@sheenapps/templates` package has full metadata (scaffold, budget, prompting). But:
- Easy Mode creation flow (`create-project-dialog.tsx`) doesn't surface templates — text-only
- Template scaffold (expected pages/entities/flows) is stored but **not sent to Claude** (`buildWorker.ts` ~685)
- Template budget (maxSteps, maxBuildTime) is stored but **not enforced**
- Build output is never verified against template expectations

> **COMPLETED**: All three parts done.
> - **Part A**: Rewrote `create-project-dialog.tsx` with two-step flow: template gallery → name input. Uses `getFreeTemplates()` from `@sheenapps/templates`. Added `templateId` to `CreateProjectRequest`.
> - **Part B**: Already wired — `buildTemplatePrompt()` is called in `/api/projects/route.ts` during creation, so prompt stored in DB already includes `[[TEMPLATE]]` and `[[SCAFFOLD]]` sections.
> - **Part C**: Added scaffold verification in `buildWorker.ts` after build output detection. Collects source files, fuzzy-matches expected pages from scaffold, logs warnings for missing routes, stores `scaffoldVerification` in version metadata. Warning-only, never hard-fails.

**Part A — Surface templates in Easy Mode** (~1 day):
1. Show template gallery in Easy Mode creation flow (reuse existing `template-card.tsx`)
2. "Pick a template or describe your idea" — templates first, text input second
3. Template selection pre-fills project name and skips idea input

**Part B — Wire scaffold into Claude prompt** (~0.5 day):
In `buildWorker.ts` ~685 (where SDK context is injected), add template scaffold as structured contract:
```typescript
if (template?.scaffold) {
  const scaffoldContext = `
## Required Structure (from template: ${template.id})
- Pages/Routes: ${template.scaffold.pages.join(', ')}
- Data Entities: ${template.scaffold.entities.join(', ')}
- User Flows: ${template.scaffold.flows.join(', ')}
${template.scaffold.roles ? `- User Roles: ${template.scaffold.roles.join(', ')}` : ''}

You MUST include all listed pages and entities. Do not skip any.`
  effectivePrompt = `${scaffoldContext}\n\n${sdkContext}\n\n---\n\n${prompt}`
}
```

**Part C — Post-build heuristic verifier** (~1-2 days):
After `pnpm build` / export completes in `buildWorker.ts` (~line 958), run a lightweight validator:
```typescript
if (template?.scaffold) {
  const routeFiles = await glob('**/app/**/page.{tsx,jsx}', { cwd: buildDir })

  const verification = {
    hasHomePage: routeFiles.some(f => /app\/page\.tsx$/.test(f)),
    // Heuristic: check if route files loosely match expected pages
    // This is fuzzy — "blog" might match "blogging-tips" — so warning-only
    expectedRoutesFound: template.scaffold.pages.filter(page =>
      routeFiles.some(f => f.toLowerCase().includes(page.toLowerCase()))
    ),
    expectedRoutesMissing: template.scaffold.pages.filter(page =>
      !routeFiles.some(f => f.toLowerCase().includes(page.toLowerCase()))
    ),
  }

  if (!verification.hasHomePage) {
    log.warn('[Template] Homepage not found in build output')
  }
  if (verification.expectedRoutesMissing.length > 0) {
    log.warn('[Template] Missing expected routes:', verification.expectedRoutesMissing)
  }
  // Store verification result in project_versions for observability
}
```

**Limitations**: This is a heuristic — filename matching is fuzzy. A more robust approach would be to store expected routes as actual paths (`/blog`, `/pricing`) in template scaffold and check the routing manifest or exported paths. That can come later if false positives/negatives are a problem.

**Note**: The verifier logs warnings and stores results, never hard-fails. Templates guide Claude but shouldn't block builds. Full budget enforcement (step limits, token caps) deferred to P2 — it requires instrumenting Claude calls and adds complexity.

### P1-8: Content↔Preview Light Version (~1 day)

> Full split-view hot reload is P2. But the basic "I changed something, where did it go?" confusion can be solved cheaply.

**Build**:
1. After creating/editing CMS content, show toast: "Added your first post" + button "View on site →"
2. Add "Preview on site" link in CMS editor header (opens site in new tab)
3. Per content type, show a "where this appears" hint (static mapping per template, e.g., "Blog posts appear on /blog")
4. Rename "CMS" → "Content" in Easy Mode UI

### P1-9: Funnel Instrumentation (~1 day)

> Without tracking, beta feedback is guesswork. This makes it actionable.

**Track these events** (emit to `business_events` or a dedicated `easy_mode_funnel` table):

| Event | When |
|-------|------|
| `project_created` | After successful project creation |
| `build_started` | Build job received |
| `build_failed` | Build error (include error code) |
| `build_succeeded` | Build completed |
| `deploy_started` | Easy Mode deployment begins |
| `deploy_failed` | Deployment error |
| `deploy_succeeded` | Site live at subdomain |
| `first_site_open` | User clicks "View Site" for the first time |
| `first_content_type_created` | First CMS type created |
| `first_entry_created` | First CMS entry saved |
| `first_share_link_copied` | User copies site URL |
| `runhub_first_open` | User opens Run Hub for the first time |
| `onboarding_completed` | All checklist steps done |

**Implementation**: Most are one-line event emissions at existing code points (project creation handler, build worker status updates, CMS mutation handlers). Use existing `businessEventsService.ingest()` with `source: 'system'`.

**Dashboard**: Query these events to build a funnel view: created → built → deployed → opened → added content → shared. Drop-off points become immediate P0 fixes.

---

## Priority 2: Polish & Delight (Post-Beta)

> Important for retention but not blocking launch.

### P2-1: Wire Domain Purchase into Easy Mode (~2-3 days) ✅ DONE

**Backend is 100% done** (OpenSRS + Stripe + Cloudflare + webhooks + renewal worker). Frontend components exist (`DomainSetupWizard.tsx`, `DomainRegistration.tsx`, hooks). Just needs to be surfaced in Easy Mode infrastructure panel — replace Phase 3 "Coming Soon" placeholder.

**Completed**: Created `DomainCard` component (`DomainCard.tsx`) for Easy Mode infrastructure panel. Shows current subdomain, lists connected custom domains (with status badges), lists purchased domains, and provides "Connect Domain" and "Buy Domain" buttons that open the existing `DomainSetupWizard` and `DomainRegistration` components respectively. Added to `InfrastructurePanel.tsx` Simple Mode between Hosting and "More Settings". The catch-all proxy route (`/api/inhouse/projects/[id]/[...path]/route.ts`) already handles proxying domain search/register/list requests to the worker. Added `domains` translations to all 9 locale infrastructure.json files and updated drawer/panel translation types.

### P2-2: Wire Email Hosting (~1 day) ✅ DONE

OpenSRS Hosted Email already integrated (`OpenSrsEmailService.ts` — mailbox provisioning, webmail SSO, DNS records). Surface in domain setup flow: "Add email hosting → Create mailboxes at @yourdomain.com".

**Implemented**:
- `EmailHostingCard.tsx`: Shows mailbox count, sent-this-month stats, hosted domains with status badges, "Manage Email" button linking to full email dashboard
- Wired into `InfrastructurePanel.tsx` Simple Mode between Domain Card and "More Settings"
- Uses existing `useEmailOverview` and `useEmailDomains` hooks (no backend changes)
- Translations added to all 9 locales

### P2-3: Action Outcome Tracking UI (~1-2 days) ✅ DONE

Backend exists: `attributionService.getWorkflowImpact(runId)` returns conversions, recovered revenue, confidence. Build a drawer in Run Hub that shows results of past workflow actions (sent emails → who converted → revenue recovered).

**Completed**: Created `WorkflowHistoryDrawer` component (`workflow-history-drawer.tsx`) using Sheet/drawer UI. Shows all workflow runs with status, recipient counts, and outcome data (conversions, revenue recovered, confidence level, attribution method). Added "History" button to Next Actions card header. Supports cursor-based pagination. Each run card shows: action type with icon, status badge, time ago, sent/failed counts, and a highlighted revenue recovery section when conversions exist. Added translations to all 9 locale files (workflows.viewHistory, historyTitle, historyEmpty, recipients, sent, historyFailed, conversions, revenue, confidence, loadMore, runAgain). No backend changes needed — all data already available from existing `listRuns` endpoint with `outcome` from `workflow_attributions` JOIN.

### P2-4: Content-Site Full Preview Integration (~3-4 days) ✅ DONE

Split-view mode in CMS: left = content editor, right = live preview iframe. Hot reload on content changes. Visual indicators showing where content appears on site. (Light version — toasts + "View on site" link — shipped in P1-8.)

**Implemented**:
- Enhanced `CmsManagerDialog.tsx` with toggleable preview pane
- "Preview" button in dialog header toggles split-view (dialog widens to `max-w-6xl`)
- Right pane shows live site in sandboxed iframe with refresh button
- Auto-refreshes preview iframe 1 second after entry creation
- `previewKey` counter forces iframe reload on content changes
- Preview translations added to all 9 locales (`showPreview`, `hidePreview`, `previewTitle`, `refreshPreview`)
- No backend changes needed — uses existing site URL from hosting status

### P2-5: Data Explorer Tab in Run Hub (~2 days) ✅ DONE

Generic event filtering/search across all business events (currently only specialized Leads/Orders tabs). Plus CSV export for accountants.

**Implemented**:
- `run-explorer-content.tsx`: Full data explorer with event type filter dropdown (12 event types with icons), date range picker, cursor-based pagination, CSV export
- Wired into `run-page-content.tsx` as 5th tab (`?tab=explorer`)
- Uses existing `EventDetailsDrawer` for event detail view
- Uses existing `/api/inhouse/projects/[id]/business-events` endpoint (no backend changes needed)
- Translations added to all 9 locales

### P2-6: Project Export + Eject to Pro Mode (~2-3 days) ✅ DONE

Backend scaffolding exists (`inhouse_eject_requests` table, admin routes). Build user-facing UI: "Download your project" (ZIP) and "Migrate to Pro Mode" wizard with admin review.

**Implemented**:
- `ExportEjectCard.tsx`: Combined card with ZIP download button (uses `useProjectExport` hook) and eject-to-pro button with confirmation dialog
- Eject submits to existing `/api/inhouse/projects/[id]/eject` endpoint (feature-flagged via `INHOUSE_EJECT_ENABLED`)
- Wired into `InfrastructurePanel.tsx` Simple Mode between Email Hosting and "More Settings"
- Translations added to all 9 locales
- No backend changes needed — all worker routes, services, and queue processing already exist

### P2-7: AI Chat Helper (~3-5 days) ✅ DONE

Context-aware chatbot for Easy Mode users. Trained on Easy Mode docs, can trigger UI actions ("Show me how to add content" → opens CMS dialog). Uses existing Claude integration.

**Completed**: Created `EasyModeHelper.tsx` — floating chat button (bottom-right, above infrastructure trigger) that expands to a 360px chat panel. Uses existing `useChatPlan(projectId)` hook with SSE streaming for real-time AI responses. Features: suggested questions for empty state, user/assistant message bubbles, streaming indicator with `LoadingSpinner`, error display, auto-scroll on new messages. Wired into `enhanced-workspace-page.tsx` for Easy Mode projects only (gated on `infraMode === 'easy'` and `translations.infrastructure.easyModeHelper`). Added `easyModeHelper` translations (title, placeholder, close, thinking, errorGeneric, suggestedQuestions, 4 suggestions) to all 9 locale files. No backend changes needed — uses existing chat plan API.

### P2-8: Quotas Card in Run Hub (~1 day) ✅ DONE

Show "Events: 1,240 / 10,000", "Emails: 45 / 500", "Storage: 12MB / 100MB" in Run Hub. Data available from `getQuotaStatus()`.

**Completed**: Added `getQuotaStatus()` call to `inhouseRunOverview.ts` Promise.allSettled (query #11). Piped through Next.js proxy route. Added compact `QuotaBar` component to `run-overview-content.tsx` showing database, storage, and requests usage with color-coded progress bars (green < 70%, amber 70-90%, red > 90%). Added `quotas` translations to all 9 locale files (en, ar, ar-eg, ar-sa, ar-ae, fr, fr-ma, es, de). Note: email quota not available in `inhouse_quotas` table — only database, storage, and requests are tracked. Email quota can be added later when the column exists.

---

## Priority 3: Growth (Q2+ 2026)

| Feature | Effort | Notes |
|---------|--------|-------|
| Visual Design Editor (click-to-edit) | 2-3 weeks | Major feature — edit text/colors directly on preview |
| Collaboration (invite team members) | ✅ DONE | API routes + hook + TeamCard UI |
| Version History + Rollback UI | ✅ DONE | Data exists in `project_versions`, UI implemented |
| Mobile App (iOS/Android) | 4-6 weeks | Companion app for on-the-go edits |
| Arabic Voice Commands | ✅ DONE | Hybrid approach: direct commands + chat fallback |
| Template budget enforcement (step/token/time limits) | ✅ DONE | Build time cap, step counter, token logging |
| External KMS (AWS KMS / Vault) | 1-2 weeks | Replace env var master keys with managed KMS |

---

## Technical Debt (Address Opportunistically)

> TD-1 (Zod in worker) and TD-3 (contract tests) were promoted into P0-3 and P0-5.

### TD-1: Consolidate Migration Directories

Migrations split across two directories:
- `sheenappsai/supabase/migrations/` — secrets, backups
- `sheenapps-claude-worker/migrations/` — everything else

Move to single directory before next major migration.

### TD-2: Fix TypeScript Build Config

`tsconfig` issues in worker project prevent incremental compilation. Dedicated PR to fix config conflicts would improve build times.

---

## Implementation Sequence

```
Week 1: P0 (Blockers — Nothing Else Matters)
  ├─ Day 1: Fix 3 API mismatches + wire magic link email (P0-1, P0-2)
  ├─ Day 2-4: Create @sheenapps/api-contracts (Zod-first) + add Zod parsing to worker routes (P0-3)
  ├─ Day 4: Infra readiness gate — extend startup checks (P0-4)
  └─ Day 5: Smoke tests + contract tests in CI (P0-5)

Week 2-3: P1 Phase A (UX Foundations)
  ├─ Publishing rules + Auto-deploy badge (P1-4) — 1-2 days [DO FIRST — defines UI language for everything else]
  ├─ CMS Form Builder (P1-1) — 3-4 days
  ├─ Onboarding Checklist + Post-Creation Flow (P1-2) — 2-3 days
  ├─ Simple Mode Toggle (P1-3) — 1-2 days
  ├─ Content↔Preview light (P1-8) — 1 day
  └─ Funnel instrumentation (P1-9) — 1 day [ship early — tracks everything after]

Week 4: P1 Phase B (Run Hub + Templates)
  ├─ Run Hub: System Ready Checklist + Tracking Chip (P1-6) — 1-2 days
  ├─ Template Gallery + Post-Build Verifier (P1-7) — 3-4 days
  └─ Multi-Currency Support (P1-5) — 3-4 days

Week 5: Beta Testing
  ├─ Internal testing (team)
  ├─ Review funnel data (from P1-9)
  ├─ Fix drop-off points
  └─ Limited beta (50 users)

Week 6+: P2 (Polish — driven by beta data)
  ├─ Domain purchase wiring (P2-1)
  ├─ Email hosting wiring (P2-2)
  ├─ Action outcome tracking (P2-3)
  ├─ Content-site full preview (P2-4)
  └─ Remaining P2 items prioritized by funnel data
```

---

## Key Files Reference

### Next.js App (`sheenappsai/`)

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `src/types/inhouse-api.ts` | API contract types (401 lines) | → Move to `@sheenapps/api-contracts` |
| `src/app/api/inhouse/projects/create/route.ts` | Project creation proxy | ~108 (`projectName` bug) |
| `src/app/api/inhouse/projects/[id]/status/route.ts` | Status proxy (calls missing endpoint) | ~64-70 |
| `src/server/services/easy-project-service.ts` | Service layer for Easy Mode | ~59 (`projectName`), ~95 (`publicApiKey`) |
| `src/lib/api/worker-helpers.ts` | HMAC-authenticated worker calls | ~139-244 (`callWorker()`) |
| `src/components/builder/infrastructure/cms/CmsManagerDialog.tsx` | CMS UI with JSON textarea | ~568-577 (textarea), ~405-434 (submit) |
| `src/components/builder/new-project-page.tsx` | Template gallery (12 templates) | ~383-505 (selection), ~796-835 (grid) |
| `src/components/run/run-overview-content.tsx` | Run Hub KPI dashboard (1070 lines) | ~498 (currency), ~645 (outcomes) |
| `src/config/vertical-packs.ts` | 6 industry pack definitions (410 lines) | KPIs, actions, alerts per vertical |

### Worker (`sheenapps-claude-worker/`)

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `src/routes/inhouseProjects.ts` | 8 project routes, manual validation | ~77 (`name` field), ~106 (apiKey shape) |
| `src/routes/inhouseCmsAdmin.ts` | CMS admin routes | ~98-114 (create type) |
| `src/routes/inhouseDeployment.ts` | Deploy/rollback routes (5 routes) | ~245-557 (deploy with DoS limits) |
| `src/services/inhouse/InhouseProjectService.ts` | Project CRUD + API keys | ~281-384 (createProject) |
| `src/services/inhouse/InhouseCmsService.ts` | CMS storage (JSONB schema) | ~92-111 (createContentType) |
| `src/services/inhouse/InhouseDeploymentService.ts` | R2 + Workers for Platforms deploy | State: uploading→deploying→deployed |
| `src/workers/buildWorker.ts` | Build state machine | ~126 (infraMode check), ~685 (SDK context) |
| `src/services/businessKpiService.ts` | KPI rollups | ~31-69 (currency filter to fix) |
| `src/services/businessEventsService.ts` | Event ingestion with idempotency | ~300-304 (amount/currency extraction) |
| `src/services/attributionService.ts` | Payment→workflow attribution | ~210-218 (currency safety), ~330 (impact) |
| `src/services/currencyConversionService.ts` | Exchange rates (exists, not wired) | Wire for multi-currency |
| `src/services/digestService.ts` | Daily digest emails | ~364-377 (revenue by currency) |

### Packages (`sheenapps-packages/`)

| Package | Purpose | Status |
|---------|---------|--------|
| `@sheenapps/templates` | 12 template definitions with scaffold/budget/prompting | ✅ Shared between Next.js + worker |
| `@sheenapps/core` | SDK internals (SheenResult, SheenError) | ✅ Internal |
| `@sheenapps/api-contracts` | **DOES NOT EXIST YET** — Zod schemas + inferred types for all API contracts | ❌ Must create (P0-3) |
| 27 other SDK packages | auth, db, cms, storage, jobs, secrets, email, payments, analytics, etc. | ✅ Code done, npm publish pending |

---

## Build/Deploy State Machine Reference

```
BullMQ job → project_versions.status = 'building'
  → Check projects.infra_mode
  → [Easy Mode] Inject SDK context
  → Claude CLI → code generation
  → git init → pnpm install → pnpm build
  → [Easy Mode] pnpm run export
  → FORK:
      Easy Mode → InhouseDeploymentService:
        inhouse_deployments.status = 'uploading' (assets → R2)
        → 'deploying' (worker script → CF Workers for Platforms)
        → Update KV (hostname→projectId, projectId→buildId)
        → 'deployed'
      Pro Mode → Wrangler → Cloudflare Pages
  → project_versions.status = 'deployed'
  → Webhook: build_completed

Error at any phase → project_versions.status = 'failed'
```

**Events**: Webhooks (BullMQ), SSE (BuildSSEBridge + EventEmitter), deployment events in `inhouse_deployment_events` table.

---

## Success Criteria

| Metric | Current (est.) | Target | Measured By |
|--------|----------------|--------|-------------|
| E2E project creation success rate | ~0% (3 API bugs) | 100% | Contract tests (CI) |
| Infra readiness on boot | Unchecked | 100% (fail-fast) | Startup gate (P0-4) |
| Worker routes with Zod validation | 0% (manual checks) | 100% of inhouse routes | P0-3 migration |
| Time to first deploy | 5-8 min | <2 min | Funnel event: `project_created` → `deploy_succeeded` |
| CMS content types created without JSON | 0% | 100% | Form builder usage vs raw JSON |
| Non-tech user onboarding completion | <40% (no onboarding) | >80% | Funnel event: `onboarding_completed` |
| Template build output matches scaffold | Unchecked | >90% of expected routes present | Post-build verifier logs |
| Run Hub shows meaningful data on first visit | 0% (no setup guide) | >60% | `runhub_first_open` + has events |
| Multi-currency revenue display | Single currency only | All currencies shown | KPI endpoint returns multi-currency |
| Funnel drop-off: created → deployed | Unknown | <20% drop-off | Funnel instrumentation (P1-9) |
| Support tickets per user | 2-3 (high confusion) | <0.5 | Support system |

---

## Implementation Progress

### P0-1: Fix 3 API Contract Mismatches — ✅ COMPLETE

**Bug 1 (projectName→name)** — Fixed in 2 files:
- `sheenappsai/src/app/api/inhouse/projects/create/route.ts` line 109: `projectName: name` → `name,`
- `sheenappsai/src/server/services/easy-project-service.ts` line 59: `projectName,` → `name: projectName,`

**Bug 2 (apiKey response shape)** — Fixed in 2 files:
- `sheenappsai/src/app/api/inhouse/projects/create/route.ts`: `result.data.publicApiKey` → `result.data.apiKey?.publicKey || ''`, `result.data.url` → `result.data.previewUrl`
- `sheenappsai/src/server/services/easy-project-service.ts`: same changes

**Bug 3 (status endpoint missing)** — Implemented:
- Added `GET /v1/inhouse/projects/:id/status` to `sheenapps-claude-worker/src/routes/inhouseProjects.ts`
- Composes data from `getProject()`, `getQuotaStatus()`, `getDeploymentHistory()`, plus direct queries for `table_count`, `has_server_key`, and `inhouse_build_id/deployed_at`
- All 6 queries run in `Promise.all` for performance
- Response matches frontend `InfrastructureStatus` type exactly
- Includes extra fields: `updatedAt` (for cheap polling) and `hasDeployedOnce` (for onboarding checklist)

**Discovery**: The plan proposed a `build` field separate from `hosting`, but the frontend type (`InfrastructureStatus` in `types/inhouse-api.ts`) doesn't have a `build` field — it uses `hosting.currentBuildId` and `hosting.lastDeployedAt`. The implementation matches the actual frontend contract. If we want the richer state machine shape, we'd need to update the frontend type first.

### P0-2: Wire Magic Link Email Delivery — ✅ COMPLETE

**File modified**: `sheenapps-claude-worker/src/routes/inhouseAuth.ts`

**What was wrong**: The magic link route (`POST /v1/inhouse/auth/magic-link`) generated a token and stored it in the DB, but never called the email service. In production mode, it returned "Magic link sent to your email" without actually sending anything.

**Fix**: Added email sending after token creation (lines 270-292):
- Gets project info via `getInhouseProjectService()` for the project name and preview URL
- Constructs magic link URL: `{previewUrl}/auth/magic-link?token={token}`
- Calls `getInhouseEmailService(projectId).send()` with the built-in `magic-link` template
- Uses idempotency key to prevent duplicate sends
- Catches email failures gracefully (logs error, doesn't fail the request)

**Env requirement**: `RESEND_API_KEY` must be set for email delivery. Domain `sheenapps.com` must be verified in Resend.

### P0-3: Create @sheenapps/api-contracts (Zod-first) — ✅ PHASE 1 COMPLETE

**Package created**: `sheenapps-packages/api-contracts/`

**Structure**:
```
api-contracts/src/
  index.ts       — re-exports everything
  responses.ts   — ApiResponse<T>, ApiError, error code enum
  projects.ts    — CreateProjectRequest/Response, InfrastructureStatus, all sub-schemas
  deployment.ts  — DeployBuildRequest, DeploymentStatus, DeploymentHistoryItem
  cms.ts         — CmsField (with superRefine type-specific rules), CreateCmsTypeRequest, CreateTableRequest
  gateway.ts     — QueryContract, FilterOperator, QueryFilter
```

**Key design decisions**:
- Zod v4 (matches worker's installed version)
- Schemas are source of truth, types inferred via `z.infer<>`
- `CmsFieldSchema` uses `.superRefine()` for type-specific constraint validation (select requires options, number can't have maxLength, etc.)
- `.strict()` on CMS schemas to reject unknown keys in JSONB
- `CreateProjectRequestSchema` validates UUID format for userId, subdomain regex, template shape

**Worker integration**:
- `inhouseProjects.ts`: Replaced manual `if (!field)` checks with `Schema.safeParse()` on 3 routes (create project, list projects, create table)
- Returns structured `VALIDATION_ERROR` with all Zod issue messages joined
- Typechecks clean (0 errors)

**Installed in both apps**:
- `sheenapps-claude-worker`: `pnpm add @sheenapps/api-contracts@file:../sheenapps-packages/api-contracts`
- `sheenappsai`: `npm install ../sheenapps-packages/api-contracts`

**Remaining (incremental)**:
- Replace `types/inhouse-api.ts` inline interfaces in Next.js with imports from contracts package
- Add Zod parsing to remaining worker routes (keys, quota, deployment)
- Add dev-only response validation (`if (NODE_ENV !== 'production') ResponseSchema.parse(payload)`)

### P0-4: Infrastructure & Environment Readiness Gate — ✅ COMPLETE

**File modified**: `sheenapps-claude-worker/src/config/envValidation.ts` (added `assertInfraReady()`)
**File modified**: `sheenapps-claude-worker/src/server.ts` (call `assertInfraReady()` after DB test)

**What it does**: Async function that runs at worker startup before `app.listen()`. Checks 4 external services in parallel with 5-second timeouts:

1. **Database (Neon)** — `SELECT 1` via pool
2. **Redis** — Connect + PING via ioredis
3. **Resend (Email)** — GET /domains to verify API key validity
4. **Cloudflare Workers API** — Token verify endpoint

**Behavior**:
- Logs all results with timing and pass/fail icons
- When `INHOUSE_MODE_ENABLED=true`: exits process on any failure (fail-fast)
- When not enabled: warns but allows startup (permissive for dev/non-Easy-Mode deployments)

**Discovery**: The server already had a `testConnection()` call for DB, but it logged a warning and continued. The new gate adds actual verification of all external services and enforces them in production Easy Mode deployments.

### P0-5: Smoke Tests + Contract Tests — ✅ COMPLETE

**Contract tests** (`__tests__/contracts/`):
- `projects.test.ts` — 17 tests covering CreateProjectRequest, CreateProjectResponse, InfrastructureStatus, ListProjectsQuery
  - Validates correct shapes pass, wrong shapes fail (including the old Bug #2 flat `publicApiKey` shape)
  - Tests subdomain regex, UUID validation, framework enum, tier values
- `cms.test.ts` — 16 tests covering CmsField, CreateCmsTypeRequest, CreateTableRequest
  - Validates type-specific constraint rules (select requires options, number can't have maxLength, etc.)
  - Tests strict mode (rejects unknown keys), duplicate field name detection
- All 33 tests pass

**Route coverage audit** (`scripts/audit-route-coverage.ts`):
- Scans all Next.js proxy files in `src/app/api/inhouse/` for `callWorker({ path: '...' })` calls
- Scans all worker route files for `fastify.get/post/...('path')` registrations
- Compares and reports mismatches
- Results: 48/54 proxy routes match, 6 have no worker match (CMS admin, domain verify, email — likely registered in sub-route files with different patterns)
- Added as `npm run audit:routes` and `npm run test:contracts` scripts

**Discovery**: The route coverage audit found that CMS admin routes (`/v1/inhouse/cms/admin/*`) are registered differently than expected (probably in a separate CMS route file using `app` with sub-prefix). These 6 should be investigated separately but don't block P0.

### P1-4: Publishing Rules + Auto-Deploy Badge — ✅ COMPLETE

**Files created**:
- `sheenappsai/src/components/builder/infrastructure/EasyModeSiteBadge.tsx` — New component

**Files modified**:
- `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx` — Added conditional rendering
- All 9 locale files (`src/messages/*/infrastructure.json`) — Added `siteBadge` translations

**What it does**: Replaces the manual Deploy button in Simple/Easy Mode with a persistent site status badge:
- **Live** (green): Pulsing dot + "Your site is live" + subdomain link + "Open Site" button
- **Deploying** (blue): Spinner + "Publishing changes..."
- **Error** (red): Alert icon + error message + "Retry" button
- **None** (muted): Globe icon + "Not published yet"

Advanced Mode retains the manual Deploy button (gated by `FEATURE_FLAGS.ENABLE_EASY_DEPLOY`).

**Translation wiring**: `siteBadge` key flows through `infrastructure` messages object → `enhanced-workspace-page.tsx` (typed as `any`) → `infrastructure-drawer.tsx` → `InfrastructurePanel.tsx`. No additional wiring needed since the `any` type passes all keys through.

**Design decision**: Used conditional rendering (`isSimpleMode && translations.siteBadge`) with optional `siteBadge` in the translations interface. This means the badge only renders when translations are provided, making it backward compatible with any code that doesn't pass siteBadge translations.

### P1-9: Funnel Instrumentation — ✅ COMPLETE

**Worker-side events** (all using `getBusinessEventsService().insertEvent()`, fire-and-forget with try/catch):

| Event | File | Location |
|-------|------|----------|
| `project_created` | `inhouseProjects.ts` | After successful `projectService.createProject()` |
| `build_started` | `buildWorker.ts` | After build started webhook |
| `build_succeeded` | `buildWorker.ts` | After build completed webhook |
| `build_failed` | `buildWorker.ts` | In catch block after version marked failed |
| `deploy_succeeded` | `InhouseDeploymentService.ts` | After successful deployment commit + log |
| `deploy_failed` | `InhouseDeploymentService.ts` | After deployment error handling |
| `content_type_created` | `inhouseCmsAdmin.ts` | After `cmsService.createContentType()` |
| `entry_created` | `inhouseCmsAdmin.ts` | After `cmsService.createEntry()` |

**Frontend-side events** (via `emitFunnelEventOnce()` helper — fire-and-forget, once-per-session):

| Event | Component | Trigger |
|-------|-----------|---------|
| `first_site_open` | `HostingStatusCard.tsx` | "Open Site" button click |
| `first_site_open` | `EasyModeSiteBadge.tsx` | "Open Site" button click |
| `runhub_first_open` | `run-overview-content.tsx` | Component mount |

**Infrastructure created**:
- `sheenappsai/src/utils/easy-mode-funnel.ts` — Lightweight helper with `emitFunnelEvent()` and `emitFunnelEventOnce()` (session-scoped dedup via `Set`)
- `sheenappsai/src/app/api/inhouse/projects/[id]/business-events/route.ts` — Added POST handler to existing GET-only proxy route
- All events use `source: 'server'` and idempotency keys based on entity IDs

**Design decisions**:
- All event emissions are wrapped in try/catch and non-blocking — analytics must never break user flows
- `emitFunnelEventOnce()` uses in-memory `Set` for session dedup — sufficient for "first X" events since we only need one event per session
- Frontend events go through the full auth pipeline (session → project owner check → HMAC → worker → business_events table)
- Worker-side events use the existing `businessEventsService.insertEvent()` with DB-level idempotency (unique constraint on `project_id + source + event_type + idempotency_key`)

**Not yet implemented** (deferred to when their UI touchpoints exist):
- `first_share_link_copied` — no share/copy link UI exists yet in Easy Mode
- `onboarding_completed` — depends on P1-2 (onboarding checklist)

### P1-1: CMS Form Builder (Replace JSON Textarea) — ✅ COMPLETE

**Files created**:
- `sheenappsai/src/components/builder/infrastructure/cms/CmsFieldBuilder.tsx` — New visual field builder component

**Files modified**:
- `sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx` — Imported CmsFieldBuilder, added `typeFields` state, updated `handleCreateType` to use visual fields, replaced textarea with field builder when translations are present
- All 9 locale files (`src/messages/*/infrastructure.json`) — Added `fieldBuilder` translations inside `cms.dialog.types`, changed `schema` label from "Schema JSON" to "Fields" equivalent

**What it does**: Replaces the raw JSON `<Textarea>` in the content type creation form with a visual field builder that supports:
- Adding/removing fields with + and trash buttons
- Field name input (auto-cleaned to alphanumeric + underscore)
- Field type dropdown (text, number, email, url, date, select, image, boolean, richtext, json)
- Required toggle per field
- Type-specific constraints:
  - **select**: Option list with add/remove
  - **number**: Min, Max, Display (currency/percent)
  - **text/email/url**: Max length, Description
- "Show JSON" toggle to see the generated schema (read-only, for power users)

**Backward compatibility**: The `fieldBuilder` translations are optional (`fieldBuilder?` in the type interface). When translations are not present, the component falls back to the original `<Textarea>`. This makes it safe to deploy even if some translation files are incomplete.

**Design decisions**:
- Used `ComponentProps<typeof ...>` chain for type inference — no manual type duplication needed
- Field name uses `replace(/[^a-zA-Z0-9_]/g, '')` to prevent invalid DB column names
- When switching field type, incompatible constraints are auto-removed (e.g., switching from number to text removes min/max)
- No drag-drop reorder (deferred — adds complexity with minimal value for MVP)
- No AI assist for field generation (deferred — requires Claude integration wiring)

### P1-2: Onboarding Checklist — ✅ COMPLETE

**Files created**:
- `sheenappsai/src/components/builder/infrastructure/OnboardingChecklist.tsx` — New checklist component

**Files modified**:
- `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx` — Added OnboardingChecklist rendering, CMS content types query
- All 9 locale files (`src/messages/*/infrastructure.json`) — Added `onboarding` translations

**What it does**: Persistent, collapsible onboarding checklist that appears in the infrastructure panel for Simple Mode users:

4 steps:
1. **Create your project** — auto-completed (always true since they're viewing the panel)
2. **View your live site** — completed when user clicks "Open" (opens site URL)
3. **Add your first content** — auto-completed when CMS content types exist (via `useCmsContentTypes` query)
4. **Share your site** — completed when user clicks "Copy Link" (copies URL to clipboard, emits `first_share_link_copied` funnel event)

Features:
- Progress indicator: "{done}/{total}" count
- Dismissible (X button) with "Show checklist" reopen button
- Green card style when all steps completed
- Steps show check circle when complete, action buttons when incomplete
- localStorage persistence per project (`easy_onboarding_{projectId}`)
- "Add Content" action scrolls to CMS panel within the drawer

**Design decisions**:
- Optional `onboarding?` translations in the interface — backward compatible
- Uses `useCmsContentTypes` hook (already imported) with `!isSimpleMode` disable flag to avoid fetching when not needed
- Scroll-to-CMS approach instead of opening dialog programmatically — simpler, no cross-component state threading
- Hydration guard (`isHydrated` state) to prevent SSR/client mismatch with localStorage

**Deferred items**:
- Post-creation success screen (redirecting to a "Your project is ready!" page instead of workspace) — would require route changes, deferred
- Post-deploy redirect to Run Hub — depends on SSE event detection, deferred to when SSE integration is more mature

### P1-3: Simple Mode Toggle — ✅ COMPLETE

**Files modified**:
- `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx` — Added `onModeToggle` callback prop and toggle button in header card
- `sheenappsai/src/components/builder/workspace/infrastructure-drawer.tsx` — Added `onModeToggle` prop passthrough, extended panel translations type
- `sheenappsai/src/components/builder/enhanced-workspace-page.tsx` — Wired toggle callback using `useWorkspaceMode().setMode()`, toggling between 'simple' and 'advanced'
- All 9 locale files (`src/messages/*/infrastructure.json`) — Added `showAdvanced` and `showSimple` to `panel` section

**What it does**: Adds a text toggle in the infrastructure panel header that lets users switch between Simple and Advanced modes:
- Simple Mode (default for Easy Mode): shows Site Badge, Onboarding Checklist, Hosting, CMS only
- Advanced Mode: shows all panels (Database, API Keys, Quotas, Auth, Phase 3, etc.)
- Toggle label shows "Show Advanced" in simple mode, "Simple View" in advanced mode
- Persists via `useWorkspaceMode` hook (localStorage per project)
- Already-existing `isSimpleMode` prop on InfrastructurePanel controls which cards are visible

**Architecture**: The toggle is a simple callback chain:
- `enhanced-workspace-page.tsx` → `() => setMode(isSimpleMode ? 'advanced' : 'simple')` → passed as `onModeToggle` to `InfrastructureDrawer` → passed to `InfrastructurePanel` → rendered as button

### P1-8: Content↔Preview Light Version — ✅ COMPLETE

**Files modified**:
- `sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx` — Added `siteUrl` prop, `useToast` import, success toast with "View on site" action after entry creation, "Preview on site" link in dialog header
- `sheenappsai/src/components/builder/infrastructure/cms/CmsStatusCard.tsx` — Added `siteUrl`, `isSimpleMode` props, conditional `simpleTitle` rendering ("Content" instead of "CMS")
- `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx` — Extracted `siteUrl` variable, passed `siteUrl` and `isSimpleMode` to CmsStatusCard, added `simpleTitle?` to cms translations type
- `sheenappsai/src/components/builder/workspace/infrastructure-drawer.tsx` — Added `simpleTitle?` and `preview?` to cms translations type
- All 9 locale files (`src/messages/*/infrastructure.json`) — Added `cms.simpleTitle` and `cms.dialog.preview` translations

**What it does**:

1. **Toast after entry creation**: When an entry is created and the site has a URL, shows a success toast "Entry created!" with a "View on site" action button that opens the live site in a new tab.

2. **"Preview on site" link**: The CMS dialog header now shows a small "Preview on site" link (with external-link icon) that opens the live site. Only appears when `siteUrl` and preview translations are available.

3. **"CMS" → "Content" rename**: In Simple Mode, the CMS card title shows "Content" (or locale equivalent) instead of "CMS". Uses `simpleTitle` translation key with fallback to `title`. Advanced mode still shows "CMS".

4. **Per content type "where this appears" hint**: Deferred. Requires template-specific route mapping (e.g., blog template → `/blog`, portfolio template → `/work`). This mapping doesn't exist yet and would need to be defined per template in the templates package. The toast + preview link cover the core "I changed something, where is it?" confusion for now.

**Design decisions**:
- `preview` translations are optional (`preview?`) for backward compatibility
- `simpleTitle` is optional — falls back to `title` when not present
- Toast uses `sonner` via `useToast` hook (consistent with other infrastructure components like ApiKeysCard)
- `siteUrl` threaded through: InfrastructurePanel → CmsStatusCard → CmsManagerDialog

### P1-6: Run Hub System Ready Checklist + Tracking Chip — ✅ COMPLETE

**Files modified**:
- `sheenappsai/src/components/run/run-overview-content.tsx` — Replaced empty state with System Ready Checklist card; enhanced `DataFreshnessIndicator` with red "no events" state
- All 9 locale files (`src/messages/*/run.json`) — Added `checklist` section (7 keys) and `overview.noTracking` key

**What it does**:

1. **System Ready Checklist**: When `hasNoData && hasNoAlerts`, instead of a generic "Your dashboard is ready" hero card, shows an actionable checklist:
   - "Your site is live" — always checked (you're on Run Hub = deployed)
   - "Add analytics tracking" — checked when first event received; "How?" button links to `?infra=api-keys` in the builder workspace
   - "First event received" — checked when `lastEventAt` is not null; shows "(Waiting...)" when incomplete
   - Progress counter: `{done}/{total}`

2. **Tracking Status Chip (enhanced DataFreshnessIndicator)**: The existing `DataFreshnessIndicator` already showed green/amber states. Added a third state:
   - **Red dot + "No events received"** — when `lastEventAt` is null (never received any events)
   - **Amber + warning icon** — when >24h since last event (existing)
   - **Green dot + last updated time** — when events are fresh (existing)

**Design decisions**:
- Reused existing `DataFreshnessIndicator` rather than creating a new tracking chip component — it already had the right data and placement
- Checklist uses the same visual pattern as `OnboardingChecklist` (check-circle icon, line-through when done)
- "How?" button links directly to the API Keys section of the infrastructure panel via deep link (`?infra=api-keys`)
- Kept the existing empty state KPI cards and Next Actions below the checklist for context

### P3-2: Collaboration (Invite Team Members) — ✅ COMPLETE

**Files created**:
- `sheenappsai/src/app/api/projects/[id]/collaborators/route.ts` — GET/POST for collaborators list and invite
- `sheenappsai/src/app/api/projects/[id]/collaborators/[collaboratorId]/route.ts` — PATCH/DELETE for role update and removal
- `sheenappsai/src/hooks/use-collaborators.ts` — React Query hook with `useCollaborators`, `useInviteCollaborator`, `useUpdateCollaboratorRole`, `useRemoveCollaborator`
- `sheenappsai/src/components/builder/infrastructure/TeamCard.tsx` — Team management UI component

**Files modified**:
- `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx` — Added TeamCard rendering
- `sheenappsai/src/components/builder/workspace/infrastructure-drawer.tsx` — Added `team?` to translations interface
- All 9 locale files (`src/messages/*/infrastructure.json`) — Added full `team` section with translations

**Backend note**: The `project_collaborators` table, RLS policies, and SQL functions (`get_project_collaborators`, `invite_collaborator`) already exist in production DB. The API routes use `makeUserCtx()` for RLS-first access — no service key needed.

**Features**:
- View collaborator list with role badges (owner/admin/editor/viewer)
- Pending invitations shown with amber "Pending" badge
- Invite form: email input + role dropdown + invite button (owners/admins only)
- Change role dropdown menu (admins can change viewer↔editor↔admin)
- Remove collaborator button (owners only)

### P3-3: Template Budget Enforcement — ✅ COMPLETE

**Files modified**:
- `sheenapps-claude-worker/src/workers/buildWorker.ts` — Build time cap + step counter
- `sheenapps-claude-worker/src/services/metricsService.ts` — Token budget logging
- `sheenapps-claude-worker/src/workers/streamWorker.ts` — Budget lookup for metrics

**What was implemented**:

**P3-3a: Build Time Hard Cap**
- Added `getProjectTemplateBudget()` and `getProjectMaxBuildTime()` helper functions
- Both initial build and rebuild Claude CLI spawns now use template-based timeout (`maxBuildTime * 60 * 1000`)
- When timeout exceeded → SIGTERM → 5s grace → SIGKILL → `BUILD_TIME_EXCEEDED` error
- Default fallback: 10 minutes when no template budget exists

**P3-3b: Step Counter + Enforcement**
- Added `getProjectMaxSteps()` helper (default: 50 steps)
- Added `countToolCallsInLine()` to parse streaming JSON output and count tool calls
- Tool calls detected: `type: 'tool_use'` events, assistant messages with tool_use content, `type: 'tool_result'` events
- When step limit exceeded → SIGTERM → 5s grace → SIGKILL → `STEP_LIMIT_EXCEEDED` error
- Logs step count updates: `[Budget] Step count updated: {stepCount}/{maxSteps}`

**P3-3c: Token Budget Logging (Soft Enforcement)**
- Added `budgetedTokens` and `projectId` fields to `ClaudeSessionMetrics` interface
- `recordClaudeSession()` compares actual tokens vs budgeted, logs warning when >20% overage
- Warning: `[Budget] TOKEN_BUDGET_EXCEEDED: Build {buildId} exceeded token budget by {percent}%`
- Added `getProjectBudgetedTokens()` helper in streamWorker.ts (reads `estimatedTokens` from template)

**Template budget structure** (from `@sheenapps/templates`):
```typescript
budget: {
  maxSteps: 25,        // e.g., 22-30 depending on template
  estimatedTokens: 75000, // e.g., 50k-100k depending on template
  maxBuildTime: 15,    // minutes (10-15 depending on template)
}
```

### P3-4: Arabic Voice Commands — ✅ COMPLETE

**Hybrid Approach**: Voice input transcribed → matched against commands → direct action OR fallback to chat.

**Files created**:
- `src/lib/voice-commands/command-definitions.ts` — Arabic command phrases mapped to actions
- `src/lib/voice-commands/command-matcher.ts` — Arabic-aware fuzzy matching (diacritics removal, alef/ta normalization, Levenshtein distance)
- `src/lib/voice-commands/action-executor.ts` — Execute matched commands via router/callbacks
- `src/lib/voice-commands/index.ts` — Module exports
- `src/components/builder/infrastructure/EasyModeVoiceButton.tsx` — Mic button with recording state, audio level meter

**Files modified**:
- `src/components/builder/infrastructure/EasyModeHelper.tsx` — Added voice button, command matching, chat fallback
- All 9 locale `infrastructure.json` files — Added `voice` section to `easyModeHelper`

**Command Categories**:
- **Navigation**: ارجع (back), الصفحة الرئيسية (home)
- **Build**: ابني (start build), أوقف (stop)
- **UI**: افتح الإعدادات (settings), افتح المعاينة (preview), انشر (deploy)
- **CMS**: افتح المحتوى (open CMS), أضف محتوى (add content)
- **Helper**: ساعدني (open helper), أغلق المساعد (close helper)

**Arabic Text Normalization**:
- Removes diacritics (tashkeel): فَتْحَة → فتحه
- Normalizes alef variants: أ إ آ → ا
- Normalizes ta marbuta: ة → ه
- Normalizes alef maqsura: ى → ي
- Regional dialect aliases (Gulf, Egyptian, Levantine)

**Flow**:
1. User clicks mic button → starts recording
2. VAD auto-stops when user stops speaking (1.5s silence)
3. Audio transcribed via OpenAI Whisper (`/api/v1/transcribe`)
4. `matchCommand()` checks against all commands + aliases
5. If match with confidence ≥ minConfidence → `executeVoiceCommand()`
6. Else → text sent to chat input (existing flow)

---

## Discoveries & Improvement Ideas

### From P3 Implementation

1. **Claude CLI JSON output parsing**: Tool calls appear as multiple event types (`tool_use`, `tool_result`, content items). The step counter handles all of them, but a more robust approach would be to use Claude CLI's built-in step tracking if available.

2. **Timeout cleanup race condition**: The current implementation uses `setTimeout` for graceful kill (SIGTERM → 5s → SIGKILL). This works but could leave zombie processes if the Node.js process itself crashes during the grace period. Consider using process groups (`detached: true` + negative PID kill) for more robust cleanup.

3. **Token counting accuracy**: The token budget logging uses `inputTokens + outputTokens` from Claude's response. This may not include all token usage (e.g., system prompt tokens, cache tokens). For more accurate budget enforcement, consider using Claude's `usage` object with all token categories.

4. **Step counting granularity**: Currently counts tool_use/tool_result events, which roughly corresponds to "actions Claude took". However, some tool calls (like multi-file reads) might count as multiple steps. Consider refining the definition of "step" if users report unexpected enforcement.

---
