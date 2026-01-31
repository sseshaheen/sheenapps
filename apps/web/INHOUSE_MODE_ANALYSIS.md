# In-House Mode (Easy Mode) - Analysis & Implementation Plan

> **Last Updated**: January 2026
> **Status**: Phase 1-2 Production Ready, Phase 3 Requires Implementation
> **Purpose**: External expert review of current state and remaining work

---

## Executive Summary

In-House Mode ("Easy Mode") provides a zero-configuration hosting solution where users get managed database, auth, CMS, and hosting without external accounts. The implementation spans two projects:

- **sheenapps-claude-worker** (Cloudflare Worker): Backend services, gateway, routing
- **sheenappsai** (Next.js): Frontend UI, API proxy routes

### Current Completion Status

| Phase | Description | Status | Notes |
|-------|-------------|--------|-------|
| Phase 1 | Infrastructure (DB, Hosting, API Keys) | **98%** | Core complete, minor quota gaps |
| Phase 2 | Auth + CMS | **95%** | Core complete, missing OAuth/password reset |
| Phase 3 | Domains/Export/Eject | **15%** | Placeholder routes only |
| Frontend UI | Infrastructure Panel | **95%** | All dialogs functional |

### Recently Completed (Jan 2026)

1. Skeleton loading states for infrastructure cards
2. Deployment history with pagination and rollback
3. Chat deploy button integration
4. API key regeneration with 15-minute grace period
5. Live deployment logs via SSE streaming

---

## Expert Code Review (Jan 2026)

External expert reviewed the worker backend. Summary of findings and actions:

### Fixed Issues

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| **Cursor delimiter bug** | P0 | **FIXED** | ISO timestamps contain `:` so `split(':')` broke pagination. Changed to JSON encoding. |
| **Env var validation** | P0 | **FIXED** | Route now validates name format (`/^[A-Z][A-Z0-9_]{0,63}$/`) and reserved names before asset upload. |

### Not Applicable

| Issue | Expert's Concern | Evaluation |
|-------|------------------|------------|
| **Verification jobId** | "Can block legit runs" | This is for migration quality gates, not inhouse deployments. Wrong subsystem. |
| **SSRF protection** | "Process arbitrary URLs" | We don't fetch user URLs. Assets are base64 in request body; all fetches go to fixed Cloudflare API. |

### Deferred (Low Priority)

| Issue | Action | Notes |
|-------|--------|-------|
| **Events retention** | Add later | Comment says 14 days but no cleanup job. Will add cron/pg_cron when needed. |
| **Index DESC** | Skip | Current index works for our query pattern. |

### Files Changed (Worker)

- `worker/src/services/inhouse/InhouseDeploymentService.ts` - Cursor encoding/decoding now uses JSON
- `worker/src/routes/inhouseDeployment.ts` - Added env var name regex and reserved names validation

---

## Expert Code Review - Worker Round 2 (Jan 2026)

External expert reviewed worker backend again. Most suggestions were either already handled or not applicable.

### Fixed Issues (Worker Round 2)

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| **JSONB casting** | P2 | **FIXED** | Added explicit `::jsonb` cast in event logging INSERT for type safety. |
| **DB write atomicity** | P1 | **FIXED** | Wrapped final deployment+project updates in transaction to prevent inconsistent state if one update fails. |
| **KV sequential updates** | P1 | **FIXED** | Changed from parallel to sequential KV updates for clearer error attribution and safer failure handling. |

### Not Applicable

| Issue | Expert's Concern | Evaluation |
|-------|------------------|------------|
| **AssetPipelineService SSRF** | "SSRF if sourceUrl is attacker-controlled" | That service is for **website migration** (crawling external sites), NOT In-House Mode deployments. For inhouse, assets are uploaded as base64 in request body - no external URL fetching. |
| **Redirect escapes** | "Allowed domain → redirect to private host" | Same as above - not applicable to inhouse deployments. |
| **Size-capped downloads** | "Memory spikes from arrayBuffer()" | Same as above - inhouse assets are base64 in request, not external URLs. |

