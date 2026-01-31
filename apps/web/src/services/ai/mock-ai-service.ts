// Mock AI Service - Simulates external AI with ideal responses
// This service provides the API architecture for real AI integration
// while serving hardcoded ideal responses for development

import { PREVIEW_IMPACTS } from '../mock/preview-impacts'
// import { createResponsiveSystem } from './ai-powered-responsive-system'
// import { createSectionAwareResponsiveSystem } from './section-aware-responsive-system'
import { createCurrentSectionExtractor } from './current-section-extractor'
import { getSalonResponse } from './mock-responses/salon'
import { salonMockResponses } from './mock-responses/salon-responses'
import {
  AIComponentRequest,
  AIComponentResponse,
  AIContentRequest,
  AIContentResponse,
  AIIntegrationRequest,
  AIIntegrationResponse,
  AILayoutRequest,
  AILayoutResponse
} from './mock-responses/types'
import { SimplifiedAIService } from './simplified-ai-service'
import { logger } from '@/utils/logger';

export class MockAIService {
  private responses: Map<string, any> = new Map()
  private requestHistory: Array<{ request: any; response: any; timestamp: number }> = []
  private responsiveSystem: any
  private sectionAwareSystem: any
  private simplifiedAI: SimplifiedAIService
  private sectionExtractor: any

  constructor() {
    this.initializeResponses()
    // this.responsiveSystem = createResponsiveSystem()
    // this.sectionAwareSystem = createSectionAwareResponsiveSystem()
    this.simplifiedAI = new SimplifiedAIService(null) // null for mock mode
    this.sectionExtractor = createCurrentSectionExtractor()
  }

  private initializeResponses() {
    // Salon responses
    this.responses.set('salon:luxury:hero:generate', salonMockResponses.components.luxuryHero)
    this.responses.set('salon:warm:header:generate', salonMockResponses.components.warmHeader)
    this.responses.set('salon:luxury:content', salonMockResponses.content.luxuryContent)
    this.responses.set('salon:luxury:layout', salonMockResponses.layouts.luxuryLayout)

    // Add more business types and scenarios
    // this.responses.set('restaurant:casual:hero:generate', restaurantMockResponses.components.casualHero)
    // this.responses.set('ecommerce:modern:header:generate', ecommerceMockResponses.components.modernHeader)
  }

  // ===== COMPONENT GENERATION =====

  async generateComponent(request: AIComponentRequest): Promise<AIComponentResponse> {
    logger.info('🤖 Mock AI: Generating component:', request);

    // Simulate AI processing time
    await this.simulateProcessingTime(1500, 3000)

    // Build response key
    const key = this.buildResponseKey(request)

    // Get mock response
    const response = this.responses.get(key) || this.getDefaultComponentResponse(request)

    // Log request/response for debugging
    this.logInteraction(request, response)

    return response
  }

  async modifyComponent(request: AIComponentRequest): Promise<AIComponentResponse> {
    logger.info('🤖 Mock AI: Modifying component:', request);

    await this.simulateProcessingTime(1000, 2500)

    // For modifications, we'll enhance the current component based on intent
    const modifiedResponse = await this.simulateComponentModification(request)

    this.logInteraction(request, modifiedResponse)

    return modifiedResponse
  }

  async enhanceComponent(request: AIComponentRequest): Promise<AIComponentResponse> {
    logger.info('🤖 Mock AI: Enhancing component:', request);

    await this.simulateProcessingTime(800, 2000)

    // For enhancements, we'll add features to existing component
    const enhancedResponse = await this.simulateComponentEnhancement(request)

    this.logInteraction(request, enhancedResponse)

    return enhancedResponse
  }

  // ===== CONTENT GENERATION =====

  async generateContent(request: AIContentRequest): Promise<AIContentResponse> {
    logger.info('🤖 Mock AI: Generating content:', request);

    await this.simulateProcessingTime(500, 1500)

    const contentKey = `${request.businessContext.type}:${request.tone}:${request.type}`
    const response = this.responses.get(contentKey) || this.getDefaultContentResponse(request)

    this.logInteraction(request, response)

    return response
  }

  // ===== LAYOUT GENERATION =====

  async generateLayout(request: AILayoutRequest): Promise<AILayoutResponse> {
    logger.info('🤖 Mock AI: Generating layout:', request);

    await this.simulateProcessingTime(2000, 4000)

    const layoutKey = `${request.businessType}:${request.personality.join('-')}:layout`
    const response = this.responses.get(layoutKey) || this.getDefaultLayoutResponse(request)

    this.logInteraction(request, response)

    return response
  }

  // ===== INTEGRATION RECOMMENDATIONS =====

  async recommendIntegrations(request: AIIntegrationRequest): Promise<AIIntegrationResponse> {
    logger.info('🤖 Mock AI: Recommending integrations:', request);

    await this.simulateProcessingTime(1000, 2000)

    const integrationResponse = this.getDefaultIntegrationResponse(request)

    this.logInteraction(request, integrationResponse)

    return integrationResponse
  }

  // ===== SECTION MODIFICATION =====

