// Dynamic question categories for AI-driven MCQ flow

export interface QuestionCategory {
  id: string
  priority: number
  questions: QuestionTemplate[]
}

export interface QuestionTemplate {
  trigger: string
  type: string
  aiPrompt: string
  conditions?: Record<string, unknown>
}

export const DYNAMIC_QUESTION_CATEGORIES: Record<string, QuestionCategory> = {
  // Phase 1: Foundation Questions (Always Asked)
  foundation: {
    id: 'foundation',
    priority: 1,
    questions: [
      {
        trigger: 'always',
        type: 'business_validation',
        aiPrompt: `Generate a question to validate and refine the core business concept.
          Focus on: market viability, unique value proposition, competitive differentiation, core problem being solved.
          Provide 4-6 answer options covering different business angles.`
      },
      {
        trigger: 'always', 
        type: 'target_audience',
        aiPrompt: `Ask about target audience with specific demographic and psychographic options.
          Go deeper than demographics: user personas, use cases, pain points, motivations, behavioral patterns, decision-making criteria.
          Options should be specific and actionable, not generic.`
      },
      {
        trigger: 'always',
        type: 'value_proposition',
        aiPrompt: `Generate a question about the core value proposition and what makes this business unique.
          Focus on: customer benefits, competitive advantages, problem-solution fit, value delivery.
          Options should help clarify the main value drivers.`
      }
    ]
  },
  
  // Phase 2: Conditional Questions (Based on Business Type)
  conditional: {
    id: 'conditional',
    priority: 2,
    questions: [
      {
        trigger: 'business_type:ecommerce',
        type: 'product_strategy',
        aiPrompt: `Generate questions about e-commerce strategy: product catalog, pricing strategy, fulfillment, inventory management.
          Focus on: product mix, pricing models, shipping/delivery, customer service, returns policy.
          Options should address key e-commerce operational decisions.`
      },
      {
        trigger: 'business_type:saas',
        type: 'subscription_model',
        aiPrompt: `Ask about SaaS subscription strategy: pricing tiers, feature gating, user onboarding, retention.
          Focus on: freemium vs paid, pricing strategy, feature differentiation, user acquisition.
          Options should cover different SaaS business model approaches.`
      },
      {
        trigger: 'business_type:service',
        type: 'service_delivery',
        aiPrompt: `Generate questions about service delivery: booking systems, service packages, client management, pricing.
          Focus on: service structure, delivery methods, client interaction, pricing models.
          Options should address key service business operational decisions.`
      },
      {
        trigger: 'business_type:marketplace',
        type: 'marketplace_dynamics',
        aiPrompt: `Ask about marketplace strategy: vendor management, commission structure, quality control, user experience.
          Focus on: two-sided market dynamics, revenue models, trust and safety, growth strategy.
          Options should address key marketplace platform decisions.`
      },
      {
        trigger: 'business_type:content',
        type: 'content_strategy',
        aiPrompt: `Generate questions about content strategy: content types, monetization, audience engagement, distribution.
          Focus on: content formats, revenue streams, community building, content calendar.
          Options should address key content business model decisions.`
      }
    ]
  },
  
  // Phase 3: Design & Experience Questions
  design: {
    id: 'design',
    priority: 3,
    questions: [
      {
        trigger: 'design_preferences_needed',
        type: 'visual_identity',
        aiPrompt: `Generate questions about brand personality, color psychology, and visual style.
          Focus on: brand personality traits, color preferences, typography style, imagery approach.
          Options should help establish a cohesive visual identity.`
      },
      {
        trigger: 'user_experience_focus',
        type: 'ux_priorities',
        aiPrompt: `Ask about user experience priorities: ease of use, feature richness, mobile experience, accessibility.
          Focus on: UX trade-offs, user journey priorities, interaction preferences, device considerations.
          Options should help prioritize UX decisions.`
      },
      {
        trigger: 'brand_positioning_needed',
        type: 'brand_positioning',
        aiPrompt: `Generate questions about brand positioning: tone of voice, brand personality, market positioning.
          Focus on: communication style, brand values, competitive positioning, brand promise.
          Options should help establish brand identity and messaging.`
      }
    ]
  },
  
  // Phase 4: Technical & Integration Questions
  technical: {
    id: 'technical',
    priority: 4,
    questions: [
      {
        trigger: 'integrations_needed',
        type: 'third_party_integrations',
        aiPrompt: `Ask about required third-party integrations: payment processing, analytics, marketing tools, CRM.
          Focus on: essential integrations, data flow, automation needs, tool preferences.
          Options should cover key integration categories relevant to the business type.`
      },
      {
        trigger: 'scalability_focus',
        type: 'technical_requirements',
        aiPrompt: `Generate questions about technical requirements: performance, security, scalability, compliance.
          Focus on: expected traffic, security needs, compliance requirements, performance priorities.
          Options should address key technical considerations.`
      },
      {
        trigger: 'mobile_strategy_needed',
        type: 'mobile_strategy',
        aiPrompt: `Ask about mobile strategy: responsive web, mobile app, mobile-first design, offline capabilities.
          Focus on: mobile user needs, platform preferences, feature priorities, development approach.
          Options should help determine mobile strategy.`
      }
    ]
  },
  
  // Phase 5: Refinement Questions (Based on Gaps)
  refinement: {
    id: 'refinement',
    priority: 5,
    questions: [
      {
        trigger: 'gap_analysis',
        type: 'feature_prioritization',
        aiPrompt: `Based on previous answers, ask about feature priorities using the MoSCoW method.
          Present 6-8 potential features and ask user to categorize as:
          - Must Have (core functionality)
          - Should Have (important but not critical)
          - Could Have (nice to have)
          - Won't Have (out of scope for now)
          Features should be specific to their business type and context.`
      },
      {
        trigger: 'monetization_unclear',
        type: 'revenue_model',
        aiPrompt: `Generate questions about revenue models and monetization strategy.
          Focus on: pricing strategy, revenue streams, payment methods, subscription vs one-time.
          Options should help clarify the primary monetization approach.`
      },
      {
        trigger: 'growth_strategy_needed',
        type: 'growth_strategy',
        aiPrompt: `Ask about growth and marketing strategy: customer acquisition, retention, viral growth, partnerships.
          Focus on: marketing channels, growth tactics, customer lifecycle, scaling approach.
          Options should address key growth and marketing decisions.`
      },
      {
        trigger: 'success_metrics_undefined',
        type: 'success_metrics',
        aiPrompt: `Generate questions about success metrics and key performance indicators.
          Focus on: primary success metrics, tracking priorities, goal setting, measurement approach.
          Options should help define what success looks like for this business.`
      }
    ]
  },
  
  // Phase 6: Optimization Questions (Advanced)
  optimization: {
    id: 'optimization',
    priority: 6,
    questions: [
      {
        trigger: 'conversion_optimization',
        type: 'conversion_strategy',
        aiPrompt: `Ask about conversion optimization: landing pages, sales funnels, checkout process, trust signals.
          Focus on: conversion points, optimization priorities, trust building, friction reduction.
          Options should address key conversion optimization opportunities.`
      },
      {
        trigger: 'customer_retention',
        type: 'retention_strategy',
        aiPrompt: `Generate questions about customer retention: loyalty programs, engagement, support, community.
          Focus on: retention tactics, customer success, engagement strategies, community building.
          Options should help improve customer lifetime value.`
      },
      {
        trigger: 'competitive_advantage',
        type: 'differentiation_strategy',
        aiPrompt: `Ask about competitive differentiation: unique features, market positioning, competitive moats.
          Focus on: differentiation factors, competitive advantages, market gaps, innovation opportunities.
          Options should help strengthen competitive position.`
      }
    ]
  }
}

