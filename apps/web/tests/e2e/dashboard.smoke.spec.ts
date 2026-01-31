/**
 * @smoke Dashboard smoke tests
 * Owner: @dashboard-team
 * 
 * Tests critical dashboard operations:
 * - Project creation with toast confirmation
 * - Project renaming with optimistic updates
 * - Project opening to workspace
 * - Project duplication
 * - Project deletion
 */

import { test, expect } from '@playwright/test'
import { smokeFixtures, TEST_USER } from '../fixtures/smoke-fixtures'

test.describe('@smoke Dashboard Operations', () => {
  let projectIds: string[] = []

  test.beforeEach(async ({ page }) => {
    // Login first
    await test.step('Login to dashboard', async () => {
      await page.goto('/en/auth/login')
      
      await page.fill('[data-testid="email-input"]', TEST_USER.email)
      await page.fill('[data-testid="password-input"]', TEST_USER.password)
      await page.click('[data-testid="login-button"]')
      
      // Wait for dashboard to load
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible()
    })
  })

  test('Project CRUD operations', async ({ page }) => {
    let projectName: string
    let renamedProjectName: string

    await test.step('Create new project', async () => {
      projectName = smokeFixtures.generateTestId('Smoke Test Project')
      
      // Click create project button
      await page.click('[data-testid="create-project-button"]')
      
      // Wait for create dialog
      await expect(page.locator('[data-testid="create-project-dialog"]')).toBeVisible()
      
      // Fill project details
      await page.fill('[data-testid="project-name-input"]', projectName)
      await page.fill('[data-testid="project-description-input"]', 'Created by smoke test')
      
      // Submit creation
      await page.click('[data-testid="create-project-submit"]')
      
      // Verify toast confirmation
      await expect(page.locator('[data-testid="toast-notification"]')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=Project created successfully')).toBeVisible()
      
      // Verify project appears in grid
      const projectCard = page.locator(`[data-testid="project-card"][data-project-name="${projectName}"]`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      
      // Store project ID for cleanup
      const projectId = await projectCard.getAttribute('data-project-id')
      if (projectId) {
        projectIds.push(projectId)
      }
    })

    await test.step('Rename project with optimistic update', async () => {
      renamedProjectName = `${projectName} - Renamed`
      
      const projectCard = page.locator(`[data-testid="project-card"][data-project-name="${projectName}"]`)
      
      // Open project menu
      await projectCard.locator('[data-testid="project-menu-button"]').click()
      
      // Click rename option
      await page.click('[data-testid="rename-project-option"]')
      
      // Wait for rename dialog
      await expect(page.locator('[data-testid="rename-project-dialog"]')).toBeVisible()
      
      // Fill new name
      await page.fill('[data-testid="project-name-input"]', renamedProjectName)
      await page.click('[data-testid="rename-project-submit"]')
      
      // Verify optimistic update (should appear immediately)
      await expect(page.locator(`[data-testid="project-card"][data-project-name="${renamedProjectName}"]`)).toBeVisible({ timeout: 2000 })
      
      // Verify toast confirmation
      await expect(page.locator('text=Project renamed successfully')).toBeVisible()
    })

    await test.step('Open project to workspace', async () => {
      const projectCard = page.locator(`[data-testid="project-card"][data-project-name="${renamedProjectName}"]`)
      
      // Click open project
      await projectCard.click()
      
      // Should redirect to workspace
      const projectId = projectIds[0]
      await expect(page).toHaveURL(new RegExp(`/builder/workspace/${projectId}`), { timeout: 10000 })
      
      // Verify workspace loaded
      await expect(page.locator('[data-testid="builder-workspace"]')).toBeVisible({ timeout: 5000 })
      
      // Navigate back to dashboard
      await page.goto('/en/dashboard')
    })

    await test.step('Duplicate project', async () => {
      const projectCard = page.locator(`[data-testid="project-card"][data-project-name="${renamedProjectName}"]`)
      
      // Open project menu
      await projectCard.locator('[data-testid="project-menu-button"]').click()
      
      // Click duplicate option
      await page.click('[data-testid="duplicate-project-option"]')
      
      // Wait for duplication to complete
      await expect(page.locator('text=Project duplicated successfully')).toBeVisible({ timeout: 10000 })
      
      // Verify duplicate appears with "Copy" suffix
      const duplicateName = `${renamedProjectName} (Copy)`
      const duplicateCard = page.locator(`[data-testid="project-card"][data-project-name="${duplicateName}"]`)
      await expect(duplicateCard).toBeVisible({ timeout: 5000 })
      
      // Store duplicate ID for cleanup
      const duplicateId = await duplicateCard.getAttribute('data-project-id')
      if (duplicateId) {
        projectIds.push(duplicateId)
      }
    })

    await test.step('Delete project', async () => {
      // Delete one of the projects
      const projectCard = page.locator(`[data-testid="project-card"][data-project-name="${renamedProjectName}"]`)
      
      // Open project menu
      await projectCard.locator('[data-testid="project-menu-button"]').click()
      
      // Click delete option
      await page.click('[data-testid="delete-project-option"]')
      
      // Confirm deletion in dialog
      await expect(page.locator('[data-testid="delete-confirmation-dialog"]')).toBeVisible()
      await page.click('[data-testid="confirm-delete-button"]')
      
      // Verify project removed from grid immediately (optimistic update)
      await expect(projectCard).not.toBeVisible({ timeout: 5000 })
      
      // Verify toast confirmation
      await expect(page.locator('text=Project deleted successfully')).toBeVisible()
    })

    await test.step('Verify no console errors', async () => {
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          consoleErrors.push(msg.text())
        }
      })
      
      await page.waitForTimeout(2000) // Wait for any delayed errors
      expect(consoleErrors).toHaveLength(0)
    })
  })

  test('Dashboard search and filtering', async ({ page }) => {
    await test.step('Test search functionality', async () => {
      // Create a test project first
      const searchProjectName = smokeFixtures.generateTestId('Searchable Project')
      
      await page.click('[data-testid="create-project-button"]')
      await page.fill('[data-testid="project-name-input"]', searchProjectName)
      await page.click('[data-testid="create-project-submit"]')
      
      // Wait for project to appear
      await expect(page.locator(`[data-testid="project-card"][data-project-name="${searchProjectName}"]`)).toBeVisible()
      
      // Test search
      await page.fill('[data-testid="project-search-input"]', 'Searchable')
      
      // Should show matching project
      await expect(page.locator(`[data-testid="project-card"][data-project-name="${searchProjectName}"]`)).toBeVisible()
      
      // Should hide non-matching projects
      const otherProjects = page.locator('[data-testid="project-card"]:not([data-project-name*="Searchable"])')
      if (await otherProjects.count() > 0) {
        await expect(otherProjects.first()).not.toBeVisible()
      }
      
      // Clear search
      await page.fill('[data-testid="project-search-input"]', '')
      
      // All projects should be visible again
      await expect(page.locator(`[data-testid="project-card"][data-project-name="${searchProjectName}"]`)).toBeVisible()
    })

    await test.step('Test filter functionality', async () => {
      // Test filter dropdown if present
      const filterButton = page.locator('[data-testid="filter-button"]')
      if (await filterButton.isVisible()) {
        await filterButton.click()
        
        // Test "Recent" filter
        await page.click('[data-testid="filter-recent"]')
        
        // Should still show projects (smoke test assumes projects are recent)
        const projectCards = page.locator('[data-testid="project-card"]')
        expect(await projectCards.count()).toBeGreaterThanOrEqual(1)
        
        // Reset filter
        await page.click('[data-testid="filter-all"]')
      }
    })
  })

  test.afterEach(async ({ page }) => {
    // Clean up created projects
    if (projectIds.length > 0) {
      await smokeFixtures.cleanupTestData(projectIds)
      projectIds = []
    }
  })
})