  async modifySection(
    request: { action: string; sectionType: string; userInput: string; businessContext: any; currentContent?: any },
    onProgress?: (stage: string, progress: number) => void
  ): Promise<AIComponentResponse> {
    logger.info('🎨 Mock AI: Modifying section:', request);

    // Simulate progressive stages of AI modification
    const stages = [
      { name: 'Understanding your request', duration: 500 },
      { name: 'Analyzing current section', duration: 700 },
      { name: 'Generating modifications', duration: 800 },
      { name: 'Applying design changes', duration: 600 },
      { name: 'Finalizing component', duration: 400 }
    ]

    let totalProgress = 0
    const progressIncrement = 100 / stages.length

    for (const stage of stages) {
      onProgress?.(stage.name, totalProgress)
      await this.simulateProcessingTime(stage.duration * 0.8, stage.duration * 1.2)
      totalProgress += progressIncrement
      onProgress?.(stage.name, Math.min(totalProgress, 100))
    }

    // Generate modified component based on user input
    const modifiedComponent = await this.generateModifiedComponent(request)

    const response: AIComponentResponse = {
      success: true,
      component: modifiedComponent,
      metadata: {
        model: 'claude-3-sonnet',
        prompt: `Modify ${request.sectionType} section: ${request.userInput}`,
        reasoning: `Applied user-requested modifications to ${request.sectionType} section based on: "${request.userInput}". Changes include style updates, content adjustments, and structural improvements.`,
        confidence: 92,
        processingTime: stages.reduce((sum, stage) => sum + stage.duration, 0),
        alternatives: [],
        tags: ['modified', 'user-requested', request.sectionType]
      },
      feedback: {
        requestFeedback: true,
        improvementSuggestions: [
          'Consider A/B testing this modification',
          'Monitor user engagement with the changes',
          'Test across different devices'
        ]
      }
    }

    this.logInteraction(request, response)
    return response
  }

  /**
   * SIMPLIFIED AI-CENTRIC APPROACH (Proposed Replacement)
   * This method demonstrates how to replace the complex generateModifiedComponent
   * with a simple, context-aware AI call that includes current section content
   */
  private async generateModifiedComponentSimplified(request: { sectionType: string; userInput: string; businessContext: any }): Promise<any> {
    logger.info('🤖 Simplified AI: Generating context-aware modification');

    // 1. Extract current section content from live preview
    const currentSection = await this.sectionExtractor.extractCurrentSection(
      request.sectionType,
      request.businessContext
    )

    console.log(`✅ Current ${request.sectionType} content extracted:`, {
      hasHtml: !!currentSection.html,
      hasCss: !!currentSection.css,
      reasoning: currentSection.reasoning
    })

    // 2. Single AI call with full context - no complex logic needed
    const response = await this.simplifiedAI.modifySection({
      userInput: request.userInput,
      sectionType: request.sectionType,
      currentSection,
      businessContext: request.businessContext
    })

    logger.info('🎯 Simplified AI modification complete');
    return response.component
  }

  /**
   * ORIGINAL COMPLEX METHOD (To be replaced)
   * This method shows the current complex approach with multiple layers of analysis
   */
  private async generateModifiedComponent(request: { sectionType: string; userInput: string; businessContext: any }): Promise<any> {
    const { sectionType, userInput, businessContext } = request

    // Debug business context
    logger.info('🔍 Business context received:', businessContext);

    // First, check if we have a salon response for this specific request
    if (businessContext?.type === 'salon' || businessContext?.businessName?.toLowerCase().includes('salon')) {
      logger.info('✅ Detected salon business type, proceeding with salon lookup');

      // Detect the current layout from business context
      const currentLayout = this.detectCurrentLayout(businessContext)
      logger.info(`🎯 Detected layout: "${currentLayout}"`);

      // Try to get a response from our salon matrix
      const salonResponse = getSalonResponse(currentLayout, sectionType, userInput)

      logger.info(`🔍 Salon response lookup: layout="${currentLayout}", section="${sectionType}", input="${userInput}"`);
      logger.info(`🔍 Response found:`, !!salonResponse);

      if (salonResponse && salonResponse.success && salonResponse.component) {
        logger.info(`🎨 Using salon matrix response for ${currentLayout}/${sectionType}/${userInput}`);

        // Apply responsive analysis enhancement to existing response
        const enhancedComponent = await this.enhanceComponentWithResponsiveAnalysis(
          salonResponse.component,
          userInput,
          sectionType,
          businessContext
        )

        return enhancedComponent
      } else {
        logger.info(`❌ No salon response found for ${currentLayout}/${sectionType}, trying preview impact fallback`);

        // Try to get content from preview impact system for known layouts
        const impactFallback = this.getComponentFromPreviewImpact(currentLayout, sectionType, businessContext, userInput)
        if (impactFallback) {
          logger.info(`🎯 Using preview impact fallback for ${currentLayout}/${sectionType} with modifications: "${userInput}"`);

          // Apply responsive analysis to fallback content
          const enhancedFallback = await this.enhanceComponentWithResponsiveAnalysis(
            impactFallback,
            userInput,
            sectionType,
            businessContext
          )

          return enhancedFallback
        }

        logger.info(`❌ No impact fallback found, using generic base component`);
      }
    }

    // Fallback to generic base component if no specific salon response
    const baseComponent = this.getBaseComponentForSection(sectionType, businessContext)

    // Apply modifications based on user input
    const modifications = this.parseUserModifications(userInput)

    // Apply modifications to HTML and CSS
    const modifiedHtml = this.applyContentModifications(baseComponent.html, modifications)
    const modifiedCss = this.applyStyleModifications(baseComponent.css, modifications)

    // For color scheme changes, use inline styles to ensure they override existing CSS
    const hasColorChanges = modifications.style.includes('colorful')

    return {
      ...baseComponent,
      id: `${sectionType}-modified-${Date.now()}`,
      name: `Modified ${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)} Section`,
      // Skip CSS injection when using inline styles for color changes (better specificity)
      css: hasColorChanges ? '' : modifiedCss,
      // Apply content modifications
      html: modifiedHtml,
      // Update props with modifications
      props: {
        ...baseComponent.props,
        modification: userInput,
        modificationTimestamp: Date.now()
      }
    }
  }