// Question trigger evaluation functions
export class QuestionTriggerEvaluator {
  static shouldTrigger(trigger: string, context: Record<string, unknown>): boolean {
    // Handle 'always' trigger
    if (trigger === 'always') {
      return true
    }
    
    // Handle business type triggers
    if (trigger.startsWith('business_type:')) {
      const requiredType = trigger.split(':')[1]
      return context.businessType === requiredType
    }
    
    // Handle conditional triggers based on previous answers
    if (trigger === 'design_preferences_needed') {
      return !context.hasDesignPreferences
    }
    
    if (trigger === 'gap_analysis') {
      return (context.questionsAnswered as number || 0) >= 3
    }
    
    if (trigger === 'monetization_unclear') {
      return !context.hasMonetizationStrategy
    }
    
    if (trigger === 'integrations_needed') {
      return context.businessComplexity === 'moderate' || context.businessComplexity === 'complex'
    }
    
    // Default: don't trigger
    return false
  }
  
  static getTriggeredQuestions(
    context: Record<string, unknown>, 
    answeredCategories: string[] = []
  ): QuestionTemplate[] {
    const triggeredQuestions: QuestionTemplate[] = []
    
    // Sort categories by priority
    const sortedCategories = Object.values(DYNAMIC_QUESTION_CATEGORIES)
      .sort((a, b) => a.priority - b.priority)
    
    for (const category of sortedCategories) {
      // Skip if category already completed
      if (answeredCategories.includes(category.id)) {
        continue
      }
      
      // Check each question in the category
      for (const question of category.questions) {
        if (this.shouldTrigger(question.trigger, context)) {
          triggeredQuestions.push(question)
        }
      }
      
      // Only return questions from the highest priority category that has triggers
      if (triggeredQuestions.length > 0) {
        break
      }
    }
    
    return triggeredQuestions
  }
}

// Business type feature mapping
export const BUSINESS_TYPE_FEATURES: Record<string, string[]> = {
  ecommerce: [
    'Shopping Cart', 'Product Catalog', 'Payment Processing', 'Inventory Management', 
    'Order Tracking', 'Customer Reviews', 'Wish Lists', 'Discount Codes',
    'Multi-vendor Support', 'Subscription Products', 'Digital Downloads'
  ],
  saas: [
    'User Dashboard', 'Subscription Management', 'API Integration', 'Analytics Reporting', 
    'Team Collaboration', 'Data Export', 'Custom Branding', 'SSO Authentication',
    'Usage Analytics', 'Billing Management', 'Feature Flags'
  ],
  service: [
    'Online Booking', 'Service Packages', 'Client Portal', 'Appointment Scheduling', 
    'Payment Processing', 'Service Gallery', 'Contact Forms', 'Testimonials',
    'Resource Booking', 'Staff Management', 'Customer Communication'
  ],
  marketplace: [
    'Vendor Registration', 'Product Listings', 'Commission System', 'Search & Filters', 
    'Rating System', 'Message Center', 'Payment Processing', 'Dispute Resolution',
    'Verification System', 'Analytics Dashboard', 'Promotional Tools'
  ],
  content: [
    'Content Management', 'Search Functionality', 'Social Sharing', 'Comment System', 
    'Newsletter Signup', 'Content Categories', 'Author Profiles', 'Archive System',
    'Subscription Content', 'Content Analytics', 'SEO Tools'
  ],
  general: [
    'Contact Forms', 'Social Media Integration', 'Newsletter Signup', 'Analytics Tracking', 
    'SEO Optimization', 'Mobile Optimization', 'Security Features', 'Performance Optimization'
  ]
}