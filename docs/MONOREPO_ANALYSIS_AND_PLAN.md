# SheenApps Monorepo Analysis & Plan

**Date:** 2026-01-31
**Context:** Prelaunch mobile app, translation duplication, considering consolidation
**Decision:** Yes to lean monorepo, with phased migration

---

## Executive Summary

The expert's core insight is correct: **prelaunch is when structure is cheapest**. The distinction between "minimal irreversible mistakes" (high leverage) vs "maximal consolidation" (high ceremony) is the right framing.

**Recommendation:** Proceed with lean Turborepo monorepo, but:
1. Start with packages only (lowest risk)
2. Move mobile first (newest, least entangled)
3. Defer web/worker migration until packages are stable
4. Keep deploys independent throughout

---

## Current State

```
Separate repos/directories:
├── sheenappsai/              # Next.js 16, Vercel deploy
├── sheenapps-mobile/         # Expo, new, EAS deploy
├── sheenapps-claude-worker/  # Fastify, separate infra
└── sheenapps-packages/       # 18 SDKs (for Easy Mode customers)
```

**Key insight:** The 18 SDKs in `sheenapps-packages` are for **Easy Mode customer apps** (apps built with SheenApps), not for internal sharing between web/mobile/worker. This is an important distinction the expert may have missed.

**What's actually duplicating:**
- Translations (web has 9 locales, mobile has 2, strings overlap)
- API types/contracts (mobile calls worker via gateway, web calls worker directly)
- Error codes (worker defines, web/mobile consume)
- Validation logic (email validation, etc. in multiple places)

---

## Analysis of Expert Recommendations

### What I Agree With

| Recommendation | Why It's Right |
|----------------|----------------|
| Monorepo now | Prelaunch = cheap to change, expensive to fix later |
| Lean version | Don't build cathedral, build shed that works |
| Rules A-D | Sensible guardrails that prevent spaghetti |
| Independent deploys | Monorepo ≠ mono-deploy |
| Contracts + translations + errors as trio | These are the actual pain points |

### What I'd Refine

| Expert Said | My Refinement |
|-------------|---------------|
| "Generated client from OpenAPI" | We don't have OpenAPI specs. Start with shared TypeScript types. OpenAPI generation is a Phase 2 optimization. |
| "18 SDKs already shared" | Those SDKs are for customer apps, not internal sharing. Internal packages are new. |
| "Design tokens package" | Design tokens (colors, spacing) add complexity for limited gain—mobile uses React Native styling, web uses Tailwind. But **platform tokens** (SUPPORTED_LOCALES, currencies) are useful and should be shared. |

### What's Missing

1. **Migration order** - What moves first? What's the risk?
2. **Minimum viable monorepo** - What's needed to unblock mobile launch?
3. **Rollback plan** - What if migration takes too long?
4. **CI/CD specifics** - Vercel, EAS, worker deploy all have different needs

---

## Proposed Structure

