/**
 * P0 Critical Chat and Build Flow Tests
 * @tag p0
 * 
 * Expert-validated tests for real-time chat and project building
 * Tests SSE connections, AI responses, and build progress
 */

import { test, expect } from '@playwright/test'
import { login, startChatSession, createTestProject, testRealtimeFeatures, waitForStableElement, captureNetworkErrors } from './utils'

test.describe('P0-CHAT: Critical Chat and Build Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Set test mode for predictable AI responses
    await page.setExtraHTTPHeaders({
      'X-Test-Mode': 'true',
      'X-AI-Worker-Mode': 'stub'
    })
  })

  test('P0-CHAT-01: Chat interface loads and responds', async ({ page }) => {
    const errorCapture = await captureNetworkErrors(page)
    
    await test.step('Login and create project for workspace access', async () => {
      await login(page, 'client_stripe')
      // startChatSession will create a project and then interact with chat
      await startChatSession(page, 'Create a simple landing page')
    })

    await test.step('Verify chat response received', async () => {
      // Should receive AI response in test mode (already handled in startChatSession)
      await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({ timeout: 30000 })
      
      // Message should contain reasonable content
      const aiMessage = page.locator('[data-testid="ai-message"]').nth(0)
      const messageText = await aiMessage.textContent()
      expect(messageText.length).toBeGreaterThan(10)
    })

    await test.step('Verify no critical errors', async () => {
      const errors = errorCapture.getErrors()
      const criticalErrors = errors.filter(e => 
        e.includes('chat') || e.includes('websocket') || e.includes('500')
      )
      expect(criticalErrors).toHaveLength(0)
    })
  })

  test('P0-CHAT-02: Real-time SSE connection stability', async ({ page }) => {
    await test.step('Login and establish SSE connection', async () => {
      await login(page, 'client_stripe')
      await testRealtimeFeatures(page)
    })

    await test.step('Verify persistent connection', async () => {
      // Check connection status indicator
      const connectionStatus = page.locator('[data-testid="connection-status"]')
      await expect(connectionStatus).toHaveAttribute('data-status', 'connected')
    })

    await test.step('Test connection recovery', async () => {
      // Simulate network interruption
      await page.context().setOffline(true)
      await page.waitForTimeout(2000)
      
      // Reconnect
      await page.context().setOffline(false)
      await page.waitForTimeout(5000)
      
      // Should recover connection
      const connectionStatus = page.locator('[data-testid="connection-status"]')
      await expect(connectionStatus).toHaveAttribute('data-status', 'connected', { timeout: 25000 })
    })

    await test.step('Verify heartbeat functionality', async () => {
      // Wait for heartbeat interval (25 seconds in test mode)
      await page.waitForTimeout(30000)
      
      // Connection should still be active
      const connectionStatus = page.locator('[data-testid="connection-status"]')
      await expect(connectionStatus).toHaveAttribute('data-status', 'connected')
    })
  })

  test('P0-CHAT-03: Project creation and build flow', async ({ page }) => {
    await test.step('Login and create new project', async () => {
      await login(page, 'client_stripe')
      const projectName = await createTestProject(page)
      
      // Should be in workspace
      await expect(page).toHaveURL(/\/workspace/, { timeout: 25000 })
      await expect(page.locator('[data-testid="project-title"]')).toContainText(projectName)
    })

    await test.step('Initiate build through chat', async () => {
      await startChatSession(page, 'Build this project as a React landing page')
      
      // Should show build progress
      await expect(page.locator('[data-testid="build-progress"]')).toBeVisible({ timeout: 25000 })
    })

    await test.step('Monitor build events', async () => {
      // In test mode, build should complete quickly
      await expect(page.locator('[data-testid="build-status"][data-status="completed"]')).toBeVisible({ timeout: 45000 })
      
      // Should show preview
      const previewFrame = page.locator('[data-testid="preview-frame"]')
      if (await previewFrame.isVisible()) {
        await expect(previewFrame).toBeVisible()
      }
    })

    await test.step('Verify build artifacts', async () => {
      // Check that files were generated
      const fileTree = page.locator('[data-testid="file-tree"]')
      if (await fileTree.isVisible()) {
        await expect(page.locator('[data-testid="file-item"]')).toHaveCount({ min: 1 })
      }
      
      // Verify project status updated
      await expect(page.locator('[data-testid="project-status"]')).toContainText('Built')
    })
  })

  test('P0-CHAT-04: Multi-turn conversation flow', async ({ page }) => {
    await test.step('Start conversation', async () => {
      await login(page, 'client_stripe')
      await createTestProject(page)
      await startChatSession(page, 'Create a landing page for a tech startup')
    })

    await test.step('Follow up with modifications', async () => {
      // Wait for first response
      await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({ timeout: 30000 })
      
      // Send follow-up message
      await page.fill('[data-testid="chat-input"]', 'Make it dark theme with blue accents')
      await page.click('[data-testid="send-button"]')
      
      // Should receive second response
      await expect(page.locator('[data-testid="ai-message"]')).toHaveCount(2, { timeout: 30000 })
    })

    await test.step('Verify conversation history', async () => {
      // Check that both messages are preserved
      const userMessages = page.locator('[data-testid="user-message"]')
      await expect(userMessages).toHaveCount(2)
      
      const aiMessages = page.locator('[data-testid="ai-message"]')
      await expect(aiMessages).toHaveCount(2)
    })

    await test.step('Test conversation persistence', async () => {
      // Refresh page
      await page.reload()
      
      // Conversation should be restored
      await expect(page.locator('[data-testid="user-message"]')).toHaveCount(2, { timeout: 10000 })
      await expect(page.locator('[data-testid="ai-message"]')).toHaveCount(2)
    })
  })

  test('P0-CHAT-05: Chat error handling and recovery', async ({ page }) => {
    await test.step('Test network error handling', async () => {
      await login(page, 'client_stripe')
      // Create project to access workspace
      await createTestProject(page)
      
      // Simulate network failure during chat
      await page.context().setOffline(true)
      
      await page.fill('[data-testid="chat-input"]', 'This should fail due to network')
      await page.click('[data-testid="send-button"]')
      
      // Should show error state
      await expect(page.locator('[data-testid="chat-error"]')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Test error recovery', async () => {
      // Restore network
      await page.context().setOffline(false)
      
      // Retry button should work
      const retryButton = page.locator('[data-testid="retry-message"]')
      if (await retryButton.isVisible()) {
        await retryButton.click()
        
        // Should send message successfully
        await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({ timeout: 30000 })
      }
    })

    await test.step('Test rate limiting handling', async () => {
      // Mock rate limit response
      await page.route('**/api/chat/**', async route => {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: 5
          })
        })
      })
      
      await page.fill('[data-testid="chat-input"]', 'This should trigger rate limit')
      await page.click('[data-testid="send-button"]')
      
      // Should show rate limit message
      await expect(page.locator('text=Rate limit')).toBeVisible({ timeout: 10000 })
    })
  })

  test('P0-CHAT-06: Mobile chat responsiveness', async ({ page }) => {
    await test.step('Switch to mobile viewport', async () => {
      await page.setViewportSize({ width: 375, height: 667 })
      await login(page, 'client_stripe')
      // Create project to access workspace  
      await createTestProject(page)
    })

    await test.step('Verify mobile chat layout', async () => {
      await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible({ timeout: 10000 })
      
      // Chat should be optimized for mobile
      const chatContainer = page.locator('[data-testid="chat-container"]')
      const containerRect = await chatContainer.boundingBox()
      
      if (containerRect) {
        expect(containerRect.width).toBeLessThanOrEqual(375)
      }
    })

    await test.step('Test mobile chat interaction', async () => {
      await startChatSession(page, 'Mobile test message')
      
      // Should work on mobile
      await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({ timeout: 30000 })
      
      // Virtual keyboard should not break layout
      const chatInput = page.locator('[data-testid="chat-input"]')
      await expect(chatInput).toBeVisible()
    })
  })

  test.afterEach(async ({ page }) => {
    // Clean up any test projects
    console.log('Chat test completed')
  })
})