### Deferred (Over-engineering)

| Issue | Reason |
|-------|--------|
| **Cursor pagination tie-breaker (created_seq)** | Current `(created_at, id)` works fine for our volume. Adding BIGSERIAL column is unnecessary complexity. |
| **KV revert on partial failure** | Hostname mapping is idempotent (same value per project). Build mapping failure leaves previous build in KV (safe fallback). Complex revert logic could introduce bugs. |

### Files Changed (Worker Round 2)

- `worker/src/services/inhouse/InhouseDeploymentService.ts`:
  - Added `::jsonb` cast in `logEvent()` INSERT
  - Wrapped final updates in BEGIN/COMMIT transaction
  - Changed KV updates from parallel to sequential

---

## Expert Code Review - Next.js (Jan 2026)

External expert reviewed the Next.js frontend/API routes. All 4 issues were valid and fixed:

### Fixed Issues

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| **DeployDialog phase='complete' too early** | P0 | **FIXED** | Setting `phase='complete'` after deploy API returned immediately disabled SSE because `enabled` checks `phase !== 'complete'`. Now stays in 'routing' phase until SSE confirms completion. |
| **SSE setInterval overlap** | P0 | **FIXED** | `setInterval(async () => ...)` could overlap if worker calls took >500ms. Changed to async loop with sleep for sequential polling. Added keepalive pings. |
| **Deployments history missing ownership** | P0 | **FIXED** | Route didn't verify project ownership before calling worker (unlike SSE logs and API key regenerate routes). Added defense-in-depth check. |
| **API key regeneration safe JSON** | P1 | **FIXED** | Used `await .json()` which throws on HTML error pages. Now uses `safeJson` helper and explicit body variable for signature consistency. |

### Files Changed (Next.js)

- `next/src/components/builder/infrastructure/DeployDialog.tsx` - Phase transition now driven by SSE completion
- `next/src/app/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts` - Async loop instead of setInterval, keepalive pings
- `next/src/app/api/inhouse/projects/[id]/deployments/route.ts` - Added project ownership check
- `next/src/app/api/inhouse/projects/[id]/api-keys/[type]/regenerate/route.ts` - Safe JSON parsing, explicit body variable

---

## Expert Code Review - Round 2 (Jan 2026)

Follow-up review largely duplicated previous fixes. New items addressed:

### Fixed Issues (Round 2)

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| **DeployDialog safeJson for deploy** | P1 | **FIXED** | Deploy response used `response.json()` instead of `safeJson`. Now handles HTML error pages gracefully. |
| **SSE route runtime** | P1 | **FIXED** | Added `runtime = 'nodejs'` to avoid edge runtime stream issues. |
| **SSE route cancel()** | P1 | **FIXED** | Added `cancel()` method to ReadableStream for proper cleanup when consumer cancels. |

### Already Fixed (from previous round)

| Issue | Expert's Comment | Status |
|-------|------------------|--------|
| DeployDialog phase='complete' too early | "Let SSE drive completion" | Already implemented |
| SSE setInterval overlap | "Use async loop" | Already implemented |

### Skipped (Overengineering)

| Issue | Reason |
|-------|--------|
| **fetchJson with timeout helper** | We have `safeJson`; timeouts handled at other layers (worker, SSE maxPolls). Adding complexity without clear benefit. |
| **requireProjectOwner helper extraction** | Ownership checks added manually; helper is polish, not urgent. |

### Files Changed (Round 2)

- `next/src/components/builder/infrastructure/DeployDialog.tsx` - Now uses `safeJson` for deploy response
- `next/src/app/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts` - Added `runtime = 'nodejs'` and `cancel()` method

---

## Expert Code Review - Round 3 (Jan 2026)

Critical bug found in SSE route and additional hardening applied.