```
sheenapps/                          # Turborepo root
├── apps/
│   ├── web/                        # sheenappsai (Phase 2)
│   ├── mobile/                     # sheenapps-mobile (Phase 1)
│   └── worker/                     # sheenapps-claude-worker (Phase 3)
├── packages/
│   │
│   │ # ─── PRIVATE (workspace only, not published) ───
│   │
│   ├── translations/               # PRIVATE - i18n strings for web/mobile/worker
│   │   ├── src/
│   │   │   ├── en.json
│   │   │   ├── ar.json
│   │   │   └── ... (9 locales)
│   │   └── index.ts
│   ├── contracts/                  # PRIVATE - API contracts (THE source of truth)
│   │   ├── src/
│   │   │   ├── platform/           # Platform auth types + schemas
│   │   │   ├── gateway/            # Gateway contracts
│   │   │   └── shared/             # Common errors, validation schemas
│   │   └── index.ts
│   ├── platform-tokens/            # PRIVATE - Locale constants + utilities
│   │   └── src/
│   │       ├── locales.ts          # SUPPORTED_LOCALES, normalizeLocale()
│   │       └── currencies.ts
│   ├── capabilities/               # PRIVATE - UI vocabulary for entitlements
│   │   └── src/
│   │       ├── features.ts         # Feature keys, plan keys, Entitlements type
│   │       └── display.ts          # formatLimit, shouldShowUpgrade, etc.
│   │
│   │ # ─── PUBLIC (published to npm for Easy Mode customers) ───
│   │
│   ├── sdk-auth/                   # PUBLIC - @sheenapps/auth
│   ├── sdk-db/                     # PUBLIC - @sheenapps/db
│   ├── sdk-storage/                # PUBLIC - @sheenapps/storage
│   ├── sdk-jobs/                   # PUBLIC - @sheenapps/jobs
│   ├── sdk-secrets/                # PUBLIC - @sheenapps/secrets
│   ├── sdk-email/                  # PUBLIC - @sheenapps/email
│   ├── sdk-payments/               # PUBLIC - @sheenapps/payments
│   ├── sdk-analytics/              # PUBLIC - @sheenapps/analytics
│   └── sdk-*/                      # PUBLIC - other Easy Mode SDKs
│
├── tooling/
│   ├── eslint-config/
│   └── tsconfig/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Package Visibility

| Package | Visibility | Consumers | Versioning |
|---------|------------|-----------|------------|
| `@sheenapps/translations` | **Private** | web, mobile, worker | `workspace:*` |
| `@sheenapps/contracts` | **Private** | web, mobile, worker | `workspace:*` |
| `@sheenapps/platform-tokens` | **Private** | web, mobile, worker | `workspace:*` |
| `@sheenapps/capabilities` | **Private** | web, mobile, worker | `workspace:*` |
| `@sheenapps/auth` | **Public** | Customer apps | semver |
| `@sheenapps/db` | **Public** | Customer apps | semver |
| `@sheenapps/storage` | **Public** | Customer apps | semver |
| `@sheenapps/jobs` | **Public** | Customer apps | semver |
| `@sheenapps/secrets` | **Public** | Customer apps | semver |
| `@sheenapps/email` | **Public** | Customer apps | semver |
| `@sheenapps/payments` | **Public** | Customer apps | semver |
| `@sheenapps/analytics` | **Public** | Customer apps | semver |

**Private packages:**
- Never published to npm
- Referenced via pnpm workspace (`"@sheenapps/contracts": "workspace:*"`)
- No external documentation needed
- Can change freely (no breaking change concerns for outsiders)

**Public packages (Easy Mode SDKs):**
- Published to npm (`npm publish`)
- Semver versioning (breaking changes = major bump)
- Need public documentation, changelogs
- Customers `npm install @sheenapps/auth` in their generated apps

Each package's `package.json` should indicate visibility:

```json
// Private package (belt + suspenders)
{
  "name": "@sheenapps/contracts",
  "private": true,
  "version": "0.0.0",
  "publishConfig": {
    "access": "restricted"
  }
}

// Public package
{
  "name": "@sheenapps/auth",
  "private": false,
  "version": "1.2.3",
  "publishConfig": {
    "access": "public"
  }
}
```

**Critical rule: Public SDKs never depend on private internal packages.**

```json
// ❌ NEVER - drags internal stuff into customer dependency graphs
// sdk-auth/package.json
{
  "dependencies": {
    "@sheenapps/contracts": "workspace:*"  // NO!
  }
}

// ✅ Public SDKs are self-contained or depend only on other public packages
```

This prevents accidentally shipping internal code to customers.

---

## The Commitments (Non-Negotiable)

### Contract Artifact Format

**Contracts are TypeScript types + Zod schemas in `@sheenapps/contracts`. Worker/web/mobile import them.**

This single sentence prevents 6 months of architecture bikeshedding. We don't need OpenAPI now, but we CAN generate it from Zod later if needed.

### Contracts-First Model (Direction of Truth)

**`@sheenapps/contracts` is canonical. Worker imports and implements contracts - it doesn't define them elsewhere.**

```
contracts (defines) → worker (implements)
                   → web (consumes)
                   → mobile (consumes)
