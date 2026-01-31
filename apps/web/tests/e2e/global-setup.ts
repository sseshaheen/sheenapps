/**
 * Global setup for E2E tests
 *
 * Expert-validated pattern from PLAYWRIGHT_TEST_ANALYSIS.md:
 * - Uses browser context (not just API) for reliable auth
 * - Double sanity check: UI shows auth + API calls work
 * - Saves storageState for reuse across all tests
 */

import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// Polyfill crypto.randomUUID for test environments that don't have it
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    randomUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    },
    getRandomValues: (arr: any) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    }
  } as any
}

// Auth storage path
const AUTH_FILE = path.join(process.cwd(), 'playwright', '.auth', 'user.json')

// Test configuration
const TEST_CONFIG = {
  baseURL: process.env.BASE_URL || (process.env.TEST_TYPE === 'p0' ? 'http://localhost:3100' : 'http://localhost:3000'),
  users: {
    default: {
      email: process.env.TEST_EMAIL || 'e2e@test.sheenapps.ai',
      password: process.env.TEST_PASSWORD || 'TestPass123!',
    },
  },
  security: {
    headerName: 'X-Test-Secret',
    secret: process.env.TEST_ENDPOINT_SECRET || 'dev-test-secret-not-for-prod',
  },
}

export default async function globalSetup() {
  console.log('🚀 Starting E2E test setup...')

  // Check if test endpoints are enabled
  const testEndpointsEnabled = process.env.ENABLE_TEST_ENDPOINTS === 'true'

  if (!testEndpointsEnabled) {
    console.log('⚠️ Test endpoints not enabled (ENABLE_TEST_ENDPOINTS !== true)')
    console.log('⚠️ Skipping API-based auth setup - tests will use UI login')
    return async () => {
      console.log('🧹 Cleaning up E2E tests...')
    }
  }

  // Ensure auth directory exists
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  // Check if we already have valid auth state
  if (fs.existsSync(AUTH_FILE)) {
    console.log('📁 Found existing auth state, validating...')
    // Could add validation here, but for now trust it
    // If tests fail auth, delete the file and re-run
  }

  console.log('🔐 Setting up browser-context auth...')

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate first (sets up cookie domain)
    console.log(`📍 Navigating to ${TEST_CONFIG.baseURL}`)
    await page.goto(TEST_CONFIG.baseURL)

    // Step 2: Call test login API
    console.log('🔑 Calling test login API...')
    const loginResponse = await page.request.post(`${TEST_CONFIG.baseURL}/api/test/login`, {
      headers: {
        [TEST_CONFIG.security.headerName]: TEST_CONFIG.security.secret,
        'Content-Type': 'application/json',
        'X-Test-Mode': 'true',
      },
      data: {
        email: TEST_CONFIG.users.default.email,
        password: TEST_CONFIG.users.default.password,
      },
    })

    if (!loginResponse.ok()) {
      const errorText = await loginResponse.text()
      console.error('❌ Login API failed:', loginResponse.status(), errorText)
      throw new Error(`Auth setup failed: ${loginResponse.status()} - ${errorText}`)
    }

    const loginData = await loginResponse.json()
    console.log('✅ Login API succeeded:', { userId: loginData.userId, email: loginData.email })

    // Step 3: SANITY CHECK 1 - UI shows authenticated
    console.log('🔍 Sanity check 1: Verifying UI shows authenticated state...')
    await page.goto(`${TEST_CONFIG.baseURL}/en/dashboard`)

    // Wait for either user menu (authenticated) or redirect to login (not authenticated)
    const authResult = await Promise.race([
      page.locator('[data-testid="user-menu"]').waitFor({ state: 'visible', timeout: 10000 })
        .then(() => 'authenticated'),
      page.waitForURL(/\/auth\/login/, { timeout: 10000 })
        .then(() => 'redirected'),
    ]).catch(() => 'timeout')

    if (authResult !== 'authenticated') {
      console.error('❌ UI sanity check failed: Dashboard shows logged out state')
      console.error(`   Result: ${authResult}`)
      console.error(`   URL: ${page.url()}`)
      throw new Error('Auth setup succeeded but dashboard shows logged out state')
    }
    console.log('✅ Sanity check 1 passed: UI shows authenticated')

    // Step 4: SANITY CHECK 2 - API calls work
    console.log('🔍 Sanity check 2: Verifying API calls work...')
    const apiCheck = await page.request.get(`${TEST_CONFIG.baseURL}/api/projects`, {
      headers: {
        'X-Test-Mode': 'true',
      },
    })

    if (!apiCheck.ok()) {
      console.error('❌ API sanity check failed:', apiCheck.status())
      throw new Error(`Auth setup succeeded but API returns ${apiCheck.status()}`)
    }
    console.log('✅ Sanity check 2 passed: API calls work')

    // Step 5: Save browser storage state
    console.log('💾 Saving auth state to', AUTH_FILE)
    await context.storageState({ path: AUTH_FILE })
    console.log('✅ Auth state saved successfully')

  } catch (error) {
    console.error('❌ Global setup failed:', error)
    throw error
  } finally {
    await browser.close()
  }

  // Return teardown function
  return async () => {
    console.log('🧹 Cleaning up E2E tests...')
    // Could clean up test data here if needed
    // For now, let individual tests handle cleanup
  }
}