### Fixed Issues (Round 3)

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| **`closed` scope bug** | P0 | **FIXED** | `cancel()` couldn't access `closed` variable declared inside `start()`. Hoisted to ReadableStream closure. |
| **SSE safeJson** | P0 | **FIXED** | Worker fetch used `response.json()` which throws on HTML error pages. Now uses `safeJson`. |
| **SSE fetch timeout** | P1 | **FIXED** | Added 8s timeout to prevent hung requests eating Node workers. New `fetchWithTimeout` helper. |
| **Regenerate status passthrough** | P1 | **FIXED** | Was hardcoding 201; now passes through worker status. Better error status logic (502 for parse failures). |

### Skipped (Polish)

| Issue | Reason |
|-------|--------|
| **requireProjectOwner helper** | Ownership checks added manually; extraction is polish |
| **Locale-aware time in ApiKeysCard** | Nice UX but low priority |
| **DeployDialog timeout cleanup** | Defensive but low priority |

### Files Changed (Round 3)

- `next/src/app/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts`:
  - Hoisted `closed` variable outside `start()` so `cancel()` can access it
  - Added `fetchWithTimeout` helper with 8s timeout
  - Now uses `safeJson` for worker response
- `next/src/app/api/inhouse/projects/[id]/api-keys/[type]/regenerate/route.ts`:
  - Pass through worker status instead of hardcoding 201
  - Better error status logic (502 for JSON parse failures)

---

## Expert Code Review - Round 7 (Jan 2026)

Final polish round addressing previously skipped items.

### Fixed Issues (Round 7)

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| **requireProjectOwner helper** | P2 | **FIXED** | Created shared helper to reduce ownership check drift across routes. |
| **Locale-aware time in ApiKeysCard** | P2 | **FIXED** | Uses `useLocale()` + `Intl.DateTimeFormat` for proper locale formatting of key expiry times. |
| **DeployDialog timeout cleanup** | P2 | **FIXED** | Added `clearCloseTimeouts()` helper to prevent stale callbacks when scheduling new timeouts. |

### Files Changed (Round 7)

- **NEW** `next/src/lib/auth/require-project-owner.ts`:
  - Shared helper for project ownership verification
  - Returns `{ ok: true }` or `{ ok: false, response }` pattern
  - Reduces drift from copy/paste ownership checks

- `next/src/app/api/inhouse/projects/[id]/deployments/route.ts`:
  - Now uses `requireProjectOwner` helper

- `next/src/app/api/inhouse/projects/[id]/api-keys/[type]/regenerate/route.ts`:
  - Now uses `requireProjectOwner` helper

- `next/src/app/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts`:
  - Now uses `requireProjectOwner` helper

- `next/src/components/builder/infrastructure/ApiKeysCard.tsx`:
  - Added `useLocale()` from next-intl
  - Created memoized `Intl.DateTimeFormat` with `timeStyle: 'short', dateStyle: 'medium'`
  - Key expiry time now displays in user's locale format

- `next/src/components/builder/infrastructure/DeployDialog.tsx`:
  - Added `clearCloseTimeouts()` helper function
  - Clears pending timeouts before scheduling new ones (2 locations)
  - Cleanup effect now uses the helper

---

## Phase 1: Infrastructure - Detailed Analysis

### Implemented Features

#### Database Management
- **Project isolation**: Each project gets isolated PostgreSQL schema
- **Table creation**: Full UI with column types, nullability, primary keys, defaults
- **Schema browser**: View all tables with column metadata and row counts
- **Query console**: Execute SELECT queries with results display
- **SQL injection protection**: Identifier validation, parameterized queries, type allowlisting

**Key Files:**
- `worker/src/services/inhouse/InhouseProjectService.ts` - Core project/table management
- `worker/src/services/inhouse/InhouseGatewayService.ts` - Query execution with permissions
- `next/src/components/builder/infrastructure/CreateTableDialog.tsx`
- `next/src/components/builder/infrastructure/SchemaBrowser.tsx`
- `next/src/components/builder/infrastructure/QueryConsole.tsx`

