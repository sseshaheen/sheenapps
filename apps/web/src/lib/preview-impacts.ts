// Answer-to-Preview Impact Mapping System

import type { PreviewImpact } from '@/types/question-flow'

export interface ImpactConfig {
  content: {
    headlines: string[]
    testimonials: string
    imagery: string
    tone: string
  }
  features: string[]
  colors: string[]
  layout?: string
  animations?: string[]
}

export interface ElementConfig {
  type: 'add_section' | 'update_navigation' | 'update_cta' | 'add_feature_icon' | 'modify_layout'
  position?: string
  content?: string | Record<string, unknown>
  action?: string
  animation?: string
  style?: string
}

// Comprehensive Answer-to-Preview Impact Mapping
export const ANSWER_PREVIEW_IMPACTS = {
  // Target Audience Impacts
  audience: {
    'small_business_owners': {
      content: {
        headlines: [
          'Grow Your Business with Confidence',
          'Streamline Operations & Save Time',
          'Professional Tools for Small Business Success'
        ],
        testimonials: 'business_owners',
        imagery: 'professional_business',
        tone: 'professional_friendly'
      },
      features: ['analytics_dashboard', 'team_management', 'client_portal', 'automated_reporting'],
      colors: ['corporate_blue', 'trust_green', 'professional_gray'],
      layout: 'professional_layout'
    },
    
    'creative_professionals': {
      content: {
        headlines: [
          'Showcase Your Creative Vision',
          'Stand Out with Stunning Portfolios',
          'Creative Freedom Meets Professional Results'
        ],
        testimonials: 'artists_designers',
        imagery: 'creative_portfolio',
        tone: 'inspiring_creative'
      },
      features: ['portfolio_gallery', 'booking_system', 'client_showcase', 'project_management'],
      colors: ['creative_purple', 'artistic_orange', 'modern_black'],
      layout: 'creative_layout'
    },
    
    'e_commerce_sellers': {
      content: {
        headlines: [
          'Boost Your Online Sales',
          'Reach More Customers Worldwide',
          'Scale Your Store with Confidence'
        ],
        testimonials: 'store_owners',
        imagery: 'product_showcase',
        tone: 'sales_focused'
      },
      features: ['shopping_cart', 'inventory_management', 'payment_processing', 'order_tracking'],
      colors: ['conversion_red', 'trust_blue', 'money_green'],
      layout: 'ecommerce_layout'
    },
    
    'service_providers': {
      content: {
        headlines: [
          'Streamline Your Service Business',
          'Professional Booking Made Simple',
          'Deliver Excellence Every Time'
        ],
        testimonials: 'service_clients',
        imagery: 'service_delivery',
        tone: 'trustworthy_professional'
      },
      features: ['online_booking', 'client_management', 'service_packages', 'scheduling'],
      colors: ['service_blue', 'reliability_green', 'trust_navy'],
      layout: 'service_layout'
    },
    
    'entrepreneurs': {
      content: {
        headlines: [
          'Turn Your Ideas Into Reality',
          'Launch Faster, Scale Smarter',
          'Build the Future Today'
        ],
        testimonials: 'startup_founders',
        imagery: 'innovation_focused',
        tone: 'ambitious_inspiring'
      },
      features: ['mvp_builder', 'analytics', 'user_feedback', 'growth_tools'],
      colors: ['startup_orange', 'innovation_purple', 'growth_green'],
      layout: 'startup_layout'
    }
  },
  
  // Feature Impacts
  features: {
    'online_booking': {
      elements: [
        {
          type: 'add_section',
          position: 'before_footer',
          content: 'booking_calendar_section',
          animation: 'slideUp'
        },
        {
          type: 'update_navigation',
          action: 'add_item',
          content: { text: 'Book Now', href: '#booking', icon: 'calendar' }
        },
        {
          type: 'update_cta',
          content: 'Schedule Your Appointment',
          style: 'primary_button'
        }
      ]
    },
    
    'e_commerce': {
      elements: [
        {
          type: 'add_section',
          position: 'hero_after',
          content: 'featured_products_section',
          animation: 'fadeInUp'
        },
        {
          type: 'update_navigation',
          action: 'add_item',
          content: { text: 'Shop', href: '#products', icon: 'shopping_bag' }
        },
        {
          type: 'add_feature_icon',
          content: 'secure_checkout_badge',
          position: 'footer'
        }
      ]
    },
    
    'portfolio_gallery': {
      elements: [
        {
          type: 'add_section',
          position: 'hero_after',
          content: 'portfolio_showcase',
          animation: 'staggerFadeIn'
        },
        {
          type: 'update_navigation',
          action: 'add_item',
          content: { text: 'Portfolio', href: '#portfolio', icon: 'image' }
        },
        {
          type: 'modify_layout',
          content: 'creative_grid_layout'
        }
      ]
    },
    
    'analytics_dashboard': {
      elements: [
        {
          type: 'add_section',
          position: 'features_section',
          content: 'analytics_preview',
          animation: 'slideInFromRight'
        },
        {
          type: 'update_navigation',
          action: 'add_item',
          content: { text: 'Analytics', href: '#analytics', icon: 'bar_chart' }
        }
      ]
    },
    
    'client_portal': {
      elements: [
        {
          type: 'add_section',
          position: 'features_section',
          content: 'client_portal_demo',
          animation: 'fadeInUp'
        },
        {
          type: 'update_cta',
          content: 'Access Your Portal',
          style: 'secondary_button'
        }
      ]
    }
  },
  
  // Design & Visual Impacts
  design: {
    'modern_minimalist': {
      theme: {
        colors: {
          primary: '#6366f1',
          secondary: '#ec4899',
          background: '#ffffff',
          text: '#1f2937',
          accent: '#f3f4f6'
        },
        typography: {
          headingFont: 'Inter',
          bodyFont: 'Inter',
          scale: 'moderate',
          weight: 'normal'
        },
        spacing: 'generous',
        borderRadius: 'subtle',
        shadows: 'minimal',
        layout: 'clean_grid'
      }
    },
    
    'bold_creative': {
      theme: {
        colors: {
          primary: '#f59e0b',
          secondary: '#ef4444',
          background: '#111827',
          text: '#ffffff',
          accent: '#7c3aed'
        },
        typography: {
          headingFont: 'Oswald',
          bodyFont: 'Open Sans',
          scale: 'dramatic',
          weight: 'bold'
        },
        spacing: 'tight',
        borderRadius: 'sharp',
        shadows: 'dramatic',
        layout: 'creative_asymmetric'
      }
    },
    
    'professional_corporate': {
      theme: {
        colors: {
          primary: '#2563eb',
          secondary: '#64748b',
          background: '#f8fafc',
          text: '#0f172a',
          accent: '#e2e8f0'
        },
        typography: {
          headingFont: 'Roboto',
          bodyFont: 'Roboto',
          scale: 'conservative',
          weight: 'medium'
        },
        spacing: 'structured',
        borderRadius: 'conservative',
        shadows: 'subtle',
        layout: 'formal_grid'
      }
    },
    
    'elegant_luxury': {
      theme: {
        colors: {
          primary: '#1f2937',
          secondary: '#d4af37',
          background: '#fafafa',
          text: '#111827',
          accent: '#f3f4f6'
        },
        typography: {
          headingFont: 'Playfair Display',
          bodyFont: 'Source Sans Pro',
          scale: 'elegant',
          weight: 'light'
        },
        spacing: 'luxurious',
        borderRadius: 'refined',
        shadows: 'elegant',
        layout: 'sophisticated_asymmetric'
      }
    }
  },
  
  // Business Model Impacts
  business_model: {
    'subscription_saas': {
      content: {
        headlines: ['Start Your Free Trial', 'Choose Your Plan', 'Scale with Confidence'],
        cta_primary: 'Start Free Trial',
        cta_secondary: 'View Pricing',
        value_props: ['No setup fees', 'Cancel anytime', 'Instant access']
      },
      features: ['pricing_tiers', 'trial_signup', 'subscription_management'],
      layout_elements: ['pricing_section', 'feature_comparison', 'testimonials']
    },
    
    'one_time_purchase': {
      content: {
        headlines: ['Get Instant Access', 'One-Time Payment', 'Lifetime Value'],
        cta_primary: 'Buy Now',
        cta_secondary: 'Learn More',
        value_props: ['One-time payment', 'Lifetime access', 'No recurring fees']
      },
      features: ['purchase_button', 'feature_showcase', 'money_back_guarantee'],
      layout_elements: ['hero_purchase', 'feature_grid', 'guarantee_section']
    },
    
    'freemium': {
      content: {
        headlines: ['Start Free Forever', 'Upgrade When Ready', 'No Credit Card Required'],
        cta_primary: 'Get Started Free',
        cta_secondary: 'See Premium Features',
        value_props: ['Always free tier', 'Upgrade anytime', 'No commitments']
      },
      features: ['free_signup', 'feature_limits', 'upgrade_prompts'],
      layout_elements: ['free_tier_benefits', 'upgrade_comparison', 'success_stories']
    }
  },
  
  // Industry-Specific Impacts
  industry: {
    'healthcare': {
      content: {
        tone: 'trustworthy_medical',
        compliance_badges: ['HIPAA', 'SOC2', 'Medical_certified'],
        testimonials: 'healthcare_professionals'
      },
      colors: ['medical_blue', 'trust_white', 'health_green'],
      features: ['patient_portal', 'appointment_booking', 'secure_messaging']
    },
    
    'finance': {
      content: {
        tone: 'secure_authoritative',
        compliance_badges: ['PCI_DSS', 'SOX', 'Financial_regulated'],
        testimonials: 'financial_professionals'
      },
      colors: ['finance_navy', 'trust_gold', 'security_gray'],
      features: ['secure_transactions', 'compliance_reporting', 'audit_trail']
    },
    
    'education': {
      content: {
        tone: 'educational_supportive',
        compliance_badges: ['FERPA', 'COPPA', 'Education_certified'],
        testimonials: 'educators_students'
      },
      colors: ['education_blue', 'learning_orange', 'knowledge_green'],
      features: ['course_management', 'student_portal', 'progress_tracking']
    }
  }
}

