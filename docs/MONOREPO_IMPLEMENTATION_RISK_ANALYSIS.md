# Monorepo Implementation Risk Analysis

**Date:** 2026-01-31
**Purpose:** Honest assessment of implementation difficulty for MONOREPO_ANALYSIS_AND_PLAN.md
**Verdict:** Moderate difficulty (6/10) - achievable but not trivial

---

## Implementation Progress

### Summary of Work Done

Completed Tasks

1. Locale Utilities Consolidation ✅
   - Web app now imports core constants from @sheenapps/platform-tokens
   - 51 files maintain backward compatibility
   - Currency/pricing data stays web-local
2. Deployment Documentation ✅
   - Created docs/MONOREPO_DEPLOYMENT.md with Vercel settings, Docker examples, CI/CD pipeline
3. Typed Route Wrapper ✅
   - Created apps/worker/src/utils/defineRoute.ts
   - Validates request/response against Zod schemas
   - New routes can use contract-first pattern
   - Existing routes can migrate gradually

Current State
┌────────────┬─────────────────────────────────────────────────────────────────────────────────┐
│ Component  │                                     Status                                      │
├────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Packages   │ ✅ 4 packages (platform-tokens, contracts, capabilities, translations skeleton) │
├────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Web App    │ ✅ Moved, workspace packages linked, locale consolidated                        │
├────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Worker     │ ✅ Moved, workspace packages linked, defineRoute ready                          │
├────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Full Build │ ✅ 6 tasks pass (pnpm turbo build)                                              │
└────────────┴─────────────────────────────────────────────────────────────────────────────────┘

### Remaining

1. **Connect Vercel to new monorepo** - Update Vercel project to use new GitHub repo
2. **Verify locales in deployed environment** - Test actual Vercel deployment
3. **Set up GitHub Actions secrets** - Add TURBO_TOKEN and TURBO_TEAM for CI remote caching

### Optional/Future

1. Route migration - Gradually migrate remaining 160 routes to defineRoute (1 done)
2. Translations package - Deferred until mobile becomes active



### Status: 🟢 Substantially Complete

| Step | Status | Notes |
|------|--------|-------|
| Pre-1: Convert sheenappsai to pnpm | ✅ Done | Added 9 missing deps exposed by pnpm |
| Pre-2: Web move spike | ✅ Done | Turbopack root config fix required |
| Phase 0: Skeleton | ✅ Done | Completed as part of Pre-2 spike |
| Phase 1: Packages | ✅ Done | platform-tokens, translations (skeleton), contracts, capabilities |
| Phase 1: Mobile | ⏸️ Skipped | Mobile was exploratory, not ready for monorepo |
| Phase 2: Web | ✅ Done | Workspace packages linked, locale config consolidated |
| Phase 3: Worker | ✅ Done | Moved to apps/worker, defineRoute utility added |
| Phase 4: CI | ✅ Done | turbo.json optimized + GitHub Actions CI workflow |

**Full turbo build:** 6 tasks successful (4 packages + 2 apps)

### Implementation Log

#### 2026-01-31: Pre-1 (pnpm conversion) COMPLETED ✅
- Converted sheenappsai from npm to pnpm
- Updated `packageManager` field to `pnpm@10.28.2`
- Kept `.npmrc` using `NODE_AUTH_TOKEN` (consistent with CI workflows)
- Added pnpm-specific settings: `auto-install-peers=true`, `strict-peer-dependencies=false`
- **Build successful after adding missing dependencies**

#### 2026-01-31: Pre-2 (Web move spike) COMPLETED ✅
- Created monorepo skeleton at `/Users/sh/Sites/sheenapps/`:
  - Root `package.json` with Turborepo
  - `pnpm-workspace.yaml` defining `apps/*` and `packages/*`
  - `turbo.json` with build/dev/lint/test tasks
  - Root `.npmrc` for GitHub Packages auth
- Moved `sheenappsai` → `apps/web/`
- Renamed package to `@sheenapps/web`
- **Key fix required:** `outputFileTracingRoot` and `turbopack.root` must both point to monorepo root
- Build successful via both `pnpm --filter @sheenapps/web build` and `pnpm build` (turbo)
- Files created:
  - `/Users/sh/Sites/sheenapps/package.json` (root)
  - `/Users/sh/Sites/sheenapps/pnpm-workspace.yaml`
  - `/Users/sh/Sites/sheenapps/turbo.json`
  - `/Users/sh/Sites/sheenapps/.npmrc`
  - `/Users/sh/Sites/sheenapps/.envrc`
  - `/Users/sh/Sites/sheenapps/packages/` (empty, ready for Phase 1)
- Files modified:
  - `apps/web/package.json` - renamed to `@sheenapps/web`
  - `apps/web/next.config.ts` - added `path` import, updated `outputFileTracingRoot` and `turbopack.root`

#### 2026-01-31: Phase 1 Packages COMPLETED ✅
Created 4 workspace packages:

1. **@sheenapps/platform-tokens** - Locale registry, currencies, utilities
   - Single source of truth for supported locales
   - RTL detection, locale normalization
   - Currency mappings per locale

2. **@sheenapps/translations** (skeleton) - i18n infrastructure
   - Build-time locale merging script
   - Framework adapters (next-intl, i18next)
   - Actual translation file migration is follow-up task

3. **@sheenapps/api-contracts** - Copied from sheenapps-packages
   - Zod schemas for API contracts
   - Already used by web app
   - Made workspace-local (private: true)