```

This means:
- Contracts package is where types/schemas are authored
- Worker route handlers import from `@sheenapps/contracts`
- Worker must compile against contracts → changing a contract breaks worker if implementation doesn't match
- Worker does NOT "export types" from its own code into contracts

### Shared Packages Must Be Pure

**Shared packages must be pure, deterministic, and side-effect free.**

No reading env vars, no network calls, no filesystem access, no Node-only APIs (unless clearly scoped).

| Package | Must be pure? |
|---------|---------------|
| `contracts` | ✅ Yes - types + schemas only |
| `translations` | ✅ Yes - static JSON + build scripts |
| `platform-tokens` | ✅ Yes - constants + pure functions |
| `capabilities` | ✅ Yes - types + pure UI helpers |

If you later need an API client, make it platform-specific (`api-client-web`, `api-client-mobile`) or pure fetch-based with injected transport.

### Single Owner for Locale Registry

**`@sheenapps/platform-tokens` owns the locale registry. `@sheenapps/translations` imports it.**

```typescript
// platform-tokens owns this (single source of truth)
export const SUPPORTED_LOCALES = ['en', 'ar', 'ar-eg', ...] as const
export const BASE_LOCALES = { 'ar-eg': 'ar', ... }
export const RTL_LOCALES = ['ar', 'ar-eg', ...]

// translations imports it
import { SUPPORTED_LOCALES, BASE_LOCALES } from '@sheenapps/platform-tokens'
```

This prevents drift between "what locales exist" and "what translations we build."

---

## The Rules (Non-Negotiable)

### Rule A: Apps Never Import From Each Other

```typescript
// ❌ NEVER
import { something } from '@sheenapps/web'
import { something } from '../../../apps/worker/src'

// ✅ ALWAYS
import { something } from '@sheenapps/translations'
import { something } from '@sheenapps/contracts'
```

### Rule B: Only Source-of-Truth Assets in Packages

**YES (put in packages):**
- Types, contracts, API shapes
- Translations
- Error codes
- Validation schemas

**NO (keep in apps):**
- UI components (for now)
- Screens/pages
- App-specific hooks
- App-specific business logic

### Rule C: Independent Deploys Remain Independent

```
apps/web     → Vercel (unchanged)
apps/worker  → Current infra (unchanged)
apps/mobile  → EAS Build (unchanged)
```

Turborepo orchestrates builds and caching, not deployments.

### Rule D: Latest Everywhere (No Semver Theater)

Prelaunch = all packages at `workspace:*`. No version pinning.
CI enforces "everything compiles together."

### Rule E: Only Import Through Package Exports

Apps only consume packages through their public exports. No deep imports into internals.

```typescript
// ❌ NEVER (bypasses public API, breaks refactors)
import { something } from '@sheenapps/contracts/src/platform/auth'
import messages from '@sheenapps/translations/src/base/en/common.json'