  private getBaseComponentForSection(sectionType: string, businessContext: any): any {
    // Return appropriate base component based on section type and business context
    const baseComponents: Record<string, any> = {
      header: {
        id: `${sectionType}-base`,
        type: 'header',
        name: 'Header Section',
        html: `
          <header class="header-section">
            <div class="header-container">
              <div class="header-logo">
                <span class="logo-text">${businessContext.businessName || 'Your Business'}</span>
              </div>
              <nav class="header-nav">
                <a href="#services" class="nav-link">Services</a>
                <a href="#about" class="nav-link">About</a>
                <a href="#contact" class="nav-link">Contact</a>
              </nav>
              <button class="header-cta">Book Now</button>
            </div>
          </header>
        `,
        css: `
          .header-section {
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            position: sticky;
            top: 0;
            z-index: 100;
          }
          .header-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .logo-text {
            font-size: 1.5rem;
            font-weight: 700;
            color: #333;
          }
          .header-nav {
            display: flex;
            gap: 2rem;
          }
          .nav-link {
            text-decoration: none;
            color: #666;
            font-weight: 500;
            transition: color 0.3s;
          }
          .nav-link:hover {
            color: #007bff;
          }
          .header-cta {
            background: #007bff;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
          }
          .header-cta:hover {
            background: #0056b3;
          }
        `,
        props: {}
      },
      hero: {
        id: `${sectionType}-base`,
        type: 'hero',
        name: 'Hero Section',
        html: `
          <section class="hero-section">
            <div class="hero-container">
              <div class="hero-content">
                <h1 class="hero-title">Welcome to ${businessContext.businessName || 'Your Business'}</h1>
                <p class="hero-subtitle">Experience excellence with our premium services</p>
                <button class="hero-cta">Get Started</button>
              </div>
            </div>
          </section>
        `,
        css: `
          .hero-section {
            min-height: 80vh;
            background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
            display: flex;
            align-items: center;
            color: white;
          }
          .hero-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
            text-align: center;
          }
          .hero-title {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 1rem;
          }
          .hero-subtitle {
            font-size: 1.25rem;
            margin-bottom: 2rem;
            opacity: 0.9;
          }
          .hero-cta {
            background: white;
            color: #007bff;
            border: none;
            padding: 1rem 2rem;
            border-radius: 0.5rem;
            font-weight: 600;
            font-size: 1.1rem;
            cursor: pointer;
            transition: transform 0.3s;
          }
          .hero-cta:hover {
            transform: translateY(-2px);
          }
        `,
        props: {}
      },
      features: {
        id: `${sectionType}-base`,
        type: 'features',
        name: 'Features Section',
        html: `
          <section class="features-section" data-section-type="features">
            <div class="features-container">
              <h2 class="features-title">Our Features</h2>
              <div class="features-grid">
                <div class="feature-item">
                  <div class="feature-icon">⚡</div>
                  <h3 class="feature-name">Fast Performance</h3>
                  <p class="feature-description">Lightning-fast service delivery</p>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">🎯</div>
                  <h3 class="feature-name">Targeted Solutions</h3>
                  <p class="feature-description">Customized for your specific needs</p>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">🚀</div>
                  <h3 class="feature-name">Growth Focused</h3>
                  <p class="feature-description">Designed to scale with your business</p>
                </div>
              </div>
            </div>
          </section>
        `,
        css: `
          .features-section {
            padding: 4rem 2rem;
            background: #f8f9fa;
          }
          .features-container {
            max-width: 1200px;
            margin: 0 auto;
            text-align: center;
          }
          .features-title {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 3rem;
            color: #2d3748;
          }
          .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
          }
          .feature-item {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.3s;
          }
          .feature-item:hover {
            transform: translateY(-4px);
          }
          .feature-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          .feature-name {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #2d3748;
          }
          .feature-description {
            color: #4a5568;
            line-height: 1.6;
          }
        `,
        props: {}
      }
    }

    return baseComponents[sectionType] || {
      id: `${sectionType}-fallback`,
      type: sectionType,
      name: `${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)} Section`,
      html: `<section class="${sectionType}-section" data-section-type="${sectionType}">
        <div class="section-container">
          <h2>Default ${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)} Section</h2>
          <p>This is a placeholder ${sectionType} section.</p>
        </div>
      </section>`,
      css: `.${sectionType}-section { padding: 2rem; background: #f8f9fa; }`,
      props: {}
    }
  }

