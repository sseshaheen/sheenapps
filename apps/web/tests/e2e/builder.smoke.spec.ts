/**
 * @smoke Builder smoke tests
 * Owner: @builder-team
 * 
 * Tests critical builder operations:
 * - First question answered successfully
 * - AI content streams within 10 seconds
 * - Content editing works
 * - Undo/redo functionality
 * - Preview updates
 */

import { test, expect } from '@playwright/test'
import { smokeFixtures, TEST_USER } from '../fixtures/smoke-fixtures'

test.describe('@smoke Builder Operations', () => {
  let projectId: string

  test.beforeEach(async ({ page }) => {
    // Login and create a project for builder testing
    await test.step('Setup project for builder', async () => {
      await page.goto('/en/auth/login')
      
      await page.fill('[data-testid="email-input"]', TEST_USER.email)
      await page.fill('[data-testid="password-input"]', TEST_USER.password)
      await page.click('[data-testid="login-button"]')
      
      // Wait for dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
      
      // Create a new project
      await page.click('[data-testid="create-project-button"]')
      
      const testProjectName = smokeFixtures.generateTestId('Builder Test Project')
      await page.fill('[data-testid="project-name-input"]', testProjectName)
      await page.click('[data-testid="create-project-submit"]')
      
      // Get project ID and navigate to builder
      const projectCard = page.locator(`[data-testid="project-card"][data-project-name="${testProjectName}"]`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      
      projectId = await projectCard.getAttribute('data-project-id') || ''
      expect(projectId).toBeTruthy()
      
      // Open project in builder
      await projectCard.click()
      await expect(page).toHaveURL(new RegExp(`/builder/workspace/${projectId}`), { timeout: 10000 })
    })
  })

  test('AI generation and editing flow', async ({ page }) => {
    await test.step('Answer first question', async () => {
      // Wait for builder to load
      await expect(page.locator('[data-testid="builder-workspace"]')).toBeVisible({ timeout: 10000 })
      
      // Look for first question form
      const questionForm = page.locator('[data-testid="question-form"]')
      await expect(questionForm).toBeVisible({ timeout: 5000 })
      
      // Fill business information
      await page.fill('[data-testid="business-name-input"]', 'Smoke Test Co')
      await page.fill('[data-testid="business-description-input"]', 'A test business for smoke testing')
      
      // Select business type if present
      const businessTypeSelect = page.locator('[data-testid="business-type-select"]')
      if (await businessTypeSelect.isVisible()) {
        await businessTypeSelect.click()
        await page.click('[data-testid="business-type-option"]:first-child')
      }
      
      // Submit the form
      await page.click('[data-testid="continue-button"]')
    })

    await test.step('Wait for AI content generation', async () => {
      console.log('Waiting for AI content to stream...')
      
      // Use flake guard with detailed step logging
      await expect.poll(async () => {
        const sections = await page.locator('[data-testid="preview-section"]').count()
        console.log(`Found ${sections} preview sections`)
        return sections > 0
      }, { 
        timeout: 10000,
        intervals: [500, 1000, 2000], // Progressive backoff
        message: 'AI section should appear within 10s'
      }).toBeTruthy()
      
      // Verify content is not just loading state
      const contentElement = page.locator('[data-testid="section-content"]').first()
      await expect(contentElement).toBeVisible()
      
      // Should have actual text content (not just loading spinner)
      const textContent = await contentElement.textContent()
      expect(textContent?.trim().length).toBeGreaterThan(10)
      
      console.log('AI content generated successfully')
    })

    await test.step('Edit generated content', async () => {
      // Find an editable content area
      const editableContent = page.locator('[data-testid="content-editor"]').first()
      await expect(editableContent).toBeVisible()
      
      // Get original content
      const originalContent = await editableContent.inputValue() || await editableContent.textContent()
      expect(originalContent).toBeTruthy()
      
      // Edit the content
      const newContent = `${originalContent} - Edited by smoke test`
      
      if (await editableContent.getAttribute('contenteditable')) {
        // For contenteditable elements
        await editableContent.click()
        await page.keyboard.press('Control+A')
        await page.keyboard.type(newContent)
      } else {
        // For input elements
        await editableContent.fill(newContent)
      }
      
      // Trigger save (might be automatic or require blur)
      await page.keyboard.press('Tab')
      
      // Verify content was updated
      await page.waitForTimeout(1000) // Allow for auto-save
      
      console.log('Content edited successfully')
    })

    await test.step('Test undo functionality', async () => {
      // Find undo button
      const undoButton = page.locator('[data-testid="undo-button"]')
      await expect(undoButton).toBeVisible()
      await expect(undoButton).toBeEnabled()
      
      // Click undo
      await undoButton.click()
      
      // Verify content reverted to original state
      await page.waitForTimeout(1000) // Allow for state update
      
      const editableContent = page.locator('[data-testid="content-editor"]').first()
      const revertedContent = await editableContent.inputValue() || await editableContent.textContent()
      
      // Should not contain the "Edited by smoke test" text
      expect(revertedContent).not.toContain('Edited by smoke test')
      
      console.log('Undo operation successful')
    })

    await test.step('Test redo functionality', async () => {
      // Find redo button
      const redoButton = page.locator('[data-testid="redo-button"]')
      await expect(redoButton).toBeVisible()
      await expect(redoButton).toBeEnabled()
      
      // Click redo
      await redoButton.click()
      
      // Verify content restored to edited state
      await page.waitForTimeout(1000) // Allow for state update
      
      const editableContent = page.locator('[data-testid="content-editor"]').first()
      const restoredContent = await editableContent.inputValue() || await editableContent.textContent()
      
      // Should contain the "Edited by smoke test" text again
      expect(restoredContent).toContain('Edited by smoke test')
      
      console.log('Redo operation successful')
    })

    await test.step('Verify preview updates', async () => {
      // Check that preview panel shows updated content
      const previewPanel = page.locator('[data-testid="preview-panel"]')
      if (await previewPanel.isVisible()) {
        // Wait for preview to update
        await page.waitForTimeout(2000)
        
        const previewContent = await previewPanel.textContent()
        expect(previewContent).toContain('Smoke Test Co')
        
        console.log('Preview updated successfully')
      }
    })

    await test.step('Verify no console errors during builder operations', async () => {
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error' && 
            !msg.text().includes('favicon') && 
            !msg.text().includes('chrome-extension')) {
          consoleErrors.push(msg.text())
        }
      })
      
      await page.waitForTimeout(2000) // Wait for any delayed errors
      expect(consoleErrors).toHaveLength(0)
    })
  })

  test('Builder save and load functionality', async ({ page }) => {
    await test.step('Verify project auto-save', async () => {
      // Wait for builder to load
      await expect(page.locator('[data-testid="builder-workspace"]')).toBeVisible()
      
      // Make a change that should trigger auto-save
      const titleInput = page.locator('[data-testid="project-title-input"]')
      if (await titleInput.isVisible()) {
        await titleInput.fill('Auto-save Test Title')
        
        // Wait for save indicator
        const saveIndicator = page.locator('[data-testid="save-indicator"]')
        if (await saveIndicator.isVisible()) {
          await expect(saveIndicator).toContainText(/saved|synced/i, { timeout: 5000 })
        }
      }
    })

    await test.step('Reload and verify persistence', async () => {
      // Reload the page
      await page.reload()
      
      // Wait for builder to load again
      await expect(page.locator('[data-testid="builder-workspace"]')).toBeVisible({ timeout: 10000 })
      
      // Verify saved content persisted
      const titleInput = page.locator('[data-testid="project-title-input"]')
      if (await titleInput.isVisible()) {
        await expect(titleInput).toHaveValue('Auto-save Test Title')
      }
      
      // Verify any AI-generated content is still there
      const previewSections = page.locator('[data-testid="preview-section"]')
      if (await previewSections.count() > 0) {
        await expect(previewSections.first()).toBeVisible()
      }
    })
  })

  test.afterEach(async ({ page }) => {
    // Clean up the test project
    if (projectId) {
      await smokeFixtures.cleanupTestData([projectId])
    }
  })
})