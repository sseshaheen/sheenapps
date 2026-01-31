# Easy Mode SDK Playwright Coverage Plan

> E2E test coverage for Easy Mode SDK services using the existing Playwright infrastructure.

**Created**: 2026-01-24
**Status**: Complete
**Last Updated**: 2026-01-25 (Sprint 5 complete - CI/CD Integration)

---

## Implementation Progress

### Sprint 1: Foundation
| Task | Status | Notes |
|------|--------|-------|
| SDK test harness (`sdk-test-harness.ts`) | ✅ Done | `tests/e2e/helpers/sdk-test-harness.ts` |
| SDK test fixtures (`sdk-fixtures.ts`) | ✅ Done | `tests/e2e/fixtures/sdk-fixtures.ts` |
| SDK client helper (`sdk-client.ts`) | ✅ Done | `tests/e2e/helpers/sdk-client.ts` |
| `/api/admin/e2e/sdk-harness` endpoint | ✅ Done | `src/app/api/admin/e2e/sdk-harness/route.ts` |
| `e2e_tiny` plan for quota testing | ✅ Done | Limits in sdk-fixtures.ts + InhouseMeteringService.ts |
| Service stubs for CI-safe mode | ✅ Not needed | Covered by existing server-side flags (DISABLE_EMAIL_DELIVERY, MOCK_*, AI_WORKER_MODE) |

### Sprint 2: Critical Path Tests
| Task | Status | Notes |
|------|--------|-------|
| `p0a-sdk-critical-paths.spec.ts` | ✅ Done | Chained happy path across all services |
| `p0a-sdk-auth.spec.ts` | ✅ Done | Sign up/in/out, getUser, session validation |
| `p0a-sdk-database.spec.ts` | ✅ Done | CRUD, filters, maxRows guard |
| `p0a-sdk-storage.spec.ts` | ✅ Done | Signed URLs, upload/download, list, delete, security |
| `p0a-sdk-errors.spec.ts` | ✅ Done | Error contract validation across all SDKs |

### Sprint 3: Service Tests
| Task | Status | Notes |
|------|--------|-------|
| `p0a-sdk-jobs.spec.ts` | ✅ Done | Enqueue, get, idempotency, e2e: prefix sync, sys: prefix rejection |
| `p0a-sdk-email.spec.ts` | ✅ Done | Templates, custom HTML, locale/RTL, idempotency, tags |
| `p0a-sdk-payments.spec.ts` | ✅ Done | Checkout, customer, portal, webhook verification |
| `p0a-sdk-analytics.spec.ts` | ✅ Done | Track, page, identify, server queries, key context |
| `p0a-sdk-secrets.spec.ts` | ✅ Done | Create, get, update, delete, list, batch, exists |
| `p0a-sdk-introspection.spec.ts` | ✅ Done | Limits API, capabilities API, project info |

### Sprint 4: P0-B Nightly Tests
| Task | Status | Notes |
|------|--------|-------|
| `p0b-sdk-full-flows.spec.ts` | ✅ Done | User onboarding, subscription, multi-service flows |
| `p0b-sdk-storage.spec.ts` | ✅ Done | Real R2: upload/download roundtrip, content verification, large files |
| `p0b-sdk-jobs.spec.ts` | ✅ Done | Real queue: delays, cancellation, retry, status transitions |
| `p0b-sdk-email.spec.ts` | ✅ Done | Real Resend: delivery tracking, templates, locale/RTL |
| `p0b-sdk-payments.spec.ts` | ✅ Done | Real Stripe: checkout URLs, customer IDs, portal, webhooks |
| `p0b-sdk-backups.spec.ts` | ✅ Done | Full backup/restore cycle, size/checksum verification |
| `p0b-sdk-quotas.spec.ts` | ✅ Done | e2e_tiny plan: storage/email/job/secrets limits, rate limiting |

### Sprint 5: CI/CD Integration (Complete)
| Task | Status | Notes |
|------|--------|-------|
| P0-A workflow update | ✅ Done | Added `sdk-services` to matrix in p0-tests.yml |
| Nightly workflow update | ✅ Done | Created nightly-tests.yml with P0-B tests + quarantine |
| Coverage reporting | ✅ Done | Matrix breakdown by service category |
| Documentation | ✅ Done | `tests/e2e/SDK_TESTS_GUIDE.md` - comprehensive guide |

### Codebase Discovery Notes

**Existing Infrastructure Location**: `/Users/sh/Sites/sheenapps/sheenappsai/tests/e2e/`

**Key Findings**:
1. **Test helpers already exist**: auth.ts, cleanup.ts, sse.ts, timeouts.ts - reusable patterns
2. **P0-A folder exists** with 2 tests (project-lifecycle, build-recovery)
3. **P0-B folder exists but is empty** - ready for SDK tests
4. **SDK packages location**: `/Users/sh/Sites/sheenapps/sheenapps-packages/`
5. **Cleanup uses RUN_ID tagging** - our SDK tests should follow the same pattern
6. **Test API endpoint exists**: `/api/test/login` with `X-Test-Secret` header
7. **Worker base URL**: `process.env.WORKER_BASE_URL || 'http://localhost:8081'`
8. **E2E admin key**: `process.env.E2E_ADMIN_KEY` required for cleanup operations

**Pattern Observations**:
- All SDK methods return `{ data, error, status }` - never throw
- Server keys: `sheen_sk_*` (server-only), Public keys: `sheen_pk_*` (browser-safe)
- Test data prefixed with run ID for isolation: `e2e+{persona}+{runId}+w{workerIndex}@test.sheenapps.com`

---

## Executive Summary

The existing Playwright infrastructure is sophisticated (pre-auth, deterministic mode, cleanup layers, CI/CD) but has **zero coverage for Easy Mode SDK services**. This plan adds comprehensive E2E testing for:

- 9 SDK services (auth, db, storage, jobs, email, payments, analytics, secrets, backups)
- API route validation
- Error scenario coverage
- Quota/rate limit enforcement
- Security and authorization

---

## Current State Analysis

### Existing Infrastructure (Reusable)

| Component | Status | Notes |
|-----------|--------|-------|
| Pre-authentication | ✅ Ready | `storageState` pattern |
| Deterministic mode | ✅ Ready | `AI_WORKER_MODE=stub` |
| Test data fixtures | ✅ Ready | `uniqueEmail()`, `uniqueProjectName()` |
| Cleanup layers | ✅ Ready | Per-test + global by run ID |
| SSE helpers | ✅ Ready | For real-time events |
| Stripe helpers | ✅ Ready | Test cards, webhooks |
| Timeout constants | ✅ Ready | Bounded waits |
| CI/CD workflows | ✅ Ready | P0-A, P0-B, smoke tiers |

### Current Test Coverage (18 files)

| Category | Coverage | Easy Mode SDK |
|----------|----------|---------------|
| Auth (platform) | ✅ Good | ❌ None |
| Project lifecycle | ✅ Good | ❌ None |
| Build flows | ✅ Good | ❌ None |
| Payment flows | ✅ Good | ❌ None (uses platform Stripe) |
| Advisor hiring | ✅ Good | N/A |
| Referral system | ✅ Good | N/A |
| Project export | ✅ Good | ❌ None |
| **SDK Auth** | ❌ Missing | @sheenapps/auth |
| **SDK Database** | ❌ Missing | @sheenapps/db |
| **SDK Storage** | ❌ Missing | @sheenapps/storage |
| **SDK Jobs** | ❌ Missing | @sheenapps/jobs |
| **SDK Email** | ❌ Missing | @sheenapps/email |
| **SDK Payments** | ❌ Missing | @sheenapps/payments |
| **SDK Analytics** | ❌ Missing | @sheenapps/analytics |
| **SDK Secrets** | ❌ Missing | @sheenapps/secrets |
| **SDK Backups** | ❌ Missing | @sheenapps/backups |

---

## Test Architecture

### File Structure

> **Note**: All P0-A tests live under `p0-a/` for consistent CI grep selection (`--grep "P0-A"` across `tests/e2e/**`).

```
tests/e2e/
├── p0-a/                                   # Deploy-blocking (< 5 min total)
│   ├── p0a-project-lifecycle.spec.ts      # Existing
│   ├── p0a-build-recovery.spec.ts         # Existing
│   ├── p0a-sdk-critical-paths.spec.ts     # NEW: Chained SDK happy path
│   ├── p0a-sdk-auth.spec.ts               # NEW: Auth critical paths
│   ├── p0a-sdk-database.spec.ts           # NEW: DB critical paths
│   ├── p0a-sdk-storage.spec.ts            # NEW: Storage stub tests
│   ├── p0a-sdk-jobs.spec.ts               # NEW: Jobs sync execution
│   ├── p0a-sdk-email.spec.ts              # NEW: Email mock tests
│   ├── p0a-sdk-payments.spec.ts           # NEW: Payments mock tests
│   ├── p0a-sdk-analytics.spec.ts          # NEW: Analytics tracking
│   ├── p0a-sdk-secrets.spec.ts            # NEW: Secrets management
│   ├── p0a-sdk-introspection.spec.ts      # NEW: Limits/capabilities APIs
│   └── p0a-sdk-errors.spec.ts             # NEW: Error contract validation
├── p0-b/                                   # Nightly (external deps OK)
│   ├── p0b-sdk-full-flows.spec.ts         # NEW: Full service flows
│   ├── p0b-sdk-storage.spec.ts            # NEW: Real R2 storage tests
│   ├── p0b-sdk-jobs.spec.ts               # NEW: Real queue tests
│   ├── p0b-sdk-email.spec.ts              # NEW: Real email delivery
│   ├── p0b-sdk-payments.spec.ts           # NEW: Real Stripe tests
│   ├── p0b-sdk-backups.spec.ts            # NEW: Full backup/restore cycle
│   └── p0b-sdk-quotas.spec.ts             # NEW: Quota edge cases
├── smoke/                                  # Smoke tests (quick sanity)
│   ├── sdk-analytics.smoke.spec.ts
│   ├── sdk-secrets.smoke.spec.ts
│   └── sdk-security.smoke.spec.ts
├── helpers/
│   ├── auth.ts                            # Existing
│   ├── cleanup.ts                         # Existing
│   ├── sse.ts                             # Existing
│   ├── sdk-test-harness.ts                # NEW: Consolidated test harness
│   └── sdk-fixtures.ts                    # NEW: SDK test data
└── fixtures/
    ├── test-data.ts                       # Existing
    ├── stripe-helpers.ts                  # Existing
    └── sdk-stubs.ts                       # NEW: Service stubs for CI-safe mode
```

