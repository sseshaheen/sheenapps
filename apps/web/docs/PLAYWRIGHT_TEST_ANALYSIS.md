# Playwright E2E Test Suite Analysis

**Generated:** January 8, 2026
**Analyzed by:** Claude Code + Expert Review
**Test Directory:** `/tests/e2e/`

---

## Executive Summary

The SheenApps Playwright test suite is **well-structured** with good coverage of critical flows, but has **reliability concerns** and **missing coverage** in several areas. The test infrastructure is sophisticated (dual Stripe modes, multi-region support, SSE testing), but some tests rely on brittle selectors and implicit waits that can cause flakiness.

**The #1 issue killing reliability:** Test data strategy is missing. No RUN_ID isolation, no centralized user/fixture management, no reset strategy.

### Overall Assessment

| Category | Score | Notes |
|----------|-------|-------|
| **Structure** | 8/10 | Well-organized with smoke + P0 separation |
| **Coverage** | 6/10 | Critical paths covered, gaps in edge cases |
| **Reliability** | 5/10 | Multiple flakiness risks identified |
| **Maintainability** | 7/10 | Good utilities, some code duplication |
| **Data Isolation** | 3/10 | No RUN_ID, credential sprawl, no reset strategy |

---

## 1. Test Architecture Overview

### Configuration (`playwright.config.ts`)

**Strengths:**
- Proper timeout configuration (45s smoke, 60s P0)
- Single worker to avoid race conditions (appropriate for Stripe/Supabase)
- Good artifact retention (screenshots, videos, traces on failure)
- Disabled animations for stability

**Concerns:**
- `globalTimeout` of 2 minutes for smoke tests may be too aggressive
- Missing browser diversity (only Chromium)
- No mobile viewport testing in config

### Test Categories

| Category | Files | Purpose | Risk Level |
|----------|-------|---------|------------|
| Smoke (`@smoke`) | 6 | Basic health checks | Low |
| P0 Critical (`P0-*`) | 4 | Production blockers | High |
| Functional | 3 | Feature validation | Medium |

---

## 2. Reliability Issues Identified

### Critical Issues (Require Immediate Attention)

#### 2.1 Hardcoded `waitForTimeout` Anti-Pattern
**Location:** Multiple files
**Severity:** HIGH

```typescript
// PROBLEMATIC - Found in multiple tests
await page.waitForTimeout(3000) // tests/e2e/utils.ts:87
await page.waitForTimeout(1000) // tests/e2e/auth.smoke.spec.ts:77
await page.waitForTimeout(2000) // tests/e2e/basic.smoke.spec.ts:179
```

**Problem:** Hardcoded waits cause:
- False failures if network is slow
- Unnecessarily slow tests when operations complete quickly
- Flakiness under CI load

**Recommendation:** Replace with **readiness contracts** per app area:

```typescript
// Define readiness contracts, not arbitrary waits:

// Dashboard ready = project list visible + API finished + skeleton gone
await page.waitForResponse(r => r.url().includes('/api/projects') && r.ok())
await expect(page.locator('[data-testid="project-list"]')).toBeVisible()
await expect(page.locator('.skeleton')).not.toBeVisible()

// Builder ready = workspace loaded + preview attached + ready marker
await expect(page.locator('[data-testid="builder-workspace"]')).toBeVisible()
await expect(page.locator('[data-testid="preview-frame"]')).toBeAttached()
await expect(page.locator('[data-testid="builder-root"][data-ready="true"]')).toBeVisible()

// Chat ready = SSE connected + input enabled
await expect(page.locator('[data-testid="connection-status"][data-status="connected"]')).toBeVisible()
await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled()
```

