# End-to-End Testing Automation Plan

**Date**: August 2025  
**Purpose**: Automate comprehensive build flow testing to replace manual testing workflow  
**Scope**: Builder flow from login → build → preview → recommendations → updates

## 🎯 Current Manual Testing Workflow

### **Your Current Process:**
1. **Setup**: Open `http://localhost:3000/en/builder/new` in incognito
2. **Auth**: Login with `shady.anwar1@gmail.com` / `Super1313` 
3. **Initial Build**: Submit prompt: "make a plain, simple webpage (no framework or any styling needed) with Hello SheenApps"
4. **Validation**: 
   - Watch sidepanel chat for status updates
   - Verify preview shows "Hello SheenApps" 
   - Wait for recommendations to appear
5. **Update Flow**: Submit update prompt: "Let's change the text from Hello SheenApps to Hello SheenApps & the World"
6. **Final Validation**: Verify new version contains updated text

### **Pain Points:**
- ⏱️ **Time Consuming**: 5-10 minutes per test cycle
- 🔄 **Repetitive**: Same steps every time  
- 🐛 **Error Prone**: Manual verification can miss issues
- 📊 **No Metrics**: No timing or performance data
- 🚫 **No CI/CD**: Can't run automatically on deployments

---

## 🚀 Proposed Automation Strategy

### **Approach 1: Playwright E2E Tests (Recommended)**

#### **Why Playwright?**
- ✅ **Real Browser Testing**: Tests actual user experience
- ✅ **Network Monitoring**: Can intercept and validate API calls
- ✅ **Visual Testing**: Can verify preview content
- ✅ **Cross-Browser**: Test Chrome, Firefox, Safari
- ✅ **CI/CD Ready**: Runs headless in GitHub Actions
- ✅ **Developer Friendly**: TypeScript support, excellent debugging

#### **Test Structure:**
```typescript
// tests/e2e/builder-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Builder Flow End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh session for each test
    await page.goto('/en/builder/new', { waitUntil: 'networkidle' })
  })

  test('Complete Build Flow: Create → Preview → Recommendations → Update', async ({ page }) => {
    // Step 1: Authentication
    await test.step('Login with test account', async () => {
      await page.fill('[data-testid="email-input"]', 'shady.anwar1@gmail.com')
      await page.fill('[data-testid="password-input"]', 'Super1313')
      await page.click('[data-testid="login-button"]')
      
      // Wait for successful login
      await expect(page.locator('[data-testid="builder-interface"]')).toBeVisible()
    })

    // Step 2: Initial Build
    const buildPromise = test.step('Submit initial build prompt', async () => {
      const prompt = 'make a plain, simple webpage (no framework or any styling needed) with Hello SheenApps'
      
      await page.fill('[data-testid="prompt-input"]', prompt)
      await page.click('[data-testid="submit-button"]')
      
      // Monitor build progress
      await expect(page.locator('[data-testid="build-progress"]')).toBeVisible()
      return page.waitForSelector('[data-testid="build-complete"]', { timeout: 300000 }) // 5 min timeout
    })

    // Step 3: Validate Status Updates
    await test.step('Monitor build status updates', async () => {
      // Wait for progress updates to appear
      await expect(page.locator('[data-testid="status-message"]')).toContainText('Building Your App')
      
      // Verify progress phases appear
      const phases = ['Setup', 'Development', 'Dependencies', 'Build', 'Deploy']
      for (const phase of phases) {
        await expect(page.locator('[data-testid="current-phase"]')).toContainText(phase, { timeout: 60000 })
      }
    })

    await buildPromise

    // Step 4: Validate Preview Content
    await test.step('Verify preview content', async () => {
      // Wait for preview URL to be available
      const previewLink = page.locator('[data-testid="preview-link"]')
      await expect(previewLink).toBeVisible()
      
      // Open preview in new tab and verify content
      const [previewPage] = await Promise.all([
        page.context().waitForEvent('page'),
        previewLink.click()
      ])
      
      await previewPage.waitForLoadState('networkidle')
      await expect(previewPage.locator('body')).toContainText('Hello SheenApps')
      
      await previewPage.close()
    })

    // Step 5: Wait for Recommendations
    await test.step('Verify recommendations appear', async () => {
      await expect(page.locator('[data-testid="recommendations-section"]')).toBeVisible({ timeout: 60000 })
      await expect(page.locator('[data-testid="recommendation-card"]')).toHaveCount.greaterThan(0)
    })

    // Step 6: Update Flow
    await test.step('Submit update prompt', async () => {
      const updatePrompt = "Let's change the text from Hello SheenApps to Hello SheenApps & the World"
      
      await page.fill('[data-testid="chat-input"]', updatePrompt)
      await page.click('[data-testid="chat-submit"]')
      
      // Wait for update to complete
      await expect(page.locator('[data-testid="build-complete"]')).toBeVisible({ timeout: 300000 })
    })

    // Step 7: Validate Updated Preview
    await test.step('Verify updated preview content', async () => {
      const previewLink = page.locator('[data-testid="preview-link"]')
      
      const [previewPage] = await Promise.all([
        page.context().waitForEvent('page'),
        previewLink.click()
      ])
      
      await previewPage.waitForLoadState('networkidle')
      await expect(previewPage.locator('body')).toContainText('Hello SheenApps & the World')
      
      await previewPage.close()
    })
  })

  // Additional focused tests
  test('Build Status Updates Performance', async ({ page }) => {
    // Test specifically for status update timing
    const startTime = Date.now()
    
    // Submit build and measure status update frequency
    await submitBuild(page, 'Simple test prompt')
    
    const statusUpdates = []
    const statusLocator = page.locator('[data-testid="status-message"]')
    
    // Monitor status changes
    await statusLocator.waitFor()
    while (await page.locator('[data-testid="build-complete"]').isHidden()) {
      const currentStatus = await statusLocator.textContent()
      statusUpdates.push({
        status: currentStatus,
        timestamp: Date.now() - startTime
      })
      await page.waitForTimeout(1000) // Check every second
    }
    
    // Validate status update frequency (should be ≤3 seconds between updates)
    for (let i = 1; i < statusUpdates.length; i++) {
      const timeDiff = statusUpdates[i].timestamp - statusUpdates[i-1].timestamp
      expect(timeDiff).toBeLessThan(5000) // 5 second max between updates
    }
  })

  test('Error Handling Flow', async ({ page }) => {
    // Test with prompt that might cause errors
    await submitBuild(page, 'Create something impossible that will fail')
    
    // Should handle errors gracefully
    const errorElement = page.locator('[data-testid="build-error"]')
    if (await errorElement.isVisible()) {
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/failed|error/i)
    }
  })
})
```

