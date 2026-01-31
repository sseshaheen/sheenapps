# Playwright E2E Coverage Plan

## Executive Summary

This plan outlines a strategy to achieve reliable, maintainable Playwright E2E coverage for the core user journeys in SheenApps. The focus is on **high-value, stable tests** that validate critical business flows rather than exhaustive coverage of edge cases.

**Key principle**: Tests people trust, not tests people fear.

---

## Current State Analysis

### What We Have

| Category | Count | Coverage |
|----------|-------|----------|
| Smoke Tests | 8 | Basic page loads, auth, i18n, a11y, security |
| P0 Critical Tests | 4 | Payments, chat, advisor, referral/export |
| Feature Tests | 4 | Login, project creation, builder, recommendations |
| **Total E2E** | **16 files** | ~3,400 lines |

### Current Strengths
- Pre-authenticated state pattern (fast, reliable)
- Test personas for multi-role testing
- Quarantine pattern for flaky tests
- Good utility functions (login, payment, chat helpers)

### Coverage Gaps (Core Flows)

| Gap | Impact | Current State |
|-----|--------|---------------|
| **Build Pipeline** | Critical | Only basic builder smoke test |
| **Recommendations Flow** | High | Exists but needs expansion |
| **Integration Status** | High | Not tested E2E |
| **Multi-step Project Lifecycle** | Critical | Fragmented across tests |
| **Subscription Flows** | High | Payment exists, no lifecycle |
| **Error Recovery** | Medium | Not systematically tested |
| **Real-time Updates** | Medium | Basic SSE only |

---

## Recommended Test Strategy

### Guiding Principles

1. **Test User Journeys, Not Features** - Each test should simulate a real user accomplishing a goal
2. **Reliable Over Comprehensive** - Better to have 20 tests that never flake than 100 that sometimes fail
3. **Fast Feedback** - Smoke tests < 2min, P0-A < 5min, P0-B nightly
4. **Independence** - Each test can run in isolation with unique data
5. **Determinism First** - Deploy-blocking tests must not depend on external services or AI timing
6. **Bounded Waits Everywhere** - Every async operation has a max timeout; no 30-minute hangs

### Authentication Strategy

**Clarification**: We have both seeded users AND pre-authenticated state. Here's when to use each:

| Suite | Auth Method | Why |
|-------|-------------|-----|
| **P0-A + Smoke** | `storageState` (pre-auth cookies) | Fastest, least moving parts, deterministic |
| **P0-B (Nightly)** | Real login flow occasionally | Acts as canary for auth/OAuth regressions |

Seeded users exist in the test database with known states. P0-A uses **stored auth state generated from them** (created during global setup). This gives us speed without sacrificing auth coverage - P0-B's real login catches auth regressions nightly.

### Test Pyramid for E2E

```
          /\
         /P0\
        / A  \        <- 4-5 deterministic tests (MUST pass for deploy)
       /------\
      /  P0-B  \      <- 4-5 critical but flaky (nightly, still important)
     /----------\
    /   Core     \    <- 15-20 core journey tests (run on PR)
   /--------------\
  /    Smoke       \  <- 10-12 sanity checks (every commit)
 --------------------
```

---

## Deterministic E2E Mode

The main risk with E2E tests is dependency on "three flaky gods":
1. AI generation timing
2. SSE reliability
3. External services (Stripe/GitHub/Vercel/email/calendar)

**Solution**: Run E2E against a test environment with contracted, predictable behavior.

### Backend Switches for CI

```typescript
// Environment: E2E_MODE=true

// 1. Seeded users with known states
const seededUsers = {
  'e2e-free': { plan: 'free', balance: 0 },
  'e2e-pro': { plan: 'pro', balance: 1000 },
  'e2e-low-quota': { plan: 'pro', balance: 5 }, // Will run out mid-build
};

// 2. Fast build path for known project ideas
const fastBuildProjects = {
  'e2e-coffee-shop': { buildTime: 5000, alwaysSucceeds: true },
  'e2e-failing-app': { buildTime: 2000, alwaysFails: true, error: 'Invalid config' },
};

// 3. Deterministic AI responses (fixture mode)
const aiFixtures = {
  'improve-landing-page': {
    response: 'Here are 3 suggestions for your landing page...',
    streamDelay: 50, // ms between chunks
  },
};

// 4. Stable feature flags (no experiments in E2E)
const e2eFeatureFlags = {
  newBuilder: true,
  aiRecommendations: true,
  // All flags pinned to known values
};

// 5. Fast migration paths with deterministic verification results
const fastMigrationDomains = {
  'e2e-clean-site.test': {
    analysisTime: 2000,
    transformTime: 3000,
    gates: {
      typescript: { status: 'pass', errors: [] },
      build: { status: 'pass', warnings: [] },
      accessibility: { status: 'pass', issues: [] },
      seo: { status: 'pass', issues: [] },
    },
    assets: { processed: 5, skipped: 0, failed: 0 },
  },
  'e2e-a11y-issues.test': {
    analysisTime: 2000,
    transformTime: 3000,
    gates: {
      typescript: { status: 'pass', errors: [] },
      build: { status: 'pass', warnings: [] },
      accessibility: {
        status: 'pass', // Advisory, won't fail
        issues: [
          { type: 'missing-alt', file: 'app/page.tsx', line: 15 },
          { type: 'input-missing-label', file: 'app/contact/page.tsx', line: 42 },
          { type: 'heading-skip', file: 'app/about/page.tsx', message: 'h1 -> h3' },
        ],
      },
      seo: { status: 'pass', issues: [] },
    },
  },
  'e2e-ts-failing.test': {
    analysisTime: 2000,
    transformTime: 3000,
    gates: {
      typescript: {
        status: 'fail',
        errors: ['page.tsx(10,5): TS2322: Type string not assignable to number'],
      },
      build: { status: 'skip', reason: 'Previous blocking gate failed' },
      accessibility: { status: 'skip', reason: 'Previous blocking gate failed' },
      seo: { status: 'skip', reason: 'Previous blocking gate failed' },
    },
  },
  'e2e-large-assets.test': {
    assets: {
      processed: 3,
      skipped: 2, // 1 blocklisted, 1 size limit
      failed: 0,
      skippedReasons: [
        { url: 'https://shutterstock.com/image.jpg', reason: 'Blocklisted domain' },
        { url: 'https://example.com/huge.png', reason: 'File too large: 12.5MB' },
      ],
    },
  },
};
```

