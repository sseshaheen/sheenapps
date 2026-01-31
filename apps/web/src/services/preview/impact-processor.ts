// Impact Processor - Handles different types of preview impacts

import type { PreviewImpact, PreviewUpdate, PreviewChange } from '@/types/question-flow'
import type { ModularImpact } from './types'
import { DesignSystemManager } from './design-system-manager'
import { AnimationSystem } from './animation-system'
import { ComponentRenderer } from './component-renderer'
import { logger } from '@/utils/logger';

export class ImpactProcessor {
  
  static async processImpact(impact: PreviewImpact): Promise<PreviewUpdate> {
    logger.info('🎯 Processing impact:', impact.type || impact.action);

    // Check for section restoration (layout navigation)
    if (impact.type === 'section-restoration') {
      logger.info('🎯 SECTION RESTORATION DETECTED!');
      return this.processSectionRestoration(impact)
    }

    // Check for component update (individual component generation)
    if (impact.type === 'component_update') {
      logger.info('🎯 COMPONENT UPDATE DETECTED!');
      return this.processComponentUpdate(impact)
    }

    // Check for modular transformation (new system)
    if ((impact as any).modularPreviewImpact) {
      logger.info('🎯 NESTED MODULAR TRANSFORMATION DETECTED!');
      const modularImpact = (impact as any).modularPreviewImpact
      return this.processModularImpact(modularImpact)
    } else if (impact.type === 'modular-transformation') {
      logger.info('🎯 ROOT MODULAR TRANSFORMATION DETECTED!');
      // Create a proper ModularImpact from the PreviewImpact
      const modularImpact: ModularImpact = {
        type: 'modular-transformation',
        modules: (impact as any).modules || {}
      }
      return this.processModularImpact(modularImpact)
    }

    // Check for comprehensive transformation (legacy system)
    if (impact.type === 'complete-transformation') {
      logger.info('🎯 COMPREHENSIVE TRANSFORMATION DETECTED!');
      return this.processComprehensiveImpact(impact)
    }

    // Legacy format
    logger.info('🔄 Processing legacy impact format');
    return this.processLegacyImpact(impact)
  }

  private static processComponentUpdate(impact: PreviewImpact): PreviewUpdate {
    logger.info('🔧 Processing component update for selectors:', impact.affects);
    
    const changes: PreviewChange[] = []
    
    // Process each selector and its component config
    if (impact.changes) {
      Object.entries(impact.changes).forEach(([selector, componentConfig]) => {
        logger.info(`🔧 Processing component for selector: ${selector}`, componentConfig);
        
        // Determine component type from selector
        let componentType: string
        if (selector.includes('navigation') || selector.includes('header')) {
          componentType = 'header'
        } else if (selector.includes('hero')) {
          componentType = 'hero'
        } else if (selector.includes('features')) {
          componentType = 'features'
        } else {
          logger.warn(`⚠️ Unknown component type for selector: ${selector}`);
          return
        }
        
        // Extract component and props from config
        const config = componentConfig as any
        const component = config.component
        const props = config.props
        
        logger.info(`🔧 Generating HTML for ${componentType} component:`, { component, props });
        
        // Generate HTML using ComponentRenderer
        const componentHTML = ComponentRenderer.generateComponentHTML(
          componentType, 
          component, 
          props, 
          true // Include wrapper
        )
        
        if (componentHTML) {
          logger.info(`✅ Generated HTML for ${componentType} (${componentHTML.length} chars);`)
          changes.push({
            selector,
            property: 'outerHTML',
            value: componentHTML,
            animation: 'fadeIn'
          })
        } else {
          logger.error(`❌ Failed to generate HTML for ${componentType}`);
        }
      })
    }
    
    return {
      id: `component_${Date.now()}`,
      type: 'content_change',
      changes,
      duration: 500,
      explanation: 'Applying component update',
      delay: 100
    }
  }