4. **@sheenapps/capabilities** - Feature/plan vocabulary
   - Feature and plan type definitions
   - UI display helpers (formatLimit, shouldShowUpgrade)
   - Entitlements shape for worker responses

Full turbo build: 5 tasks successful (4 packages + web)

#### 2026-01-31: Expert Review Fixes Applied ✅

Applied selective fixes from expert code review:

1. **contracts: Added .js extensions** - Node ESM requires `.js` extensions in imports
   - Fixed all exports in `src/index.ts` to use `.js` suffix

2. **contracts: External zod** - Added `external: ['zod']` to tsup config
   - Prevents bundling zod (consumers provide their own)
   - Avoids duplicate zod instances causing schema issues

3. **translations: Single source of truth** - build-locales.ts now imports from platform-tokens
   - Removed hardcoded `SUPPORTED_LOCALES` and `BASE_LOCALE_MAP`
   - Now imports from `@sheenapps/platform-tokens`

4. **platform-tokens: Improved normalizeLocale()** - Better input handling
   - Uses `replace(/_/g, '-')` to handle all underscores (not just first)
   - Strips Unicode extensions (e.g., `en_US_u_ca_gregory` → `en`)

5. **capabilities: UPGRADE_THRESHOLD constant** - Removed magic number
   - Added `export const UPGRADE_THRESHOLD = 0.8`
   - Used in `shouldShowUpgrade()` and `getFeatureStatus()`

All 4 packages rebuild successfully after fixes.

#### 2026-02-01: Second Expert Review Fixes Applied ✅

Additional fixes from second code review:

1. **capabilities: Fixed isAtLimit() semantics** - Now returns `false` for blocked features
   - "Blocked" and "at limit" are semantically different states
   - Use `isFeatureBlocked()` to check if feature is unavailable
   - Use `isAtLimit()` to check if enabled feature has exhausted quota

2. **contracts: Tightened ApiErrorSchema** - Added type safety
   - `code` now uses `ErrorCodeSchema` instead of `z.string()` (enforces valid codes)
   - Added `.strict()` to prevent extra fields in responses
   - Added optional `details` field for structured error data

3. **contracts: Added .strict() to apiResponseSchema** - Prevents payload creep
   - Both success and error response shapes are now strict

#### 2026-02-01: Phase 2 Web Integration STARTED 🟡

Switched web app to use workspace packages:

1. **@sheenapps/api-contracts** - Changed from `^0.1.1` (GitHub Packages) to `workspace:*`
2. **@sheenapps/platform-tokens** - Added as `workspace:*` dependency
3. **@sheenapps/capabilities** - Added as `workspace:*` dependency

Full turbo build: 5 tasks successful (4 packages + web)

**Remaining Phase 2 tasks:**
- [x] Workspace packages linked (api-contracts, platform-tokens, capabilities)
- [ ] ~~Translations integration~~ **DEFERRED** - see note below
- [x] Refactor `apps/web/src/i18n/config.ts` to use @sheenapps/platform-tokens
- [x] Update Vercel build settings documentation (see `docs/MONOREPO_DEPLOYMENT.md`)
- [ ] Verify all 9 locales work in deployed environment

**Translations Integration - DEFERRED:**
- 334 translation files across 35 namespaces × 9 locales
- Current setup uses generated static loader (already follows best practices)
- Mobile is skipped/exploratory - no immediate consumer for shared translations
- The `@sheenapps/translations` package skeleton is ready when mobile becomes real
- **Decision:** Proceed to Phase 3 (Worker) which has more immediate value

#### 2026-02-01: Phase 3 Worker Migration COMPLETED ✅

Moved worker to monorepo:

1. **Copied** `sheenapps-claude-worker/` → `apps/worker/`
2. **Renamed** package to `@sheenapps/worker`
3. **Switched to workspace packages:**
   - `@sheenapps/api-contracts`: workspace:*
   - `@sheenapps/platform-tokens`: workspace:*
   - `@sheenapps/capabilities`: workspace:*
4. **Fixed pre-existing build error:** Added `getDatabase` re-export to `databaseWrapper.ts`
5. **Updated packageManager** to match root (pnpm@10.28.2)

Full turbo build: 6 tasks successful (4 packages + 2 apps)

**Note:** The `@sheenapps/templates` package remains on GitHub Packages (^1.0.0) for now.
It's used by both web and worker but is designed for Easy Mode customer apps, so
keeping it published makes sense. Can be evaluated for workspace inclusion later.

#### 2026-02-01: Locale Utilities Consolidation COMPLETED ✅

Consolidated web app's locale config to use `@sheenapps/platform-tokens` as single source of truth:

