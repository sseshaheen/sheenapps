/**
 * Playwright Authentication Setup
 * Pre-authenticates using server action form submission for reliable E2E testing
 * This approach works correctly with Supabase server-side auth and Next.js server actions
 */

import { test as setup } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
  console.log('🔐 Setting up authentication for E2E tests...')
  
  // Test credentials from environment
  const email = process.env.TEST_EMAIL || 'shady.anwar1@gmail.com'
  const password = process.env.TEST_PASSWORD || 'Super1313'
  
  console.log(`📧 Authenticating with email: ${email}`)
  
  try {
    // Step 1: Navigate to login page
    console.log('🌐 Navigating to login page...')
    await page.goto('/en/auth/login')
    await page.waitForLoadState('networkidle')
    
    // Step 2: Fill and submit the login form (triggers server action)
    console.log('📝 Filling login form...')
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', password)
    
    // Use the specific selector we fixed earlier to avoid multiple button issues
    const submitButton = page.locator('button[type="submit"]:has-text("Sign in")')
    await submitButton.waitFor({ state: 'visible' })
    
    console.log('🚀 Submitting login form (server action)...')
    
    // Submit form and wait for server action to complete
    // Server actions redirect on success, so we wait for navigation
    await Promise.all([
      page.waitForURL(/\/(dashboard|builder)/, { timeout: 30000 }),
      submitButton.click()
    ])
    
    const currentUrl = page.url()
    console.log(`✅ Successfully authenticated, redirected to: ${currentUrl}`)
    
    // Step 3: Verify authentication via API
    console.log('🔍 Verifying authentication state via /api/auth/me...')
    const response = await page.request.get('/api/auth/me')
    const authData = await response.json()
    
    console.log('📊 Auth verification result:', {
      status: response.status(),
      isAuthenticated: authData.isAuthenticated,
      hasUser: !!authData.user,
      userEmail: authData.user?.email,
      isGuest: authData.isGuest
    })
    
    if (!response.ok() || !authData.isAuthenticated) {
      throw new Error(`Authentication verification failed: ${JSON.stringify(authData)}`)
    }
    
    // Step 4: Test protected page access
    console.log('🏗️ Testing builder page access...')
    await page.goto('/en/builder/new')
    await page.waitForLoadState('networkidle')
    
    // Wait for auth state to be established on the page
    await page.waitForTimeout(3000)
    
    const builderUrl = page.url()
    if (builderUrl.includes('/auth/login')) {
      throw new Error('Authentication failed - redirected back to login from builder page')
    }
    
    // Check for authentication indicators on the page
    const hasUserMenu = await page.locator('[data-testid="user-menu"], .user-menu, button:has-text("Sign In")').count()
    console.log(`🔍 User menu elements found: ${hasUserMenu}`)
    
    console.log('✅ Protected page access confirmed')
    
    // Step 5: Save authentication state for reuse
    console.log('💾 Saving authentication state to:', authFile)
    await page.context().storageState({ path: authFile })
    
    console.log('🎉 Authentication setup completed successfully!')
    console.log('📁 Saved auth state includes:')
    
    // Log cookie information for debugging
    const cookies = await page.context().cookies()
    const authCookies = cookies.filter(c => 
      c.name.startsWith('sb-') || 
      c.name === 'app-has-auth' ||
      c.name.includes('auth')
    )
    console.log('🍪 Auth cookies saved:', authCookies.map(c => ({ name: c.name, domain: c.domain, secure: c.secure, httpOnly: c.httpOnly })))
    
  } catch (error) {
    console.error('❌ Authentication setup failed:', error)
    
    // Enhanced debugging information
    const currentUrl = page.url()
    console.log('🌐 Current URL:', currentUrl)
    
    // Check for error messages on the page
    const errorElements = page.locator('.text-red-600, .text-red-500, [role="alert"], .error')
    const errorCount = await errorElements.count()
    if (errorCount > 0) {
      const errorText = await errorElements.first().textContent()
      console.log('🚨 Error message on page:', errorText)
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'playwright-auth-setup-error.png', fullPage: true })
    
    // Check cookies to see if any were set
    const cookies = await page.context().cookies()
    console.log('🍪 Cookies present:', cookies.map(c => c.name))
    
    throw error
  }
})