#### **Test Data Management:**
```typescript
// tests/fixtures/test-data.ts
export const testAccounts = {
  developer: {
    email: 'shady.anwar1@gmail.com',
    password: 'Super1313'
  },
  // Add more test accounts for different scenarios
}

export const testPrompts = {
  simple: 'make a plain, simple webpage (no framework or any styling needed) with Hello SheenApps',
  update: "Let's change the text from Hello SheenApps to Hello SheenApps & the World",
  complex: 'Create a full restaurant website with menu, contact form, and image gallery',
  error_prone: 'Create something with invalid requirements that might fail'
}
```

### **Approach 2: API-Level Testing (Complementary)**

#### **API Integration Tests:**
```typescript
// tests/api/builder-api.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Builder API Integration', () => {
  test('Build Events API Performance', async ({ request }) => {
    // Create a build via API
    const createResponse = await request.post('/api/projects', {
      data: {
        prompt: testPrompts.simple,
        userId: 'test-user-id'
      }
    })
    
    const { projectId, buildId } = await createResponse.json()
    
    // Monitor build events API
    let isComplete = false
    const startTime = Date.now()
    const eventTimes = []
    
    while (!isComplete && Date.now() - startTime < 300000) { // 5 min timeout
      const eventsResponse = await request.get(`/api/builds/${buildId}/events?userId=test-user-id`)
      const { events } = await eventsResponse.json()
      
      eventTimes.push({
        eventCount: events.length,
        timestamp: Date.now() - startTime
      })
      
      isComplete = events.some(e => e.finished)
      
      if (!isComplete) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Poll every 2s
      }
    }
    
    // Validate API performance
    expect(isComplete).toBe(true)
    expect(eventTimes.length).toBeGreaterThan(0)
    
    // Each API call should be fast
    for (const timing of eventTimes) {
      expect(timing.responseTime).toBeLessThan(1000) // <1s response time
    }
  })
})
```

### **Approach 3: Performance Monitoring (Advanced)**

