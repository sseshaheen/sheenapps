/**
 * Two-Layer Cleanup System
 *
 * Layer 1: Per-test cleanup (best effort)
 *   - Called in test teardown
 *   - Doesn't throw on failure (global cleanup catches it)
 *
 * Layer 2: Global cleanup sweep (CI teardown)
 *   - Deletes all resources tagged with run ID
 *   - Called via CI teardown step (always runs)
 *
 * Both layers require E2E_ADMIN_KEY environment variable.
 */

import { RUN_ID } from '../fixtures/test-data';

const API_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081';
const E2E_ADMIN_KEY = process.env.E2E_ADMIN_KEY;

interface CleanupResult {
  success: boolean;
  error?: string;
  deleted?: {
    projects: number;
    sessions: number;
    messages: number;
  };
}

/**
 * Layer 1: Per-test cleanup (best effort)
 * Clean up a specific project and its related data.
 * Does NOT throw - logs warning and continues.
 */
export async function cleanupTestProject(projectId: string): Promise<void> {
  if (!E2E_ADMIN_KEY) {
    console.warn('[E2E Cleanup] E2E_ADMIN_KEY not set, skipping project cleanup');
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/api/admin/e2e/cleanup/project/${projectId}`,
      {
        method: 'DELETE',
        headers: {
          'X-E2E-Admin-Key': E2E_ADMIN_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[E2E Cleanup] Per-test cleanup failed for project ${projectId}: ${response.status} ${errorText}`
      );
      // Don't throw - global cleanup will catch it
      return;
    }

    const result: CleanupResult = await response.json();
    if (result.success) {
      console.log(`[E2E Cleanup] Cleaned up project ${projectId}`);
    }
  } catch (error) {
    console.warn(
      `[E2E Cleanup] Per-test cleanup failed for project ${projectId}:`,
      error instanceof Error ? error.message : 'Unknown error'
    );
    // Don't throw - global cleanup will catch it
  }
}

/**
 * Layer 2: Global cleanup sweep (CI teardown)
 * Delete all resources tagged with a specific run ID.
 * This is called in CI teardown to clean up any orphaned test data.
 */
export async function globalCleanupByRunId(
  runId: string = RUN_ID
): Promise<CleanupResult> {
  if (!E2E_ADMIN_KEY) {
    console.warn('[E2E Cleanup] E2E_ADMIN_KEY not set, skipping global cleanup');
    return { success: false, error: 'E2E_ADMIN_KEY not configured' };
  }

  try {
    console.log(`[E2E Cleanup] Starting global cleanup for run ${runId}`);

    const response = await fetch(
      `${API_URL}/api/admin/e2e/cleanup/run/${runId}`,
      {
        method: 'DELETE',
        headers: {
          'X-E2E-Admin-Key': E2E_ADMIN_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const result: CleanupResult = await response.json();

    if (!response.ok) {
      console.error(`[E2E Cleanup] Global cleanup failed: ${JSON.stringify(result)}`);
      return { success: false, error: result.error || 'Unknown error' };
    }

    console.log(
      `[E2E Cleanup] Global cleanup completed for run ${runId}:`,
      result.deleted
    );
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[E2E Cleanup] Global cleanup failed:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Get cleanup stats for a run ID (dry run)
 */
export async function getCleanupStats(
  runId: string = RUN_ID
): Promise<{
  success: boolean;
  counts?: {
    projects: number;
    sessions: number;
    messages: number;
  };
  total?: number;
  wouldExceedLimit?: boolean;
  error?: string;
}> {
  if (!E2E_ADMIN_KEY) {
    return { success: false, error: 'E2E_ADMIN_KEY not configured' };
  }

  try {
    const response = await fetch(
      `${API_URL}/api/admin/e2e/cleanup/stats/${runId}`,
      {
        method: 'GET',
        headers: {
          'X-E2E-Admin-Key': E2E_ADMIN_KEY,
        },
      }
    );

    const result = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Playwright global teardown helper
 * Call this in global-teardown.ts
 */
export async function e2eGlobalTeardown(): Promise<void> {
  console.log(`[E2E Cleanup] Running global teardown for run ${RUN_ID}`);

  const stats = await getCleanupStats(RUN_ID);
  console.log(`[E2E Cleanup] Stats before cleanup:`, stats);

  if (stats.success && stats.total && stats.total > 0) {
    await globalCleanupByRunId(RUN_ID);
  } else if (stats.total === 0) {
    console.log(`[E2E Cleanup] No resources to clean up for run ${RUN_ID}`);
  }
}

/**
 * Create a cleanup function bound to a specific project
 * Useful for test fixtures
 */
export function createProjectCleaner(
  projectId: string
): () => Promise<void> {
  return async () => {
    await cleanupTestProject(projectId);
  };
}