  private static processSectionRestoration(impact: any): PreviewUpdate {
    logger.info('🎯 Processing section restoration for:', impact.sectionId, 'layout-restoration');
    
    const changes: PreviewChange[] = []
    const { sectionId, componentData } = impact
    
    try {
      // Validate component data
      if (!componentData || typeof componentData !== 'object') {
        logger.warn(`⚠️ Invalid component data for section ${sectionId}`, 'layout-restoration');
        return {
          id: `restoration_failed_${Date.now()}`,
          type: 'no_change',
          changes: [],
          duration: 0,
          explanation: `Failed to restore ${sectionId}: invalid data`
        }
      }

      // Extract component information
      const { id, type, name, html, css, props } = componentData
      
      if (!html) {
        logger.warn(`⚠️ No HTML content for section ${sectionId}`, 'layout-restoration');
        return {
          id: `restoration_incomplete_${Date.now()}`,
          type: 'no_change',
          changes: [],
          duration: 0,
          explanation: `Failed to restore ${sectionId}: no HTML content`
        }
      }

      // Determine selector based on section ID
      const selector = this.getSelectorForSection(sectionId)
      
      if (!selector) {
        logger.warn(`⚠️ Could not determine selector for section ${sectionId}`, 'layout-restoration');
        return {
          id: `restoration_no_selector_${Date.now()}`,
          type: 'no_change',
          changes: [],
          duration: 0,
          explanation: `Failed to restore ${sectionId}: unknown section type`
        }
      }

      logger.info(`🔧 Restoring section ${sectionId} with selector ${selector}`, 'layout-restoration');

      // Add CSS if present
      if (css) {
        changes.push({
          selector: 'head',
          property: 'appendChild',
          value: `<style id="restored-${sectionId}-css">${css}</style>`,
          animation: 'fadeIn'
        })
      }

      // Restore section HTML
      changes.push({
        selector,
        property: 'outerHTML',
        value: html,
        animation: 'fadeIn'
      })

      logger.info(`✅ Section restoration prepared for ${sectionId} (${changes.length} changes)`, 'layout-restoration');

      return {
        id: `restoration_${sectionId}_${Date.now()}`,
        type: 'content_change',
        changes,
        duration: 300,
        explanation: `Restored edits for ${sectionId}`,
        delay: 50
      }

    } catch (error) {
      logger.error(`❌ Section restoration failed for ${sectionId}:`, error, 'layout-restoration');
      return {
        id: `restoration_error_${Date.now()}`,
        type: 'no_change',
        changes: [],
        duration: 0,
        explanation: `Failed to restore ${sectionId}: ${error.message}`
      }
    }
  }

  private static getSelectorForSection(sectionId: string): string | null {
    // Map section IDs to DOM selectors
    const selectorMap: Record<string, string> = {
      'hero': '[class*="hero"], [data-section="hero"], #hero',
      'header': '[class*="header"], [class*="navigation"], [data-section="header"], #header',
      'features': '[class*="features"], [data-section="features"], #features',
      'pricing': '[class*="pricing"], [data-section="pricing"], #pricing',
      'testimonials': '[class*="testimonials"], [data-section="testimonials"], #testimonials',
      'cta': '[class*="cta"], [data-section="cta"], #cta',
      'footer': '[class*="footer"], [data-section="footer"], #footer'
    }

    // Try exact match first
    if (selectorMap[sectionId]) {
      return selectorMap[sectionId]
    }

    // Try partial match for complex section IDs
    for (const [key, selector] of Object.entries(selectorMap)) {
      if (sectionId.includes(key)) {
        return selector
      }
    }

    logger.warn(`⚠️ No selector mapping found for section: ${sectionId}`, 'layout-restoration');
    return null
  }