#### **Build Metrics Collection:**
```typescript
// tests/performance/build-metrics.spec.ts
test('Collect Build Performance Metrics', async ({ page }) => {
  const metrics = {
    buildStartTime: 0,
    firstStatusUpdate: 0,
    buildCompleteTime: 0,
    previewLoadTime: 0,
    recommendationsAppearTime: 0,
    updateCompleteTime: 0
  }
  
  // Intercept API calls to measure timing
  page.route('/api/builds/*/events', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    
    if (data.events?.length > 0 && metrics.firstStatusUpdate === 0) {
      metrics.firstStatusUpdate = Date.now() - metrics.buildStartTime
    }
    
    route.fulfill({ response })
  })
  
  // Run complete flow and collect metrics
  metrics.buildStartTime = Date.now()
  await runCompleteBuilderFlow(page)
  
  // Save metrics for analysis
  console.log('Build Performance Metrics:', metrics)
  
  // Assert performance targets
  expect(metrics.firstStatusUpdate).toBeLessThan(5000) // First update within 5s
  expect(metrics.buildCompleteTime).toBeLessThan(300000) // Complete within 5min
  expect(metrics.previewLoadTime).toBeLessThan(3000) // Preview loads within 3s
})
```

---

## 🛠 Implementation Plan

### **Phase 1: Basic E2E Setup (Week 1)**

#### **Day 1-2: Project Setup**
```bash
# Install Playwright
npm install -D @playwright/test

# Generate Playwright config
npx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

#### **Day 3-4: Core Test Implementation**
- [ ] Implement basic login flow test
- [ ] Add build submission and monitoring
- [ ] Create preview validation test
- [ ] Set up test data fixtures

#### **Day 5: Test Data IDs**
Add test IDs to critical UI elements:

```typescript
// In your components, add data-testid attributes
<button data-testid="submit-button" onClick={handleSubmit}>
  Submit
</button>

<div data-testid="build-progress" className="progress-container">
  {/* Progress content */}
</div>

<div data-testid="status-message">
  {currentStatus}
</div>
```

### **Phase 2: Comprehensive Testing (Week 2)**

#### **Advanced Test Scenarios:**
- [ ] Multi-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsive testing
- [ ] Network condition simulation (slow 3G, offline)
- [ ] Error scenario testing
- [ ] Performance benchmarking

#### **Continuous Integration:**
```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 18
    - name: Install dependencies
      run: npm ci
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps
    - name: Run Playwright tests
      run: npx playwright test
      env:
        SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
        SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
    - uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

### **Phase 3: Advanced Features (Week 3-4)**

#### **Visual Regression Testing:**
```typescript
test('Preview Visual Regression', async ({ page }) => {
  await runBuilderFlow(page)
  
  // Capture preview screenshot
  const previewPage = await openPreview(page)
  await expect(previewPage).toHaveScreenshot('hello-sheenapps.png')
})
```

#### **Performance Monitoring:**
```typescript
test('Build Performance Monitoring', async ({ page }) => {
  // Monitor Web Vitals
  const webVitals = await page.evaluate(() => {
    return new Promise((resolve) => {
      new PerformanceObserver((list) => {
        const vitals = {}
        for (const entry of list.getEntries()) {
          vitals[entry.name] = entry.value
        }
        resolve(vitals)
      }).observe({ entryTypes: ['measure'] })
    })
  })
  
  expect(webVitals.LCP).toBeLessThan(2500) // Largest Contentful Paint
  expect(webVitals.FID).toBeLessThan(100)  // First Input Delay
})
```

---

## 🎯 Test Utilities & Helpers

### **Reusable Test Functions:**
```typescript
// tests/helpers/builder-helpers.ts
export class BuilderTestHelper {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="email-input"]', email)
    await this.page.fill('[data-testid="password-input"]', password)
    await this.page.click('[data-testid="login-button"]')
    await expect(this.page.locator('[data-testid="builder-interface"]')).toBeVisible()
  }

  async submitBuild(prompt: string): Promise<string> {
    await this.page.fill('[data-testid="prompt-input"]', prompt)
    await this.page.click('[data-testid="submit-button"]')
    
    // Wait for build to start
    await expect(this.page.locator('[data-testid="build-progress"]')).toBeVisible()
    
    // Extract build ID from URL or API calls
    return this.extractBuildId()
  }

  async waitForBuildComplete(timeout = 300000): Promise<void> {
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

  async monitorBuildProgress(): Promise<BuildProgressData[]> {
    const progressData: BuildProgressData[] = []
    const startTime = Date.now()
    
    while (await this.page.locator('[data-testid="build-complete"]').isHidden()) {
      const status = await this.page.locator('[data-testid="status-message"]').textContent()
      const progress = await this.page.locator('[data-testid="progress-percentage"]').textContent()
      
      progressData.push({
        status: status || '',
        progress: parseInt(progress || '0'),
        timestamp: Date.now() - startTime
      })
      
      await this.page.waitForTimeout(2000) // Check every 2 seconds
    }
    
    return progressData
  }
}
```

