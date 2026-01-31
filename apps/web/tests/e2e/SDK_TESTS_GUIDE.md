# SDK E2E Tests Guide

This guide covers running and writing SDK E2E tests for Easy Mode projects.

## Test Tiers

### P0-A: Deploy-Blocking Tests
- **Location**: `tests/e2e/p0-a/`
- **Purpose**: Must pass on every PR - blocks deployment if failing
- **Characteristics**:
  - Deterministic (no flakiness allowed)
  - Fast execution (< 30s per test)
  - Uses CI-safe stubs for external services
  - No retries in CI (flakiness = test failure)

### P0-B: Nightly Integration Tests
- **Location**: `tests/e2e/p0-b/`
- **Purpose**: Full integration testing with real external services
- **Characteristics**:
  - Runs nightly at 2 AM UTC
  - Uses real R2, Stripe, Resend, BullMQ
  - Longer timeouts allowed
  - Retries enabled for transient failures

## Running Tests Locally

### P0-A Tests (Fast, Stubbed)

```bash
# Run all P0-A SDK tests
TEST_TYPE=p0a npx playwright test tests/e2e/p0-a/

# Run specific P0-A test file
TEST_TYPE=p0a npx playwright test tests/e2e/p0-a/p0a-sdk-storage.spec.ts

# Run with UI (debugging)
TEST_TYPE=p0a npx playwright test tests/e2e/p0-a/ --ui
```

### P0-B Tests (Full Integration)

```bash
# Run all P0-B SDK tests (with real services)
TEST_TYPE=p0b SDK_E2E_REAL_STORAGE=true SDK_E2E_REAL_STRIPE=true npx playwright test tests/e2e/p0-b/

# Run specific P0-B test
TEST_TYPE=p0b npx playwright test tests/e2e/p0-b/p0b-sdk-quotas.spec.ts

# Run with stubbed services (faster local testing)
TEST_TYPE=p0b npx playwright test tests/e2e/p0-b/
```

## Environment Variables

### CI Mode Flags
```bash
SDK_E2E_CI_MODE=true          # Enable CI-safe mode (stubs all external services)
SDK_E2E_STUB_STORAGE=true     # Use in-memory storage instead of R2
SDK_E2E_STUB_EMAIL=true       # Queue emails in DB instead of Resend
SDK_E2E_STUB_PAYMENTS=true    # Use Stripe test mode with mocked responses
SDK_E2E_STUB_QUEUE=true       # Use in-memory queue instead of BullMQ
```

### Real Service Flags (P0-B Only)
```bash
SDK_E2E_REAL_STORAGE=true     # Use real R2 for storage tests
SDK_E2E_REAL_STRIPE=true      # Use real Stripe test mode
SDK_E2E_REAL_EMAIL=true       # Send real emails via Resend
SDK_E2E_REAL_QUEUE=true       # Use real Redis/BullMQ
```

### Required Secrets (P0-B)
```bash
# Stripe (for payment tests)
STRIPE_TEST_SECRET_KEY=sk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_test_...
STRIPE_TEST_PRICE_ID=price_test_...

# R2 Storage (for storage tests)
R2_TEST_ACCOUNT_ID=...
R2_TEST_ACCESS_KEY_ID=...
R2_TEST_SECRET_ACCESS_KEY=...
R2_TEST_BUCKET_NAME=e2e-test-bucket

# Redis (for queue tests)
REDIS_TEST_URL=redis://...
```

## Test Patterns

### SDK Test Context (Worker-Scoped - Recommended)

**Recommended**: Use the worker-scoped fixture to share one project per Playwright worker.
This prevents "project stampede" in CI and is faster:

```typescript
import { test, expect } from '../fixtures/sdk-worker-fixture';

// ctx and clients are automatically provided and shared per worker
test('storage upload works', async ({ ctx, clients }) => {
  const { data, error } = await clients.storage.createSignedUploadUrl({
    path: 'test/file.txt',
    contentType: 'text/plain',
  });
  expect(error).toBeNull();
});
```

