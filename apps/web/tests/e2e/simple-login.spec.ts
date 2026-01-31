import { test, expect } from '@playwright/test'
import { BuilderTestHelper } from '../helpers/test-utils'

test.describe('Authentication Verification Test', () => {
  test('Verify Pre-Authentication Works', async ({ page }) => {
    test.setTimeout(60000) // 1 minute for verification
    
    console.log('🔍 Starting authentication verification test...')
    
    const helper = new BuilderTestHelper(page)
    
    // Test that we're pre-authenticated via the setup
    await helper.verifyAuthenticated()
    
    // Test navigation to protected pages
    console.log('🏗️ Testing builder page access...')
    await page.goto('/en/builder/new')
    await page.waitForLoadState('networkidle')
    
    // Should not be redirected to login
    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/auth/login')
    console.log(`✅ Successfully accessed builder page: ${currentUrl}`)
    
    // Should see authenticated UI elements
    const hasAuthUI = await page.locator('textarea:not([disabled])').isVisible()
    expect(hasAuthUI).toBe(true)
    console.log('✅ Authenticated UI elements are visible')
    
    console.log('🎉 Pre-authentication verification completed successfully!')
  })
})