1. **Imported core constants from platform-tokens:**
   - `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `SupportedLocale`
   - `RTL_LOCALES`, `isRTL`, `getDirection`
   - `LOCALE_CONFIG` (as `BASE_LOCALE_CONFIG`)

2. **Re-exported for backward compatibility:**
   - All 51 files importing from `@/i18n/config.ts` continue to work unchanged

3. **Extended with web-specific data:**
   - `CURRENCY_CONFIG` - currency codes and symbols per locale
   - `localeConfig` - merged base config with currency fields
   - `regionalPricing` - business logic (stays web-only)
   - `localeFallbacks` - translation fallback chains (stays web-only)
   - `en-XA` pseudo-locale - dev testing (stays web-only)

**Benefits:**
- Core locale data now has single source of truth (platform-tokens)
- Web-specific extensions (currency, pricing) stay local
- Full backward compatibility - no changes needed in 51 consuming files
- Worker and web share the same locale definitions

Full turbo build: 6 tasks successful (4 packages + 2 apps)

#### 2026-02-01: Typed Route Wrapper Added ✅

Created `defineRoute` utility in `apps/worker/src/utils/defineRoute.ts`:

**What it does:**
- Validates request body, URL params, and query against Zod schemas
- Validates response data against Zod schema (catches bugs TypeScript misses)
- Automatically wraps responses in `{ ok: true, data }` format
- Provides typed handler context
- Error helpers for common cases (notFound, unauthorized, etc.)

**Usage example:**
```typescript
import { RequestCodeSchema, RequestCodeResponseSchema } from '@sheenapps/api-contracts';
import { defineRoute } from '../utils/defineRoute';

app.post('/v1/auth/request-code', defineRoute(
  { request: RequestCodeSchema, response: RequestCodeResponseSchema },
  async (input, { request, reply }) => {
    // input is fully typed from schema
    // return is validated against response schema
    return { success: true, expiresIn: 300 };
  }
));
```

**Migration strategy:**
- New routes should use `defineRoute`
- Existing routes can be migrated gradually
- No immediate refactoring required

#### 2026-02-01: Deployment Documentation Added ✅

Created `docs/MONOREPO_DEPLOYMENT.md` with:
- Vercel project settings (root directory, build/install commands)
- Worker Docker deployment example
- Local development commands
- CI/CD pipeline example
- Troubleshooting guide

#### 2026-02-01: Phase 4 CI Optimization ✅

Enhanced `turbo.json` with better caching configuration:

**Changes:**
- Added `globalDependencies` for env files and root tsconfig
- Added `inputs` arrays to specify which files trigger rebuilds
- Added `outputs` arrays to specify cached outputs
- Added `env` configuration for test task
- Added both `type-check` and `typecheck` tasks for compatibility

**Benefits:**
- Better cache hit rates (only rebuild when relevant files change)
- Faster CI runs with proper incremental builds
- All 4 packages pass `pnpm turbo type-check`

**Remaining CI items (optional):**
- Remote caching (requires Vercel account linking)
- GitHub Actions workflow optimization

#### 2026-02-01: Mobile Document Updated ✅

Updated `docs/MOBILE_APP_ANALYSIS_AND_IMPLEMENTATION_PLAN.md`:
- Clarified mobile is an app (`apps/mobile/`), not a package
- Added migration steps for moving standalone repo into monorepo
- Added Metro config example for workspace symlinks
- Updated EAS build commands

#### 2026-02-01: GitHub Actions CI Workflow Added ✅

Created `.github/workflows/ci.yml`:
- Runs on push to main and PRs
- Uses pnpm with caching
- Parallel jobs: packages build → web build + worker build
- Tasks: build, type-check, lint, test
- Summary job for branch protection status

**Structure:**
1. `build` job - Builds packages, runs type-check/lint/test
2. `build-web` job - Builds web app (depends on packages)
3. `build-worker` job - Builds worker (depends on packages)
4. `ci-success` job - Aggregates results for branch protection

#### 2026-02-01: Platform Auth Contracts Added ✅

Created `packages/contracts/src/platform-auth.ts` with Zod schemas:
- `RequestCodeSchema` + `RequestCodeResponseSchema`
- `VerifyCodeSchema` + `VerifyCodeResponseSchema`
- `RefreshTokenSchema` + `RefreshTokenResponseSchema`
- `LogoutSchema` + `LogoutResponseSchema`

Added new error codes to `ErrorCodeSchema`:
- `INVALID_EMAIL`, `INVALID_CODE`, `CODE_EXPIRED`
- `TOO_MANY_ATTEMPTS`, `USER_NOT_FOUND`
- `INVALID_TOKEN`, `TOKEN_REVOKED`

#### 2026-02-01: First Route Migration to defineRoute ✅

Migrated `apps/worker/src/routes/platformMobileAuth.ts` to use contract-first pattern:
- 4 routes now use `defineRoute` with typed contracts
- Removed manual validation code (Zod handles it)
- Error handling via `RouteErrors` helpers
- Response validation catches type mismatches at runtime

**Pattern for future migrations:**
```typescript
const contract = {
  request: RequestSchema,
  response: ResponseSchema,
} as const;  // Important: use 'as const' for type inference

app.post('/route', defineRoute(contract, async (input, { request }) => {
  // input is fully typed from schema
  return { ... }; // validated against response schema
}));
```

**Discovery:** Must use `as const` on contract objects to preserve type inference. Without it, TypeScript widens to `RouteContract<ZodTypeAny, ZodTypeAny>` and input becomes `unknown`.

#### 2026-02-01: Git Repository Setup COMPLETED ✅

Set up consolidated monorepo git repository:

1. **Removed old nested git repos** - `apps/web/.git` and `sheenapps-mobile/.git`
2. **Initialized fresh repo at root** - `/Users/sh/Sites/sheenapps/`
3. **Updated .gitignore** - Added `.envrc` and `*.pem` to prevent secret leakage
4. **Pushed to GitHub** - New private repo for the monorepo

**Security note:** Previous `.envrc` contained exposed GitHub token - user advised to revoke.

#### 2026-02-01: Turbo Remote Caching Enabled ✅

User ran `npx turbo login && npx turbo link` to enable Vercel remote caching.

**Benefits:**
- Faster CI builds (reuses cached artifacts across machines)
- Faster local builds after pulling (reuses team's cached builds)

**Next:** Add `TURBO_TOKEN` and `TURBO_TEAM` to GitHub Actions secrets.

#### 2026-02-01: Personal GitHub Repository Connected ✅

Successfully pushed monorepo to personal GitHub repo:
- **Repository:** `https://github.com/sseshaheen/sheenapps.git`
- **Branch:** main
- **Previous org repo issues:** Push protection blocked due to secrets in history
- **Resolution:** Fresh git init with clean history (no secrets in commit history)

