// Current Section Content Extractor
// Extracts live section content from preview for context-aware AI modifications
// This is the key missing piece for truly AI-centric modifications

import { logger } from '@/utils/logger'

export interface CurrentSectionContent {
  html: string
  css: string
  reasoning?: string
  metadata?: {
    sectionId?: string
    componentType?: string
    layoutStyle?: string
  }
}

export class CurrentSectionExtractor {
  
  /**
   * Extract current section content from live preview
   * This enables AI to understand what the user wants to modify
   */
  async extractCurrentSection(
    sectionType: string, 
    businessContext: any
  ): Promise<CurrentSectionContent> {
    
    try {
      // Get the preview iframe
      const previewIframe = this.getPreviewIframe()
      
      if (!previewIframe) {
        logger.warn('📱 No preview iframe found, using fallback');
        return this.getFallbackSectionContent(sectionType, businessContext)
      }

      // Extract section from live preview
      const sectionContent = this.extractSectionFromPreview(previewIframe, sectionType)
      
      if (sectionContent) {
        logger.info(`✅ Extracted current ${sectionType} from live preview`);
        return sectionContent
      }

      // Fallback if extraction fails
      return this.getFallbackSectionContent(sectionType, businessContext)
      
    } catch (error) {
      logger.error('❌ Error extracting section content:', error);
      return this.getFallbackSectionContent(sectionType, businessContext)
    }
  }

  /**
   * Get the preview iframe element
   */
  private getPreviewIframe(): HTMLIFrameElement | null {
    // Try different possible iframe selectors
    const selectors = [
      '#preview-iframe',
      '[data-preview="iframe"]', 
      'iframe[src*="preview"]',
      '.preview-frame iframe',
      'iframe'
    ]

    for (const selector of selectors) {
      const iframe = document.querySelector(selector) as HTMLIFrameElement
      if (iframe && iframe.contentDocument) {
        return iframe
      }
    }

    return null
  }