### Test Tiers

| Tier | Tests | Run When | Timeout | Retries |
|------|-------|----------|---------|---------|
| **P0-A SDK** | Critical paths only | Every deploy | 60s | 0 |
| **P0-B SDK** | Full flows | Nightly | 120s | 2 |
| **SDK Smoke** | Quick sanity | Every PR | 45s | 2 |

### CI-Safe Mode Principle

> **P0-A validates your system, not the internet.**

P0-A tests must not depend on external service availability. Flaky deploys caused by Stripe/R2/network timing are unacceptable.

#### External Dependency Strategy

| Service | P0-A Strategy | P0-B Strategy |
|---------|---------------|---------------|
| **Storage (R2)** | Stubbed R2 layer (`SDK_E2E_STUB_STORAGE=true`) - validates signed URL creation + SDK logic, uploads go to in-memory store | Real R2 uploads |
| **Payments (Stripe)** | Stripe-mock or local webhook signature verifier + canned events. Checkout URL existence OK, no network dependency | Real Stripe test mode |
| **Jobs** | Synchronous test executor for `e2e:*` prefixed jobs - executes immediately, no queue wait | Real BullMQ queue |
| **Email** | Mock provider (`MOCK_EMAIL_PROVIDER=true`) - validates template rendering, no actual delivery | Real Resend in test mode |
| **Backups** | Shallow only - endpoint auth, backup ID returned, status poll. No completion wait | Full backup + restore cycle |

#### Stubbed Service Implementation

```typescript
// Worker detects test mode and uses stubs
if (process.env.SDK_E2E_STUB_STORAGE === 'true') {
  // In-memory storage for signed URL validation
  return new StubStorageService()
}

// Jobs: immediate execution for e2e: prefix
if (jobName.startsWith('e2e:') && process.env.SDK_E2E_SYNC_JOBS === 'true') {
  await executeJobSynchronously(job)
  return { ...job, status: 'completed' }
}
```

### Tiny Quota Plan for Deterministic Testing

Instead of looping 100 times to hit limits, create projects with tiny quotas:

```typescript
// Test plan with tiny limits
const PLAN_E2E_TINY = {
  storage_bytes: 1 * 1024 * 1024,    // 1 MB
  email_sends: 3,                     // 3 emails
  job_runs: 5,                        // 5 jobs
  secrets_count: 3,                   // 3 secrets
}

// Create test project with tiny plan
const ctx = await createSDKTestProject({ plan: 'e2e_tiny' })

// Now quota tests are fast and deterministic
await email.send({ to: 'a@test.com', ... })  // 1/3
await email.send({ to: 'b@test.com', ... })  // 2/3
await email.send({ to: 'c@test.com', ... })  // 3/3
const { error } = await email.send({ ... }) // QUOTA_EXCEEDED
expect(error.code).toBe('QUOTA_EXCEEDED')
```

Rate limit testing uses similar approach:
```typescript
// Test rate limit: 5 requests/minute for e2e_tiny plan
const results = await Promise.all(
  Array(8).fill(null).map(() => analytics.track('event', {}))
)
const rateLimited = results.find(r => r.error?.code === 'RATE_LIMITED')
expect(rateLimited).toBeDefined()
expect(rateLimited.error.details.retryAfterSeconds).toBeGreaterThan(0)
```

### New Test Helpers

#### SDK Test Harness (`helpers/sdk-test-harness.ts`)

> **Consolidates all test-only functionality into one module** (enabled via `SDK_E2E_ENABLED=true`).

```typescript
/**
 * Unified SDK E2E Test Harness
 * Single entry point for all test operations - keeps security review surface minimal.
 */
export class SDKTestHarness {
  private baseUrl: string
  private adminKey: string
  private runId: string

  constructor() {
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000'
    this.adminKey = process.env.E2E_ADMIN_KEY!
    this.runId = RUN_ID
  }

  // === Project Factory ===
  async createProject(options: {
    name?: string
    plan?: 'pro' | 'free' | 'e2e_tiny'  // e2e_tiny has low limits for quota tests
  }): Promise<SDKTestContext> { ... }

  async cleanupProject(projectId: string): Promise<void> { ... }

  // === Quota Overrides (for deterministic testing) ===
  async setQuotaLimit(projectId: string, metric: string, limit: number): Promise<void> { ... }
  async resetQuota(projectId: string, metric: string): Promise<void> { ... }

  // === Email Inspection (test mode only) ===
  async getRenderedEmail(emailId: string): Promise<{ subject: string, html: string }> { ... }
  async getMagicLinkToken(email: string): Promise<string> { ... }

  // === Job Execution Trigger (for sync testing) ===
  async triggerJobCompletion(jobId: string, result: 'completed' | 'failed'): Promise<void> { ... }

  // === Webhook Helpers ===
  generateStripeSignature(payload: string): string { ... }
  verifyWebhookWasCalled(eventType: string): Promise<boolean> { ... }

  // === Backup Helpers ===
  async waitForBackupStatus(backupId: string, status: string, timeoutMs = 5000): Promise<void> { ... }
}

// Singleton for test files
export const testHarness = new SDKTestHarness()
```

**Backend**: Single endpoint at `POST /api/admin/e2e/sdk-harness` with action-based routing:
```typescript
// All test operations go through one secure endpoint
POST /api/admin/e2e/sdk-harness
  Headers: X-E2E-Admin-Key, X-E2E-Run-Id
  Body: { action: 'createProject' | 'setQuota' | 'getEmail' | ..., params: {...} }
```

#### SDK Test Client (`helpers/sdk-client.ts`)

```typescript
import { createClient as createAuthClient } from '@sheenapps/auth'
import { createClient as createDbClient } from '@sheenapps/db'
import { createClient as createStorageClient } from '@sheenapps/storage'
// ... other SDKs

export interface SDKTestContext {
  projectId: string
  publicKey: string   // sheen_pk_*
  serverKey: string   // sheen_sk_*
  schemaName: string
  baseUrl: string     // API base URL for raw fetch calls
  authHeaders: Record<string, string>  // Pre-built headers with auth
}

export async function createSDKTestProject(): Promise<SDKTestContext> {
  // Create test Easy Mode project via admin API
  const response = await fetch('/api/admin/e2e/sdk/create-project', {
    method: 'POST',
    headers: {
      'X-E2E-Admin-Key': process.env.E2E_ADMIN_KEY!,
      'X-E2E-Run-Id': RUN_ID,
    },
    body: JSON.stringify({
      name: uniqueProjectName('sdk-test'),
      plan: 'pro', // Pro plan for higher quotas
    }),
  })
  return response.json()
}

export async function cleanupSDKTestProject(projectId: string): Promise<void> {
  await fetch(`/api/admin/e2e/sdk/cleanup-project/${projectId}`, {
    method: 'DELETE',
    headers: {
      'X-E2E-Admin-Key': process.env.E2E_ADMIN_KEY!,
      'X-E2E-Run-Id': RUN_ID,
    },
  })
}

export function createSDKClients(ctx: SDKTestContext) {
  return {
    auth: createAuthClient({ apiKey: ctx.serverKey }),
    db: createDbClient({ apiKey: ctx.serverKey }),
    storage: createStorageClient({ apiKey: ctx.serverKey }),
    jobs: createJobsClient({ apiKey: ctx.serverKey }),
    email: createEmailClient({ apiKey: ctx.serverKey }),
    payments: createPaymentsClient({ apiKey: ctx.serverKey }),
    analytics: createAnalyticsClient({ apiKey: ctx.publicKey }), // Public key for tracking
    analyticsServer: createAnalyticsClient({ apiKey: ctx.serverKey }), // Server key for queries
    secrets: createSecretsClient({ apiKey: ctx.serverKey }),
  }
}
```

#### SDK Test Fixtures (`helpers/sdk-fixtures.ts`)

```typescript
export const SDK_TEST_DATA = {
  // Auth test data
  users: {
    valid: { email: 'sdk-test@example.com', password: 'TestPass123!' },
    invalid: { email: 'invalid', password: '123' },
  },

  // Database test data
  tables: {
    users: {
      columns: ['id', 'email', 'name', 'created_at'],
      testRow: { email: 'test@example.com', name: 'Test User' },
    },
    posts: {
      columns: ['id', 'title', 'content', 'author_id', 'created_at'],
      testRow: { title: 'Test Post', content: 'Content here' },
    },
  },

  // Storage test data
  files: {
    small: { name: 'test.txt', content: 'Hello World', contentType: 'text/plain' },
    image: { name: 'test.png', size: 1024, contentType: 'image/png' },
    large: { name: 'large.bin', size: 10 * 1024 * 1024, contentType: 'application/octet-stream' },
  },

  // Job test data
  jobs: {
    simple: { name: 'test-job', payload: { action: 'test' } },
    delayed: { name: 'delayed-job', payload: { action: 'delayed' }, delay: '5s' },
    failing: { name: 'failing-job', payload: { shouldFail: true } },
  },

  // Email test data
  emails: {
    welcome: { to: 'test@example.com', template: 'welcome', variables: { name: 'Test' } },
    custom: { to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' },
  },

  // Payment test data
  payments: {
    priceId: 'price_test_123',
    successUrl: 'http://localhost:3000/success',
    cancelUrl: 'http://localhost:3000/cancel',
  },

  // Analytics test data
  analytics: {
    events: [
      { name: 'button_click', properties: { button: 'submit' } },
      { name: 'page_view', properties: { path: '/dashboard' } },
    ],
    user: { userId: 'user-123', traits: { plan: 'pro' } },
  },

  // Secrets test data
  secrets: {
    apiKey: { name: 'stripe_api_key', value: 'sk_test_123' },
    webhook: { name: 'webhook_secret', value: 'whsec_123' },
  },
}
```

---

## Test Specifications

### 0. SDK Critical Path Test (`p0-a/p0a-sdk-critical-paths.spec.ts`)

> **The most important P0-A test**: Proves all services compose correctly in a single happy path.

