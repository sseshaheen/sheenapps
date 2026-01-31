/**
 * Authentication Helpers for E2E Tests
 *
 * Provides utilities for handling test authentication.
 *
 * Strategy:
 * - P0-A tests: Use storageState (pre-authenticated, fast)
 * - P0-B tests: Real login flow (tests auth as canary)
 */

import { Page, BrowserContext } from '@playwright/test';
import { SeededUsers, SeededUserType, getE2EHeaders } from '../fixtures/test-data';
import { TIMEOUTS } from './timeouts';

const TEST_SECRET =
  process.env.TEST_ENDPOINT_SECRET || 'dev-test-secret-not-for-prod';

/**
 * Get the origin from the current page URL
 * This ensures we use the correct port (3000 vs 3100 for P0 tests)
 */
function getOrigin(page: Page): string {
  return new URL(page.url()).origin;
}

/**
 * Login via UI (P0-B pattern)
 * Uses real login flow - tests auth as a canary
 */
export async function loginViaUI(
  page: Page,
  user: SeededUserType = 'pro'
): Promise<void> {
  const userData = SeededUsers[user];

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');

  // Fill login form
  await page.getByLabel(/email/i).fill(userData.email);
  await page.getByLabel(/password/i).fill(userData.password);

  // Submit
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: TIMEOUTS.login });

  // Verify user menu is visible (authenticated state)
  await page.locator('[data-testid="user-menu"]').waitFor({
    state: 'visible',
    timeout: TIMEOUTS.navigation,
  });
}

/**
 * Login via test API (faster for setup)
 * Uses test endpoint with secret header
 *
 * Important: Derives origin from page.url() to handle port differences (3000 vs 3100)
 */
export async function loginViaAPI(
  page: Page,
  user: SeededUserType = 'pro'
): Promise<{ userId: string; email: string }> {
  const userData = SeededUsers[user];

  // Navigate first to establish correct origin (handles port 3000 vs 3100)
  await page.goto('/');
  const origin = getOrigin(page);

  const response = await page.request.post(`${origin}/api/test/login`, {
    headers: {
      'X-Test-Secret': TEST_SECRET,
      'Content-Type': 'application/json',
      'X-Test-Mode': 'true',
      ...getE2EHeaders(),
    },
    data: {
      email: userData.email,
      password: userData.password,
    },
  });

  if (!response.ok()) {
    const errorText = await response.text();
    throw new Error(`Login API failed: ${response.status()} - ${errorText}`);
  }

  const result = await response.json();
  return { userId: result.userId, email: result.email };
}

/**
 * Logout via UI
 */
export async function logoutViaUI(page: Page): Promise<void> {
  // Open user menu
  await page.locator('[data-testid="user-menu"]').click();

  // Click logout
  await page.getByRole('menuitem', { name: /log out|sign out/i }).click();

  // Wait for redirect to home or login
  await page.waitForURL(/\/(auth\/login)?$/, { timeout: TIMEOUTS.navigation });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    await page.goto('/en/dashboard');

    const result = await Promise.race([
      page
        .locator('[data-testid="user-menu"]')
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true),
      page.waitForURL(/\/auth\/login/, { timeout: 5000 }).then(() => false),
    ]);

    return result;
  } catch {
    return false;
  }
}

/**
 * Get current user info from the page
 */
export async function getCurrentUser(
  page: Page
): Promise<{ email: string } | null> {
  try {
    // Check if user menu exists
    const userMenu = page.locator('[data-testid="user-menu"]');
    const isVisible = await userMenu.isVisible();

    if (!isVisible) return null;

    const origin = getOrigin(page);

    // Try to get email from user menu or API
    const response = await page.request.get(`${origin}/api/auth/session`, {
      headers: { 'X-Test-Mode': 'true' },
    });

    if (response.ok()) {
      const data = await response.json();
      return { email: data.user?.email || '' };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Ensure user is authenticated before test
 * Uses storageState if available, falls back to API login
 */
export async function ensureAuthenticated(
  page: Page,
  user: SeededUserType = 'pro'
): Promise<void> {
  // Check if already authenticated
  if (await isAuthenticated(page)) {
    return;
  }

  // Try API login
  await loginViaAPI(page, user);
}

/**
 * Create a fresh context with authentication for a specific user
 * Useful for tests that need multiple user sessions
 */
export async function createAuthenticatedContext(
  browser: { newContext: () => Promise<BrowserContext> },
  user: SeededUserType = 'pro'
): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginViaAPI(page, user);
    return context;
  } finally {
    await page.close();
  }
}
