// Component Renderer - HTML template generation for UI components

import type { ComponentProps } from './types'
import { logger } from '@/utils/logger';

export class ComponentRenderer {
  
  // Wrap generated HTML with edit capabilities
  static wrapWithEditControls(html: string, componentType: string, componentId: string): string {
    const sectionName = componentType.charAt(0).toUpperCase() + componentType.slice(1)
    
    console.log(`🎨 Creating edit controls:`, { 
      componentType, 
      componentId, 
      sectionName,
      undoId: `undo-${componentType}-${componentId}`,
      redoId: `redo-${componentType}-${componentId}`
    })
    
    // Extract the root element from the HTML
    const trimmedHtml = html.trim()
    
    // Add edit capabilities by wrapping with a container that has:
    // 1. Data attributes for identification
    // 2. Hover events for edit highlighting
    // 3. Click handler for editing
    // 4. Floating edit button
    
    const wrappedHtml = `
      <div 
        class="editable-section" 
        data-section-type="${componentType}"
        data-section-id="${componentId}"
        data-section-name="${sectionName}"
        style="position: relative; outline: 2px solid transparent; transition: outline 0.3s ease;"
        onmouseover="this.style.outline='2px solid rgba(147, 51, 234, 0.5)'; this.querySelector('.section-controls').style.opacity='1'; this.querySelector('.section-controls').setAttribute('data-visible', 'true');"
        onmouseout="const controls = this.querySelector('.section-controls'); if (!controls.getAttribute('data-keep-visible')) { this.style.outline='2px solid transparent'; controls.style.opacity='0'; controls.removeAttribute('data-visible'); }"
      >
        ${trimmedHtml}
        <div 
          class="section-controls"
          style="
            position: absolute;
            top: 8px;
            right: 8px;
            display: flex;
            gap: 6px;
            opacity: 0;
            transition: all 0.3s ease;
            z-index: 1000;
          "
        >
          <!-- Edit Button -->
          <button 
            class="edit-button"
            onclick="window.editSection('${componentType}', '${componentId}', '${sectionName}')"
            style="
              background: rgba(59, 130, 246, 0.9);
              color: white;
              border: none;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
              backdrop-filter: blur(4px);
              display: flex;
              align-items: center;
              gap: 4px;
            "
            onmouseover="this.style.transform='scale(1.02)'; this.style.background='rgba(59, 130, 246, 1)';"
            onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(59, 130, 246, 0.9)';"
          >
            <span style="font-size: 10px;">✏️</span>
            Edit
          </button>
          
          <!-- Undo Button -->
          <button 
            class="undo-button"
            id="undo-${componentType}-${componentId}"
            onclick="const controls = this.closest('.section-controls'); controls.setAttribute('data-keep-visible', 'true'); window.undoSection('${componentType}', '${componentId}', '${sectionName}'); setTimeout(() => { if (!controls.getAttribute('data-action-pending')) controls.removeAttribute('data-keep-visible'); }, 3000);"
            style="
              background: rgba(251, 146, 60, 0.9);
              color: white;
              border: none;
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
              backdrop-filter: blur(4px);
              display: none;
              flex-direction: row;
              align-items: center;
              gap: 4px;
            "
            onmouseover="this.style.transform='scale(1.02)'; this.style.background='rgba(251, 146, 60, 1)';"
            onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(251, 146, 60, 0.9)';"
            title="Undo last change"
          >
            <span style="font-size: 10px;">⟲</span> Undo
          </button>
          
          <!-- Redo Button -->
          <button 
            class="redo-button"
            id="redo-${componentType}-${componentId}"
            onclick="const controls = this.closest('.section-controls'); controls.setAttribute('data-keep-visible', 'true'); window.redoSection('${componentType}', '${componentId}', '${sectionName}'); setTimeout(() => { if (!controls.getAttribute('data-action-pending')) controls.removeAttribute('data-keep-visible'); }, 3000);"
            style="
              background: rgba(34, 197, 94, 0.9);
              color: white;
              border: none;
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
              backdrop-filter: blur(4px);
              display: none;
              flex-direction: row;
              align-items: center;
              gap: 4px;
            "
            onmouseover="this.style.transform='scale(1.02)'; this.style.background='rgba(34, 197, 94, 1)';"
            onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(34, 197, 94, 0.9)';"
            title="Redo next change"
          >
            <span style="font-size: 10px;">⟳</span> Redo
          </button>
        </div>
      </div>
    `
    
    logger.info(`🎨 Wrapped ${componentType} with edit controls`);
    return wrappedHtml
  }
  
