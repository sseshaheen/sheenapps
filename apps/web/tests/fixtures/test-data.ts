/**
 * E2E Test Data Management
 *
 * Implements RUN_ID-based test data isolation strategy:
 * - All test data is tagged with a unique run ID
 * - Cleanup deletes ONLY data from the specific run (preserves debug info)
 * - Parallel test shards share the same RUN_ID and can't collide
 * - TTL cleanup handles old test data automatically
 *
 * Expert-validated patterns from PLAYWRIGHT_TEST_ANALYSIS.md
 */

import type { APIRequestContext } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Test configuration - THE source of truth for test data
 *
 * RUN_ID comes from CI env (guarantees all shards get the same ID)
 * Falls back to timestamp-based ID for local development
 */
export const TEST_CONFIG = {
  // RUN_ID: Set in CI workflow env, not in code
  // Format: gh-{github_run_id}-{attempt} or local-{timestamp}
  RUN_ID: process.env.TEST_RUN_ID ?? `local-${Date.now()}`,

  // Centralized user definitions (eliminates credential sprawl)
  users: {
    default: {
      email: process.env.TEST_EMAIL || 'e2e@test.sheenapps.ai',
      password: process.env.TEST_PASSWORD || 'TestPass123!',
    },
    stripe: {
      email: 'e2e+stripe@test.sheenapps.ai',
      password: 'TestPass123!',
      region: 'US',
      paymentProvider: 'stripe' as const,
    },
    paymob: {
      email: 'e2e+paymob@test.sheenapps.ai',
      password: 'TestPass123!',
      region: 'EG',
      paymentProvider: 'paymob' as const,
    },
    advisor: {
      email: 'e2e+advisor@test.sheenapps.ai',
      password: 'TestPass123!',
      role: 'advisor' as const,
    },
    admin: {
      email: 'e2e+admin@test.sheenapps.ai',
      password: 'TestPass123!',
      role: 'admin' as const,
    },
  },

  // Known-good fixture IDs (pre-seeded in test environment)
  fixtures: {
    projectTemplate: 'test-project-template-id',
    activeSubscription: 'sub_test_active',
  },

  // API endpoints
  endpoints: {
    bootstrap: '/api/test/bootstrap',
    cleanup: '/api/test/cleanup',
    login: '/api/test/login',
  },

  // Test endpoint security
  security: {
    // Header required for all test endpoints
    headerName: 'X-Test-Secret',
    // Secret should be set in environment
    secret: process.env.TEST_ENDPOINT_SECRET || 'dev-test-secret-not-for-prod',
  },
}

/**
 * Generate unique test identifier (stable across shards)
 *
 * @param prefix - Prefix for the ID (e.g., 'project', 'session')
 * @returns Unique ID in format: {prefix}-{RUN_ID}-{random}
 */