### Implementation

Add to backend:
```typescript
// src/middleware/e2eMode.ts
if (process.env.E2E_MODE === 'true') {
  // Use fixture AI responses
  // Use fast build paths for known projects
  // Skip real external service calls where safe
  // Enforce bounded latency (fail fast if > threshold)
}
```

### Activation Contract

E2E mode is activated **per-request** via headers (not just env vars). This makes the contract explicit:

```typescript
// Playwright global setup adds these headers to all requests
const E2E_HEADERS = {
  'X-E2E-Mode': 'true',
  'X-E2E-Run-Id': process.env.E2E_RUN_ID,
};

// Backend middleware checks:
function isE2ERequest(request: FastifyRequest): boolean {
  return (
    process.env.E2E_MODE === 'true' &&
    request.headers['x-e2e-mode'] === 'true'
  );
}

// Resources created during E2E are tagged with the run ID from header
function tagResource(request: FastifyRequest, metadata: object) {
  if (isE2ERequest(request)) {
    return {
      ...metadata,
      e2e_run_id: request.headers['x-e2e-run-id'],
    };
  }
  return metadata;
}
```

This prevents "must rerun twice for deploy" syndrome.

---

## Phase 1: Critical Path Tests

### P0-A: Deploy-Blocking (Deterministic)

These tests **must pass at 100%**. They do not depend on external services or unbounded AI timing.

#### P0-A-1: Project Lifecycle (Build + Preview)
**File**: `p0a-project-lifecycle.spec.ts`

```
Journey: User creates project → build completes → preview loads

Steps:
1. Login as authenticated user (seeded e2e-pro)
2. Navigate to workspace
3. Create project with known idea (e2e-coffee-shop → fast build path)
4. Wait for build complete event (deterministic timing)
5. Verify build success state in UI
6. Verify preview URL is accessible
7. Verify project appears in project list

Assertions:
- Build events stream correctly (real SSE, but bounded time)
- Preview URL returns 200
- No console errors

Why P0-A: Purely internal system, no external deps.
```

#### P0-A-2: Build Failure and Recovery
**File**: `p0a-build-recovery.spec.ts`

```
Journey: Build fails → user sees error → fixes → rebuilds successfully

Steps:
1. Login as authenticated user
2. Create project with known failing config (e2e-failing-app)
3. Trigger build
4. Verify error state displayed with actionable message
5. "Fix" configuration (switch to valid config)
6. Retry build
7. Verify success

Assertions:
- Error messages are specific and actionable
- Retry preserves project context
- Recovery completes without refresh

Why P0-A: Failure path is deterministic (flag-controlled).
```

#### P0-A-3: Quota Enforcement UI
**File**: `p0a-quota-enforcement.spec.ts`

```
Journey: User with low quota → starts build → sees quota warning

Steps:
1. Login as e2e-low-quota user (seeded with 5s balance)
2. Navigate to existing project
3. Click "Build"
4. Verify quota check happens BEFORE build starts
5. Verify warning UI appears with:
   - Current balance
   - Estimated cost
   - "Purchase More Time" CTA
6. Verify build does NOT proceed without action

Assertions:
- Quota check is synchronous (no race)
- UI clearly shows the problem
- CTA is visible and clickable

Why P0-A: Tests UI enforcement only, not actual Stripe purchase.
```

#### P0-A-4: Persistent Chat (Fixture AI)
**File**: `p0a-chat-persistence.spec.ts`

```
Journey: User sends message → AI responds (fixture) → history persists

Steps:
1. Login as authenticated user
2. Open project chat panel
3. Send message: "Help me improve my landing page" (→ fixture response)
4. Wait for AI response to stream (bounded 5s)
5. Verify response appears correctly formatted
6. Refresh page
7. Verify chat history loads with both messages
8. Send follow-up, verify sequence numbers correct

Assertions:
- Messages appear in order (no duplicates)
- Fixture AI response streams smoothly
- History persists across refresh
- Sequence-based pagination works

Why P0-A: Uses fixture AI responses, not real AI.
```

#### P0-A-5: Feature Flags Sanity
**File**: `p0a-feature-flags.smoke.spec.ts`

```
Journey: Verify critical feature flags are correctly configured

Steps:
1. Fetch feature flag configuration
2. Assert required flags exist:
   - builderEnabled: true
   - paymentsEnabled: true
   - chatEnabled: true
   - [other critical flags]
3. Assert no accidental inversions in test env

Assertions:
- All required flags present
- No "shipped with builder disabled" disasters

Why P0-A: Prevents configuration disasters. Fast, deterministic.
```

---

### P0-B: Nightly-Blocking (Critical but Inherently Flaky)

These tests are still critical but depend on external services or unbounded operations. Run nightly, not on every PR.

#### P0-B-1: Full Stripe Payment Flow
**File**: `p0b-stripe-payment.spec.ts`

```
Journey: User purchases AI time via Stripe → balance updates

Steps:
1. Login as e2e-low-quota user
2. Trigger quota exceeded state
3. Click "Purchase More Time"
4. Complete Stripe checkout (test mode, 4242 card)
5. Wait for webhook confirmation
6. Verify balance updated in UI
7. Verify can now trigger build

Why P0-B: Stripe webhooks can be slow/flaky in test mode.
```

#### P0-B-2: GitHub Integration
**File**: `p0b-github-integration.spec.ts`

```
Journey: Connect GitHub → push code → verify commit

Steps:
1. Login with test OAuth tokens (pre-authorized test app)
2. Navigate to project settings
3. Connect to test repository
4. Verify connection status
5. Make change in builder
6. Verify commit appears in GitHub (API check)

Why P0-B: OAuth + GitHub API = external dependency.
```

#### P0-B-3: Website Migration (UI Phases)
**File**: `p0b-migration-flow.spec.ts`

```
Journey: Start migration → verify phases → complete

Steps:
1. Login as authenticated user
2. Start migration with pre-verified test domain
3. Wait for analysis phase (mock verification step)
4. Review migration plan
5. Approve transformation
6. Verify new project created

Why P0-B: Real AI analysis has variable timing.
Mock ownership verification for CI.
```

#### P0-B-4: Advisor Booking
**File**: `p0b-advisor-booking.spec.ts`

