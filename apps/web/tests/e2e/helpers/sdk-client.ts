/**
 * SDK Client Helper
 *
 * Creates SDK clients from a test context for Easy Mode SDK E2E tests.
 * All SDK methods return { data, error, status } - they never throw.
 */

import { createClient as createAuthClient } from '@sheenapps/auth';
import { createClient as createDbClient } from '@sheenapps/db';
import { createClient as createStorageClient } from '@sheenapps/storage';
import { createClient as createJobsClient } from '@sheenapps/jobs';
import { createClient as createEmailClient } from '@sheenapps/email';
import { createClient as createPaymentsClient } from '@sheenapps/payments';
import { createClient as createAnalyticsClient } from '@sheenapps/analytics';
import { createClient as createSecretsClient } from '@sheenapps/secrets';

import type { SDKTestContext } from '../fixtures/sdk-fixtures';

// ============================================================================
// SDK Client Types
// ============================================================================

type AuthClient = ReturnType<typeof createAuthClient>;
type DbClient = ReturnType<typeof createDbClient>;
type StorageClient = ReturnType<typeof createStorageClient>;
type JobsClient = ReturnType<typeof createJobsClient>;
type EmailClient = ReturnType<typeof createEmailClient>;
type PaymentsClient = ReturnType<typeof createPaymentsClient>;
type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;
type SecretsClient = ReturnType<typeof createSecretsClient>;

/**
 * Collection of all SDK clients initialized for a test project
 */
export interface SDKClients {
  /** Auth client (server key) */
  auth: AuthClient;
  /** Database client (server key) */
  db: DbClient;
  /** Storage client (server key) */
  storage: StorageClient;
  /** Jobs client (server key) */
  jobs: JobsClient;
  /** Email client (server key) */
  email: EmailClient;
  /** Payments client (server key) */
  payments: PaymentsClient;
  /** Analytics client for tracking (public key - browser safe) */
  analytics: AnalyticsClient;
  /** Analytics client for querying (server key) */
  analyticsServer: AnalyticsClient;
  /** Secrets client (server key) */
  secrets: SecretsClient;
}

// ============================================================================
// SDK Client Factory
// ============================================================================

/**
 * Default API URL for SDK clients in test mode
 * Uses the worker URL in test environment
 */
const DEFAULT_API_URL = process.env.SDK_API_URL || process.env.WORKER_BASE_URL || 'http://localhost:8081';

/**
 * Create all SDK clients from a test context
 *
 * @param ctx - Test context with project ID and API keys
 * @returns Collection of initialized SDK clients
 *
 * @example
 * ```ts
 * const ctx = await testHarness.createProject({ plan: 'pro' });
 * const clients = createSDKClients(ctx);
 *
 * // Use clients
 * const { data, error } = await clients.auth.signUp({
 *   email: 'test@example.com',
 *   password: 'TestPass123!',
 * });
 * ```
 */
export function createSDKClients(ctx: SDKTestContext): SDKClients {
  const apiUrl = ctx.baseUrl || DEFAULT_API_URL;

  // Server key clients - full access
  const serverKeyConfig = {
    apiKey: ctx.serverKey,
    apiUrl,
  };

  // Public key config - for browser-safe operations
  const publicKeyConfig = {
    apiKey: ctx.publicKey,
    apiUrl,
  };

  // Database client needs projectId
  const dbConfig = {
    projectId: ctx.projectId,
    apiKey: ctx.serverKey,
    apiUrl,
  };

  return {
    // Auth: server key for full access
    auth: createAuthClient(serverKeyConfig),

    // Database: server key with projectId
    db: createDbClient(dbConfig),

    // Storage: server key for upload/delete operations
    storage: createStorageClient(serverKeyConfig),

    // Jobs: server key only
    jobs: createJobsClient(serverKeyConfig),

    // Email: server key only
    email: createEmailClient(serverKeyConfig),

    // Payments: server key only
    payments: createPaymentsClient(serverKeyConfig),

    // Analytics: public key for client-side tracking
    analytics: createAnalyticsClient(publicKeyConfig),

    // Analytics: server key for querying
    analyticsServer: createAnalyticsClient(serverKeyConfig),

    // Secrets: server key only
    secrets: createSecretsClient(serverKeyConfig),
  };
}

// ============================================================================
// Individual Client Factories
// ============================================================================

/**
 * Create auth client with custom config
 */
export function createAuthClientForTest(
  ctx: SDKTestContext,
  options?: { usePublicKey?: boolean }
): AuthClient {
  return createAuthClient({
    apiKey: options?.usePublicKey ? ctx.publicKey : ctx.serverKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

/**
 * Create database client with custom config
 */
export function createDbClientForTest(ctx: SDKTestContext): DbClient {
  return createDbClient({
    projectId: ctx.projectId,
    apiKey: ctx.serverKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

/**
 * Create storage client with custom config
 */
export function createStorageClientForTest(
  ctx: SDKTestContext,
  options?: { usePublicKey?: boolean }
): StorageClient {
  return createStorageClient({
    apiKey: options?.usePublicKey ? ctx.publicKey : ctx.serverKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

/**
 * Create jobs client with custom config
 */
export function createJobsClientForTest(ctx: SDKTestContext): JobsClient {
  return createJobsClient({
    apiKey: ctx.serverKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

/**
 * Create email client with custom config
 */
export function createEmailClientForTest(ctx: SDKTestContext): EmailClient {
  return createEmailClient({
    apiKey: ctx.serverKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

/**
 * Create payments client with custom config
 */
export function createPaymentsClientForTest(ctx: SDKTestContext): PaymentsClient {
  return createPaymentsClient({
    apiKey: ctx.serverKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

/**
 * Create analytics client with custom config
 */
export function createAnalyticsClientForTest(
  ctx: SDKTestContext,
  options?: { useServerKey?: boolean }
): AnalyticsClient {
  return createAnalyticsClient({
    apiKey: options?.useServerKey ? ctx.serverKey : ctx.publicKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

/**
 * Create secrets client with custom config
 */
export function createSecretsClientForTest(ctx: SDKTestContext): SecretsClient {
  return createSecretsClient({
    apiKey: ctx.serverKey,
    apiUrl: ctx.baseUrl || DEFAULT_API_URL,
  });
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  createAuthClient,
  createDbClient,
  createStorageClient,
  createJobsClient,
  createEmailClient,
  createPaymentsClient,
  createAnalyticsClient,
  createSecretsClient,
};
