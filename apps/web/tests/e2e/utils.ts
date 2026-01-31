/**
 * Enhanced E2E test utilities for P0 critical flows
 * Builds upon existing smoke-fixtures and stripe-helpers
 * Expert-validated patterns for shipping-focused testing
 */

import { expect, Page } from '@playwright/test'
import { stripeHelpers, TEST_CARDS } from '../fixtures/stripe-helpers'

// Test user personas for comprehensive coverage
export const TEST_PERSONAS = {
  client_stripe: {
    email: 'client+stripe@test.sheenapps.ai',
    password: 'SmokeTest123!',
    region: 'US',
    paymentProvider: 'stripe'
  },
  client_paymob: {
    email: 'client+paymob@test.sheenapps.ai',
    password: 'SmokeTest123!',
    region: 'EG',
    paymentProvider: 'paymob'
  },
  advisor: {
    email: 'advisor@test.sheenapps.ai',
    password: 'SmokeTest123!',
    role: 'advisor'
  },
  admin: {
    email: 'admin@test.sheenapps.ai',
    password: 'SmokeTest123!',
    role: 'admin'
  }
}

/**
 * Enhanced login helper with test-mode support
 */
export async function login(page: Page, userType: keyof typeof TEST_PERSONAS = 'client_stripe') {
  const user = TEST_PERSONAS[userType]

  await page.goto('/en/auth/login')

  // Set test mode headers for deterministic behavior
  await page.setExtraHTTPHeaders({
    'X-Test-Mode': 'true',
    'X-Debug-Region': 'region' in user ? user.region : 'US',
    'X-Force-Payment-Provider': 'paymentProvider' in user ? user.paymentProvider : 'stripe'
  })

  await page.fill('#email', user.email)
  await page.fill('#password', user.password)
  await page.click('button[type="submit"]')

  // Wait for successful login with longer timeout for test mode
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 15000 })

  // Verify dashboard loads properly
  await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({ timeout: 10000 })
}

/**
 * Enhanced payment flow helper with test webhook support
 */