**Readiness markers best practices:**
- Prefer `data-ready` attribute over `window.__APP_READY__` (more inspectable in traces)
- Only emit in TEST_E2E mode (don't leak into prod UX)
- **Monotonic:** Once `true`, never goes back to `undefined` (prevents race conditions on rerenders)
- **Error-aware:** Set `data-ready="error"` on failure for fast, readable test failures
- Don't use boundingBox polling - boxes lie when fonts/images load late

```typescript
// In your React component (TEST_E2E mode only)
// MONOTONIC + ERROR-AWARE pattern
const [readyState, setReadyState] = useState<'loading' | 'ready' | 'error'>('loading')

useEffect(() => {
  // CRITICAL: Early return prevents re-setting once settled
  if (readyState !== 'loading') return

  // CRITICAL: Check error FIRST (error takes precedence over loaded)
  if (isError) setReadyState('error')
  else if (isLoaded) setReadyState('ready')
}, [isLoaded, isError, readyState])

<main
  data-testid="dashboard-root"
  data-ready={readyState === 'loading' ? undefined : readyState}
>
```

**Alternative (derived, no state):** If your loading/error are already stable:
```typescript
data-ready={isError ? 'error' : isLoaded ? 'ready' : undefined}
// But ensure "isLoaded" truly means settled, not just "first data arrived"
```

```typescript
// In tests: fast failure on error state
await expect(page.locator('[data-testid="dashboard-root"][data-ready="error"]'))
  .not.toBeVisible({ timeout: 100 }) // Fail fast if error

await expect(page.locator('[data-testid="dashboard-root"][data-ready="ready"]'))
  .toBeVisible({ timeout: 10000 }) // Wait for ready
```

#### 2.2 Stripe Iframe Selector Fragility
**Location:** `tests/fixtures/stripe-helpers.ts:192-227`
**Severity:** HIGH

The Stripe payment flow relies on multiple fallback selectors that break when Stripe updates their UI:

```typescript
const modernSelectors = [
  'iframe[title="Secure card payment input frame"]',
  'iframe[title="Secure card number input frame"]',
  // ... 6 more selectors
]
```

**Problem:** Stripe changes their iframe structure regularly, causing test breakage. Treat Stripe UI automation like radioactive material.

**Recommendation:** Split into 3 distinct test types:

| Test Type | What it validates | Method |
|-----------|-------------------|--------|
| **Session Creation** | App → Stripe session works | API-level, assert backend created CheckoutSession correctly |
| **Webhook Handling** | Payment events processed | Stripe CLI trigger or signed payload fixture, assert DB state |
| **UI Smoke** (optional) | Checkout page renders | One test only, tag `@stripe-ui`, allow retries, quarantine when Stripe changes |

```typescript
// NEW: API-level session test (reliable)
test('Creates valid Stripe checkout session', async ({ request }) => {
  const response = await request.post('/api/billing/create-checkout', {
    data: { priceId: 'price_test_pro' }
  })
  expect(response.ok()).toBeTruthy()
  const { sessionId, url } = await response.json()
  expect(sessionId).toMatch(/^cs_test_/)
  expect(url).toContain('checkout.stripe.com')
})

// NEW: Webhook test (reliable)
test('Processes payment webhook correctly', async ({ request }) => {
  const result = await stripeHelpers.triggerPaymentIntent('succeeded')
  expect(result.success).toBe(true)

  // Assert DB state changed
  await expect.poll(async () => {
    const sub = await request.get(`/api/test/subscription-status`)
    return (await sub.json()).status
  }).toBe('active')
})
```

**CI Strategy:** Use `confirmPaymentServerSide()` as default for CI. Run UI payment test nightly or on-demand only.

#### 2.3 Auth Setup Should Use storageState + API Login
**Location:** `tests/e2e/auth.setup.ts`
**Severity:** MEDIUM

**Current approach:** UI-based login with `Promise.all([waitForURL, click])`

**Better approach:** The real win is:
1. **Global setup** authenticates once via API (not UI)
2. **Save storageState** for reuse across all tests
3. **Keep ONE UI login test** to verify the login screen still works

**Critical:** Use a **browser context** in globalSetup, not just `request.newContext()`. API-only cookies may not mirror browser auth correctly (especially with Supabase PKCE / localStorage tokens).

```typescript
// tests/global-setup.ts - Browser context for reliable auth
import { chromium } from '@playwright/test'
import { TEST_CONFIG } from './fixtures/test-data'

export default async function globalSetup() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  // Navigate first (sets up cookies domain)
  await page.goto(process.env.BASE_URL || 'http://localhost:3000')

  // API login endpoint sets auth cookies properly
  const response = await page.request.post('/api/test/login', {
    data: {
      email: TEST_CONFIG.users.default.email,
      password: TEST_CONFIG.users.default.password,
    }
  })

  if (!response.ok()) {
    throw new Error(`Auth setup failed: ${response.status()}`)
  }

  // SANITY CHECK 1: UI shows authenticated
  await page.goto('/en/dashboard')
  const isAuthenticated = await page.locator('[data-testid="user-menu"]').isVisible()
  if (!isAuthenticated) {
    throw new Error('Auth setup succeeded but dashboard shows logged out state')
  }

  // SANITY CHECK 2: API calls actually work (catches token/claims issues)
  // UI can show "logged in" but tokens can be wrong
  const apiCheck = await page.request.get('/api/projects')
  if (!apiCheck.ok()) {
    throw new Error(`Auth setup succeeded but API returns ${apiCheck.status()}`)
  }

  // Save browser storage state (cookies + localStorage)
  await context.storageState({ path: 'playwright/.auth/user.json' })
  await browser.close()
}
```

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /global-setup\.ts/ },
    {
      name: 'chromium',
      use: { storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
})
```

**Then keep ONE UI test:**
```typescript
test('@smoke Login form works', async ({ page }) => {
  // This is the only test that actually exercises the login UI
  await page.goto('/en/auth/login')
  // ... fill form, verify redirect
})
```

### Medium Issues

#### 2.4 Inconsistent Test User Credentials
**Location:** Multiple files
**Severity:** MEDIUM

```typescript
// auth.setup.ts
const email = process.env.TEST_EMAIL || 'shady.anwar1@gmail.com'

// smoke-fixtures.ts
export const TEST_USER: TestUser = {
  email: 'smoke_user@test.com',
  password: 'SmokeTest123!',
}

// utils.ts
client_stripe: {
  email: 'client+stripe@test.sheenapps.ai',
  password: 'SmokeTest123!',
}
```

**Problem:** Three different test user sources create confusion and potential test failures.

**Recommendation:** Centralize test user configuration in a single file.

#### 2.5 Insufficient Element Wait Strategies
**Location:** `tests/e2e/builder.smoke.spec.ts:79-87`
**Severity:** MEDIUM

```typescript
await expect.poll(async () => {
  const sections = await page.locator('[data-testid="preview-section"]').count()
  return sections > 0
}, {
  timeout: 10000,
  intervals: [500, 1000, 2000],
})
```

**Problem:** Polling for element count doesn't guarantee element is interactable.

**Recommendation:** Use `toBeVisible()` or `toBeEnabled()` instead.

### The Missing Piece: Test Data Strategy

**This is where test suites go to die.** The credential inconsistency is a symptom of a deeper problem: no unified test data strategy.

#### Current State (Broken)
```typescript
// 3 different user sources - which one is real?
auth.setup.ts:     'shady.anwar1@gmail.com'
smoke-fixtures.ts: 'smoke_user@test.com'
utils.ts:          'client+stripe@test.sheenapps.ai'
```

#### Required: Single Source of Truth

**Step 1: Set RUN_ID in CI workflow (not in code)**

```yaml
# .github/workflows/e2e.yml
env:
  TEST_RUN_ID: gh-${{ github.run_id }}-${{ github.run_attempt }}
```

This guarantees every shard gets the same RUN_ID. Less branching in code = fewer surprises.

```typescript
// tests/fixtures/test-data.ts - THE source of truth
export const TEST_CONFIG = {
  // RUN_ID comes from CI env, fallback to timestamp locally
  RUN_ID: process.env.TEST_RUN_ID ?? `local-${Date.now()}`,

  // Centralized user definitions
  users: {
    default: {
      email: process.env.TEST_EMAIL || 'e2e@test.sheenapps.ai',
      password: process.env.TEST_PASSWORD || 'TestPass123!',
    },
    stripe: {
      email: 'e2e+stripe@test.sheenapps.ai',
      password: 'TestPass123!',
      region: 'US',
    },
    paymob: {
      email: 'e2e+paymob@test.sheenapps.ai',
      password: 'TestPass123!',
      region: 'EG',
    },
  },

  // Known-good fixtures
  fixtures: {
    projectTemplate: 'test-project-template-id',
    activeSubscription: 'sub_test_active',
  },
}

// Helper to create unique test identifiers (stable across shards)
export function testId(prefix: string): string {
  return `${prefix}-${TEST_CONFIG.RUN_ID}-${Math.random().toString(36).slice(2, 8)}`
}
```

#### Required: Reset by RUN_ID (Not by User!)

**Critical distinction:** Don't reset "the user" - that destroys debugging info and causes collisions. Instead:
- Test creates data **labeled with run_id**
- Reset endpoint deletes **only rows with that run_id**
- Add TTL cleanup cron so test DB doesn't become an archaeological site

**Step 0: Database schema requirement**

This only works if you enforce tagging at write time. Add `test_run_id` to every table tests create:

```sql
-- Migration: Add test_run_id to tables used by E2E
ALTER TABLE projects ADD COLUMN test_run_id text;
ALTER TABLE messages ADD COLUMN test_run_id text;
ALTER TABLE builds ADD COLUMN test_run_id text;