**Note:** Old SheenApps org repo should be deleted or archived to avoid confusion.

---

## Improvement Opportunities

### ~~Opportunity 1: Consolidate Locale Configuration~~ ✅ COMPLETED

**Status:** Implemented 2026-02-01

**What was done:**
- Web app now imports core locale constants from `@sheenapps/platform-tokens`
- Currency data (`CURRENCY_CONFIG`) stays in web (web-specific)
- Regional pricing and locale fallbacks stay in web (business logic)
- Full backward compatibility maintained (51 files unchanged)

See "Locale Utilities Consolidation" implementation log entry above.

### Opportunity 2: Move Translation Files to Workspace Package

**Current state:** Web app has 9 locales of translation files in `apps/web/messages/`

**Benefits of moving to `@sheenapps/translations`:**
- Single source of truth for all apps
- Build-time merging (regional variants inherit from base)
- Namespace organization (common, auth, billing, projects, errors)
- CI coverage checks per namespace

**Blockers:**
- Need to verify next-intl can load from workspace package
- Translation file structure may need adjustment
- Requires updating all `useTranslations` call sites

**Effort:** Medium | **Priority:** High (blocks mobile i18n) | **Risk:** Medium

### Opportunity 3: Templates Package to Workspace

**Current state:** `@sheenapps/templates` is published to GitHub Packages, not a workspace package.

**Consideration:** Should this be a workspace package like contracts?

**Decision:** Keep as published package for now:
- Templates may be used by generated customer apps
- Publishing gives version control and rollback capability
- Can revisit if we need tighter integration

### ~~Opportunity 4: CI Optimization (Phase 4)~~ ✅ COMPLETE

**Status:** Completed 2026-02-01

**What was done:**
- Enhanced `turbo.json` with inputs/outputs/caching configuration
- All packages pass `pnpm turbo type-check`
- Better cache hit rates for incremental builds
- Created `.github/workflows/ci.yml` with parallel jobs for packages/web/worker

**Remaining (optional):**
1. **Turbo remote caching** - Faster CI by reusing cached builds across machines
   - Requires `npx turbo login && npx turbo link`
2. **PR deploy previews for worker** - Vercel handles web; worker needs separate setup

### Opportunity 5: Migrate Routes to defineRoute - IN PROGRESS 🟡

**Status:** Started 2026-02-01 (1 of 161 route files migrated)

**Progress:**
- ✅ `platformMobileAuth.ts` - 4 routes migrated (request-code, verify-code, refresh, logout)
- Added platform auth contracts to `@sheenapps/api-contracts`
- Discovered: Must use `as const` on contract objects for type inference

**Migration approach:**
1. Start with new routes - require `defineRoute` for any new endpoints
2. Migrate high-value routes first - auth, billing, entitlements
3. Add contracts to `@sheenapps/api-contracts` as routes are migrated
4. Eventually all routes use contract-first pattern

**Priority order for remaining routes:**
- `billing.ts`, `billingOverview.ts` - Payment-critical
- `builds.ts`, `buildStream.ts` - Core functionality
- `vercelWebhooks.ts`, `webhook.ts` - External integrations

**Effort:** Medium (ongoing) | **Priority:** Medium | **Risk:** Low

---

## Discoveries & Improvements

### Discovery 1: Missing Dependencies (npm hoisting masked these)

pnpm's stricter resolution exposed several missing dependencies that npm had been hoisting from transitive deps:

| Missing Package | Used By | Status |
|-----------------|---------|--------|
| `uuid` | Admin routes, API routes | ✅ Added |
| `@types/uuid` | Type declarations | ✅ Added |
| `prismjs` | Code highlighting | ✅ Added |
| `@types/prismjs` | Type declarations | ✅ Added |
| `lodash` | Debounce in admin UI | ✅ Added |
| `@types/lodash` | Type declarations | ✅ Added |
| `@supabase/auth-js` | Direct imports of Supabase types | ✅ Added |
| `@supabase/postgrest-js` | Direct imports | ✅ Added |
| `@supabase/realtime-js` | Direct imports | ✅ Added |

**Root cause:** npm hoists transitive dependencies, making them accidentally available. pnpm doesn't do this, which is actually correct behavior - if you use a package, you should declare it.

**Improvement opportunity:** The Supabase sub-packages (`@supabase/auth-js`, etc.) shouldn't be imported directly. They should be imported from `@supabase/supabase-js`. This is a tech debt item to fix later.

### Discovery 2: Peer Dependency Warnings (Not Blockers)

These warnings appear but don't break the build:
- `@sentry/nextjs` expects Next.js 13-15, we have 16
- `openai` expects zod@^3.23.8, we have zod 4.x
- `qrcode.react` expects React 16-18, we have 19

