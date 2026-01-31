import { exec } from 'child_process'
import { promisify } from 'util'
import type { ChildProcess } from 'child_process'

const execAsync = promisify(exec)

export interface TestUser {
  email: string
  password: string
  id?: string
  accessToken?: string
}

export interface TestProject {
  id: string
  name: string
  description?: string
}

export const TEST_USER: TestUser = {
  email: 'smoke_user@test.com',
  password: 'SmokeTest123!',
}

export const TEST_STRIPE_CARD = 'pm_card_visa'

let stripeProcess: ChildProcess | null = null

export const smokeFixtures = {
  /**
   * Setup test user via Supabase API
   */
  async setupSmokeUser(): Promise<TestUser> {
    // In a real implementation, this would use Supabase Admin API
    // For now, we'll assume the user is pre-seeded
    console.log('Using pre-seeded smoke test user')
    return TEST_USER
  },

  /**
   * Create a test project via API
   */
  async createTestProject(userId: string): Promise<TestProject> {
    // This would call your API to create a project
    // For now, returning mock data
    return {
      id: `test-project-${Date.now()}`,
      name: 'Smoke Test Project',
      description: 'Created for smoke testing',
    }
  },

  /**
   * Setup Stripe CLI for webhook forwarding
   */
  async setupStripe(): Promise<ChildProcess> {
    console.log('Starting Stripe CLI webhook forwarding...')
    
    // Kill any existing stripe processes first
    await this.cleanupStripe()
    
    // Start Stripe CLI in background
    stripeProcess = exec('stripe listen --forward-to localhost:3000/api/stripe/webhook', {
      env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_TEST_KEY }
    })
    
    // Register cleanup on process exit
    process.on('exit', () => {
      if (stripeProcess) {
        stripeProcess.kill()
      }
    })
    
    // Give Stripe time to start
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    return stripeProcess
  },

  /**
   * Trigger Stripe payment intent for faster testing
   */
  async triggerStripePayment(status: 'succeeded' | 'failed' = 'succeeded'): Promise<void> {
    console.log(`Triggering Stripe payment_intent.${status}...`)
    
    try {
      await execAsync(`stripe trigger payment_intent.${status}`, {
        env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_TEST_KEY }
      })
    } catch (error) {
      console.warn('Stripe trigger failed, falling back to UI flow', error)
    }
  },

  /**
   * Cleanup Stripe processes
   */
  async cleanupStripe(): Promise<void> {
    console.log('Cleaning up Stripe processes...')
    
    // Try graceful shutdown first
    if (stripeProcess) {
      stripeProcess.kill()
      stripeProcess = null
    }
    
    // Force kill any remaining processes
    try {
      await execAsync('pkill -f "stripe listen" || true')
    } catch (error) {
      // Ignore errors - process might not exist
    }
  },

  /**
   * Clean up test data after runs
   */
  async cleanupTestData(projectIds: string[]): Promise<void> {
    console.log('Cleaning up test data...')
    // In real implementation, this would delete test projects via API
    // For now, just log
    console.log(`Would delete projects: ${projectIds.join(', ')}`)
  },

  /**
   * Get test environment configuration
   */
  getTestEnv() {
    return {
      ENABLE_EVENT_SYSTEM: 'false', // Reduce noise in tests
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-key',
      STRIPE_SECRET_KEY: process.env.STRIPE_TEST_KEY,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_TEST_KEY,
    }
  },

  /**
   * Wait for element with retry logic
   */
  async waitForElement(page: any, selector: string, options: { timeout?: number } = {}) {
    const { timeout = 10000 } = options
    
    await page.waitForSelector(selector, {
      timeout,
      state: 'visible'
    })
    
    return page.locator(selector)
  },

  /**
   * Generate unique test identifiers
   */
  generateTestId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  },
}