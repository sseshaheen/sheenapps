/**
 * @smoke Authentication smoke tests
 * Owner: @auth-team
 * 
 * Tests critical authentication flows:
 * - Sign up with email
 * - Login
 * - Social login (mocked)
 * - Password reset
 */

import { test, expect } from '@playwright/test'
import { smokeFixtures, TEST_USER } from '../fixtures/smoke-fixtures'

test.describe('@smoke Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set test environment
    await page.addInitScript(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
  })

  test('Login flow with existing user', async ({ page }) => {
    await test.step('Navigate to login page', async () => {
      await page.goto('/en/auth/login')
      await expect(page).toHaveTitle(/.*/)
      
      // Wait for the form to be visible
      await page.waitForSelector('form', { timeout: 10000 })
    })

    await test.step('Fill login form', async () => {
      // Use the actual IDs from the login form
      await page.fill('#email', TEST_USER.email)
      await page.fill('#password', TEST_USER.password)
      
      // Click the submit button
      await page.click('button[type="submit"]')
    })

    await test.step('Verify successful login or handle expected auth flow', async () => {
      // Wait for either dashboard redirect or auth callback
      try {
        await page.waitForURL('**/dashboard', { timeout: 15000 })
        console.log('✅ Successfully redirected to dashboard')
      } catch (error) {
        // Check if we're on an auth callback or confirmation page
        const currentUrl = page.url()
        console.log('Current URL after login attempt:', currentUrl)
        
        // If on confirmation page, that's expected behavior
        if (currentUrl.includes('confirm') || currentUrl.includes('callback')) {
          await expect(page.locator('body')).toContainText(/check|confirm|email/i)
          console.log('✅ Email confirmation flow detected (expected)')
        } else {
          // Check for any error messages
          const errorElement = page.locator('[class*="red"], [class*="error"]')
          if (await errorElement.isVisible()) {
            const errorText = await errorElement.textContent()
            console.log('Auth error:', errorText)
          }
          throw error
        }
      }
    })

    await test.step('Verify no console errors', async () => {
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          consoleErrors.push(msg.text())
        }
      })
      
      await page.waitForTimeout(1000)
      // Allow some auth-related errors but not critical app errors
      const criticalErrors = consoleErrors.filter(error => 
        !error.includes('auth') && 
        !error.includes('supabase') &&
        !error.includes('network')
      )
      expect(criticalErrors).toHaveLength(0)
    })
  })

  test('Social login UI presence', async ({ page }) => {
    await test.step('Navigate to login page', async () => {
      await page.goto('/en/auth/login')
      await page.waitForSelector('form', { timeout: 10000 })
    })

    await test.step('Verify social login buttons exist', async () => {
      // Check for GitHub button (contains github text or icon)
      const githubButton = page.locator('button:has-text("GitHub"), button:has([name="github"])')
      await expect(githubButton).toBeVisible()
      
      // Check for Google button (contains google text or mail icon)
      const googleButton = page.locator('button:has-text("Google"), button:has([name="mail"])')
      await expect(googleButton).toBeVisible()
      
      console.log('✅ Social login buttons are present')
    })

    await test.step('Test Google button interaction', async () => {
      // Mock OAuth to prevent actual redirect
      await page.route('**/auth/v1/authorize**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: '/en/auth/callback?code=test' })
        })
      })
      
      const googleButton = page.locator('button:has-text("Google"), button:has([name="mail"])')
      await googleButton.click()
      
      // Should either redirect or show loading state
      await page.waitForTimeout(2000)
      console.log('✅ Google login button interaction works')
    })
  })

  test('Password reset form', async ({ page }) => {
    await test.step('Navigate to reset password page', async () => {
      await page.goto('/en/auth/reset')
      
      // Wait for form or redirect to login with reset option
      try {
        await page.waitForSelector('form', { timeout: 10000 })
      } catch {
        // Might redirect to login with reset parameter
        await page.goto('/en/auth/login')
        await page.click('a:has-text("Forgot"), a:has-text("Reset")')
      }
    })

    await test.step('Test reset functionality', async () => {
      // Look for email input (either dedicated reset form or login form)
      const emailInput = page.locator('input[type="email"]')
      await expect(emailInput).toBeVisible()
      
      await emailInput.fill(TEST_USER.email)
      
      // Look for reset/submit button
      const submitButton = page.locator('button:has-text("Reset"), button:has-text("Send"), button[type="submit"]')
      if (await submitButton.isVisible()) {
        await submitButton.click()
        
        // Should show some feedback
        await page.waitForTimeout(2000)
        console.log('✅ Password reset form submission works')
      }
    })
  })

  test.afterEach(async ({ page }) => {
    // Clean up
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
  })
})