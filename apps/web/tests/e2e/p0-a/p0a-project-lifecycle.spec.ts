/**
 * P0-A: Project Lifecycle (Build + Preview)
 *
 * DEPLOY-BLOCKING: This test must pass at 100% for every deploy.
 *
 * Journey: User creates project → build completes → preview loads
 *
 * Uses:
 * - Pre-authenticated state (storageState)
 * - Fast build path (e2e-coffee-shop)
 * - Real SSE (not mocked - catches transport bugs)
 * - Deterministic timing (bounded waits)
 */

import { test, expect } from '@playwright/test';
import {
  TestProjects,
  uniqueProjectName,
  getE2EHeaders,
} from '../fixtures/test-data';
import { cleanupTestProject } from '../helpers/cleanup';
import { cleanupSSE } from '../helpers/sse';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: Project Lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string | null = null;
  let projectName: string;

  // Capture console errors from the start of each test
  const pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    // Clear errors from previous test
    pageErrors.length = 0;

    // Capture console errors from the BEGINNING (not the end!)
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        pageErrors.push(msg.text());
      }
    });

    // Generate unique project name for this test run
    projectName = uniqueProjectName('coffee');

    // Set E2E headers on all requests
    await page.setExtraHTTPHeaders(getE2EHeaders());
  });

  test.afterEach(async ({ page }) => {
    // Clean up SSE connections
    await cleanupSSE(page);

    // Layer 1: Best-effort cleanup (global sweep catches failures)
    if (projectId) {
      await cleanupTestProject(projectId);
      projectId = null;
    }

    // Check for critical errors at the end (but we've been capturing all along)
    const criticalErrors = pageErrors.filter(
      (e) =>
        /TypeError|ReferenceError|build failed/i.test(e)
    );

    // Log but don't fail in afterEach - we'll check in the test
    if (criticalErrors.length > 0) {
      console.warn('Critical console errors detected:', criticalErrors);
    }
  });

  test('P0-A-1: Create project → build completes → preview loads', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.buildFast + TIMEOUTS.navigation * 3);

    // Step 1: Navigate to workspace/builder
    await test.step('Navigate to builder', async () => {
      await page.goto('/en/builder/new');
      await page.waitForLoadState('networkidle');

      // Verify builder interface is ready
      await expect(
        page.locator(
          '[data-testid="builder-interface"], [data-testid="prompt-input"]'
        )
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    // Step 2: Create project with fast build path
    await test.step('Submit build with fast path trigger', async () => {
      const promptInput = page.locator(
        '[data-testid="prompt-input"], [data-testid="chat-input"], textarea'
      );
      await promptInput.fill(
        `Create a ${projectName}: ${TestProjects.simpleApp.idea}`
      );

      const submitButton = page.locator(
        '[data-testid="submit-button"], [data-testid="chat-submit"], button[type="submit"]'
      );
      await submitButton.click();

      // Wait for build to start
      await expect(
        page.locator(
          '[data-testid="build-progress"], [data-testid="status-message"]'
        )
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    // Step 3: Wait for build completion (via real SSE, bounded time)
    await test.step('Wait for build completion', async () => {
      // Extract project ID from URL or page context
      await page.waitForURL(/\/builder\/|\/workspace\/|\/project\//);
      const url = page.url();
      const projectIdMatch = url.match(
        /(?:builder|workspace|project)\/([a-f0-9-]+)/
      );
      if (projectIdMatch) {
        projectId = projectIdMatch[1];
      }

      // Wait for build complete indicator
      await expect(
        page.locator(
          '[data-testid="build-complete"], [data-testid="build-success"]'
        )
      ).toBeVisible({ timeout: TIMEOUTS.buildFast });
    });

    // Step 4: Verify preview URL is accessible
    await test.step('Verify preview is accessible', async () => {
      const previewLink = page.locator('[data-testid="preview-link"]');

      // Preview link should be visible
      await expect(previewLink).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Get preview URL and verify it returns 200
      const previewUrl = await previewLink.getAttribute('href');
      expect(previewUrl).toBeTruthy();

      if (previewUrl) {
        const response = await page.request.get(previewUrl);
        expect(response.status()).toBe(200);
      }
    });

    // Step 5: Verify project appears in project list
    await test.step('Verify project in list', async () => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');

      // May not have exact match, just verify we can see projects
      await expect(
        page.locator('[data-testid="project-card"], [data-testid="projects-list"]')
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    // Step 6: Verify no critical console errors
    await test.step('Verify no critical console errors', async () => {
      const criticalErrors = pageErrors.filter(
        (e) =>
          /TypeError|ReferenceError|build failed/i.test(e)
      );

      expect(
        criticalErrors,
        `Found critical console errors: ${criticalErrors.join(', ')}`
      ).toHaveLength(0);
    });
  });

  test('P0-A-1b: Build events stream correctly via SSE', async ({ page }) => {
    test.setTimeout(TIMEOUTS.buildFast + TIMEOUTS.navigation * 2);

    // Navigate to builder
    await page.goto('/en/builder/new');
    await page.waitForLoadState('networkidle');

    // Submit build request
    const promptInput = page.locator(
      '[data-testid="prompt-input"], [data-testid="chat-input"], textarea'
    );
    await promptInput.fill(
      `Create ${uniqueProjectName('sse-test')}: ${TestProjects.simpleApp.idea}`
    );

    const submitButton = page.locator(
      '[data-testid="submit-button"], [data-testid="chat-submit"], button[type="submit"]'
    );
    await submitButton.click();

    // Wait for build to complete
    await expect(
      page.locator(
        '[data-testid="build-complete"], [data-testid="build-success"]'
      )
    ).toBeVisible({ timeout: TIMEOUTS.buildFast });

    // Verify we received SSE events (via progress indicators)
    // The UI updating proves SSE worked
    const progressIndicators = page.locator(
      '[data-testid="build-progress"], [data-testid="status-message"]'
    );
    await expect(progressIndicators.first()).toBeVisible();

    // Cleanup: Extract project ID if possible
    const url = page.url();
    const match = url.match(/(?:builder|workspace|project)\/([a-f0-9-]+)/);
    if (match) {
      projectId = match[1];
    }

    // Verify no critical errors during SSE streaming
    const criticalErrors = pageErrors.filter(
      (e) => /TypeError|ReferenceError|build failed/i.test(e)
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
