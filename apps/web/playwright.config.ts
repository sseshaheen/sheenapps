import { defineConfig, devices } from '@playwright/test'
import * as path from 'path'

/**
 * Playwright E2E Test Configuration
 *
 * Expert-validated configuration from PLAYWRIGHT_TEST_ANALYSIS.md & PLAYWRIGHT_COVERAGE_PLAN.md:
 * - storageState for pre-authenticated tests (faster, more reliable)
 * - Quarantine lane for flaky tests (run nightly, don't block PRs)
 * - P0-A: Deterministic, deploy-blocking tests (must pass 100%)
 * - P0-B: Critical but flaky tests (nightly, external deps)
 * - Core: User journey tests (run on PR)
 * - Smoke: Quick sanity checks (every commit)
 *
 * TEST_TYPE values:
 * - p0a: Deploy-blocking tests only
 * - p0b: Nightly tests only
 * - p0: All P0 tests (p0a + p0b)
 * - core: Core journey tests
 * - smoke: Quick smoke tests
 */

// Auth storage path (matches global-setup.ts)
const AUTH_FILE = path.join(process.cwd(), 'playwright', '.auth', 'user.json')

// EXPERT FIX: Don't check hasAuthFile at config-load time
// The file is created by globalSetup, which runs AFTER config is evaluated.
// Instead, always reference AUTH_FILE when test endpoints are enabled,
// and let globalSetup ensure it exists (or fail loudly).
const useStorageState = process.env.ENABLE_TEST_ENDPOINTS === 'true'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),
  /* Maximum time one test can run for. */
  timeout: process.env.TEST_TYPE === 'p0' ? 60000 : 45000, // P0 tests need more time
  /* Maximum time the whole test suite can run */
  globalTimeout: process.env.TEST_TYPE === 'p0' ? 900000 : 120000, // P0: 15min, Smoke: 2min
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only - but NOT for P0-A (retries mask flakiness) */
  retries: process.env.CI
    ? (process.env.TEST_TYPE === 'p0a' ? 0 : 2)
    : 0,
  /* Opt out of parallel tests to avoid race conditions with Stripe/Supabase */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    // EXPERT FIX: JSON reporter only has outputFile, not outputFolder (was silently ignored)
    ['json', {
      outputFile: process.env.TEST_TYPE === 'p0'
        ? 'test-results/p0-results.json'
        : 'test-results/smoke-results.json',
    }],
    // Add GitHub Actions reporter for CI
    ...(process.env.CI ? [['github']] as const : [])
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || (process.env.TEST_TYPE === 'p0' ? 'http://localhost:3100' : 'http://localhost:3000'),

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',

    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',

    /* Capture video on failure */
    video: 'retain-on-failure',

    /* Maximum time each action can take */
    actionTimeout: 15000,
  },

  /* Configure projects with proper test isolation */
  projects: [
    // Main test suite - must pass, uses pre-authenticated state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // EXPERT FIX: Always set storageState when test endpoints enabled.
        // globalSetup creates the file before tests run.
        ...(useStorageState ? { storageState: AUTH_FILE } : {}),
      },
      // Exclude quarantine tests from main suite
      grepInvert: /@quarantine/,
    },

    // Quarantine lane - for flaky tests (Stripe UI, WebKit oddities)
    // Run nightly, don't block PRs
    // Exit criteria: 3 nights failed = ticket, 7 nights = delete
    {
      name: 'quarantine',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        ...(useStorageState ? { storageState: AUTH_FILE } : {}),
      },
      grep: /@quarantine/,
      retries: 3, // More retries for flaky tests
      // Only run quarantine on nightly or explicit request
      ...(process.env.RUN_QUARANTINE !== 'true' ? { testIgnore: ['**/*'] } : {}),
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.TEST_TYPE === 'p0' ? 'npm run dev:test' : 'npm run dev',
    url: process.env.TEST_TYPE === 'p0' ? 'http://localhost:3100' : 'http://localhost:3000',
    reuseExistingServer: true, // Always reuse existing server for faster test runs
    timeout: 120 * 1000,
    env: {
      ...process.env,
      // EXPERT FIX: Use NEXT_PUBLIC_* so client components can see the value
      NEXT_PUBLIC_TEST_E2E: process.env.TEST_TYPE === 'p0' ? '1' : '0',
      TEST_E2E: process.env.TEST_TYPE === 'p0' ? '1' : '0', // Keep for server-side code
    },
    stdout: 'ignore',
    stderr: 'pipe'
  },

  /* Filter tests based on environment
   * EXPERT FIX: Global grep + project grep are AND'd together.
   * When RUN_QUARANTINE=true, we want @quarantine tests, not @smoke.
   * Otherwise quarantine project's grep: /@quarantine/ would match nothing.
   *
   * Test type grep mapping:
   * - p0a: Deploy-blocking tests (P0-A prefix)
   * - p0b: Nightly tests (P0-B prefix)
   * - p0: All P0 tests (P0-A or P0-B)
   * - core: Core journey tests
   * - smoke: Smoke tests
   */
  grep:
    process.env.TEST_TYPE === 'p0a'
      ? /P0-A/
      : process.env.TEST_TYPE === 'p0b'
        ? /P0-B/
        : process.env.TEST_TYPE === 'p0'
          ? /P0-[AB]/
          : process.env.TEST_TYPE === 'core'
            ? /core-|Core/
            : process.env.RUN_QUARANTINE === 'true'
              ? /@quarantine/
              : /@smoke/,

  /* Test directory patterns */
  testMatch: process.env.TEST_TYPE === 'p0a'
    ? '**/p0-a/*.spec.ts'
    : process.env.TEST_TYPE === 'p0b'
      ? '**/p0-b/*.spec.ts'
      : process.env.TEST_TYPE === 'p0'
        ? '**/p0-{a,b}/*.spec.ts'
        : process.env.TEST_TYPE === 'core'
          ? '**/core/*.spec.ts'
          : undefined, // Default: all tests
})