-- Partial index for efficient cleanup (only indexes non-null values)
CREATE INDEX idx_projects_test_run ON projects(test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX idx_messages_test_run ON messages(test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX idx_builds_test_run ON builds(test_run_id) WHERE test_run_id IS NOT NULL;

-- TTL cleanup cron (run daily, delete test data older than 7 days)
-- DELETE FROM projects WHERE test_run_id IS NOT NULL AND created_at < NOW() - INTERVAL '7 days';
```

**Rule:** Any API route that creates mutable test data must accept `runId` and persist it. Without this, cleanup is half-effective and you slowly re-enter flake-land.

```typescript
// tests/fixtures/test-data.ts (continued)

// Bootstrap: creates test data labeled with RUN_ID, returns fixture bundle
// IMPORTANT: Cache result to avoid N tests creating N projects (quota/rate limit issues)
import fs from 'fs'
import path from 'path'

const FIXTURE_CACHE = `playwright/.fixtures/${TEST_CONFIG.RUN_ID}.json`

export async function bootstrapTestRun(request: APIRequestContext) {
  // Check cache first - avoid re-bootstrapping across workers/tests
  if (fs.existsSync(FIXTURE_CACHE)) {
    return JSON.parse(fs.readFileSync(FIXTURE_CACHE, 'utf-8'))
  }

  const response = await request.post('/api/test/bootstrap', {
    data: {
      runId: TEST_CONFIG.RUN_ID,
      createProject: true,
      createSubscription: false,
    }
  })

  // Return full fixture bundle (extend as needed)
  const fixtures = await response.json()
  // { userId, projectId, workspaceId, projectSlug, region, plan, ... }

  // Cache for other workers/tests in this run
  // CRITICAL: Atomic write to prevent race condition with parallel workers
  // Multiple workers checking "file missing" then all writing = corrupted JSON
  fs.mkdirSync(path.dirname(FIXTURE_CACHE), { recursive: true })
  const tmpFile = `${FIXTURE_CACHE}.${process.pid}.tmp`
  fs.writeFileSync(tmpFile, JSON.stringify(fixtures))
  fs.renameSync(tmpFile, FIXTURE_CACHE) // Atomic on POSIX

  return fixtures
}

// Cleanup: deletes ONLY data with this RUN_ID (not the user!)
export async function cleanupTestRun(request: APIRequestContext) {
  await request.post('/api/test/cleanup', {
    data: {
      runId: TEST_CONFIG.RUN_ID,
      scope: ['projects', 'messages', 'builds'], // NOT users/subscriptions
    }
  })
}
```

**API endpoint pattern:**
```typescript
// app/api/test/cleanup/route.ts
export async function POST(req: Request) {
  // SECURITY: NODE_ENV is NOT a security boundary (staging looks "production-ish")
  // Use explicit env flag + shared secret
  if (process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
    return new Response('Test endpoints disabled', { status: 404 })
  }

  const testSecret = req.headers.get('X-Test-Secret')
  if (testSecret !== process.env.TEST_ENDPOINT_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const { runId, scope } = await req.json()

  // Delete only rows tagged with this run_id
  for (const table of scope) {
    await supabase.from(table).delete().eq('test_run_id', runId)
  }

  return Response.json({ success: true })
}
```

**Environment setup:**
```bash
# .env.test (CI only)
ENABLE_TEST_ENDPOINTS=true
TEST_ENDPOINT_SECRET=your-random-secret-here

# Production: these should NOT exist
```

**Why this matters:** Without RUN_ID isolation, parallel test runs collide. Without reset-by-run, you destroy debugging info. This is the #1 reason suites become "flaky" when they're actually just stateful.

---

## 3. Coverage Analysis

### Well-Covered Areas

| Feature | Tests | Coverage |
|---------|-------|----------|
| Authentication | 4 | Login, social auth, password reset |
| Payment Flows | 6 | Stripe checkout, failure handling, webhooks, portal |
| Chat Interface | 6 | Messages, SSE, multi-turn, error recovery |
| Advisor Network | 5 | Discovery, filtering, booking, i18n |
| Basic Health | 6 | Homepage, i18n, API, performance |

### Coverage Gaps (Missing Tests)

#### 3.1 Security & Authorization
- **Missing:** Session hijacking prevention tests
- **Missing:** CSRF protection verification
- **Missing:** Rate limiting enforcement (partially covered in chat)
- **Missing:** Input sanitization tests

#### 3.2 Edge Cases
- **Missing:** Concurrent session handling
- **Missing:** Payment cancellation flow
- **Missing:** Subscription downgrade path
- **Missing:** Project deletion with active builds

#### 3.3 Error Scenarios
- **Missing:** Database connection failures
- **Missing:** Third-party service timeouts (beyond basic offline test)
- **Missing:** Malformed API responses
- **Missing:** Cookie expiration handling

#### 3.4 Performance
- **Missing:** Load time regression tests with budgets
- **Missing:** Memory leak detection (long session)
- **Missing:** Large data set handling (100+ projects)

#### 3.5 Accessibility
- **Missing:** Keyboard navigation tests
- **Missing:** Screen reader compatibility
- **Missing:** Color contrast verification
- **Missing:** Focus management

---

## 4. Tests Requiring Changes

### 4.1 `tests/e2e/basic.smoke.spec.ts`

**Issue:** Console error filtering is too permissive
```typescript
// Line 57-61 - allows "network", "loading", "fetch" errors
const criticalErrors = consoleErrors.filter(error =>
  !error.includes('network') &&
  !error.includes('loading') &&
  !error.includes('fetch')
)
```

**Change:** Be more specific about allowed errors AND catch `pageerror` (uncaught exceptions are more critical than console logs):
```typescript
const allowedPatterns = [
  /favicon\.ico.*404/,
  /chrome-extension/,
  /hydration/i, // React hydration warnings in dev
]
const criticalErrors = consoleErrors.filter(error =>
  !allowedPatterns.some(pattern => pattern.test(error))
)

// IMPORTANT: Also catch uncaught exceptions (more critical than console.error)
const pageErrors: Error[] = []
page.on('pageerror', error => pageErrors.push(error))

// In verification step:
expect(pageErrors).toHaveLength(0) // Uncaught exceptions = immediate fail
expect(criticalErrors.length).toBeLessThan(5) // Console errors = softer threshold
```

### 4.2 `tests/e2e/builder.smoke.spec.ts`

**Issue:** Uses deprecated test selectors
```typescript
// Line 24-26
await page.fill('[data-testid="email-input"]', TEST_USER.email)
await page.fill('[data-testid="password-input"]', TEST_USER.password)
await page.click('[data-testid="login-button"]')
```

**Change:** Use selectors matching actual DOM. Best selector hierarchy:
1. `getByRole(...)` - accessibility-aligned
2. `getByLabel(...)` - form fields
3. `data-testid` - when UI is complex (keep these stable!)
4. CSS selectors - last resort

```typescript
// BETTER (uses actual form structure)
await page.getByLabel('Email').fill(TEST_USER.email)
await page.getByLabel('Password').fill(TEST_USER.password)
await page.getByRole('button', { name: 'Sign in' }).click()

// OR with actual name attributes
await page.fill('input[name="email"]', TEST_USER.email)
await page.fill('input[name="password"]', TEST_USER.password)
await page.locator('button[type="submit"]:has-text("Sign in")').click()
```

**Note:** If your `data-testid` selectors are stable and intentional, keep them. Don't downgrade to brittle CSS just because it "matches the DOM". The goal is stability, not purity.

**i18n selector caveat:** Avoid `getByLabel('Email')` in multilingual apps - label text changes per locale. Either:
- Pin tests to `/en` locale (recommended for E2E)
- Use `data-testid` for form fields in i18n surfaces
- Use `getByRole` which is locale-agnostic

### 4.3 `tests/e2e/utils.ts`

**Issue:** `waitForStableElement` has ineffective stability check
```typescript
// Line 450-459
export async function waitForStableElement(page: Page, selector: string) {
  await expect(element).toBeVisible({ timeout })
  await page.waitForTimeout(1000) // <-- INEFFECTIVE
  return element
}
```

**Change:** Implement proper stability detection:
```typescript
export async function waitForStableElement(page: Page, selector: string) {
  const element = page.locator(selector)
  await expect(element).toBeVisible({ timeout })

  // Wait for element to stop moving
  let lastBox = await element.boundingBox()
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(100)
    const currentBox = await element.boundingBox()
    if (JSON.stringify(lastBox) === JSON.stringify(currentBox)) break
    lastBox = currentBox
  }

  return element
}
```

### 4.4 `tests/e2e/p0-chat-flows.spec.ts`

**Issue:** SSE test waits 30 seconds unnecessarily
```typescript
// Line 77-82
await page.waitForTimeout(30000) // Wait for heartbeat
await expect(connectionStatus).toHaveAttribute('data-status', 'connected')
```

**Change:** Mock time or reduce heartbeat interval for tests:
```typescript
// Set test heartbeat interval via header
await page.setExtraHTTPHeaders({
  'X-Test-Heartbeat-Interval': '5000' // 5 seconds instead of 25
})
await page.waitForTimeout(7000) // Just over the interval
```

### 4.5 `tests/fixtures/stripe-helpers.ts`

**Issue:** `fillCardElement` throws unclear errors
```typescript
// Line 310-312
if (!cardNumberField) {
  throw new Error('Could not find card number field')
}
```

**Change:** Include diagnostic info:
```typescript
if (!cardNumberField) {
  const screenshot = await page.screenshot({ encoding: 'base64' })
  throw new Error(
    `Could not find card number field. ` +
    `Tried selectors: ${fieldSelectors.cardNumber.join(', ')}. ` +
    `Screenshot: data:image/png;base64,${screenshot.slice(0, 100)}...`
  )
}
```

---

## 5. New Tests to Create

### 5.1 Security Tests (`tests/e2e/security.smoke.spec.ts`)

```typescript
test.describe('@smoke Security Checks', () => {
  test('Should prevent XSS in chat input', async ({ page }) => {
    await login(page)
    await page.fill('[data-testid="chat-input"]', '<script>alert("xss")</script>')
    await page.click('[data-testid="send-button"]')

    // Message should be sanitized
    const message = page.locator('[data-testid="user-message"]').last()
    const html = await message.innerHTML()
    expect(html).not.toContain('<script>')
  })

  test('Should require authentication for protected routes', async ({ page }) => {
    const protectedRoutes = [
      '/en/dashboard',
      '/en/builder/workspace/test-id',
      '/en/dashboard/billing'
    ]

    for (const route of protectedRoutes) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/auth\/login/)
    }
  })

  test('Should enforce HTTPS redirect', async ({ page }) => {
    // Only test in production-like environment
    if (process.env.TEST_ENV === 'production') {
      const response = await page.request.get('http://app.sheenapps.ai')
      expect(response.url()).toMatch(/^https:/)
    }
  })
})
```

### 5.2 Accessibility Tests (`tests/e2e/a11y.smoke.spec.ts`)

```typescript
import AxeBuilder from '@axe-core/playwright'