  private static processModularImpact(modularImpact: ModularImpact): PreviewUpdate {
    logger.info('🎨 Processing modular impact with modules:', Object.keys(modularImpact.modules || {}))
    
    const changes: PreviewChange[] = []
    const { modules } = modularImpact

    // First, remove any existing modular styles to prevent theme bleed
    logger.info('🧹 Clearing previous theme styles to prevent bleed');
    changes.push({
      selector: '#modular-colors, #modular-typography, #modular-animations, #modular-custom',
      property: 'remove',
      value: ''
    })

    // Apply color scheme CSS variables
    if (modules.colorScheme) {
      logger.info('🎨 Applying color scheme:', modules.colorScheme);
      
      const colorSchemeCSS = DesignSystemManager.generateColorSchemeCSS(modules.colorScheme)
      if (colorSchemeCSS) {
        changes.push({
          selector: 'head',
          property: 'appendChild',
          value: `<style id="modular-colors">${colorSchemeCSS}</style>`,
          animation: 'fadeIn'
        })
      }

      // Apply dramatic background changes
      const backgroundStyle = DesignSystemManager.getBackgroundStyle(modules.colorScheme)
      if (backgroundStyle) {
        changes.push({
          selector: 'body, html, .preview-container',
          property: 'style.background',
          value: backgroundStyle,
          animation: 'fadeIn'
        })
      }
    }
    
    // Apply typography system
    if (modules.typography) {
      logger.info('🔤 Applying typography:', modules.typography);
      
      const typographyCSS = DesignSystemManager.generateTypographyCSS(modules.typography)
      if (typographyCSS) {
        changes.push({
          selector: 'head',
          property: 'appendChild',
          value: `<style id="modular-typography">${typographyCSS}</style>`,
          animation: 'fadeIn'
        })
      }
    }
    
    // Apply header component
    if (modules.header) {
      logger.info('📝 Applying header component:', modules.header.component);
      
      const headerHTML = ComponentRenderer.generateComponentHTML('header', modules.header.component, modules.header.props, true)
      
      if (headerHTML) {
        changes.push({
          selector: 'header, .header, nav, .navigation',
          property: 'outerHTML',
          value: headerHTML,
          animation: 'fadeIn'
        })
      }
    }
    
    // Apply hero component  
    if (modules.hero) {
      logger.info('🦸 Applying hero component:', modules.hero.component);
      logger.info('🦸 Hero props:', modules.hero.props);
      logger.info('🦸 Badge value in props:', modules.hero.props?.badge);
      
      const heroHTML = ComponentRenderer.generateComponentHTML('hero', modules.hero.component, modules.hero.props, true)
      
      if (heroHTML) {
        logger.info('🦸 Generated hero HTML preview:', heroHTML.substring(0, 200) + '...')
        logger.info('🦸 Adding hero change to changes array');
        changes.push({
          selector: '.hero, .hero-section, .banner, main > section:first-child, .preview-container > section:first-child',
          property: 'outerHTML',
          value: heroHTML,
          animation: 'fadeIn'
        })
        logger.info('🦸 Hero change added. Total changes now:', changes.length);
      } else {
        logger.warn('⚠️ Hero HTML generation returned empty!');
      }
    } else {
      logger.warn('⚠️ No hero module found!');
    }
    
    // Apply features component
    if (modules.features) {
      logger.info('⚡ Applying features component:', modules.features.component);
      
      const featuresHTML = ComponentRenderer.generateComponentHTML('features', modules.features.component, modules.features.props, true)
      
      if (featuresHTML) {
        changes.push({
          selector: '.features, .features-section, .services, .services-section, section:nth-child(2)',
          property: 'outerHTML',
          value: featuresHTML,
          animation: 'fadeIn'
        })
      }
    }
    
    // Apply animations
    if (modules.animations && modules.animations.length > 0) {
      logger.info('✨ Applying animations:', modules.animations);
      
      const animationCSS = AnimationSystem.generateAnimationCSS(modules.animations)
      if (animationCSS) {
        changes.push({
          selector: 'head',
          property: 'appendChild',
          value: `<style id="modular-animations">${animationCSS}</style>`,
          animation: 'fadeIn'
        })
      }
    }
    
    // Apply custom CSS
    if (modules.customCSS) {
      logger.info('🎨 Applying custom CSS');
      
      changes.push({
        selector: 'head',
        property: 'appendChild',
        value: `<style id="modular-custom">${modules.customCSS}</style>`,
        animation: 'fadeIn'
      })
    }

    logger.info('🎯 Final changes array:');
    changes.forEach((change, index) => {
      logger.info(`  ${index + 1}. ${change.property} on ${change.selector}`);
    })
    
    return {
      id: `modular_${Date.now()}`,
      type: 'theme_change',
      changes,
      duration: 800,
      explanation: `Applying ${modules.colorScheme || 'custom'} theme with modular components`,
      delay: 200
    }
  }

