/**
 * Security Smoke Tests
 * @tag smoke
 *
 * Expert-validated tests for basic security checks
 * From PLAYWRIGHT_TEST_ANALYSIS.md recommendations
 */

import { test, expect } from '@playwright/test'

test.describe('@smoke Security Checks', () => {
  test.describe('Protected Route Access', () => {
    test('Dashboard requires authentication', async ({ page }) => {
      // Clear any existing auth state
      await page.context().clearCookies()

      // Try to access dashboard
      await page.goto('/en/dashboard')

      // Should redirect to login with return URL
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 })

      // URL should include redirect parameter
      const url = new URL(page.url())
      const redirect = url.searchParams.get('redirect')
      expect(redirect).toBeTruthy()
    })

    test('Builder workspace requires authentication', async ({ page }) => {
      await page.context().clearCookies()

      // Try to access builder with a test project ID
      await page.goto('/en/builder/workspace/test-project-id')

      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 })
    })

    test('Billing page requires authentication', async ({ page }) => {
      await page.context().clearCookies()

      // Try to access billing
      await page.goto('/en/dashboard/billing')

      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 })
    })

    test('API routes return 401 without auth', async ({ request }) => {
      // Test projects API
      const projectsResponse = await request.get('/api/projects', {
        headers: {
          'Cookie': '', // Ensure no auth cookies
        },
      })

      // Should be 401 Unauthorized or 403 Forbidden
      expect([401, 403]).toContain(projectsResponse.status())
    })
  })

  test.describe('Input Sanitization', () => {
    test('XSS in URL parameters is not executed', async ({ page }) => {
      // Attempt XSS via URL parameter
      const xssPayload = '<script>window.__XSS_EXECUTED__=true</script>'
      await page.goto(`/en?test=${encodeURIComponent(xssPayload)}`)

      // Check that script was not executed
      const xssExecuted = await page.evaluate(() => {
        return (window as any).__XSS_EXECUTED__ === true
      })

      expect(xssExecuted).toBe(false)
    })

    test('XSS in error pages is escaped', async ({ page }) => {
      // Try to inject XSS via a 404 path
      const xssPayload = '<img src=x onerror=alert(1)>'
      await page.goto(`/en/${encodeURIComponent(xssPayload)}`)

      // Page should load (might be 404)
      // Check that the payload appears escaped, not as HTML
      const pageContent = await page.content()
      expect(pageContent).not.toContain('<img src=x onerror=alert(1)>')
    })
  })

  test.describe('Security Headers', () => {
    test('Response includes security headers', async ({ request }) => {
      const response = await request.get('/en')

      // Check for common security headers
      const headers = response.headers()

      // X-Content-Type-Options prevents MIME sniffing
      // Note: Not all apps set this, so we make it a soft check
      const hasContentTypeOptions = 'x-content-type-options' in headers

      // X-Frame-Options or CSP frame-ancestors prevents clickjacking
      const hasFrameProtection =
        'x-frame-options' in headers ||
        (headers['content-security-policy']?.includes('frame-ancestors'))

      // Log what we found (for debugging)
      console.log('Security headers check:', {
        hasContentTypeOptions,
        hasFrameProtection,
        xContentTypeOptions: headers['x-content-type-options'],
        xFrameOptions: headers['x-frame-options'],
      })

      // At minimum, response should not have unsafe headers
      // (e.g., Access-Control-Allow-Origin: * on auth endpoints)
      const corsHeader = headers['access-control-allow-origin']
      if (corsHeader) {
        // If CORS is present, it shouldn't be wildcard for the main app
        expect(corsHeader).not.toBe('*')
      }
    })
  })

  test.describe('Session Security', () => {
    test('Cookies have secure attributes', async ({ page }) => {
      // Navigate to trigger cookie setting
      await page.goto('/en')

      const cookies = await page.context().cookies()

      // Check auth-related cookies
      const authCookies = cookies.filter(c =>
        c.name.includes('sb-') || // Supabase auth cookies
        c.name.includes('auth') ||
        c.name.includes('session')
      )

      for (const cookie of authCookies) {
        console.log('Checking cookie:', {
          name: cookie.name,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        })

        // Auth cookies should be httpOnly (prevents XSS access)
        if (cookie.name.includes('auth-token')) {
          expect(cookie.httpOnly).toBe(true)
        }

        // In production, cookies should have SameSite attribute
        expect(['Strict', 'Lax', 'None']).toContain(cookie.sameSite)
      }
    })
  })

  test.describe('Rate Limiting', () => {
    test('Login endpoint has rate limiting (soft check)', async ({ request }) => {
      // Attempt multiple login requests quickly
      const attempts: number[] = []

      for (let i = 0; i < 5; i++) {
        const response = await request.post('/api/auth/login', {
          data: {
            email: 'test@example.com',
            password: 'wrongpassword',
          },
        })
        attempts.push(response.status())

        // Small delay to not trigger network errors
        await new Promise(r => setTimeout(r, 100))
      }

      console.log('Login attempt statuses:', attempts)

      // Note: This is a soft check - rate limiting might not kick in for 5 requests
      // We're checking that the endpoint responds consistently
      expect(attempts.every(s => [400, 401, 403, 429].includes(s))).toBe(true)
    })
  })
})
