/**
 * @smoke Billing smoke tests
 * Owner: @revenue-team
 * 
 * Tests critical billing operations:
 * - Stripe checkout flow
 * - Pro badge appears after payment
 * - Billing portal access
 * - Subscription status updates
 */

import { test, expect } from '@playwright/test'
import { smokeFixtures, TEST_USER } from '../fixtures/smoke-fixtures'
import { stripeHelpers, TEST_CARDS } from '../fixtures/stripe-helpers'

test.describe('@smoke Billing Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await test.step('Login to dashboard', async () => {
      await page.goto('/en/auth/login')
      
      await page.fill('[data-testid="email-input"]', TEST_USER.email)
      await page.fill('[data-testid="password-input"]', TEST_USER.password)
      await page.click('[data-testid="login-button"]')
      
      // Wait for dashboard to load
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
    })

    // Setup Stripe webhook forwarding for real-time events
    // Note: This would be implemented for full integration testing
    console.log('Would setup Stripe webhook forwarding')
  })

  test('Stripe checkout flow with test card', async ({ page }) => {
    await test.step('Navigate to pricing/upgrade page', async () => {
      // Look for upgrade button in dashboard
      const upgradeButton = page.locator('[data-testid="upgrade-button"], [data-testid="pro-plan-button"]')
      
      if (await upgradeButton.count() > 0) {
        await upgradeButton.first().click()
      } else {
        // Navigate directly to pricing page
        await page.goto('/en/pricing')
      }
      
      // Should be on pricing page
      await expect(page).toHaveURL(/\/(pricing|billing|upgrade)/)
    })

    await test.step('Select Pro plan', async () => {
      // Find Pro plan selection
      const proButton = page.locator('[data-testid="pro-plan-select"], [data-testid="select-pro"]')
      await expect(proButton.first()).toBeVisible({ timeout: 5000 })
      await proButton.first().click()
    })

    await test.step('Complete Stripe checkout', async () => {
      // Should redirect to Stripe checkout
      await expect(page).toHaveURL(/checkout\.stripe\.com|stripe/, { timeout: 10000 })
      
      // Wait for Stripe form to load - try multiple selectors for email field
      const emailSelectors = [
        '#email',                           // Legacy selector
        '[data-testid="email"]',            // New test ID selector
        'input[name="email"]',              // Name attribute
        'input[type="email"]',              // Type attribute
        '[placeholder*="email" i]',         // Placeholder contains "email" (case insensitive)
        '[placeholder*="Email"]'            // Placeholder contains "Email"
      ]

      let emailField = null
      for (const selector of emailSelectors) {
        try {
          console.log(`Trying email selector: ${selector}`)
          await page.waitForSelector(selector, { timeout: 3000 })
          emailField = page.locator(selector).first()
          if (await emailField.isVisible({ timeout: 2000 })) {
            console.log(`Found email field with selector: ${selector}`)
            break
          }
        } catch (e) {
          console.log(`Email selector ${selector} failed, trying next...`)
          emailField = null
        }
      }

      if (!emailField) {
        console.error('Could not find email field. Available input fields:')
        const allInputs = await page.locator('input').all()
        for (let i = 0; i < allInputs.length; i++) {
          const inputType = await allInputs[i].getAttribute('type')
          const inputName = await allInputs[i].getAttribute('name')
          const inputId = await allInputs[i].getAttribute('id')
          const inputPlaceholder = await allInputs[i].getAttribute('placeholder')
          console.log(`Input ${i}: type="${inputType}", name="${inputName}", id="${inputId}", placeholder="${inputPlaceholder}"`)
        }
        
        await page.screenshot({ path: 'billing-stripe-no-email-field.png' })
        throw new Error('Could not find email field on Stripe checkout page')
      }

      // Fill customer email
      await emailField.fill(TEST_USER.email)
      
      // Fill payment information using test card
      await stripeHelpers.fillCardElement(page, TEST_CARDS.visa)
      
      // Fill additional required fields
      const nameField = page.locator('#billingName')
      if (await nameField.isVisible()) {
        await nameField.fill('Smoke Test User')
      }
      
      const addressField = page.locator('#billingAddressLine1')
      if (await addressField.isVisible()) {
        await addressField.fill('123 Test Street')
        await page.fill('#billingAddressLine2', '')
        await page.fill('#billingLocality', 'Test City')
        await page.fill('#billingAdministrativeArea', 'CA')
        await page.fill('#billingPostalCode', '12345')
        await page.selectOption('#billingCountry', 'US')
      }
      
      // Submit payment
      await page.click('[data-testid="submit"], .SubmitButton')
      
      // Wait for payment to process
      console.log('Processing payment...')
      
      // Should redirect back to success page
      await expect(page).toHaveURL(/\/(success|dashboard|billing)/, { timeout: 30000 })
    })

    await test.step('Verify Pro badge appears', async () => {
      // Navigate to dashboard if not already there
      if (!page.url().includes('dashboard')) {
        await page.goto('/en/dashboard')
      }
      
      // Wait for page to fully load
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible()
      
      // Look for Pro badge/indicator
      await expect.poll(async () => {
        const proBadge = page.locator('[data-testid="pro-badge"], [data-testid="subscription-status"]')
        const isVisible = await proBadge.isVisible()
        const text = isVisible ? await proBadge.textContent() : ''
        console.log(`Pro badge visible: ${isVisible}, text: ${text}`)
        return isVisible && (text?.includes('Pro') || text?.includes('Premium'))
      }, {
        timeout: 15000,
        intervals: [1000, 2000],
        message: 'Pro badge should appear after successful payment'
      }).toBeTruthy()
      
      console.log('Pro badge verified successfully')
    })

    await test.step('Verify subscription status in UI', async () => {
      // Check user menu or settings for subscription details
      const userMenu = page.locator('[data-testid="user-menu-button"]')
      if (await userMenu.isVisible()) {
        await userMenu.click()
        
        const subscriptionItem = page.locator('[data-testid="subscription-menu-item"]')
        if (await subscriptionItem.isVisible()) {
          await subscriptionItem.click()
          
          // Should show subscription details
          await expect(page.locator('text=Pro Plan')).toBeVisible({ timeout: 5000 })
          await expect(page.locator('text=Active')).toBeVisible()
        }
      }
    })
  })

  test('Dashboard billing navigation loads successfully', async ({ page }) => {
    await test.step('Navigate to billing from dashboard', async () => {
      // Click billing nav item in dashboard sidebar
      const billingNavItem = page.locator('[data-testid="nav-billing"], a[href*="/dashboard/billing"]')
      await expect(billingNavItem).toBeVisible({ timeout: 5000 })
      await billingNavItem.click()
      
      // Should navigate to billing page
      await expect(page).toHaveURL(/\/dashboard\/billing/, { timeout: 10000 })
      
      // Verify billing page loads correctly
      await expect(page.locator('h1:has-text("Billing & Subscription")')).toBeVisible({ timeout: 5000 })
      
      // Verify key elements are present
      await expect(page.locator('text=Current Plan')).toBeVisible()
      await expect(page.locator('text=Usage')).toBeVisible()
      
      // Check for loading or error states
      const loadingSpinner = page.locator('[data-testid="loading-spinner"], .loading-spinner')
      if (await loadingSpinner.isVisible()) {
        // Wait for loading to complete
        await expect(loadingSpinner).not.toBeVisible({ timeout: 10000 })
      }
      
      // Ensure no error messages
      const errorMessage = page.locator('[data-testid="error-message"], .error-message')
      expect(await errorMessage.isVisible()).toBe(false)
    })
  })

  test('Billing portal access', async ({ page }) => {
    await test.step('Navigate to billing settings', async () => {
      // Navigate directly to billing page
      await page.goto('/en/dashboard/billing')
      
      // Should be on billing page
      await expect(page).toHaveURL(/\/dashboard\/billing/)
    })

    await test.step('Generate billing portal link', async () => {
      // Look for manage billing button
      const manageButton = page.locator('[data-testid="manage-billing-button"], [data-testid="billing-portal-button"]')
      await expect(manageButton.first()).toBeVisible({ timeout: 5000 })
      
      // Mock the portal URL generation (don't actually navigate)
      await page.route('**/api/billing/portal**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            url: 'https://billing.stripe.com/p/session/test_portal_session'
          })
        })
      })
      
      // Click manage billing (should generate portal link)
      await manageButton.first().click()
      
      // Should show success message or modal
      await expect(page.locator('text=Portal link generated')).toBeVisible({ timeout: 5000 })
    })
  })

  test('Subscription webhook handling', async ({ page }) => {
    await test.step('Trigger subscription webhook', async () => {
      // Use Stripe CLI to trigger webhook
      const webhookResult = await stripeHelpers.triggerPaymentIntent('succeeded')
      expect(webhookResult.success).toBe(true)
      
      console.log('Subscription webhook triggered')
    })

    await test.step('Verify webhook processing', async () => {
      // Navigate to dashboard to check updated status
      await page.goto('/en/dashboard')
      
      // Wait for any webhook processing to complete
      await page.waitForTimeout(3000)
      
      // Check for any error messages
      const errorMessage = page.locator('[data-testid="error-message"]')
      if (await errorMessage.isVisible()) {
        const errorText = await errorMessage.textContent()
        console.warn('Error message found:', errorText)
      }
      
      // Should not have any critical errors
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          consoleErrors.push(msg.text())
        }
      })
      
      await page.waitForTimeout(2000)
      expect(consoleErrors.filter(e => e.includes('billing') || e.includes('stripe'))).toHaveLength(0)
    })
  })

  test.afterEach(async ({ page }) => {
    // Clean up Stripe processes
    // Note: This would cleanup Stripe CLI processes in real implementation
    console.log('Would cleanup Stripe processes')
    
    // Note: In real implementation, you might want to cancel test subscriptions
    // For smoke tests, we use test mode which doesn't charge real money
  })
})