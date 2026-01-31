/**
 * Test Data Isolation
 *
 * Provides unique per-run identifiers to prevent collisions in:
 * - Parallel test runs
 * - Test retries
 * - Local development
 *
 * Pattern: RUN_ID + WORKER_INDEX + counter
 * Example: coffee-abc123-w0-001
 */

import { randomUUID } from 'crypto';

// Generate unique identifiers per test run
export const RUN_ID = process.env.E2E_RUN_ID || randomUUID().slice(0, 8);
export const WORKER_INDEX = process.env.TEST_WORKER_INDEX || process.env.TEST_PARALLEL_INDEX || '0';

// Monotonic counter per worker (deterministic, greppable in logs)
let resourceCounter = 0;

/**
 * Generate a unique email for a test persona
 * Format: e2e+{persona}+{runId}+w{workerIndex}@test.sheenapps.com
 */
export function uniqueEmail(persona: string): string {
  return `e2e+${persona}+${RUN_ID}+w${WORKER_INDEX}@test.sheenapps.com`;
}

/**
 * Generate a unique project name
 * Format: {base}-{runId}-w{workerIndex}-{counter}
 * Example: coffee-abc123-w0-001
 */
export function uniqueProjectName(base: string): string {
  resourceCounter++;
  const counter = String(resourceCounter).padStart(3, '0');
  return `${base}-${RUN_ID}-w${WORKER_INDEX}-${counter}`;
}

/**
 * Reset counter (call in test setup if needed)
 */
export function resetResourceCounter(): void {
  resourceCounter = 0;
}

/**
 * Seeded test users (pre-created in test DB with known states)
 * These have pre-generated storageState files for fast auth in P0-A tests.
 */
export const SeededUsers = {
  // Standard test users with known passwords
  free: {
    email: 'e2e-seeded-free@test.sheenapps.com',
    password: 'TestPass123!',
    plan: 'free' as const,
    balance: 0,
  },
  pro: {
    email: 'e2e-seeded-pro@test.sheenapps.com',
    password: 'TestPass123!',
    plan: 'pro' as const,
    balance: 1000,
  },
  lowQuota: {
    email: 'e2e-seeded-low-quota@test.sheenapps.com',
    password: 'TestPass123!',
    plan: 'pro' as const,
    balance: 5, // Will run out mid-build
  },
  admin: {
    email: 'e2e-seeded-admin@test.sheenapps.com',
    password: 'TestPass123!',
    role: 'admin' as const,
  },
  advisor: {
    email: 'e2e-seeded-advisor@test.sheenapps.com',
    password: 'TestPass123!',
    role: 'advisor' as const,
  },
} as const;

/**
 * Test projects for fast build paths
 * These ideas trigger deterministic builds in E2E mode
 */
export const TestProjects = {
  // Simple app that always succeeds (fast build path)
  simpleApp: {
    idea: 'e2e-coffee-shop',
    name: 'Coffee Shop Landing',
    expectedBuildTime: 5000, // 5s in E2E mode
  },
  // App designed to fail deterministically
  failingApp: {
    idea: 'e2e-failing-app',
    name: 'Failing App Test',
    expectedError: 'Invalid configuration: Missing required field "name" in config',
    expectedBuildTime: 2000, // Fails fast
  },
  // Simple landing page
  simpleLanding: {
    idea: 'e2e-simple-landing',
    name: 'Simple Landing Page',
    expectedBuildTime: 3000,
  },
} as const;

/**
 * Test migration domains for quality gates testing
 */
export const TestMigrationDomains = {
  // Clean site with no issues
  cleanSite: {
    domain: 'e2e-clean-site.test',
    expectedAnalysisTime: 2000,
    expectedTransformTime: 3000,
    expectedGates: {
      typescript: 'pass',
      build: 'pass',
      accessibility: 'pass',
      seo: 'pass',
    },
  },
  // Site with accessibility issues
  a11yIssues: {
    domain: 'e2e-a11y-issues.test',
    expectedAnalysisTime: 2000,
    expectedTransformTime: 3000,
    expectedGates: {
      typescript: 'pass',
      build: 'pass',
      accessibility: 'pass', // Advisory, won't fail
      seo: 'pass',
    },
    expectedA11yIssues: [
      'missing-alt',
      'input-missing-label',
      'heading-skip',
    ],
  },
  // Site with TypeScript errors
  tsFailing: {
    domain: 'e2e-ts-failing.test',
    expectedGates: {
      typescript: 'fail',
      build: 'skip',
      accessibility: 'skip',
      seo: 'skip',
    },
  },
  // Site with large assets
  largeAssets: {
    domain: 'e2e-large-assets.test',
    expectedAssets: {
      processed: 3,
      skipped: 2,
      failed: 0,
    },
  },
} as const;

/**
 * E2E Headers to include with requests
 */
export function getE2EHeaders(): Record<string, string> {
  return {
    'X-E2E-Mode': 'true',
    'X-E2E-Run-Id': RUN_ID,
  };
}

/**
 * Tag metadata for E2E cleanup
 */
export function tagForCleanup(
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...metadata,
    e2e_run_id: RUN_ID,
    e2e_created_at: Date.now(),
    e2e_worker: WORKER_INDEX,
  };
}

export type SeededUserType = keyof typeof SeededUsers;
export type TestProjectType = keyof typeof TestProjects;
export type TestMigrationDomainType = keyof typeof TestMigrationDomains;