// Helper functions for generating dynamic impacts
export class PreviewImpactGenerator {
  static generateImpactForAnswer(
    category: string,
    answer: string,
    questionContext?: Record<string, unknown>
  ): PreviewImpact[] {
    const impacts: PreviewImpact[] = []
    
    // Normalize answer for lookup
    const normalizedAnswer = answer.toLowerCase().replace(/\s+/g, '_')
    
    // Get base impact configuration
    const categoryImpacts = ANSWER_PREVIEW_IMPACTS[category as keyof typeof ANSWER_PREVIEW_IMPACTS]
    const specificImpact = categoryImpacts?.[normalizedAnswer as keyof typeof categoryImpacts]
    
    if (specificImpact) {
      impacts.push(...this.convertConfigToImpacts(specificImpact, category, answer))
    }
    
    // Add contextual impacts based on question context
    if (questionContext) {
      impacts.push(...this.generateContextualImpacts(category, answer, questionContext))
    }
    
    return impacts
  }
  
  private static convertConfigToImpacts(
    config: Record<string, unknown>,
    category: string,
    answer: string
  ): PreviewImpact[] {
    const impacts: PreviewImpact[] = []
    
    if (category === 'audience' && 'content' in config) {
      const content = config.content as ImpactConfig['content']
      
      impacts.push({
        action: 'content_change',
        target: 'hero_section',
        changes: {
          headline: content.headlines[0],
          tone: content.tone
        },
        animationDuration: 1000
      })
    }
    
    if (category === 'features' && 'elements' in config) {
      const elements = config.elements as ElementConfig[]
      
      elements.forEach(element => {
        impacts.push({
          action: element.type === 'add_section' ? 'feature_add' : 'layout_update',
          target: element.position || 'main_content',
          changes: { element: element.content },
          animationDuration: 800
        })
      })
    }
    
    if (category === 'design' && 'theme' in config) {
      const theme = config.theme as Record<string, unknown>
      
      impacts.push({
        action: 'theme_change',
        target: 'root',
        changes: theme,
        animationDuration: 1200
      })
    }
    
    return impacts
  }
  