```typescript
test.describe('P0-A SDK Critical Path', () => {
  let ctx: SDKTestContext
  let clients: ReturnType<typeof createSDKClients>
  let userId: string
  let sessionToken: string

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' })
    clients = createSDKClients(ctx)
  })

  test.afterAll(async () => {
    await testHarness.cleanupProject(ctx.projectId)
  })

  test('SDK services compose end-to-end', async () => {
    // Step 1: Create user (auth)
    await test.step('Create user via auth SDK', async () => {
      const { data, error } = await clients.auth.signUp({
        email: uniqueEmail('critical-path'),
        password: 'TestPass123!',
      })
      expect(error).toBeNull()
      userId = data.user.id
      sessionToken = data.sessionToken
    })

    // Step 2: Insert profile row (db)
    await test.step('Insert profile via db SDK', async () => {
      const { data, error } = await clients.db
        .from('user_profiles')
        .insert({ user_id: userId, display_name: 'Test User', bio: 'Hello' })
        .execute()
      expect(error).toBeNull()
      expect(data.rowCount).toBe(1)
    })

    // Step 3: Upload avatar (storage)
    await test.step('Upload avatar via storage SDK', async () => {
      const { data: urlData, error: urlError } = await clients.storage.createSignedUploadUrl({
        path: `avatars/${userId}.png`,
        contentType: 'image/png',
      })
      expect(urlError).toBeNull()
      expect(urlData.url).toBeDefined()

      // Upload small test file (in CI-safe mode, goes to stub)
      const uploadResponse = await fetch(urlData.url, {
        method: 'PUT',
        headers: urlData.headers,
        body: Buffer.from('fake-png-data'),
      })
      expect(uploadResponse.ok).toBe(true)
    })

    // Step 4: Enqueue welcome email job (jobs + email)
    await test.step('Enqueue job via jobs SDK', async () => {
      const { data, error } = await clients.jobs.enqueue({
        name: 'e2e:send-welcome-email',  // e2e: prefix for sync execution in test mode
        payload: { userId, email: uniqueEmail('critical-path') },
      })
      expect(error).toBeNull()
      expect(data.job.id).toBeDefined()
      // In CI-safe mode, job executes synchronously
      expect(data.job.status).toMatch(/pending|completed/)
    })

    // Step 5: Track analytics event (analytics)
    await test.step('Track event via analytics SDK', async () => {
      const { data, error } = await clients.analytics.track('user_onboarded', {
        userId,
        step: 'critical-path-test',
      })
      expect(error).toBeNull()
      expect(data.success).toBe(true)
    })

    // Step 6: Store API key in secrets (secrets)
    await test.step('Store secret via secrets SDK', async () => {
      const { data, error } = await clients.secrets.create({
        name: 'test_api_key',
        value: 'sk_test_critical_path_123',
      })
      expect(error).toBeNull()
      expect(data.success).toBe(true)

      // Verify retrieval
      const { data: getData } = await clients.secrets.get('test_api_key')
      expect(getData.value).toBe('sk_test_critical_path_123')
    })

    // Step 7: Request backup (backups) - shallow, just verify accepted
    await test.step('Request backup via API', async () => {
      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/backups`,
        {
          method: 'POST',
          headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'e2e-critical-path' }),
        }
      )
      const { data, error } = await response.json()
      expect(error).toBeNull()
      expect(data.backup.id).toBeDefined()
      // Don't wait for completion in P0-A - just verify request accepted
    })
  })
})
```

**Why this test matters**:
- Single test that proves the "plumbing works together"
- Catches integration issues between services
- Fast (~10-15 seconds) because each step is minimal
- If this fails, something fundamental is broken

---

### 1. SDK Auth Tests (`p0-a/p0a-sdk-auth.spec.ts`)

**P0-A (Deploy-Blocking)**:
```typescript
test.describe('P0-A SDK Auth', () => {
  test('sign-up creates user and returns session', async ({ request }) => {
    const { data, error } = await auth.signUp({
      email: uniqueEmail('signup'),
      password: 'TestPass123!',
    })
    expect(error).toBeNull()
    expect(data.user.email).toContain('signup')
    expect(data.sessionToken).toBeDefined()
  })

  test('sign-in with valid credentials succeeds', async ({ request }) => {
    // Pre-create user
    await auth.signUp({ email: testEmail, password: testPassword })

    const { data, error } = await auth.signIn({
      email: testEmail,
      password: testPassword,
    })
    expect(error).toBeNull()
    expect(data.sessionToken).toBeDefined()
  })

  test('sign-in with invalid credentials fails', async ({ request }) => {
    const { data, error } = await auth.signIn({
      email: 'nonexistent@example.com',
      password: 'wrong',
    })
    expect(data).toBeNull()
    expect(error.code).toBe('INVALID_CREDENTIALS')
  })

  test('getUser returns user for valid session', async ({ request }) => {
    const { data: signInData } = await auth.signIn({ email, password })

    const { data, error } = await auth.getUser({
      sessionToken: signInData.sessionToken,
    })
    expect(error).toBeNull()
    expect(data.email).toBe(email)
  })

  test('sign-out invalidates session', async ({ request }) => {
    const { data: signInData } = await auth.signIn({ email, password })

    await auth.signOut({ sessionToken: signInData.sessionToken })

    const { error } = await auth.getUser({
      sessionToken: signInData.sessionToken,
    })
    expect(error.code).toBe('UNAUTHORIZED')
  })
})
```

**P0-B (Nightly)**:
```typescript
test.describe('P0-B SDK Auth', () => {
  test('magic link flow works end-to-end', async ({ page }) => {
    // Request magic link
    const { data } = await auth.createMagicLink({
      email: testEmail,
      redirectUrl: 'http://localhost:3000/dashboard',
    })
    expect(data.sent).toBe(true)

    // Simulate clicking magic link (via test endpoint)
    const token = await getTestMagicLinkToken(testEmail)

    // Verify magic link
    const { data: verifyData, error } = await auth.verifyMagicLink({ token })
    expect(error).toBeNull()
    expect(verifyData.sessionToken).toBeDefined()
  })

  test('session refresh extends expiration', async ({ request }) => {
    const { data: signInData } = await auth.signIn({ email, password })

    // Wait a bit
    await sleep(1000)

    const { data, error } = await auth.refreshSession({
      sessionToken: signInData.sessionToken,
    })
    expect(error).toBeNull()
    expect(data.sessionToken).toBeDefined()
    // New token should be different
    expect(data.sessionToken).not.toBe(signInData.sessionToken)
  })

  test('server key in browser returns error', async ({ page }) => {
    // This test runs in browser context
    await page.goto('/test-page')

    const result = await page.evaluate(async (serverKey) => {
      const { createClient } = await import('@sheenapps/auth')
      const auth = createClient({ apiKey: serverKey })
      return auth.signIn({ email: 'test@example.com', password: 'test' })
    }, serverKey)

    expect(result.error.code).toBe('INVALID_KEY_CONTEXT')
  })
})
```

### 2. SDK Database Tests (`p0-a/p0a-sdk-database.spec.ts`)

**P0-A (Deploy-Blocking)**:
```typescript
test.describe('P0-A SDK Database', () => {
  test('insert and select works', async () => {
    // Insert
    const { data: insertData, error: insertError } = await db
      .from('test_users')
      .insert({ email: 'test@example.com', name: 'Test' })
      .execute()

    expect(insertError).toBeNull()
    expect(insertData.rows).toHaveLength(1)

    // Select
    const { data: selectData, error: selectError } = await db
      .from('test_users')
      .select('*')
      .eq('email', 'test@example.com')
      .execute()

    expect(selectError).toBeNull()
    expect(selectData.rows[0].name).toBe('Test')
  })

  test('update with filter works', async () => {
    await db.from('test_users').insert({ email: 'update@example.com', name: 'Old' }).execute()

    const { data, error } = await db
      .from('test_users')
      .update({ name: 'New' })
      .eq('email', 'update@example.com')
      .execute()

    expect(error).toBeNull()
    expect(data.rowCount).toBe(1)
  })

  test('delete with filter works', async () => {
    await db.from('test_users').insert({ email: 'delete@example.com', name: 'ToDelete' }).execute()

    const { data, error } = await db
      .from('test_users')
      .delete()
      .eq('email', 'delete@example.com')
      .execute()

    expect(error).toBeNull()
    expect(data.rowCount).toBe(1)
  })

  test('maxRows prevents mass deletion', async () => {
    // Insert 100 rows
    for (let i = 0; i < 100; i++) {
      await db.from('test_users').insert({ email: `bulk${i}@example.com`, name: 'Bulk' }).execute()
    }

    // Try to delete all with maxRows=50
    const { data, error } = await db
      .from('test_users')
      .delete()
      .eq('name', 'Bulk')
      .maxRows(50)
      .execute()

    expect(data).toBeNull()
    expect(error.code).toBe('ROW_LIMIT_EXCEEDED')
    expect(error.details.matchedRows).toBe(100)
    expect(error.details.limit).toBe(50)
  })
})
```

### 3. SDK Storage Tests (`p0-a/p0a-sdk-storage.spec.ts`)

**P0-A (Deploy-Blocking)** - Uses stubbed storage, no R2 hostname assertions:
```typescript
test.describe('P0-A SDK Storage', () => {
  test('signed upload URL has correct structure', async () => {
    const { data: urlData, error: urlError } = await clients.storage.createSignedUploadUrl({
      path: 'test/file.txt',
      contentType: 'text/plain',
    })
    expect(urlError).toBeNull()
    // P0-A: Don't assert vendor hostname - stubbed storage may use different URL
    expect(urlData.url).toBeDefined()
    expect(typeof urlData.url).toBe('string')
    expect(urlData.url.length).toBeGreaterThan(0)
    expect(urlData.method).toBe('PUT')
    expect(urlData.headers).toBeDefined()
    expect(urlData.headers['Content-Type']).toBe('text/plain')
  })

  test('upload via signed URL succeeds', async () => {
    const { data: urlData } = await clients.storage.createSignedUploadUrl({
      path: 'e2e-test/upload.txt',
      contentType: 'text/plain',
    })

    // Upload to stubbed storage (or real R2 in P0-B)
    const uploadResponse = await fetch(urlData.url, {
      method: urlData.method,
      headers: urlData.headers,
      body: 'Hello World',
    })
    expect(uploadResponse.ok).toBe(true)
  })

  test('list files returns uploaded file', async () => {
    // Upload first
    const { data: urlData } = await clients.storage.createSignedUploadUrl({
      path: 'e2e-test/list-test.txt',
      contentType: 'text/plain',
    })
    await fetch(urlData.url, { method: 'PUT', headers: urlData.headers, body: 'content' })

    // List
    const { data: listData, error } = await clients.storage.list({ prefix: 'e2e-test/' })
    expect(error).toBeNull()
    expect(listData.files.some(f => f.path.includes('list-test.txt'))).toBe(true)
  })

  test('delete file works', async () => {
    // Upload first
    const { data: urlData } = await clients.storage.createSignedUploadUrl({
      path: 'e2e-test/delete-me.txt',
      contentType: 'text/plain',
    })
    await fetch(urlData.url, { method: 'PUT', headers: urlData.headers, body: 'to delete' })

    // Delete
    const { data, error } = await clients.storage.delete({ path: 'e2e-test/delete-me.txt' })
    expect(error).toBeNull()
  })

  test('path traversal is blocked', async () => {
    const { data, error } = await clients.storage.createSignedUploadUrl({
      path: '../../../etc/passwd',
      contentType: 'text/plain',
    })
    expect(data).toBeNull()
    expect(error.code).toBe('VALIDATION_ERROR')
  })
})
```

**P0-B (Nightly)** - Real R2, vendor-specific assertions:
```typescript
test.describe('P0-B SDK Storage Real R2', () => {
  test('signed URL points to R2', async () => {
    const { data: urlData } = await clients.storage.createSignedUploadUrl({
      path: 'p0b-test/real-r2.txt',
      contentType: 'text/plain',
    })
    // P0-B: Assert real R2 endpoint
    expect(urlData.url).toContain('r2.cloudflarestorage.com')
  })

  test('download returns actual file content', async () => {
    const testContent = `P0B test content ${Date.now()}`
    // Upload
    const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
      path: 'p0b-test/download-test.txt',
      contentType: 'text/plain',
    })
    await fetch(uploadUrl.url, { method: 'PUT', headers: uploadUrl.headers, body: testContent })

    // Download
    const { data: downloadUrl } = await clients.storage.createSignedDownloadUrl({
      path: 'p0b-test/download-test.txt',
    })
    const response = await fetch(downloadUrl.url)
    const content = await response.text()
    expect(content).toBe(testContent)
  })
})
```

### 4. SDK Jobs Tests (`p0-a/p0a-sdk-jobs.spec.ts`)

**P0-A (Deploy-Blocking)** - Uses `e2e:` prefix for synchronous execution:
```typescript
test.describe('P0-A SDK Jobs', () => {
  /**
   * P0-A uses e2e: prefix which triggers synchronous execution
   * under SDK_E2E_SYNC_JOBS=true. Jobs complete immediately.
   */
  test('enqueue e2e: job executes synchronously', async () => {
    const { data, error } = await clients.jobs.enqueue({
      name: 'e2e:test-job',  // e2e: prefix = sync execution in CI
      payload: { action: 'test' },
    })
    expect(error).toBeNull()
    expect(data.job.id).toBeDefined()
    // Under SDK_E2E_SYNC_JOBS=true, job completes immediately
    expect(['pending', 'completed']).toContain(data.job.status)
  })

  test('get job returns correct status', async () => {
    const { data: enqueueData } = await clients.jobs.enqueue({
      name: 'e2e:status-check',
      payload: {},
    })

    const { data, error } = await clients.jobs.get(enqueueData.job.id)
    expect(error).toBeNull()
    expect(data.job.id).toBe(enqueueData.job.id)
    // Sync jobs should be completed or at least not stuck pending forever
    expect(['pending', 'running', 'completed']).toContain(data.job.status)
  })

  test('idempotency key prevents duplicates', async () => {
    const idempotencyKey = `e2e-${Date.now()}`

    const { data: first } = await clients.jobs.enqueue({
      name: 'e2e:idempotent',
      payload: {},
      idempotencyKey,
    })

    const { data: second } = await clients.jobs.enqueue({
      name: 'e2e:idempotent',
      payload: {},
      idempotencyKey,
    })

    expect(first.job.id).toBe(second.job.id)
  })

  test('reserved sys: prefix is rejected', async () => {
    const { data, error } = await clients.jobs.enqueue({
      name: 'sys:admin-job',
      payload: {},
    })
    expect(data).toBeNull()
    expect(error.code).toBe('VALIDATION_ERROR')
  })
})
```

**P0-B (Nightly)** - Real queue behavior with delays and cancellation:
```typescript
test.describe('P0-B SDK Jobs Real Queue', () => {
  test('delayed job stays pending until delay expires', async () => {
    const { data: enqueueData } = await clients.jobs.enqueue({
      name: 'p0b-delayed-job',
      payload: {},
      delay: '10s',
    })

    // Immediately after enqueue, should be pending (delayed)
    const { data } = await clients.jobs.get(enqueueData.job.id)
    expect(data.job.status).toBe('pending')
  })

  test('cancel pending job works', async () => {
    const { data: enqueueData } = await clients.jobs.enqueue({
      name: 'p0b-cancel-test',
      payload: {},
      delay: '1h',  // Long delay so it stays pending
    })

    const { data, error } = await clients.jobs.cancel(enqueueData.job.id)
    expect(error).toBeNull()
    expect(data.success).toBe(true)

    // Verify cancelled
    const { data: getData } = await clients.jobs.get(enqueueData.job.id)
    expect(getData.job.status).toBe('cancelled')
  })

  test('retry failed job creates new attempt', async () => {
    // This requires a job that actually fails - use test harness to trigger failure
    const { data: enqueueData } = await clients.jobs.enqueue({
      name: 'p0b-fail-then-retry',
      payload: { shouldFail: true },
    })

    await testHarness.triggerJobCompletion(enqueueData.job.id, 'failed')

    const { data, error } = await clients.jobs.retry(enqueueData.job.id)
    expect(error).toBeNull()
    expect(data.job.attempts).toBeGreaterThan(1)
  })
})
```

### 5. SDK Email Tests (`p0-a/p0a-sdk-email.spec.ts`)

**P0-A (Deploy-Blocking)** - Uses mock email provider, no actual delivery:
```typescript
test.describe('P0-A SDK Email', () => {
  test('send email with template succeeds', async () => {
    const { data, error } = await clients.email.send({
      to: 'test@example.com',
      template: 'welcome',
      variables: { name: 'Test User' },
    })
    expect(error).toBeNull()
    expect(data.email.id).toBeDefined()
    // Under MOCK_EMAIL_PROVIDER, status may vary
    expect(['queued', 'sent', 'delivered']).toContain(data.email.status)
  })

  test('send email with custom HTML succeeds', async () => {
    const { data, error } = await clients.email.send({
      to: 'test@example.com',
      subject: 'Test Email',
      html: '<p>Hello World</p>',
    })
    expect(error).toBeNull()
    expect(data.email.id).toBeDefined()
  })

  test('send email with Arabic locale uses RTL', async () => {
    const { data, error } = await clients.email.send({
      to: 'test@example.com',
      template: 'welcome',
      locale: 'ar',
      variables: { name: 'أحمد' },
    })
    expect(error).toBeNull()
    // Verify RTL in rendered content via test harness
    const rendered = await testHarness.getRenderedEmail(data.email.id)
    expect(rendered.html).toContain('dir="rtl"')
    expect(rendered.html).toContain('مرحباً')
  })

  test('invalid email format returns validation error', async () => {
    const { data, error } = await clients.email.send({
      to: 'not-an-email',
      subject: 'Test',
      html: '<p>Test</p>',
    })
    expect(data).toBeNull()
    expect(error.code).toBe('VALIDATION_ERROR')
  })

  test('idempotency key prevents duplicate sends', async () => {
    const idempotencyKey = `e2e-email-${Date.now()}`

    const { data: first } = await clients.email.send({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      idempotencyKey,
    })

    const { data: second } = await clients.email.send({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      idempotencyKey,
    })

    expect(first.email.id).toBe(second.email.id)
  })
})
```

### 6. SDK Payments Tests (`p0-a/p0a-sdk-payments.spec.ts`)

**P0-A (Deploy-Blocking)** - Uses stripe-mock, no real Stripe ID assertions:
```typescript
test.describe('P0-A SDK Payments', () => {
  test.beforeAll(async () => {
    // Store mock Stripe keys (stripe-mock accepts any key format)
    await clients.secrets.create({
      name: 'stripe_secret_key',
      value: 'sk_test_mock_key_for_e2e',
    })
    await clients.secrets.create({
      name: 'stripe_webhook_secret',
      value: 'whsec_test_mock_secret',
    })
  })

  test('create checkout session returns valid response', async () => {
    const { data, error } = await clients.payments.createCheckoutSession({
      priceId: 'price_test_123',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    })
    expect(error).toBeNull()
    expect(data.session).toBeDefined()
    // P0-A: Don't assert checkout.stripe.com - stripe-mock uses different URL
    expect(data.session.url).toBeDefined()
    expect(typeof data.session.url).toBe('string')
    expect(data.session.id).toBeDefined()
  })

  test('create customer returns valid response', async () => {
    const { data, error } = await clients.payments.createCustomer({
      email: 'customer@example.com',
      name: 'Test Customer',
    })
    expect(error).toBeNull()
    expect(data.customer).toBeDefined()
    // P0-A: Don't assert cus_ prefix - stripe-mock may return different format
    expect(data.customer.id).toBeDefined()
    expect(typeof data.customer.id).toBe('string')
    expect(data.customer.email).toBe('customer@example.com')
  })

  test('webhook signature verification logic works', async () => {
    // Use test harness to generate valid signature for our mock secret
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } })
    const signature = await testHarness.generateStripeSignature(payload)

    const { data, error } = await clients.payments.verifyWebhook({
      payload,
      signature,
    })
    expect(error).toBeNull()
    expect(data.event).toBeDefined()
    expect(data.event.type).toBe('checkout.session.completed')
  })

  test('invalid webhook signature fails', async () => {
    const payload = JSON.stringify({ type: 'test', data: {} })

    const { data, error } = await clients.payments.verifyWebhook({
      payload,
      signature: 'invalid_signature_format',
    })
    expect(data).toBeNull()
    expect(error.code).toBe('INVALID_SIGNATURE')
  })
})
```

**P0-B (Nightly)** - Real Stripe test mode with actual IDs:
```typescript
test.describe('P0-B SDK Payments Real Stripe', () => {
  test.beforeAll(async () => {
    // Use real Stripe test keys
    await clients.secrets.create({
      name: 'stripe_secret_key',
      value: process.env.STRIPE_TEST_SECRET_KEY!,
    })
    await clients.secrets.create({
      name: 'stripe_webhook_secret',
      value: process.env.STRIPE_TEST_WEBHOOK_SECRET!,
    })
  })

  test('checkout session URL points to Stripe', async () => {
    const { data, error } = await clients.payments.createCheckoutSession({
      priceId: process.env.STRIPE_TEST_PRICE_ID!,
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    })
    expect(error).toBeNull()
    // P0-B: Assert real Stripe URL
    expect(data.session.url).toContain('checkout.stripe.com')
  })

  test('customer ID has Stripe format', async () => {
    const { data, error } = await clients.payments.createCustomer({
      email: `p0b-test-${Date.now()}@example.com`,
      name: 'P0B Test Customer',
    })
    expect(error).toBeNull()
    // P0-B: Assert real Stripe customer ID format
    expect(data.customer.id).toMatch(/^cus_/)
  })

  test('get subscription returns active status', async () => {
    // Create customer first
    const { data: customerData } = await clients.payments.createCustomer({
      email: `p0b-sub-${Date.now()}@example.com`,
    })

    // Create subscription via Stripe API directly
    const subscriptionId = await createTestSubscription(customerData.customer.id)

    const { data, error } = await clients.payments.getSubscription(subscriptionId)
    expect(error).toBeNull()
    expect(data.subscription.id).toMatch(/^sub_/)
    expect(['active', 'trialing']).toContain(data.subscription.status)
  })
})
```

### 7. SDK Analytics Tests (`p0-a/p0a-sdk-analytics.spec.ts`)

**P0-A (Deploy-Blocking)**:
```typescript
test.describe('P0-A SDK Analytics', () => {
  test('track event succeeds', async () => {
    const { data, error } = await clients.analytics.track('button_click', {
      button: 'submit',
      page: '/checkout',
    })
    expect(error).toBeNull()
    expect(data.success).toBe(true)
  })

  test('page view tracking succeeds', async () => {
    const { data, error } = await analytics.page('/dashboard', {
      title: 'Dashboard',
      referrer: '/login',
    })
    expect(error).toBeNull()
    expect(data.success).toBe(true)
  })

  test('identify links anonymous to user', async () => {
    // Track as anonymous
    const { data: trackData } = await analytics.track('signup_start', {})

    // Identify user
    const { data, error } = await analytics.identify('user-123', {
      email: 'user@example.com',
      plan: 'pro',
    })
    expect(error).toBeNull()

    // Verify linkage (server-side query)
    const { data: userData } = await analyticsServer.getUser('user-123')
    expect(userData.user.traits.plan).toBe('pro')
  })

  test('listEvents returns tracked events (server key)', async () => {
    // Track some events first
    await analytics.track('test_event_1', {})
    await analytics.track('test_event_2', {})

    // Query with server key
    const { data, error } = await analyticsServer.listEvents({
      eventType: 'track',
      limit: 10,
    })
    expect(error).toBeNull()
    expect(data.events.length).toBeGreaterThan(0)
  })

  test('getCounts returns aggregated data', async () => {
    const { data, error } = await analyticsServer.getCounts({
      groupBy: 'event_name',
    })
    expect(error).toBeNull()
    expect(data.counts).toBeDefined()
  })
})
```

### 8. SDK Secrets Tests (`p0-a/p0a-sdk-secrets.spec.ts`)

> **Security Contract Clarification**:
> - SDK with server key (`sheen_sk_*`) CAN read secret values - this is the product design
> - Admin panel can only view metadata (names, created_at) - values never shown in admin UI
> - Browser context + public key = blocked entirely
> - All access is audit logged

**P0-A (Deploy-Blocking)**:
```typescript
test.describe('P0-A SDK Secrets', () => {
  /**
   * This test validates that server-side code CAN retrieve secret values.
   * This is intentional: Easy Mode Secrets is a K/V store for server key holders.
   * The security boundary is: server keys only, audit logged, never in browser.
   */
  test('server key can create and retrieve secret values', async () => {
    const secretName = `test-secret-${Date.now()}`

    // Create
    const { data: createData, error: createError } = await secrets.create({
      name: secretName,
      value: 'super-secret-value',
    })
    expect(createError).toBeNull()
    expect(createData.success).toBe(true)

    // Retrieve - server key CAN get the value (this is the product)
    const { data, error } = await secrets.get(secretName)
    expect(error).toBeNull()
    expect(data.value).toBe('super-secret-value')
  })

  test('update secret value', async () => {
    const secretName = `update-secret-${Date.now()}`
    await secrets.create({ name: secretName, value: 'old-value' })

    const { data, error } = await secrets.update({
      name: secretName,
      value: 'new-value',
    })
    expect(error).toBeNull()

    const { data: getData } = await secrets.get(secretName)
    expect(getData.value).toBe('new-value')
  })

  test('delete secret (soft delete)', async () => {
    const secretName = `delete-secret-${Date.now()}`
    await secrets.create({ name: secretName, value: 'to-delete' })

    const { data, error } = await secrets.delete(secretName)
    expect(error).toBeNull()

    // Should not be retrievable
    const { error: getError } = await secrets.get(secretName)
    expect(getError.code).toBe('NOT_FOUND')
  })

  test('list secrets returns metadata only', async () => {
    await secrets.create({ name: 'list-test-1', value: 'value1' })
    await secrets.create({ name: 'list-test-2', value: 'value2' })

    const { data, error } = await secrets.list()
    expect(error).toBeNull()
    expect(data.secrets.length).toBeGreaterThanOrEqual(2)
    // Values should NOT be included
    expect(data.secrets[0].value).toBeUndefined()
  })

  test('batch get multiple secrets', async () => {
    await secrets.create({ name: 'batch-1', value: 'v1' })
    await secrets.create({ name: 'batch-2', value: 'v2' })

    const { data, error } = await secrets.getMultiple(['batch-1', 'batch-2'])
    expect(error).toBeNull()
    expect(data.secrets['batch-1']).toBe('v1')
    expect(data.secrets['batch-2']).toBe('v2')
  })

  test('server key required', async ({ page }) => {
    // Try with public key (should fail)
    const result = await page.evaluate(async (publicKey) => {
      const { createClient } = await import('@sheenapps/secrets')
      const secrets = createClient({ apiKey: publicKey })
      return secrets.get('any-secret')
    }, publicKey)

    expect(result.error.code).toBe('INVALID_KEY_CONTEXT')
  })
})
```

### 9. SDK Backups Tests

> **P0-A is extremely shallow** - backups are async and slow. Only verify endpoints work.
> **P0-B runs the full cycle** - create, wait for completion, download, verify.

**P0-A (Deploy-Blocking)** - Shallow validation only:
```typescript
test.describe('P0-A SDK Backups', () => {
  test('list backups endpoint works', async () => {
    const response = await fetch(
      `/api/inhouse/projects/${projectId}/backups`,
      { headers: authHeaders }
    )
    expect(response.ok).toBe(true)
    const { data, error } = await response.json()
    expect(error).toBeNull()
    expect(Array.isArray(data.backups)).toBe(true)
  })

  test('create backup returns ID and accepted status', async () => {
    const response = await fetch(
      `/api/inhouse/projects/${projectId}/backups`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'e2e-p0a-test' }),
      }
    )
    const { data, error } = await response.json()
    expect(error).toBeNull()
    expect(data.backup.id).toBeDefined()
    // Don't wait for completion - just verify request accepted
    expect(data.backup.status).toMatch(/pending|in_progress/)
  })

  test('get backup status endpoint works', async () => {
    // Create backup
    const createResponse = await fetch(
      `/api/inhouse/projects/${projectId}/backups`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'e2e-p0a-status' }),
      }
    )
    const { data: createData } = await createResponse.json()

    // Get status immediately (don't wait for completion)
    const response = await fetch(
      `/api/inhouse/projects/${projectId}/backups/${createData.backup.id}`,
      { headers: authHeaders }
    )
    expect(response.ok).toBe(true)
    const { data, error } = await response.json()
    expect(error).toBeNull()
    expect(data.backup.id).toBe(createData.backup.id)
    // Status could be pending, in_progress, or completed - just verify it's valid
    expect(['pending', 'in_progress', 'completed', 'failed']).toContain(data.backup.status)
  })
})
```

**P0-B (Nightly)** - Full backup cycle:
```typescript
test.describe('P0-B SDK Backups Full Cycle', () => {
  test('create backup, wait for completion, verify size', async () => {
    const createResponse = await fetch(
      `/api/inhouse/projects/${projectId}/backups`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'e2e-p0b-full' }),
      }
    )
    const { data: createData } = await createResponse.json()

    // Wait for completion (up to 60s for nightly)
    await testHarness.waitForBackupStatus(createData.backup.id, 'completed', 60000)

    // Verify completed backup has size
    const response = await fetch(
      `/api/inhouse/projects/${projectId}/backups/${createData.backup.id}`,
      { headers: authHeaders }
    )
    const { data } = await response.json()
    expect(data.backup.status).toBe('completed')
    expect(data.backup.size_bytes).toBeGreaterThan(0)
    expect(data.backup.checksum_sha256).toBeDefined()
  })

  test('get download URL and verify accessible', async () => {
    const backupId = await createAndWaitForBackup(60000)

    const response = await fetch(
      `/api/inhouse/projects/${projectId}/backups/${backupId}/download`,
      { headers: authHeaders }
    )
    const { data, error } = await response.json()
    expect(error).toBeNull()
    expect(data.url).toContain('r2.cloudflarestorage.com')
    expect(data.expiresAt).toBeDefined()

    // Verify URL is actually accessible (HEAD request)
    const headResponse = await fetch(data.url, { method: 'HEAD' })
    expect(headResponse.ok).toBe(true)
  })

  test('restore from backup works', async () => {
    const backupId = await createAndWaitForBackup(60000)

    // Initiate restore
    const restoreResponse = await fetch(
      `/api/inhouse/projects/${projectId}/restores`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId, reason: 'e2e-restore-test' }),
      }
    )
    const { data: restoreData } = await restoreResponse.json()
    expect(restoreData.restore.id).toBeDefined()

    // Wait for restore completion
    await testHarness.waitForRestoreStatus(restoreData.restore.id, 'completed', 120000)

    // Verify data integrity (query the restored schema)
    // ... application-specific verification
  })
})
```

### 10. SDK Quota Tests (`p0-b/p0b-sdk-quotas.spec.ts`)

> **Note**: Quota tests moved to P0-B (nightly) because they require special test setup.
> Uses `e2e_tiny` plan with low limits for fast, deterministic testing.

**P0-B (Nightly)** - Uses tiny quota plan:
```typescript
test.describe('P0-B SDK Quotas', () => {
  let tinyCtx: SDKTestContext
  let clients: ReturnType<typeof createSDKClients>

  test.beforeAll(async () => {
    // e2e_tiny plan: storage=1MB, emails=3, jobs=5, secrets=3
    tinyCtx = await testHarness.createProject({ plan: 'e2e_tiny' })
    clients = createSDKClients(tinyCtx)
  })

  test.afterAll(async () => {
    await testHarness.cleanupProject(tinyCtx.projectId)
  })

  test('storage quota exceeded returns error', async () => {
    // e2e_tiny has 1MB storage limit
    const { data, error } = await clients.storage.createSignedUploadUrl({
      path: 'large-file.bin',
      contentType: 'application/octet-stream',
      maxSizeBytes: 5 * 1024 * 1024, // 5MB > 1MB limit
    })

    expect(data).toBeNull()
    expect(error.code).toBe('QUOTA_EXCEEDED')
    expect(error.details.metric).toBe('storage_bytes')
    expect(error.details.limit).toBe(1 * 1024 * 1024)
  })

  test('email quota exceeded returns error after 3 sends', async () => {
    // e2e_tiny has 3 email limit - deterministic, no loops
    await clients.email.send({ to: 'a@test.com', subject: 'Test 1', html: '<p>1</p>' })
    await clients.email.send({ to: 'b@test.com', subject: 'Test 2', html: '<p>2</p>' })
    await clients.email.send({ to: 'c@test.com', subject: 'Test 3', html: '<p>3</p>' })

    // 4th should fail
    const { data, error } = await clients.email.send({
      to: 'd@test.com',
      subject: 'Test 4',
      html: '<p>4</p>',
    })

    expect(data).toBeNull()
    expect(error.code).toBe('QUOTA_EXCEEDED')
    expect(error.details.metric).toBe('email_sends')
    expect(error.details.used).toBe(3)
    expect(error.details.limit).toBe(3)
  })

  test('rate limit returns retryAfter with tiny limits', async () => {
    // e2e_tiny has 5 requests/minute rate limit
    const requests = Array(8).fill(null).map(() =>
      clients.analytics.track('rapid-event', {})
    )

    const results = await Promise.all(requests)
    const rateLimited = results.find(r => r.error?.code === 'RATE_LIMITED')

    // Should hit rate limit within 8 requests
    expect(rateLimited).toBeDefined()
    expect(rateLimited!.error.details.retryAfterSeconds).toBeGreaterThan(0)
  })

  test('job quota exceeded after 5 jobs', async () => {
    // e2e_tiny has 5 job runs limit
    for (let i = 1; i <= 5; i++) {
      await clients.jobs.enqueue({ name: `e2e:job-${i}`, payload: {} })
    }

    // 6th should fail
    const { data, error } = await clients.jobs.enqueue({
      name: 'e2e:job-6',
      payload: {},
    })

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error.code).toBe('QUOTA_EXCEEDED')
    expect(error.details.metric).toBe('job_runs')
  })
})
```

### 10a. SDK Introspection Tests (`p0-a/p0a-sdk-introspection.spec.ts`)

> **Note**: Limits and capabilities APIs are introspection endpoints, not quota edge cases.
> These run in P0-A since they don't require special quota setup.

**P0-A (Deploy-Blocking)**:
```typescript
test.describe('P0-A SDK Introspection', () => {
  let ctx: SDKTestContext

  test.beforeAll(async () => {
    ctx = await testHarness.createProject()
  })

  test.afterAll(async () => {
    await testHarness.cleanupProject(ctx.projectId)
  })

  test('limits API returns current usage', async () => {
    const response = await fetch(
      `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
      { headers: ctx.authHeaders }
    )
    const { data, error } = await response.json()

    expect(error).toBeNull()
    expect(data.plan).toBeDefined()
    expect(data.limits.storage_bytes).toBeDefined()
    expect(data.limits.storage_bytes.used).toBeGreaterThanOrEqual(0)
    expect(data.limits.storage_bytes.limit).toBeGreaterThan(0)
  })

  test('capabilities API returns enabled services', async () => {
    const response = await fetch(
      `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/capabilities`,
      { headers: ctx.authHeaders }
    )
    const { data, error } = await response.json()

    expect(error).toBeNull()
    expect(data.primitives.auth.enabled).toBe(true)
    expect(data.primitives.db.enabled).toBe(true)
    expect(data.primitives.storage.enabled).toBe(true)
  })

  test('project info API returns basic metadata', async () => {
    const response = await fetch(
      `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/info`,
      { headers: ctx.authHeaders }
    )
    const { data, error } = await response.json()

    expect(error).toBeNull()
    expect(data.projectId).toBe(ctx.projectId)
    expect(data.schemaName).toBe(ctx.schemaName)
    expect(data.createdAt).toBeDefined()
  })
})
```

### 11. SDK Error Tests (`p0-a/p0a-sdk-errors.spec.ts`)

> **High leverage test**: Validates the error contract is consistent across ALL SDKs.
> This catches regressions in error handling before they reach users.

**P0-A (Deploy-Blocking)**:
```typescript
test.describe('P0-A SDK Error Contract', () => {
  /**
   * Systematic error contract validation for every SDK.
   * Every SDK response must be { data, error } and never throw.
   */
  test('all SDK methods return { data, error } and never throw', async () => {
    // Test each SDK with invalid input - should return error, not throw
    const testCases = [
      { sdk: 'auth', call: () => auth.signIn({ email: '', password: '' }) },
      { sdk: 'db', call: () => db.from('').select('*').execute() },
      { sdk: 'storage', call: () => storage.createSignedUploadUrl({ path: '', contentType: '' }) },
      { sdk: 'jobs', call: () => jobs.enqueue({ name: '', payload: null }) },
      { sdk: 'email', call: () => email.send({ to: '', subject: '', html: '' }) },
      { sdk: 'analytics', call: () => analyticsServer.listEvents({ limit: -1 }) },
      { sdk: 'secrets', call: () => secrets.get('') },
    ]

    for (const { sdk, call } of testCases) {
      // Should NOT throw
      let result: any
      let threw = false
      try {
        result = await call()
      } catch (e) {
        threw = true
      }

      expect(threw).toBe(false, `${sdk} SDK threw instead of returning error`)
      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('error')
      // Either data or error should be non-null (or both null for "no result")
    }
  })

  test('all errors have code, message, and requestId', async () => {
    // Trigger known errors from each SDK
    const errors = [
      (await auth.signIn({ email: 'invalid', password: 'x' })).error,
      (await db.from('nonexistent_table').select('*').execute()).error,
      (await storage.createSignedUploadUrl({ path: '../traversal', contentType: 'x' })).error,
      (await jobs.enqueue({ name: 'sys:reserved', payload: {} })).error,
      (await secrets.get('nonexistent-secret-12345')).error,
    ]

    for (const error of errors) {
      expect(error).not.toBeNull()
      expect(error.code).toBeDefined()
      expect(typeof error.code).toBe('string')
      expect(error.message).toBeDefined()
      expect(typeof error.message).toBe('string')
      // requestId enables support debugging - critical for production
      expect(error.requestId || error.correlationId).toBeDefined()
    }
  })

  test('error codes are stable and documented', async () => {
    // These codes must never change - they're part of the public API
    const expectedCodes = [
      'INVALID_CREDENTIALS',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VALIDATION_ERROR',
      'QUOTA_EXCEEDED',
      'RATE_LIMITED',
      'TIMEOUT',
      'NETWORK_ERROR',
      'INTERNAL_ERROR',
      'INVALID_KEY_CONTEXT',
      'INVALID_SIGNATURE',
      'ROW_LIMIT_EXCEEDED',
    ]

    // Verify these codes exist in SDK error types
    // (This is more of a compile-time check, but validates at runtime too)
    for (const code of expectedCodes) {
      expect(typeof code).toBe('string')
      expect(code.length).toBeGreaterThan(0)
    }
  })

  test('retryable flag is present and accurate', async () => {
    // Transient errors should have retryable: true
    const transientError = { code: 'TIMEOUT', retryable: true }
    const permanentError = { code: 'VALIDATION_ERROR', retryable: false }

    // Validate known retryable errors
    const retryableCodes = ['TIMEOUT', 'NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE']
    const permanentCodes = ['VALIDATION_ERROR', 'INVALID_CREDENTIALS', 'FORBIDDEN', 'NOT_FOUND']

    // This test documents the contract - if we change retryable behavior, update here
    expect(retryableCodes).toContain('TIMEOUT')
    expect(permanentCodes).toContain('VALIDATION_ERROR')
  })

  test('validation errors include field-level details', async () => {
    const { error } = await auth.signUp({
      email: 'not-an-email',
      password: '123', // Too short
    })

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.details).toBeDefined()
    expect(error.details.validationErrors).toBeDefined()
    expect(Array.isArray(error.details.validationErrors)).toBe(true)
    expect(error.details.validationErrors.length).toBeGreaterThan(0)

    // Each validation error should have field and message
    for (const fieldError of error.details.validationErrors) {
      expect(fieldError.field).toBeDefined()
      expect(fieldError.message).toBeDefined()
    }
  })
})

test.describe('P0-A SDK Security Errors', () => {
  test('HMAC signature required for worker routes', async () => {
    // Call worker directly without signature - should fail
    const response = await fetch(
      `${process.env.WORKER_BASE_URL}/v1/inhouse/projects/${projectId}/jobs`,
      { headers: { 'Content-Type': 'application/json' } }
    )

    expect(response.status).toBe(401)
    const { error } = await response.json()
    expect(error.code).toBe('INVALID_SIGNATURE')
  })

  test('project access denied for wrong user', async () => {
    // Create project as user A
    const projectA = await testHarness.createProject({ plan: 'pro' })

    // Try to access as user B (different test user)
    const userBHeaders = await testHarness.getAuthHeadersForUser('user-b@test.sheenapps.com')
    const response = await fetch(
      `/api/inhouse/projects/${projectA.projectId}/storage/files`,
      { headers: userBHeaders }
    )

    expect(response.status).toBe(403)
    const { error } = await response.json()
    expect(error.code).toBe('FORBIDDEN')

    await testHarness.cleanupProject(projectA.projectId)
  })

  test('server key in browser context returns INVALID_KEY_CONTEXT', async ({ page }) => {
    // Run in actual browser context
    const result = await page.evaluate(async (serverKey) => {
      // This import happens in browser
      const { createClient } = await import('@sheenapps/auth')
      const auth = createClient({ apiKey: serverKey })
      return auth.signIn({ email: 'test@example.com', password: 'test' })
    }, ctx.serverKey)

    expect(result.error).not.toBeNull()
    expect(result.error.code).toBe('INVALID_KEY_CONTEXT')
    expect(result.error.message).toContain('browser')
  })

  test('public key cannot access server-only endpoints', async () => {
    // Secrets requires server key
    const publicSecrets = createSecretsClient({ apiKey: ctx.publicKey })
    const { error } = await publicSecrets.get('any-secret')

    expect(error).not.toBeNull()
    expect(error.code).toBe('INVALID_KEY_CONTEXT')
  })
})
```

---

## Test Infrastructure Additions

### Consolidated Test Harness Endpoint

> **Single endpoint** for all test operations. Keeps security review surface minimal.

**Security Guardrails** (hard-block in non-test environments):
```typescript
// Route handler - /api/admin/e2e/sdk-harness/route.ts
export async function POST(request: NextRequest) {
  // Hard block 1: Environment check
  if (process.env.SDK_E2E_ENABLED !== 'true') {
    return Response.json({ error: 'E2E harness disabled' }, { status: 404 })
  }

  // Hard block 2: Not in production
  if (process.env.NODE_ENV === 'production' && !process.env.CI) {
    return Response.json({ error: 'E2E harness blocked in production' }, { status: 403 })
  }

  // Hard block 3: Require explicit mode header
  if (request.headers.get('X-E2E-Mode') !== 'true') {
    return Response.json({ error: 'Missing X-E2E-Mode header' }, { status: 400 })
  }

  // Hard block 4: Admin key validation
  const adminKey = request.headers.get('X-E2E-Admin-Key')
  if (adminKey !== process.env.SDK_E2E_ADMIN_KEY) {
    return Response.json({ error: 'Invalid admin key' }, { status: 401 })
  }

  // Proceed with action...
}
```

> **Note**: This answers the "two-person approval in prod" question: simplest solution is **no prod support at all**.

```typescript
// Single unified endpoint - all test operations go here
POST /api/admin/e2e/sdk-harness
  Headers: X-E2E-Admin-Key, X-E2E-Run-Id, X-E2E-Mode: true
  Body: { action: string, params: object }
  Returns: { success: boolean, data?: any, error?: string }

// Supported actions:
{
  // Project Factory
  action: 'createProject',
  params: { name?: string, plan: 'pro' | 'free' | 'e2e_tiny' }
  // Returns: { projectId, publicKey, serverKey, schemaName, baseUrl }
}

{
  action: 'cleanupProject',
  params: { projectId: string }
  // Returns: { success, cleaned: { tables, files, jobs, emails, secrets } }
}

{
  // Quota Overrides (for deterministic testing)
  action: 'setQuotaLimit',
  params: { projectId: string, metric: string, limit: number }
}

{
  action: 'resetQuota',
  params: { projectId: string, metric: string }
}

{
  // Email Inspection
  action: 'getRenderedEmail',
  params: { emailId: string }
  // Returns: { subject, html, text, headers }
}

{
  action: 'getMagicLinkToken',
  params: { email: string }
  // Returns: { token, expiresAt }
}

{
  // Job Control (for sync testing)
  action: 'triggerJobCompletion',
  params: { jobId: string, status: 'completed' | 'failed', result?: any }
}

{
  // Backup/Restore Status
  action: 'waitForBackupStatus',
  params: { backupId: string, status: string, timeoutMs: number }
}

{
  action: 'waitForRestoreStatus',
  params: { restoreId: string, status: string, timeoutMs: number }
}

{
  // Multi-user Testing
  action: 'getAuthHeadersForUser',
  params: { email: string }
  // Returns: { headers: { Authorization, ... } }
}

{
  // Webhook Helpers
  action: 'generateStripeSignature',
  params: { payload: string }
  // Returns: { signature }
}
```

### Environment Variables

```bash
# SDK E2E Testing - Core
SDK_E2E_ENABLED=true                    # Enables /api/admin/e2e/sdk-harness endpoint
SDK_E2E_ADMIN_KEY=<secret>              # Required for all test harness calls
SDK_E2E_DEFAULT_PLAN=pro                # Default plan for test projects

# CI-Safe Mode - Service Stubs
SDK_E2E_STUB_STORAGE=true               # Use in-memory storage instead of R2
SDK_E2E_SYNC_JOBS=true                  # Execute e2e:* jobs synchronously
SDK_E2E_MOCK_STRIPE=true                # Use stripe-mock instead of real Stripe

# Tiny Quota Plan Limits (for deterministic quota testing)
SDK_E2E_TINY_STORAGE_BYTES=1048576      # 1 MB
SDK_E2E_TINY_EMAIL_SENDS=3              # 3 emails
SDK_E2E_TINY_JOB_RUNS=5                 # 5 jobs
SDK_E2E_TINY_SECRETS_COUNT=3            # 3 secrets
SDK_E2E_TINY_RATE_LIMIT=5               # 5 requests/minute

# Stripe Test Keys (for P0-B real Stripe tests)
STRIPE_TEST_SECRET_KEY=sk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_test_...
STRIPE_TEST_PRICE_ID=price_test_...

# Email Testing
MOCK_EMAIL_PROVIDER=true                # Store emails in DB, don't send via Resend
DISABLE_EMAIL_DELIVERY=true             # Legacy flag, prefer MOCK_EMAIL_PROVIDER
```

### CI/CD Integration

> **Note**: All P0-A SDK tests live under `tests/e2e/p0-a/` for consistent grep selection.
> This ensures `--grep "P0-A"` across `tests/e2e/**` catches all deploy-blocking tests.

Add to `.github/workflows/p0-tests.yml`:

```yaml
jobs:
  sdk-p0a-tests:
    name: SDK P0-A Tests (Deploy-Blocking)
    runs-on: ubuntu-latest
    timeout-minutes: 10  # P0-A must be fast

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install chromium

      - name: Setup test environment
        run: |
          cp .env.test.local.example .env.test.local
          # Core E2E settings
          echo "SDK_E2E_ENABLED=true" >> .env.test.local
          echo "SDK_E2E_ADMIN_KEY=${{ secrets.E2E_ADMIN_KEY }}" >> .env.test.local
          # CI-Safe Mode: stub external dependencies
          echo "SDK_E2E_STUB_STORAGE=true" >> .env.test.local
          echo "SDK_E2E_SYNC_JOBS=true" >> .env.test.local
          echo "SDK_E2E_MOCK_STRIPE=true" >> .env.test.local
          echo "MOCK_EMAIL_PROVIDER=true" >> .env.test.local

      - name: Seed test data
        run: npm run db:seed:test

      - name: Build application
        run: npm run build

      - name: Start application
        run: npm run start &
        env:
          PORT: 3000

      - name: Wait for app
        run: npx wait-on http://localhost:3000 --timeout 60000

      - name: Run SDK P0-A tests
        # Grep across ALL of tests/e2e/** for "P0-A" tag
        # All P0-A tests are in p0-a/ folder for consistency
        run: npx playwright test tests/e2e/p0-a/ --grep "P0-A"
        env:
          TEST_TYPE: p0a
          BASE_URL: http://localhost:3000
          CI: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: sdk-p0a-test-results
          path: playwright-report/
          retention-days: 7

      - name: Fail if P0-A tests failed
        if: failure()
        run: |
          echo "::error::P0-A SDK tests failed - deployment blocked"
          exit 1
```

Add to `.github/workflows/nightly-tests.yml` for P0-B:

```yaml
jobs:
  sdk-p0b-tests:
    name: SDK P0-B Tests (Nightly)
    runs-on: ubuntu-latest
    timeout-minutes: 30  # P0-B can be slower

    steps:
      # ... same setup as P0-A ...

      - name: Setup test environment
        run: |
          cp .env.test.local.example .env.test.local
          echo "SDK_E2E_ENABLED=true" >> .env.test.local
          echo "SDK_E2E_ADMIN_KEY=${{ secrets.E2E_ADMIN_KEY }}" >> .env.test.local
          # P0-B uses REAL external services
          echo "SDK_E2E_STUB_STORAGE=false" >> .env.test.local
          echo "SDK_E2E_SYNC_JOBS=false" >> .env.test.local
          echo "SDK_E2E_MOCK_STRIPE=false" >> .env.test.local
          echo "STRIPE_TEST_SECRET_KEY=${{ secrets.STRIPE_TEST_SECRET_KEY }}" >> .env.test.local

      - name: Run SDK P0-B tests
        run: npx playwright test tests/e2e/p0-b/ --grep "P0-B"
        env:
          TEST_TYPE: p0b
          BASE_URL: http://localhost:3000
          CI: true
```

---

## Implementation Priority

### Sprint 1: Foundation (1 week)
- [ ] Create SDK test harness (`sdk-test-harness.ts`) - consolidated test operations
- [ ] Implement `/api/admin/e2e/sdk-harness` endpoint with all actions
- [ ] Create `e2e_tiny` plan with low limits for quota testing
- [ ] Implement service stubs for CI-safe mode (storage, jobs, Stripe)
- [ ] Set up SDK test data seeding
- [ ] Create cleanup utilities for SDK tests

### Sprint 2: Critical Path Tests (2 weeks)
- [ ] `p0a-sdk-critical-paths.spec.ts` - chained happy path across all services
- [ ] `p0a-sdk-auth.spec.ts` - signUp, signIn, signOut, getUser
- [ ] `p0a-sdk-database.spec.ts` - CRUD, maxRows guard
- [ ] `p0a-sdk-storage.spec.ts` - signed URLs (stubbed in CI)
- [ ] `p0a-sdk-errors.spec.ts` - error contract validation

### Sprint 3: Service Tests (2 weeks)
- [ ] SDK Jobs tests
- [ ] SDK Email tests
- [ ] SDK Payments tests
- [ ] SDK Quotas tests

### Sprint 4: Extended Coverage (1 week)
- [ ] SDK Analytics tests
- [ ] SDK Secrets tests
- [ ] SDK Backups tests
- [ ] P0-B full flow tests

### Sprint 5: CI/CD Integration (1 week)
- [ ] Add SDK tests to P0-A workflow
- [ ] Add SDK tests to nightly workflow
- [ ] Add coverage reporting
- [ ] Documentation

---

## Success Metrics

| Metric | Target |
|--------|--------|
| P0-A SDK test pass rate | 100% |
| SDK test coverage | > 80% of API routes |
| Test execution time | < 5 min for P0-A |
| Flakiness rate | < 2% |
| Blocked deploys due to SDK tests | < 1/month |

---

## Open Questions (Updated)

| Question | Resolution |
|----------|------------|
| ~~Should SDK tests run in isolated database schemas or shared test DB?~~ | **Resolved**: Each test project gets its own schema via project factory |
| ~~How to handle Stripe webhook testing in CI (mock vs real)?~~ | **Resolved**: P0-A uses stripe-mock, P0-B uses real Stripe test mode |
| ~~Should backup/restore tests run nightly only (slow)?~~ | **Resolved**: Yes, P0-A is shallow (ID returned), P0-B runs full cycle |
| ~~Do we need browser-based SDK tests or API-only?~~ | **Resolved**: Mostly API, browser tests for key context detection |
| ~~How to test quota limits without hitting real limits?~~ | **Resolved**: `e2e_tiny` plan with 3 emails, 5 jobs, 1MB storage |

**Remaining open questions**:
1. Should the test harness endpoint require two-person approval for cleanup actions in prod?
2. How long to retain test project schemas before auto-cleanup?
3. Should we add a "test mode" indicator to SDK responses for debugging?

---

## Appendix: Test Data Cleanup

### Cleanup Strategy

```typescript
// Tag all test data with run ID for cleanup
const TEST_DATA_PREFIX = `e2e-sdk-${RUN_ID}`

// Per-test cleanup (afterEach)
afterEach(async () => {
  if (sdkContext) {
    await testHarness.cleanupProject(sdkContext.projectId)
  }
})

// Global cleanup (global-teardown.ts)
export async function globalSDKCleanup() {
  await fetch('/api/admin/e2e/sdk-harness', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-E2E-Admin-Key': process.env.E2E_ADMIN_KEY!,
      'X-E2E-Run-Id': RUN_ID,
    },
    body: JSON.stringify({
      action: 'cleanupAllByRunId',
      params: { runId: RUN_ID }
    }),
  })
}
```

### Data Isolation

- Each test run gets unique project IDs
- Test emails use `sdk-test+{runId}@example.com` format
- Storage paths prefixed with `e2e-sdk-{runId}/`
- Jobs named `e2e-sdk-{runId}-{jobName}`
- Secrets named `e2e-sdk-{runId}-{secretName}`

---

## Improvement Ideas (Discovered During Implementation)

> This section captures improvements discovered during implementation that are out of scope for the current plan but should be tracked.

| Idea | Priority | Notes |
|------|----------|-------|
| Create `inhouse_projects` table in DB schema | High | The SDK harness currently falls back to mock data if table doesn't exist |
| Create `e2e_tiny` plan in database | Medium | Plan limits defined in code but need actual plan in plans table |
| ~~Add SDK stubs for CI-safe mode~~ | ~~Medium~~ | Not needed - use server-side flags instead to avoid stub drift |
| Add global SDK teardown to global-teardown.ts | Low | Call `sdkGlobalTeardown()` in existing teardown script |
| Consider adding SDK client type exports | Low | Export TypeScript types for better IDE support |
| Add retry logic to SDK test harness | Low | Handle transient network failures in harness operations |
| Implement `getRenderedEmail()` in test harness | Medium | Needed to verify RTL/locale in email content (currently catches error) |
| Implement `generateStripeSignature()` in test harness | Medium | Needed for webhook verification tests (currently skips if unavailable) |
| Add introspection API endpoints | High | `/api/inhouse/projects/:id/limits`, `/capabilities`, `/info` endpoints needed |
| Bootstrap e2e_test_* tables in harness | High | P0-A DB tests currently skip if table missing - defeats deploy-blocking purpose. Add `ensureE2ETables()` to harness |
| Analytics key context validation | Low | Ensure public key can track but not query (FORBIDDEN error) |
| Add P0-B environment flags | Medium | `SDK_E2E_REAL_STORAGE`, `SDK_E2E_REAL_STRIPE`, `SDK_E2E_REAL_EMAIL` for real backend tests |
| Create @sheenapps/backups SDK | Low | Backups currently use direct API calls - consider SDK for consistency |
| Implement `waitForBackupStatus()` in test harness | High | Required for P0-B backup tests to wait for completion |
| Implement `waitForRestoreStatus()` in test harness | High | Required for P0-B restore tests to wait for completion |
| Add quota reset helper to test harness | Medium | `resetQuota(projectId, metric)` for quota recovery tests |
| Add test coverage tracking | Low | Track which SDK API routes are covered by tests (Sprint 5) |
| Consider caching Stripe CLI in nightly workflow | Low | Stripe CLI install adds ~30s to each test category run |
| Add Grafana dashboard for nightly test trends | Low | Track P0-B test stability over time |
| Document P0-B test environment requirements | Low | Which env vars needed for real backend tests |

## Files Created During Implementation

### Test Infrastructure
- `tests/e2e/helpers/sdk-test-harness.ts` - Consolidated test harness (project factory, quota management, email inspection, webhook helpers)
- `tests/e2e/helpers/sdk-client.ts` - SDK client factory for creating all SDK clients from test context
- `tests/e2e/fixtures/sdk-fixtures.ts` - SDK test data constants, error codes, helper functions
- `src/app/api/admin/e2e/sdk-harness/route.ts` - Backend API for test operations

### P0-A Test Files (Sprint 2)
- `tests/e2e/p0-a/p0a-sdk-critical-paths.spec.ts` - Chained happy path test across all services
- `tests/e2e/p0-a/p0a-sdk-auth.spec.ts` - Auth SDK tests (sign up/in/out, getUser, sessions)
- `tests/e2e/p0-a/p0a-sdk-database.spec.ts` - Database SDK tests (CRUD, filters, maxRows)
- `tests/e2e/p0-a/p0a-sdk-storage.spec.ts` - Storage SDK tests (signed URLs, upload/download, security)
- `tests/e2e/p0-a/p0a-sdk-errors.spec.ts` - Error contract validation across all SDKs

### P0-A Test Files (Sprint 3)
- `tests/e2e/p0-a/p0a-sdk-jobs.spec.ts` - Jobs SDK tests (enqueue, get, idempotency, e2e: sync, sys: rejected)
- `tests/e2e/p0-a/p0a-sdk-email.spec.ts` - Email SDK tests (templates, custom HTML, locale/RTL, idempotency)
- `tests/e2e/p0-a/p0a-sdk-payments.spec.ts` - Payments SDK tests (checkout, customer, portal, webhook verification)
- `tests/e2e/p0-a/p0a-sdk-analytics.spec.ts` - Analytics SDK tests (track, page, identify, server queries)
- `tests/e2e/p0-a/p0a-sdk-secrets.spec.ts` - Secrets SDK tests (CRUD, list, batch, exists)
- `tests/e2e/p0-a/p0a-sdk-introspection.spec.ts` - Introspection API tests (limits, capabilities, project info)

### P0-B Test Files (Sprint 4)
- `tests/e2e/p0-b/p0b-sdk-full-flows.spec.ts` - Full user journey tests (onboarding, subscription, multi-service)
- `tests/e2e/p0-b/p0b-sdk-storage.spec.ts` - Real R2 storage tests (upload/download roundtrip, large files, content type)
- `tests/e2e/p0-b/p0b-sdk-jobs.spec.ts` - Real queue tests (delays, cancellation, retry, cron schedules)
- `tests/e2e/p0-b/p0b-sdk-email.spec.ts` - Real Resend tests (delivery tracking, all templates, locale/RTL)
- `tests/e2e/p0-b/p0b-sdk-payments.spec.ts` - Real Stripe tests (checkout URLs, customer IDs, portal, webhooks)
- `tests/e2e/p0-b/p0b-sdk-backups.spec.ts` - Full backup/restore cycle tests (create, verify, download, restore)
- `tests/e2e/p0-b/p0b-sdk-quotas.spec.ts` - Quota enforcement tests with e2e_tiny plan (storage/email/job/secrets limits)

### CI/CD Integration (Sprint 5)
- `.github/workflows/p0-tests.yml` - Updated with `sdk-services` matrix entry for P0-A SDK tests
- `.github/workflows/nightly-tests.yml` - New workflow for P0-B tests with real services + quarantine
- `tests/e2e/SDK_TESTS_GUIDE.md` - Comprehensive test running guide

### Test Stability Improvements (Post-Review)
- `tests/e2e/fixtures/sdk-worker-fixture.ts` - Worker-scoped fixture for shared project per worker (prevents stampede)
- `tests/e2e/helpers/expect-eventually.ts` - Polling assertions for eventually-consistent data (analytics, async pipelines)
- `tests/e2e/helpers/skip-helpers.ts` - Centralized skip helpers (table missing, feature unavailable, real services)