```
Journey: Find advisor → book session → verify booking

Steps:
1. Login as client
2. Browse advisor directory
3. Filter by specialty
4. View test advisor profile
5. Book pre-seeded available slot
6. Verify booking confirmation

Why P0-B: Calendar/scheduling has external deps.
Don't test email or real-time room in E2E.
```

#### P0-B-5: Subscription Lifecycle
**File**: `p0b-subscription-lifecycle.spec.ts`

```
Journey: Upgrade plan → access premium → downgrade

Steps:
1. Login as free tier user
2. Navigate to pricing
3. Select premium plan
4. Complete Stripe checkout
5. Verify subscription active
6. Access premium feature
7. Downgrade (verify scheduled for next cycle)

Why P0-B: Depends on Stripe + webhooks.
```

#### P0-B-6: Migration Quality Gates (Full Pipeline)
**File**: `p0b-migration-quality-gates.spec.ts`

```
Journey: Migration completes → verification runs → quality gates execute → results displayed

Steps:
1. Login as authenticated user
2. Start migration with pre-verified test domain
3. Complete migration transformation phase
4. Observe verification queue job enqueued
5. Wait for TypeScript gate result (pass/fail)
6. Wait for Build gate result (pass/fail)
7. Wait for Accessibility audit results (advisory)
8. Wait for SEO check results (advisory)
9. Verify gate results displayed in UI:
   - Pass/fail status badges
   - Error/warning counts
   - Actionable issue list with file locations
10. Verify fail-fast behavior (if TS fails, build skipped)

Assertions:
- All 4 gates execute in correct order
- Blocking gates (TS, build) stop on failure
- Advisory gates (a11y, SEO) continue after blocking failure
- Results contain specific error messages with line numbers
- UI shows clear pass/fail/skip status per gate

Why P0-B: Real build verification has variable timing.
Verification queue has separate concurrency management.
```

#### P0-B-7: Migration Asset Pipeline
**File**: `p0b-migration-asset-pipeline.spec.ts`

```
Journey: Migration downloads assets → optimizes images → respects limits

Steps:
1. Login as authenticated user
2. Start migration with test site containing:
   - Same-origin images (should download)
   - External CDN images from allowlist (should download)
   - Stock photo site images (should skip - blocklist)
   - Large image > 8MB (should skip - size limit)
   - Google Fonts (should download)
3. Wait for asset pipeline phase
4. Verify asset pipeline results:
   - Correct assets downloaded
   - Blocklisted domains skipped with reason
   - Size-limited files skipped with reason
   - WebP optimization applied (if Sharp available)
5. Verify optimized assets in generated project:
   - Images converted to WebP
   - Original URLs rewritten to local paths
   - Compression ratio in metadata

Assertions:
- Same-origin images: downloaded and optimized
- Allowlisted CDN: downloaded
- Blocklisted domains: skipped with "Blocklisted domain" reason
- Oversized files: skipped with size limit reason
- Total size respects 50MB cap
- WebP conversion reduces file sizes

Why P0-B: Asset downloading involves network calls.
Sharp optimization has variable timing.
```

#### P0-B-8: Migration Accessibility Audit Details
**File**: `p0b-migration-a11y-audit.spec.ts`

```
Journey: Generated code → accessibility audit → detailed issue report

Steps:
1. Login as authenticated user
2. Start migration with test site containing known a11y issues:
   - Images without alt attributes
   - Form inputs without labels
   - Empty buttons (icon-only without aria-label)
   - Links with href="#"
   - Heading hierarchy issues (h1 → h3 skip)
3. Wait for migration and verification complete
4. Navigate to quality gates results
5. Verify accessibility audit report:
   - Issues categorized by type
   - Each issue has file path and line number
   - Severity (error vs warning) correctly assigned
   - Summary counts match issue list
6. Click on issue to navigate to affected file/line

Assertions:
- Missing alt: flagged as error
- Missing form labels: error (without placeholder), warning (with placeholder)
- Empty buttons: flagged as warning
- Empty href links: flagged as warning
- Heading skip: flagged as warning
- Page without h1: flagged as warning
- Issue count matches actual code issues

Why P0-B: Requires real code generation and static analysis.
```

#### P0-B-9: Migration SEO Check Details
**File**: `p0b-migration-seo-check.spec.ts`

```
Journey: Generated pages → SEO check → detailed recommendations

Steps:
1. Login as authenticated user
2. Start migration with test site
3. Wait for migration and verification complete
4. Navigate to quality gates results
5. Verify SEO check report:
   - Metadata export detection (present/missing per page)
   - generateMetadata function detection
   - Viewport configuration check
   - Semantic HTML structure analysis
   - Sitemap presence check
   - robots.txt presence check
6. Verify recommendations are actionable:
   - Missing metadata → "Add export const metadata = {...}"
   - Missing h1 → "Add h1 heading for SEO"
   - No semantic HTML → "Use <main>, <article>, <section>"

Assertions:
- Root layout metadata detected
- Per-page metadata detection accurate
- Missing metadata flagged with file path
- Sitemap/robots.txt status accurate
- Recommendations include code examples

Why P0-B: Requires real code generation and file system scanning.
```

---

## Phase 2: Core Journey Tests

Run on every PR. May have occasional flakes but should be > 98% stable.

### Core-1: Multi-Locale Navigation
**File**: `core-locale-navigation.spec.ts`

```
Test all 9 locales:
- Homepage renders correctly
- Navigation works
- Forms accept locale-specific input
- Date/currency formatting correct
- RTL layout for Arabic locales
```

### Core-2: Project Settings Management
**File**: `core-project-settings.spec.ts`

```
- Rename project
- Update project description
- Change visibility (public/private)
- Configure custom domain
- Delete project (with confirmation)
```

### Core-3: Collaboration Workflow
**File**: `core-collaboration.spec.ts`

```
- Owner invites collaborator (generates invite token)
- Collaborator accepts via direct link using token
- Collaborator gains access to project
- Owner can remove collaborator
- Permission levels work correctly

NOTE: Do NOT assert on email delivery - that's an external dependency.
Test the invite token → accept flow purely internally.
```

### Core-4: Export and Download
**File**: `core-export.spec.ts`

```
- Export project as ZIP
- Export to GitHub repository
- Download build artifacts
- Export analytics data (CSV)
```

### Core-5: Admin Dashboard (Admin Role)
**File**: `core-admin-dashboard.spec.ts`

```
- Login as admin
- View system metrics
- Manage feature flags
- Review user accounts
- Access audit logs
```