// ✅ ALWAYS (through adapters/exports)
import { RequestCodeSchema } from '@sheenapps/contracts'
import { getMessages } from '@sheenapps/translations/next-intl'
```

For translations specifically:
- Web imports only from `@sheenapps/translations/next-intl`
- Mobile imports only from `@sheenapps/translations/i18next`
- No app imports `src/base/...` or `src/generated/...` directly

---

## Migration Plan

### Phase 0: Preparation (1 day)

- [ ] Create `sheenapps/` monorepo root
- [ ] Set up Turborepo + pnpm workspaces
- [ ] Create `packages/` structure (empty packages)
- [ ] Test basic `turbo build` works

### Phase 1: Packages + Mobile (2-3 days)

**Why mobile first:** It's new, less entangled, lower risk.

**Step 1a: Create and test packages locally (before moving mobile)**
- [ ] Create `@sheenapps/translations` with build-time merged strings
- [ ] Create `@sheenapps/contracts` with types + Zod schemas + error codes
- [ ] Create `@sheenapps/platform-tokens` with locale constants + utilities
- [ ] Create `@sheenapps/capabilities` with UI vocabulary for entitlements
- [ ] Test packages work via `pnpm link` in existing mobile repo
- [ ] CI guardrails in place:
  - [ ] Workspace boundary lint (apps don't import from each other)
  - [ ] No deep imports into package internals (only through exports)
  - [ ] Translations coverage check (per namespace, per locale)
  - [ ] No duplicate keys across namespaces
  - [ ] No missing namespaces (all namespaces exist in all locales)
  - [ ] `turbo run typecheck` across all packages
  - [ ] Contract conformance (worker compiles against contracts)
- [ ] Create PR template checklist enforcing Rules A-E

**Step 1b: EAS Monorepo Readiness (HARD GATE)**

EAS + pnpm workspaces can fail in subtle ways. This checklist is non-negotiable before moving mobile:

- [ ] `apps/mobile` has its own `package.json` with correct `main` and Expo config
- [ ] pnpm version pinned via Corepack (CI/EAS must use same pnpm version)
- [ ] **All workspace packages consumed by mobile emit `dist/`** (see below)
- [ ] Workspace packages used by mobile have NO Node-only APIs (fs, path, etc.)
- [ ] Metro bundler config handles workspace symlinks correctly
- [ ] Run clean-room EAS build in CI (no local cache assumptions)
- [ ] Test on both iOS and Android builds

**Build strategy: "build to dist" (recommended for RN sanity)**

For any package consumed by mobile, emit compiled output:
```json
{
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsc"
  }
}
```

Why: Metro resolves normal JS without symlink headaches. "No-build TS" requires careful Metro config + TS transpilation assumptions. Build to dist is more work upfront but fewer "Metro is haunted" incidents.

**Common EAS + monorepo failures:**
- Metro resolving symlinks weirdly → fix with `watchFolders` in metro.config.js
- "Cannot find module" for workspace packages → check `nodeLinker` setting
- Node APIs in shared packages → breaks React Native bundler

Do NOT move mobile until this checklist passes.

**Step 1c: Move mobile to monorepo**
- [ ] Move `sheenapps-mobile/` → `apps/mobile/`
- [ ] Update mobile imports to use packages
- [ ] Verify EAS build passes in CI

**Exit criteria:** Mobile builds and runs with shared packages, CI guardrails passing, EAS builds clean.

### Phase 2: Web Migration (3-5 days)

**Why second:** More complex, but benefits most from shared packages.

- [x] Move `sheenappsai/` → `apps/web/`
- [ ] ~~Update web to use `@sheenapps/translations`~~ **DEFERRED** (current setup works well)
- [x] Update web to use `@sheenapps/contracts`
- [x] Update Vercel build settings (see `docs/MONOREPO_DEPLOYMENT.md`)
- [ ] Verify all 9 locales work in deployed environment

**Exit criteria:** Web deploys to Vercel from monorepo.

### Phase 3: Worker Migration (2-3 days)

**Why last:** Most critical, and contracts discipline must be proven first.

- [x] Move `sheenapps-claude-worker/` → `apps/worker/`
- [x] Worker imports from `@sheenapps/contracts` (contracts-first model)
- [x] Implement typed route wrapper (`defineRoute(contract, handler)`)
- [ ] Update worker deploy pipeline documentation
- [ ] Verify HMAC auth still works

**Exit criteria:** Worker deploys from monorepo, implements contracts (not defines them).

### Phase 4: CI Optimization (1 day)

Core CI guardrails are in Phase 1. This phase is for optimization:

- [ ] Turbo remote caching (nice for speed, not critical)
- [ ] Parallel test execution across apps
- [ ] Deploy previews per-app on PRs (optional)

---

## Rollback Plan

**Trigger:** If migration takes >3 days on a branch without stable CI, abort.

**Rollback steps:**
1. Keep packages in monorepo (they work)
2. Revert app moves (git revert the move commits)
3. Apps reference packages via git submodule or published npm
4. Retry full migration post-launch

**Key insight:** The packages are the value. Moving apps into the monorepo is convenience, not the core win. If app migration is painful, just ship with linked packages.

---

## Minimum Viable Monorepo (If Time-Constrained)

If full migration is too risky pre-launch, do this instead:

1. **Create packages repo only** (not full monorepo)
2. **Apps reference via git submodule or npm link**
3. **Migrate apps later**

```
sheenapps-packages/           # Expanded, not moved
├── translations/
├── contracts/                # Includes errors + validation
├── platform-tokens/
├── capabilities/
└── sdk-*/                    # Existing