  private parseUserModifications(userInput: string): { style: string[]; content: string[]; structure: string[] } {
    const input = userInput.toLowerCase()

    return {
      style: [
        ...(input.includes('modern') ? ['modern'] : []),
        ...(input.includes('professional') ? ['professional'] : []),
        ...(input.includes('colorful') || input.includes('color') || input.includes('colour') ? ['colorful'] : []),
        ...(input.includes('minimal') ? ['minimal'] : []),
        ...(input.includes('dark') ? ['dark'] : []),
        ...(input.includes('light') ? ['light'] : []),
        ...(input.includes('bold') || input.includes('vibrant') ? ['bold'] : []),
        ...(input.includes('elegant') || input.includes('luxury') ? ['elegant'] : [])
      ],
      content: [
        ...(input.includes('more content') ? ['expand-content'] : []),
        ...(input.includes('add') && input.includes('button') ? ['add-button'] : []),
        ...(input.includes('testimonial') ? ['add-testimonials'] : []),
        ...(input.includes('contact') ? ['add-contact'] : []),
        // Better content/copy detection
        ...(input.includes('compelling') || input.includes('better copy') || input.includes('improve copy') ? ['improve-copy'] : []),
        ...(input.includes('headline') || input.includes('title') || input.includes('heading') ? ['improve-headlines'] : []),
        ...(input.includes('description') || input.includes('subtitle') ? ['improve-descriptions'] : []),
        ...(input.includes('engaging') || input.includes('exciting') || input.includes('dynamic') ? ['make-engaging'] : []),
        ...(input.includes('call to action') || input.includes('cta') || input.includes('action') ? ['improve-cta'] : [])
      ],
      structure: [
        ...(input.includes('center') ? ['center-align'] : []),
        ...(input.includes('left') ? ['left-align'] : []),
        ...(input.includes('grid') ? ['grid-layout'] : [])
      ]
    }
  }

  private applyStyleModifications(baseCss: string, modifications: ReturnType<typeof this.parseUserModifications>): string {
    let modifiedCss = baseCss

    // Apply style modifications
    if (modifications.style.includes('modern')) {
      modifiedCss = modifiedCss.replace(/serif/g, 'sans-serif')
      modifiedCss += `
        /* Modern styling */
        .hero-section, .header-section { backdrop-filter: blur(10px); }
        .nav-link { border-radius: 0.25rem; padding: 0.5rem; }
      `
    }

    if (modifications.style.includes('professional')) {
      modifiedCss += `
        /* Professional styling */
        .hero-title, .logo-text { font-family: 'Inter', sans-serif; }
        .header-section { background: #f8f9fa; }
        .hero-section { background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); }
      `
    }

    if (modifications.style.includes('colorful')) {
      // Replace the existing background in the base CSS
      modifiedCss = modifiedCss.replace(
        /background:\s*linear-gradient\([^;]+\);?/g,
        'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);'
      )

      modifiedCss += `
        /* Colorful styling - professional but clearly visible */
        .hero-section, section.hero-section, .hero, .banner {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
          color: white !important;
          border-left: 5px solid #ff6b9d !important;
        }

        .hero-section .hero-title, .hero-section h1 {
          color: #ffd700 !important;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.5) !important;
        }

        .hero-section .hero-subtitle, .hero-section p {
          color: rgba(255, 255, 255, 0.95) !important;
        }

        .hero-section .hero-cta, .hero-section button {
          background: linear-gradient(135deg, #ff6b9d 0%, #c44569 100%) !important;
          color: white !important;
          border: 2px solid rgba(255, 255, 255, 0.3) !important;
          box-shadow: 0 4px 15px rgba(255, 107, 157, 0.4) !important;
        }

        .hero-section .hero-cta:hover, .hero-section button:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 20px rgba(255, 107, 157, 0.6) !important;
        }
      `
    }

    if (modifications.style.includes('bold')) {
      modifiedCss += `
        /* Bold vibrant styling */
        .hero-section {
          background: linear-gradient(135deg, #ff4757 0%, #5352ed 100%) !important;
        }
        .hero-title {
          font-size: 4rem !important;
          font-weight: 900 !important;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3) !important;
        }
      `
    }

    if (modifications.style.includes('elegant')) {
      modifiedCss += `
        /* Elegant luxury styling */
        .hero-section {
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%) !important;
        }
        .hero-title {
          font-family: 'Playfair Display', serif !important;
          color: #d4af37 !important;
        }
        .hero-cta {
          background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%) !important;
          box-shadow: 0 8px 25px rgba(212, 175, 55, 0.3) !important;
        }
      `
    }

    return modifiedCss
  }

