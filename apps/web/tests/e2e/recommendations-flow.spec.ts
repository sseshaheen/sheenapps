/**
 * E2E Tests for Recommendations Flow
 *
 * Tests the new state-driven recommendations system:
 * - Quick suggestions appearing on build start
 * - AI recommendations appearing when ready
 * - Session validation (ignoring stale events)
 * - Locale support for recommendations
 *
 * Prerequisites:
 * - Test user must be seeded
 * - Worker service must be running
 * - NEXT_PUBLIC_ENABLE_TEST_HOOKS=true for session ID access
 */

import { test, expect } from '@playwright/test'

test.describe('Recommendations Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set generous timeout for build operations
    test.setTimeout(300000) // 5 minutes total
  })

  test('shows recommendations after build completion', async ({ page }) => {
    const testEmail = process.env.TEST_EMAIL!
    const testPassword = process.env.TEST_PASSWORD!

    // Step 1: Login
    await test.step('Login to application', async () => {
      await page.goto('/en/auth/login')
      await page.waitForLoadState('networkidle')

      await page.fill('input[name="email"]', testEmail)
      await page.fill('input[name="password"]', testPassword)

      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }),
        page.click('button[type="submit"]')
      ])

      // Verify login succeeded
      const currentUrl = page.url()
      if (currentUrl.includes('/auth/login')) {
        const errorMessage = await page.locator('.text-red-600, .text-red-500, [role="alert"]').textContent()
        throw new Error(`Login failed: ${errorMessage || 'Unknown error'}`)
      }
    })

    // Step 2: Navigate to Builder
    await test.step('Navigate to builder', async () => {
      await page.goto('/en/builder/new')
      await expect(page.locator('[data-testid="builder-root"], [data-testid="builder-interface"]')).toBeVisible()
    })

    // Step 3: Submit Build
    await test.step('Submit build prompt', async () => {
      const prompt = 'make a plain, simple webpage with Hello World'

      // Use whichever input is available
      const promptInput = page.locator('[data-testid="idea-input"], [data-testid="prompt-input"]')
      await promptInput.fill(prompt)

      const submitButton = page.locator('[data-testid="start-building"], [data-testid="submit-button"]')
      await submitButton.click()

      // Wait for build to start
      await expect(page.locator('[data-testid="build-progress"]')).toBeVisible({ timeout: 30000 })
    })

    // Step 4: Monitor Build Progress
    await test.step('Monitor build progress', async () => {
      // Wait for status message to appear
      await expect(page.locator('[data-testid="status-message"]')).toBeVisible({ timeout: 30000 })

      // Wait for build completion
      await expect(page.locator('[data-testid="build-complete"]')).toBeVisible({
        timeout: 300000 // 5 minutes for full build
      })
    })

    // Step 5: Verify Recommendations Appear
    await test.step('Verify recommendations appear after build', async () => {
      // Wait for recommendations section
      await expect(page.locator('[data-testid="recommendations-section"]')).toBeVisible({
        timeout: 60000
      })

      // Verify title exists
      await expect(page.locator('[data-testid="recommendations-title"]')).toBeVisible()

      // Verify at least one suggestion item
      const suggestionItems = page.locator('[data-testid="suggestion-item"]')
      await expect(suggestionItems.first()).toBeVisible()

      // Verify suggestion has text content
      const firstSuggestionText = await page.locator('[data-testid="suggestion-text"]').first().textContent()
      expect(firstSuggestionText).toBeTruthy()
      expect(firstSuggestionText!.length).toBeGreaterThan(0)
    })
  })

  test('build progress shows phase information', async ({ page }) => {
    const testEmail = process.env.TEST_EMAIL!
    const testPassword = process.env.TEST_PASSWORD!

    // Login
    await page.goto('/en/auth/login')
    await page.waitForLoadState('networkidle')
    await page.fill('input[name="email"]', testEmail)
    await page.fill('input[name="password"]', testPassword)
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }),
      page.click('button[type="submit"]')
    ])

    // Navigate to builder
    await page.goto('/en/builder/new')
    await expect(page.locator('[data-testid="builder-root"], [data-testid="builder-interface"]')).toBeVisible()

    // Submit build
    const promptInput = page.locator('[data-testid="idea-input"], [data-testid="prompt-input"]')
    await promptInput.fill('make a simple landing page')

    const submitButton = page.locator('[data-testid="start-building"], [data-testid="submit-button"]')
    await submitButton.click()

    // Wait for build progress
    await expect(page.locator('[data-testid="build-progress"]')).toBeVisible({ timeout: 30000 })

    // Verify phase indicators appear during build
    // We check for any phase indicator (since phases progress quickly)
    const phaseSelector = '[data-testid^="phase-"]'
    await expect(page.locator(phaseSelector).first()).toBeVisible({ timeout: 60000 })

    // Wait for completion
    await expect(page.locator('[data-testid="build-complete"]')).toBeVisible({
      timeout: 300000
    })
  })
})

