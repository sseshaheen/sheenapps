/**
 * SDK Test Fixtures
 *
 * Test data and constants for Easy Mode SDK E2E tests.
 * These fixtures provide consistent test data across all SDK services.
 */

import { RUN_ID, WORKER_INDEX } from './test-data';

// ============================================================================
// SDK Test Data Constants
// ============================================================================

/**
 * SDK-specific test data for each service
 */
export const SDK_TEST_DATA = {
  // Auth test data
  auth: {
    validUser: {
      password: 'TestPass123!',
      passwordWeak: '123',
    },
    invalidCredentials: {
      email: 'nonexistent@example.com',
      password: 'wrongpassword',
    },
  },

  // Database test data
  db: {
    tables: {
      users: {
        columns: ['id', 'email', 'name', 'created_at'],
        testRow: { email: 'test@example.com', name: 'Test User' },
      },
      posts: {
        columns: ['id', 'title', 'content', 'author_id', 'created_at'],
        testRow: { title: 'Test Post', content: 'Content here' },
      },
      profiles: {
        columns: ['id', 'user_id', 'display_name', 'bio', 'avatar_url'],
        testRow: { display_name: 'Test User', bio: 'Hello World' },
      },
    },
  },

  // Storage test data
  storage: {
    files: {
      small: {
        name: 'test.txt',
        content: 'Hello World',
        contentType: 'text/plain',
        size: 11,
      },
      image: {
        name: 'test.png',
        contentType: 'image/png',
        // Small PNG (1x1 transparent pixel)
        content: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        ),
        size: 68,
      },
      large: {
        name: 'large.bin',
        contentType: 'application/octet-stream',
        size: 10 * 1024 * 1024, // 10MB
      },
    },
    paths: {
      traversalAttempt: '../../../etc/passwd',
      valid: 'uploads/test-file.txt',
      avatars: (userId: string) => `avatars/${userId}.png`,
    },
  },

  // Jobs test data
  jobs: {
    simple: { name: 'test-job', payload: { action: 'test' } },
    delayed: { name: 'delayed-job', payload: { action: 'delayed' }, delay: '5s' },
    failing: { name: 'failing-job', payload: { shouldFail: true } },
    // E2E prefix for synchronous execution in test mode
    e2eSync: { name: 'e2e:sync-test', payload: { action: 'sync' } },
    // Reserved system prefix (should be rejected)
    reserved: { name: 'sys:admin-job', payload: {} },
  },

  // Email test data
  email: {
    templates: {
      welcome: { template: 'welcome', variables: { name: 'Test User' } },
      magicLink: { template: 'magic-link', variables: { link: 'https://example.com/auth' } },
      passwordReset: { template: 'password-reset', variables: { link: 'https://example.com/reset' } },
      receipt: { template: 'receipt', variables: { amount: '$99.00', item: 'Pro Plan' } },
    },
    customHtml: {
      subject: 'Test Email',
      html: '<p>Hello World</p>',
    },
    locales: {
      english: { locale: 'en', expectedDir: 'ltr' },
      arabic: { locale: 'ar', expectedDir: 'rtl', greeting: 'مرحباً' },
    },
  },

  // Payments test data
  payments: {
    testPriceId: 'price_test_123',
    urls: {
      success: 'http://localhost:3000/success',
      cancel: 'http://localhost:3000/cancel',
    },
    testCustomer: {
      email: 'customer@example.com',
      name: 'Test Customer',
    },
    webhookEvents: {
      checkoutCompleted: 'checkout.session.completed',
      subscriptionCreated: 'customer.subscription.created',
      invoicePaid: 'invoice.paid',
    },
  },

  // Analytics test data
  analytics: {
    events: [
      { name: 'button_click', properties: { button: 'submit', page: '/checkout' } },
      { name: 'page_view', properties: { path: '/dashboard' } },
      { name: 'signup_start', properties: {} },
      { name: 'user_onboarded', properties: { step: 'complete' } },
    ],
    user: {
      userId: 'user-123',
      traits: { plan: 'pro', email: 'user@example.com' },
    },
  },

  // Secrets test data
  secrets: {
    apiKey: { name: 'stripe_api_key', value: 'sk_test_123' },
    webhook: { name: 'webhook_secret', value: 'whsec_123' },
    testSecret: { name: 'test_api_key', value: 'sk_test_critical_path_123' },
  },

  // Backup test data
  backups: {
    reasons: {
      e2eTest: 'e2e-test-backup',
      criticalPath: 'e2e-critical-path',
      restore: 'e2e-restore-test',
    },
  },
} as const;

