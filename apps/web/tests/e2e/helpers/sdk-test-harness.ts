/**
 * SDK Test Harness
 *
 * Consolidated test harness for Easy Mode SDK E2E tests.
 * Single entry point for all test operations - keeps security review surface minimal.
 *
 * All operations require SDK_E2E_ENABLED=true and valid E2E_ADMIN_KEY.
 */

import { RUN_ID } from '../fixtures/test-data';
import {
  SDKTestContext,
  CreateProjectOptions,
  sdkUniqueProjectName,
} from '../fixtures/sdk-fixtures';

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const E2E_ADMIN_KEY = process.env.E2E_ADMIN_KEY;
const SDK_E2E_ENABLED = process.env.SDK_E2E_ENABLED === 'true';

/**
 * Headers required for SDK E2E test harness calls
 */
function getHarnessHeaders(): Record<string, string> {
  if (!E2E_ADMIN_KEY) {
    throw new Error('[SDK Harness] E2E_ADMIN_KEY environment variable is required');
  }

  return {
    'Content-Type': 'application/json',
    'X-E2E-Admin-Key': E2E_ADMIN_KEY,
    'X-E2E-Run-Id': RUN_ID,
    'X-E2E-Mode': 'true',
  };
}

// ============================================================================
// Harness Action Types
// ============================================================================

type HarnessAction =
  | 'createProject'
  | 'cleanupProject'
  | 'cleanupAllByRunId'
  | 'setQuotaLimit'
  | 'resetQuota'
  | 'getRenderedEmail'
  | 'getMagicLinkToken'
  | 'triggerJobCompletion'
  | 'waitForBackupStatus'
  | 'waitForRestoreStatus'
  | 'getAuthHeadersForUser'
  | 'generateStripeSignature';

interface HarnessRequest<T = unknown> {
  action: HarnessAction;
  params: T;
}

interface HarnessResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Core Harness Call
// ============================================================================

/**
 * Make a call to the SDK E2E test harness endpoint
 */
