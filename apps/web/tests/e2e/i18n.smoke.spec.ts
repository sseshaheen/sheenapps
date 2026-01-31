/**
 * @smoke Internationalization smoke tests
 * Owner: @platform-team
 * 
 * Tests critical i18n functionality:
 * - Arabic locale with RTL support
 * - Navigation labels properly translated
 * - Builder UI elements translated
 * - Locale persistence across navigation
 */

import { test, expect } from '@playwright/test'
import { smokeFixtures, TEST_USER } from '../fixtures/smoke-fixtures'

test.describe('@smoke Internationalization', () => {
  
  test('Arabic locale with RTL support', async ({ page }) => {
    await test.step('Navigate to Arabic locale', async () => {
      // Navigate directly to Arabic Egypt locale
      await page.goto('/ar-eg')
      
      // Wait for page to load
      await expect(page.locator('body')).toBeVisible()
    })

    await test.step('Verify RTL attribute present', async () => {
      // Check that html element has dir="rtl" attribute
      const htmlElement = page.locator('html')
      await expect(htmlElement).toHaveAttribute('dir', 'rtl')
      
      console.log('RTL attribute verified on html element')
    })

    await test.step('Verify Arabic navigation labels', async () => {
      // Check for Arabic text in navigation
      const navigation = page.locator('nav, [data-testid="navigation"]')
      await expect(navigation).toBeVisible({ timeout: 5000 })
      
      // Look for Arabic text patterns (right-to-left characters)
      const navText = await navigation.textContent()
      const hasArabicText = /[\u0600-\u06FF]/.test(navText || '')
      
      expect(hasArabicText).toBe(true)
      console.log('Arabic navigation text verified')
    })

    await test.step('Navigate to login and verify Arabic UI', async () => {
      // Navigate to login page in Arabic
      await page.goto('/ar-eg/auth/login')
      
      // Wait for login form
      await expect(page.locator('form, [data-testid="login-form"]')).toBeVisible()
      
      // Check for Arabic labels/text in the form
      const formText = await page.locator('form, [data-testid="login-form"]').textContent()
      const hasArabicFormText = /[\u0600-\u06FF]/.test(formText || '')
      
      expect(hasArabicFormText).toBe(true)
      console.log('Arabic login form verified')
    })

    await test.step('Login and verify dashboard in Arabic', async () => {
      // Login with Arabic locale
      await page.fill('[data-testid="email-input"]', TEST_USER.email)
      await page.fill('[data-testid="password-input"]', TEST_USER.password)
      await page.click('[data-testid="login-button"]')
      
      // Should redirect to Arabic dashboard
      await expect(page).toHaveURL(/\/ar-eg\/dashboard/, { timeout: 10000 })
      
      // Verify RTL is maintained
      const htmlElement = page.locator('html')
      await expect(htmlElement).toHaveAttribute('dir', 'rtl')
      
      // Check dashboard content is in Arabic
      const dashboardContent = await page.locator('[data-testid="dashboard-content"], main').textContent()
      const hasArabicDashboard = /[\u0600-\u06FF]/.test(dashboardContent || '')
      
      expect(hasArabicDashboard).toBe(true)
      console.log('Arabic dashboard verified')
    })
  })

  test('Builder UI Arabic translation', async ({ page }) => {
    await test.step('Create project in Arabic locale', async () => {
      // Login in Arabic
      await page.goto('/ar-eg/auth/login')
      await page.fill('[data-testid="email-input"]', TEST_USER.email)
      await page.fill('[data-testid="password-input"]', TEST_USER.password)
      await page.click('[data-testid="login-button"]')
      
      await expect(page).toHaveURL(/\/ar-eg\/dashboard/)
      
      // Create a project
      await page.click('[data-testid="create-project-button"]')
      
      const projectName = smokeFixtures.generateTestId('مشروع اختبار') // Arabic project name
      await page.fill('[data-testid="project-name-input"]', projectName)
      await page.click('[data-testid="create-project-submit"]')
      
      // Wait for project to be created
      await expect(page.locator(`[data-testid="project-card"][data-project-name="${projectName}"]`)).toBeVisible({ timeout: 10000 })
    })

    await test.step('Navigate to builder and verify Arabic UI', async () => {
      // Open the project
      const projectCard = page.locator('[data-testid="project-card"]').first()
      await projectCard.click()
      
      // Should be in Arabic builder workspace
      await expect(page).toHaveURL(/\/ar-eg\/builder\/workspace\//)
      
      // Verify RTL is maintained in builder
      const htmlElement = page.locator('html')
      await expect(htmlElement).toHaveAttribute('dir', 'rtl')
      
      // Wait for builder to load
      await expect(page.locator('[data-testid="builder-workspace"]')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Verify builder elements are translated', async () => {
      // Check builder interface elements
      const builderInterface = await page.locator('[data-testid="builder-workspace"]').textContent()
      const hasArabicBuilder = /[\u0600-\u06FF]/.test(builderInterface || '')
      
      expect(hasArabicBuilder).toBe(true)
      
      // Check for specific Arabic UI elements if they exist
      const buttonTexts = await page.locator('button').allTextContents()
      const arabicButtons = buttonTexts.filter(text => /[\u0600-\u06FF]/.test(text))
      
      expect(arabicButtons.length).toBeGreaterThan(0)
      console.log(`Found ${arabicButtons.length} Arabic buttons:`, arabicButtons.slice(0, 3))
    })
  })

  test('Locale persistence across navigation', async ({ page }) => {
    await test.step('Start in French locale', async () => {
      await page.goto('/fr')
      
      // Verify French locale
      const htmlElement = page.locator('html')
      await expect(htmlElement).toHaveAttribute('lang', 'fr')
    })

    await test.step('Navigate through different pages', async () => {
      // Navigate to about page
      const aboutLink = page.locator('a[href*="/fr/about"], a[href*="/fr/"]').first()
      if (await aboutLink.isVisible()) {
        await aboutLink.click()
        
        // Should maintain French locale
        await expect(page).toHaveURL(/\/fr\//)
        await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
      }
      
      // Navigate to pricing
      await page.goto('/fr/pricing')
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
      
      // Check for French content
      const pageText = await page.locator('body').textContent()
      const hasFrenchText = /[àâäéèêëïîôöùûüÿç]/i.test(pageText || '')
      
      expect(hasFrenchText).toBe(true)
      console.log('French locale persistence verified')
    })

    await test.step('Switch to German and verify', async () => {
      // Navigate to German locale
      await page.goto('/de')
      
      // Verify German locale
      const htmlElement = page.locator('html')
      await expect(htmlElement).toHaveAttribute('lang', 'de')
      
      // Check for German content
      const pageText = await page.locator('body').textContent()
      const hasGermanText = /[äöüß]/i.test(pageText || '')
      
      expect(hasGermanText).toBe(true)
      console.log('German locale verified')
    })
  })

  test('Right-to-left layout verification', async ({ page }) => {
    await test.step('Test Arabic layout positioning', async () => {
      await page.goto('/ar-eg')
      
      // Wait for page to load
      await expect(page.locator('body')).toBeVisible()
      
      // Check that navigation items are positioned correctly for RTL
      const nav = page.locator('nav').first()
      if (await nav.isVisible()) {
        const navStyles = await nav.evaluate(el => {
          const styles = window.getComputedStyle(el)
          return {
            direction: styles.direction,
            textAlign: styles.textAlign
          }
        })
        
        expect(navStyles.direction).toBe('rtl')
        console.log('RTL navigation layout verified')
      }
    })

    await test.step('Test form field alignment in RTL', async () => {
      // Go to login form in Arabic
      await page.goto('/ar-eg/auth/login')
      
      // Check form field alignment
      const emailField = page.locator('[data-testid="email-input"]')
      if (await emailField.isVisible()) {
        const fieldStyles = await emailField.evaluate(el => {
          const styles = window.getComputedStyle(el)
          return {
            direction: styles.direction,
            textAlign: styles.textAlign
          }
        })
        
        // Fields should inherit RTL direction
        expect(fieldStyles.direction).toBe('rtl')
        console.log('RTL form field alignment verified')
      }
    })
  })

  test('Translation completeness check', async ({ page }) => {
    await test.step('Verify critical UI elements are translated', async () => {
      const locales = ['ar-eg', 'fr', 'es', 'de']
      
      for (const locale of locales) {
        console.log(`Checking locale: ${locale}`)
        
        await page.goto(`/${locale}`)
        
        // Wait for page to load
        await page.waitForTimeout(1000)
        
        // Check that page doesn't contain obvious English fallbacks
        const bodyText = await page.locator('body').textContent()
        
        // These should be translated in non-English locales
        const englishTerms = ['Get Started', 'Sign In', 'Log In', 'Create Account']
        const foundEnglishTerms = englishTerms.filter(term => 
          bodyText?.includes(term)
        )
        
        // Allow some English terms but warn if too many
        if (foundEnglishTerms.length > 2) {
          console.warn(`Locale ${locale} has many English terms:`, foundEnglishTerms)
        }
        
        // Verify locale-specific characters are present (basic check)
        let hasLocalizedContent = false
        
        switch (locale) {
          case 'ar-eg':
            hasLocalizedContent = /[\u0600-\u06FF]/.test(bodyText || '')
            break
          case 'fr':
            hasLocalizedContent = /[àâäéèêëïîôöùûüÿç]/i.test(bodyText || '')
            break
          case 'es':
            hasLocalizedContent = /[áéíóúüñ¿¡]/i.test(bodyText || '')
            break
          case 'de':
            hasLocalizedContent = /[äöüß]/i.test(bodyText || '')
            break
        }
        
        expect(hasLocalizedContent).toBe(true)
        console.log(`✓ Locale ${locale} has localized content`)
      }
    })
  })
})