# Apps stay where they are, reference packages
sheenappsai/
  package.json: "@sheenapps/translations": "workspace:*"
```

This gives 80% of the benefit (shared packages) with 20% of the risk (no app migration).

---

## What This Unlocks

### Immediate (Week 1)

- **No more translation drift** - One source, both apps consume
- **Consistent error messages** - Mobile shows same errors as web
- **Type-safe API calls** - Change type → both apps fail to compile → fix both

### Short-term (Weeks 2-4)

- **Atomic PRs** - Change contract + update consumers in one PR
- **Faster CI** - Turbo caching means unchanged packages skip rebuild
- **Easier onboarding** - One repo to clone, one install command

### For Full Mobile App (Post-launch)

- **Feature parity without reverse-engineering** - Mobile implements features screen-by-screen using same contracts
- **Scaling locales is wiring, not re-authoring** - Going from 2→9 locales on mobile becomes straightforward
- **Consistent upgrade prompts** - `capabilities` package ensures web and mobile show same plan limits
- **One PR touches entire stack** - Worker + contracts + mobile UI + web UI in atomic changes

### Long-term

- **Shared UI components** - If mobile grows, can add Tamagui/RNW
- **Generated API clients** - Can add OpenAPI codegen later

### What This Doesn't Solve (Device Constraints)

These will still require product decisions, not just engineering:
- Visual builder on phone (drag/drop UI is hard on small screens)
- Dense admin consoles (tables, logs, long forms)
- AI regen flows with diffs/merges

Realistic split: **phone = operations + quick edits**, **tablet = power editing**, **web = heavy building/admin**

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration takes longer than expected | Medium | High | Do packages-only first (MVMono) |
| CI/CD breaks | Medium | High | Test deploys on branch before merge |
| Build times increase | Low | Medium | Turbo caching, only build what changed |
| Team confusion | Low | Low | Document rules, enforce in PR review |

---

## Decision Matrix

| Option | Effort | Risk | Prelaunch Value | Long-term Value |
|--------|--------|------|-----------------|-----------------|
| Do nothing | None | None | None | Debt accumulates |
| Packages only (MVMono) | Low | Low | High | Medium |
| Full monorepo (phased) | Medium | Medium | High | High |
| Full monorepo (big bang) | High | High | High | High |

**Recommendation:** Start with "Packages only" (Phase 1), then continue to full monorepo if it goes smoothly.

---

## Translations Package: Detailed Design

Since this is the most immediate pain point:

```
packages/translations/
├── src/
│   ├── base/                 # Base locale files (source of truth)
│   │   ├── en/               # Namespaced structure
│   │   │   ├── common.json   # Shared strings (Dashboard, Settings, etc.)
│   │   │   ├── auth.json     # Auth-specific
│   │   │   ├── billing.json  # Billing/plans
│   │   │   ├── projects.json # Project management
│   │   │   └── errors.json   # Error messages
│   │   ├── ar/
│   │   │   └── ... (same structure)
│   │   └── .../
│   ├── overrides/            # Regional overrides (only differences)
│   │   ├── ar-eg/
│   │   │   └── common.json   # Only keys that differ from ar
│   │   └── .../
│   ├── generated/            # Build output (git-ignored)
│   │   └── ...
│   ├── index.ts              # Main export
│   ├── next-intl.ts          # Adapter for web
│   └── i18next.ts            # Adapter for mobile
├── scripts/
│   ├── build-locales.ts      # Merges base + overrides at build time
│   └── check-coverage.ts     # CI: verify coverage PER NAMESPACE
├── package.json
└── tsconfig.json
```

**Important:** Imports locale registry from `@sheenapps/platform-tokens` (single owner).

### Keep Namespaces (Avoid Mega-Flat Dictionary)

Do NOT publish a single flat mega-dictionary. Keep namespaces to avoid:
- Key collisions (`title` in auth vs `title` in projects)
- "Who owns this string?" confusion
- Huge PR diffs when one namespace changes

**Package exports:**
```typescript
// For web (next-intl)
export function getMessages(locale: SupportedLocale, namespaces: Namespace[]): Messages