// ============================================================================
// SDK Test Plan Limits (e2e_tiny plan)
// ============================================================================

/**
 * Tiny quota limits for deterministic testing.
 * Instead of looping 100 times to hit limits, tests use these small limits.
 */
export const SDK_E2E_TINY_LIMITS = {
  storage_bytes: 1 * 1024 * 1024, // 1 MB
  email_sends: 3, // 3 emails
  job_runs: 5, // 5 jobs
  secrets_count: 3, // 3 secrets
  rate_limit_per_minute: 5, // 5 requests/minute
} as const;

// ============================================================================
// SDK Test Helpers
// ============================================================================

/**
 * Generate a unique email for SDK tests
 * Format: sdk+{persona}+{runId}+w{workerIndex}@test.sheenapps.com
 */
export function sdkUniqueEmail(persona: string): string {
  return `sdk+${persona}+${RUN_ID}+w${WORKER_INDEX}@test.sheenapps.com`;
}

/**
 * Generate a unique project name for SDK tests
 * Format: sdk-{base}-{runId}-w{workerIndex}-{counter}
 */
let sdkResourceCounter = 0;
export function sdkUniqueProjectName(base: string): string {
  sdkResourceCounter++;
  const counter = String(sdkResourceCounter).padStart(3, '0');
  return `sdk-${base}-${RUN_ID}-w${WORKER_INDEX}-${counter}`;
}

/**
 * Generate a unique secret name for SDK tests
 * Format: e2e-sdk-{runId}-{name}
 */
export function sdkUniqueSecretName(name: string): string {
  return `e2e-sdk-${RUN_ID}-${name}`;
}

/**
 * Generate a unique job name for SDK tests
 * Format: e2e-sdk-{runId}-{name}
 */
export function sdkUniqueJobName(name: string): string {
  return `e2e-sdk-${RUN_ID}-${name}`;
}

/**
 * Generate a unique storage path for SDK tests
 * Format: e2e-sdk-{runId}/{path}
 */
export function sdkUniqueStoragePath(path: string): string {
  return `e2e-sdk-${RUN_ID}/${path}`;
}

/**
 * Reset SDK resource counter (call in test setup if needed)
 */
export function resetSDKResourceCounter(): void {
  sdkResourceCounter = 0;
}

// ============================================================================
// SDK Error Codes
// ============================================================================

/**
 * Standard SDK error codes - these must never change (public API contract)
 */
export const SDK_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_KEY_CONTEXT: 'INVALID_KEY_CONTEXT',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  ROW_LIMIT_EXCEEDED: 'ROW_LIMIT_EXCEEDED',
} as const;

/**
 * Retryable error codes (transient failures)
 */
export const RETRYABLE_ERROR_CODES = [
  SDK_ERROR_CODES.TIMEOUT,
  SDK_ERROR_CODES.NETWORK_ERROR,
  SDK_ERROR_CODES.RATE_LIMITED,
] as const;

/**
 * Permanent error codes (don't retry)
 */
export const PERMANENT_ERROR_CODES = [
  SDK_ERROR_CODES.VALIDATION_ERROR,
  SDK_ERROR_CODES.INVALID_CREDENTIALS,
  SDK_ERROR_CODES.FORBIDDEN,
  SDK_ERROR_CODES.NOT_FOUND,
  SDK_ERROR_CODES.INVALID_KEY_CONTEXT,
  SDK_ERROR_CODES.INVALID_SIGNATURE,
] as const;

// ============================================================================
// SDK Test Context Type
// ============================================================================

/**
 * Context returned by the test harness when creating a test project
 */
export interface SDKTestContext {
  projectId: string;
  publicKey: string; // sheen_pk_*
  serverKey: string; // sheen_sk_*
  schemaName: string;
  baseUrl: string; // API base URL for raw fetch calls
  authHeaders: Record<string, string>; // Pre-built headers with auth
  plan: 'pro' | 'free' | 'e2e_tiny';
}

/**
 * Options for creating a test project
 */
export interface CreateProjectOptions {
  name?: string;
  plan?: 'pro' | 'free' | 'e2e_tiny';
}

export type SDKErrorCode = (typeof SDK_ERROR_CODES)[keyof typeof SDK_ERROR_CODES];