  private static generateContextualImpacts(
    category: string,
    answer: string,
    context: Record<string, unknown>
  ): PreviewImpact[] {
    const impacts: PreviewImpact[] = []
    
    // Add business-type specific impacts
    if (context.businessType) {
      const businessImpact = this.getBusinessTypeImpact(context.businessType as string, answer)
      if (businessImpact) {
        impacts.push(businessImpact)
      }
    }
    
    // Add audience-specific impacts
    if (context.targetAudience) {
      const audienceImpact = this.getAudienceSpecificImpact(context.targetAudience as string, answer)
      if (audienceImpact) {
        impacts.push(audienceImpact)
      }
    }
    
    return impacts
  }
  
  private static getBusinessTypeImpact(businessType: string, answer: string): PreviewImpact | null {
    const businessTypeMapping: Record<string, Record<string, unknown>> = {
      'ecommerce': {
        target: 'product_section',
        changes: { layout: 'product_grid', features: ['cart', 'wishlist'] }
      },
      'saas': {
        target: 'pricing_section', 
        changes: { layout: 'pricing_tiers', features: ['trial', 'plans'] }
      },
      'service': {
        target: 'booking_section',
        changes: { layout: 'calendar_booking', features: ['scheduling', 'payments'] }
      }
    }
    
    const mapping = businessTypeMapping[businessType]
    
    if (mapping) {
      return {
        action: 'layout_update',
        target: mapping.target as string,
        changes: mapping.changes as Record<string, unknown>,
        animationDuration: 1000
      }
    }
    
    return null
  }
  
