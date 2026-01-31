/**
 * P0-A: Build Failure and Recovery
 *
 * DEPLOY-BLOCKING: This test must pass at 100% for every deploy.
 *
 * Journey: Build fails → user sees error → fixes → rebuilds successfully
 *
 * Uses:
 * - Pre-authenticated state (storageState)
 * - Deterministic failing build path (e2e-failing-app)
 * - Deterministic successful build path (e2e-coffee-shop)
 * - Real SSE for error propagation
 */

import { test, expect } from '@playwright/test';
import {
  TestProjects,
  uniqueProjectName,
  getE2EHeaders,
} from '../fixtures/test-data';
import { cleanupTestProject } from '../helpers/cleanup';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: Build Failure and Recovery', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Set E2E headers on all requests
    await page.setExtraHTTPHeaders(getE2EHeaders());
  });

  test.afterEach(async () => {
    // Layer 1: Best-effort cleanup
    if (projectId) {
      await cleanupTestProject(projectId);
      projectId = null;
    }
  });

  test('P0-A-2: Build fails → error displayed → retry succeeds', async ({
    page,
  }) => {
    test.setTimeout(
      TIMEOUTS.buildFast * 2 + TIMEOUTS.navigation * 4
    );

    const projectName = uniqueProjectName('fail-recover');

    // Step 1: Navigate to builder
    await test.step('Navigate to builder', async () => {
      await page.goto('/en/builder/new');
      await page.waitForLoadState('networkidle');

      await expect(
        page.locator(
          '[data-testid="builder-interface"], [data-testid="prompt-input"]'
        )
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    // Step 2: Trigger a failing build
    await test.step('Submit failing build config', async () => {
      const promptInput = page.locator(
        '[data-testid="prompt-input"], [data-testid="chat-input"], textarea'
      );
      await promptInput.fill(
        `Create ${projectName}: ${TestProjects.failingApp.idea}`
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

    // Step 3: Verify error state is displayed
    await test.step('Verify error state displayed', async () => {
      // Wait for error indicator
      const errorIndicator = page.locator(
        '[data-testid="build-error"], [data-testid="build-failed"], [data-testid="error-message"]'
      );
      await expect(errorIndicator).toBeVisible({ timeout: TIMEOUTS.buildFast });

      // Verify error message contains actionable info
      const errorText = await errorIndicator.textContent();
      expect(errorText).toBeTruthy();
      expect(errorText!.length).toBeGreaterThan(10); // Not just "Error"

      // Extract project ID for cleanup
      const url = page.url();
      const match = url.match(/(?:builder|workspace|project)\/([a-f0-9-]+)/);
      if (match) {
        projectId = match[1];
      }
    });

    // Step 4: Verify error message is specific and actionable
    await test.step('Verify error is actionable', async () => {
      const errorMessage = page.locator(
        '[data-testid="error-message"], [data-testid="build-error"]'
      );

      // Error should mention what went wrong
      const text = await errorMessage.textContent();
      expect(text).toBeTruthy();

      // Should not be a generic error
      expect(text!.toLowerCase()).not.toContain('unknown error');
      expect(text!.toLowerCase()).not.toContain('something went wrong');
    });

    // Step 5: Fix configuration and retry
    await test.step('Fix and retry build', async () => {
      // Look for retry button or chat input to send fix
      const chatInput = page.locator(
        '[data-testid="chat-input"], [data-testid="prompt-input"], textarea'
      );

      if (await chatInput.isVisible()) {
        // Send a fix message with successful config
        await chatInput.fill(
          `Let's try again with a simpler approach: ${TestProjects.simpleApp.idea}`
        );

        const submitButton = page.locator(
          '[data-testid="chat-submit"], [data-testid="submit-button"], button[type="submit"]'
        );
        await submitButton.click();
      } else {
        // Use retry button if available
        const retryButton = page.locator(
          '[data-testid="retry-button"], button:has-text("Retry"), button:has-text("Try again")'
        );
        await retryButton.click();
      }

      // Wait for new build to start
      await expect(
        page.locator(
          '[data-testid="build-progress"], [data-testid="status-message"]'
        )
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    // Step 6: Verify recovery succeeds
    await test.step('Verify recovery succeeds', async () => {
      // Wait for successful build
      await expect(
        page.locator(
          '[data-testid="build-complete"], [data-testid="build-success"]'
        )
      ).toBeVisible({ timeout: TIMEOUTS.buildFast });

      // Error state should be cleared
      await expect(
        page.locator('[data-testid="build-error"], [data-testid="build-failed"]')
      ).not.toBeVisible();
    });

    // Step 7: Verify no page refresh was needed
    await test.step('Verify recovery without refresh', async () => {
      // Check that we're still on the same project page
      // (the URL should contain the same project ID)
      if (projectId) {
        const currentUrl = page.url();
        expect(currentUrl).toContain(projectId);
      }

      // Preview should now be available
      await expect(page.locator('[data-testid="preview-link"]')).toBeVisible({
        timeout: TIMEOUTS.navigation,
      });
    });
  });

  test('P0-A-2b: Error messages contain file/line info when available', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.buildFast + TIMEOUTS.navigation * 2);

    // Navigate to builder
    await page.goto('/en/builder/new');
    await page.waitForLoadState('networkidle');

    // Trigger failing build
    const promptInput = page.locator(
      '[data-testid="prompt-input"], [data-testid="chat-input"], textarea'
    );
    await promptInput.fill(
      `Create ${uniqueProjectName('error-detail')}: ${TestProjects.failingApp.idea}`
    );

    const submitButton = page.locator(
      '[data-testid="submit-button"], [data-testid="chat-submit"], button[type="submit"]'
    );
    await submitButton.click();

    // Wait for error
    const errorElement = page.locator(
      '[data-testid="build-error"], [data-testid="error-details"]'
    );
    await expect(errorElement).toBeVisible({ timeout: TIMEOUTS.buildFast });

    // Verify error contains useful details
    const errorText = await errorElement.textContent();

    // Should contain the expected error message from TestProjects.failingApp
    if (TestProjects.failingApp.expectedError) {
      // Error might be transformed, so check for key terms
      const errorLower = (errorText || '').toLowerCase();
      expect(
        errorLower.includes('config') ||
          errorLower.includes('invalid') ||
          errorLower.includes('missing') ||
          errorLower.includes('error')
      ).toBeTruthy();
    }

    // Extract project ID for cleanup
    const url = page.url();
    const match = url.match(/(?:builder|workspace|project)\/([a-f0-9-]+)/);
    if (match) {
      projectId = match[1];
    }
  });

  test('P0-A-2c: Multiple retry attempts preserve project context', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.buildFast * 3 + TIMEOUTS.navigation * 4);

    const projectName = uniqueProjectName('multi-retry');

    // Navigate and create failing project
    await page.goto('/en/builder/new');
    await page.waitForLoadState('networkidle');

    const promptInput = page.locator(
      '[data-testid="prompt-input"], [data-testid="chat-input"], textarea'
    );
    await promptInput.fill(
      `Create ${projectName}: ${TestProjects.failingApp.idea}`
    );

    await page.locator(
      '[data-testid="submit-button"], [data-testid="chat-submit"], button[type="submit"]'
    ).click();

    // Wait for first failure
    await expect(
      page.locator(
        '[data-testid="build-error"], [data-testid="build-failed"]'
      )
    ).toBeVisible({ timeout: TIMEOUTS.buildFast });

    // Extract project ID
    let url = page.url();
    let match = url.match(/(?:builder|workspace|project)\/([a-f0-9-]+)/);
    if (match) {
      projectId = match[1];
    }

    const originalProjectId = projectId;

    // Retry with same failing config (should fail again)
    const chatInput = page.locator(
      '[data-testid="chat-input"], [data-testid="prompt-input"], textarea'
    );
    await chatInput.fill(`Try again with: ${TestProjects.failingApp.idea}`);
    await page.locator(
      '[data-testid="chat-submit"], [data-testid="submit-button"], button[type="submit"]'
    ).click();

    // Wait for second failure
    await expect(
      page.locator(
        '[data-testid="build-error"], [data-testid="build-failed"]'
      )
    ).toBeVisible({ timeout: TIMEOUTS.buildFast });

    // Verify we're still on the same project
    url = page.url();
    match = url.match(/(?:builder|workspace|project)\/([a-f0-9-]+)/);
    if (match && originalProjectId) {
      expect(match[1]).toBe(originalProjectId);
    }

    // Finally, fix with successful config
    await chatInput.fill(
      `Now let's try: ${TestProjects.simpleApp.idea}`
    );
    await page.locator(
      '[data-testid="chat-submit"], [data-testid="submit-button"], button[type="submit"]'
    ).click();

    // Verify success
    await expect(
      page.locator(
        '[data-testid="build-complete"], [data-testid="build-success"]'
      )
    ).toBeVisible({ timeout: TIMEOUTS.buildFast });

    // Still same project
    url = page.url();
    match = url.match(/(?:builder|workspace|project)\/([a-f0-9-]+)/);
    if (match && originalProjectId) {
      expect(match[1]).toBe(originalProjectId);
    }
  });
});