### Core-6: Version History and Rollback
**File**: `core-version-history.spec.ts`

```
- View version history
- Compare versions
- Rollback to previous version
- Verify rollback successful
```

### Core-7: Real-time Collaboration
**File**: `core-realtime-collab.spec.ts`

```
- Two users viewing same project
- User A makes change
- User B sees update (within 2s)
- Presence indicators work
```

### Core-8: Notifications and Alerts
**File**: `core-notifications.spec.ts`

```
- Build completion notification
- Advisor booking notification
- Billing alerts
- Mark notifications as read
```

### Core-9: Search and Discovery
**File**: `core-search.spec.ts`

```
- Search projects by name
- Search advisors by specialty
- Search solutions catalog
- Filter and sort results
```

### Core-10: Profile and Account Management
**File**: `core-profile.spec.ts`

```
- Update profile information
- Change password
- Update notification preferences
- Connect/disconnect integrations
- Delete account (with data export)
```

### Core-11: Migration Quality Gates UI
**File**: `core-migration-quality-gates-ui.spec.ts`

```
Tests for quality gates result visualization:

- Gate status badges render correctly (pass/fail/skip)
- Error list expands to show details
- Warning list distinct from errors
- File paths are clickable links
- Line numbers displayed for located issues
- Gate timing/duration shown
- Fail-fast indicator when gate skipped
- Metadata panel shows additional context:
  - Files scanned count
  - Issue type breakdown
  - Compression ratios (for assets)
- Retry button available for failed gates
- Export results as JSON/PDF
```

### Core-12: Migration Asset Pipeline UI
**File**: `core-migration-asset-pipeline-ui.spec.ts`

```
Tests for asset pipeline result visualization:

- Asset list shows all processed files
- Each asset shows: original URL, local path, size, status
- Optimized badge for WebP-converted images
- Skipped assets shown with skip reason
- Failed assets shown with error message
- Stats summary:
  - Total URLs processed
  - Downloaded count
  - Optimized count
  - Skipped count
  - Failed count
  - Total size / Saved bytes
- Filter assets by status (processed/skipped/failed)
- Filter assets by type (image/font/script/style)
- Click asset to preview (images)
```

### Core-13: Verification Queue Status
**File**: `core-verification-queue-status.spec.ts`

```
Tests for verification queue monitoring:

- Queue status indicator (active/idle)
- Current job progress display
- Job history list
- Job details panel:
  - Project ID
  - Migration ID
  - Gates requested
  - Start time / Duration
  - Result status
- Cancel running verification button
- Re-queue verification button
- Concurrency indicator (1 worker max)
```

---

## Phase 3: Enhanced Smoke Tests

Quick sanity checks that run on every commit. Target: < 2 minutes total.

### Smoke Tests to Add

| Test | Purpose |
|------|---------|
| `api-health.smoke.spec.ts` | All critical API endpoints return 200 |
| `sse-connection.smoke.spec.ts` | SSE connections establish and receive heartbeat |
| `stripe-elements.smoke.spec.ts` | Stripe payment elements load |
| `integration-icons.smoke.spec.ts` | Integration status icons render |
| `mobile-menu.smoke.spec.ts` | Mobile navigation works |
| `feature-flags.smoke.spec.ts` | Critical flags are correctly configured |

---

## Test Infrastructure Improvements

### 1. Test Data Isolation (Critical)

**Problem**: Shared test emails like `test-pro@example.com` will collide in parallel runs, retries, or local dev.

**Solution**: Unique per-run identifiers.

```typescript
// tests/fixtures/test-data.ts
import { randomUUID } from 'crypto';

// Generate unique identifiers per test run
const RUN_ID = process.env.E2E_RUN_ID || randomUUID().slice(0, 8);
const WORKER_INDEX = process.env.TEST_WORKER_INDEX || '0';

// Monotonic counter per worker (deterministic, greppable in logs)
let resourceCounter = 0;

export function uniqueEmail(persona: string): string {
  return `e2e+${persona}+${RUN_ID}+w${WORKER_INDEX}@test.sheenapps.com`;
}

export function uniqueProjectName(base: string): string {
  // Use counter instead of Date.now() - deterministic and easier to grep
  // Format: coffee-abc123-w0-001
  resourceCounter++;
  const counter = String(resourceCounter).padStart(3, '0');
  return `${base}-${RUN_ID}-w${WORKER_INDEX}-${counter}`;
}

// Seeded test users (pre-created, known state)
// These have pre-generated storageState files for fast auth
export const SeededUsers = {
  // These exist in test DB with known passwords
  free: 'e2e-seeded-free@test.sheenapps.com',
  pro: 'e2e-seeded-pro@test.sheenapps.com',
  lowQuota: 'e2e-seeded-low-quota@test.sheenapps.com',
  admin: 'e2e-seeded-admin@test.sheenapps.com',
  advisor: 'e2e-seeded-advisor@test.sheenapps.com',
};

// Test projects for fast build paths
export const TestProjects = {
  simpleApp: {
    idea: 'e2e-coffee-shop', // Triggers fast build path
    expectedBuildTime: 5000,
  },
  failingApp: {
    idea: 'e2e-failing-app', // Triggers deterministic failure
    expectedError: 'Invalid configuration',
  },
};
```

### 2. Two-Layer Cleanup (Crash-Proof)

**Problem**: Per-test cleanup fails if test crashes mid-flight.

**Solution**: Two layers of cleanup.

```typescript
// tests/helpers/cleanup.ts

// Layer 1: Per-test cleanup (best effort)
export async function cleanupTestProject(projectId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/admin/e2e/cleanup/project/${projectId}`, {
      method: 'DELETE',
      headers: { 'X-E2E-Admin-Key': process.env.E2E_ADMIN_KEY },
    });
  } catch (e) {
    console.warn(`Per-test cleanup failed for project ${projectId}:`, e);
    // Don't throw - global cleanup will catch it
  }
}

// Layer 2: Global cleanup sweep (CI teardown)
// Deletes all resources tagged with this run's ID
export async function globalCleanupByRunId(runId: string): Promise<void> {
  await fetch(`${API_URL}/api/admin/e2e/cleanup/run/${runId}`, {
    method: 'DELETE',
    headers: { 'X-E2E-Admin-Key': process.env.E2E_ADMIN_KEY },
  });
}