export async function payWithStripe(page: Page, cardNumber: string = '4242424242424242') {
  console.log('Starting Stripe payment flow...')

  // Should be on Stripe checkout page
  await expect(page).toHaveURL(/checkout\.stripe\.com|stripe/, { timeout: 15000 })
  console.log('Confirmed on Stripe checkout page')

  // EXPERT FIX: Use server-side confirmation in TEST_E2E mode
  const isTestMode = process.env.TEST_E2E === '1' || process.env.NODE_ENV === 'test'
  
  if (isTestMode) {
    console.log('EXPERT FIX: TEST_E2E mode detected, using server-side payment confirmation')
    const { stripeHelpers } = await import('../fixtures/stripe-helpers')
    return await stripeHelpers.confirmPaymentServerSide(page, { 
      number: cardNumber,
      exp_month: 12,
      exp_year: 2030,
      cvc: '123'
    })
  }

  // Wait for page to fully load (non-test mode)
  await page.waitForTimeout(3000)
  
  // 2024-2025 Stripe UI: Check if we're on a payment method selection page first
  const paymentMethodSelectors = [
    '[data-testid="payment-method-selector"]',
    '.PaymentMethodSelector',
    'button:has-text("Card")',
    'button:has-text("Credit card")',
    '[data-value="card"]',
    'input[value="card"]'
  ]

  let paymentMethodSelector = null
  for (const selector of paymentMethodSelectors) {
    try {
      console.log(`Looking for payment method selector: ${selector}`)
      paymentMethodSelector = page.locator(selector).first()
      if (await paymentMethodSelector.isVisible({ timeout: 3000 })) {
        console.log(`Found payment method selector: ${selector}`)
        await paymentMethodSelector.click()
        await page.waitForTimeout(1000)
        break
      }
    } catch (e) {
      console.log(`Payment method selector ${selector} not found, continuing...`)
    }
  }

  // Now try to find email field - newer Stripe might not show email immediately
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

  // If no email field found, proceed directly to card filling
  // Some newer Stripe checkout flows skip email collection initially
  if (emailField) {
    const email = TEST_PERSONAS.client_stripe.email
    console.log(`Filling email: ${email}`)
    await emailField.fill(email)
    await page.waitForTimeout(1000)
  } else {
    console.log('No email field found, proceeding with card details...')
    // Log what we can see for debugging
    const allInputs = await page.locator('input').all()
    console.log(`Found ${allInputs.length} input fields on page`)
    for (let i = 0; i < Math.min(allInputs.length, 5); i++) {
      const inputType = await allInputs[i].getAttribute('type')
      const inputName = await allInputs[i].getAttribute('name')
      const inputId = await allInputs[i].getAttribute('id')
      const inputPlaceholder = await allInputs[i].getAttribute('placeholder')
      console.log(`Input ${i}: type="${inputType}", name="${inputName}", id="${inputId}", placeholder="${inputPlaceholder}"`)
    }
    
    // Take screenshot for debugging but don't fail
    await page.screenshot({ path: 'stripe-modern-ui.png' })
  }

  // Use enhanced card filling from existing helpers
  const testCard = cardNumber === TEST_CARDS.declined.number ? TEST_CARDS.declined : TEST_CARDS.visa
  console.log('Attempting to fill card details...')

  try {
    await stripeHelpers.fillCardElement(page, testCard)
    console.log('Card details filled successfully')
  } catch (error) {
    console.error('Failed to fill card details:', error)

    // Take screenshot for debugging
    await page.screenshot({ path: 'stripe-card-fill-error.png' })

    throw new Error(`Card filling failed: ${error.message}`)
  }

  // Fill billing details if required
  console.log('Checking for billing details section...')
  const nameField = page.locator('#billingName')
  if (await nameField.isVisible({ timeout: 2000 })) {
    console.log('Filling billing details...')
    await nameField.fill('Test User')
    await page.fill('#billingAddressLine1', '123 Test St')
    await page.fill('#billingLocality', 'Test City')
    await page.fill('#billingAdministrativeArea', 'CA')
    await page.fill('#billingPostalCode', '12345')
    await page.selectOption('#billingCountry', 'US')
    console.log('Billing details filled')
  } else {
    console.log('No billing details section found, skipping...')
  }

  // Look for and click the submit button with multiple selector attempts
  console.log('Looking for submit button...')
  const submitSelectors = [
    '[data-testid="submit"]',
    '.SubmitButton',
    'button[type="submit"]',
    'button:has-text("Pay")',
    'button:has-text("Complete")',
    'button:has-text("Subscribe")',
    '[class*="SubmitButton"]',
    '[class*="submit"]'
  ]

  let submitButton = null
  for (const selector of submitSelectors) {
    try {
      submitButton = page.locator(selector).first()
      if (await submitButton.isVisible({ timeout: 2000 })) {
        console.log(`Found submit button with selector: ${selector}`)
        break
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!submitButton || !(await submitButton.isVisible())) {
    console.error('Could not find submit button. Available buttons:')
    const allButtons = await page.locator('button').all()
    for (let i = 0; i < allButtons.length; i++) {
      const buttonText = await allButtons[i].textContent()
      const buttonClass = await allButtons[i].getAttribute('class')
      const buttonType = await allButtons[i].getAttribute('type')
      console.log(`Button ${i}: text="${buttonText}", class="${buttonClass}", type="${buttonType}"`)
    }

    await page.screenshot({ path: 'stripe-no-submit-button.png' })
    throw new Error('Could not find submit button on Stripe checkout page')
  }

  // Submit payment
  console.log('Clicking submit button...')
  await submitButton.click()

  // Wait for payment processing with test-mode timeout
  console.log('Waiting for payment processing completion...')
  await page.waitForURL(/\/(success|dashboard|billing)/, { timeout: 45000 })
  console.log('Payment completed successfully!')
}

/**
 * Enhanced webhook trigger with idempotency
 */
export async function triggerTestWebhook(eventType: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await stripeHelpers.triggerPaymentIntent(eventType as any)
      if (result.success) {
        // Wait for webhook processing in test mode
        await new Promise(resolve => setTimeout(resolve, 3000))
        return result
      }
    } catch (error) {
      console.warn(`Webhook trigger attempt ${i + 1} failed:`, error)
      if (i === retries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

/**
 * Chat testing utilities for real-time features
 */
export async function startChatSession(page: Page, prompt: string) {
  // First create a test project to get workspace access
  const projectName = await createTestProject(page)

  // Should now be in workspace - verify builder chat interface loads
  await expect(page.locator('[data-testid="builder-chat-interface"]')).toBeVisible({ timeout: 10000 })

  // Send initial prompt
  await page.fill('[data-testid="chat-input"]', prompt)
  await page.click('[data-testid="send-button"]')

  // Wait for AI response
  await expect(page.locator('[data-testid="ai-message"]').nth(0)).toBeVisible({ timeout: 30000 })

  return projectName
}

/**
 * Project creation helper for build testing
 */
export async function createTestProject(page: Page, projectName: string = `Test Project ${Date.now()}`) {
  // Navigate to builder to create new project
  await page.goto('/en/builder/new')

  // Should be redirected to project creation flow
  await expect(page.locator('[data-testid="project-name-input"], [data-testid="idea-input"]')).toBeVisible({ timeout: 10000 })

  // Fill project details (may be idea input or project name depending on UI)
  const ideaInput = page.locator('[data-testid="idea-input"]')
  const nameInput = page.locator('[data-testid="project-name-input"]')

  if (await ideaInput.isVisible()) {
    await ideaInput.fill('Create a simple business landing page for our e2e testing')
    await page.click('[data-testid="start-building"], [data-testid="create-project"]')
  } else if (await nameInput.isVisible()) {
    await nameInput.fill(projectName)
    await page.click('[data-testid="confirm-create-button"], [data-testid="create-project"]')
  }

  // Wait for project creation and redirect to workspace
  await expect(page).toHaveURL(/\/builder\/workspace\//, { timeout: 25000 })

  return projectName
}

/**
 * Advisor browsing and hiring flow
 */
export async function browseAndHireAdvisor(page: Page, specialty: string = 'web-development') {
  await page.goto('/en/advisors')

  // Filter by specialty if provided
  if (specialty) {
    await page.selectOption('[data-testid="specialty-filter"]', specialty)
    await page.waitForTimeout(2000) // Wait for filter to apply
  }

  // Select first available advisor
  const advisorCard = page.locator('[data-testid="advisor-card"]').nth(0)
  await expect(advisorCard).toBeVisible({ timeout: 10000 })
  await advisorCard.click()

  // Book advisor
  await page.click('[data-testid="book-advisor-button"]')

  // Fill booking form
  await page.fill('[data-testid="session-description"]', 'Test advisory session')
  await page.click('[data-testid="confirm-booking-button"]')

  // Wait for booking confirmation
  await expect(page.locator('text=Booking confirmed')).toBeVisible({ timeout: 10000 })
}

/**
 * Referral flow testing
 */
export async function generateAndUseReferral(page: Page, referrerEmail: string, refereeEmail: string) {
  // Login as referrer
  await login(page, 'client_stripe')

  // Navigate to referrals page
  await page.goto('/en/dashboard/referrals')

  // Generate referral code
  await page.click('[data-testid="generate-referral-button"]')
  const referralCode = await page.locator('[data-testid="referral-code"]').textContent()

  // Logout and register as referee
  await page.click('[data-testid="user-menu"]')
  await page.click('[data-testid="logout-button"]')

  // Register with referral code
  await page.goto(`/en/auth/register?ref=${referralCode}`)
  await page.fill('[data-testid="email-input"]', refereeEmail)
  await page.fill('[data-testid="password-input"]', 'SmokeTest123!')
  await page.click('[data-testid="register-button"]')

  // Verify referral bonus applied
  await expect(page.locator('text=Referral bonus applied')).toBeVisible({ timeout: 10000 })

  return referralCode
}

/**
 * Project export testing
 */
export async function exportProject(page: Page, format: 'zip' | 'github' = 'zip') {
  // Create a project first to get workspace access
  await createTestProject(page)

  // Should now be in workspace - open export menu
  await page.click('[data-testid="export-button"]')
  await page.click(`[data-testid="export-${format}"]`)

  if (format === 'github') {
    // Fill GitHub details
    await page.fill('[data-testid="github-repo-name"]', `test-export-${Date.now()}`)
    await page.click('[data-testid="confirm-github-export"]')

    // Wait for GitHub sync completion
    await expect(page.locator('text=Exported to GitHub successfully')).toBeVisible({ timeout: 30000 })
  } else {
    // Wait for zip download
    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="confirm-zip-export"]')
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.zip$/)
  }
}

/**
 * Multi-region payment testing helper
 */
export async function testRegionalPayment(page: Page, region: 'US' | 'EG' | 'SA' = 'US') {
  const providerMap = {
    'US': 'stripe',
    'EG': 'paymob',
    'SA': 'moyasar'
  }

  // Set regional headers
  await page.setExtraHTTPHeaders({
    'X-Debug-Region': region,
    'X-Force-Payment-Provider': providerMap[region]
  })

  // Navigate to pricing
  await page.goto('/en/pricing')

  // Verify correct payment provider loads
  await page.click('[data-testid="pro-plan-select"]')

  const provider = providerMap[region]
  if (provider === 'stripe') {
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 })
  } else {
    // For other providers, verify the checkout page loads
    await expect(page.locator(`[data-provider="${provider}"]`)).toBeVisible({ timeout: 15000 })
  }
}

/**
 * SSE/realtime testing utilities
 */
export async function testRealtimeFeatures(page: Page) {
  // Create a project first to get workspace access
  await createTestProject(page)

  // Should now be in workspace - verify SSE connection established
  const sseReady = page.locator('[data-testid="connection-status"][data-status="connected"]')
  await expect(sseReady).toBeVisible({ timeout: 10000 })

  // Test heartbeat functionality
  await page.waitForTimeout(25000) // Wait for heartbeat interval
  await expect(sseReady).toBeVisible() // Should still be connected
}

/**
 * Flake prevention utilities
 */
export async function waitForStableElement(page: Page, selector: string, timeout = 10000) {
  const element = page.locator(selector)

  // Wait for element to be visible
  await expect(element).toBeVisible({ timeout })

  // Wait for element to be stable (wait for animations/layout)
  await page.waitForTimeout(1000)

  return element
}

/**
 * Enhanced error handling and debugging
 */
export async function captureNetworkErrors(page: Page) {
  const errors: string[] = []

  page.on('response', response => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`)
    }
  })

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      errors.push(`Console: ${msg.text()}`)
    }
  })

  return {
    getErrors: () => errors,
    hasErrors: () => errors.length > 0,
    clearErrors: () => errors.length = 0
  }
}

/**
 * Test data cleanup utility
 */
export async function cleanupTestData(page: Page, testId: string) {
  // This would integrate with the cleanup endpoint
  // For now, just log what would be cleaned up
  console.log(`Would cleanup test data for: ${testId}`)

  // In real implementation:
  // await page.request.delete(`/api/test/cleanup/${testId}`)
}
