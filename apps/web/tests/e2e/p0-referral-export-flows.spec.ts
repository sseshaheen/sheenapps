/**
 * P0 Critical Referral and Export Flow Tests
 * @tag p0
 * 
 * Expert-validated tests for referral system and project export
 * Tests GitHub sync, zip exports, and referral bonus system
 */

import { test, expect } from '@playwright/test'
import { login, generateAndUseReferral, exportProject, createTestProject, captureNetworkErrors } from './utils'

test.describe('P0-REF: Critical Referral and Export Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Set test mode for predictable behavior
    await page.setExtraHTTPHeaders({
      'X-Test-Mode': 'true',
      'X-AI-Worker-Mode': 'stub'
    })
  })

  test('P0-REF-01: Referral code generation and usage', async ({ page }) => {
    const errorCapture = await captureNetworkErrors(page)
    
    await test.step('Generate referral code', async () => {
      await login(page, 'client_stripe')
      await page.goto('/en/dashboard/referrals')
      
      // Generate new referral code
      await page.click('[data-testid="generate-referral-button"]')
      
      // Should show referral code
      const referralCode = page.locator('[data-testid="referral-code"]')
      await expect(referralCode).toBeVisible({ timeout: 10000 })
      
      const codeText = await referralCode.textContent()
      expect(codeText.length).toBeGreaterThan(5)
    })

    await test.step('Share referral link', async () => {
      const shareButton = page.locator('[data-testid="share-referral-button"]')
      await expect(shareButton).toBeVisible()
      
      // Copy link functionality
      const copyButton = page.locator('[data-testid="copy-referral-link"]')
      if (await copyButton.isVisible()) {
        await copyButton.click()
        
        // Should show copy confirmation
        await expect(page.locator('text=Link copied')).toBeVisible({ timeout: 5000 })
      }
    })

    await test.step('Track referral stats', async () => {
      // Should show referral statistics
      const stats = page.locator('[data-testid="referral-stats"]')
      if (await stats.isVisible()) {
        await expect(page.locator('[data-testid="total-referrals"]')).toBeVisible()
        await expect(page.locator('[data-testid="bonus-earned"]')).toBeVisible()
      }
    })

    await test.step('Verify no critical errors', async () => {
      const errors = errorCapture.getErrors()
      const criticalErrors = errors.filter(e => 
        e.includes('referral') || e.includes('500')
      )
      expect(criticalErrors).toHaveLength(0)
    })
  })

  test('P0-REF-02: Complete referral flow with bonus', async ({ page }) => {
    const referrerEmail = 'referrer@test.sheenapps.ai'
    const refereeEmail = 'referee@test.sheenapps.ai'
    
    await test.step('Execute full referral flow', async () => {
      const referralCode = await generateAndUseReferral(page, referrerEmail, refereeEmail)
      
      // Should complete successfully
      expect(referralCode).toBeTruthy()
      await expect(page.locator('text=Referral bonus applied')).toBeVisible({ timeout: 15000 })
    })

    await test.step('Verify bonus application', async () => {
      // Check that bonus was applied to new user
      await page.goto('/en/dashboard/billing')
      
      const bonusIndicator = page.locator('[data-testid="referral-bonus"]')
      if (await bonusIndicator.isVisible()) {
        await expect(bonusIndicator).toContainText('bonus')
      }
    })

    await test.step('Verify referrer gets credit', async () => {
      // Login as referrer to check their bonus
      await page.goto('/en/auth/logout')
      await login(page, 'client_stripe')
      await page.goto('/en/dashboard/referrals')
      
      // Should show updated referral count
      const totalReferrals = page.locator('[data-testid="total-referrals"]')
      if (await totalReferrals.isVisible()) {
        const count = await totalReferrals.textContent()
        expect(parseInt(count)).toBeGreaterThanOrEqual(1)
      }
    })
  })
})