  private static getAudienceSpecificImpact(audience: string, answer: string): PreviewImpact | null {
    // Generate audience-specific content updates
    const audienceMapping: Record<string, Record<string, unknown>> = {
      'small_business_owners': {
        tone: 'professional',
        imagery: 'business_focused',
        testimonials: 'business_owners'
      },
      'creative_professionals': {
        tone: 'inspiring',
        imagery: 'creative_showcase',
        testimonials: 'artists'
      }
    }
    
    const normalizedAudience = audience.toLowerCase().replace(/\s+/g, '_')
    const mapping = audienceMapping[normalizedAudience]
    
    if (mapping) {
      return {
        action: 'content_change',
        target: 'content_sections',
        changes: mapping,
        animationDuration: 800
      }
    }
    
    return null
  }
  
  // Get color scheme based on business type and design preference
  static getColorScheme(businessType: string, designPreference: string): Record<string, string> {
    const schemes: Record<string, Record<string, string>> = {
      'ecommerce': {
        primary: '#e11d48',
        secondary: '#0891b2',
        accent: '#f59e0b'
      },
      'saas': {
        primary: '#6366f1',
        secondary: '#8b5cf6',
        accent: '#06b6d4'
      },
      'service': {
        primary: '#059669',
        secondary: '#0d9488',
        accent: '#84cc16'
      }
    }
    
    return schemes[businessType] || schemes['saas']
  }
  
  // Generate dynamic headlines based on business context
  static generateDynamicHeadline(
    businessType: string,
    targetAudience: string,
    valueProposition?: string
  ): string {
    const templates: Record<string, string[]> = {
      'ecommerce': [
        'Shop {category} That {audience} Love',
        'Premium {category} for {audience}',
        'Your Favorite {category} Store'
      ],
      'saas': [
        'The {audience} Platform',
        'Streamline Your {business_function}',
        '{value_prop} for {audience}'
      ],
      'service': [
        'Professional {service_type} for {audience}',
        'Book {service_type} in Minutes',
        'Expert {service_type} Services'
      ]
    }
    
    const businessTemplates = templates[businessType] || templates['saas']
    const template = businessTemplates[0]
    
    // Replace placeholders with actual values
    return template
      .replace('{audience}', targetAudience)
      .replace('{value_prop}', valueProposition || 'Solutions')
      .replace('{business_function}', this.getBusinessFunction(businessType))
      .replace('{service_type}', this.getServiceType(businessType))
      .replace('{category}', this.getProductCategory(businessType))
  }
  
  private static getBusinessFunction(businessType: string): string {
    const functions: Record<string, string> = {
      'saas': 'Operations',
      'ecommerce': 'Sales',
      'service': 'Booking',
      'marketplace': 'Trading'
    }
    
    return functions[businessType] || 'Business'
  }
  
  private static getServiceType(businessType: string): string {
    const services: Record<string, string> = {
      'service': 'Consultation',
      'healthcare': 'Medical Care',
      'education': 'Learning',
      'finance': 'Financial Advisory'
    }
    
    return services[businessType] || 'Services'
  }
  
  private static getProductCategory(businessType: string): string {
    const categories: Record<string, string> = {
      'ecommerce': 'Products',
      'fashion': 'Fashion',
      'electronics': 'Electronics',
      'home': 'Home & Garden'
    }
    
    return categories[businessType] || 'Items'
  }
}