  private static processComprehensiveImpact(impact: PreviewImpact): PreviewUpdate {
    logger.info('📦 Processing comprehensive impact');
    
    const changes: PreviewChange[] = []
    const comprehensive = impact

    // Handle HTML structure replacements
    if ((comprehensive.changes as any)?.htmlStructure) {
      const html = (comprehensive.changes as any).htmlStructure
      logger.info('🔍 Has HTML structure changes:', Object.keys(html))
      
      // Replace header
      if (html.headerHTML) {
        changes.push({
          selector: 'header, .header, nav, .navigation',
          property: 'outerHTML',
          value: html.headerHTML,
          animation: 'fadeIn'
        })
      }
      
      // Replace hero section
      if (html.heroHTML) {
        changes.push({
          selector: '.hero, .hero-section, .banner, main > section:first-child',
          property: 'outerHTML', 
          value: html.heroHTML,
          animation: 'fadeIn'
        })
      }
      
      // Replace features section
      if (html.featuresHTML) {
        changes.push({
          selector: '.features, .features-section, .services, .services-section',
          property: 'outerHTML',
          value: html.featuresHTML,
          animation: 'fadeIn'
        })
      }
    }

    // Handle CSS overrides
    if ((comprehensive.changes as any)?.cssOverrides) {
      const css = (comprehensive.changes as any).cssOverrides
      changes.push({
        selector: 'head',
        property: 'appendChild',
        value: `<style id="comprehensive-styles">${css}</style>`,
        animation: 'fadeIn'
      })
    }

    return {
      id: `comprehensive_${Date.now()}`,
      type: 'theme_change',
      changes,
      duration: impact.animationDuration || 800,
      explanation: 'Applying comprehensive theme transformation',
      delay: 200
    }
  }

  private static processLegacyImpact(impact: PreviewImpact): PreviewUpdate {
    logger.info('🔄 Processing legacy impact format');
    
    const actionType = impact.action || impact.type || 'content_change'
    const targetElement = impact.target || 'page-content'
    
    const changes: PreviewChange[] = []

    // Simple legacy format handling
    if (impact.changes) {
      Object.entries(impact.changes).forEach(([selector, value]) => {
        changes.push({
          selector,
          property: 'textContent',
          value: String(value),
          animation: 'fadeIn'
        })
      })
    }

    return {
      id: `legacy_${Date.now()}`,
      type: this.mapImpactTypeToUpdateType(actionType),
      changes,
      duration: impact.animationDuration || 500,
      explanation: `Applying ${actionType} changes`,
      delay: 200
    }
  }

  private static mapImpactTypeToUpdateType(actionType: string): 'layout_update' | 'theme_change' | 'feature_addition' | 'content_change' {
    const mapping: Record<string, 'layout_update' | 'theme_change' | 'feature_addition' | 'content_change'> = {
      'theme_change': 'theme_change',
      'layout_update': 'layout_update', 
      'feature_add': 'feature_addition',
      'feature_addition': 'feature_addition',
      'content_change': 'content_change',
      'style_refinement': 'theme_change'
    }
    return mapping[actionType] || 'content_change'
  }
}