import { test, expect } from '@playwright/test'

test.describe('Local Builder Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeouts for local testing
    test.setTimeout(300000) // 5 minutes total
  })

  test('Complete Builder Flow: Create → Preview → Update', async ({ page }) => {
    const testEmail = process.env.TEST_EMAIL!
    const testPassword = process.env.TEST_PASSWORD!
    
    // Step 1: Login
    await test.step('Login to application', async () => {
      await page.goto('/en/auth/login')
      
      // Wait for the page to fully load
      await page.waitForLoadState('networkidle')
      
      // Fill in the login form
      await page.fill('input[name="email"]', testEmail)
      await page.fill('input[name="password"]', testPassword)
      
      // Submit the form using server action (wait for navigation)
      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }), // Wait for server action redirect
        page.click('button[type="submit"]')
      ])
      
      // Verify we're logged in by checking we're not still on login page
      const currentUrl = page.url()
      if (currentUrl.includes('/auth/login')) {
        // Check for error messages
        const errorMessage = await page.locator('.text-red-600, .text-red-500, [role="alert"]').textContent()
        throw new Error(`Login failed: ${errorMessage || 'Unknown error'}`)
      }
    })

    // Step 2: Navigate to Builder
    await test.step('Navigate to builder', async () => {
      await page.goto('/en/builder/new')
      
      // Wait for builder interface
      await expect(page.locator('[data-testid="builder-interface"]')).toBeVisible()
    })

    // Step 3: Submit Initial Build
    await test.step('Submit build prompt', async () => {
      const prompt = 'make a plain, simple webpage (no framework or any styling needed) with Hello SheenApps'
      
      await page.fill('[data-testid="prompt-input"]', prompt)
      await page.click('[data-testid="submit-button"]')
      
      // Wait for build to start
      await expect(page.locator('[data-testid="build-progress"]')).toBeVisible()
    })

    // Step 4: Monitor Build Progress
    await test.step('Monitor build status updates', async () => {
      // Wait for progress updates
      await expect(page.locator('[data-testid="status-message"]')).toBeVisible()
      
      // Wait for completion (with generous timeout)
      await expect(page.locator('[data-testid="build-complete"]')).toBeVisible({ 
        timeout: 300000 // 5 minutes
      })
    })

    // Step 5: Verify Preview
    await test.step('Verify preview content', async () => {
      // Wait for preview link
      const previewLink = page.locator('[data-testid="preview-link"]')
      await expect(previewLink).toBeVisible()
      
      // Open and verify preview
      const [previewPage] = await Promise.all([
        page.context().waitForEvent('page'),
        previewLink.click()
      ])
      
      await previewPage.waitForLoadState('networkidle')
      await expect(previewPage.locator('body')).toContainText('Hello SheenApps')
      
      await previewPage.close()
    })

    // Step 6: Wait for Recommendations
    await test.step('Verify recommendations appear', async () => {
      await expect(page.locator('[data-testid="recommendations-section"]')).toBeVisible({ 
        timeout: 60000 
      })
    })

    // Step 7: Test Update Flow
    await test.step('Submit update prompt', async () => {
      const updatePrompt = "Let's change the text from Hello SheenApps to Hello SheenApps & the World"
      
      await page.fill('[data-testid="chat-input"]', updatePrompt)
      await page.click('[data-testid="chat-submit"]')
      
      // Wait for update to complete
      await expect(page.locator('[data-testid="build-complete"]')).toBeVisible({ 
        timeout: 300000 
      })
    })

    // Step 8: Verify Updated Preview
    await test.step('Verify updated content', async () => {
      const previewLink = page.locator('[data-testid="preview-link"]')
      
      const [previewPage] = await Promise.all([
        page.context().waitForEvent('page'),
        previewLink.click()
      ])
      
      await previewPage.waitForLoadState('networkidle')
      await expect(previewPage.locator('body')).toContainText('Hello SheenApps & the World')
      
      await previewPage.close()
    })
  })

  // Quick smoke test
  test('Smoke Test: Services are running', async ({ page }) => {
    await test.step('Check NextJS is responding', async () => {
      await page.goto('/en')
      await expect(page.locator('body')).toBeVisible()
    })

    await test.step('Check Worker health', async () => {
      const workerHealthUrl = process.env.WORKER_HEALTH_URL || 'http://localhost:8081/myhealthz'
      const response = await page.request.get(workerHealthUrl)
      expect(response.status()).toBe(200)
    })
  })
})