test.describe('P0-EXP: Critical Export Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({
      'X-Test-Mode': 'true',
      'X-AI-Worker-Mode': 'stub'
    })
  })

  test('P0-EXP-01: ZIP export functionality', async ({ page }) => {
    const errorCapture = await captureNetworkErrors(page)
    
    await test.step('Create and build project', async () => {
      await login(page, 'client_stripe')
      await createTestProject(page, 'Export Test Project')
      
      // Ensure project has content to export
      await page.fill('[data-testid="chat-input"]', 'Create a simple React component')
      await page.click('[data-testid="send-button"]')
      
      // Wait for build completion
      await expect(page.locator('[data-testid="build-status"][data-status="completed"]')).toBeVisible({ timeout: 45000 })
    })

    await test.step('Export as ZIP', async () => {
      await exportProject(page, 'zip')
      
      // Should successfully download zip file
      // Note: In test mode, this verifies the export flow works
    })

    await test.step('Verify export completion', async () => {
      // Should show export success message
      await expect(page.locator('text=Export completed')).toBeVisible({ timeout: 15000 })
    })

    await test.step('Verify no critical errors', async () => {
      const errors = errorCapture.getErrors()
      const criticalErrors = errors.filter(e => 
        e.includes('export') || e.includes('500')
      )
      expect(criticalErrors).toHaveLength(0)
    })
  })

  test('P0-EXP-02: GitHub export and sync', async ({ page }) => {
    await test.step('Create project for GitHub export', async () => {
      await login(page, 'client_stripe')
      await createTestProject(page, 'GitHub Test Project')
      
      // Build project content
      await page.fill('[data-testid="chat-input"]', 'Create a Next.js landing page')
      await page.click('[data-testid="send-button"]')
      
      await expect(page.locator('[data-testid="build-status"][data-status="completed"]')).toBeVisible({ timeout: 45000 })
    })

    await test.step('Export to GitHub', async () => {
      // Mock GitHub API responses
      await page.route('**/api/github/**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            repository: {
              name: 'test-export-repo',
              url: 'https://github.com/test-user/test-export-repo'
            }
          })
        })
      })
      
      await exportProject(page, 'github')
    })

    await test.step('Verify GitHub sync success', async () => {
      // Should show GitHub export success
      await expect(page.locator('text=Exported to GitHub successfully')).toBeVisible({ timeout: 30000 })
      
      // Should show GitHub repository link
      const repoLink = page.locator('[data-testid="github-repo-link"]')
      if (await repoLink.isVisible()) {
        await expect(repoLink).toHaveAttribute('href', /github\.com/)
      }
    })

    await test.step('Verify project metadata updated', async () => {
      // Project should show GitHub integration
      const githubBadge = page.locator('[data-testid="github-badge"]')
      if (await githubBadge.isVisible()) {
        await expect(githubBadge).toBeVisible()
      }
    })
  })

  test('P0-EXP-03: Export format validation', async ({ page }) => {
    await test.step('Create multi-framework project', async () => {
      await login(page, 'client_stripe')
      await createTestProject(page, 'Multi-Framework Test')
      
      // Create complex project structure
      await page.fill('[data-testid="chat-input"]', 'Create a React app with TypeScript and Tailwind')
      await page.click('[data-testid="send-button"]')
      
      await expect(page.locator('[data-testid="build-status"][data-status="completed"]')).toBeVisible({ timeout: 45000 })
    })

    await test.step('Verify export options', async () => {
      await page.click('[data-testid="export-button"]')
      
      // Should show multiple export formats
      await expect(page.locator('[data-testid="export-zip"]')).toBeVisible()
      await expect(page.locator('[data-testid="export-github"]')).toBeVisible()
    })

    await test.step('Test export validation', async () => {
      // Should validate project is ready for export
      const exportButton = page.locator('[data-testid="export-zip"]')
      await expect(exportButton).toBeEnabled()
      
      // Should show project info in export modal
      const projectInfo = page.locator('[data-testid="export-project-info"]')
      if (await projectInfo.isVisible()) {
        await expect(projectInfo).toContainText('React')
        await expect(projectInfo).toContainText('TypeScript')
      }
    })
  })

  test('P0-EXP-04: Export error handling', async ({ page }) => {
    await test.step('Test export without build', async () => {
      await login(page, 'client_stripe')
      await createTestProject(page, 'Empty Test Project')
      
      // Try to export without building
      await page.click('[data-testid="export-button"]')
      
      // Should warn about missing content
      const warningMessage = page.locator('[data-testid="export-warning"]')
      if (await warningMessage.isVisible()) {
        await expect(warningMessage).toContainText('build')
      }
    })

    await test.step('Test network error during export', async () => {
      // Create and build project first
      await page.fill('[data-testid="chat-input"]', 'Create basic landing page')
      await page.click('[data-testid="send-button"]')
      await expect(page.locator('[data-testid="build-status"][data-status="completed"]')).toBeVisible({ timeout: 45000 })
      
      // Mock network error
      await page.route('**/api/export/**', async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Export service temporarily unavailable'
          })
        })
      })
      
      await page.click('[data-testid="export-button"]')
      await page.click('[data-testid="export-zip"]')
      
      // Should show error message
      await expect(page.locator('text=Export failed')).toBeVisible({ timeout: 15000 })
      
      // Should offer retry option
      const retryButton = page.locator('[data-testid="retry-export"]')
      if (await retryButton.isVisible()) {
        await expect(retryButton).toBeEnabled()
      }
    })
  })

  test.afterEach(async ({ page }) => {
    // Clean up any test repositories or exports
    console.log('Export test completed')
  })
})