// All test-created resources should be tagged
export function tagForCleanup(metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    ...metadata,
    e2e_run_id: process.env.E2E_RUN_ID,
    e2e_created_at: Date.now(),
  };
}
```

**Backend endpoint needed** (with guardrails to prevent accidents):
```typescript
// DELETE /api/admin/e2e/cleanup/run/:runId
//
// GUARDRAILS (prevent "oops we nuked staging"):
// 1. Route only enabled when E2E_MODE=true on server
// 2. Requires X-E2E-Admin-Key header
// 3. Only deletes rows where metadata.e2e_run_id EXISTS and matches :runId
// 4. Hard limit: max 5000 deletions per request (fail if more, require manual)
// 5. Logs every deletion for audit trail

async function cleanupByRunId(runId: string, adminKey: string) {
  // Validate environment
  if (process.env.E2E_MODE !== 'true') {
    throw new Error('Cleanup endpoint disabled - E2E_MODE not enabled');
  }

  // Count affected rows first
  const count = await db.count('projects')
    .where('metadata->e2e_run_id', '=', runId);

  if (count > 5000) {
    throw new Error(`Too many rows (${count}) - manual cleanup required`);
  }

  // Delete with explicit e2e_run_id check
  const deleted = await db.delete('projects')
    .whereNotNull('metadata->e2e_run_id')  // MUST have tag
    .where('metadata->e2e_run_id', '=', runId);

  logger.info('E2E cleanup completed', { runId, deleted });
  return { deleted };
}
```

**CI teardown step**:
```yaml
- name: Global E2E Cleanup
  if: always()
  run: |
    curl -X DELETE "$API_URL/api/admin/e2e/cleanup/run/$E2E_RUN_ID" \
      -H "X-E2E-Admin-Key: $E2E_ADMIN_KEY"
```

### 3. Bounded Wait Conventions

Every async operation must have a bounded timeout. This prevents "why did CI hang for 30 minutes".

```typescript
// tests/helpers/timeouts.ts

// Standard timeouts (adjust based on your system)
export const TIMEOUTS = {
  navigation: 10_000,      // Page navigation
  aiResponse: 15_000,      // AI streaming response (fixture mode)
  buildFast: 10_000,       // Fast build path
  buildReal: 120_000,      // Real build (P0-B only)
  sseConnection: 5_000,    // SSE handshake
  apiCall: 5_000,          // Standard API call
  animation: 1_000,        // UI animation settling
} as const;

// Shared helper for consistent timeout errors
export async function expectWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  context: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout after ${timeout}ms: ${context}`));
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise]);
}

// Usage:
// await expectWithTimeout(
//   page.waitForSelector('.build-complete'),
//   TIMEOUTS.buildFast,
//   'waiting for build completion'
// );
```

### 4. SSE Testing Helpers (Fixed)

**Problems with original**:
1. Never closes EventSource (memory leak)
2. "wait for > 0 events" can pass too early
3. Misses later required events

**Fixed version**:

```typescript
// tests/helpers/sse.ts
interface SSEEvent {
  type: string;
  data: string;
  timestamp: number;
}

interface WaitForSSEOptions {
  url: string;
  terminalEvents: string[];     // Events that signal "done" (e.g., 'build_complete', 'build_error')
  collectEvents?: string[];     // Event types to collect (default: all)
  timeout?: number;             // Max wait time (default: 30s)
  onEvent?: (event: SSEEvent) => void;  // Optional callback per event
}

export async function waitForSSETerminalEvent(
  page: Page,
  options: WaitForSSEOptions
): Promise<{ events: SSEEvent[]; terminal: SSEEvent }> {
  const {
    url,
    terminalEvents,
    collectEvents = [],
    timeout = 30000,
  } = options;

  // Set up SSE listener in page context
  await page.evaluate(({ url, terminalEvents, collectEvents }) => {
    window.__sseState = {
      events: [],
      terminal: null,
      error: null,
      source: null,
    };

    const source = new EventSource(url);
    window.__sseState.source = source;

    const handleEvent = (type: string) => (e: MessageEvent) => {
      const event = {
        type,
        data: e.data,
        timestamp: Date.now(),
      };

      // Collect if matching filter (or no filter)
      if (collectEvents.length === 0 || collectEvents.includes(type)) {
        window.__sseState.events.push(event);
      }

      // Check for terminal event
      if (terminalEvents.includes(type)) {
        window.__sseState.terminal = event;
        source.close();  // <-- IMPORTANT: Close the connection
      }
    };

    // Listen for specific event types
    [...terminalEvents, ...collectEvents].forEach(type => {
      source.addEventListener(type, handleEvent(type));
    });

    // Also listen for generic messages
    source.addEventListener('message', handleEvent('message'));

    source.onerror = (e) => {
      window.__sseState.error = 'SSE connection error';
      source.close();
    };
  }, { url, terminalEvents, collectEvents });

  // Wait for terminal event or timeout
  try {
    await page.waitForFunction(
      () => window.__sseState?.terminal !== null || window.__sseState?.error !== null,
      { timeout }
    );
  } catch (e) {
    // Timeout - close connection and report
    await page.evaluate(() => {
      window.__sseState?.source?.close();
    });
    throw new Error(`SSE timeout waiting for terminal events: ${terminalEvents.join(', ')}`);
  }

  // Get results and ensure cleanup
  const result = await page.evaluate(() => {
    const state = window.__sseState;
    state.source?.close();  // Ensure closed
    return {
      events: state.events,
      terminal: state.terminal,
      error: state.error,
    };
  });

  if (result.error) {
    throw new Error(result.error);
  }

  return {
    events: result.events,
    terminal: result.terminal!,
  };
}

// Usage example:
// const { events, terminal } = await waitForSSETerminalEvent(page, {
//   url: `/api/builds/${buildId}/events`,
//   terminalEvents: ['build_complete', 'build_error'],
//   collectEvents: ['build_progress', 'build_log'],
//   timeout: 60000,
// });
```

**Additional SSE safeguards**:

```typescript
// Belt and suspenders: also close on page close/test teardown
test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    window.__sseState?.source?.close();
  }).catch(() => {}); // Ignore if page already closed
});

// NOTE on generic 'message' listener:
// Some backends send all events as generic 'message' events with type in data.
// This can cause duplicates if you also listen to named events.
// If you see duplicates, either:
// 1. Remove the generic listener, OR
// 2. Dedupe in assertions by event ID/timestamp
```

### 5. Mocking Strategy (Be Intentional)

