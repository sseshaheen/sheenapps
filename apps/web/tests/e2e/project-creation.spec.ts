import { expect, test } from '@playwright/test'
import { BuilderTestHelper } from '../helpers/test-utils'

// Configure sequential execution to prevent concurrent project creation
test.describe.configure({ mode: 'serial' });

test.describe('Project Creation and Update Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeouts for local testing with server actions
    test.setTimeout(600000) // 10 minutes total to account for slow server actions
  })

  test.afterEach(async ({ page }) => {
    // Allow builds to complete before next test to prevent resource conflicts
    try {
      const helper = new BuilderTestHelper(page)
      await helper.waitForBuildComplete()
    } catch (error) {
      // Ignore cleanup errors to not fail tests
      console.log('Test cleanup: Build completion check failed (non-critical)', error)
    }
  })

  test('Project Creation → Update → Verify Changes', async ({ page }) => {
    const helper = new BuilderTestHelper(page)

    // Step 1: Verify authentication (pre-authenticated via setup)
    await test.step('Verify authentication', async () => {
      await helper.verifyAuthenticated()
    })

    // Step 2: Navigate to Builder
    await test.step('Navigate to builder interface', async () => {
      await helper.navigateToBuilder()
    })

    // Step 3: Create Initial Project
    await test.step('Create initial project', async () => {
      // Use unique test data to prevent conflicts
      const testId = Date.now()
      const prompt = `make a plain, simple webpage (no framework or any styling needed) with Hello SheenApps Test ${testId}`

      await helper.submitBuild(prompt)
    })

    // Step 4: Wait for Build Completion
    await test.step('Wait for initial build to complete', async () => {
      await helper.waitForBuildComplete()
    })

    // Step 5: Verify Initial Preview
    await test.step('Verify initial project content', async () => {
      const content = await helper.getPreviewContent()
      expect(content).toContain('Bean There')
    })

    // Step 6: Wait for Recommendations (Optional)
    await test.step('Wait for AI recommendations', async () => {
      try {
        await helper.waitForRecommendations(30000) // 30 second timeout
      } catch (error) {
        // Recommendations might not appear, continue with test
        console.log('Recommendations did not appear, continuing with update test')
      }
    })

    // Step 7: Update Project
    await test.step('Submit project update', async () => {
      const updatePrompt = 'Add a menu section with "Espresso - $3.50" and "Cappuccino - $4.25" and change the shop name to "Bean There, Done That"'

      await helper.submitUpdate(updatePrompt)
    })

    // Step 8: Wait for Update Completion
    await test.step('Wait for update to complete', async () => {
      await helper.waitForBuildComplete()
    })

    // Step 9: Verify Updated Content
    await test.step('Verify updated project content', async () => {
      const content = await helper.getPreviewContent()
      expect(content).toContain('Bean There, Done That')
      expect(content).toContain('Espresso')
      expect(content).toContain('$3.50')
      expect(content).toContain('Cappuccino')
      expect(content).toContain('$4.25')
    })
  })

  test('Quick Project Creation Test', async ({ page }) => {
    const helper = new BuilderTestHelper(page)

    // Verify authentication and create a simple project
    await test.step('Verify auth and create project', async () => {
      await helper.verifyAuthenticated()
      await helper.navigateToBuilder()

      // Use unique test data to prevent conflicts
      const testId = Date.now() + 1000 // Ensure different from first test
      const prompt = `Make a simple "Hello World" webpage with just a heading - Test ${testId}`
      await helper.submitBuild(prompt)
    })

    // Verify creation started
    await test.step('Verify build started', async () => {
      await expect(page.locator('[data-testid="build-progress"]')).toBeVisible()
      await expect(page.locator('[data-testid="status-message"]')).toBeVisible()
    })
  })
})
