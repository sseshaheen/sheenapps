import { Page, expect } from '@playwright/test'

export class BuilderTestHelper {
  constructor(private page: Page) {}

  async verifyAuthenticated() {
    // Verify that we're authenticated by checking /api/auth/me
    console.log('🔍 Verifying authentication state...')
    const response = await this.page.request.get('/api/auth/me')
    const authData = await response.json()
    
    console.log('📊 Auth verification:', {
      status: response.status(),
      isAuthenticated: authData.isAuthenticated,
      email: authData.user?.email,
      isGuest: authData.isGuest
    })
    
    if (!response.ok() || !authData.isAuthenticated) {
      throw new Error(`User not authenticated: ${JSON.stringify(authData)}`)
    }
    
    console.log('✅ Authentication verified for:', authData.user?.email)
  }
  
  async navigateToBuilder() {
    await this.page.goto('/en/builder/new')
    
    // Wait for the authenticated builder interface - look for enabled textarea
    // The textarea should not be disabled and should have the business idea placeholder
    await expect(this.page.locator('textarea:not([disabled])')).toBeVisible({ timeout: 10000 })
    
    // Also check that we don't see the "Please sign in" message
    await expect(this.page.locator('text=Please sign in to start building')).not.toBeVisible()
  }

  async submitBuild(prompt: string) {
    // Fill the business idea textarea
    await this.page.fill('textarea', prompt)
    
    // Click the "Start Building" button (contains sparkles icon and text)
    await this.page.click('button:has-text("Start Building")')
    
    // Wait for either build progress or navigation to workspace
    // The page should redirect to /builder/workspace/{id} on successful project creation
    await Promise.race([
      this.page.waitForURL(/\/builder\/workspace\//, { timeout: 30000 }),
      this.page.locator('[data-testid="build-progress"]').waitFor({ timeout: 30000 })
    ])
  }

  async waitForBuildComplete(timeout = 300000) {
    await expect(this.page.locator('[data-testid="build-complete"]')).toBeVisible({ timeout })
  }

  async getPreviewContent(): Promise<string> {
    const previewLink = this.page.locator('[data-testid="preview-link"]')
    const [previewPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      previewLink.click()
    ])
    
    await previewPage.waitForLoadState('networkidle')
    const content = await previewPage.locator('body').textContent()
    await previewPage.close()
    
    return content || ''
  }

  async submitUpdate(prompt: string) {
    await this.page.fill('[data-testid="chat-input"]', prompt)
    await this.page.click('[data-testid="chat-submit"]')
  }

  async waitForRecommendations(timeout = 60000) {
    await expect(this.page.locator('[data-testid="recommendations-section"]')).toBeVisible({ timeout })
  }

  async verifyServiceHealth() {
    const workerHealthUrl = process.env.WORKER_HEALTH_URL || 'http://localhost:8081/myhealthz'
    const response = await this.page.request.get(workerHealthUrl)
    expect(response.status()).toBe(200)
  }
}

export class TestEnvironment {
  static getTestCredentials() {
    return {
      email: process.env.TEST_EMAIL || 'shady.anwar1@gmail.com',
      password: process.env.TEST_PASSWORD || 'Super1313'
    }
  }

  static getBaseUrl() {
    return process.env.BASE_URL || 'http://localhost:3000'
  }

  static getWorkerHealthUrl() {
    return process.env.WORKER_HEALTH_URL || 'http://localhost:8081/myhealthz'
  }

  static getTestTimeout() {
    return parseInt(process.env.TEST_TIMEOUT || '300000')
  }
}

export const testSelectors = {
  // Auth
  emailInput: 'input[name="email"]',
  passwordInput: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
  
  // Builder Interface
  builderInterface: 'textarea:not([disabled])', // Enabled textarea indicates authenticated builder
  promptInput: 'textarea', // Business idea textarea
  submitButton: 'button:has-text("Start Building")',
  
  // Build Progress
  buildProgress: '[data-testid="build-progress"]',
  statusMessage: '[data-testid="status-message"]',
  buildComplete: '[data-testid="build-complete"]',
  
  // Preview
  previewLink: '[data-testid="preview-link"]',
  
  // Chat
  chatInput: '[data-testid="chat-input"]',
  chatSubmit: '[data-testid="chat-submit"]',
  
  // Recommendations
  recommendationsSection: '[data-testid="recommendations-section"]'
} as const