async function callHarness<TParams, TResult>(
  action: HarnessAction,
  params: TParams
): Promise<HarnessResponse<TResult>> {
  if (!SDK_E2E_ENABLED) {
    throw new Error(
      '[SDK Harness] SDK E2E tests are disabled. Set SDK_E2E_ENABLED=true to enable.'
    );
  }

  const response = await fetch(`${BASE_URL}/api/admin/e2e/sdk-harness`, {
    method: 'POST',
    headers: getHarnessHeaders(),
    body: JSON.stringify({ action, params } as HarnessRequest<TParams>),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error(`[SDK Harness] ${action} failed:`, result);
    return {
      success: false,
      error: result.error || `HTTP ${response.status}`,
    };
  }

  return result;
}

// ============================================================================
// SDK Test Harness Class
// ============================================================================

/**
 * Unified SDK E2E Test Harness
 *
 * Single entry point for all test operations.
 * Keeps security review surface minimal.
 */
export class SDKTestHarness {
  private runId: string;

  constructor() {
    this.runId = RUN_ID;
  }

  // ==========================================================================
  // Project Factory
  // ==========================================================================

  /**
   * Create a new test project with SDK keys
   */
  async createProject(options: CreateProjectOptions = {}): Promise<SDKTestContext> {
    const name = options.name || sdkUniqueProjectName('test');
    const plan = options.plan || 'pro';

    const result = await callHarness<
      { name: string; plan: string; runId: string },
      SDKTestContext
    >('createProject', { name, plan, runId: this.runId });

    if (!result.success || !result.data) {
      throw new Error(`[SDK Harness] Failed to create project: ${result.error}`);
    }

    console.log(`[SDK Harness] Created project ${result.data.projectId} with ${plan} plan`);
    return result.data;
  }

  /**
   * Clean up a specific test project
   */
  async cleanupProject(projectId: string): Promise<void> {
    const result = await callHarness<{ projectId: string }, { cleaned: Record<string, number> }>(
      'cleanupProject',
      { projectId }
    );

    if (!result.success) {
      console.warn(`[SDK Harness] Cleanup warning for ${projectId}: ${result.error}`);
      // Don't throw - global cleanup will catch orphaned resources
      return;
    }

    console.log(`[SDK Harness] Cleaned up project ${projectId}:`, result.data?.cleaned);
  }

  /**
   * Clean up all test resources by run ID (global teardown)
   */
  async cleanupAllByRunId(): Promise<{ cleaned: Record<string, number> }> {
    const result = await callHarness<{ runId: string }, { cleaned: Record<string, number> }>(
      'cleanupAllByRunId',
      { runId: this.runId }
    );

    if (!result.success) {
      console.error(`[SDK Harness] Global cleanup failed: ${result.error}`);
      return { cleaned: {} };
    }

    console.log(`[SDK Harness] Global cleanup for run ${this.runId}:`, result.data?.cleaned);
    return result.data || { cleaned: {} };
  }

  // ==========================================================================
  // Quota Management (for deterministic testing)
  // ==========================================================================

  /**
   * Set a specific quota limit for a project
   * Useful for testing quota exceeded scenarios with predictable limits
   */
  async setQuotaLimit(
    projectId: string,
    metric: string,
    limit: number
  ): Promise<void> {
    const result = await callHarness<
      { projectId: string; metric: string; limit: number },
      { success: boolean }
    >('setQuotaLimit', { projectId, metric, limit });

    if (!result.success) {
      throw new Error(`[SDK Harness] Failed to set quota: ${result.error}`);
    }
  }

  /**
   * Reset a quota counter for a project
   */
  async resetQuota(projectId: string, metric: string): Promise<void> {
    const result = await callHarness<
      { projectId: string; metric: string },
      { success: boolean }
    >('resetQuota', { projectId, metric });

    if (!result.success) {
      throw new Error(`[SDK Harness] Failed to reset quota: ${result.error}`);
    }
  }

  // ==========================================================================
  // Email Inspection (test mode only)
  // ==========================================================================

  /**
   * Get the rendered content of an email (for template validation)
   */
  async getRenderedEmail(
    emailId: string
  ): Promise<{ subject: string; html: string; text?: string }> {
    const result = await callHarness<
      { emailId: string },
      { subject: string; html: string; text?: string }
    >('getRenderedEmail', { emailId });

    if (!result.success || !result.data) {
      throw new Error(`[SDK Harness] Failed to get email: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get the magic link token for an email (for testing magic link flow)
   */
  async getMagicLinkToken(email: string): Promise<string> {
    const result = await callHarness<{ email: string }, { token: string; expiresAt: string }>(
      'getMagicLinkToken',
      { email }
    );

    if (!result.success || !result.data) {
      throw new Error(`[SDK Harness] Failed to get magic link token: ${result.error}`);
    }

    return result.data.token;
  }

  // ==========================================================================
  // Job Control (for sync testing)
  // ==========================================================================

  /**
   * Trigger job completion for testing
   * Used to force a job to complete/fail without waiting for real execution
   */
  async triggerJobCompletion(
    jobId: string,
    status: 'completed' | 'failed',
    result?: unknown
  ): Promise<void> {
    const response = await callHarness<
      { jobId: string; status: string; result?: unknown },
      { success: boolean }
    >('triggerJobCompletion', { jobId, status, result });

    if (!response.success) {
      throw new Error(`[SDK Harness] Failed to trigger job completion: ${response.error}`);
    }
  }

  // ==========================================================================
  // Backup/Restore Helpers
  // ==========================================================================

  /**
   * Wait for a backup to reach a specific status
   */
  async waitForBackupStatus(
    backupId: string,
    status: string,
    timeoutMs: number = 30000
  ): Promise<void> {
    const result = await callHarness<
      { backupId: string; status: string; timeoutMs: number },
      { success: boolean; currentStatus: string }
    >('waitForBackupStatus', { backupId, status, timeoutMs });

    if (!result.success) {
      throw new Error(
        `[SDK Harness] Backup ${backupId} did not reach ${status}: ${result.error}`
      );
    }
  }

  /**
   * Wait for a restore to reach a specific status
   */
  async waitForRestoreStatus(
    restoreId: string,
    status: string,
    timeoutMs: number = 60000
  ): Promise<void> {
    const result = await callHarness<
      { restoreId: string; status: string; timeoutMs: number },
      { success: boolean; currentStatus: string }
    >('waitForRestoreStatus', { restoreId, status, timeoutMs });

    if (!result.success) {
      throw new Error(
        `[SDK Harness] Restore ${restoreId} did not reach ${status}: ${result.error}`
      );
    }
  }

  // ==========================================================================
  // Multi-User Testing
  // ==========================================================================

  /**
   * Get auth headers for a specific test user
   * Useful for testing cross-user access (should be forbidden)
   */
  async getAuthHeadersForUser(email: string): Promise<Record<string, string>> {
    const result = await callHarness<{ email: string }, { headers: Record<string, string> }>(
      'getAuthHeadersForUser',
      { email }
    );

    if (!result.success || !result.data) {
      throw new Error(`[SDK Harness] Failed to get auth headers: ${result.error}`);
    }

    return result.data.headers;
  }

  // ==========================================================================
  // Webhook Helpers
  // ==========================================================================

  /**
   * Generate a valid Stripe webhook signature for testing
   */
  async generateStripeSignature(payload: string): Promise<string> {
    const result = await callHarness<{ payload: string }, { signature: string }>(
      'generateStripeSignature',
      { payload }
    );

    if (!result.success || !result.data) {
      throw new Error(`[SDK Harness] Failed to generate signature: ${result.error}`);
    }

    return result.data.signature;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance for test files to use
 */
export const testHarness = new SDKTestHarness();

// ============================================================================
// Playwright Test Utilities
// ============================================================================

/**
 * Create a cleanup function that runs in test teardown
 */
export function createSDKTestCleanup(ctx: SDKTestContext | null): () => Promise<void> {
  return async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  };
}

/**
 * Global SDK teardown - call in global-teardown.ts
 */
export async function sdkGlobalTeardown(): Promise<void> {
  console.log(`[SDK Harness] Running global SDK teardown for run ${RUN_ID}`);
  await testHarness.cleanupAllByRunId();
}