### SDK Test Context (Per-File - Legacy)

For tests that need isolated projects (e.g., quota tests), use manual setup:

```typescript
import { testHarness } from '../helpers/sdk-test-harness';
import { SDKTestContext } from '../fixtures/sdk-fixtures';

let ctx: SDKTestContext | null = null;

test.beforeAll(async () => {
  ctx = await testHarness.createProject({ plan: 'pro' });
});

test.afterAll(async () => {
  if (ctx) {
    await testHarness.cleanupProject(ctx.projectId);
  }
});
```

### SDK Client Creation

```typescript
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';

let clients: SDKClients;

test.beforeAll(async () => {
  ctx = await testHarness.createProject({ plan: 'pro' });
  clients = createSDKClients(ctx);
});

// Use clients in tests
test('storage upload works', async () => {
  const { data, error } = await clients.storage.createSignedUploadUrl({
    path: 'test/file.txt',
    contentType: 'text/plain',
  });
  expect(error).toBeNull();
  expect(data?.url).toBeDefined();
});
```

### Error Contract

All SDK methods return `{ data, error, status }` - they never throw:

```typescript
test('handles errors gracefully', async () => {
  const { data, error, status } = await clients.storage.get('nonexistent');

  expect(data).toBeNull();
  expect(error).not.toBeNull();
  expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
  expect(status).toBe(404);
});
```

### Unique Identifiers

Use fixtures for unique test identifiers:

```typescript
import {
  sdkUniqueEmail,
  sdkUniqueStoragePath,
  sdkUniqueJobName,
  sdkUniqueSecretName,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';

// Unique per test run
const email = sdkUniqueEmail('test-user');     // test-user-abc123@test.sheenapps.com
const path = sdkUniqueStoragePath('uploads');  // e2e-abc123/uploads
const jobName = sdkUniqueJobName('process');   // e2e:process:abc123
const secretName = sdkUniqueSecretName('API'); // E2E_API_abc123
```

### Timeouts

Use consistent timeouts from the helper:

```typescript
import { TIMEOUTS } from '../helpers/timeouts';

test('fast operation', async () => {
  test.setTimeout(TIMEOUTS.apiCall);  // 10s
  // ...
});

test('storage upload', async () => {
  test.setTimeout(TIMEOUTS.p0b.realStorage);  // 30s
  // ...
});

test('backup restore', async () => {
  test.setTimeout(TIMEOUTS.p0b.backupRestore);  // 120s
  // ...
});
```

### Eventually-Consistent Assertions

For async pipelines (analytics, email delivery), use polling helpers:

```typescript
import { expectEventually, expectStatusEventually } from '../helpers/expect-eventually';

// Wait for event to appear in analytics
await expectEventually(
  async () => clients.analytics.listEvents({ limit: 50 }),
  (res) => res.data?.events?.some(e => e.event === 'my_event'),
  { timeoutMs: 15_000, message: 'event should appear in listEvents' }
);

// Wait for job to complete
await expectStatusEventually(
  async () => clients.jobs.get(jobId),
  'completed',
  { timeoutMs: 30_000 }
);
```

### Skip Helpers

Use centralized skip helpers instead of repeating checks:

```typescript
import { skipIfTableMissing, skipIfFeatureUnavailable, skipIfNotRealServices } from '../helpers/skip-helpers';

// Skip if database table doesn't exist
const { data, error } = await clients.db.from('e2e_test_users').select('*').execute();
if (error) skipIfTableMissing(error, 'e2e_test_users');

// Skip if test harness feature not available
try {
  signature = await testHarness.generateStripeSignature(payload);
} catch (e) {
  skipIfFeatureUnavailable(e, 'Stripe signature generation');
}

// Skip if not using real external services
skipIfNotRealServices('storage');
```

## Writing New Tests

### P0-A Test Template

