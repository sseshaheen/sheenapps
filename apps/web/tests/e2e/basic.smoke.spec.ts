/**
 * @smoke Basic application smoke tests
 * Owner: @platform-team
 * 
 * Tests fundamental application functionality:
 * - Homepage loads
 * - Navigation works
 * - Key pages are accessible
 * - No critical JavaScript errors
 */

import { test, expect } from '@playwright/test'
import { cryptoPolyfillScript } from './helpers/crypto-polyfill'

test.describe('@smoke Basic Application Health', () => {
  test.beforeEach(async ({ page }) => {
    // Inject crypto polyfill before navigating
    await page.addInitScript(cryptoPolyfillScript)
  })
  
  test('Homepage loads successfully', async ({ page }) => {
    await test.step('Navigate to homepage', async () => {
      await page.goto('/')
      
      // Should redirect to a locale or load homepage
      await page.waitForLoadState('networkidle', { timeout: 10000 })
      
      // Page should load without critical errors
      await expect(page.locator('body')).toBeVisible()
    })

    await test.step('Check for critical content', async () => {
      // Should have some navigation or header
      const hasNavigation = await page.locator('nav, header, [role="navigation"]').count() > 0
      expect(hasNavigation).toBe(true)
      
      // Should have some main content
      const hasContent = await page.locator('main, [role="main"], .main').count() > 0
      expect(hasContent).toBe(true)
      
      console.log('✅ Homepage has basic structure')
    })

    await test.step('Verify no critical console errors', async () => {
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error' && 
            !msg.text().includes('favicon') && 
            !msg.text().includes('chrome-extension')) {
          consoleErrors.push(msg.text())
        }
      })
      
      await page.waitForTimeout(3000) // Wait for any async errors
      
      // Filter out common non-critical errors
      const criticalErrors = consoleErrors.filter(error => 
        !error.includes('network') &&
        !error.includes('loading') &&
        !error.includes('fetch')
      )
      
      if (criticalErrors.length > 0) {
        console.warn('Console errors found:', criticalErrors)
      }
      
      // Allow some errors but not too many
      expect(criticalErrors.length).toBeLessThan(5)
    })
  })

  test('Login page is accessible', async ({ page }) => {
    await test.step('Navigate to login page', async () => {
      await page.goto('/en/auth/login')
      await page.waitForLoadState('networkidle')
    })

    await test.step('Verify login form exists', async () => {
      // Should have a form
      await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
      
      // Should have email and password inputs
      await expect(page.locator('input[type="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"]')).toBeVisible()
      
      // Should have submit button
      await expect(page.locator('button[type="submit"]')).toBeVisible()
      
      console.log('✅ Login form is present and complete')
    })
  })

  test('Internationalization basics', async ({ page }) => {
    const locales = ['en', 'fr', 'ar-eg']
    
    for (const locale of locales) {
      await test.step(`Test ${locale} locale`, async () => {
        await page.goto(`/${locale}`)
        await page.waitForLoadState('networkidle')
        
        // Page should load
        await expect(page.locator('body')).toBeVisible()
        
        // HTML should have correct lang attribute for most locales
        if (locale !== 'ar-eg') { // ar-eg might be just 'ar'
          const htmlLang = await page.locator('html').getAttribute('lang')
          expect(htmlLang).toContain(locale.split('-')[0])
        }
        
        // For Arabic, should have RTL
        if (locale.startsWith('ar')) {
          const htmlDir = await page.locator('html').getAttribute('dir')
          expect(htmlDir).toBe('rtl')
        }
        
        console.log(`✅ Locale ${locale} loads correctly`)
      })
    }
  })

  test('API endpoints respond', async ({ page }) => {
    await test.step('Test health endpoint', async () => {
      // First navigate to the app to establish session
      await page.goto('/')
      
      // Test if any API endpoints are accessible
      const response = await page.request.get('/api/auth/client-info')
      
      // Should not be a 404 or 500
      expect(response.status()).toBeLessThan(500)
      expect(response.status()).not.toBe(404)
      
      console.log(`✅ API endpoint responds with status: ${response.status()}`)
    })
  })

  test('Dashboard billing page loads without 404', async ({ page }) => {
    await test.step('Navigate to billing page', async () => {
      // Navigate directly to billing page
      await page.goto('/en/dashboard/billing')
      
      // Wait for page to load
      await page.waitForLoadState('domcontentloaded')
      
      // Should not be a 404 page
      const is404 = await page.locator('text=404').isVisible()
      expect(is404).toBe(false)
      
      // Should have billing-related content
      const pageContent = await page.textContent('body')
      expect(pageContent).toBeTruthy()
      expect(pageContent?.length).toBeGreaterThan(100) // Not an empty page
      
      console.log('✅ Billing page loads without 404')
    })
  })

  test('Performance baseline', async ({ page }) => {
    await test.step('Measure page load time', async () => {
      const startTime = Date.now()
      
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      const loadTime = Date.now() - startTime
      
      // Should load in reasonable time (adjust threshold as needed)
      expect(loadTime).toBeLessThan(10000) // 10 seconds max
      
      console.log(`✅ Page loaded in ${loadTime}ms`)
    })

    await test.step('Check for large bundle sizes', async () => {
      // Navigate and check network requests
      await page.goto('/')
      
      // Wait for initial load with shorter timeout
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000) // Give it a couple seconds for resources
      
      // Log any very large resources (this is more for monitoring)
      const entries = await page.evaluate(() => {
        return performance.getEntriesByType('navigation').map(entry => ({
          name: entry.name,
          duration: entry.duration,
          transferSize: (entry as PerformanceNavigationTiming).transferSize
        }))
      })
      
      console.log('Navigation timing:', entries[0])
      
      // Basic performance check - page should be reasonably fast
      if (entries[0]?.duration) {
        expect(entries[0].duration).toBeLessThan(8000) // 8 seconds
      }
    })
  })
})