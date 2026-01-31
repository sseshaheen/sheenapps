import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Sequential for local testing
  forbidOnly: false,    // Allow .only() for debugging
  retries: 1,           // Retry once on failure
  workers: 1,           // Single worker for local testing (CRITICAL: Prevents concurrent project creation)
  reporter: [
    ['list'],           // Console output
    ['html', { outputFolder: 'playwright-report' }]
  ],
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Slower timeouts for local development
    actionTimeout: 10000,
    navigationTimeout: 30000
  },

  projects: [
    // Setup project - runs first to authenticate
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Main test project - uses pre-authenticated state
    {
      name: 'local-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Use saved authentication state for all tests
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'], // Wait for setup to complete
    }
  ],

  // Don't start web server - our script handles it
  webServer: undefined,
})