  /**
   * Extract specific section from preview iframe
   */
  private extractSectionFromPreview(
    iframe: HTMLIFrameElement, 
    sectionType: string
  ): CurrentSectionContent | null {
    
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return null

      // Try different ways to find the section
      const sectionElement = this.findSectionElement(doc, sectionType)
      
      if (!sectionElement) {
        logger.warn(`📱 Section ${sectionType} not found in preview`);
        return null
      }

      // Extract HTML
      const html = sectionElement.outerHTML

      // Extract relevant CSS
      const css = this.extractSectionCSS(doc, sectionElement, sectionType)

      // Extract metadata
      const metadata = this.extractSectionMetadata(sectionElement)

      return {
        html,
        css,
        reasoning: `Current ${sectionType} implementation extracted from live preview`,
        metadata
      }

    } catch (error) {
      logger.error('❌ Error extracting from iframe:', error);
      return null
    }
  }

  /**
   * Find section element using various strategies
   */
  private findSectionElement(doc: Document, sectionType: string): Element | null {
    // Strategy 1: Direct data attribute
    let element = doc.querySelector(`[data-section-type="${sectionType}"]`)
    if (element) return element

    // Strategy 2: HTML tag (for header, footer, etc.)
    if (['header', 'footer', 'nav', 'main'].includes(sectionType)) {
      element = doc.querySelector(sectionType)
      if (element) return element
    }

    // Strategy 3: Class-based detection
    const classSelectors = [
      `.${sectionType}`,
      `.${sectionType}-section`,
      `.section-${sectionType}`,
      `[class*="${sectionType}"]`
    ]

    for (const selector of classSelectors) {
      element = doc.querySelector(selector)
      if (element) return element
    }

    // Strategy 4: Content-based detection (for headers)
    if (sectionType === 'header') {
      // Look for elements containing navigation
      element = doc.querySelector('nav') || 
                doc.querySelector('[role="navigation"]') ||
                doc.querySelector('.nav') ||
                doc.querySelector('.navigation')
      if (element) return element.closest('header') || element
    }

    return null
  }

  /**
   * Extract CSS relevant to the section
   */
  private extractSectionCSS(
    doc: Document, 
    element: Element, 
    sectionType: string
  ): string {
    
    try {
      const cssRules: string[] = []

      // Get computed styles
      const computedStyle = doc.defaultView?.getComputedStyle(element)
      if (computedStyle) {
        // Extract key CSS properties (not all, as that would be too verbose)
        const keyProperties = [
          'display', 'flex-direction', 'justify-content', 'align-items',
          'background', 'color', 'font-family', 'font-size', 'font-weight',
          'padding', 'margin', 'border', 'border-radius',
          'width', 'height', 'max-width', 'min-height'
        ]

        const relevantStyles: string[] = []
        keyProperties.forEach(prop => {
          const value = computedStyle.getPropertyValue(prop)
          if (value && value !== 'normal' && value !== 'none' && value !== '0px') {
            relevantStyles.push(`  ${prop}: ${value};`)
          }
        })

        if (relevantStyles.length > 0) {
          cssRules.push(`.${sectionType} {\n${relevantStyles.join('\n')}\n}`)
        }
      }

      // Try to extract relevant stylesheet rules
      const stylesheets = Array.from(doc.styleSheets)
      for (const stylesheet of stylesheets) {
        try {
          const rules = Array.from(stylesheet.cssRules || [])
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule) {
              // Check if rule selector is relevant to this section
              if (this.isRelevantCSSRule(rule.selectorText, element, sectionType)) {
                cssRules.push(rule.cssText)
              }
            }
          }
        } catch (e) {
          // Skip inaccessible stylesheets (CORS)
          continue
        }
      }

      return cssRules.join('\n\n')

    } catch (error) {
      logger.warn('⚠️ Could not extract CSS:', error);
      return `/* CSS could not be extracted for ${sectionType} */`
    }
  }

  /**
   * Check if CSS rule is relevant to the section
   */
  private isRelevantCSSRule(
    selectorText: string, 
    element: Element, 
    sectionType: string
  ): boolean {
    
    if (!selectorText) return false

    // Check if selector matches the element or its children
    try {
      return element.matches(selectorText) || 
             element.querySelector(selectorText) !== null ||
             selectorText.includes(sectionType) ||
             selectorText.includes(element.className) ||
             selectorText.includes(element.id)
    } catch (e) {
      return false
    }
  }

  /**
   * Extract metadata about the section
   */
  private extractSectionMetadata(element: Element) {
    return {
      sectionId: element.id || undefined,
      componentType: element.getAttribute('data-component-type') || undefined,
      layoutStyle: element.getAttribute('data-layout') || undefined,
      classes: element.className,
      tagName: element.tagName.toLowerCase()
    }
  }

  /**
   * Fallback content when live extraction fails
   */
  private getFallbackSectionContent(
    sectionType: string, 
    businessContext: any
  ): CurrentSectionContent {
    
    return {
      html: `<!-- Current ${sectionType} content not available -->`,
      css: `/* Current ${sectionType} styles not available */`,
      reasoning: `Fallback used - could not extract current ${sectionType} from preview`,
      metadata: {
        sectionId: 'fallback',
        componentType: sectionType
      }
    }
  }
}

/**
 * Factory function for easy integration
 */
export function createCurrentSectionExtractor() {
  return new CurrentSectionExtractor()
}

/**
 * Usage example in simplified AI service
 */
export const usageExample = `
// In SimplifiedAIService:
import { createCurrentSectionExtractor } from './current-section-extractor'
import { logger } from '@/utils/logger';

class SimplifiedAIService {
  private sectionExtractor = createCurrentSectionExtractor()

  async modifySection(request: ModificationRequest) {
    // Get current section content for AI context
    const currentSection = await this.sectionExtractor.extractCurrentSection(
      request.sectionType,
      request.businessContext
    )

    // AI now has full context of what user wants to modify
    const prompt = this.buildContextAwarePrompt({
      ...request,
      currentSection
    })

    return await this.callAI(prompt)
  }
}
`