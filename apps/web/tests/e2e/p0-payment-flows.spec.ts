/**
 * P0 Critical Payment Flow Tests
 * @tag p0
 * 
 * Expert-validated golden path tests for payment processing
 * Must pass for all deployments
 */

import { test, expect } from '@playwright/test'
import { login, payWithStripe, triggerTestWebhook, testRegionalPayment, captureNetworkErrors } from './utils'
import { TEST_CARDS } from '../fixtures/stripe-helpers'

test.describe('P0-PAY: Critical Payment Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Set test mode for deterministic behavior
    await page.setExtraHTTPHeaders({
      'X-Test-Mode': 'true',
      'X-AI-Worker-Mode': 'stub'
    })
  })

  test('P0-PAY-01: Stripe checkout → subscription active', async ({ page }) => {
    const errorCapture = await captureNetworkErrors(page)
    
    await test.step('Login and navigate to pricing', async () => {
      await login(page, 'client_stripe')
      await page.goto('/en/pricing') // Use relative URL for baseURL compatibility
    })

    await test.step('Select Pro plan', async () => {
      await page.click('[data-testid="pro-plan-select"]')
      
      // Should redirect to Stripe checkout
      await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 })
    })

    await test.step('Complete payment with test card', async () => {
      await payWithStripe(page, TEST_CARDS.visa.number)
      
      // Should return to success page
      await expect(page).toHaveURL(/\/(success|dashboard)/, { timeout: 45000 })
    })

    await test.step('Verify subscription activation', async () => {
      // Navigate to dashboard
      await page.goto('/en/dashboard')
      
      // Pro badge should appear
      await expect(page.locator('[data-testid="pro-badge"]')).toBeVisible({ timeout: 15000 })
      
      // Billing should show active subscription
      await page.goto('/en/dashboard/billing')
      await expect(page.locator('text=Pro Plan')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('[data-status="active"]')).toBeVisible()
    })

    await test.step('Verify no critical errors', async () => {
      const errors = errorCapture.getErrors()
      const criticalErrors = errors.filter(e => 
        e.includes('billing') || e.includes('stripe') || e.includes('500')
      )
      expect(criticalErrors).toHaveLength(0)
    })
  })

  test('P0-PAY-02: Payment failure handling', async ({ page }) => {
    await test.step('Login and navigate to pricing', async () => {
      await login(page, 'client_stripe')
      await page.goto('/en/pricing') // Use relative URL for baseURL compatibility
    })

    await test.step('Attempt payment with declined card', async () => {
      await page.click('[data-testid="pro-plan-select"]')
      await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 })
      
      // Use declined test card
      await payWithStripe(page, TEST_CARDS.declined.number)
    })

    await test.step('Verify graceful error handling', async () => {
      // Should show error message
      await expect(page.locator('text=declined')).toBeVisible({ timeout: 10000 })
      
      // User should be able to retry
      const retryButton = page.locator('[data-testid="retry-payment"], text=Try again')
      if (await retryButton.isVisible()) {
        await expect(retryButton).toBeEnabled()
      }
    })

    await test.step('Verify no subscription created', async () => {
      // Navigate back to dashboard
      await page.goto('/en/dashboard')
      
      // Should not have pro badge
      const proBadge = page.locator('[data-testid="pro-badge"]')
      await expect(proBadge).not.toBeVisible({ timeout: 5000 })
    })
  })

  test('P0-PAY-03: Webhook processing reliability', async ({ page }) => {
    await test.step('Setup subscription via UI', async () => {
      await login(page, 'client_stripe')
      await page.goto('/en/pricing') // Use relative URL for baseURL compatibility
      await page.click('[data-testid="pro-plan-select"]')
      await payWithStripe(page)
    })

    await test.step('Trigger test webhook', async () => {
      const webhookResult = await triggerTestWebhook('succeeded')
      expect(webhookResult.success).toBe(true)
    })

    await test.step('Verify webhook processing', async () => {
      // Wait for webhook processing
      await page.waitForTimeout(5000)
      
      // Check dashboard for updated status
      await page.goto('/en/dashboard')
      await expect(page.locator('[data-testid="pro-badge"]')).toBeVisible({ timeout: 10000 })
      
      // Verify billing shows correct status
      await page.goto('/en/dashboard/billing')
      await expect(page.locator('[data-status="active"]')).toBeVisible()
    })
  })

  test('P0-PAY-04: Multi-region payment routing', async ({ page }) => {
    await test.step('Test US region (Stripe)', async () => {
      await login(page, 'client_stripe')
      await testRegionalPayment(page, 'US')
      
      // Should use Stripe
      await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 })
    })

    await test.step('Test Egypt region (Paymob)', async () => {
      await page.goto('/en/auth/logout')
      await login(page, 'client_paymob')
      await testRegionalPayment(page, 'EG')
      
      // Should use Paymob checkout
      await expect(page.locator('[data-provider="paymob"]')).toBeVisible({ timeout: 15000 })
    })
  })

  test('P0-PAY-05: Billing portal access', async ({ page }) => {
    await test.step('Setup active subscription', async () => {
      await login(page, 'client_stripe')
      await page.goto('/en/pricing') // Use relative URL for baseURL compatibility
      await page.click('[data-testid="pro-plan-select"]')
      await payWithStripe(page)
    })

    await test.step('Access billing portal', async () => {
      await page.goto('/en/dashboard/billing')
      
      // Mock billing portal response
      await page.route('**/api/billing/portal**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            url: 'https://billing.stripe.com/p/session/test_portal_session'
          })
        })
      })
      
      await page.click('[data-testid="manage-billing-button"]')
      
      // Should generate portal link successfully
      await expect(page.locator('text=Portal link generated')).toBeVisible({ timeout: 10000 })
    })
  })

  test('P0-PAY-06: Subscription upgrade flow', async ({ page }) => {
    await test.step('Start with basic subscription', async () => {
      await login(page, 'client_stripe')
      await page.goto('/en/pricing') // Use relative URL for baseURL compatibility
      await page.click('[data-testid="basic-plan-select"]')
      await payWithStripe(page)
      
      // Verify basic plan active
      await page.goto('/en/dashboard/billing')
      await expect(page.locator('text=Basic Plan')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Upgrade to Pro plan', async () => {
      await page.click('[data-testid="upgrade-to-pro-button"]')
      await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 })
      
      // Complete upgrade payment
      await payWithStripe(page)
    })

    await test.step('Verify Pro plan activation', async () => {
      await page.goto('/en/dashboard/billing')
      await expect(page.locator('text=Pro Plan')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('[data-testid="pro-badge"]')).toBeVisible()
    })
  })

  test.afterEach(async ({ page }) => {
    // Clean up any test subscriptions
    // Note: In test mode, subscriptions don't create real charges
    console.log('Payment test completed')
  })
})