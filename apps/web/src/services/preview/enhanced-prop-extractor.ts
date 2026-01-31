/**
 * Enhanced Prop Extractor
 * 
 * Improves prop extraction from component source code and metadata
 * to generate more accurate previews without relying on layouts.
 */

import { logger } from '@/utils/logger'

interface ExtractedProps {
  props: Record<string, any>
  confidence: 'high' | 'medium' | 'low'
  source: 'propsSchema' | 'sourceCode' | 'aiGenerated' | 'defaults'
}

export class EnhancedPropExtractor {
  /**
   * Extract props from multiple sources with confidence scoring
   */
  extractProps(
    componentName: string,
    componentData: any,
    templateMetadata?: any
  ): ExtractedProps {
    // Try multiple extraction strategies in order of preference
    
    // 1. Props Schema (highest confidence)
    if (componentData.propsSchema && Object.keys(componentData.propsSchema).length > 0) {
      return {
        props: this.extractFromPropsSchema(componentData.propsSchema),
        confidence: 'high',
        source: 'propsSchema'
      }
    }
    
    // 2. AI-generated metadata (high confidence)
    if (templateMetadata?.aiGeneratedProps?.[componentName]) {
      return {
        props: templateMetadata.aiGeneratedProps[componentName],
        confidence: 'high',
        source: 'aiGenerated'
      }
    }
    
    // 3. Source code analysis (medium confidence)
    if (componentData.tsx || componentData.source) {
      const extracted = this.extractFromSourceCode(
        componentData.tsx || componentData.source,
        componentName
      )
      if (Object.keys(extracted).length > 0) {
        return {
          props: extracted,
          confidence: 'medium',
          source: 'sourceCode'
        }
      }
    }
    
    // 4. Intelligent defaults based on context (low confidence)
    return {
      props: this.generateIntelligentDefaults(componentName, templateMetadata),
      confidence: 'low',
      source: 'defaults'
    }
  }
  
  /**
   * Extract props from props schema with type inference
   */
  private extractFromPropsSchema(schema: Record<string, any>): Record<string, any> {
    const props: Record<string, any> = {}
    
    Object.entries(schema).forEach(([key, value]: [string, any]) => {
      if (typeof value === 'object' && value.default !== undefined) {
        props[key] = value.default
      } else if (typeof value === 'object' && value.type) {
        props[key] = this.getDefaultForType(value.type, key)
      }
    })
    
    return props
  }
  
  /**
   * Enhanced source code extraction with better patterns
   */
  private extractFromSourceCode(source: string, componentName: string): Record<string, any> {
    const props: Record<string, any> = {}
    
    // Extract prop types from TypeScript interface
    const interfaceMatch = source.match(/interface\s+\w*Props\s*{([^}]+)}/s)
    if (interfaceMatch) {
      const propsContent = interfaceMatch[1]
      const propMatches = propsContent.matchAll(/(\w+)(\?)?:\s*([^;]+);/g)
      
      for (const match of propMatches) {
        const [, propName, isOptional, propType] = match
        props[propName] = this.getDefaultForType(propType.trim(), propName)
      }
    }
    