**Principle**: Don't mock away your true failures.

```typescript
// tests/helpers/mock-strategy.ts

/**
 * MOCKING RULES:
 *
 * 1. P0-A tests: Mock AI responses, NOT SSE transport
 *    - Use fixture AI responses for determinism
 *    - Keep SSE real to catch transport bugs
 *
 * 2. P0-B tests: Real everything (why they're nightly)
 *    - These catch integration issues
 *    - Flakiness is expected and acceptable
 *
 * 3. Core tests: Mock external services, keep internal real
 *    - Mock: Stripe, GitHub, Vercel, email
 *    - Real: SSE, chat, builds, database
 *
 * 4. Smoke tests: No mocking (fast real checks)
 */

// GOOD: Mock AI responses but keep SSE real
export async function enableFixtureAI(page: Page) {
  await page.route('**/api/ai/generate', (route) => {
    const requestBody = route.request().postDataJSON();
    const fixture = AI_FIXTURES[requestBody.prompt] || DEFAULT_AI_FIXTURE;

    // Simulate streaming response
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: createStreamingResponse(fixture),
    });
  });
}

// BAD: Don't mock SSE transport in P0 tests
// This hides real SSE bugs which are exactly what we care about
export async function DONT_DO_THIS_mockBuildSSE(page: Page) {
  // ❌ Mocking the SSE endpoint hides transport bugs
  await page.route('**/api/builds/**/events', ...);
}

// GOOD: Keep at least one P0 test with real SSE end-to-end
// p0a-project-lifecycle.spec.ts should use real SSE
```

### 6. Custom Fixtures

```typescript
// tests/fixtures/project.fixture.ts
import { test as base } from '@playwright/test';
import { SeededUsers, TestProjects, tagForCleanup } from './test-data';
import { cleanupTestProject } from '../helpers/cleanup';

export const test = base.extend<{
  authenticatedPage: Page;
  projectWithBuild: { id: string; name: string };
}>({
  authenticatedPage: async ({ page }, use) => {
    // Login with seeded pro user
    await login(page, SeededUsers.pro);
    await use(page);
  },

  projectWithBuild: async ({ authenticatedPage }, use) => {
    // Create project with fast build path
    const project = await createTestProject(authenticatedPage, {
      ...TestProjects.simpleApp,
      metadata: tagForCleanup({}),
    });

    // Wait for build to complete
    await waitForSSETerminalEvent(authenticatedPage, {
      url: `/api/builds/${project.buildId}/events`,
      terminalEvents: ['build_complete'],
      timeout: 10000,  // Fast build path = 5s + buffer
    });

    await use(project);

    // Cleanup (best effort, global sweep catches failures)
    await cleanupTestProject(project.id);
  },
});
```

---

## Implementation Priorities

### Week 1: Foundation
- [x] Implement deterministic E2E mode in backend (seeded users, fast build paths, fixture AI)
  - Created `sheenapps-claude-worker/src/middleware/e2eMode.ts`
  - Added `FAST_BUILD_PROJECTS`, `AI_FIXTURES`, `FAST_MIGRATION_DOMAINS`, `E2E_FEATURE_FLAGS`
  - Implemented `isE2ERequest()`, `tagForE2ECleanup()`, fixture helpers
- [x] Set up test data isolation (unique per-run identifiers)
  - Created `tests/e2e/fixtures/test-data.ts`
  - Implemented `RUN_ID`, `WORKER_INDEX`, `uniqueEmail()`, `uniqueProjectName()`
  - Added `SeededUsers`, `TestProjects`, `TestMigrationDomains` fixtures
- [x] Implement two-layer cleanup system
  - Created `tests/e2e/helpers/cleanup.ts` (per-test + global sweep)
  - Created `tests/e2e/global-teardown.ts` (Playwright hook)
- [x] Add backend cleanup endpoint
  - Created `sheenapps-claude-worker/src/routes/e2eCleanup.ts`
  - Guardrails: E2E_MODE required, admin key, max 5000 deletions, audit logging
- [x] Add bounded wait helpers
  - Created `tests/e2e/helpers/timeouts.ts` with `TIMEOUTS`, `waitFor()`, `withTimeout()`
- [x] Add SSE testing helpers
  - Created `tests/e2e/helpers/sse.ts` with `createSSEListener()`, `waitForBuildComplete()`
- [x] Add auth helpers
  - Created `tests/e2e/helpers/auth.ts` with `loginViaUI()`, `loginViaAPI()`, `ensureAuthenticated()`
- [x] Add `p0a-project-lifecycle.spec.ts` (real SSE, fast build path)
- [x] Add `p0a-build-recovery.spec.ts`
- [x] Update Playwright config for P0-A/P0-B separation

### Week 2: Deploy-Blocking Suite
- [ ] Add `p0a-quota-enforcement.spec.ts`
- [ ] Add `p0a-chat-persistence.spec.ts` (fixture AI)
- [ ] Add `p0a-feature-flags.smoke.spec.ts`
- [ ] Implement fixed SSE helper
- [ ] Add API health smoke tests

### Week 3: Nightly Suite + Core
- [ ] Add `p0b-stripe-payment.spec.ts`
- [ ] Add `p0b-github-integration.spec.ts`
- [ ] Add `p0b-migration-flow.spec.ts`
- [ ] Add `core-realtime-collab.spec.ts`
- [ ] Add SSE connection smoke test

### Week 4: User Journeys
- [ ] Add `p0b-advisor-booking.spec.ts`
- [ ] Add `p0b-subscription-lifecycle.spec.ts`
- [ ] Add core journey tests (settings, export, notifications)
- [ ] Add mobile smoke tests

### Week 5: Migration Tool Quality Gates
- [ ] Add `p0b-migration-quality-gates.spec.ts` (full verification pipeline)
- [ ] Add `p0b-migration-asset-pipeline.spec.ts` (asset downloading/optimization)
- [ ] Add `p0b-migration-a11y-audit.spec.ts` (accessibility audit details)
- [ ] Add `p0b-migration-seo-check.spec.ts` (SEO check details)
- [ ] Add `core-migration-quality-gates-ui.spec.ts` (gate results UI)
- [ ] Add `core-migration-asset-pipeline-ui.spec.ts` (asset results UI)
- [ ] Add `core-verification-queue-status.spec.ts` (queue monitoring)
- [ ] Add E2E fixtures for migration test domains with known issues
- [ ] Add backend E2E mode for fast verification paths