// For mobile (i18next)
export const resources: Record<SupportedLocale, Record<Namespace, Messages>>
```

**CI checks coverage per namespace**, not just per locale.

### Build-time Locale Inheritance (Critical)

Regional locales inherit from base locales **at build time**, not runtime:

```typescript
// scripts/build-locales.ts
import { deepMerge } from './utils'

const INHERITANCE = {
  'ar-eg': 'ar',
  'ar-sa': 'ar',
  'ar-ae': 'ar',
  'fr-ma': 'fr',
}

for (const [regional, base] of Object.entries(INHERITANCE)) {
  const baseMessages = require(`../src/base/${base}.json`)
  const overrides = require(`../src/overrides/${regional}.json`)
  const merged = deepMerge(baseMessages, overrides)
  writeFileSync(`../src/generated/${regional}.json`, JSON.stringify(merged, null, 2))
}
```

**Why build-time, not runtime:**
- No runtime fallback chains = simpler code
- Smaller bundles (each locale is complete, no need to load base + regional)
- Explicit: what you see in `generated/` is what the app gets
- CI can validate completeness

**Usage in web (next-intl):**
```typescript
import { getMessages } from '@sheenapps/translations/next-intl'
const messages = await getMessages(locale) // Returns pre-merged messages
```

**Usage in mobile (i18next):**
```typescript
import { resources } from '@sheenapps/translations/i18next'
i18n.init({ resources }) // Resources are pre-merged at build time
```

### Bundle Strategy (Mobile)

Expo/RN bundles can get chunky with 9 locales. Options:

1. **Prelaunch:** Ship only the locales you actually support (en + ar)
2. **Post-launch:** Lazy-load additional locales on demand
3. **If size is acceptable:** Ship all 9 (measure first)

```typescript
// Mobile: ship subset, lazy-load rest
import { en, ar } from '@sheenapps/translations/i18next'

// Later, on user locale change:
const frMessages = await import('@sheenapps/translations/locales/fr.json')
```

Web can load locales dynamically at runtime (standard next-intl pattern).

---

## Contracts Package: Design & Enforcement

**Canonical format commitment:** Contracts are TypeScript types + Zod schemas. Worker/web/mobile all import from `@sheenapps/contracts`. This is non-negotiable.

```
packages/contracts/
├── src/
│   ├── platform/             # Platform API (mobile auth)
│   │   ├── auth.ts           # Types + Zod schemas
│   │   └── errors.ts         # Error codes for this domain
│   ├── gateway/              # Gateway API
│   │   ├── projects.ts
│   │   └── errors.ts
│   ├── shared/               # Cross-cutting
│   │   ├── errors.ts         # Common codes (RATE_LIMITED, VALIDATION_ERROR)
│   │   └── validation.ts     # Shared schemas (email, deviceId, etc.)
│   └── index.ts
└── package.json
```

**Key principle:** The contracts package IS the source of truth. Worker imports and implements these contracts - it doesn't define them elsewhere.

```typescript
// packages/contracts/src/platform/auth.ts
import { z } from 'zod'

// Request schema (validation + types in one place)
export const RequestCodeSchema = z.object({
  email: z.string().email(),
  deviceId: z.string().min(1),
  platform: z.enum(['mobile', 'web']),
})
export type RequestCodeRequest = z.infer<typeof RequestCodeSchema>

// Response type
export interface RequestCodeResponse {
  success: boolean
  expiresIn: number // seconds
}