### **Test Data Factory:**
```typescript
// tests/fixtures/test-factory.ts
export class TestDataFactory {
  static getRandomPrompt(): string {
    const prompts = [
      'Create a simple landing page for a coffee shop',
      'Make a portfolio website for a photographer',
      'Build a basic blog about cooking',
      'Create a small business website for a yoga studio'
    ]
    return prompts[Math.floor(Math.random() * prompts.length)]
  }

  static getTestAccount(): { email: string, password: string } {
    return {
      email: 'shady.anwar1@gmail.com',
      password: 'Super1313'
    }
  }

  static getUpdatePrompt(originalContent: string): string {
    return `Update the content to add more information about ${originalContent}`
  }
}
```

---

## 📊 Test Reporting & Metrics

### **Custom Test Reporter:**
```typescript
// tests/reporter/build-metrics-reporter.ts
import { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

class BuildMetricsReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (test.title.includes('Builder Flow')) {
      const metrics = this.extractMetrics(result)
      this.logMetrics(metrics)
      this.saveMetrics(metrics)
    }
  }

  private extractMetrics(result: TestResult) {
    // Extract timing data from test execution
    return {
      testName: result.test.title,
      duration: result.duration,
      buildTime: this.extractBuildTime(result),
      apiResponseTimes: this.extractApiTimes(result),
      timestamp: new Date().toISOString()
    }
  }

  private saveMetrics(metrics: any) {
    // Save to database or metrics service
    console.log('Build Test Metrics:', JSON.stringify(metrics, null, 2))
  }
}

export default BuildMetricsReporter
```

### **Performance Assertions:**
```typescript
// tests/assertions/performance-assertions.ts
export function assertPerformance(metrics: BuildMetrics) {
  // Build completion time
  expect(metrics.buildTime).toBeLessThan(300000) // 5 minutes max
  
  // API response times
  expect(metrics.averageApiResponseTime).toBeLessThan(1000) // 1 second max
  
  // Status update frequency
  expect(metrics.statusUpdateInterval).toBeLessThan(5000) // 5 seconds max between updates
  
  // Preview load time
  expect(metrics.previewLoadTime).toBeLessThan(3000) // 3 seconds max
}
```

---

## 🚀 Quick Start Commands

### **Development Testing:**
```bash
# Run all E2E tests
npm run test:e2e

# Run specific test suite
npm run test:e2e -- tests/e2e/builder-flow.spec.ts

# Run with UI (debugging)
npm run test:e2e -- --ui

# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Generate test report
npm run test:e2e -- --reporter=html
```

### **CI/CD Integration:**
```bash
# Run in CI mode (headless, with retries)
npm run test:e2e:ci

# Run specific browser
npm run test:e2e -- --project=chromium

# Run performance tests only
npm run test:e2e -- --grep="Performance"
```

---

## 📈 Success Metrics

### **Automation Goals:**
- ✅ **Time Savings**: Reduce manual testing from 10 minutes to 30 seconds
- ✅ **Coverage**: Test all critical user flows automatically
- ✅ **Reliability**: Catch regressions before they reach users
- ✅ **Performance**: Monitor build times and API response times
- ✅ **CI/CD**: Automated testing on every deployment

### **Quality Targets:**
- 🎯 **Test Execution Time**: <5 minutes for full suite
- 🎯 **Test Reliability**: >95% pass rate in CI
- 🎯 **Coverage**: Test all critical user paths
- 🎯 **Performance Monitoring**: Track build times and API performance
- 🎯 **Developer Productivity**: Quick feedback on changes

---

## 🔄 Future Enhancements

### **Advanced Testing Features:**
- **Multi-user Testing**: Simulate concurrent users
- **Load Testing**: Test system under heavy load
- **Visual AI Testing**: Automated visual regression detection
- **Accessibility Testing**: Automated a11y compliance checks
- **Mobile Testing**: Test on real mobile devices

### **Integration Opportunities:**
- **Monitoring Integration**: Connect test results to Sentry/DataDog
- **Performance Budgets**: Fail tests if performance degrades
- **User Analytics**: Correlate test results with real user data
- **A/B Testing**: Automated testing of feature flags

This comprehensive automation plan will transform your 10-minute manual testing process into a 30-second automated validation that runs continuously and provides rich metrics about your build system's health.