### Week 6: Polish
- [ ] Review and stabilize all new tests
- [ ] Document test patterns and mocking strategy
- [ ] Configure CI pipeline with correct ordering
- [ ] Run nightly suite for 1 week, identify/fix flakes

---

## Success Metrics

| Metric | Target |
|--------|--------|
| P0-A Pass Rate | 100% (deploy-blocking) |
| P0-B Pass Rate | > 95% (nightly) |
| Core Test Pass Rate | > 98% |
| Smoke Test Duration | < 2 minutes |
| P0-A Test Duration | < 5 minutes |
| Flaky Test Rate (P0-A) | 0% |
| Test Maintenance Burden | < 2 hours/week |

---

## Test Naming Convention

```
{priority}-{feature}-{scenario}.spec.ts

Examples:
- p0a-project-lifecycle.spec.ts      (deploy-blocking)
- p0a-build-recovery.spec.ts         (deploy-blocking)
- p0b-stripe-payment.spec.ts         (nightly)
- p0b-github-integration.spec.ts     (nightly)
- core-collaboration-invite.spec.ts
- smoke-api-health.spec.ts
```

---

## CI/CD Integration

### PR Pipeline (Fail Fast)

```yaml
stages:
  - name: smoke
    parallel: true
    timeout: 2m
    blocking: true

  - name: p0-a
    parallel: false  # Sequential for determinism (see note below)
    timeout: 5m
    blocking: true   # MUST pass for merge
    # NOTE: Start with 1 worker. After 2 weeks stable, try workers: 2
    # (sequential within file, parallel across files)

  - name: core
    parallel: true
    timeout: 10m
    blocking: true

# NOTE: P0-A runs BEFORE core
# Developers find out "you broke the money pipe" in 5 min, not 15
```

### Nightly Pipeline

```yaml
stages:
  - name: all-smoke
    parallel: true

  - name: p0-a
    parallel: false

  - name: p0-b           # External service tests
    parallel: false
    allow_failure: false  # Still want to know about failures

  - name: core
    parallel: true

  - name: quarantine     # Flaky tests being fixed
    allow_failure: true

  - name: cross-browser
    matrix: [chromium, firefox, webkit]

  - name: mobile-viewports
    matrix: [iphone-12, pixel-5]

# Global cleanup runs regardless of test results
post_always:
  - name: global-cleanup
    run: curl -X DELETE "$API_URL/api/admin/e2e/cleanup/run/$E2E_RUN_ID"
```

---

## Appendix: Test File Structure

```
tests/
├── e2e/
│   ├── p0-a/                          # Deploy-blocking (deterministic)
│   │   ├── p0a-project-lifecycle.spec.ts
│   │   ├── p0a-build-recovery.spec.ts
│   │   ├── p0a-quota-enforcement.spec.ts
│   │   ├── p0a-chat-persistence.spec.ts
│   │   └── p0a-feature-flags.smoke.spec.ts
│   ├── p0-b/                          # Nightly (external deps)
│   │   ├── p0b-stripe-payment.spec.ts
│   │   ├── p0b-github-integration.spec.ts
│   │   ├── p0b-migration-flow.spec.ts
│   │   ├── p0b-advisor-booking.spec.ts
│   │   ├── p0b-subscription-lifecycle.spec.ts
│   │   ├── p0b-migration-quality-gates.spec.ts
│   │   ├── p0b-migration-asset-pipeline.spec.ts
│   │   ├── p0b-migration-a11y-audit.spec.ts
│   │   └── p0b-migration-seo-check.spec.ts
│   ├── core/
│   │   ├── core-locale-navigation.spec.ts
│   │   ├── core-project-settings.spec.ts
│   │   ├── core-collaboration.spec.ts
│   │   ├── core-export.spec.ts
│   │   ├── core-admin-dashboard.spec.ts
│   │   ├── core-version-history.spec.ts
│   │   ├── core-realtime-collab.spec.ts
│   │   ├── core-notifications.spec.ts
│   │   ├── core-search.spec.ts
│   │   ├── core-profile.spec.ts
│   │   ├── core-migration-quality-gates-ui.spec.ts
│   │   ├── core-migration-asset-pipeline-ui.spec.ts
│   │   └── core-verification-queue-status.spec.ts
│   ├── smoke/
│   │   ├── api-health.smoke.spec.ts
│   │   ├── sse-connection.smoke.spec.ts
│   │   ├── stripe-elements.smoke.spec.ts
│   │   ├── integration-icons.smoke.spec.ts
│   │   ├── mobile-menu.smoke.spec.ts
│   │   └── feature-flags.smoke.spec.ts
│   ├── fixtures/
│   │   ├── test-data.ts               # Unique IDs, seeded users
│   │   ├── project.fixture.ts
│   │   ├── user.fixture.ts
│   │   ├── ai-fixtures.ts             # Deterministic AI responses
│   │   └── migration-fixtures.ts      # Test domains with known a11y/SEO issues
│   ├── helpers/
│   │   ├── sse.ts                     # Fixed SSE helper
│   │   ├── cleanup.ts                 # Two-layer cleanup
│   │   ├── mock-strategy.ts           # Mocking guidelines
│   │   └── api.ts
│   └── utils.ts
├── fixtures/
│   └── smoke-fixtures.ts
└── factories/
    └── index.ts
```

---

## Golden Signals on Failure

When a P0-A test fails, automatically capture these artifacts to turn "flake mysteries" into "actionable bug reports":

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'retain-on-failure',      // Full trace for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Custom reporter to attach extra context
  reporter: [
    ['html'],
    ['./tests/reporters/golden-signals.ts'],
  ],
});