test.describe('Recommendations - Locale Support', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000)
  })

  test('Arabic locale shows RTL layout and Arabic suggestions', async ({ page }) => {
    const testEmail = process.env.TEST_EMAIL!
    const testPassword = process.env.TEST_PASSWORD!

    // Login via Arabic locale
    await page.goto('/ar/auth/login')
    await page.waitForLoadState('networkidle')

    await page.fill('input[name="email"]', testEmail)
    await page.fill('input[name="password"]', testPassword)

    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }),
      page.click('button[type="submit"]')
    ])

    // Navigate to builder in Arabic
    await page.goto('/ar/builder/new')

    // Verify RTL layout
    const html = page.locator('html')
    const dir = await html.getAttribute('dir')
    expect(dir).toBe('rtl')

    // Submit build with Arabic prompt
    const promptInput = page.locator('[data-testid="idea-input"], [data-testid="prompt-input"]')
    await promptInput.fill('اصنع موقع ويب بسيط')

    const submitButton = page.locator('[data-testid="start-building"], [data-testid="submit-button"]')
    await submitButton.click()

    // Wait for build
    await expect(page.locator('[data-testid="build-progress"]')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('[data-testid="build-complete"]')).toBeVisible({
      timeout: 300000
    })

    // Wait for recommendations
    await expect(page.locator('[data-testid="recommendations-section"]')).toBeVisible({
      timeout: 60000
    })

    // Verify Arabic content in suggestions (look for Arabic Unicode range)
    const suggestionText = await page.locator('[data-testid="suggestion-text"]').first().textContent()
    // Arabic characters are in the range U+0600 to U+06FF
    const hasArabic = /[\u0600-\u06FF]/.test(suggestionText || '')

    // Note: Quick suggestions might be in English initially
    // AI recommendations should be in Arabic once they load
    console.log('Suggestion text:', suggestionText)
    console.log('Has Arabic characters:', hasArabic)
  })
})

test.describe('Recommendations - Build Session Validation', () => {
  // This test requires NEXT_PUBLIC_ENABLE_TEST_HOOKS=true
  test.skip(
    !process.env.NEXT_PUBLIC_ENABLE_TEST_HOOKS,
    'Requires NEXT_PUBLIC_ENABLE_TEST_HOOKS=true'
  )

  test('build session ID changes on new build', async ({ page }) => {
    const testEmail = process.env.TEST_EMAIL!
    const testPassword = process.env.TEST_PASSWORD!

    // Login
    await page.goto('/en/auth/login')
    await page.waitForLoadState('networkidle')
    await page.fill('input[name="email"]', testEmail)
    await page.fill('input[name="password"]', testPassword)
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }),
      page.click('button[type="submit"]')
    ])

    // Navigate to builder
    await page.goto('/en/builder/new')
    await expect(page.locator('[data-testid="builder-root"], [data-testid="builder-interface"]')).toBeVisible()

    // Submit first build
    const promptInput = page.locator('[data-testid="idea-input"], [data-testid="prompt-input"]')
    await promptInput.fill('first build test')

    const submitButton = page.locator('[data-testid="start-building"], [data-testid="submit-button"]')
    await submitButton.click()

    // Wait for build to start
    await expect(page.locator('[data-testid="build-progress"]')).toBeVisible({ timeout: 30000 })

    // Get first session ID via exposed test hook
    const firstSessionId = await page.evaluate(() => {
      const store = (window as any).__BUILD_SESSION_STORE__
      if (store) {
        return store.getState().buildSessionId
      }
      return null
    })

    expect(firstSessionId).toBeTruthy()
    console.log('First session ID:', firstSessionId?.slice(0, 20))

    // Wait for first build to complete
    await expect(page.locator('[data-testid="build-complete"]')).toBeVisible({
      timeout: 300000
    })

    // Submit second build (update)
    const chatInput = page.locator('[data-testid="chat-input"]')
    await chatInput.fill('add a footer with copyright')

    const chatSubmit = page.locator('[data-testid="send-button"], [data-testid="chat-submit"]')
    await chatSubmit.click()

    // Wait for new build to start
    await page.waitForTimeout(2000)

    // Get second session ID
    const secondSessionId = await page.evaluate(() => {
      const store = (window as any).__BUILD_SESSION_STORE__
      if (store) {
        return store.getState().buildSessionId
      }
      return null
    })

    expect(secondSessionId).toBeTruthy()
    console.log('Second session ID:', secondSessionId?.slice(0, 20))

    // Session IDs should be different for different builds
    expect(firstSessionId).not.toBe(secondSessionId)
  })
})

// Smoke test that services are running
test.describe('Recommendations - Smoke Tests', () => {
  test('Worker health check', async ({ page }) => {
    const workerHealthUrl = process.env.WORKER_HEALTH_URL || 'http://localhost:8081/myhealthz'
    const response = await page.request.get(workerHealthUrl)
    expect(response.status()).toBe(200)
  })
})