export function testId(prefix: string): string {
  return `${prefix}-${TEST_CONFIG.RUN_ID}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Type definitions for test data
 */
export interface TestFixtures {
  userId: string
  projectId: string
  projectSlug: string
  workspaceId?: string
  region: string
  plan: string
  runId: string
}

export interface BootstrapOptions {
  createProject?: boolean
  createSubscription?: boolean
  projectName?: string
  locale?: string
}

export interface CleanupOptions {
  scope?: Array<'projects' | 'chat_messages' | 'chat_sessions'>
}

/**
 * Fixture cache path (per-run to avoid stale data)
 */
const FIXTURE_CACHE_DIR = path.join(process.cwd(), 'playwright', '.fixtures')
const FIXTURE_CACHE_FILE = path.join(FIXTURE_CACHE_DIR, `${TEST_CONFIG.RUN_ID}.json`)

/**
 * Get headers required for test API endpoints
 */
export function getTestHeaders(): Record<string, string> {
  return {
    [TEST_CONFIG.security.headerName]: TEST_CONFIG.security.secret,
    'Content-Type': 'application/json',
    'X-Test-Mode': 'true',
    'X-Test-Run-ID': TEST_CONFIG.RUN_ID,
  }
}

/**
 * Bootstrap test run - creates test data labeled with RUN_ID
 *
 * IMPORTANT: Caches result to avoid N tests creating N projects
 * Uses atomic write to prevent race conditions with parallel workers
 *
 * @param request - Playwright API request context
 * @param options - Bootstrap options
 * @returns Test fixtures bundle
 */
export async function bootstrapTestRun(
  request: APIRequestContext,
  options: BootstrapOptions = {}
): Promise<TestFixtures> {
  const {
    createProject = true,
    createSubscription = false,
    projectName = `E2E Test Project ${TEST_CONFIG.RUN_ID}`,
    locale = 'en',
  } = options

  // Check cache first - avoid re-bootstrapping across workers/tests
  if (fs.existsSync(FIXTURE_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(FIXTURE_CACHE_FILE, 'utf-8'))
      console.log(`[test-data] Using cached fixtures for run ${TEST_CONFIG.RUN_ID}`)
      return cached as TestFixtures
    } catch (e) {
      console.warn('[test-data] Cache read failed, re-bootstrapping:', e)
    }
  }

  console.log(`[test-data] Bootstrapping test run ${TEST_CONFIG.RUN_ID}`)

  const response = await request.post(TEST_CONFIG.endpoints.bootstrap, {
    headers: getTestHeaders(),
    data: {
      runId: TEST_CONFIG.RUN_ID,
      createProject,
      createSubscription,
      projectName,
      locale,
      user: TEST_CONFIG.users.default,
    },
  })

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`Bootstrap failed: ${response.status()} - ${body}`)
  }

  const fixtures = await response.json() as TestFixtures

  // Cache for other workers/tests in this run
  // CRITICAL: Atomic write to prevent race condition with parallel workers
  // Multiple workers checking "file missing" then all writing = corrupted JSON
  try {
    fs.mkdirSync(FIXTURE_CACHE_DIR, { recursive: true })
    const tmpFile = `${FIXTURE_CACHE_FILE}.${process.pid}.tmp`
    fs.writeFileSync(tmpFile, JSON.stringify(fixtures, null, 2))
    fs.renameSync(tmpFile, FIXTURE_CACHE_FILE) // Atomic on POSIX
    console.log(`[test-data] Fixtures cached at ${FIXTURE_CACHE_FILE}`)
  } catch (e) {
    console.warn('[test-data] Cache write failed (non-fatal):', e)
  }

  return fixtures
}

/**
 * Cleanup test run - deletes ONLY data with this RUN_ID
 *
 * CRITICAL: Does NOT reset "the user" - that destroys debugging info
 * Only removes data tagged with the specific run ID
 *
 * @param request - Playwright API request context
 * @param options - Cleanup options
 */
export async function cleanupTestRun(
  request: APIRequestContext,
  options: CleanupOptions = {}
): Promise<void> {
  const {
    scope = ['projects', 'chat_messages', 'chat_sessions'],
  } = options

  console.log(`[test-data] Cleaning up test run ${TEST_CONFIG.RUN_ID}`)

  const response = await request.post(TEST_CONFIG.endpoints.cleanup, {
    headers: getTestHeaders(),
    data: {
      runId: TEST_CONFIG.RUN_ID,
      scope,
    },
  })

  if (!response.ok()) {
    const body = await response.text()
    console.warn(`[test-data] Cleanup warning: ${response.status()} - ${body}`)
    // Don't throw - cleanup failures shouldn't fail tests
  } else {
    console.log(`[test-data] Cleanup completed for run ${TEST_CONFIG.RUN_ID}`)
  }

  // Clean up local cache
  try {
    if (fs.existsSync(FIXTURE_CACHE_FILE)) {
      fs.unlinkSync(FIXTURE_CACHE_FILE)
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Login via API and return auth state
 *
 * This is faster than UI login and more reliable for test setup
 * The returned cookies can be used with page.context().addCookies()
 *
 * @param request - Playwright API request context
 * @param userType - Type of user to login as
 */
export async function loginViaApi(
  request: APIRequestContext,
  userType: keyof typeof TEST_CONFIG.users = 'default'
): Promise<{ success: boolean; cookies?: Array<{ name: string; value: string; domain: string; path: string }> }> {
  const user = TEST_CONFIG.users[userType]

  const response = await request.post(TEST_CONFIG.endpoints.login, {
    headers: getTestHeaders(),
    data: {
      email: user.email,
      password: user.password,
    },
  })

  if (!response.ok()) {
    return { success: false }
  }

  const data = await response.json()
  return {
    success: true,
    cookies: data.cookies,
  }
}

/**
 * Check if test endpoints are available
 *
 * Useful for conditional test setup in environments without test endpoints
 */
export async function checkTestEndpoints(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(TEST_CONFIG.endpoints.bootstrap, {
      headers: getTestHeaders(),
    })
    // 404 means endpoints disabled, 405 means endpoint exists but wrong method
    return response.status() !== 404
  } catch {
    return false
  }
}

/**
 * Get base URL for tests
 */
export function getBaseUrl(): string {
  return process.env.BASE_URL ||
    (process.env.TEST_TYPE === 'p0' ? 'http://localhost:3100' : 'http://localhost:3000')
}

/**
 * Wait helper with exponential backoff
 *
 * For use in test setup, not in actual tests (use Playwright's auto-waiting)
 */
export async function waitWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; initialDelay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelay = 1000 } = options
  let delay = initialDelay

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt === maxAttempts) throw e
      console.log(`[test-data] Attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
      delay *= 2
    }
  }

  throw new Error('Unreachable')
}