These are using newer major versions that aren't yet in the packages' peer dep ranges. They work fine.

### Discovery 3: Turbopack Root Configuration in Monorepos (CRITICAL)

When using Next.js 16 with Turbopack in a pnpm workspace monorepo, **both** `outputFileTracingRoot` and `turbopack.root` must be set to the **monorepo root**, not the app root.

**Error without fix:**
```
Error: Next.js inferred your workspace root, but it may not be correct.
We couldn't find the Next.js package (next/package.json) from the project directory
```

**Fix in `next.config.ts`:**
```typescript
import path from 'path';

const nextConfig: NextConfig = {
  // Both must point to monorepo root (two directories up from apps/web/)
  outputFileTracingRoot: path.resolve(__dirname, '../..'),

  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
}
```

**Important:** Next.js 16 warns if these two values differ and uses `outputFileTracingRoot` as the canonical value.

### Discovery 4: Phase 1 Recommendations (Expert Review)

**Package build strategy**: Use Option A (build to dist)
- Each package emits `dist/` (JS + .d.ts)
- Mobile + web consume normal JS
- Fewer Metro/workspace headaches with Expo/EAS later

**Phase 1 sequencing** (recommended order):
1. `@sheenapps/platform-tokens` - locale registry lives here
2. `@sheenapps/translations` - depends on locale registry
3. `@sheenapps/contracts` - API contracts
4. `@sheenapps/capabilities` - feature flags

**Turbo filter syntax** (once packages exist):
```bash
# Use turbo with ... suffix to build deps first
turbo run build --filter=@sheenapps/web...
```

**Don't rename aggressively**: Package renamed to `@sheenapps/web` is fine, but avoid touching internal import aliases, folder structure, or lint/test config until packages are integrated.

### Discovery 5: Vercel CLI Uses npm By Default

Running `vercel build` locally uses `npm install` even when the project has `pnpm-lock.yaml`. For local testing:
- Use `pnpm build` directly (works correctly)
- For Vercel deployments, configure in Vercel Dashboard:
  - Install Command: `pnpm install`
  - Build Command: `pnpm build` or `turbo run build --filter=@sheenapps/web`
  - Root Directory: `apps/web`

### Discovery 6: TypeScript Type Check Has Many Errors

Running `pnpm run type-check` shows many errors related to `User.id` not existing. This is a pre-existing issue - the `strict: false` in tsconfig means the build still works. These should be fixed eventually but don't block the monorepo migration.

### Improvement: Add Missing Dependencies to package.json Proactively

Before migrating to monorepo, audit imports vs declared dependencies:
```bash
# Find imports that might be missing from package.json
grep -rh "from '" src/ | grep -v node_modules | sort -u | head -50
```

---

## Executive Summary

The migration is **doable but will require discipline**. Your codebases are well-structured with clean boundaries, which is good. But you have two large codebases (733K LOC combined), different package managers, and complex build configs that will create friction.