    // Extract default props from component
    const defaultPropsMatch = source.match(/defaultProps\s*=\s*{([^}]+)}/s)
    if (defaultPropsMatch) {
      try {
        // Safe evaluation of default props
        const defaultPropsStr = defaultPropsMatch[1]
        const propPairs = defaultPropsStr.matchAll(/(\w+):\s*['"`]([^'"`]+)['"`]/g)
        
        for (const [, key, value] of propPairs) {
          props[key] = value
        }
      } catch (e) {
        logger.warn('Failed to parse default props', { componentName, error: e })
      }
    }
    
    // Extract from destructured props with defaults
    const destructureMatch = source.match(/{\s*([^}]+)\s*}\s*=\s*props/)
    if (destructureMatch) {
      const destructureContent = destructureMatch[1]
      const defaultMatches = destructureContent.matchAll(/(\w+)\s*=\s*['"`]([^'"`]+)['"`]/g)
      
      for (const [, key, value] of defaultMatches) {
        props[key] = value
      }
    }
    
    return props
  }
  
  /**
   * Generate intelligent defaults based on component type and context
   */
  private generateIntelligentDefaults(
    componentName: string,
    templateMetadata?: any
  ): Record<string, any> {
    const componentType = this.normalizeComponentType(componentName)
    const industry = templateMetadata?.industry_tag || 'generic'
    const businessName = templateMetadata?.business_name || 'Your Business'
    
    // Industry-specific content generation
    const industryContent = this.getIndustryContent(industry, businessName)
    
    // Component-specific defaults with industry context
    const defaults: Record<string, Record<string, any>> = {
      hero: {
        title: industryContent.heroTitle,
        subtitle: industryContent.heroSubtitle,
        description: industryContent.heroDescription,
        ctaText: industryContent.ctaText,
        backgroundImage: null,
        showGradient: true
      },
      features: {
        title: industryContent.featuresTitle,
        subtitle: industryContent.featuresSubtitle,
        features: industryContent.features
      },
      pricing: {
        title: 'Our Pricing',
        subtitle: 'Choose the perfect plan for your needs',
        plans: industryContent.pricingPlans
      },
      testimonials: {
        title: 'What Our Customers Say',
        subtitle: 'Real feedback from real people',
        testimonials: industryContent.testimonials
      },
      cta: {
        title: industryContent.ctaTitle,
        subtitle: industryContent.ctaSubtitle,
        buttonText: industryContent.ctaText
      },
      footer: {
        companyName: businessName,
        copyright: `© ${new Date().getFullYear()} ${businessName}. All rights reserved.`,
        links: this.generateFooterLinks(industry)
      }
    }
    
    return defaults[componentType] || {
      title: `${componentType.charAt(0).toUpperCase() + componentType.slice(1)} Section`,
      content: 'This section is being generated dynamically.'
    }
  }
  
  /**
   * Get industry-specific content
   */
  private getIndustryContent(industry: string, businessName: string): any {
    const content: Record<string, any> = {
      salon: {
        heroTitle: `Welcome to ${businessName}`,
        heroSubtitle: 'Where beauty meets tranquility',
        heroDescription: 'Experience luxurious treatments in a serene environment',
        ctaText: 'Book Your Appointment',
        featuresTitle: 'Our Services',
        featuresSubtitle: 'Pamper yourself with our premium treatments',
        features: [
          { title: 'Hair Styling', description: 'Expert cuts and colors', icon: '💇‍♀️' },
          { title: 'Nail Care', description: 'Manicures and pedicures', icon: '💅' },
          { title: 'Spa Treatments', description: 'Relax and rejuvenate', icon: '🧖‍♀️' }
        ],
        pricingPlans: [
          { name: 'Basic Care', price: '$50', features: ['Hair Cut', 'Basic Styling'] },
          { name: 'Premium', price: '$150', features: ['Cut & Color', 'Nail Care'] },
          { name: 'Luxury', price: '$300', features: ['Full Spa Day', 'All Services'] }
        ],
        testimonials: [
          { content: 'Best salon experience ever!', author: 'Sarah M.', rating: 5 },
          { content: 'Professional and relaxing', author: 'Emily R.', rating: 5 }
        ],
        ctaTitle: 'Ready to Look Your Best?',
        ctaSubtitle: 'Book your appointment today'
      },
      saas: {
        heroTitle: `${businessName} - Transform Your Workflow`,
        heroSubtitle: 'The modern platform for digital excellence',
        heroDescription: 'Streamline operations and boost productivity',
        ctaText: 'Start Free Trial',
        featuresTitle: 'Powerful Features',
        featuresSubtitle: 'Everything you need to succeed',
        features: [
          { title: 'Analytics', description: 'Real-time insights', icon: '📊' },
          { title: 'Automation', description: 'Save time and effort', icon: '🤖' },
          { title: 'Integration', description: 'Connect all your tools', icon: '🔗' }
        ],
        pricingPlans: [
          { name: 'Starter', price: '$9/mo', features: ['Core Features', '1 User'] },
          { name: 'Pro', price: '$29/mo', features: ['All Features', '5 Users'], featured: true },
          { name: 'Enterprise', price: 'Custom', features: ['Unlimited', 'Priority Support'] }
        ],
        testimonials: [
          { content: 'Increased our efficiency by 300%', author: 'Tech Corp', rating: 5 },
          { content: 'Essential for our operations', author: 'StartupXYZ', rating: 5 }
        ],
        ctaTitle: 'Ready to Scale?',
        ctaSubtitle: 'Join thousands of successful businesses'
      }
    }
    
    return content[industry] || content.saas // Default to SaaS
  }
  
  /**
   * Generate footer links based on industry
   */
  private generateFooterLinks(industry: string): any[] {
    const commonLinks = [
      {
        title: 'Company',
        items: [
          { text: 'About', href: '#about' },
          { text: 'Contact', href: '#contact' }
        ]
      }
    ]
    
    const industryLinks: Record<string, any[]> = {
      salon: [
        {
          title: 'Services',
          items: [
            { text: 'Hair', href: '#hair' },
            { text: 'Nails', href: '#nails' },
            { text: 'Spa', href: '#spa' }
          ]
        }
      ],
      saas: [
        {
          title: 'Product',
          items: [
            { text: 'Features', href: '#features' },
            { text: 'Pricing', href: '#pricing' },
            { text: 'API', href: '#api' }
          ]
        }
      ]
    }
    
    return [...(industryLinks[industry] || industryLinks.saas), ...commonLinks]
  }
  
  /**
   * Get default value for a type
   */
  private getDefaultForType(type: string, propName: string): any {
    const typeDefaults: Record<string, any> = {
      'string': this.getStringDefault(propName),
      'number': 0,
      'boolean': true,
      'string[]': [],
      'number[]': [],
      'any[]': [],
      'object': {},
      'React.ReactNode': null,
      'ReactNode': null
    }
    
    return typeDefaults[type] || null
  }
  
  /**
   * Get intelligent string default based on prop name
   */
  private getStringDefault(propName: string): string {
    const nameDefaults: Record<string, string> = {
      title: 'Welcome to Our Site',
      subtitle: 'Discover amazing experiences',
      description: 'We provide exceptional services tailored to your needs',
      ctaText: 'Get Started',
      buttonText: 'Click Here',
      heading: 'Important Information',
      label: 'Label',
      placeholder: 'Enter text...',
      name: 'Your Name',
      email: 'your@email.com',
      phone: '(555) 123-4567'
    }
    
    return nameDefaults[propName] || 'Sample Text'
  }
  
  /**
   * Normalize component name to type
   */
  private normalizeComponentType(componentName: string): string {
    const normalized = componentName
      .replace(/Component$/, '')
      .replace(/Section$/, '')
      .replace(/([A-Z])/g, (match, p1, offset) => 
        offset > 0 ? '-' + p1.toLowerCase() : p1.toLowerCase()
      )
    
    return normalized
  }
}

// Export singleton instance
export const enhancedPropExtractor = new EnhancedPropExtractor()