test.describe('@smoke Accessibility', () => {
  test('Homepage meets WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/en')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('Login form is keyboard navigable', async ({ page }) => {
    await page.goto('/en/auth/login')

    // Tab to email
    await page.keyboard.press('Tab')
    await expect(page.locator('input[name="email"]')).toBeFocused()

    // Tab to password
    await page.keyboard.press('Tab')
    await expect(page.locator('input[name="password"]')).toBeFocused()

    // Tab to submit
    await page.keyboard.press('Tab')
    await expect(page.locator('button[type="submit"]')).toBeFocused()
  })

  test('Builder has proper ARIA labels', async ({ page }) => {
    await login(page)
    await createTestProject(page)

    // Chat input should be labeled
    const chatInput = page.locator('[data-testid="chat-input"]')
    await expect(chatInput).toHaveAttribute('aria-label')

    // Buttons should have accessible names
    const buttons = page.locator('button:visible')
    for (const button of await buttons.all()) {
      const name = await button.getAttribute('aria-label') || await button.textContent()
      expect(name?.trim().length).toBeGreaterThan(0)
    }
  })
})
```

### 5.3 Error Recovery Tests (`tests/e2e/error-recovery.spec.ts`)

```typescript
test.describe('P0-ERR: Error Recovery', () => {
  test('P0-ERR-01: Recovers from API timeout', async ({ page }) => {
    await login(page)

    // Simulate slow API
    await page.route('**/api/projects/**', async route => {
      await new Promise(r => setTimeout(r, 10000))
      await route.continue()
    })

    await page.goto('/en/dashboard')

    // Should show timeout error
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible()

    // Remove route to allow retry
    await page.unroute('**/api/projects/**')

    // Retry should work
    await page.click('[data-testid="retry-button"]')
    await expect(page.locator('[data-testid="project-list"]')).toBeVisible()
  })

  test('P0-ERR-02: Handles session expiration gracefully', async ({ page }) => {
    await login(page)
    await page.goto('/en/dashboard')

    // Clear auth cookies to simulate expiration
    await page.context().clearCookies()

    // Trigger auth-required action
    await page.click('[data-testid="create-project-button"]')

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/auth\/login\?.*redirect/)
  })

  test('P0-ERR-03: Maintains state after network recovery', async ({ page }) => {
    await login(page)
    await createTestProject(page)

    // Type in chat
    await page.fill('[data-testid="chat-input"]', 'Important message')

    // Go offline
    await page.context().setOffline(true)
    await page.click('[data-testid="send-button"]')

    // Should show offline indicator
    await expect(page.locator('[data-testid="offline-banner"]')).toBeVisible()

    // Come back online
    await page.context().setOffline(false)

    // Message should still be in input or queue
    const inputValue = await page.locator('[data-testid="chat-input"]').inputValue()
    expect(inputValue).toContain('Important message')
  })
})
```

### 5.4 Performance Tests (`tests/e2e/performance.spec.ts`)

**Note:** Use Lighthouse CI for timing metrics (LCP, FCP). These are too noisy in Playwright CI. Keep Playwright perf tests to stable, deterministic checks:

```typescript
test.describe('Performance Baseline', () => {
  // DON'T: LCP tests (noisy in CI)
  // test('Homepage LCP under 2.5s', ...) // Use Lighthouse CI instead

  // DO: API response time (use Date.now(), not response.timing())
  // Note: response.timing() is inconsistent across environments
  test('Dashboard API responds quickly', async ({ request }) => {
    const t0 = Date.now()
    const response = await request.get('/api/projects')
    const elapsed = Date.now() - t0

    expect(response.ok()).toBeTruthy()
    // CAVEAT: 500ms is too strict for shared CI runners + cold starts
    // Use 1000-1500ms unless you control CI infra
    expect(elapsed).toBeLessThan(1500)
  })

  // DO: Bundle size (stable, just counting bytes)
  // CAVEAT: transferSize can be 0 (cached, http/2 weirdness) = false passes
  // Run in fresh context with cache disabled, or intercept Content-Length
  test('Bundle size under limits', async ({ browser }) => {
    // Fresh context + Content-Length interception (Playwright has no cache:false flag)
    const context = await browser.newContext()
    const page = await context.newPage()

    const bundleSizes: number[] = []
    page.on('response', async (response) => {
      if (response.url().includes('_next/static')) {
        const contentLength = response.headers()['content-length']
        if (contentLength) {
          bundleSizes.push(parseInt(contentLength))
        }
      }
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const totalSize = bundleSizes.reduce((sum, size) => sum + size, 0)
    expect(totalSize).toBeLessThan(500 * 1024) // 500KB limit

    await context.close()
  })

  // DO: No huge individual bundles
  // Uses same Content-Length interception pattern (transferSize is unreliable)
  test('No single bundle over 200KB', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    const largeBundles: { url: string; size: number }[] = []
    page.on('response', async (response) => {
      if (response.url().includes('_next/static')) {
        const contentLength = response.headers()['content-length']
        if (contentLength && parseInt(contentLength) > 200 * 1024) {
          largeBundles.push({ url: response.url(), size: parseInt(contentLength) })
        }
      }
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    expect(largeBundles).toHaveLength(0)
    await context.close()
  })
})
```

### 5.5 Mobile Viewport Tests (`tests/e2e/mobile.smoke.spec.ts`)

```typescript
const MOBILE_VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12', width: 390, height: 844 },
  { name: 'Pixel 5', width: 393, height: 851 },
]

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`@smoke Mobile: ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('Navigation menu opens and closes', async ({ page }) => {
      await page.goto('/en')

      // Mobile menu should be hidden initially
      await expect(page.locator('[data-testid="mobile-menu"]')).not.toBeVisible()

      // Hamburger should be visible
      const hamburger = page.locator('[data-testid="hamburger-button"]')
      await expect(hamburger).toBeVisible()
      await hamburger.click()

      // Menu should open
      await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible()
    })

    test('Chat input is accessible above keyboard', async ({ page }) => {
      await login(page)
      await createTestProject(page)

      const chatInput = page.locator('[data-testid="chat-input"]')
      await chatInput.click()

      // Input should remain visible (not hidden by virtual keyboard)
      // NOTE: toBeInViewport() requires Playwright 1.31+
      // Fallback for older versions:
      await expect(chatInput).toBeVisible()
      const box = await chatInput.boundingBox()
      const viewport = page.viewportSize()
      if (box && viewport) {
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      }
    })

    test('Touch targets meet minimum size', async ({ page }) => {
      await page.goto('/en')

      const buttons = await page.locator('button:visible, a:visible').all()

      for (const button of buttons) {
        const box = await button.boundingBox()
        if (box) {
          // Apple HIG recommends 44x44, Android 48x48
          expect(box.width).toBeGreaterThanOrEqual(44)
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }
    })
  })
}
```

---

## 6. CI/CD Recommendations

### 6.1 Test Sharding (ONLY after data isolation is solid)
Add parallel execution for faster feedback:

```yaml
# .github/workflows/e2e.yml
jobs:
  e2e:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/4
```

**Warning:** Sharding before RUN_ID isolation = parallelizing chaos. Fix data strategy first.

### 6.2 Browser Diversity (Phased Approach)
Don't pay the tax everywhere:

```typescript
// playwright.config.ts
projects: [
  // Smoke tests: Chromium + WebKit (Safari pain shows up here)
  { name: 'smoke-chromium', grep: /@smoke/, use: { ...devices['Desktop Chrome'] } },
  { name: 'smoke-webkit', grep: /@smoke/, use: { ...devices['Desktop Safari'] } },

  // P0 tests: Chromium only (fast feedback)
  { name: 'p0-chromium', grep: /P0-/, use: { ...devices['Desktop Chrome'] } },
]

// Full matrix: run nightly, not on every PR
// name: 'nightly-full-matrix' ...
```

### 6.3 Performance Testing (Use Lighthouse CI, not Playwright)
LCP in Playwright CI is notoriously noisy due to CPU/network variance.

```yaml
# .github/workflows/lighthouse.yml - Separate job
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v10
  with:
    budgetPath: ./lighthouse-budget.json
    uploadArtifacts: true
```

Keep Playwright perf tests simple:
```typescript
test('Bundle size under limit', async ({ page }) => {
  // This is stable - just counting bytes
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource')
      .filter(r => r.name.includes('_next/static'))
      .reduce((sum, r) => sum + r.transferSize, 0)
  )
  expect(resources).toBeLessThan(500 * 1024) // 500KB
})
```

---

## 7. Priority Matrix (Expert-Revised Ordering)

**Key insight:** CI sharding before data isolation is "parallelizing chaos". Fix data first.

| Order | Action | Effort | Why This Order |
|-------|--------|--------|----------------|
| **1** | Kill `waitForTimeout` + add app readiness markers | Medium | #1 flake factory |
| **2** | Centralize users + data seeding/reset (RUN_ID) | Medium | Enables everything else |
| **3** | Move Stripe to API/webhook-first, quarantine UI test | Medium | High flake, low value |
| **4** | storageState auth (UI login only as smoke) | Low | Speed + reliability |
| **5** | Add security protected-routes smoke + axe smoke | Medium | High value, cheap |
| **6** | CI sharding | Low | Only after data isolation solid |
| **7** | Browser diversity (WebKit on smoke, full matrix nightly) | Medium | Catches Safari issues |
| **8** | Mobile viewport tests | Medium | Separate project |
| **9** | Performance budgets (Lighthouse CI, not Playwright LCP) | Medium | CI variance makes LCP tests flaky |

### Consider (Low-Maintenance Options)
| Action | When to Use |
|--------|-------------|
| Visual regression (1 screenshot) | Only homepage + builder shell, Chromium only, forgiving threshold. Catches "CSS not loading / layout exploded" catastrophes. Skip if zero maintenance is priority. |

### Don't Bother With
| Action | Why Not |
|--------|---------|
| Full visual regression suite | High maintenance, low ROI for this app type |
| CSRF/rate-limit E2E tests | Belong in API/integration tests, not E2E |
| LCP tests in Playwright | CI noise will make them flaky; use Lighthouse CI instead |

### Add: Quarantine Lane for Flaky Tests

Even good suites have 1-2 "edge" tests (Stripe UI, WebKit oddities). Give them a home so they don't cause learned helplessness.

```typescript
// playwright.config.ts
projects: [
  // Main suite - must pass
  { name: 'chromium', grep: /^(?!.*@quarantine)/ },

  // Quarantine - run nightly, don't block PRs
  {
    name: 'quarantine',
    grep: /@quarantine/,
    retries: 3,
    // Report separately, don't fail CI unless consistent failures
  },
]
```

```typescript
// Tag flaky tests instead of deleting them
test('@quarantine @stripe-ui Full Stripe checkout flow', async ({ page }) => {
  // This test is here because Stripe changes their DOM monthly
  // Runs nightly, not on every PR
})
```

**Operational exit criteria (make it a policy):**
| Nights Failed | Action |
|---------------|--------|
| 3 consecutive | Auto-create ticket, assign to test owner |
| 7 consecutive | Delete or rewrite (no exceptions) |

**Rule:** Quarantine is hospice, not purgatory. Tests that live there forever are tests that don't exist. Create a separate report artifact for quarantine results so they don't get ignored.

---

## 8. Conclusion

The test suite provides reasonable coverage of critical paths but needs attention in:

1. **Data Isolation** - The #1 issue. No RUN_ID, no reset-by-run = flaky by design
2. **Reliability** - Replace hardcoded waits with `data-ready` markers (monotonic + error-aware)
3. **Stripe Strategy** - Move to API/webhook-first, quarantine UI test
4. **Auth** - Use browser-context storageState + API login with double sanity check
5. **Quarantine Lane** - Give flaky tests a home with operational exit criteria

**Estimated effort to address top 5 priorities:** 1 sprint

### If You Only Do Three Things First

These three changes turn E2E from "haunted house" into "seatbelt":

| Priority | Action | Why |
|----------|--------|-----|
| **1** | Add `test_run_id` column to DB + tag all created data | Without this, cleanup is useless |
| **2** | Reset-by-run + TTL cleanup cron | Prevents data accumulation and collisions |
| **3** | Readiness markers (monotonic + error-aware) | Replaces all `waitForTimeout` calls deterministically |

**Full recommended actions (in order):**
1. DB migration: add `test_run_id` to projects/messages/builds + partial indexes (0.5 days)
2. Create `tests/fixtures/test-data.ts` with RUN_ID + bootstrap + reset-by-run (1 day)
3. Add `data-ready` markers to Dashboard, Builder, Chat roots (1 day)
4. Split Stripe tests into session/webhook/UI-smoke, tag UI as `@quarantine` (0.5 days)
5. Implement browser-context storageState auth with double sanity check (0.5 days)
6. Add protected-routes security smoke + axe accessibility smoke (0.5 days)

**The highest compliment in testing:** A suite that fails only when something is actually broken. Boring. Like a seatbelt.

---

## 9. Implementation Progress

**Last Updated:** January 8, 2026

This section tracks implementation progress for the recommended actions.

### Completed

| Item | Status | Files Changed | Notes |
|------|--------|---------------|-------|
| **DB Migration: test_run_id** | ✅ Done | `supabase/migrations/20260108_add_test_run_id.sql` | Added `test_run_id` column to `projects`, `project_chat_log_minimal`, `unified_chat_sessions` with partial indexes |
| **test-data.ts fixture** | ✅ Done | `tests/fixtures/test-data.ts` | Implements RUN_ID (from CI env), test user config, bootstrap/cleanup functions, atomic fixture caching |
| **Test API security utility** | ✅ Done | `src/app/api/test/_utils/security.ts` | Implements ENABLE_TEST_ENDPOINTS + X-Test-Secret security gate |
| **Bootstrap API endpoint** | ✅ Done | `src/app/api/test/bootstrap/route.ts` | Creates test data tagged with runId, returns fixture bundle |
| **Cleanup API endpoint** | ✅ Done | `src/app/api/test/cleanup/route.ts` | Deletes ONLY data with specific runId (not the user), respects FK dependencies |
| **Login API endpoint** | ✅ Done | `src/app/api/test/login/route.ts` | API-based auth for E2E, returns tokens/cookies |
| **Dashboard data-ready markers** | ✅ Done | `src/components/dashboard/dashboard-content.tsx` | Monotonic + error-aware pattern: `data-ready="ready"` or `data-ready="error"` |
| **Builder data-ready markers** | ✅ Done | `src/components/builder/enhanced-workspace-page.tsx` | Same pattern, `data-testid="builder-root"` |
| **Chat data-ready markers** | ✅ Done | `src/components/builder/builder-chat-interface.tsx` | Same pattern, `data-testid="builder-chat-interface"` |
| **Browser-context storageState auth** | ✅ Done | `tests/e2e/global-setup.ts` | Uses browser context (not just API), double sanity check (UI + API), saves storageState |
| **Quarantine lane config** | ✅ Done | `playwright.config.ts` | Separate project for `@quarantine` tests, 3 retries, run with `RUN_QUARANTINE=true` |
| **Security smoke tests** | ✅ Done | `tests/e2e/security.smoke.spec.ts` | Protected routes, XSS prevention, security headers, session cookies |
| **Accessibility smoke tests** | ✅ Done | `tests/e2e/a11y.smoke.spec.ts` | WCAG 2.1 AA with axe-core, keyboard navigation, focus management, screen reader support |

### Pending

| Item | Status | Notes |
|------|--------|-------|
| Split Stripe tests | 🔄 Future | Can be done when Stripe UI becomes flaky - split into API session, webhook, quarantined UI tests |
| TTL cleanup cron | 🔄 Future | Database cron to delete old test data (test_run_id IS NOT NULL AND created_at < NOW() - 7 days) |
| CI workflow updates | 🔄 Future | Add `TEST_RUN_ID: gh-${{ github.run_id }}-${{ github.run_attempt }}` to e2e workflow |

### Environment Variables Required

The test infrastructure requires these environment variables in test environments:

```bash
# Required for test endpoints to work
ENABLE_TEST_ENDPOINTS=true
TEST_ENDPOINT_SECRET=your-random-secret-here

# Set in CI workflow (not in code)
TEST_RUN_ID=gh-${{ github.run_id }}-${{ github.run_attempt }}
```

### Usage Examples

**Bootstrapping a test run:**
```typescript
import { bootstrapTestRun, TEST_CONFIG, getTestHeaders } from './fixtures/test-data'

test.beforeAll(async ({ request }) => {
  const fixtures = await bootstrapTestRun(request, { createProject: true })
  console.log('Created project:', fixtures.projectId)
})
```

**Waiting for page readiness:**
```typescript
// Wait for dashboard to be ready (error-first check)
await expect(page.locator('[data-testid="dashboard-root"][data-ready="error"]'))
  .not.toBeVisible({ timeout: 100 }) // Fast fail on error

await expect(page.locator('[data-testid="dashboard-root"][data-ready="ready"]'))
  .toBeVisible({ timeout: 10000 }) // Wait for ready
```

**Cleaning up after test run:**
```typescript
import { cleanupTestRun } from './fixtures/test-data'

test.afterAll(async ({ request }) => {
  await cleanupTestRun(request)
})
```

### Discoveries During Implementation

1. **No separate `builds` table**: Build info is stored in `projects.current_build_id` and metrics tables, not a separate builds table. Migration adapted accordingly.

2. **Chat messages table**: The actual chat messages table is `project_chat_log_minimal`, not `messages`. Updated migration.

3. **Supabase auth cookie format**: The auth cookie name follows the pattern `sb-{project_ref}-auth-token`. The test login endpoint handles this correctly.

4. **RLS considerations**: Test cleanup uses admin context (bypasses RLS). Test data creation can use admin context since we're creating data for test users.

5. **Atomic file writes**: Critical for fixture caching with parallel workers. Using `writeFileSync` to temp file + `renameSync` pattern for POSIX atomicity.

### New Files Created

```
supabase/migrations/20260108_add_test_run_id.sql    # DB schema for test data isolation
tests/fixtures/test-data.ts                          # RUN_ID, bootstrap, cleanup utilities
tests/e2e/security.smoke.spec.ts                     # Security smoke tests
tests/e2e/a11y.smoke.spec.ts                         # Accessibility smoke tests
src/app/api/test/_utils/security.ts                  # Test endpoint security gate
src/app/api/test/bootstrap/route.ts                  # Test data bootstrap API
src/app/api/test/cleanup/route.ts                    # Test data cleanup API
src/app/api/test/login/route.ts                      # API-based auth for tests
```

### Modified Files

```
playwright.config.ts                                  # Added storageState + quarantine lane
tests/e2e/global-setup.ts                            # Browser-context auth with sanity checks
src/components/dashboard/dashboard-content.tsx        # data-ready markers
src/components/builder/enhanced-workspace-page.tsx    # data-ready markers
src/components/builder/builder-chat-interface.tsx     # data-ready markers
```

### Next Steps to Enable

1. **Run the migration**: `npx supabase migration up` or apply via dashboard
2. **Install axe-core**: `npm install -D @axe-core/playwright`
3. **Set environment variables** in `.env.test`:
   ```bash
   ENABLE_TEST_ENDPOINTS=true
   TEST_ENDPOINT_SECRET=your-random-secret
   ```
4. **Update CI workflow** to set `TEST_RUN_ID`:
   ```yaml
   env:
     TEST_RUN_ID: gh-${{ github.run_id }}-${{ github.run_attempt }}
   ```
5. **Create test user** `e2e@test.sheenapps.ai` in test database

---

## 10. Expert Review Fixes (January 8, 2026)

After expert code review, the following issues were identified and fixed:

### 10.1 Fixed: storageState Gating Bug (HIGH PRIORITY)

**Problem:** `hasAuthFile` was evaluated at config-load time (before `globalSetup` runs), so on fresh CI runners the auth file wouldn't exist and `storageState` wouldn't be used.

**Fix:** Changed from `existsSync(AUTH_FILE)` check to always setting `storageState` when `ENABLE_TEST_ENDPOINTS === 'true'`. The `globalSetup` is responsible for creating the file.

```typescript
// BEFORE (bug)
const hasAuthFile = require('fs').existsSync(AUTH_FILE)
...(hasAuthFile && process.env.ENABLE_TEST_ENDPOINTS === 'true'
  ? { storageState: AUTH_FILE }
  : {})

// AFTER (fixed)
const useStorageState = process.env.ENABLE_TEST_ENDPOINTS === 'true'
...(useStorageState ? { storageState: AUTH_FILE } : {})
```

### 10.2 Fixed: Invalid Chrome Flag for Animations (MEDIUM)

**Problem:** `--disable-web-animations` isn't a standard Chromium flag and was silently ignored.

**Fix:** Replaced with Playwright's built-in `reducedMotion: 'reduce'` option.

```typescript
// BEFORE (ignored)
launchOptions: { args: ['--disable-web-animations'] }

// AFTER (works)
reducedMotion: 'reduce',
```

### 10.3 Fixed: 35-Second Timer Logic Bug (HIGH PRIORITY)

**Problem:** Critical bug in `builder-chat-interface.tsx` - when deploy completed, we set `deployCompletedTime` but immediately cleared `hasSeenActiveBuilding` and `buildIdWhenStarted`. The timer effect then saw this as "invalid state" and cleared `deployCompletedTime`, so the timer never fired.

**Fix:** Added `deployCompletedForBuildId` state to track which build the timer is for, independent of the tracking variables that get cleared.

```typescript
// NEW STATE
const [deployCompletedForBuildId, setDeployCompletedForBuildId] = useState<string | null>(null)

// When deploy completes
setDeployCompletedTime(nowTime)
setDeployCompletedForBuildId(buildId)  // Store build ID with timer

// Timer validation
if (!deployCompletedForBuildId || deployCompletedForBuildId !== buildId) {
  // Clear stale timer state
}
```

### 10.4 Fixed: Bootstrap Placeholder User ID (HIGH PRIORITY)

**Problem:** If test user wasn't found, code used placeholder `test-user-${runId}` which would break FK constraints on `projects.owner_id`.

**Fix:** Fail fast with clear error code `TEST_USER_NOT_SEEDED` instead of using placeholder.

```typescript
// BEFORE (breaks FK)
userId = `test-user-${runId}`

// AFTER (fails fast)
return NextResponse.json({
  error: 'Test user not found',
  code: 'TEST_USER_NOT_SEEDED',
  details: 'User must be created before running tests'
}, { status: 500 })
```

### 10.5 Fixed: Cleanup Deletion Order (HIGH PRIORITY)

**Problem:** Original order was `sessions → messages → projects`, but if messages have FK to sessions, messages must be deleted first.

**Fix:** Corrected order to `messages → sessions → projects`. Also refactored DELETE handler to use shared `runCleanup()` function instead of constructing fake NextRequest.

### 10.6 Fixed: Login Cookie Domain/Secure (HIGH PRIORITY)

**Problem:**
1. `domain: 'localhost'` wouldn't work for 127.0.0.1 or deployed URLs
2. `secure: NODE_ENV === 'production'` would drop cookies on http://localhost when NODE_ENV=production

**Fix:**
1. Derive domain from request origin: `new URL(requestOrigin).hostname`
2. Set secure based on scheme: `requestOrigin.startsWith('https://')`

### 10.7 Added: Constant-Time Secret Comparison (MEDIUM)

**Problem:** String comparison for secrets could theoretically leak timing info.

**Fix:** Added `safeCompare()` using `crypto.timingSafeEqual()`.

```typescript
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
```

### Expert Review Points NOT Implemented

| Point | Reason |
|-------|--------|
| Return 404 for invalid secret | Keep 403 for debugging clarity. Already protected by ENABLE_TEST_ENDPOINTS gate. |
| Bump globalTimeout for smoke | Current 2min is appropriate; if startup takes 90-120s, that's a separate issue to fix. |
| Gate debug console.logs | Low priority - can be done later when CI output becomes noisy. |

### Files Modified in Expert Review Pass

```
playwright.config.ts                            # storageState gating + reducedMotion
src/app/api/test/_utils/security.ts             # Constant-time comparison
src/app/api/test/bootstrap/route.ts             # Fail fast on missing user
src/app/api/test/cleanup/route.ts               # FK order + shared function
src/app/api/test/login/route.ts                 # Cookie domain/secure
src/components/builder/builder-chat-interface.tsx # Timer logic fix
```

---

## 11. Expert Review Fixes Round 2 (January 8, 2026)

Second round of expert review identified additional issues:

### 11.1 Fixed: Quarantine Lane Never Runs (HIGH PRIORITY)

**Problem:** Global `grep` setting AND's with project-level `grep`. When `TEST_TYPE !== 'p0'`, global grep was `/@smoke/` and quarantine project grep was `/@quarantine/`. Result: tests needed BOTH tags to match = nothing.

**Fix:** Make global grep conditional on `RUN_QUARANTINE`:

```typescript
// BEFORE (quarantine matches nothing)
grep: process.env.TEST_TYPE === 'p0' ? /P0-/ : /@smoke/,

// AFTER (quarantine can run)
grep:
  process.env.TEST_TYPE === 'p0'
    ? /P0-/
    : process.env.RUN_QUARANTINE === 'true'
      ? /@quarantine/
      : /@smoke/,
```

### 11.2 Fixed: TEST_E2E Undefined in Client Components (HIGH PRIORITY)

**Problem:** In Next.js, client bundles only see `NEXT_PUBLIC_*` env vars. Code using `process.env.TEST_E2E` in client components would always be `undefined`.

**Fix:** Changed all client-side usages to `NEXT_PUBLIC_TEST_E2E`:

- `builder-chat-interface.tsx` - connection status indicator
- `public-advisor-showcase.tsx` - test mode detection
- `use-persistent-live.ts` - hook test mode check
- `server-auth-store.ts` - mock auth in test mode
- `playwright.config.ts` - webServer env now sets both vars

### 11.3 Fixed: JSON Reporter outputFolder Ignored (MEDIUM)

**Problem:** Playwright's JSON reporter only has `outputFile`, not `outputFolder`. The `outputFolder` option was silently ignored.

**Fix:** Removed invalid `outputFolder` option, kept only `outputFile`.

### 11.4 Fixed: Duplicate Message Spam in Chat Sync (MEDIUM)

**Problem:** Buggy filter logic:
```typescript
.filter(msg => !currentIds.has(msg.id || msg.id!))  // msg.id! is redundant
.map(hookMsg => ({
  id: hookMsg.id || `assistant-${Date.now()}`  // New ID each render!
}))
```

If `hookMsg.id` was undefined:
1. `currentIds.has(undefined)` = false → passes filter
2. Gets NEW ID `assistant-1234567890`
3. Next render: same message passes filter again (undefined still not in currentIds)
4. Gets ANOTHER new ID → duplicate message spam

**Fix:** Derive deterministic IDs from index + timestamp:

```typescript
const newMessages = hookMessages
  .map((hookMsg, index) => {
    const stableId = hookMsg.id || `hook-msg-${index}-${hookMsg.timestamp || 'no-ts'}`
    return { hookMsg, stableId }
  })
  .filter(({ stableId }) => !currentIds.has(stableId))
  .map(({ hookMsg, stableId }) => ({
    id: stableId,  // Use deterministic ID
    // ...
  }))
```

### 11.5 Not Fixed: ESM require.resolve

**Expert concern:** `require.resolve` might fail if project is ESM.

**Analysis:** Checked `package.json` - no `"type": "module"`, so project is CommonJS. `require.resolve` works fine. No change needed.

### Expert Review Round 2 Files Modified

```
playwright.config.ts                                    # Grep fix + JSON reporter + NEXT_PUBLIC_TEST_E2E
src/components/builder/builder-chat-interface.tsx       # Message dedup + NEXT_PUBLIC_TEST_E2E
src/components/advisor-network/public-advisor-showcase.tsx # NEXT_PUBLIC_TEST_E2E
src/hooks/use-persistent-live.ts                        # NEXT_PUBLIC_TEST_E2E
src/store/server-auth-store.ts                          # NEXT_PUBLIC_TEST_E2E
```