  // Template interpolation helper
  private static interpolate(template: string, data: ComponentProps): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const keys = key.trim().split('.')
      let value: any = data
      for (const k of keys) {
        value = value?.[k]
      }
      return String(value || match)
    }).replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, key, content) => {
      const array = data[key.trim()]
      if (Array.isArray(array)) {
        return array.map(item => ComponentRenderer.interpolate(content, item)).join('')
      }
      return ''
    })
  }

  static generateComponentHTML(componentType: string, componentId: string, props: ComponentProps, includeEditControls: boolean = true): string {
    logger.info(`🏗️ generateComponentHTML called: ${componentType}:${componentId}`);
    logger.info('🏗️ Props received:', props);
    
    const generators: { [key: string]: { [key: string]: (props: ComponentProps) => string } } = {
      header: {
        minimal: this.generateMinimalHeader,
        luxury: this.generateLuxuryHeader,
        playful: this.generatePlayfulHeader,
        'vibrant-bold': this.generateVibrantHeader,
        classic: this.generateClassicHeader,
        boutique: this.generateBoutiqueHeader,
        natural: this.generateNaturalHeader,
        'tech-modern': this.generateTechHeader,
        // Warm & Approachable variants
        'cozy-neighborhood': this.generateWarmApproachableHeader,
        'family-first': this.generateWarmApproachableHeader,
        'community-hub': this.generateWarmApproachableHeader,
        'accessible-care': this.generateWarmApproachableHeader,
        // Modern & Minimal variants
        'clean-efficiency': this.generateMinimalHeader,
        'modern-professional': this.generateMinimalHeader,
        'streamlined-service': this.generateMinimalHeader,
        'contemporary-design': this.generateMinimalHeader
      },
      hero: {
        'warm-community': this.generateWarmHero,
        'luxury-immersive': this.generateLuxuryHero,
        'splitLayout': this.generateSplitLayoutHero,
        'family-focused': this.generateFamilyFocusedHero,
        'professional-efficient': this.generateProfessionalEfficientHero,
        'luxury-experience': this.generateLuxuryExperienceHero,
        'trendy-creative': this.generateTrendyCreativeHero,
        'vibrant-energetic': this.generateVibrantHero,
        'classic-formal': this.generateClassicHero,
        'boutique-intimate': this.generateBoutiqueHero,
        'eco-natural': this.generateEcoHero,
        'tech-futuristic': this.generateTechHero,
        // Warm & Approachable variants
        'welcoming-community': this.generateWarmHero,
        'affordable-quality': this.generateWarmHero,
        'comfort-focused': this.generateWarmHero,
        'personal-touch': this.generateWarmHero,
        'local-love': this.generateWarmHero,
        // Modern & Minimal variants
        'efficiency-focused': this.generateProfessionalEfficientHero,
        'design-excellence': this.generateProfessionalEfficientHero,
        'time-conscious': this.generateProfessionalEfficientHero,
        'contemporary-styling': this.generateProfessionalEfficientHero,
        'quality-driven': this.generateProfessionalEfficientHero
      },
      features: {
        'service-showcase': this.generateServiceShowcase,
        'color-showcase': this.generateColorShowcase,
        'booking-showcase': this.generateBookingShowcase,
        'customer-showcase': this.generateCustomerShowcase,
        'gallery-showcase': this.generateGalleryShowcase,
        'marketing-showcase': this.generateMarketingShowcase,
        'social-showcase': this.generateSocialShowcase,
        'wellness-showcase': this.generateWellnessShowcase,
        // Warm & Approachable variants
        'family-services': this.generateServiceShowcase,
        'affordable-options': this.generateServiceShowcase,
        'comfort-amenities': this.generateServiceShowcase,
        'neighborhood-perks': this.generateServiceShowcase,
        // Modern & Minimal variants
        'streamlined-services': this.generateServiceShowcase,
        'technology-integration': this.generateServiceShowcase,
        'efficiency-systems': this.generateServiceShowcase,
        'quality-standards': this.generateServiceShowcase
      }
    }

    const componentGenerator = generators[componentType]?.[componentId]
    if (!componentGenerator) {
      logger.warn(`No generator found for ${componentType}:${componentId}`);
      return ''
    }

    logger.info(`🏗️ Calling generator for ${componentType}:${componentId}`);
    const result = componentGenerator(props)
    logger.info(`🏗️ Generator result (first 100 chars);: ${result.substring(0, 100)}...`)
    
    // Debug: Check if badge is in the result for hero components
    if (componentType === 'hero' && props.badge) {
      const badgeInResult = result.includes(props.badge)
      logger.info(`🏷️ Badge "${props.badge}" found in generated HTML: ${badgeInResult}`);
      if (!badgeInResult) {
        logger.warn(`⚠️ Badge "${props.badge}" NOT found in generated HTML!`);
      }
    }

    // Inject edit capabilities directly into the generated HTML
    if (includeEditControls) {
      return ComponentRenderer.wrapWithEditControls(result, componentType, componentId)
    }
    
    return result
  }

  // Header Components
  private static generateMinimalHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: var(--color-surface); border-bottom: 1px solid rgba(37, 99, 235, 0.2); padding: 1rem 0; position: sticky; top: 0; z-index: 1000; backdrop-filter: blur(10px);">
        <div style="max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 2rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; background: var(--gradient-primary); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">{{logoIcon}}</div>
            <div style="font-size: 1.25rem; font-weight: 600; color: var(--color-text-primary);">{{businessName}}</div>
          </div>
          <nav style="display: flex; gap: 2rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="color: var(--color-text-secondary); text-decoration: none; font-weight: 500; transition: color 0.3s;" onmouseover="this.style.color='var(--color-text-accent)'" onmouseout="this.style.color='var(--color-text-secondary)'">{{label}}</a>{{/navItems}}
            <button style="background: var(--gradient-primary); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 500; cursor: pointer; transition: transform 0.3s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">{{ctaText}}</button>
          </nav>
        </div>
      </header>
    `, props)
  }

  private static generateLuxuryHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(20,20,20,0.9) 100%); backdrop-filter: blur(20px); border-bottom: 2px solid transparent; border-image: linear-gradient(90deg, transparent, var(--color-primary), transparent) 1; padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="width: 50px; height: 50px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(212, 175, 55, 0.4);">
              <span style="font-size: 1.5rem; color: var(--color-accent);">{{logoIcon}}</span>
            </div>
            <div>
              <div style="font-size: 1.8rem; font-weight: 700; letter-spacing: 2px; color: var(--color-primary); font-family: 'Playfair Display', serif; line-height: 1;">{{businessName}}</div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary); letter-spacing: 3px; margin-top: 2px;">{{tagline}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2.5rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="color: var(--color-text-secondary); text-decoration: none; font-weight: 400; letter-spacing: 0.5px; transition: all 0.3s; position: relative; padding: 0.5rem 0;" onmouseover="this.style.color='var(--color-primary)'" onmouseout="this.style.color='var(--color-text-secondary)'">{{label}}</a>{{/navItems}}
            <a href="#" style="background: var(--gradient-primary); color: var(--color-accent); padding: 0.875rem 2.5rem; border-radius: 50px; font-weight: 600; text-decoration: none; letter-spacing: 0.5px; box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4); transition: all 0.3s; border: 1px solid rgba(255,255,255,0.1);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(212, 175, 55, 0.6)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 20px rgba(212, 175, 55, 0.4)'">{{ctaText}}</a>
          </nav>
        </div>
      </header>
    `, props)
  }

  private static generatePlayfulHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: var(--gradient-secondary); backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(255, 107, 107, 0.1); padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; border-bottom: 3px solid transparent; border-image: linear-gradient(90deg, var(--color-primary), var(--color-secondary), var(--color-accent)) 1;">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="position: relative; width: 55px; height: 55px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3); overflow: hidden;">
              <span style="font-size: 1.8rem; animation: bounce 2s infinite;">{{logoIcon}}</span>
            </div>
            <div>
              <div style="font-size: 2rem; font-weight: 800; color: var(--color-primary); font-family: 'Nunito', sans-serif; line-height: 1; letter-spacing: -0.5px;">{{businessName}}</div>
              <div style="font-size: 0.8rem; color: var(--color-secondary); font-weight: 600; letter-spacing: 2px; margin-top: 2px;">{{subtitle}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2.5rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-primary); text-decoration: none; font-weight: 600; transition: all 0.3s; padding: 0.5rem 1rem; border-radius: 12px;" onmouseover="this.style.background='rgba(255, 107, 107, 0.1)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='transparent'; this.style.transform='translateY(0)'"><span style="font-size: 1.1rem;">{{emoji}}</span>{{label}}</a>{{/navItems}}
            <a href="#" style="display: flex; align-items: center; gap: 0.5rem; background: var(--gradient-primary); color: white; padding: 0.875rem 2rem; border-radius: 25px; text-decoration: none; font-weight: 700; box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4); transition: all 0.3s; border: 2px solid rgba(255, 255, 255, 0.2);" onmouseover="this.style.transform='translateY(-3px) scale(1.05)'; this.style.boxShadow='0 10px 30px rgba(255, 107, 107, 0.5)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 6px 20px rgba(255, 107, 107, 0.4)'"><span style="font-size: 1.2rem;">{{ctaEmoji}}</span>{{ctaText}}</a>
          </nav>
        </div>
      </header>
    `, props)
  }

  private static generateVibrantHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: linear-gradient(135deg, var(--color-background) 0%, rgba(139, 92, 246, 0.1) 100%); border-bottom: 3px solid transparent; border-image: linear-gradient(90deg, var(--color-primary), var(--color-secondary), var(--color-accent)) 1; padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; backdrop-filter: blur(20px);">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="width: 60px; height: 60px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4); position: relative; overflow: hidden;">
              <span style="font-size: 2rem; animation: bounce 1.5s infinite;">{{logoIcon}}</span>
              <div style="position: absolute; inset: 0; background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.2), transparent); animation: shimmer 2s linear infinite;"></div>
            </div>
            <div>
              <div style="font-size: 2.2rem; font-weight: 800; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-family: 'Inter', sans-serif; line-height: 1; letter-spacing: 1px;">{{businessName}}</div>
              <div style="font-size: 0.9rem; color: var(--color-secondary); font-weight: 600; letter-spacing: 2px; margin-top: 4px;">{{tagline}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="color: var(--color-text-primary); text-decoration: none; font-weight: 600; transition: all 0.3s; padding: 0.75rem 1.5rem; border-radius: 12px; position: relative;" onmouseover="this.style.background='rgba(139, 92, 246, 0.1)'; this.style.transform='translateY(-2px) scale(1.05)'" onmouseout="this.style.background='transparent'; this.style.transform='translateY(0) scale(1)'">{{label}}</a>{{/navItems}}
            <button style="background: var(--gradient-primary); color: white; border: none; padding: 1rem 2.5rem; border-radius: 25px; font-weight: 700; cursor: pointer; transition: all 0.4s; box-shadow: 0 8px 25px rgba(139, 92, 246, 0.3); text-transform: uppercase; letter-spacing: 1px;" onmouseover="this.style.transform='translateY(-4px) scale(1.1)'; this.style.boxShadow='0 15px 35px rgba(139, 92, 246, 0.5)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 25px rgba(139, 92, 246, 0.3)'">{{ctaText}}</button>
          </nav>
        </div>
      </header>
    `, props)
  }

  private static generateWarmApproachableHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: var(--gradient-secondary); backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(255, 107, 107, 0.1); padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; border-bottom: 3px solid transparent; border-image: linear-gradient(90deg, var(--color-primary), var(--color-secondary), var(--color-accent)) 1;">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="position: relative; width: 55px; height: 55px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3); overflow: hidden;">
              <span style="font-size: 1.8rem; animation: bounce 2s infinite;">{{logoIcon}}</span>
            </div>
            <div>
              <div style="font-size: 2rem; font-weight: 800; color: var(--color-primary); font-family: 'Nunito', sans-serif; line-height: 1; letter-spacing: -0.5px;">{{businessName}}</div>
              <div style="font-size: 0.8rem; color: var(--color-secondary); font-weight: 600; letter-spacing: 2px; margin-top: 2px;">{{tagline}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2.5rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-primary); text-decoration: none; font-weight: 600; transition: all 0.3s; padding: 0.5rem 1rem; border-radius: 12px;" onmouseover="this.style.background='rgba(255, 107, 107, 0.1)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='transparent'; this.style.transform='translateY(0)'">{{label}}</a>{{/navItems}}
            <a href="#" style="display: flex; align-items: center; gap: 0.5rem; background: var(--gradient-primary); color: white; padding: 0.875rem 2rem; border-radius: 25px; text-decoration: none; font-weight: 700; box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4); transition: all 0.3s; border: 2px solid rgba(255, 255, 255, 0.2);" onmouseover="this.style.transform='translateY(-3px) scale(1.05)'; this.style.boxShadow='0 10px 30px rgba(255, 107, 107, 0.5)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 6px 20px rgba(255, 107, 107, 0.4)'">{{ctaText}}</a>
          </nav>
        </div>
      </header>
    `, props)
  }

  // Hero Components
  private static generateWarmHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--gradient-accent); min-height: 80vh; display: flex; align-items: center; justify-content: center;">
        <div style="max-width: 1200px; text-align: center;">
          <div style="display: inline-block; background: var(--color-secondary); color: white; padding: 0.75rem 2rem; border-radius: 50px; font-weight: 700; margin-bottom: 2rem;">{{badge}}</div>
          <h1 style="font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 900; line-height: 1.1; color: var(--color-text-primary); margin-bottom: 1.5rem;">{{title}}</h1>
          <p style="font-size: 1.3rem; color: var(--color-text-secondary); margin-bottom: 2.5rem; max-width: 600px; margin-left: auto; margin-right: auto;">{{subtitle}}</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap;">
            <button style="background: var(--gradient-primary); color: white; border: none; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 800; cursor: pointer; transition: all 0.3s;">{{primaryCTA}}</button>
            <button style="border: 3px solid var(--color-primary); background: transparent; color: var(--color-primary); padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 800; cursor: pointer; transition: all 0.3s;">{{secondaryCTA}}</button>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateLuxuryHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center; position: relative; background: var(--gradient-accent); padding: 4rem 2rem;">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 3rem; backdrop-filter: blur(10px);">
            <span style="color: var(--color-primary); font-size: 0.9rem;">✨</span>
            <span style="color: var(--color-primary); font-size: 0.85rem; letter-spacing: 1px; font-weight: 500;">{{badge}}</span>
          </div>
          <h1 style="font-size: clamp(3rem, 8vw, 7rem); font-weight: 200; line-height: 1.1; margin-bottom: 2rem; font-family: 'Playfair Display', serif; color: var(--color-text-primary);">{{title}}</h1>
          <p style="font-size: 1.4rem; color: var(--color-text-secondary); margin-bottom: 3rem; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.6;">{{subtitle}}</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; margin-bottom: 5rem; flex-wrap: wrap;">
            <button style="background: var(--gradient-primary); color: var(--color-accent); border: none; padding: 1.2rem 3.5rem; font-size: 1rem; border-radius: 50px; font-weight: 600; letter-spacing: 1px; cursor: pointer; transition: all 0.4s; box-shadow: 0 8px 30px rgba(212, 175, 55, 0.3);">{{primaryCTA}}</button>
            <button style="border: 2px solid rgba(212, 175, 55, 0.6); background: rgba(212, 175, 55, 0.05); color: var(--color-primary); padding: 1.2rem 3.5rem; font-size: 1rem; border-radius: 50px; font-weight: 500; letter-spacing: 1px; cursor: pointer; transition: all 0.4s; backdrop-filter: blur(10px);">{{secondaryCTA}}</button>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateSplitLayoutHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="min-height: 90vh; background: var(--gradient-accent); display: flex; align-items: center; padding: 4rem 2rem;">
        <div style="max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 5rem; align-items: center;">
          <div>
            <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: var(--color-surface); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 50px; padding: 0.75rem 1.5rem; margin-bottom: 2rem; font-weight: 500; color: var(--color-text-accent);">{{badge}}</div>
            <h1 style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800; line-height: 1.2; color: var(--color-text-primary); margin-bottom: 1.5rem;">{{title}}</h1>
            <p style="font-size: 1.25rem; color: var(--color-text-secondary); margin-bottom: 2.5rem; line-height: 1.6;">{{subtitle}}</p>
            <div style="display: flex; gap: 1rem; margin-bottom: 3rem;">
              <button style="background: var(--gradient-primary); color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.3s;">{{primaryCTA}}</button>
              <button style="background: transparent; color: var(--color-text-accent); border: 2px solid var(--color-primary); padding: 1rem 2rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.3s;">{{secondaryCTA}}</button>
            </div>
            {{#stats}}
            <div style="display: flex; gap: 2rem;">
              <div style="text-align: center;">
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-text-accent);">{{number}}</div>
                <div style="color: var(--color-text-secondary); font-size: 0.9rem;">{{label}}</div>
              </div>
            </div>
            {{/stats}}
          </div>
          <div style="background: var(--color-surface); border-radius: 20px; padding: 3rem; text-align: center;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">🎨</div>
            <div style="color: var(--color-text-secondary);">Visual placeholder</div>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateFamilyFocusedHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: linear-gradient(135deg, #fef7e7 0%, #fef3c7 50%, #fde68a 100%); min-height: 85vh; display: flex; align-items: center; justify-content: center; position: relative;">
        <div style="position: absolute; top: 2rem; left: 2rem; font-size: 3rem; opacity: 0.3;">👨‍👩‍👧‍👦</div>
        <div style="position: absolute; top: 4rem; right: 3rem; font-size: 2rem; opacity: 0.4;">🏠</div>
        <div style="position: absolute; bottom: 3rem; left: 4rem; font-size: 2.5rem; opacity: 0.3;">❤️</div>
        <div style="max-width: 1000px; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(249, 115, 22, 0.1); border: 2px solid rgba(249, 115, 22, 0.3); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 2rem; font-weight: 600; color: #ea580c;">
            <span style="font-size: 1.2rem;">👨‍👩‍👧‍👦</span>
            <span>Perfect for Families</span>
          </div>
          <h1 style="font-size: clamp(2.8rem, 6vw, 4.5rem); font-weight: 800; line-height: 1.1; color: #7c2d12; margin-bottom: 1.5rem; font-family: 'Inter', sans-serif;">Bringing Families Together</h1>
          <p style="font-size: 1.4rem; color: #a16207; margin-bottom: 2.5rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.6;">Creating magical moments and lasting memories for families of all sizes</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 3rem;">
            <button style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; border: none; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 700; cursor: pointer; transition: all 0.3s; box-shadow: 0 6px 20px rgba(249, 115, 22, 0.3);" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 25px rgba(249, 115, 22, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 20px rgba(249, 115, 22, 0.3)'">Start Your Journey</button>
            <button style="border: 3px solid #f97316; background: rgba(249, 115, 22, 0.1); color: #ea580c; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 700; cursor: pointer; transition: all 0.3s; backdrop-filter: blur(10px);" onmouseover="this.style.background='rgba(249, 115, 22, 0.2)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='rgba(249, 115, 22, 0.1)'; this.style.transform='translateY(0)'">Learn More</button>
          </div>
          <div style="display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap;">
            <div style="text-align: center; background: rgba(255, 255, 255, 0.7); padding: 1.5rem; border-radius: 20px; backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎉</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #ea580c; margin-bottom: 0.25rem;">1000+</div>
              <div style="color: #a16207; font-size: 0.9rem; font-weight: 500;">Happy Families</div>
            </div>
            <div style="text-align: center; background: rgba(255, 255, 255, 0.7); padding: 1.5rem; border-radius: 20px; backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">⭐</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #ea580c; margin-bottom: 0.25rem;">4.9/5</div>
              <div style="color: #a16207; font-size: 0.9rem; font-weight: 500;">Family Rating</div>
            </div>
            <div style="text-align: center; background: rgba(255, 255, 255, 0.7); padding: 1.5rem; border-radius: 20px; backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🏆</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #ea580c; margin-bottom: 0.25rem;">Award</div>
              <div style="color: #a16207; font-size: 0.9rem; font-weight: 500;">Best for Families</div>
            </div>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateProfessionalEfficientHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%); min-height: 85vh; display: flex; align-items: center; justify-content: center; position: relative;">
        <div style="position: absolute; top: 2rem; right: 2rem; font-size: 3rem; opacity: 0.2;">💼</div>
        <div style="position: absolute; bottom: 3rem; left: 2rem; font-size: 2.5rem; opacity: 0.2;">⏰</div>
        <div style="position: absolute; top: 50%; left: 5%; font-size: 2rem; opacity: 0.15;">📱</div>
        <div style="max-width: 1100px; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(37, 99, 235, 0.1); border: 2px solid rgba(37, 99, 235, 0.3); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 2rem; font-weight: 600; color: #1d4ed8;">
            <span style="font-size: 1.2rem;">💼</span>
            <span>Built for Professionals</span>
          </div>
          <h1 style="font-size: clamp(2.8rem, 6vw, 4.5rem); font-weight: 800; line-height: 1.1; color: #1e293b; margin-bottom: 1.5rem; font-family: 'Inter', sans-serif;">Efficiency Meets Excellence</h1>
          <p style="font-size: 1.4rem; color: #475569; margin-bottom: 2.5rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.6;">Streamlined services designed for your busy professional lifestyle</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 3rem;">
            <button style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; border: none; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.3s; box-shadow: 0 6px 20px rgba(37, 99, 235, 0.3);" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 25px rgba(37, 99, 235, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 20px rgba(37, 99, 235, 0.3)'">Book Express Service</button>
            <button style="border: 3px solid #2563eb; background: rgba(37, 99, 235, 0.1); color: #1d4ed8; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.3s; backdrop-filter: blur(10px);" onmouseover="this.style.background='rgba(37, 99, 235, 0.2)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='rgba(37, 99, 235, 0.1)'; this.style.transform='translateY(0)'">View Schedule</button>
          </div>
          <div style="display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap;">
            <div style="text-align: center; background: rgba(255, 255, 255, 0.8); padding: 1.5rem; border-radius: 12px; backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid rgba(37, 99, 235, 0.1);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚡</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #1d4ed8; margin-bottom: 0.25rem;">15min</div>
              <div style="color: #475569; font-size: 0.9rem; font-weight: 500;">Express Services</div>
            </div>
            <div style="text-align: center; background: rgba(255, 255, 255, 0.8); padding: 1.5rem; border-radius: 12px; backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid rgba(37, 99, 235, 0.1);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">📱</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #1d4ed8; margin-bottom: 0.25rem;">24/7</div>
              <div style="color: #475569; font-size: 0.9rem; font-weight: 500;">Online Booking</div>
            </div>
            <div style="text-align: center; background: rgba(255, 255, 255, 0.8); padding: 1.5rem; border-radius: 12px; backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid rgba(37, 99, 235, 0.1);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎯</div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #1d4ed8; margin-bottom: 0.25rem;">95%</div>
              <div style="color: #475569; font-size: 0.9rem; font-weight: 500;">On-Time Rate</div>
            </div>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateLuxuryExperienceHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #2a2a2a 100%); min-height: 85vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 2rem; right: 3rem; font-size: 3rem; opacity: 0.3; color: #d4af37;">✨</div>
        <div style="position: absolute; bottom: 4rem; left: 3rem; font-size: 2.5rem; opacity: 0.2; color: #d4af37;">👑</div>
        <div style="position: absolute; top: 30%; right: 8%; font-size: 2rem; opacity: 0.2; color: #d4af37;">💎</div>
        <div style="max-width: 1100px; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(212, 175, 55, 0.1); border: 2px solid rgba(212, 175, 55, 0.4); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 2rem; font-weight: 600; color: #d4af37; backdrop-filter: blur(10px);">
            <span style="font-size: 1.2rem;">👑</span>
            <span>Luxury Experience</span>
          </div>
          <h1 style="font-size: clamp(3rem, 7vw, 5rem); font-weight: 300; line-height: 1.1; color: #ffffff; margin-bottom: 1.5rem; font-family: 'Playfair Display', serif; letter-spacing: 2px;">The Art of Elegance</h1>
          <p style="font-size: 1.4rem; color: #a0a0a0; margin-bottom: 2.5rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.6; font-weight: 300;">Indulge in an unparalleled luxury experience crafted for the discerning clientele</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 3rem;">
            <button style="background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%); color: #000; border: none; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 700; cursor: pointer; transition: all 0.4s; box-shadow: 0 8px 30px rgba(212, 175, 55, 0.3); letter-spacing: 1px;" onmouseover="this.style.transform='translateY(-3px) scale(1.02)'; this.style.boxShadow='0 12px 40px rgba(212, 175, 55, 0.4)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 30px rgba(212, 175, 55, 0.3)'">Reserve Private Suite</button>
            <button style="border: 2px solid #d4af37; background: rgba(212, 175, 55, 0.1); color: #d4af37; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 600; cursor: pointer; transition: all 0.4s; backdrop-filter: blur(20px); letter-spacing: 1px;" onmouseover="this.style.background='rgba(212, 175, 55, 0.2)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='rgba(212, 175, 55, 0.1)'; this.style.transform='translateY(0)'">Explore Services</button>
          </div>
          <div style="display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap;">
            <div style="text-align: center; background: rgba(212, 175, 55, 0.1); padding: 2rem 1.5rem; border-radius: 20px; backdrop-filter: blur(20px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); border: 1px solid rgba(212, 175, 55, 0.2);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem; color: #d4af37;">🏆</div>
              <div style="font-size: 1.8rem; font-weight: 600; color: #d4af37; margin-bottom: 0.25rem; font-family: 'Playfair Display', serif;">Award</div>
              <div style="color: #a0a0a0; font-size: 0.9rem; font-weight: 400;">Winning Excellence</div>
            </div>
            <div style="text-align: center; background: rgba(212, 175, 55, 0.1); padding: 2rem 1.5rem; border-radius: 20px; backdrop-filter: blur(20px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); border: 1px solid rgba(212, 175, 55, 0.2);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem; color: #d4af37;">✨</div>
              <div style="font-size: 1.8rem; font-weight: 600; color: #d4af37; margin-bottom: 0.25rem; font-family: 'Playfair Display', serif;">VIP</div>
              <div style="color: #a0a0a0; font-size: 0.9rem; font-weight: 400;">Private Suites</div>
            </div>
            <div style="text-align: center; background: rgba(212, 175, 55, 0.1); padding: 2rem 1.5rem; border-radius: 20px; backdrop-filter: blur(20px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); border: 1px solid rgba(212, 175, 55, 0.2);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem; color: #d4af37;">👑</div>
              <div style="font-size: 1.8rem; font-weight: 600; color: #d4af37; margin-bottom: 0.25rem; font-family: 'Playfair Display', serif;">Master</div>
              <div style="color: #a0a0a0; font-size: 0.9rem; font-weight: 400;">Stylists</div>
            </div>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateTrendyCreativeHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 25%, #ec4899 50%, #f97316 75%, #eab308 100%); min-height: 85vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 1rem; left: 2rem; font-size: 3rem; opacity: 0.4; animation: bounce 2s infinite;">🎨</div>
        <div style="position: absolute; top: 3rem; right: 3rem; font-size: 2.5rem; opacity: 0.3; animation: bounce 2s infinite 0.5s;">✂️</div>
        <div style="position: absolute; bottom: 2rem; left: 4rem; font-size: 2rem; opacity: 0.4; animation: bounce 2s infinite 1s;">🌈</div>
        <div style="position: absolute; bottom: 4rem; right: 2rem; font-size: 2.5rem; opacity: 0.3; animation: bounce 2s infinite 1.5s;">⚡</div>
        <div style="max-width: 1100px; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255, 255, 255, 0.9); border: 3px solid rgba(255, 255, 255, 0.8); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 2rem; font-weight: 700; color: #7c3aed; backdrop-filter: blur(10px);">
            <span style="font-size: 1.2rem;">🔥</span>
            <span>Trending Now</span>
          </div>
          <h1 style="font-size: clamp(3rem, 7vw, 5rem); font-weight: 900; line-height: 1.1; color: #ffffff; margin-bottom: 1.5rem; font-family: 'Inter', sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); letter-spacing: -1px;">Express Your Vibe</h1>
          <p style="font-size: 1.4rem; color: rgba(255, 255, 255, 0.9); margin-bottom: 2.5rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.6; font-weight: 600; text-shadow: 1px 1px 2px rgba(0,0,0,0.2);">Bold colors, creative cuts, and trendsetting styles for the fashion-forward generation</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 3rem;">
            <button style="background: rgba(255, 255, 255, 0.95); color: #7c3aed; border: none; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 25px; font-weight: 800; cursor: pointer; transition: all 0.3s; box-shadow: 0 8px 25px rgba(0,0,0,0.2); text-transform: uppercase; letter-spacing: 1px;" onmouseover="this.style.transform='translateY(-4px) scale(1.05)'; this.style.boxShadow='0 12px 35px rgba(0,0,0,0.3)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.2)'">Book Color Session</button>
            <button style="border: 3px solid rgba(255, 255, 255, 0.8); background: rgba(255, 255, 255, 0.1); color: white; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 25px; font-weight: 700; cursor: pointer; transition: all 0.3s; backdrop-filter: blur(20px); text-transform: uppercase; letter-spacing: 1px;" onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.transform='translateY(-3px)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.transform='translateY(0)'">See Trends</button>
          </div>
          <div style="display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap;">
            <div style="text-align: center; background: rgba(255, 255, 255, 0.15); padding: 2rem 1.5rem; border-radius: 20px; backdrop-filter: blur(20px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); border: 2px solid rgba(255, 255, 255, 0.2);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🌈</div>
              <div style="font-size: 1.8rem; font-weight: 800; color: white; margin-bottom: 0.25rem;">50+</div>
              <div style="color: rgba(255, 255, 255, 0.8); font-size: 0.9rem; font-weight: 600;">Color Options</div>
            </div>
            <div style="text-align: center; background: rgba(255, 255, 255, 0.15); padding: 2rem 1.5rem; border-radius: 20px; backdrop-filter: blur(20px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); border: 2px solid rgba(255, 255, 255, 0.2);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔥</div>
              <div style="font-size: 1.8rem; font-weight: 800; color: white; margin-bottom: 0.25rem;">Trending</div>
              <div style="color: rgba(255, 255, 255, 0.8); font-size: 0.9rem; font-weight: 600;">Styles Weekly</div>
            </div>
            <div style="text-align: center; background: rgba(255, 255, 255, 0.15); padding: 2rem 1.5rem; border-radius: 20px; backdrop-filter: blur(20px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); border: 2px solid rgba(255, 255, 255, 0.2);">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚡</div>
              <div style="font-size: 1.8rem; font-weight: 800; color: white; margin-bottom: 0.25rem;">Instant</div>
              <div style="color: rgba(255, 255, 255, 0.8); font-size: 0.9rem; font-weight: 600;">Makeovers</div>
            </div>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateVibrantHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="min-height: 90vh; background: linear-gradient(45deg, #8A2BE2 0%, #FF1493 25%, #FF4500 50%, #32CD32 75%, #00FFFF 100%); background-size: 300% 300%; animation: vibrantFlow 8s ease-in-out infinite; display: flex; align-items: center; padding: 4rem 2rem; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 1rem; left: 2rem; font-size: 4rem; opacity: 0.4; animation: bounce 2s infinite;">💫</div>
        <div style="position: absolute; top: 3rem; right: 3rem; font-size: 3rem; opacity: 0.3; animation: bounce 2s infinite 0.5s;">⚡</div>
        <div style="position: absolute; bottom: 2rem; left: 4rem; font-size: 3rem; opacity: 0.4; animation: bounce 2s infinite 1s;">🔥</div>
        <div style="position: absolute; bottom: 4rem; right: 2rem; font-size: 3rem; opacity: 0.3; animation: bounce 2s infinite 1.5s;">✨</div>
        <div style="max-width: 1200px; margin: 0 auto; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255, 255, 255, 0.9); border: 3px solid rgba(255, 255, 255, 0.8); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 3rem; font-weight: 700; color: #8A2BE2; backdrop-filter: blur(10px); box-shadow: 0 0 30px rgba(255, 20, 147, 0.3);">
            <span style="font-size: 1.2rem;">💥</span>
            <span style="text-transform: uppercase; letter-spacing: 1px;">{{badge}}</span>
          </div>
          <h1 style="font-size: clamp(3.5rem, 8vw, 7rem); font-weight: 900; line-height: 1.1; background: linear-gradient(45deg, #FFFFFF, #00FFFF, #FF1493, #FFFFFF); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 2rem; font-family: 'Impact', sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); letter-spacing: -2px; text-transform: uppercase;">{{title}}</h1>
          <p style="font-size: 1.4rem; color: rgba(255, 255, 255, 0.95); margin-bottom: 3rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.6; font-weight: 600; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">{{subtitle}}</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap;">
            <button style="background: rgba(255, 255, 255, 0.95); color: #8A2BE2; border: none; padding: 1.5rem 3.5rem; font-size: 1.3rem; border-radius: 25px; font-weight: 800; cursor: pointer; transition: all 0.3s; box-shadow: 0 10px 30px rgba(0,0,0,0.3); text-transform: uppercase; letter-spacing: 1px; font-family: 'Impact', sans-serif;" onmouseover="this.style.transform='translateY(-5px) scale(1.1)'; this.style.boxShadow='0 15px 40px rgba(0,0,0,0.4)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.3)'">{{primaryCTA}}</button>
            <button style="border: 3px solid rgba(255, 255, 255, 0.8); background: rgba(255, 255, 255, 0.1); color: white; padding: 1.5rem 3.5rem; font-size: 1.3rem; border-radius: 25px; font-weight: 700; cursor: pointer; transition: all 0.3s; backdrop-filter: blur(20px); text-transform: uppercase; letter-spacing: 1px; font-family: 'Impact', sans-serif;" onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'; this.style.transform='translateY(-4px)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.transform='translateY(0)'">{{secondaryCTA}}</button>
          </div>
        </div>
      </section>
    `, props)
  }

  // Additional Header Components
  private static generateClassicHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: rgba(27, 41, 81, 0.9); backdrop-filter: blur(15px); border-bottom: 3px solid #B8860B; padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; box-shadow: 0 4px 20px rgba(184, 134, 11, 0.3);">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="width: 50px; height: 50px; background: linear-gradient(45deg, #B8860B, #800020); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 1.5rem; color: #F5F5DC;">{{logoIcon}}</span>
            </div>
            <div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #B8860B; font-family: 'Playfair Display', serif;">{{businessName}}</div>
              <div style="font-size: 0.75rem; color: #F5F5DC; letter-spacing: 2px;">{{tagline}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2.5rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="color: #F5F5DC; text-decoration: none; font-weight: 500; transition: color 0.3s;">{{label}}</a>{{/navItems}}
            <button style="background: linear-gradient(45deg, #800020, #1B2951); border: 2px solid #B8860B; color: #F5F5DC; padding: 0.875rem 2rem; border-radius: 8px; font-weight: 600;">{{ctaText}}</button>
          </nav>
        </div>
      </header>
    `, props)
  }

  private static generateBoutiqueHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: rgba(248, 248, 255, 0.85); backdrop-filter: blur(25px); border: 1px solid rgba(192, 192, 192, 0.3); border-radius: 15px; margin: 20px; padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; box-shadow: 0 8px 32px rgba(192, 192, 192, 0.2);">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="width: 45px; height: 45px; background: linear-gradient(45deg, #E8D5D5, #F0E6FF); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 1.3rem; color: #4A4A4A;">{{logoIcon}}</span>
            </div>
            <div>
              <div style="font-size: 1.6rem; font-weight: 400; color: #4A4A4A; font-family: 'Cormorant Garamond', serif; font-style: italic;">{{businessName}}</div>
              <div style="font-size: 0.7rem; color: #C0C0C0; letter-spacing: 2px; text-transform: uppercase;">{{tagline}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="color: #4A4A4A; text-decoration: none; font-weight: 500; transition: color 0.3s; font-family: 'Cormorant Garamond', serif;">{{label}}</a>{{/navItems}}
            <button style="background: linear-gradient(45deg, #E8D5D5, #F7E7E7); border: 1px solid #C0C0C0; color: #4A4A4A; padding: 0.75rem 2rem; border-radius: 30px; font-weight: 500; font-family: 'Cormorant Garamond', serif;">{{ctaText}}</button>
          </nav>
        </div>
      </header>
    `, props)
  }

  private static generateNaturalHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: rgba(245, 245, 220, 0.9); backdrop-filter: blur(15px); border: 2px solid #87A96B; border-radius: 25px; padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; box-shadow: 0 8px 25px rgba(45, 80, 22, 0.2);">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="width: 50px; height: 50px; background: linear-gradient(45deg, #87A96B, #2D5016); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 1.5rem; color: white;">{{logoIcon}}</span>
            </div>
            <div>
              <div style="font-size: 1.8rem; font-weight: 700; color: #2D5016; font-family: 'Merriweather', serif;">{{businessName}}</div>
              <div style="font-size: 0.75rem; color: #87A96B; letter-spacing: 2px; text-transform: uppercase;">{{tagline}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2.5rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="color: #2D5016; text-decoration: none; font-weight: 600; transition: color 0.3s;">{{label}}</a>{{/navItems}}
            <button style="background: linear-gradient(45deg, #87A96B, #8FBC8F); border: 2px solid #2D5016; color: white; padding: 0.875rem 2rem; border-radius: 50px; font-weight: 600;">{{ctaText}}</button>
          </nav>
        </div>
      </header>
    `, props)
  }

  private static generateTechHeader(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <header style="background: rgba(10, 10, 10, 0.9); backdrop-filter: blur(20px); border: 2px solid #00FFFF; border-radius: 10px; padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; box-shadow: 0 0 30px #00FFFF, 0 8px 32px rgba(0, 128, 255, 0.3);">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div style="width: 60px; height: 60px; background: linear-gradient(45deg, #00FFFF, #0080FF); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 25px #00FFFF;">
              <span style="font-size: 2rem; color: #0A0A0A;">{{logoIcon}}</span>
            </div>
            <div>
              <div style="font-size: 2rem; font-weight: 700; color: #00FFFF; font-family: 'Orbitron', monospace; text-transform: uppercase; letter-spacing: 1px;">{{businessName}}</div>
              <div style="font-size: 0.8rem; color: #00FF41; letter-spacing: 2px; text-transform: uppercase;">{{tagline}}</div>
            </div>
          </div>
          <nav style="display: flex; gap: 2rem; align-items: center;">
            {{#navItems}}<a href="{{url}}" style="color: #C0C0C0; text-decoration: none; font-weight: 600; transition: color 0.3s; font-family: 'Orbitron', monospace;">{{label}}</a>{{/navItems}}
            <button style="background: linear-gradient(45deg, #0080FF, #00FFFF); border: 2px solid #00FF41; color: #0A0A0A; padding: 1rem 2.5rem; border-radius: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-family: 'Orbitron', monospace;">{{ctaText}}</button>
          </nav>
        </div>
      </header>
    `, props)
  }

  // Additional Hero Components
  private static generateClassicHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="min-height: 90vh; background: linear-gradient(135deg, #1B2951 0%, #2C3E50 50%, #800020 100%); display: flex; align-items: center; padding: 4rem 2rem; position: relative;">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(27, 41, 81, 0.8); border: 2px solid #B8860B; border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 3rem; backdrop-filter: blur(10px);">
            <span style="color: #B8860B; font-size: 0.9rem;">👑</span>
            <span style="color: #F5F5DC; font-size: 0.85rem; letter-spacing: 1px; font-weight: 600;">{{badge}}</span>
          </div>
          <h1 style="font-size: clamp(3rem, 7vw, 5rem); font-weight: 700; line-height: 1.1; color: #B8860B; margin-bottom: 2rem; font-family: 'Playfair Display', serif;">{{title}}</h1>
          <p style="font-size: 1.3rem; color: #F5F5DC; margin-bottom: 3rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.8; font-style: italic;">{{subtitle}}</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap;">
            <button style="background: linear-gradient(45deg, #800020, #1B2951); border: 2px solid #B8860B; color: #F5F5DC; padding: 1.2rem 3rem; border-radius: 8px; font-weight: 600; letter-spacing: 1px; font-family: 'Playfair Display', serif;">{{primaryCTA}}</button>
            <button style="border: 2px solid #B8860B; background: rgba(184, 134, 11, 0.1); color: #B8860B; padding: 1.2rem 3rem; border-radius: 8px; font-weight: 500; letter-spacing: 1px; font-family: 'Playfair Display', serif;">{{secondaryCTA}}</button>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateBoutiqueHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="min-height: 85vh; background: linear-gradient(135deg, #F8F8FF 0%, #F7E7E7 30%, #E8F4E8 60%, #F0E6FF 100%); display: flex; align-items: center; padding: 4rem 2rem; position: relative;">
        <div style="max-width: 1000px; margin: 0 auto; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(248, 248, 255, 0.8); border: 1px solid rgba(192, 192, 192, 0.3); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 3rem; backdrop-filter: blur(10px);">
            <span style="color: #C0C0C0; font-size: 0.9rem;">✨</span>
            <span style="color: #4A4A4A; font-size: 0.85rem; letter-spacing: 1px; font-weight: 500; text-transform: uppercase;">{{badge}}</span>
          </div>
          <h1 style="font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 400; line-height: 1.2; color: #4A4A4A; margin-bottom: 2rem; font-family: 'Cormorant Garamond', serif; font-style: italic; letter-spacing: 0.05em;">{{title}}</h1>
          <p style="font-size: 1.2rem; color: #4A4A4A; margin-bottom: 3rem; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.8; font-style: italic; letter-spacing: 0.02em;">{{subtitle}}</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap;">
            <button style="background: linear-gradient(45deg, #E8D5D5, #F7E7E7); border: 1px solid #C0C0C0; color: #4A4A4A; padding: 1rem 2.5rem; border-radius: 30px; font-weight: 500; letter-spacing: 0.1em; font-family: 'Cormorant Garamond', serif;">{{primaryCTA}}</button>
            <button style="border: 1px solid #C0C0C0; background: transparent; color: #4A4A4A; padding: 1rem 2.5rem; border-radius: 30px; font-weight: 500; letter-spacing: 0.1em; font-family: 'Cormorant Garamond', serif;">{{secondaryCTA}}</button>
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateEcoHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="min-height: 85vh; background: linear-gradient(135deg, #87CEEB 0%, #F5F5DC 20%, #87A96B 60%, #2D5016 100%); display: flex; align-items: center; padding: 4rem 2rem; position: relative;">
        <div style="position: absolute; top: 2rem; right: 3rem; font-size: 3rem; opacity: 0.3; color: #2D5016;">🌿</div>
        <div style="position: absolute; bottom: 3rem; left: 2rem; font-size: 2.5rem; opacity: 0.2; color: #87A96B;">🌱</div>
        <div style="max-width: 1100px; margin: 0 auto; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(245, 245, 220, 0.9); border: 2px solid #87A96B; border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 3rem; backdrop-filter: blur(10px);">
            <span style="color: #2D5016; font-size: 1rem;">🌿</span>
            <span style="color: #2D5016; font-size: 0.85rem; letter-spacing: 1px; font-weight: 600;">{{badge}}</span>
          </div>
          <h1 style="font-size: clamp(3rem, 7vw, 4.5rem); font-weight: 700; line-height: 1.1; color: #2D5016; margin-bottom: 2rem; font-family: 'Merriweather', serif;">{{title}}</h1>
          <p style="font-size: 1.3rem; color: #2D5016; margin-bottom: 3rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.8; font-weight: 400;">{{subtitle}}</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 3rem;">
            <button style="background: linear-gradient(45deg, #87A96B, #8FBC8F); border: 2px solid #2D5016; color: white; padding: 1.25rem 3rem; border-radius: 50px; font-weight: 600; font-family: 'Merriweather', serif;">{{primaryCTA}}</button>
            <button style="border: 2px solid #87A96B; background: rgba(135, 169, 107, 0.1); color: #2D5016; padding: 1.25rem 3rem; border-radius: 50px; font-weight: 600; font-family: 'Merriweather', serif;">{{secondaryCTA}}</button>
          </div>
          {{#ecoFeatures}}
          <div style="display: flex; justify-content: center; gap: 2rem; flex-wrap: wrap;">
            <div style="background: rgba(245, 245, 220, 0.8); border: 2px solid #87A96B; border-radius: 20px; padding: 1.5rem; backdrop-filter: blur(10px);">
              <span style="color: #2D5016; font-weight: 600;">{{.}}</span>
            </div>
          </div>
          {{/ecoFeatures}}
        </div>
      </section>
    `, props)
  }

  private static generateTechHero(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="min-height: 90vh; background: linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 30%, #001122 70%, #0A0A0A 100%); display: flex; align-items: center; padding: 4rem 2rem; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 2rem; right: 3rem; font-size: 3rem; opacity: 0.4; color: #00FFFF;">⚡</div>
        <div style="position: absolute; bottom: 3rem; left: 2rem; font-size: 2.5rem; opacity: 0.3; color: #00FF41;">🚀</div>
        <div style="max-width: 1200px; margin: 0 auto; text-align: center; z-index: 10;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(10, 10, 10, 0.8); border: 2px solid #00FFFF; border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 3rem; backdrop-filter: blur(10px); box-shadow: 0 0 20px #00FFFF;">
            <span style="color: #00FF41; font-size: 1rem;">🤖</span>
            <span style="color: #00FFFF; font-size: 0.85rem; letter-spacing: 1px; font-weight: 600; text-transform: uppercase;">{{badge}}</span>
          </div>
          <h1 style="font-size: clamp(3rem, 8vw, 6rem); font-weight: 700; line-height: 1.1; background: linear-gradient(45deg, #00FFFF, #0080FF, #00FF41); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 2rem; font-family: 'Orbitron', monospace; letter-spacing: 0.1em; text-transform: uppercase;">{{title}}</h1>
          <p style="font-size: 1.3rem; color: #C0C0C0; margin-bottom: 3rem; max-width: 700px; margin-left: auto; margin-right: auto; line-height: 1.6; font-weight: 400; letter-spacing: 0.05em;">{{subtitle}}</p>
          <div style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 3rem;">
            <button style="background: linear-gradient(45deg, #0080FF, #00FFFF); border: 2px solid #00FF41; color: #0A0A0A; padding: 1.25rem 3rem; border-radius: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-family: 'Orbitron', monospace; box-shadow: 0 0 25px #00FFFF;">{{primaryCTA}}</button>
            <button style="border: 2px solid #00FFFF; background: rgba(0, 255, 255, 0.1); color: #00FFFF; padding: 1.25rem 3rem; border-radius: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-family: 'Orbitron', monospace; backdrop-filter: blur(10px);">{{secondaryCTA}}</button>
          </div>
          {{#techFeatures}}
          <div style="display: flex; justify-content: center; gap: 2rem; flex-wrap: wrap;">
            <div style="background: rgba(10, 10, 10, 0.8); border: 1px solid #0080FF; border-radius: 15px; padding: 1.5rem; backdrop-filter: blur(15px); box-shadow: 0 0 25px rgba(0, 128, 255, 0.3);">
              <span style="color: #C0C0C0; font-weight: 600; letter-spacing: 0.05em;">{{.}}</span>
            </div>
          </div>
          {{/techFeatures}}
        </div>
      </section>
    `, props)
  }

  // Feature Components
  private static generateServiceShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Our Services</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
            {{#primaryServices}}
            <div style="background: white; border-radius: 12px; padding: 2rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease; border: 1px solid var(--color-border);" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="font-size: 3rem; margin-bottom: 1rem;">{{icon}}</div>
              <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary);">{{name}}</h3>
              <p style="color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">{{description}}</p>
              <div style="font-size: 1.1rem; font-weight: 600; color: var(--color-primary);">{{price}}</div>
            </div>
            {{/primaryServices}}
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateColorShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Color Services</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem;">
            {{#colorServices}}
            <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="height: 200px; background: linear-gradient(135deg, #f1c40f, #e67e22, #e74c3c); display: flex; align-items: center; justify-content: center; color: white; font-size: 2rem;">🎨</div>
              <div style="padding: 2rem;">
                <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary);">{{name}}</h3>
                <p style="color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">{{description}}</p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                  <button style="background: var(--color-primary); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer;">Book Now</button>
                  <button style="border: 2px solid var(--color-primary); background: transparent; color: var(--color-primary); padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer;">Learn More</button>
                </div>
              </div>
            </div>
            {{/colorServices}}
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateBookingShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Booking Features</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
            {{#bookingFeatures}}
            <div style="background: white; border-radius: 12px; padding: 2rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="font-size: 3rem; margin-bottom: 1rem;">{{icon}}</div>
              <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary);">{{name}}</h3>
              <p style="color: var(--color-text-secondary); line-height: 1.6;">{{description}}</p>
            </div>
            {{/bookingFeatures}}
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateCustomerShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Customer Experience</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
            {{#customerFeatures}}
            <div style="background: white; border-radius: 12px; padding: 2rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="font-size: 3rem; margin-bottom: 1rem;">{{icon}}</div>
              <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary);">{{title}}</h3>
              <p style="color: var(--color-text-secondary); line-height: 1.6;">{{description}}</p>
            </div>
            {{/customerFeatures}}
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateGalleryShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Our Work</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
            {{#galleryTypes}}
            <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="height: 200px; background: linear-gradient(135deg, var(--color-primary), var(--color-secondary, #e0e0e0)); display: flex; align-items: center; justify-content: center; color: white; font-size: 2rem;">{{icon}}</div>
              <div style="padding: 1.5rem;">
                <h3 style="font-size: 1.2rem; font-weight: 600; color: var(--color-text-primary);">{{type}}</h3>
              </div>
            </div>
            {{/galleryTypes}}
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateMarketingShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Marketing Tools</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
            {{#marketingTools}}
            <div style="background: white; border-radius: 12px; padding: 2rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="font-size: 3rem; margin-bottom: 1rem;">{{icon}}</div>
              <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary);">{{tool}}</h3>
              <p style="color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">{{description}}</p>
              <div style="color: var(--color-primary); font-weight: 600;">{{features}}</div>
            </div>
            {{/marketingTools}}
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateSocialShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Social Features</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
            {{#socialFeatures}}
            <div style="background: white; border-radius: 12px; padding: 2rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="font-size: 3rem; margin-bottom: 1rem;">{{icon}}</div>
              <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary);">{{platform}}</h3>
              <p style="color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">{{description}}</p>
              <div style="color: var(--color-primary); font-weight: 600; font-size: 0.9rem;">{{features}}</div>
            </div>
            {{/socialFeatures}}
          </div>
        </div>
      </section>
    `, props)
  }

  private static generateWellnessShowcase(props: ComponentProps): string {
    return ComponentRenderer.interpolate(`
      <section style="padding: 4rem 2rem; background: var(--color-surface);">
        <div style="max-width: 1200px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 3rem;">Wellness Services</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
            {{#treatments}}
            <div style="background: white; border-radius: 12px; padding: 2rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="font-size: 3rem; margin-bottom: 1rem;">{{icon}}</div>
              <h3 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary);">{{name}}</h3>
              <p style="color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">{{description}}</p>
              <div style="color: var(--color-primary); font-weight: 600;">{{benefits}}</div>
            </div>
            {{/treatments}}
          </div>
        </div>
      </section>
    `, props)
  }
}