```typescript
/**
 * P0-A: SDK [Service] Tests
 *
 * CRITICAL: These tests block deployment.
 * - Must be 100% deterministic
 * - Must complete in < 30s
 * - Must use CI-safe stubs
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import { SDKTestContext, SDK_ERROR_CODES } from '../fixtures/sdk-fixtures';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK [Service]', () => {
  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test('basic operation works', async () => {
    test.setTimeout(TIMEOUTS.apiCall);

    const { data, error } = await clients.service.operation({
      // params
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });
});
```

### P0-B Test Template

```typescript
/**
 * P0-B: SDK [Service] Tests (Real [External Service])
 *
 * NIGHTLY: These tests run with real external services.
 * - May have transient failures
 * - Longer timeouts allowed
 * - Uses real [R2/Stripe/Resend/BullMQ]
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import { SDKTestContext } from '../fixtures/sdk-fixtures';
import { TIMEOUTS, waitFor } from '../helpers/timeouts';

test.describe('P0-B: SDK [Service] Real [External]', () => {
  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test('real service integration', async () => {
    test.setTimeout(TIMEOUTS.p0b.realStorage);

    // Skip if not using real services
    if (process.env.SDK_E2E_REAL_STORAGE !== 'true') {
      test.skip();
      return;
    }

    // Test with real service
    const { data, error } = await clients.service.operation({
      // params
    });

    expect(error).toBeNull();

    // Wait for async completion
    await waitFor(
      async () => {
        const status = await clients.service.getStatus(data.id);
        return status.data?.status === 'completed';
      },
      { timeout: 10_000, interval: 1000 }
    );
  });
});
```

## Test Files

### P0-A Tests (Deploy-Blocking)
| File | Service | Coverage |
|------|---------|----------|
| `p0a-sdk-storage.spec.ts` | Storage | Upload URLs, metadata, list, delete |
| `p0a-sdk-db.spec.ts` | Database | CRUD, queries, transactions |
| `p0a-sdk-auth.spec.ts` | Auth | Sign in/up, session, password reset |
| `p0a-sdk-jobs.spec.ts` | Jobs | Enqueue, status, idempotency |
| `p0a-sdk-email.spec.ts` | Email | Templates, custom HTML, locale |
| `p0a-sdk-payments.spec.ts` | Payments | Checkout, customer, portal |
| `p0a-sdk-analytics.spec.ts` | Analytics | Track, page, identify, query |
| `p0a-sdk-secrets.spec.ts` | Secrets | CRUD, list, batch, exists |
| `p0a-sdk-introspection.spec.ts` | Introspection | Limits, capabilities, project info |

### P0-B Tests (Nightly)
| File | Service | Coverage |
|------|---------|----------|
| `p0b-sdk-storage.spec.ts` | Storage | Real R2 upload/download, large files |
| `p0b-sdk-jobs.spec.ts` | Jobs | Real queue, delays, retries, cron |
| `p0b-sdk-email.spec.ts` | Email | Real Resend delivery tracking |
| `p0b-sdk-payments.spec.ts` | Payments | Real Stripe checkout/customers |
| `p0b-sdk-quotas.spec.ts` | Quotas | e2e_tiny plan enforcement |
| `p0b-sdk-backups.spec.ts` | Backups | Full backup/restore cycle |
| `p0b-sdk-full-flows.spec.ts` | Multi-service | User onboarding, subscriptions |

## Troubleshooting

### Tests fail with "Project not found"
- Ensure `testHarness.createProject()` completes before tests
- Check `owner_id` vs `user_id` in database queries

### Quota tests are flaky
- Use `e2e_tiny` plan for deterministic limits
- Reset quotas between test runs with `testHarness.resetQuota()`

### Real service tests timeout
- Increase timeout with `test.setTimeout(TIMEOUTS.p0b.realStorage)`
- Check external service connectivity
- Verify secrets are properly configured

### SDK methods return unexpected errors
- Check `error.code` against `SDK_ERROR_CODES`
- Verify project has correct plan for the operation
- Check rate limits with `SDK_E2E_TINY_LIMITS`