// Error codes for this endpoint
export const REQUEST_CODE_ERRORS = {
  INVALID_EMAIL: 'INVALID_EMAIL',
  RATE_LIMITED: 'RATE_LIMITED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const
```

**Structural enforcement (not README enforcement):**
- Worker route handlers import from `@sheenapps/contracts`
- Worker must compile against contracts → if contracts change, worker breaks
- CI runs contract drift test: worker routes satisfy contract types
- This makes "truth" physically centralized, not socially enforced

### Response Schemas (Runtime Validation)

Define response Zod schemas too, not just request schemas. This catches bugs from DB mappings, third-party responses, and conditional branches that TypeScript can't see.

```typescript
// packages/contracts/src/platform/auth.ts
import { z } from 'zod'

// Request schema
export const RequestCodeSchema = z.object({
  email: z.string().email(),
  deviceId: z.string().min(1),
  platform: z.enum(['mobile', 'web']),
})
export type RequestCodeRequest = z.infer<typeof RequestCodeSchema>

// Response schema (not just a type!)
export const RequestCodeResponseSchema = z.object({
  success: z.boolean(),
  expiresIn: z.number().int().positive(),
})
export type RequestCodeResponse = z.infer<typeof RequestCodeResponseSchema>
```

**Priority endpoints for response schemas:** auth, billing, entitlements, project create/update.

### Typed Route Wrapper (High Leverage)

TypeScript compilation alone won't catch "route exists but returns wrong shape at runtime." Add a typed route wrapper that validates BOTH request AND response:

```typescript
// apps/worker/src/utils/defineRoute.ts
import { z } from 'zod'

export function defineRoute<
  TRequest extends z.ZodType,
  TResponse extends z.ZodType
>(contract: {
  request: TRequest
  response: TResponse
}, handler: (input: z.infer<TRequest>) => Promise<z.infer<TResponse>>) {
  return async (rawInput: unknown) => {
    // Validate input
    const parsed = contract.request.safeParse(rawInput)
    if (!parsed.success) {
      throw new ValidationError(parsed.error)
    }
    // Run handler
    const result = await handler(parsed.data)
    // Validate output (catches bugs TypeScript misses)
    return contract.response.parse(result)
  }
}
```

**Usage in worker:**
```typescript
import { RequestCodeSchema, RequestCodeResponseSchema } from '@sheenapps/contracts/platform/auth'

export const requestCodeRoute = defineRoute(
  { request: RequestCodeSchema, response: RequestCodeResponseSchema },
  async (input) => {
    // input is typed as RequestCodeRequest
    // return is validated against RequestCodeResponseSchema at runtime
    return { success: true, expiresIn: 300 }
  }
)
```

This is the cheapest way to prevent contract drift forever.

**Why merge errors + validation into contracts:**
- Error codes ARE part of the contract (what can this endpoint return?)
- Validation schemas ARE part of the contract (what are input constraints?)
- One package = no "who updates first?" ambiguity
- Human-readable error messages stay in `@sheenapps/translations`

---

## Platform Tokens Package: Detailed Design

**This package is the SINGLE OWNER of the locale registry.** All other packages import locale info from here.

Platform constants and locale utilities that all apps need:

```typescript
// packages/platform-tokens/src/locales.ts
export const SUPPORTED_LOCALES = [
  'en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de'
] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export const DEFAULT_LOCALE: SupportedLocale = 'en'

export const RTL_LOCALES: SupportedLocale[] = ['ar', 'ar-eg', 'ar-sa', 'ar-ae']

// Base locale mapping (for inheritance)
const BASE_LOCALES: Partial<Record<SupportedLocale, SupportedLocale>> = {
  'ar-eg': 'ar',
  'ar-sa': 'ar',
  'ar-ae': 'ar',
  'fr-ma': 'fr',
}

// Utilities (prevents each app re-implementing these differently)
export function normalizeLocale(input: string): SupportedLocale {
  const normalized = input.toLowerCase().replace('_', '-')
  if (SUPPORTED_LOCALES.includes(normalized as SupportedLocale)) {
    return normalized as SupportedLocale
  }
  // Try base locale (ar_EG → ar)
  const base = normalized.split('-')[0]
  if (SUPPORTED_LOCALES.includes(base as SupportedLocale)) {
    return base as SupportedLocale
  }
  return DEFAULT_LOCALE
}

export function getBaseLocale(locale: SupportedLocale): SupportedLocale {
  return BASE_LOCALES[locale] ?? locale
}

export function getDirection(locale: SupportedLocale): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'
}
```

```typescript
// packages/platform-tokens/src/currencies.ts
export const LOCALE_CURRENCIES: Record<SupportedLocale, string> = {
  'en': 'USD',
  'ar': 'SAR',
  'ar-eg': 'EGP',
  'ar-sa': 'SAR',
  'ar-ae': 'AED',
  'fr': 'EUR',
  'fr-ma': 'MAD',
  'es': 'EUR',
  'de': 'EUR',
}
```

**Why utilities matter:**
- Prevents edge-case bugs (`ar_EG` vs `ar-eg` vs `AR-EG`)
- Both next-intl and i18next stay aligned
- RTL detection centralized (no hardcoding in each app)
- Base locale logic shared (for translation inheritance)

---

## Capabilities Package: Detailed Design

**Critical distinction:** This package is UI vocabulary and display helpers, NOT enforcement logic. Worker is ALWAYS authoritative for what a user can actually do.

**How it works:**
1. Worker computes and returns entitlements: `{ plan, entitlements: { leads: { limit, used }, workflows: { enabled } } }`
2. Capabilities package defines typed keys and UI helpers
3. Mobile/web render from the same vocabulary

```typescript
// packages/capabilities/src/features.ts