// tests/reporters/golden-signals.ts
// On P0-A failure, also attach:
// - Console logs (page.on('console'))
// - Last 50 SSE events from window.__sseState
// - Network errors (page.on('requestfailed'))
// - Current localStorage/sessionStorage state
```

**Artifact checklist for P0-A failures**:
- [ ] Playwright trace (shows every action + network)
- [ ] Screenshot at failure point
- [ ] Video of test run
- [ ] Console logs (errors + warnings)
- [ ] Last 50 SSE events (if applicable)
- [ ] Network request failures

This turns a failed test from "it broke" into "here's exactly what happened".

---

## Notes

- **Backend tests** for sheenapps-claude-worker are separate (Jest-based) and should focus on unit/integration testing of API routes and services
- This plan focuses on **frontend E2E tests** that validate the full user experience
- **Auth strategy**: P0-A uses storageState (pre-auth), P0-B uses real login as auth canary
- **P0-A tests are sacred** - if one starts flaking, fix it immediately or move to P0-B
- The goal is tests people **trust**, not tests people fear and skip

---

## Changelog

- **v4**: Added Migration Tool Quality Gates E2E tests (Phase 5)
  - Added P0-B-6: Migration Quality Gates (full verification pipeline)
  - Added P0-B-7: Migration Asset Pipeline (asset downloading/optimization)
  - Added P0-B-8: Migration Accessibility Audit Details
  - Added P0-B-9: Migration SEO Check Details
  - Added Core-11: Migration Quality Gates UI
  - Added Core-12: Migration Asset Pipeline UI
  - Added Core-13: Verification Queue Status
  - Added Week 5 implementation priority for migration tool tests
  - Added migration-fixtures.ts for test domains with known issues
  - Tests cover: sequential fail-fast gates, blocklist/allowlist logic,
    WebP optimization, a11y static analysis (alt, labels, buttons, links, headings),
    SEO checks (metadata, viewport, semantic HTML, sitemap, robots.txt)
  - **Backend fix**: Verification queue jobId now includes migrationId to prevent
    overlapping migration edge case (expert review feedback, gatesHash rejected
    as over-engineering since gates are orchestrated consistently)

- **v3**: Final polish from expert review
  - Clarified auth strategy: storageState for P0-A/smoke, real login for P0-B as auth canary
  - Added bounded wait conventions with shared `expectWithTimeout()` helper
  - Fixed unique IDs: RUN_ID + WORKER_INDEX + counter (no more Date.now() collisions)
  - Added cleanup endpoint guardrails (require e2e_run_id, hard limit 5k, require E2E_MODE)
  - Made E2E mode activation explicit via `X-E2E-Mode` and `X-E2E-Run-Id` headers
  - Added SSE safeguards: close on page teardown, note about generic listener duplicates
  - Fixed collaboration test: no email delivery assertion (test invite token flow only)
  - Added CI note: start sequential, try 2 workers after 2 weeks stable
  - Added "Golden Signals on Failure" section (trace, console, SSE events, screenshot)

---

## Implementation Notes & Discoveries

### Week 1 Implementation (2026-01-23)

**Files Created:**

Backend (sheenapps-claude-worker):
- `src/middleware/e2eMode.ts` - E2E mode detection and fixtures
- `src/routes/e2eCleanup.ts` - Cleanup endpoints with guardrails

Frontend (sheenappsai):
- `tests/e2e/fixtures/test-data.ts` - Test data isolation
- `tests/e2e/helpers/cleanup.ts` - Two-layer cleanup system
- `tests/e2e/helpers/timeouts.ts` - Bounded wait conventions
- `tests/e2e/helpers/sse.ts` - SSE testing utilities
- `tests/e2e/helpers/auth.ts` - Authentication helpers
- `tests/e2e/helpers/index.ts` - Centralized exports
- `tests/e2e/global-teardown.ts` - Global cleanup hook
- `tests/e2e/p0-a/p0a-project-lifecycle.spec.ts` - First P0-A test
- `tests/e2e/p0-a/p0a-build-recovery.spec.ts` - Second P0-A test

**Config Updates:**
- `playwright.config.ts` - Added P0-A/P0-B separation, test directory patterns

**Key Design Decisions:**

1. **E2E Mode Activation**: Using both env var (`E2E_MODE=true`) AND headers (`X-E2E-Mode`, `X-E2E-Run-Id`). The env var enables the routes, headers activate per-request behavior. This prevents accidental E2E mode in production.

2. **Cleanup Guardrails**: Added hard limit of 5000 deletions per request to prevent "oops we nuked staging" scenarios. Requires both env var and admin key.

3. **Test Data Isolation**: Using `RUN_ID + WORKER_INDEX + counter` pattern instead of timestamps. More deterministic, easier to grep in logs.

4. **SSE Testing**: Created page-level SSE capture that tracks events via `window.__sseEvents`. Properly closes connections on test teardown.

5. **Playwright Config**: Added `testMatch` patterns for directory-based test filtering in addition to grep-based filtering.

**Expert Review Fixes (2026-01-23):**

1. **Fastify E2E Plugin** - Converted to proper Fastify plugin with `decorateRequest`:
   - Fixed lowercased headers bug (`x-e2e-mode` not `X-E2E-Mode`)
   - Used `fastify-plugin` wrapper for proper encapsulation
   - Request properties now properly decorated at runtime

2. **Cleanup Routes** - Performance improvements:
   - Removed `RETURNING id` from DELETE queries (saves memory)
   - Changed to `metadata ? 'e2e_run_id'` for index usage
   - Created migration `070-e2e-cleanup-indexes.sql` for partial indexes

3. **SSE Helper** - Replaced monkeypatch with direct connection:
   - Opens SSE connection directly from test (not intercepting app's EventSource)
   - More reliable and doesn't depend on app wiring
   - Added `cleanupSSE()` for proper teardown

4. **Auth Helper** - Fixed BASE_URL mismatch:
   - Now derives origin from `page.url()` after navigation
   - Works correctly with port 3000 (default) and 3100 (P0 tests)

5. **Playwright Config** - No retries for P0-A:
   - P0-A tests must be 100% reliable; retries mask flakiness
   - Other test types still get 2 retries on CI

6. **Console Error Capture** - Moved to beginning:
   - Errors now captured from test start, not end
   - Won't miss earlier errors

**TODO for Week 2:**
- Add remaining P0-A tests (quota-enforcement, chat-persistence, feature-flags)
- Add API health smoke tests
- Verify E2E mode works end-to-end with real backend

---

- **v2**: Incorporated expert review feedback
  - Split P0 into P0-A (deterministic, deploy-blocking) and P0-B (nightly, external deps)
  - Added "Deterministic E2E Mode" section with contracted backend switches
  - Fixed test data isolation (unique per-run identifiers)
  - Fixed SSE helper (closes connection, waits for terminal event)
  - Added two-layer cleanup system
  - Updated mocking strategy (don't mock away true failures)
  - Reordered CI pipeline (P0-A before core for faster feedback)
  - Added feature flags sanity test
  - Moved GitHub, migration, advisor, subscription tests to P0-B