#### Hosting & Deployments
- **Static assets**: Upload to Cloudflare R2 with SHA256 naming
- **SSR bundle**: Deploy to Workers for Platforms
- **Instant rollback**: KV-based routing (no redeploy required)
- **Deployment history**: Cursor-based pagination, status tracking
- **Live logs**: SSE streaming via deployment events table
- **Entry point validation**: Prevents path traversal attacks

**Key Files:**
- `worker/src/services/inhouse/InhouseDeploymentService.ts` - Full deployment pipeline
- `worker/migrations/061_deployment_events.sql` - Events table
- `next/src/app/api/inhouse/projects/[id]/deployments/[deploymentId]/logs/route.ts` - SSE endpoint
- `next/src/hooks/useDeploymentLogs.ts` - Client hook
- `next/src/components/builder/infrastructure/DeployDialog.tsx`
- `next/src/components/builder/infrastructure/DeploymentHistory.tsx`

#### API Keys
- **Dual keys**: Public (browser-safe, limited writes) and Server (full access)
- **Regeneration**: New key with 15-minute grace period for old key
- **Revocation**: Immediate invalidation
- **Rate limiting**: 3 regenerations/hour, 10/day per project

**Key Files:**
- `worker/src/routes/inhouseApiKeys.ts`
- `next/src/app/api/inhouse/projects/[id]/api-keys/[type]/regenerate/route.ts`

#### Quotas (Partial)
- **Tracking**: Database size, storage, request counts stored
- **Display**: UI shows usage percentages with progress bars

### Gaps to Address

| Gap | Severity | Effort | Notes |
|-----|----------|--------|-------|
| Request quota enforcement | Medium | S | Track per API key, reset daily |
| Storage size calculation | Low | S | Sum file sizes from R2 |
| Quota warnings/alerts | Low | M | Toast when approaching limits |

---

## Phase 2: Auth + CMS - Detailed Analysis

### Implemented Features

#### Authentication
- **Email/password**: Signup, signin with scrypt hashing (N=16384)
- **Sessions**: 7-day TTL, validation, sign-out with revocation
- **Magic links**: 15-minute TTL, auto-creates users, verification endpoint
- **Security**: Timing-safe comparison, proper salt handling

**Key Files:**
- `worker/src/services/inhouse/InhouseAuthService.ts`
- `worker/src/routes/inhouseAuth.ts`
- `next/src/components/builder/infrastructure/AuthStatusCard.tsx`
- `next/src/components/builder/infrastructure/AuthKitDialog.tsx`

#### CMS
- **Content types**: JSON schema storage, slug-based identification
- **Entries**: CRUD operations, draft/published/archived status
- **Localization**: Locale field on entries
- **Media**: Metadata storage (filename, MIME, size)

**Key Files:**
- `worker/src/services/inhouse/InhouseCmsService.ts`
- `worker/src/routes/inhouseCms.ts`
- `next/src/components/builder/infrastructure/CmsStatusCard.tsx`
- `next/src/components/builder/infrastructure/CmsManagerDialog.tsx`

### Gaps to Address

| Gap | Severity | Effort | Notes |
|-----|----------|--------|-------|
| OAuth providers | Medium | L | Google, GitHub at minimum |
| Email verification | Medium | M | Verify email before full access |
| Password reset | High | M | Critical for user experience |
| Session management UI | Low | S | List/revoke active sessions |
| Media file storage | High | M | R2 integration for actual files |
| Schema validation | Medium | M | Validate entries against type schema |
| Revision history | Low | L | Track entry changes over time |

---

## Phase 3: Domains/Export/Eject - Gap Analysis

### Current State

All Phase 3 features are **placeholder only** - routes exist but return generic responses or errors.

#### Custom Domains (0% functional)

**Existing:**
- Frontend UI with domain input field
- Worker routes: `GET/POST /projects/:id/domains`, `POST /domains/:domain/verify`
- Next.js proxy routes