**The honest truth:**
- Phase 1 (packages only) = relatively smooth
- Moving mobile = easy (it's tiny)
- Moving web/worker = this is where it gets tricky


---

###  Summarized Plan

Pre-Migration (De-risk First)

1. Convert sheenappsai to pnpm (in its own repo)
2. Do web move spike (1-2 days) - skeleton + move web only, verify builds work
3. If spike is smooth → proceed. If gnarly → fall back to MVMono.

---
Phase 0: Skeleton (1 day)

- Create monorepo root with Turborepo + pnpm
- Set up root .npmrc for GitHub Packages auth
- Basic CI

Phase 1: Packages + Mobile (5-7 days)

- Create @sheenapps/translations, contracts, platform-tokens, capabilities
- CI guardrails (boundary lint, translations coverage, typecheck)
- EAS readiness checklist
- Move mobile to apps/mobile/

Phase 2: Web Migration (5-8 days) ← The hard part

- Move sheenappsai to apps/web/
- Set Vercel Root Directory to apps/web
- Fix path/root assumptions
- Verify Vercel deploy from branch

Phase 3: Worker Migration (4-6 days)

- Move worker to apps/worker/
- Implement typed route wrapper (contracts-first)
- Verify HMAC auth still works

Phase 4: CI Optimization (2 days)

- Turbo remote caching
- PR template enforcing Rules A-E

---
Fallback: MVMono (if timing is tight)

- Do only packages (Phase 1)
- Publish to GitHub Packages (private)
- Apps stay in separate repos, install packages normally
- Move apps post-launch

---

## Current State Assessment

### Codebase Sizes

| Repo | Files | Lines of Code | Complexity |
|------|-------|---------------|------------|
| sheenappsai (web) | 2,204 | 439,345 | High (Next.js + i18n + Sentry) |
| sheenapps-claude-worker | 736 | 293,495 | Medium (Fastify + jobs) |
| sheenapps-mobile | 19 | 1,796 | Low (early stage) |
| sheenapps-packages | 172 | ~21,000 | Low (already structured) |

**Total LOC to migrate:** ~755K lines across 3,131 files

*Note: Current node_modules sizes (1.7GB + 653MB) will shrink significantly under pnpm workspaces, which uses a shared store with symlinks. The real risks in pnpm-land are install determinism, CI caching, and tools that expect "real" node_modules.*

### The Good News

1. **Clean logical boundaries** - Apps don't import from each other directly
2. **Already have shared packages** - `@sheenapps/api-contracts` and `@sheenapps/templates` exist
3. **Mobile is tiny** - Only 19 files, easy to move
4. **No existing monorepo tool lock-in** - Starting fresh, not unwinding Lerna/Nx
5. **Well-structured SDK packages** - 25 packages already organized

### The Concerning News

1. **Package manager mismatch** - Web uses npm, worker uses pnpm
2. **Complex Next.js config** - 280+ lines with Sentry, i18n, React Compiler
3. **Different testing frameworks** - Vitest + Jest + Playwright (web) vs Jest (worker)
4. **22 npm scripts in web app** - Complex orchestration that must keep working
5. **GitHub Packages auth** - Both apps use tokens in `.npmrc`
6. **Different env strategies** - `.env.local` (web) vs `.env` + dotenv (worker)

---

## Risk-by-Risk Analysis

### Risk 1: Package Manager Unification
**Severity: MEDIUM-HIGH** | Likelihood: Medium | Impact: High if discovered late

You must pick one: npm or pnpm. Given pnpm's efficiency at this scale, pnpm is recommended.

**What could go wrong:**
- Lockfile drift and "works on my machine" dependency resolution differences
- pnpm's stricter peer dependency enforcement surfaces latent issues
- postinstall scripts may behave differently
- Some packages have symlink assumptions that break under pnpm

**Mitigation:**
- Convert web to pnpm first, in isolation, before monorepo move
- **Confirm `pnpm install && pnpm build` is stable before any directory move**
- Run full test suite after conversion
- Budget 2-3 days just for this

**Difficulty: 3/10** (tedious but straightforward)

---

### Risk 2: Next.js Config Complexity
**Severity: HIGH**

Your `next.config.ts` is 280+ lines with:
- Sentry plugin wrapping
- i18n configuration (9 locales)
- React Compiler (experimental)
- Custom redirects and headers
- Bundle analyzer
- optimizePackageImports

**What could go wrong:**
- Sentry plugin may have assumptions about project root
- i18n paths may break with different root
- Output tracing (for Vercel) may miscalculate dependencies
- Build may pick up wrong tsconfig

**Mitigation:**
- Don't touch next.config.ts during move
- Move web app as-is, verify build, THEN optimize
- Test Vercel deploy from monorepo branch before merging

**Difficulty: 5/10** (usually works, but debugging is painful when it doesn't)

---

### Risk 3: TypeScript Configuration Cascade
**Severity: MEDIUM**

Current state:
- Web: single tsconfig with `@/*` paths
- Worker: dual tsconfig (strict + standard)
- Packages: 24 individual tsconfigs

**What could go wrong:**
- Path aliases may resolve incorrectly
- `extends` chains may break
- IDE may pick up wrong config
- Build may use different config than IDE

**Mitigation:**
- Create root `tsconfig.base.json` first
- Each app `extends` the base
- Keep path aliases app-local (don't share `@/*`)
- Test both `tsc` and IDE resolution

**Difficulty: 4/10** (annoying but well-documented patterns exist)

---

### Risk 4: Test Infrastructure Fragmentation
**Severity: MEDIUM**

Current state:
- Web: Vitest (unit) + Jest (some) + Playwright (e2e) - 99 test files
- Worker: Jest only - 21 test files
- Mobile: No tests

**What could go wrong:**
- Jest config conflicts between web and worker
- Vitest and Jest may fight over same files
- Test coverage reporting becomes fragmented
- CI time increases (multiple test runners)

**Mitigation:**
- Don't consolidate test frameworks during migration
- Each app keeps its own test config
- Turborepo runs tests per-app, not globally
- Consolidation is a post-migration optimization

**Difficulty: 3/10** (just don't try to unify during migration)

---

### Risk 5: GitHub Packages Authentication
**Severity: MEDIUM**

Both apps have `.npmrc` with GitHub token for `@sheenapps/*` packages.

**What could go wrong:**
- Root `.npmrc` must work for all workspace packages
- CI must have correct token at root level
- Token permissions must cover all packages

**Mitigation:**
- Set up root `.npmrc` with `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}`
- Test `pnpm install` at root with fresh clone
- Update CI to set token before install

**Difficulty: 2/10** (usually one-time setup)

---

### Risk 6: Environment Variable Strategy
**Severity: MEDIUM**

Current state:
- Web: 14+ env files (`.env.local`, `.env.production`, `.env.sentry`, etc.)
- Worker: 8+ env files with different naming

**What could go wrong:**
- Apps may accidentally read each other's env files
- Vercel/deploy may not find env files in new locations
- Local dev may break if `.env` resolution changes

**Mitigation:**
- Each app keeps its own `.env*` files in `apps/web/` and `apps/worker/`
- Don't try to unify env files
- Document which env files go where
- Test local dev thoroughly

**Difficulty: 3/10** (keep them separate, don't overthink)

---

### Risk 7: EAS/Metro for Mobile
**Severity: LOW (for now)**

Mobile is tiny (19 files), but EAS + pnpm workspaces can be tricky.

**What could go wrong:**
- Metro can't resolve workspace symlinks
- EAS build fails to find workspace packages
- iOS and Android builds fail differently

**Mitigation:**
- This is why Phase 1 tests packages via `pnpm link` first
- EAS readiness checklist in the plan is comprehensive
- Mobile is small, so debugging is manageable

**Difficulty: 4/10** (known issues, documented solutions)

---

### Risk 8: Git History
**Severity: LOW**

You have 3 separate git repos. Options:
1. **Fresh start** - New repo, copy files, lose history
2. **Subtree merge** - Preserve history but complex
3. **git filter-repo** - Rewrite history into subdirectories

**What could go wrong:**
- Subtree merge creates confusing history
- Losing history makes debugging old bugs harder
- PRs in flight during migration get orphaned

**Mitigation:**
- Recommended: Fresh start for monorepo, keep old repos archived
- Most history value is recent anyway
- Link old repos in monorepo README for historical reference

**Difficulty: 2/10** (just accept fresh start)

---

---

## Additional Gotchas (Often Missed)

### Gotcha 1: Root .npmrc + pnpm --filter

Your auth section mentions GitHub Packages tokens, but the real gotcha is WHERE the token is picked up.

**Common failure:**
- Root `.npmrc` works locally
- CI uses `pnpm --filter web build` or builds in a subdir
- Token isn't picked up the same way
- Install fails only in CI

**Mitigation:**
- CI step should print effective registry config (without leaking token): `pnpm config list`
- Fresh clone install in CI is a **hard gate**, not optional
- Test `pnpm --filter` commands specifically, not just root install

---

### Gotcha 2: "App Root Assumptions" Beyond Next.js

It's not just `next.config.ts`. These often assume repo root:
- Playwright config paths
- ESLint config resolution (especially `extends`)
- Sentry config file locations
- Scripts that reference `../` or absolute paths
- `process.cwd()` assumptions in tooling scripts

**Mitigation:**
Before moving web, run:
```bash
grep -r "process.cwd()" apps/web/
grep -r "\.\.\/" apps/web/scripts/
grep -r "__dirname" apps/web/
```

Expect to patch 3-5 scripts even if "config is frozen."

---

### Gotcha 3: Zod Version Conflicts

Listed as "minor" earlier, but can become major if:
- One app uses Zod 3.x.A
- Another uses Zod 3.x.B
- Your contracts package exports schemas
- Schemas get duplicated in the bundle (different Zod instances)

**Mitigation:**
Pin one Zod version at workspace root:
```json
// package.json at root
{
  "pnpm": {
    "overrides": {
      "zod": "3.23.8"
    }
  }
}
```

---

### Gotcha 4: Vercel Monorepo Specifics

Not hard, but often forgotten:
- **Root Directory** must be set to `apps/web` in Vercel project settings
- Build command: `pnpm --filter web build` or `turbo run build --filter=web`
- Install command: `pnpm install` (at root, not in apps/web)
- Environment variables are per-project in Vercel; file-based `.env` is local-only

---

### Gotcha 5: Workspace Boundary Enforcement

The plan mentions "workspace boundary lint" but doesn't specify HOW.

**Pick one (any is fine, ambiguity is the enemy):**

Option A: ESLint `no-restricted-imports`
```js
// .eslintrc.js
rules: {
  'no-restricted-imports': ['error', {
    patterns: ['@sheenapps/web/*', '@sheenapps/worker/*', '../apps/*']
  }]
}
```

Option B: `eslint-plugin-boundaries`
```bash
pnpm add -D eslint-plugin-boundaries
```

Option C: TypeScript path boundaries (in `tsconfig.json`)

**Commit to one in Phase 1.**

---

## Phase-by-Phase Difficulty

### Phase 0: Preparation
**Difficulty: 2/10**
- Create empty monorepo skeleton
- Set up Turborepo + pnpm
- Basic CI

**Time estimate:** 1 day
**What could go wrong:** Almost nothing

---

### Phase 1: Packages + Mobile
**Packages difficulty: 2-3/10** | **Mobile difficulty: 3-4/10**
- Create internal packages (translations, contracts, etc.)
- Link to existing mobile via pnpm link
- Move mobile to monorepo

**Time estimate:** 2-3 days for packages, 1-2 days for mobile
**What could go wrong:**
- Zod version conflicts (fix with pnpm overrides)
- TypeScript config inheritance issues
- Metro/EAS workspace resolution (mostly documented solutions)
- Blocker: None expected

---

### Phase 2: Web Migration
**Difficulty: 6-7/10** ← This is the cliff
- This is the hard one
- 439K LOC, complex Next.js config, 22 npm scripts

**Time estimate:** 3-5 days
**What could go wrong:**
- Vercel build fails (output tracing wrong)
- Vercel Root Directory not set correctly
- Sentry config breaks (wrong root assumption)
- i18n paths resolve incorrectly
- Path aliases break
- Some npm scripts don't work with pnpm
- Playwright config can't find tests
- `process.cwd()` assumptions in scripts

**Debugging time:** Budget 2 extra days for surprises

**Before committing to full migration, do a "web move spike"** (see below)

---

### Phase 3: Worker Migration
**Difficulty: 5-6/10**
- Large codebase but simpler config than web
- Main risk: ensuring contracts-first model works
- Contract conformance work (typed route wrapper)

**Time estimate:** 2-3 days
**What could go wrong:**
- Jest config conflicts
- Fastify plugin resolution changes
- Worker auth (HMAC) breaks due to path changes
- Test routing changes
- Contract conformance requires touching route handlers

**Debugging time:** Budget 1 extra day

---

### Phase 4: CI Hardening
**Difficulty: 3/10**
- Setting up Turborepo pipelines
- Getting caching working

**Time estimate:** 1-2 days
**What could go wrong:**
- Remote caching setup
- CI token permissions

---

## Realistic Timeline

| Phase | Optimistic | Realistic | Pessimistic |
|-------|------------|-----------|-------------|
| Phase 0 | 1 day | 1 day | 2 days |
| Phase 1 | 3 days | 5 days | 7 days |
| Phase 2 | 3 days | 5 days | 8 days |
| Phase 3 | 2 days | 4 days | 6 days |
| Phase 4 | 1 day | 2 days | 3 days |
| **Total** | **10 days** | **17 days** | **26 days** |

**17 engineering-days often becomes 3-4 calendar weeks** due to interruptions, deploy debugging, review cycles, and context switching. Budget accordingly.

---

## The "MVMono" Escape Hatch

If full migration is too risky pre-launch, the plan includes a fallback:

**Just do packages, don't move apps.**

```
sheenapps-packages/           # Expanded with internal packages
├── translations/
├── contracts/
├── platform-tokens/
├── capabilities/
└── sdk-*/

# Apps stay in separate repos
```

**Important:** `workspace:*` only works inside a single pnpm workspace. If apps stay in separate repos, your options are:

| Method | Pros | Cons |
|--------|------|------|
| **Git submodule** | Apps include packages repo as submodule | Submodule management overhead |
| **Publish to GitHub Packages** | Clean dependency, versioned | Need to publish on every change |
| **pnpm link** | Fast local dev | Not CI-friendly, local only |

**Recommended for MVMono:** Publish internal packages to GitHub Packages (private). Even prelaunch, this is cleaner than submodules. Version as `0.0.x` and bump on changes.

This gives you:
- Shared translations (main pain point)
- Shared contracts (type safety)
- No app migration risk

**You can always do full migration post-launch.**

---

---

## Web Move Spike (Recommended Before Committing)

Before you commit to the full 3-4 week timeline, do a **1-2 day spike** on a branch:

1. Create monorepo skeleton (root package.json, pnpm-workspace.yaml, turbo.json)
2. Move ONLY web into `apps/web/` (no packages, no mobile, no worker)
3. Make `pnpm install` work at root
4. Make `pnpm build` succeed for web
5. Make `vercel build` succeed locally
6. **Don't touch application code** - only fix path/root issues

**If the spike is smooth:** Your plan is green-lit. Proceed with confidence.

**If the spike is gnarly:** You'll discover exactly why early, before you've moved 3 things and can't isolate the blast radius. Adjust timeline or fall back to MVMono.

This spike costs 1-2 days but could save you a week of debugging later.

---

## Recommendations

### Do This

1. **Start with packages-only (MVMono)** - Get value immediately, defer risk
2. **Convert web to pnpm first** - Do this in isolation before any monorepo work
3. **Keep app configs unchanged during move** - Optimization comes later
4. **Test Vercel deploy from branch** - Before merging web migration
5. **Budget debugging time** - The plan looks clean, reality is messier

### Don't Do This

1. **Don't consolidate test frameworks during migration** - That's a separate project
2. **Don't unify env files** - Keep them app-local
3. **Don't try to preserve git history** - Fresh start is cleaner
4. **Don't migrate web and worker simultaneously** - One at a time
5. **Don't skip the EAS readiness checklist** - Metro + pnpm is finicky

---

## Success Factors

**This will succeed if:**
- You treat Phase 2 (web) as the critical path
- You test deploys on branches before merging
- You don't try to "clean up" during migration
- You accept 3-4 weeks timeline, not 1 week

**This will struggle if:**
- You rush Phase 2 to meet a deadline
- You try to migrate both big apps at once
- You optimize configs during migration
- You underestimate Next.js complexity

---

## Bottom Line

**Is this plan achievable?** Yes.

**Is it trivial?** No. You have 733K lines of code in two complex apps.

**What's the real risk?** Phase 2 (web migration). Everything else is manageable.

**Should you do it?** If you have 3-4 weeks and aren't launching next week, yes. The long-term benefits outweigh the short-term pain.

**Fallback:** If timing is tight, do packages-only (MVMono). You get 80% of the value with 20% of the risk. Move apps post-launch.

---

## Appendix: Quick Wins Before Migration

If you want to de-risk before starting:

1. **Convert sheenappsai to pnpm** (in its own repo, before any monorepo work)
2. **Add `"private": true` to all internal package.json files** (prevents accidental publish)
3. **Document current build commands** (so you know what must keep working)
4. **Run Vercel build locally** (`vercel build`) to understand output tracing
5. **Do the web move spike** (1-2 days to validate the critical path)
6. **Grep for `process.cwd()` and `../` in scripts** (find root assumptions early)
7. **Pin Zod version** in web and worker to same version before migration

These can be done independently and will make migration smoother.

---

## Summary of Difficulty Ratings

| Phase | Difficulty | Why |
|-------|------------|-----|
| Phase 0: Skeleton | 2/10 | Just boilerplate |
| Phase 1: Packages | 2-3/10 | Already structured, low risk |
| Phase 1: Mobile | 3-4/10 | Tiny codebase, Metro quirks documented |
| Phase 2: Web | **6-7/10** | The cliff. Complex config, root assumptions |
| Phase 3: Worker | 5-6/10 | Large but simpler config, contract work |
| Phase 4: CI | 3/10 | Well-documented patterns |

**Overall: 6/10 (Moderate)** - achievable with discipline, budget for surprises in Phase 2.