  private applyContentModifications(baseHtml: string, modifications: ReturnType<typeof this.parseUserModifications>): string {
    let modifiedHtml = baseHtml

    // Apply content modifications
    if (modifications.content.includes('add-button')) {
      modifiedHtml = modifiedHtml.replace(
        '</div>',
        '  <button class="additional-cta">Learn More</button>\n</div>'
      )
    }

    if (modifications.content.includes('add-testimonials')) {
      modifiedHtml = modifiedHtml.replace(
        '</section>',
        `  <div class="testimonials-preview">
          <p class="testimonial">"Amazing service!" - Happy Customer</p>
        </div>
      </section>`
      )
    }

    // New content modification types
    if (modifications.content.includes('improve-copy')) {
      logger.info('🔍 Applying improve-copy modifications');

      // Improve generic headlines and copy
      modifiedHtml = modifiedHtml.replace(
        /(?:Welcome to|Experience excellence|Experience|Get started|Start your journey)/gi,
        'Transform Your Experience With'
      )
      modifiedHtml = modifiedHtml.replace(
        /(?:premium services|our services|quality service)/gi,
        'exceptional results that exceed expectations'
      )
      modifiedHtml = modifiedHtml.replace(
        /(?:Learn more|Get started|Contact us)/gi,
        'Discover the Difference'
      )
    }

    if (modifications.content.includes('improve-headlines')) {
      logger.info('🔍 Applying improve-headlines modifications');

      // Make headlines more compelling
      modifiedHtml = modifiedHtml.replace(
        /<h1[^>]*>([^<]+)<\/h1>/gi,
        '<h1 class="enhanced-headline">🚀 $1 That Delivers Results</h1>'
      )
      modifiedHtml = modifiedHtml.replace(
        /<h2[^>]*>([^<]+)<\/h2>/gi,
        '<h2 class="enhanced-subheading">✨ $1 - Experience the Difference</h2>'
      )
    }

    if (modifications.content.includes('make-engaging')) {
      logger.info('🔍 Applying make-engaging modifications');

      // Add engaging elements and dynamic language
      modifiedHtml = modifiedHtml.replace(
        /(\w+)\s+(salon|studio|business|service)/gi,
        '$1 $2 ⭐ Where Excellence Meets Innovation'
      )
      modifiedHtml = modifiedHtml.replace(
        /(book|schedule|contact)/gi,
        '🎯 $1 Now for Exclusive Access'
      )
    }

    if (modifications.content.includes('improve-cta')) {
      logger.info('🔍 Applying improve-cta modifications');

      // Enhance call-to-action text
      modifiedHtml = modifiedHtml.replace(
        /(?:book now|contact|learn more|get started)/gi,
        'Book Your Transformation Today'
      )
      modifiedHtml = modifiedHtml.replace(
        /<button([^>]*)>([^<]+)<\/button>/gi,
        '<button$1>🌟 $2 - Limited Availability</button>'
      )
    }

    // For color scheme changes, also modify the text and inject inline styles
    if (modifications.style.includes('colorful')) {
      logger.info('🔍 TEMP DEBUG: Original HTML length:', modifiedHtml.length);
      logger.info('🔍 TEMP DEBUG: Original HTML preview:', modifiedHtml.substring(0, 300))

      modifiedHtml = modifiedHtml.replace(
        /Welcome to [^<]+/g,
        'Welcome to Your COLORFUL Business! 🌈'
      )
      modifiedHtml = modifiedHtml.replace(
        /Experience excellence with our premium services/g,
        'Experience our AMAZING colorful premium services! 🎨✨'
      )

      // Try more flexible patterns to catch the actual HTML structure
      let replacements = 0

      // Inject inline styles directly into the hero section for maximum specificity
      modifiedHtml = modifiedHtml.replace(
        /<section[^>]*class="hero-section"[^>]*>/g,
        (match) => {
          replacements++
          logger.info('🔍 TEMP DEBUG: Found section:', match);
          // Apply professional colorful styling with inline styles
          // Preserve any existing attributes including data-section-type
          return match.replace('>', ' style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; color: white !important; border-left: 5px solid #ff6b9d !important; box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3) !important;">')
        }
      )

      // Also try alternative section patterns
      modifiedHtml = modifiedHtml.replace(
        /<section class="hero-section">/g,
        (match) => {
          replacements++
          logger.info('🔍 TEMP DEBUG: Found simple section:', match);
          return '<section class="hero-section" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; color: white !important; border-left: 5px solid #ff6b9d !important; box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3) !important;">'
        }
      )

      logger.info('🔍 TEMP DEBUG: Section replacements made:', replacements);
      logger.info('🔍 TEMP DEBUG: Modified HTML preview:', modifiedHtml.substring(0, 300))
    }

    return modifiedHtml
  }

  // ===== HELPER METHODS =====

  private buildResponseKey(request: AIComponentRequest): string {
    const business = request.businessContext.type
    const personality = request.businessContext.personality[0] || 'default'
    const component = request.componentType
    const action = request.type

    return `${business}:${personality}:${component}:${action}`
  }