// Typed feature keys (vocabulary)
export const FEATURES = [
  'projects',
  'leads',
  'storage',
  'custom_domain',
  'analytics',
  'workflows',
  'sso',
  'audit_logs',
] as const

export type Feature = typeof FEATURES[number]

// Typed plan keys
export const PLANS = ['free', 'pro', 'enterprise'] as const
export type Plan = typeof PLANS[number]

// Entitlements shape (what worker returns)
export interface Entitlements {
  plan: Plan
  features: {
    [K in Feature]?: {
      enabled: boolean
      limit?: number | 'unlimited'
      used?: number
    }
  }
}
```

```typescript
// packages/capabilities/src/display.ts
import type { Entitlements, Feature } from './features'

// UI helpers (NOT enforcement)
export function formatLimit(limit: number | 'unlimited'): string {
  return limit === 'unlimited' ? '∞' : limit.toLocaleString()
}

export function shouldShowUpgrade(entitlements: Entitlements, feature: Feature): boolean {
  const feat = entitlements.features[feature]
  if (!feat) return true // Feature not available
  if (!feat.enabled) return true
  if (feat.limit !== 'unlimited' && feat.used && feat.used >= feat.limit) return true
  return false
}

export function getUsagePercent(entitlements: Entitlements, feature: Feature): number {
  const feat = entitlements.features[feature]
  if (!feat?.limit || feat.limit === 'unlimited' || !feat.used) return 0
  return Math.round((feat.used / feat.limit) * 100)
}
```

**What this package does:**
- Defines typed vocabulary (feature keys, plan keys, entitlements shape)
- Provides UI helpers (formatLimit, shouldShowUpgrade, getUsagePercent)
- Ensures web and mobile show consistent upgrade prompts

**What this package does NOT do:**
- Enforcement (worker always decides what's allowed)
- Store the actual limits (worker computes from subscription data)
- Device-specific decisions (apps handle "builder not on phone")

---

## Next Steps

1. **Decide:** Full monorepo (phased) or packages-only (MVMono)?
2. **Create:** Monorepo root with Turborepo config (typecheck, lint, build pipelines)
3. **Build:** `@sheenapps/translations` package first (with build-time locale merging)
4. **Build:** `@sheenapps/contracts` with types + Zod schemas + error codes
5. **Build:** `@sheenapps/platform-tokens` with locale constants + utilities
6. **Test:** Link packages to existing mobile repo, verify they work
7. **Test:** Run clean-room EAS build before moving mobile
8. **Migrate:** Mobile app to monorepo (only after packages are stable + EAS verified)
9. **Iterate:** Add capabilities package when needed for upgrade prompts

---

## Appendix: The Rules (Summary)

For reference, the guardrails that keep this from becoming a cathedral:

> **Rule A** — Apps never import from each other
> **Rule B** — Only source-of-truth assets go into shared packages
> **Rule C** — Independent deploys remain independent
> **Rule D** — All internal packages at `workspace:*`, CI enforces "everything compiles"
> **Rule E** — Only import through package exports (no deep imports into internals)

These rules are non-negotiable. Enforce them in PR review and CI.
