/**
 * Template CSS Loader
 * 
 * Loads pre-generated CSS for templates to improve preview performance
 * by avoiding runtime Tailwind compilation.
 */

import { logger } from '@/utils/logger'

interface TemplateCSSMetadata {
  generated: string
  templates: Array<{
    name: string
    cssPath: string
    minCssPath: string
  }>
}

class TemplateCSSLoader {
  private cache = new Map<string, string>()
  private metadata: TemplateCSSMetadata | null = null
  private loadingPromise: Promise<void> | null = null

  /**
   * Load metadata about available pre-generated CSS
   */
  private async loadMetadata(): Promise<void> {
    if (this.metadata) return
    
    if (this.loadingPromise) {
      await this.loadingPromise
      return
    }
    
    this.loadingPromise = (async () => {
      try {
        const response = await fetch('/css/templates/metadata.json')
        if (response.ok) {
          this.metadata = await response.json()
          logger.info('template_css_metadata_loaded', {
            templateCount: this.metadata?.templates.length || 0,
            generated: this.metadata?.generated
          })
        }
      } catch (error) {
        logger.warn('template_css_metadata_failed', { error })
        // Fallback - no pre-generated CSS available
        this.metadata = { generated: '', templates: [] }
      }
    })()
    
    await this.loadingPromise
  }

  /**
   * Get pre-generated CSS for a template
   */
  async getTemplateCSS(templateName: string, useMinified = true): Promise<string | null> {
    await this.loadMetadata()
    
    const cacheKey = `${templateName}-${useMinified ? 'min' : 'full'}`
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    // Find template in metadata
    const template = this.metadata?.templates.find(t => t.name === templateName)
    if (!template) {
      logger.info('template_css_not_found', { templateName })
      return null
    }
    
    // Load CSS
    try {
      const cssPath = useMinified ? template.minCssPath : template.cssPath
      const response = await fetch(cssPath)
      
      if (!response.ok) {
        throw new Error(`Failed to load CSS: ${response.status}`)
      }
      
      const css = await response.text()
      
      // Cache for future use
      this.cache.set(cacheKey, css)
      
      logger.info('template_css_loaded', {
        templateName,
        cssSize: css.length,
        useMinified
      })
      
      return css
    } catch (error) {
      logger.error('template_css_load_failed', {
        templateName,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  /**
   * Check if pre-generated CSS is available for a template
   */
  async hasTemplateCSS(templateName: string): Promise<boolean> {
    await this.loadMetadata()
    return this.metadata?.templates.some(t => t.name === templateName) || false
  }

  /**
   * Clear the CSS cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get age of pre-generated CSS
   */
  async getCSSAge(templateName: string): Promise<number | null> {
    await this.loadMetadata()
    
    if (!this.metadata?.generated) return null
    
    const template = this.metadata.templates.find(t => t.name === templateName)
    if (!template) return null
    
    const generated = new Date(this.metadata.generated)
    const now = new Date()
    
    return now.getTime() - generated.getTime()
  }
}

// Export singleton instance
export const templateCSSLoader = new TemplateCSSLoader()