**Missing:**
- DNS verification (CNAME record to `*.sheenapps.com` or TXT for verification)
- SSL certificate provisioning (Cloudflare for SaaS or Let's Encrypt)
- Domain → project routing in edge worker
- Domain status tracking (pending, verified, active, error)

**Implementation Approach:**
```
1. User adds domain → create pending record
2. User adds CNAME/TXT record at their DNS provider
3. Background job verifies DNS propagation
4. On verification → provision SSL via Cloudflare for SaaS
5. Update edge routing: custom domain → project subdomain
```

#### Data Export (0% functional)

**Existing:**
- Worker route: `POST /projects/:id/exports`
- `ExportJobsService` skeleton

**Missing:**
- Export job queue and processing
- Format selection (JSON, CSV, SQL dump)
- Selective export (specific tables, date ranges)
- Download link generation with expiry
- Export history and status tracking

**Implementation Approach:**
```
1. User requests export → create job record
2. Background worker processes job:
   - Query all project tables
   - Transform to selected format
   - Upload to R2 with signed URL
3. Notify user (email or in-app)
4. Provide download link (24h expiry)
```

#### Eject to Pro Mode (0% functional)

**Existing:**
- Worker route: `POST /projects/:id/eject`
- UI placeholder card

**Missing:**
- Data migration pipeline:
  - Export database schema + data
  - Export CMS content types + entries
  - Export media files
  - Generate Supabase migration files
- Infrastructure setup guidance:
  - Supabase project creation
  - Vercel deployment configuration
  - Environment variable mapping
- Billing/plan upgrade flow

**Implementation Approach:**
```
1. User clicks Eject → show requirements (Supabase account, etc.)
2. Generate export package:
   - SQL migrations for schema
   - JSON for CMS content
   - Media file URLs
3. Provide step-by-step setup guide
4. Mark project as "ejected" (read-only in Easy Mode)
```

---

## Security Audit Summary

### Implemented Security Measures

| Measure | Status | Location |
|---------|--------|----------|
| HMAC dual-signature auth | Active | All worker requests |
| Session-based auth | Active | User operations |
| Project ownership verification | Active | All project routes |
| CSRF protection | Active | Same-Origin checks |
| API key expiry/revocation | Active | Gateway validation |
| SQL injection prevention | Active | Parameterized queries + identifier validation |
| Path traversal prevention | Active | Deployment assets, entry points |
| Rate limiting | Active | API key regeneration |
| Timing-safe comparison | Active | Password verification |
| Scrypt password hashing | Active | N=16384, proper parameters |
| Request size limits | Active | Body size validation |
| Column-level permissions | Active | Gateway enforcement |

### Security Gaps to Address

| Gap | Severity | Notes |
|-----|----------|-------|
| No email verification | Medium | Users can auth with unverified emails |
| No brute-force protection on signin | High | Add rate limiting per IP/email |
| No audit logging | Medium | Track sensitive operations |
| Media upload validation | Medium | Validate file types, scan for malware |

---

## Implementation Priority Matrix

### High Priority (Ship Blockers)

1. **Password reset flow** - Users locked out without this
2. **Media file storage** - CMS unusable for real content
3. **Signin rate limiting** - Security requirement

### Medium Priority (Feature Complete)

4. **Custom domains** - Key differentiator for Pro tier
5. **Email verification** - Security best practice
6. **OAuth providers** - Reduces signup friction
7. **Data export** - User data ownership requirement

### Lower Priority (Nice to Have)

8. **Eject to Pro** - Complex, low immediate demand
9. **Quota enforcement** - Soft limits work initially
10. **Revision history** - CMS enhancement
11. **Session management UI** - Power user feature

---

## Estimated Effort

| Feature | Effort | Dependencies |
|---------|--------|--------------|
| Password reset | 2-3 days | Email service (already have for magic link) |
| Signin rate limiting | 1 day | None |
| Media file storage | 3-4 days | R2 bucket config |
| Custom domains | 1-2 weeks | Cloudflare for SaaS setup |
| Email verification | 2-3 days | Email templates |
| OAuth providers | 1 week | OAuth app setup per provider |
| Data export | 1 week | Background job infrastructure |
| Eject to Pro | 2-3 weeks | Export + migration generation |

---

## Architecture Notes

### Worker Service Structure

```
sheenapps-claude-worker/src/services/inhouse/
├── InhouseProjectService.ts    # Project CRUD, table creation
├── InhouseDeploymentService.ts # Deploy, rollback, history
├── InhouseGatewayService.ts    # Query execution, permissions
├── InhouseAuthService.ts       # Auth flows, sessions
└── InhouseCmsService.ts        # Content types, entries, media
```

### Frontend Component Structure

```
sheenappsai/src/components/builder/infrastructure/
├── InfrastructurePanel.tsx     # Main panel with tabs
├── DatabaseStatusCard.tsx      # DB overview
├── HostingStatusCard.tsx       # Hosting status
├── AuthStatusCard.tsx          # Auth config
├── CmsStatusCard.tsx           # CMS overview
├── ApiKeysCard.tsx             # Key management
├── QuotasCard.tsx              # Usage display
├── DeployButton.tsx            # Trigger deploy
├── DeployDialog.tsx            # Deploy confirmation + logs
├── DeploymentHistory.tsx       # Past deployments
├── CreateTableDialog.tsx       # Table creation
├── SchemaBrowser.tsx           # Schema viewer
├── QueryConsole.tsx            # SQL console
├── AuthKitDialog.tsx           # Auth setup
├── CmsManagerDialog.tsx        # CMS management
└── phase3/
    ├── Phase3PlaceholdersCard.tsx  # Coming soon badges
    └── Phase3ToolsPanel.tsx        # Domain/export/eject UI
```

### Database Tables (Inhouse-specific)

```sql
-- API Keys
inhouse_api_keys (id, project_id, key_type, key_hash, expires_at, revoked_at)

-- Deployments
inhouse_deployments (id, project_id, build_id, status, created_at, completed_at)
inhouse_deployment_events (id, deployment_id, ts, level, step, message, meta)

-- Auth
inhouse_users (id, project_id, email, password_hash, created_at)
inhouse_sessions (id, user_id, token_hash, expires_at, revoked_at)
inhouse_magic_links (id, project_id, email, token_hash, expires_at, used_at)

-- CMS
inhouse_content_types (id, project_id, name, slug, schema)
inhouse_entries (id, type_id, slug, status, locale, data, created_at, updated_at)
inhouse_media (id, project_id, filename, mime_type, size, url, metadata)
```

---

## Questions for Expert Review

1. **Custom domains**: Should we use Cloudflare for SaaS (managed) or self-manage with Workers + Let's Encrypt?

2. **Data export**: Is background job + R2 + signed URL the right approach, or should we stream directly to user?

3. **Eject flow**: Should ejected projects become read-only in Easy Mode, or should we delete them after migration confirmation?

4. **OAuth scope**: Start with Google + GitHub only, or include Apple/Microsoft from day one?

5. **Media storage**: Deduplicate by content hash across projects, or keep isolated per project for simpler deletion?

6. **Rate limiting**: Per-IP for signin attempts, or per-email (to prevent account enumeration)?

---

## Appendix: File Locations

### Worker (Backend)

| Component | Path |
|-----------|------|
| Services | `sheenapps-claude-worker/src/services/inhouse/` |
| Routes | `sheenapps-claude-worker/src/routes/inhouse*.ts` |
| Migrations | `sheenapps-claude-worker/migrations/` |

### Next.js (Frontend)

| Component | Path |
|-----------|------|
| API Routes | `sheenappsai/src/app/api/inhouse/` |
| UI Components | `sheenappsai/src/components/builder/infrastructure/` |
| Hooks | `sheenappsai/src/hooks/useDeploymentLogs.ts` |
| Translations | `sheenappsai/src/messages/*/infrastructure.json` |