  private async simulateProcessingTime(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  private async simulateComponentModification(request: AIComponentRequest): Promise<AIComponentResponse> {
    // Simulate AI understanding user intent and modifying component
    const baseResponse = this.getDefaultComponentResponse(request)

    // Apply intent-based modifications
    if (request.userIntent.toLowerCase().includes('modern')) {
      baseResponse.component.css = baseResponse.component.css.replace(/serif/g, 'sans-serif')
      baseResponse.metadata.tags.push('modern')
    }

    if (request.userIntent.toLowerCase().includes('colorful')) {
      baseResponse.component.css = baseResponse.component.css.replace(/#[0-9a-f]{6}/gi, '#ff6b9d')
      baseResponse.metadata.tags.push('colorful')
    }

    baseResponse.metadata.reasoning = `Modified component based on user intent: "${request.userIntent}". Applied relevant design changes to match requested style.`

    return baseResponse
  }

  private async simulateComponentEnhancement(request: AIComponentRequest): Promise<AIComponentResponse> {
    const baseResponse = this.getDefaultComponentResponse(request)

    // Add enhancements based on business context
    if (request.businessContext.type === 'salon') {
      baseResponse.component.html += `
        <div class="enhancement-booking-widget">
          <h3>Quick Book</h3>
          <button>Book Now</button>
        </div>
      `
      baseResponse.metadata.tags.push('enhanced', 'booking-widget')
    }

    baseResponse.metadata.reasoning = `Enhanced component with business-specific features for ${request.businessContext.type} industry.`

    return baseResponse
  }

  private getDefaultComponentResponse(request: AIComponentRequest): AIComponentResponse {
    return {
      success: true,
      component: {
        id: `default-${request.componentType}-${Date.now()}`,
        type: request.componentType,
        name: `Default ${request.componentType} Component`,
        html: `<div class="default-${request.componentType}">Default ${request.componentType} component</div>`,
        css: `.default-${request.componentType} { padding: 2rem; background: #f8f9fa; border-radius: 0.5rem; }`,
        props: {},
        responsive: {},
        accessibility: {
          ariaLabels: {},
          keyboardNavigation: true,
          screenReaderOptimized: true
        },
        seo: {},
        performance: {
          lazyLoad: false,
          criticalCSS: '',
          optimizedImages: false
        }
      },
      metadata: {
        model: 'mock-ai-v1',
        prompt: `Generate ${request.componentType} for ${request.businessContext.type} business`,
        reasoning: 'Generated default component as fallback',
        confidence: 70,
        processingTime: 1500,
        alternatives: [],
        tags: ['default', request.componentType, request.businessContext.type]
      },
      feedback: {
        requestFeedback: true,
        improvementSuggestions: ['Add more specific styling', 'Include business-specific content']
      }
    }
  }

  private getDefaultContentResponse(request: AIContentRequest): AIContentResponse {
    return {
      success: true,
      content: {
        primary: `Professional ${request.section} content for your ${request.businessContext.type} business.`,
        alternatives: [
          `Quality ${request.section} content tailored for your audience.`,
          `Engaging ${request.section} content that converts visitors.`
        ],
        seoOptimized: `Professional ${request.section} content for your ${request.businessContext.type} business, optimized for search engines.`,
        variations: {
          short: `Professional ${request.section} content.`,
          medium: `Professional ${request.section} content for your ${request.businessContext.type} business.`,
          long: `Professional ${request.section} content for your ${request.businessContext.type} business. We create engaging, high-quality content that resonates with your target audience and drives results.`
        }
      },
      metadata: {
        readabilityScore: 75,
        seoScore: 70,
        emotionalTone: request.tone,
        keywords: [request.businessContext.type, request.section, 'professional'],
        readingTime: '5 seconds',
        targetAudience: ['general']
      }
    }
  }

  private getDefaultLayoutResponse(request: AILayoutRequest): AILayoutResponse {
    return {
      success: true,
      layout: {
        id: `default-layout-${Date.now()}`,
        name: `Default ${request.businessType} Layout`,
        sections: request.sections.map((sectionType, index) => ({
          id: sectionType,
          type: sectionType,
          position: index + 1,
          component: {
            id: `${sectionType}-component`,
            type: sectionType,
            name: `${sectionType} Component`,
            html: `<div class="${sectionType}">${sectionType} content</div>`,
            css: `.${sectionType} { padding: 2rem; }`,
            props: {},
            responsive: {
              mobile: { css: `/* Mobile CSS for ${sectionType} */` },
              tablet: { css: `/* Tablet CSS for ${sectionType} */` }
            },
            accessibility: {
              ariaLabels: { main: `${sectionType} section` },
              keyboardNavigation: true,
              screenReaderOptimized: true
            },
            seo: {
              structuredData: { '@type': 'WebPageElement', name: `${sectionType} Component` },
              metaTags: { description: `${sectionType} section` }
            },
            performance: {
              lazyLoad: true,
              criticalCSS: `/* Critical CSS for ${sectionType} */`,
              optimizedImages: true
            }
          },
          styling: {
            background: 'white',
            padding: '2rem 0',
            margin: '0',
            fullWidth: true
          },
          animations: []
        })),
        globalStyles: {
          colorScheme: 'default',
          typography: 'default',
          spacing: 'comfortable',
          borderRadius: 'subtle'
        },
        responsive: {
          mobile: {
            id: `default-layout-${Date.now()}-mobile`,
            name: `Mobile ${request.businessType} Layout`,
            sections: [],
            globalStyles: {
              colorScheme: 'default',
              typography: 'system',
              spacing: 'compact',
              borderRadius: '4px'
            },
            responsive: { mobile: {}, tablet: {} }
          },
          tablet: {
            id: `default-layout-${Date.now()}-tablet`,
            name: `Tablet ${request.businessType} Layout`,
            sections: [],
            globalStyles: {
              colorScheme: 'default',
              typography: 'system',
              spacing: 'normal',
              borderRadius: '6px'
            },
            responsive: { mobile: {}, tablet: {} }
          }
        }
      },
      recommendations: {
        sectionOrder: request.sections,
        reasoning: {},
        conversionOptimizations: [],
        alternativeLayouts: []
      },
      metadata: {
        confidence: 60,
        conversionScore: 70,
        designScore: 65,
        userExperienceScore: 70
      }
    }
  }

  private getDefaultIntegrationResponse(request: AIIntegrationRequest): AIIntegrationResponse {
    const recommendations = [
      {
        id: 'stripe-payments',
        name: 'Stripe Payments',
        provider: 'Stripe',
        category: 'payment' as const,
        description: 'Accept credit card payments online',
        benefits: ['Secure payments', 'Global acceptance', 'Easy integration'],
        setupComplexity: 'medium' as const,
        monthlyCost: '$0 + transaction fees',
        features: ['Credit cards', 'Digital wallets', 'Subscriptions'],
        apiDocumentation: 'https://stripe.com/docs',
        configurationSteps: ['Create Stripe account', 'Get API keys', 'Configure webhook'],
        requiredCredentials: ['publishable_key', 'secret_key'],
        integrationCode: {
          html: '<div id="stripe-checkout"></div>',
          javascript: 'stripe.checkout.setup()',
          css: '.stripe-checkout { /* styling */ }'
        }
      }
    ]

    return {
      success: true,
      recommendations,
      priorityOrder: ['stripe-payments'],
      estimatedROI: { 'stripe-payments': 15 },
      metadata: {
        totalSetupTime: '2-4 hours',
        complexity: 'medium',
        maintenanceRequired: false
      }
    }
  }

  private logInteraction(request: any, response: any) {
    this.requestHistory.push({
      request,
      response,
      timestamp: Date.now()
    })

    // Keep only last 100 interactions
    if (this.requestHistory.length > 100) {
      this.requestHistory.shift()
    }
  }

  /**
   * Enhance component with section-aware responsive analysis
   */
  private async enhanceComponentWithResponsiveAnalysis(
    component: any,
    userInput: string,
    sectionType: string,
    businessContext?: any
  ): Promise<any> {
    try {
      logger.info(`🎯 Using section-aware responsive enhancement for ${sectionType}: "${userInput}"`);

      // Check if section-aware system is available
      if (!this.sectionAwareSystem) {
        logger.info(`⚠️ Section-aware system not initialized, using basic enhancement`);
        return this.basicResponsiveEnhancement(component, userInput, sectionType)
      }

      // 1. Use section-aware analysis for complexity and strategy
      const sectionAnalysis = await this.sectionAwareSystem.analyzeSectionComplexity(
        userInput,
        sectionType,
        businessContext
      )

      console.log(`🧠 Section Analysis:`, {
        sectionType: sectionAnalysis.sectionType,
        complexity: sectionAnalysis.contentComplexity,
        strategy: sectionAnalysis.responsiveStrategy,
        breakpoints: sectionAnalysis.criticalBreakpoints,
        optimizations: sectionAnalysis.mobileOptimizations.length
      })

      // 2. Use section-aware validation for content issues
      const sectionValidation = await this.sectionAwareSystem.validateSectionContent(
        component.html || '',
        component.css || '',
        sectionAnalysis,
        userInput
      )

      console.log(`🔍 Section Validation:`, {
        hasIssues: sectionValidation.hasResponsiveIssues,
        quality: sectionValidation.overallQuality,
        issueCount: sectionValidation.identifiedIssues.length,
        sectionIssues: sectionValidation.sectionSpecificIssues.length
      })

      // 3. Generate section-specific responsive CSS
      let enhancedCSS = component.css
      if (sectionValidation.hasResponsiveIssues) {
        logger.info(`🔧 Applying section-aware responsive enhancements`);
        const sectionCSS = this.sectionAwareSystem.generateSectionCSS(sectionAnalysis)
        enhancedCSS = component.css + '\n\n/* Section-Aware Responsive Enhancements */\n' + sectionCSS
      }

      // 4. Log any section-specific warnings
      if (sectionValidation.sectionSpecificIssues.length > 0) {
        logger.warn(`⚠️ Section-specific issues found:`, sectionValidation.sectionSpecificIssues);
        logger.info(`💡 Section recommendations:`, sectionValidation.recommendations);
      }

      // 5. Create enhanced component with section-aware metadata
      const enhancedComponent = {
        ...component,
        css: enhancedCSS,
        metadata: {
          ...component.metadata,
          sectionAwareAnalysis: {
            // Section Analysis Results
            sectionType: sectionAnalysis.sectionType,
            contentComplexity: sectionAnalysis.contentComplexity,
            responsiveStrategy: sectionAnalysis.responsiveStrategy,
            criticalBreakpoints: sectionAnalysis.criticalBreakpoints,
            mobileOptimizations: sectionAnalysis.mobileOptimizations,
            sectionMetrics: sectionAnalysis.sectionSpecificMetrics,
            reasoning: sectionAnalysis.reasoning,

            // Section Validation Results
            sectionValidation: {
              quality: sectionValidation.overallQuality,
              hasIssues: sectionValidation.hasResponsiveIssues,
              identifiedIssues: sectionValidation.identifiedIssues,
              sectionSpecificIssues: sectionValidation.sectionSpecificIssues,
              recommendations: sectionValidation.recommendations,
              reasoning: sectionValidation.reasoning
            },

            // Enhancement Applied
            enhancementsApplied: sectionValidation.hasResponsiveIssues ? 'Section-aware responsive enhancements applied' : 'No enhancements needed',

            // For debugging/transparency
            originalPrompt: userInput,
            processingMethod: 'Section-aware analysis'
          }
        }
      }

      logger.info(`✅ Section-aware responsive enhancement complete`);

      return enhancedComponent

    } catch (error) {
      logger.error(`❌ Section-aware enhancement failed, using fallback:`, error);

      // Fallback to basic enhancement if section-aware analysis fails
      return this.basicResponsiveEnhancement(component, userInput, sectionType)
    }
  }

  /**
   * Basic fallback enhancement when AI is not available
   */
  private basicResponsiveEnhancement(component: any, userInput: string, sectionType: string): any {
    logger.info(`🔧 Using basic responsive enhancement as fallback`);

    // Very basic responsive enhancement - not keyword dependent
    const needsEnhancement = component.css && !component.css.includes('@media')

    if (needsEnhancement) {
      const basicResponsiveCSS = `
/* Basic Responsive Enhancement */
@media (max-width: 1024px) {
  .${sectionType}-container {
    padding: 1rem;
  }
}

@media (max-width: 768px) {
  .${sectionType}-container {
    padding: 0.75rem;
  }

  .nav-link {
    font-size: 0.875rem;
    padding: 0.5rem;
  }
}
`

      return {
        ...component,
        css: component.css + basicResponsiveCSS,
        metadata: {
          ...component.metadata,
          responsiveEnhancement: 'Basic fallback enhancement applied'
        }
      }
    }

    return component
  }

  private detectCurrentLayout(businessContext: any): string {
    // Try to detect layout from various context clues
    logger.info('🔍 detectCurrentLayout called with businessContext:', JSON.stringify(businessContext, null, 2))

    // 1. Check for explicit layout in context
    if (businessContext.layout) {
      logger.info(`✅ Found explicit layout: ${businessContext.layout}`);
      return businessContext.layout
    }

    // 2. Check for personality/style that maps to our layouts
    const personality = businessContext.personality || businessContext.style || ''
    const personalityLower = personality.toLowerCase()
    logger.info(`🔍 Checking personality: "${personality}" (normalized: "${personalityLower}");`)

    if (personalityLower.includes('luxury') || personalityLower.includes('premium') || personalityLower.includes('exclusive')) {
      logger.info(`✅ Detected luxury-premium from personality: "${personality}"`);
      return 'luxury-premium'
    }
    if (personalityLower.includes('warm') || personalityLower.includes('friendly') || personalityLower.includes('approachable')) {
      logger.info(`✅ Detected warm-approachable from personality: "${personality}"`);
      return 'warm-approachable'
    }
    if (personalityLower.includes('modern') || personalityLower.includes('minimal') || personalityLower.includes('clean')) {
      logger.info(`✅ Detected modern-minimal from personality: "${personality}"`);
      return 'modern-minimal'
    }
    if (personalityLower.includes('bold') || personalityLower.includes('vibrant') || personalityLower.includes('energetic')) {
      logger.info(`✅ Detected bold-vibrant from personality: "${personality}"`);
      return 'bold-vibrant'
    }

    // 3. Check tone or mood
    const tone = businessContext.tone || businessContext.mood || ''
    const toneLower = tone.toLowerCase()
    logger.info(`🔍 Checking tone: "${tone}" (normalized: "${toneLower}");`)

    if (toneLower.includes('luxury') || toneLower.includes('sophisticated')) {
      logger.info(`✅ Detected luxury-premium from tone: "${tone}"`);
      return 'luxury-premium'
    }
    if (toneLower.includes('casual') || toneLower.includes('friendly')) {
      logger.info(`✅ Detected warm-approachable from tone: "${tone}"`);
      return 'warm-approachable'
    }

    // 4. Default to luxury-premium since we have that implemented
    logger.info('❌ Could not detect specific layout, defaulting to luxury-premium');
    logger.info('Available business context keys:', Object.keys(businessContext))
    return 'luxury-premium'
  }

  // ===== DEBUGGING & ANALYTICS =====

  getRequestHistory() {
    return this.requestHistory
  }

  getSuccessRate() {
    const total = this.requestHistory.length
    const successful = this.requestHistory.filter(h => h.response.success).length
    return total > 0 ? (successful / total) * 100 : 0
  }

  getAverageProcessingTime() {
    return this.requestHistory.reduce((acc, h) => acc + (h.response.metadata?.processingTime || 0), 0) / this.requestHistory.length
  }

  // ===== RESPONSE MANAGEMENT =====

  addMockResponse(key: string, response: any) {
    this.responses.set(key, response)
  }

  removeMockResponse(key: string) {
    this.responses.delete(key)
  }

  listMockResponses() {
    return Array.from(this.responses.keys())
  }

  clearHistory() {
    this.requestHistory = []
  }

  /**
   * Try to get component content from preview impact files when salon response matrix is empty
   */
  private getComponentFromPreviewImpact(layout: string, sectionType: string, businessContext: any, userInput?: string): any | null {
    try {
      // Get the preview impact for this layout
      const impact = PREVIEW_IMPACTS[layout]
      if (!impact || !impact.modules) {
        return null
      }

      // Look for the section in the modules
      const sectionModule = impact.modules[sectionType]
      if (!sectionModule) {
        return null
      }

      // Extract HTML and CSS from the module
      let html = sectionModule.html || sectionModule.content || ''
      let css = sectionModule.css || sectionModule.styles || ''

      if (!html) {
        return null
      }

      // Apply user modifications if provided
      if (userInput && userInput.trim()) {
        logger.info(`🔧 Applying user modifications to ${layout}/${sectionType}: "${userInput}"`);

        // Parse user modifications
        const modifications = this.parseUserModifications(userInput)

        // Apply modifications to HTML and CSS
        html = this.applyContentModifications(html, modifications)
        css = this.applyStyleModifications(css, modifications)

        console.log(`✅ Applied modifications:`, {
          styleChanges: modifications.style.length,
          contentChanges: modifications.content.length,
          structureChanges: modifications.structure.length
        })
      }

      // Create a component object similar to what the AI service would return
      return {
        id: `${sectionType}-${layout}-${userInput ? 'modified' : 'fallback'}`,
        type: sectionType,
        name: `${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)} Section`,
        html,
        css,
        props: sectionModule.props || {},
        animations: sectionModule.animations || [],
        interactions: sectionModule.interactions || [],
        businessName: businessContext.businessName || 'Your Business',
        colorScheme: impact.colorScheme || null,
        typography: impact.typography || null
      }
    } catch (error) {
      logger.warn(`Failed to get component from preview impact for ${layout}/${sectionType}:`, error);
      return null
    }
  }
}

// Export singleton instance
export const mockAIService = new MockAIService()
