import { SpecBlock } from '@/types/spec-block'
import { logger } from '@/utils/logger'
import salonTemplateData from './salon-template.json'
import {
  AIResponse,
  BusinessAnalysis,
  BusinessName,
  BusinessTagline,
  FeatureRecommendation,
  PricingStrategy,
  StreamingAIResponse
} from './types'

// Realistic mock data for different business types
const MOCK_BUSINESS_DATA = {
  handmade_jewelry: {
    analysis: {
      businessType: 'ecommerce' as const,
      industry: 'Fashion & Accessories',
      subCategory: 'Handmade Jewelry',
      coreOffering: 'Handcrafted jewelry pieces with personalized touch',
      valuePropositions: [
        'Unique, one-of-a-kind pieces',
        'Artisanal craftsmanship and quality',
        'Personal connection and story behind each piece',
        'Sustainable and ethical production',
        'Custom design capabilities'
      ],
      targetAudience: 'Fashion-conscious women aged 25-45 who value authenticity and uniqueness',
      demographics: {
        ageRange: '25-45',
        income: '$40,000-100,000',
        geography: 'Urban and suburban areas',
        lifestyle: ['Creative', 'Environmentally conscious', 'Social media active']
      },
      psychographics: {
        values: ['Authenticity', 'Quality', 'Uniqueness', 'Supporting small business'],
        interests: ['Fashion', 'Art', 'Self-expression', 'Sustainability'],
        painPoints: ['Mass-produced jewelry lacks personality', 'Difficulty finding unique pieces', 'Quality concerns with cheap jewelry'],
        motivations: ['Self-expression', 'Standing out', 'Supporting artisans', 'Gift-giving']
      },
      businessModel: 'b2c' as const,
      revenueModel: 'one_time' as const,
      geographicScope: 'national' as const,
      brandPersonality: ['Artistic', 'Authentic', 'Elegant', 'Personal', 'Quality-focused'],
      communicationStyle: 'emotional' as const,
      differentiators: [
        'Hand-crafted with love and attention to detail',
        'Story and meaning behind each piece',
        'Custom design service available',
        'Sustainable materials and practices'
      ],
      marketOpportunities: [
        'Growing demand for authentic, handmade products',
        'Personalization trend in jewelry market',
        'Online marketplace expansion',
        'Wedding and special occasion market'
      ],
      challenges: [
        'Scaling production while maintaining quality',
        'Standing out in crowded jewelry market',
        'Building trust for online purchases',
        'Pricing competitive with mass-produced alternatives'
      ],
      confidence: 0.92,
      keyInsights: [
        'Artisanal craftsmanship is core differentiator',
        'Target audience values authenticity over mass production',
        'Premium pricing strategy recommended due to handmade nature',
        'Strong storytelling and brand narrative essential'
      ],
      competitiveAdvantages: [
        'Personal touch and customization',
        'Authentic artisan story',
        'Quality materials and craftsmanship',
        'Direct relationship with customers'
      ]
    },
    names: [
      {
        name: 'Luna Craft Atelier',
        reasoning: 'Luna suggests uniqueness and femininity, Craft emphasizes handmade nature, Atelier adds artistic sophistication',
        brandFit: 0.94,
        memorability: 0.89,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: ['Luna Designs', 'Crescent Craft Studio'],
        tags: ['elegant', 'artistic', 'memorable']
      },
      {
        name: 'Artisan Spark Studio',
        reasoning: 'Artisan emphasizes craftsmanship, Spark suggests creativity and inspiration, Studio indicates professional workspace',
        brandFit: 0.91,
        memorability: 0.85,
        availability: {
          domain: false,
          trademark: true,
          social: { instagram: false, twitter: true, facebook: true }
        },
        alternatives: ['Spark Jewelry Studio', 'Artisan Spark Co.'],
        tags: ['professional', 'creative', 'trustworthy']
      }
    ]
  },

  saas_project_management: {
    analysis: {
      businessType: 'saas' as const,
      industry: 'Technology',
      subCategory: 'Project Management Software',
      coreOffering: 'Intuitive project management platform for growing teams',
      valuePropositions: [
        'Simplified project tracking without complexity',
        'Real-time collaboration features',
        'Intuitive interface that teams actually use',
        'Automated reporting and insights',
        'Affordable pricing for small to medium teams'
      ],
      targetAudience: 'Project managers and team leads in companies with 10-100 employees',
      demographics: {
        ageRange: '28-50',
        income: '$50,000-120,000',
        geography: 'Global, primarily English-speaking markets',
        lifestyle: ['Tech-savvy', 'Efficiency-focused', 'Remote work friendly']
      },
      psychographics: {
        values: ['Efficiency', 'Collaboration', 'Results', 'Simplicity'],
        interests: ['Productivity', 'Team management', 'Technology', 'Professional development'],
        painPoints: ['Complex tools that teams resist using', 'Lack of visibility into project status', 'Time wasted on status meetings'],
        motivations: ['Improving team productivity', 'Delivering projects on time', 'Reducing administrative overhead']
      },
      businessModel: 'b2b' as const,
      revenueModel: 'subscription' as const,
      geographicScope: 'global' as const,
      brandPersonality: ['Professional', 'Efficient', 'Reliable', 'User-friendly', 'Modern'],
      communicationStyle: 'formal' as const,
      differentiators: [
        'Focus on simplicity over feature bloat',
        'Designed for team adoption, not just managers',
        'AI-powered insights and automation',
        'Affordable pricing model'
      ],
      marketOpportunities: [
        'Remote work driving need for digital collaboration',
        'SMB market underserved by complex enterprise tools',
        'Integration opportunities with existing business tools',
        'AI automation reducing manual project management tasks'
      ],
      challenges: [
        'Competing with established players like Asana and Monday',
        'Customer acquisition in crowded market',
        'Balancing simplicity with feature requests',
        'Building integrations with existing tool ecosystem'
      ],
      confidence: 0.87,
      keyInsights: [
        'Simplicity and ease of use are key differentiators',
        'SMB market offers significant opportunity',
        'Team adoption more important than manager features',
        'Freemium model recommended for market penetration'
      ],
      competitiveAdvantages: [
        'User-centric design philosophy',
        'Focus on team collaboration over individual productivity',
        'Modern, intuitive interface',
        'Responsive customer support'
      ]
    }
  }
}

export class MockAIService {
  private responseDelay: Record<string, number> = {
    'mock-fast': 300,
    'mock-premium': 1500
  }

  async analyzeBusinessIdea(
    idea: string,
    serviceKey = 'mock-premium'
  ): Promise<AIResponse<BusinessAnalysis>> {
    await this.simulateProcessing(serviceKey, 'Analyzing business concept...')

    const analysis = this.generateIntelligentAnalysis(idea)

    return {
      success: true,
      data: analysis,
      metadata: {
        model: serviceKey,
        tokensUsed: 1200,
        responseTime: this.responseDelay[serviceKey],
        confidence: analysis.confidence,
        cost: 0.015
      }
    }
  }

  async *analyzeBusinessIdeaStream(
    idea: string,
    serviceKey = 'mock-premium'
  ): AsyncGenerator<StreamingAIResponse> {
    yield { type: 'start', content: 'Initializing business analysis...' }

    await this.simulateDelay(300)
    yield {
      type: 'insight',
      content: 'Detecting business patterns and market indicators...',
      metadata: { progress: 20 }
    }

    await this.simulateDelay(400)
    const businessType = this.detectBusinessType(idea)
    yield {
      type: 'insight',
      content: `Identified as ${businessType} business with high confidence`,
      metadata: { confidence: 0.85, progress: 40 }
    }

    await this.simulateDelay(500)
    yield {
      type: 'recommendation',
      content: 'Found strong market opportunities and unique value propositions',
      metadata: { progress: 60 }
    }

    await this.simulateDelay(300)
    yield {
      type: 'insight',
      content: 'Analyzing target audience and competitive landscape...',
      metadata: { progress: 80 }
    }

    await this.simulateDelay(400)
    const analysis = this.generateIntelligentAnalysis(idea)
    yield {
      type: 'complete',
      content: 'Analysis complete! Ready to generate business content.',
      metadata: { progress: 100, confidence: analysis.confidence }
    }
  }

  async generateBusinessNames(
    analysis: BusinessAnalysis,
    serviceKey = 'mock-fast'
  ): Promise<AIResponse<BusinessName[]>> {
    await this.simulateProcessing(serviceKey, 'Crafting unique business names...')

    const names = this.generateContextualNames(analysis)

    return {
      success: true,
      data: names,
      metadata: {
        model: serviceKey,
        tokensUsed: 600,
        responseTime: this.responseDelay[serviceKey],
        cost: 0.008
      }
    }
  }

  async generateTaglines(
    analysis: BusinessAnalysis,
    selectedName: string,
    serviceKey = 'mock-premium'
  ): Promise<AIResponse<BusinessTagline[]>> {
    await this.simulateProcessing(serviceKey, 'Creating compelling taglines...')

    const taglines = this.generateContextualTaglines(analysis, selectedName)

    return {
      success: true,
      data: taglines,
      metadata: {
        model: serviceKey,
        tokensUsed: 800,
        responseTime: this.responseDelay[serviceKey],
        cost: 0.012
      }
    }
  }

  async recommendFeatures(
    analysis: BusinessAnalysis,
    serviceKey = 'mock-premium'
  ): Promise<AIResponse<FeatureRecommendation[]>> {
    await this.simulateProcessing(serviceKey, 'Analyzing feature requirements...')

    const features = this.generateSmartFeatures(analysis)

    return {
      success: true,
      data: features,
      metadata: {
        model: serviceKey,
        tokensUsed: 1000,
        responseTime: this.responseDelay[serviceKey],
        cost: 0.015
      }
    }
  }

  async generatePricingStrategy(
    analysis: BusinessAnalysis,
    serviceKey = 'mock-premium'
  ): Promise<AIResponse<PricingStrategy>> {
    await this.simulateProcessing(serviceKey, 'Developing pricing strategy...')

    const pricing = this.generateIntelligentPricing(analysis)

    return {
      success: true,
      data: pricing,
      metadata: {
        model: serviceKey,
        tokensUsed: 900,
        responseTime: this.responseDelay[serviceKey],
        cost: 0.014
      }
    }
  }

  async generateSpecBlock(
    userIdea: string,
    serviceKey = 'mock-fast'
  ): Promise<AIResponse<SpecBlock>> {
    await this.simulateProcessing(serviceKey, 'Generating spec block...')

    // Generate a mock spec block based on the user idea
    const spec = this.generateIntelligentSpecBlock(userIdea)

    return {
      success: true,
      data: spec,
      metadata: {
        model: serviceKey,
        tokensUsed: 200,
        responseTime: this.responseDelay[serviceKey],
        confidence: 0.85,
        cost: 0.003
      }
    }
  }

  async generateProjectFromSpec(
    specBlock: SpecBlock,
    serviceKey = 'mock-premium'
  ): Promise<AIResponse<any>> {
    await this.simulateProcessing(serviceKey, 'Generating project from spec...')

    // Generate mock project based on spec block
    const project = this.generateProjectTemplate(specBlock)

    return {
      success: true,
      data: project,
      metadata: {
        model: serviceKey,
        tokensUsed: 3000,
        responseTime: this.responseDelay[serviceKey] * 3, // Template generation takes longer
        confidence: 0.92,
        cost: 0.045
      }
    }
  }

  // Helper methods for intelligent mock generation
  private async simulateProcessing(serviceKey: string, message: string) {
    await this.simulateDelay(this.responseDelay[serviceKey])
  }

  private async simulateDelay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private detectBusinessType(idea: string): string {
    const lowerIdea = idea.toLowerCase()

    if (lowerIdea.includes('handmade') || lowerIdea.includes('jewelry') || lowerIdea.includes('craft')) {
      return 'Artisan E-commerce'
    }
    if (lowerIdea.includes('saas') || lowerIdea.includes('software') || lowerIdea.includes('platform')) {
      return 'SaaS Platform'
    }
    if (lowerIdea.includes('restaurant') || lowerIdea.includes('food') || lowerIdea.includes('delivery')) {
      return 'Food Service'
    }
    if (lowerIdea.includes('consulting') || lowerIdea.includes('service') || lowerIdea.includes('advisor')) {
      return 'Professional Service'
    }

    return 'General Business'
  }

  private generateIntelligentAnalysis(idea: string): BusinessAnalysis {
    const normalizedIdea = idea.trim().toLowerCase()
    const cleanIdea = normalizedIdea.replace(/[.,!?;:]/g, '').trim()

    // Check for exact known prompts first
    if (cleanIdea === 'i want to sell homemade cookies online') {
      return {
        businessType: 'ecommerce',
        industry: 'Food & Beverage',
        subCategory: 'Homemade Baked Goods',
        coreOffering: 'Fresh, homemade cookies delivered to customers doorsteps',
        valuePropositions: [
          'Freshly baked cookies made with love',
          'Convenient online ordering and delivery',
          'Customizable cookie options and gift packages',
          'Supporting local home-based business'
        ],
        targetAudience: 'Cookie lovers who value homemade quality and convenience',
        demographics: {
          ageRange: '25-55',
          income: '$30,000-80,000',
          geography: 'Local delivery area',
          lifestyle: ['Food enthusiasts', 'Gift givers', 'Busy professionals', 'Parents']
        },
        psychographics: {
          values: ['Quality', 'Convenience', 'Supporting local', 'Homemade authenticity'],
          interests: ['Baking', 'Desserts', 'Local food', 'Gift giving'],
          painPoints: ['Limited time to bake', 'Craving homemade treats', 'Finding unique gifts'],
          motivations: ['Enjoying fresh cookies', 'Convenience', 'Supporting small business']
        },
        businessModel: 'b2c',
        revenueModel: 'one_time',
        geographicScope: 'local',
        brandPersonality: ['Warm', 'Friendly', 'Homey', 'Delicious', 'Local'],
        communicationStyle: 'casual',
        differentiators: [
          'Made fresh to order',
          'Family recipes and secret ingredients',
          'Local delivery within hours',
          'Personal touch with every order'
        ],
        marketOpportunities: [
          'Growing demand for local food delivery',
          'Gift market for special occasions',
          'Corporate catering opportunities',
          'Subscription box potential'
        ],
        challenges: [
          'Managing delivery logistics',
          'Scaling production from home kitchen',
          'Competing with commercial bakeries',
          'Maintaining freshness during delivery'
        ],
        confidence: 0.89,
        keyInsights: [
          'Focus on the homemade, personal touch as key differentiator',
          'Delivery convenience is crucial for success',
          'Gift packaging can increase average order value',
          'Local community connection drives customer loyalty'
        ],
        competitiveAdvantages: [
          'Homemade quality and taste',
          'Flexible customization',
          'Personal customer relationships',
          'Quick local delivery'
        ]
      }
    }

    if (cleanIdea === 'i need a booking app for my salon') {
      return {
        businessType: 'service',
        industry: 'Beauty & Wellness',
        subCategory: 'Salon Services',
        coreOffering: 'Professional salon services with convenient online booking',
        valuePropositions: [
          'Easy online appointment scheduling',
          'Professional beauty and hair services',
          'Experienced and certified stylists',
          'Relaxing salon experience'
        ],
        targetAudience: 'Style-conscious individuals seeking professional beauty services',
        demographics: {
          ageRange: '20-65',
          income: '$30,000-100,000',
          geography: 'Local community',
          lifestyle: ['Professional', 'Social', 'Self-care focused']
        },
        psychographics: {
          values: ['Self-care', 'Professional appearance', 'Convenience', 'Quality'],
          interests: ['Beauty', 'Fashion', 'Wellness', 'Personal grooming'],
          painPoints: ['Difficulty booking appointments', 'Finding reliable stylists', 'Time management'],
          motivations: ['Looking good', 'Self-confidence', 'Relaxation', 'Special occasions']
        },
        businessModel: 'b2c',
        revenueModel: 'service_based',
        geographicScope: 'local',
        brandPersonality: ['Professional', 'Welcoming', 'Stylish', 'Relaxing'],
        communicationStyle: 'friendly',
        differentiators: [
          'Online booking convenience',
          'Skilled professional team',
          'Personalized service approach',
          'Modern salon environment'
        ],
        marketOpportunities: [
          'Mobile booking trend',
          'Package deals and memberships',
          'Special event services',
          'Product sales integration'
        ],
        challenges: [
          'Staff scheduling coordination',
          'Managing walk-ins vs appointments',
          'Building initial client base',
          'Competing with established salons'
        ],
        confidence: 0.91,
        keyInsights: [
          'Booking convenience is a major competitive advantage',
          'Building stylist-client relationships drives retention',
          'Online presence essential for attracting new clients',
          'Service quality and consistency are paramount'
        ],
        competitiveAdvantages: [
          'Modern booking system',
          'Skilled professional team',
          'Convenient location',
          'Competitive pricing'
        ]
      }
    }

    // Check for other exact known prompts
    if (cleanIdea === 'create an e-commerce store for handmade jewelry' || cleanIdea === 'create an ecommerce store for handmade jewelry') {
      return MOCK_BUSINESS_DATA.handmade_jewelry.analysis
    }

    if (cleanIdea === 'build a food delivery app for my restaurant') {
      return {
        businessType: 'service',
        industry: 'Food & Beverage',
        subCategory: 'Restaurant Delivery',
        coreOffering: 'Online food ordering and delivery service for restaurant customers',
        valuePropositions: [
          'Quick and easy online ordering',
          'Real-time order tracking',
          'Fresh food delivered fast',
          'Multiple payment options',
          'Special deals and promotions'
        ],
        targetAudience: 'Hungry customers looking for convenient restaurant food delivery',
        demographics: {
          ageRange: '18-55',
          income: '$25,000-100,000',
          geography: 'Local delivery radius',
          lifestyle: ['Busy professionals', 'Families', 'Students', 'Food enthusiasts']
        },
        psychographics: {
          values: ['Convenience', 'Quality', 'Speed', 'Variety'],
          interests: ['Food', 'Dining', 'Technology', 'Time-saving solutions'],
          painPoints: ['Long wait times', 'Difficulty ordering by phone', 'Not knowing order status', 'Limited menu visibility'],
          motivations: ['Hunger satisfaction', 'Convenience', 'Time saving', 'Trying new dishes']
        },
        businessModel: 'b2c',
        revenueModel: 'commission',
        geographicScope: 'local',
        brandPersonality: ['Fast', 'Reliable', 'Appetizing', 'Local', 'Convenient'],
        communicationStyle: 'casual',
        differentiators: [
          'Direct from restaurant quality',
          'Fast delivery times',
          'Real-time tracking',
          'Easy reordering favorites',
          'Loyalty rewards program'
        ],
        marketOpportunities: [
          'Growing food delivery market',
          'Increased mobile ordering adoption',
          'Demand for contactless delivery',
          'Opportunity for meal subscriptions'
        ],
        challenges: [
          'Delivery logistics optimization',
          'Maintaining food quality during transport',
          'Competition from delivery aggregators',
          'Managing peak hour demand'
        ],
        confidence: 0.93,
        keyInsights: [
          'Speed and reliability are crucial for customer satisfaction',
          'Mobile-first experience is essential',
          'Integration with restaurant operations is key',
          'Building customer loyalty through rewards and personalization'
        ],
        competitiveAdvantages: [
          'Direct restaurant relationship',
          'Local market knowledge',
          'Personalized service',
          'Quality control'
        ]
      }
    }

    // Note: Keeping this one as includes() since it's not one of the 4 known prompts
    // that require exact matching (as specified by the user)
    if (idea.toLowerCase().includes('project') && idea.toLowerCase().includes('management')) {
      return MOCK_BUSINESS_DATA.saas_project_management.analysis
    }

    // Generate contextual analysis for other ideas
    return this.generateGenericAnalysis(idea)
  }

  private generateGenericAnalysis(idea: string): BusinessAnalysis {
    return {
      businessType: 'service',
      industry: 'General Business',
      subCategory: 'Professional Services',
      coreOffering: `Professional ${idea.toLowerCase()} services`,
      valuePropositions: [
        'Expert knowledge and experience',
        'Personalized solutions for each client',
        'Proven track record of success',
        'Responsive and reliable service'
      ],
      targetAudience: 'Business professionals and entrepreneurs',
      demographics: {
        ageRange: '30-55',
        income: '$50,000-150,000',
        geography: 'Local to regional',
        lifestyle: ['Professional', 'Goal-oriented', 'Time-conscious']
      },
      psychographics: {
        values: ['Excellence', 'Efficiency', 'Results', 'Trust'],
        interests: ['Business growth', 'Professional development', 'Industry trends'],
        painPoints: ['Time constraints', 'Lack of expertise', 'Need for reliable partners'],
        motivations: ['Business success', 'Competitive advantage', 'Peace of mind']
      },
      businessModel: 'b2b',
      revenueModel: 'service_based',
      geographicScope: 'regional',
      brandPersonality: ['Professional', 'Trustworthy', 'Expert', 'Reliable'],
      communicationStyle: 'formal',
      differentiators: [
        'Deep industry expertise',
        'Personalized approach',
        'Proven methodologies',
        'Strong client relationships'
      ],
      marketOpportunities: [
        'Growing demand for specialized expertise',
        'Digital transformation needs',
        'Remote service delivery capabilities'
      ],
      challenges: [
        'Building trust with new clients',
        'Scaling personal service model',
        'Competitive market'
      ],
      confidence: 0.75,
      keyInsights: [
        'Service-based model suits expertise-driven business',
        'Trust and credibility are key success factors',
        'Personal relationships drive client retention'
      ],
      competitiveAdvantages: [
        'Specialized knowledge',
        'Client-focused approach',
        'Flexible service delivery'
      ]
    }
  }

  private generateContextualNames(analysis: BusinessAnalysis): BusinessName[] {
    const { industry, brandPersonality, coreOffering } = analysis

    // Use predefined names for known business types
    if (analysis.subCategory === 'Handmade Jewelry') {
      return MOCK_BUSINESS_DATA.handmade_jewelry.names
    }

    // Generate contextual names based on analysis
    return [
      {
        name: `${brandPersonality[0]} ${industry.split(' ')[0]} Studio`,
        reasoning: `Combines brand personality (${brandPersonality[0]}) with industry focus, suggesting professional workspace`,
        brandFit: 0.88,
        memorability: 0.82,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: [`${brandPersonality[0]} Solutions`, `${industry.split(' ')[0]} Works`],
        tags: ['professional', 'memorable', 'industry-specific']
      },
      {
        name: `Smart ${coreOffering.split(' ')[0]} Co.`,
        reasoning: 'Smart prefix suggests intelligence and efficiency, Co. adds business credibility',
        brandFit: 0.85,
        memorability: 0.79,
        availability: {
          domain: false,
          trademark: true,
          social: { instagram: false, twitter: true, facebook: true }
        },
        alternatives: [`Pro ${coreOffering.split(' ')[0]}`, `${coreOffering.split(' ')[0]} Plus`],
        tags: ['modern', 'tech-forward', 'business']
      }
    ]
  }

  private generateContextualTaglines(analysis: BusinessAnalysis, businessName: string): BusinessTagline[] {
    const { valuePropositions, targetAudience, communicationStyle } = analysis

    return [
      {
        text: `${valuePropositions[0].toLowerCase().replace(/^\w/, c => c.toUpperCase())}`,
        style: 'benefit_focused',
        psychologicalTrigger: 'Value demonstration',
        targetEmotion: 'Confidence',
        wordCount: valuePropositions[0].split(' ').length,
        memorability: 0.87,
        brandFit: 0.91,
        explanation: 'Leads with primary value proposition to immediately communicate benefit'
      },
      {
        text: `Where ${analysis.brandPersonality[0].toLowerCase()} meets ${analysis.brandPersonality[1].toLowerCase()}`,
        style: 'descriptive',
        psychologicalTrigger: 'Brand personality alignment',
        targetEmotion: 'Trust',
        wordCount: 5,
        memorability: 0.84,
        brandFit: 0.89,
        explanation: 'Creates brand personality connection using proven "where X meets Y" formula'
      },
      {
        text: `${businessName.split(' ')[0]} for ${targetAudience.split(' ')[0]} who demand excellence`,
        style: 'emotional',
        psychologicalTrigger: 'Aspiration and exclusivity',
        targetEmotion: 'Aspiration',
        wordCount: 7,
        memorability: 0.81,
        brandFit: 0.86,
        explanation: 'Appeals to target audience aspirations and positions as premium choice'
      }
    ]
  }

  private generateSmartFeatures(analysis: BusinessAnalysis): FeatureRecommendation[] {
    const baseFeatures = this.getBaseFeatures(analysis.businessType)
    const industryFeatures = this.getIndustryFeatures(analysis.industry)
    const contextualFeatures = this.getContextualFeatures(analysis)

    return [...baseFeatures, ...industryFeatures, ...contextualFeatures]
      .sort((a, b) => this.getPriorityScore(a.priority) - this.getPriorityScore(b.priority))
      .slice(0, 8) // Top 8 features
  }

  private getBaseFeatures(businessType: string): FeatureRecommendation[] {
    const featureLibrary: Record<string, FeatureRecommendation[]> = {
      ecommerce: [
        {
          name: 'Product Catalog',
          description: 'Beautiful showcase of your products with detailed descriptions',
          priority: 'must_have',
          category: 'core',
          complexity: 'moderate',
          estimatedCost: 'medium',
          reasoning: 'Essential for any e-commerce business to display products effectively',
          benefits: ['Professional product presentation', 'Easy product management', 'SEO-friendly product pages'],
          examples: ['Grid and list views', 'Product filtering', 'High-resolution image galleries']
        },
        {
          name: 'Shopping Cart & Checkout',
          description: 'Seamless purchasing experience with secure payment processing',
          priority: 'must_have',
          category: 'core',
          complexity: 'complex',
          estimatedCost: 'high',
          reasoning: 'Core functionality needed to convert browsers into customers',
          benefits: ['Secure transactions', 'Multiple payment options', 'Abandoned cart recovery'],
          examples: ['Stripe/PayPal integration', 'Guest checkout', 'Cart persistence']
        }
      ],
      saas: [
        {
          name: 'User Dashboard',
          description: 'Central hub where users can access all features and see key metrics',
          priority: 'must_have',
          category: 'core',
          complexity: 'moderate',
          estimatedCost: 'medium',
          reasoning: 'Essential for user orientation and feature discovery',
          benefits: ['Improved user onboarding', 'Feature visibility', 'Usage tracking'],
          examples: ['Activity overview', 'Quick actions', 'Progress indicators']
        }
      ]
    }

    return featureLibrary[businessType] || []
  }

  private getIndustryFeatures(industry: string): FeatureRecommendation[] {
    // Industry-specific features
    if (industry.includes('Fashion')) {
      return [
        {
          name: 'Custom Design Portal',
          description: 'Allow customers to request and collaborate on custom pieces',
          priority: 'should_have',
          category: 'growth',
          complexity: 'complex',
          estimatedCost: 'high',
          reasoning: 'Handmade businesses benefit greatly from customization capabilities',
          benefits: ['Higher profit margins', 'Unique value proposition', 'Customer engagement'],
          examples: ['Design request forms', 'Progress tracking', 'Approval workflows']
        }
      ]
    }

    return []
  }

  private getContextualFeatures(analysis: BusinessAnalysis): FeatureRecommendation[] {
    const features: FeatureRecommendation[] = []

    if (analysis.geographicScope === 'local') {
      features.push({
        name: 'Location & Hours',
        description: 'Help customers find your physical location and operating hours',
        priority: 'must_have',
        category: 'core',
        complexity: 'simple',
        estimatedCost: 'low',
        reasoning: 'Essential for local businesses to drive foot traffic',
        benefits: ['Increased local visibility', 'Reduced location-related inquiries', 'Map integration'],
        examples: ['Interactive map', 'Driving directions', 'Holiday hours updates']
      })
    }

    if (analysis.valuePropositions.some(vp => vp.toLowerCase().includes('custom'))) {
      features.push({
        name: 'Custom Order System',
        description: 'Streamlined process for handling custom product requests',
        priority: 'should_have',
        category: 'growth',
        complexity: 'moderate',
        estimatedCost: 'medium',
        reasoning: 'Business emphasizes customization as key value proposition',
        benefits: ['Organized custom workflows', 'Better customer communication', 'Higher average order value'],
        examples: ['Specification forms', 'Quote generation', 'Project timelines']
      })
    }

    return features
  }

  private getPriorityScore(priority: string): number {
    const scores = { 'must_have': 1, 'should_have': 2, 'nice_to_have': 3 }
    return scores[priority as keyof typeof scores] || 3
  }

  private generateIntelligentPricing(analysis: BusinessAnalysis): PricingStrategy {
    const { businessType, revenueModel, targetAudience, valuePropositions } = analysis

    if (businessType === 'saas') {
      return {
        model: 'freemium',
        tiers: [
          {
            name: 'Starter',
            price: 'Free',
            description: 'Perfect for small teams getting started',
            features: ['Up to 3 projects', 'Basic task management', 'Email support'],
            targetSegment: 'Small teams and freelancers',
            valueProposition: 'Get started without any investment'
          },
          {
            name: 'Professional',
            price: '$29/month',
            billingCycle: 'monthly',
            description: 'For growing teams that need advanced features',
            features: ['Unlimited projects', 'Advanced reporting', 'Priority support', 'Team collaboration'],
            popular: true,
            targetSegment: 'Growing businesses',
            valueProposition: 'Everything you need to scale your team productivity'
          },
          {
            name: 'Enterprise',
            price: 'Custom',
            description: 'Tailored solutions for large organizations',
            features: ['Everything in Professional', 'Custom integrations', 'Dedicated support', 'Advanced security'],
            targetSegment: 'Large enterprises',
            valueProposition: 'Enterprise-grade features with dedicated support'
          }
        ],
        reasoning: 'Freemium model allows users to experience value before paying, common in SaaS',
        marketPositioning: 'value',
        competitiveAnalysis: 'Positioned competitively against Asana ($10.99) and Monday.com ($8)',
        recommendations: [
          'Start with freemium to drive adoption',
          'Focus on team collaboration as upgrade driver',
          'Consider yearly discounts to improve retention'
        ]
      }
    }

    // Default pricing for other business types
    return {
      model: 'tiered',
      tiers: [
        {
          name: 'Essential',
          price: '$99',
          billingCycle: 'one_time',
          description: 'Great value for getting started',
          features: valuePropositions.slice(0, 3),
          targetSegment: 'Budget-conscious customers',
          valueProposition: 'Quality service at accessible price point'
        },
        {
          name: 'Premium',
          price: '$299',
          billingCycle: 'one_time',
          description: 'Complete solution with all features',
          features: valuePropositions,
          popular: true,
          targetSegment: 'Primary target market',
          valueProposition: 'Best value with comprehensive features'
        }
      ],
      reasoning: 'Tiered pricing allows customers to choose based on their needs and budget',
      marketPositioning: 'value',
      competitiveAnalysis: 'Priced competitively for the target market segment',
      recommendations: [
        'Highlight value differences between tiers',
        'Consider seasonal promotions',
        'Test pricing sensitivity with A/B tests'
      ]
    }
  }

  private generateIntelligentSpecBlock(userIdea: string): SpecBlock {
    const normalizedIdea = userIdea.trim().toLowerCase();

    // Check for exact known prompts first with close matching
    const knownPrompts = [
      {
        prompts: ['i want to sell homemade cookies online'],
        response: {
          goal: 'To create an online marketplace for delicious homemade cookies with easy ordering and delivery',
          section_list: 'Hero; Product showcase; Cookie varieties; Ordering process; Customer testimonials; About the baker; Contact',
          style_tags: 'warm, inviting, homey, delicious',
          industry_tag: 'ecommerce',
          tech_stack: 'vite, react, tailwind',
          extra: 'Integrated shopping cart with delivery scheduling'
        }
      },
      {
        prompts: ['i need a booking app for my salon'],
        response: {
          goal: 'To streamline salon appointments with an elegant online booking system for clients',
          section_list: 'Hero; Services menu; Booking calendar; Staff profiles; Pricing; Gallery; Client testimonials; Contact',
          style_tags: 'elegant, professional, relaxing, modern',
          industry_tag: 'services',
          tech_stack: 'vite, react, tailwind',
          extra: 'Real-time appointment scheduling with staff availability'
        }
      },
      {
        prompts: ['create an e-commerce store for handmade jewelry'],
        response: {
          goal: 'To showcase and sell unique handmade jewelry pieces with a personal artisan touch',
          section_list: 'Hero; Featured collections; Product catalog; Artist story; Custom orders; Customer reviews; Shipping info; Contact',
          style_tags: 'artistic, elegant, boutique, personal',
          industry_tag: 'ecommerce',
          tech_stack: 'vite, react, tailwind',
          extra: 'Custom jewelry request form with image uploads'
        }
      },
      {
        prompts: ['build a food delivery app for my restaurant'],
        response: {
          goal: 'To enable seamless online ordering and delivery from our restaurant to hungry customers',
          section_list: 'Hero; Menu categories; Featured dishes; Order online; Delivery zones; About us; Reviews; Contact',
          style_tags: 'appetizing, fast, convenient, local',
          industry_tag: 'restaurant',
          tech_stack: 'vite, react, tailwind',
          extra: 'Real-time order tracking and delivery time estimates'
        }
      }
    ];

    // Check for exact or close matches
    for (const known of knownPrompts) {
      for (const prompt of known.prompts) {
        // Remove punctuation for comparison
        const cleanInput = normalizedIdea.replace(/[.,!?;:]/g, '').trim();
        const cleanPrompt = prompt.replace(/[.,!?;:]/g, '').trim();

        if (cleanInput === cleanPrompt) {
          return known.response;
        }
      }
    }

    // Fall back to intelligent generation for other ideas
    const ideaWords = userIdea.toLowerCase().split(/\s+/);
    const ideaLength = userIdea.length;

    // Simulate semantic understanding - extract the core business concept
    const businessConcepts = this.extractBusinessConcepts(userIdea);
    const targetAudience = this.inferTargetAudience(userIdea);
    const businessTone = this.analyzeTone(userIdea);

    // Generate a contextually appropriate goal
    const goal = this.generateBusinessGoal(businessConcepts, targetAudience);

    // Intelligently determine industry based on context, not just keywords
    const industry = this.classifyIndustry(businessConcepts, userIdea);

    // Generate sections that make sense for this specific business
    const sections = this.generateCustomSections(businessConcepts, industry, targetAudience);

    // Create style tags that reflect the business personality
    const styleTags = this.generateStyleTags(businessTone, businessConcepts, targetAudience);

    // Extract any special requirements from natural language
    const extra = this.extractSpecialRequirements(userIdea, businessConcepts);

    return {
      goal,
      section_list: sections.join('; '),
      style_tags: styleTags.join(', '),
      industry_tag: industry,
      tech_stack: 'vite, react, tailwind',
      extra
    };
  }

  private extractBusinessConcepts(idea: string): string[] {
    // Simulate NLP-like concept extraction
    const concepts: string[] = [];
    const lowerIdea = idea.toLowerCase();

    // Look for action verbs that indicate business activities
    const actionIndicators = ['sell', 'provide', 'offer', 'create', 'build', 'connect', 'help', 'manage', 'teach', 'deliver'];
    actionIndicators.forEach(action => {
      if (lowerIdea.includes(action)) {
        concepts.push(action);
      }
    });

    // Look for business model indicators
    if (lowerIdea.match(/online|web|digital|app/)) concepts.push('digital');
    if (lowerIdea.match(/local|neighborhood|community/)) concepts.push('local');
    if (lowerIdea.match(/global|international|worldwide/)) concepts.push('global');

    return concepts;
  }

  private inferTargetAudience(idea: string): string {
    const lowerIdea = idea.toLowerCase();

    if (lowerIdea.match(/business|company|enterprise|b2b/)) return 'businesses';
    if (lowerIdea.match(/kid|child|parent|family/)) return 'families';
    if (lowerIdea.match(/student|education|learn/)) return 'students';
    if (lowerIdea.match(/professional|career|job/)) return 'professionals';
    if (lowerIdea.match(/senior|elderly|retire/)) return 'seniors';

    return 'general consumers';
  }

  private analyzeTone(idea: string): string {
    const lowerIdea = idea.toLowerCase();
    const wordCount = idea.split(/\s+/).length;

    // Analyze formality based on language patterns
    const formalIndicators = ['provide', 'enterprise', 'solution', 'professional', 'comprehensive'];
    const casualIndicators = ['fun', 'easy', 'simple', 'cool', 'awesome'];

    let formalScore = 0;
    let casualScore = 0;

    formalIndicators.forEach(word => {
      if (lowerIdea.includes(word)) formalScore++;
    });

    casualIndicators.forEach(word => {
      if (lowerIdea.includes(word)) casualScore++;
    });

    if (formalScore > casualScore) return 'formal';
    if (casualScore > formalScore) return 'casual';
    return 'balanced';
  }

  private generateBusinessGoal(concepts: string[], audience: string): string {
    // Create a meaningful goal based on extracted concepts
    const action = concepts.find(c => ['sell', 'provide', 'offer', 'create', 'help', 'connect'].includes(c)) || 'provide';
    const scope = concepts.includes('global') ? 'globally' : concepts.includes('local') ? 'locally' : '';

    return `To ${action} innovative solutions for ${audience} ${scope}`.trim();
  }

  private classifyIndustry(concepts: string[], idea: string): string {
    // Use contextual understanding to classify industry
    const lowerIdea = idea.toLowerCase();

    // Look for industry-specific terminology patterns
    if (lowerIdea.match(/software|app|platform|saas|tool|api/)) return 'saas';
    if (lowerIdea.match(/shop|store|product|merchandise|retail/)) return 'ecommerce';
    if (lowerIdea.match(/food|restaurant|cafe|dining|menu/)) return 'restaurant';
    if (lowerIdea.match(/health|medical|clinic|therapy|wellness/)) return 'healthcare';
    if (lowerIdea.match(/teach|education|course|training|learn/)) return 'education';
    if (lowerIdea.match(/design|creative|agency|marketing/)) return 'agency';
    if (lowerIdea.match(/finance|investment|banking|insurance/)) return 'finance';

    // Default based on business model
    if (concepts.includes('sell')) return 'retail';
    if (concepts.includes('connect')) return 'marketplace';

    return 'services';
  }

  private generateCustomSections(concepts: string[], industry: string, audience: string): string[] {
    const sections: string[] = ['Hero']; // Always start with Hero

    // Add sections based on business needs, not templates
    if (concepts.includes('sell') || industry === 'ecommerce') {
      sections.push('Products', 'Shopping experience');
    }

    if (audience === 'businesses') {
      sections.push('Solutions', 'Case studies', 'ROI calculator');
    } else {
      sections.push('How it works', 'Benefits');
    }

    // Industry-specific sections
    switch (industry) {
      case 'saas':
        sections.push('Features', 'Integrations', 'Pricing', 'Free trial');
        break;
      case 'restaurant':
        sections.push('Menu', 'Ambiance', 'Reservations', 'Special events');
        break;
      case 'healthcare':
        sections.push('Services', 'Practitioners', 'Patient resources', 'Book appointment');
        break;
      case 'education':
        sections.push('Courses', 'Instructors', 'Success stories', 'Enrollment');
        break;
      default:
        sections.push('Services', 'Why choose us');
    }

    // Always end with trust builders and contact
    if (!sections.includes('Testimonials')) {
      sections.push('Testimonials');
    }
    sections.push('Contact');

    return sections;
  }

  private generateStyleTags(tone: string, concepts: string[], audience: string): string[] {
    const tags: string[] = [];

    // Base style on tone
    if (tone === 'formal') {
      tags.push('professional', 'sophisticated');
    } else if (tone === 'casual') {
      tags.push('friendly', 'approachable');
    } else {
      tags.push('modern', 'clean');
    }

    // Add audience-specific styles
    if (audience === 'businesses') {
      tags.push('corporate');
    } else if (audience === 'families') {
      tags.push('warm', 'welcoming');
    } else if (audience === 'students') {
      tags.push('energetic', 'fresh');
    }

    // Concept-based styles
    if (concepts.includes('digital')) {
      tags.push('tech-forward');
    }
    if (concepts.includes('local')) {
      tags.push('community-focused');
    }

    // Ensure variety and limit
    return [...new Set(tags)].slice(0, 4);
  }

  private extractSpecialRequirements(idea: string, concepts: string[]): string {
    const lowerIdea = idea.toLowerCase();
    const requirements: string[] = [];

    // Look for explicit feature mentions
    if (lowerIdea.match(/book|appointment|schedule|calendar/)) {
      requirements.push('Integrated booking system');
    }
    if (lowerIdea.match(/pay|payment|checkout|transaction/)) {
      requirements.push('Secure payment processing');
    }
    if (lowerIdea.match(/multi.*language|translation|international/)) {
      requirements.push('Multi-language support');
    }
    if (lowerIdea.match(/mobile|app|ios|android/)) {
      requirements.push('Mobile app integration');
    }
    if (lowerIdea.match(/member|subscription|recurring/)) {
      requirements.push('Membership system');
    }

    return requirements.length > 0 ? requirements[0] : '';
  }

  private generateProjectTemplate(specBlock: SpecBlock): any {
    // Check for the specific salon business case
    // Check for salon OR saas business case
    if ((specBlock.goal?.includes('salon') && specBlock.goal?.includes('booking')) ||
        specBlock.industry_tag === 'saas' ||
        specBlock.goal?.includes('saas') ||
        specBlock.goal?.includes('software')) {
      // Use the imported salon template
      logger.info('✅ Using salon template', {
        name: salonTemplateData.name,
        filesCount: salonTemplateData.templateFiles?.length || 0
      })
      return salonTemplateData

      // The commented out inline template below is kept for reference
      const salonTemplate: any =
{
  "name": "minimal-saas-landing",
  "slug": "minimal-saas-landing",
  "description": "Clean, whitespace-heavy SaaS landing page with Vite 7 + React 19.1 + Tailwind CSS v4",
  "version": "0.3.0",
  "author": "TemplateSeed",
  "repository": "",
  "license": "MIT",
  "metadata": {
    "tags": ["vite", "react", "tailwind-v4", "typescript", "spa", "landing-page"],
    "industry_tags": ["saas"],
    "style_tags": ["minimal", "clean", "light-mode", "pastel", "rtl"],
    "core_pages": {
      "home": "Landing page with Hero, Features, Pricing, Testimonials, and CTA"
    },
    "components": [
      "Hero",
      "FeatureGrid",
      "PricingSection",
      "TestimonialsCarousel",
      "StickyCTA"
    ],
    "design_tokens": {
      "colors": {
        "primary": "#E6F2FF",
        "secondary": "#FFE6F2",
        "accent": "#E6FFE6",
        "background": "#FAFBFC",
        "text": "#1A202C"
      },
      "spacing": "generous",
      "typography": "clean"
    },
    "rsc_path": ""
  },
  "templateFiles": [
    "package.json",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "eslint.config.js",
    ".gitignore",
    "index.html",
    "src/main.tsx",
    "src/App.tsx",
    "src/index.css",
    "src/vite-env.d.ts",
    "src/components/Hero.tsx",
    "src/components/FeatureGrid.tsx",
    "src/components/PricingSection.tsx",
    "src/components/TestimonialsCarousel.tsx",
    "src/components/StickyCTA.tsx"
  ],
  "files": [
    {
      "path": "package.json",
      "content": "{\n  \"name\": \"minimal-saas-landing\",\n  \"private\": true,\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": {\n    \"dev\": \"vite\",\n    \"build\": \"tsc -b && vite build\",\n    \"lint\": \"eslint .\",\n    \"preview\": \"vite preview\"\n  },\n  \"dependencies\": {\n    \"react\": \"^19.1.0\",\n    \"react-dom\": \"^19.1.0\"\n  },\n  \"devDependencies\": {\n    \"@eslint/js\": \"^9.16.0\",\n    \"@tailwindcss/vite\": \"4.1.11\",\n    \"@types/react\": \"^19.0.7\",\n    \"@types/react-dom\": \"^19.0.3\",\n    \"@vitejs/plugin-react\": \"^4.3.4\",\n    \"eslint\": \"^9.16.0\",\n    \"eslint-plugin-react-hooks\": \"^5.1.0\",\n    \"eslint-plugin-react-refresh\": \"^0.4.16\",\n    \"globals\": \"^15.13.0\",\n    \"tailwindcss\": \"4.1.11\",\n    \"typescript\": \"~5.6.3\",\n    \"typescript-eslint\": \"^8.20.0\",\n    \"vite\": \"^7.0.0\"\n  }\n}"
    },
    {
      "path": "tsconfig.json",
      "content": "{\n  \"files\": [],\n  \"references\": [\n    { \"path\": \"./tsconfig.app.json\" },\n    { \"path\": \"./tsconfig.node.json\" }\n  ]\n}"
    },
    {
      "path": "tsconfig.app.json",
      "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2020\",\n    \"useDefineForClassFields\": true,\n    \"lib\": [\"ES2020\", \"DOM\", \"DOM.Iterable\"],\n    \"module\": \"ESNext\",\n    \"skipLibCheck\": true,\n\n    /* Bundler mode */\n    \"moduleResolution\": \"Bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"isolatedModules\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n    \"jsx\": \"react-jsx\",\n\n    /* Linting */\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"src\"]\n}"
    },
    {
      "path": "tsconfig.node.json",
      "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\",\n    \"lib\": [\"ES2023\"],\n    \"module\": \"ESNext\",\n    \"skipLibCheck\": true,\n\n    /* Bundler mode */\n    \"moduleResolution\": \"Bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"isolatedModules\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n\n    /* Linting */\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"vite.config.ts\"]\n}"
    },
    {
      "path": "vite.config.ts",
      "content": "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'\n\n// https://vite.dev/config/\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n})"
    },
    {
      "path": "eslint.config.js",
      "content": "import js from '@eslint/js'\nimport globals from 'globals'\nimport reactHooks from 'eslint-plugin-react-hooks'\nimport reactRefresh from 'eslint-plugin-react-refresh'\nimport tseslint from 'typescript-eslint'\n\nexport default tseslint.config(\n  { ignores: ['dist'] },\n  {\n    extends: [js.configs.recommended, ...tseslint.configs.recommended],\n    files: ['**/*.{ts,tsx}'],\n    languageOptions: {\n      ecmaVersion: 2020,\n      globals: globals.browser,\n    },\n    plugins: {\n      'react-hooks': reactHooks,\n      'react-refresh': reactRefresh,\n    },\n    rules: {\n      ...reactHooks.configs.recommended.rules,\n      'react-refresh/only-export-components': [\n        'warn',\n        { allowConstantExport: true },\n      ],\n    },\n  },\n)"
    },
    {
      "path": ".gitignore",
      "content": "# Logs\nlogs\n*.log\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\npnpm-debug.log*\nlerna-debug.log*\n\nnode_modules\ndist\ndist-ssr\n*.local\n\n# Editor directories and files\n.vscode/*\n!.vscode/extensions.json\n.idea\n.DS_Store\n*.suo\n*.ntvs*\n*.njsproj\n*.sln\n*.sw?"
    },
    {
      "path": "index.html",
      "content": "<!doctype html>\n<html lang=\"en\" dir=\"ltr\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/vite.svg\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>SaaS Platform - Clean & Minimal</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>"
    },
    {
      "path": "src/main.tsx",
      "content": "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './index.css'\nimport App from './App.tsx'\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)"
    },
    {
      "path": "src/App.tsx",
      "content": "import Hero from './components/Hero'\nimport FeatureGrid from './components/FeatureGrid'\nimport PricingSection from './components/PricingSection'\nimport TestimonialsCarousel from './components/TestimonialsCarousel'\nimport StickyCTA from './components/StickyCTA'\n\nfunction App() {\n  return (\n    <div className=\"min-h-screen bg-pastel-bg\">\n      <Hero />\n      <FeatureGrid />\n      <PricingSection />\n      <TestimonialsCarousel />\n      <StickyCTA />\n    </div>\n  )\n}\n\nexport default App"
    },
    {
      "path": "src/index.css",
      "content": "@import \"tailwindcss\";\n\n@theme {\n  --color-pastel-bg: #FAFBFC;\n  --color-pastel-primary: #E6F2FF;\n  --color-pastel-secondary: #FFE6F2;\n  --color-pastel-accent: #E6FFE6;\n  --color-pastel-text: #1A202C;\n  --color-pastel-text-light: #718096;\n  --color-pastel-border: #E2E8F0;\n  \n  --font-family-sans: system-ui, -apple-system, sans-serif;\n  \n  --spacing-section: 8rem;\n  --spacing-component: 4rem;\n  --spacing-element: 2rem;\n  \n  --radius-soft: 1rem;\n  --radius-button: 0.75rem;\n  --radius-card: 1.25rem;\n}"
    },
    {
      "path": "src/vite-env.d.ts",
      "content": "/// <reference types=\"vite/client\" />"
    },
    {
      "path": "src/components/Hero.tsx",
      "content": "export default function Hero() {\n  return (\n    <section className=\"px-6 py-section\">\n      <div className=\"max-w-6xl mx-auto text-center\">\n        <h1 className=\"text-5xl md:text-6xl font-light text-pastel-text mb-6\">\n          Simplify Your Workflow\n        </h1>\n        <p className=\"text-xl text-pastel-text-light mb-element max-w-2xl mx-auto\">\n          A clean, minimal platform designed to help teams collaborate effortlessly\n          and achieve more with less complexity.\n        </p>\n        <div className=\"flex gap-4 justify-center flex-wrap\">\n          <button className=\"px-8 py-4 bg-pastel-primary text-pastel-text rounded-button font-medium hover:opacity-90 transition-opacity\">\n            Start Free Trial\n          </button>\n          <button className=\"px-8 py-4 bg-white text-pastel-text rounded-button font-medium border border-pastel-border hover:bg-pastel-bg transition-colors\">\n            Watch Demo\n          </button>\n        </div>\n      </div>\n    </section>\n  )\n}"
    },
    {
      "path": "src/components/FeatureGrid.tsx",
      "content": "const features = [\n  {\n    title: 'Intuitive Design',\n    description: 'Clean interface that puts your content first, with thoughtful whitespace and minimal distractions.',\n    icon: '✨'\n  },\n  {\n    title: 'Seamless Integration',\n    description: 'Connect with your favorite tools effortlessly. Works where you work, adapts to your workflow.',\n    icon: '🔗'\n  },\n  {\n    title: 'Peace of Mind',\n    description: 'Enterprise-grade security with automatic backups. Your data is safe, always accessible.',\n    icon: '🛡️'\n  }\n]\n\nexport default function FeatureGrid() {\n  return (\n    <section className=\"px-6 py-section bg-white\">\n      <div className=\"max-w-6xl mx-auto\">\n        <h2 className=\"text-4xl font-light text-pastel-text text-center mb-component\">\n          Everything You Need\n        </h2>\n        <div className=\"grid md:grid-cols-3 gap-8\">\n          {features.map((feature, index) => (\n            <div key={index} className=\"text-center p-component\">\n              <div className=\"text-5xl mb-4\">{feature.icon}</div>\n              <h3 className=\"text-xl font-medium text-pastel-text mb-2\">\n                {feature.title}\n              </h3>\n              <p className=\"text-pastel-text-light leading-relaxed\">\n                {feature.description}\n              </p>\n            </div>\n          ))}\n        </div>\n      </div>\n    </section>\n  )\n}"
    },
    {
      "path": "src/components/PricingSection.tsx",
      "content": "const plans = [\n  {\n    name: 'Starter',\n    price: '$9',\n    period: 'per month',\n    features: ['Up to 3 users', '10GB storage', 'Basic support', 'Core features'],\n    accent: 'pastel-secondary'\n  },\n  {\n    name: 'Professional',\n    price: '$29',\n    period: 'per month',\n    features: ['Up to 20 users', '100GB storage', 'Priority support', 'Advanced analytics'],\n    accent: 'pastel-primary',\n    popular: true\n  },\n  {\n    name: 'Enterprise',\n    price: 'Custom',\n    period: 'contact us',\n    features: ['Unlimited users', 'Unlimited storage', 'Dedicated support', 'Custom integrations'],\n    accent: 'pastel-accent'\n  }\n]\n\nexport default function PricingSection() {\n  return (\n    <section className=\"px-6 py-section\">\n      <div className=\"max-w-6xl mx-auto\">\n        <h2 className=\"text-4xl font-light text-pastel-text text-center mb-component\">\n          Simple, Transparent Pricing\n        </h2>\n        <div className=\"grid md:grid-cols-3 gap-8\">\n          {plans.map((plan, index) => (\n            <div\n              key={index}\n              className={`bg-white rounded-card p-8 relative ${\n                plan.popular ? 'ring-2 ring-pastel-primary' : ''\n              }`}\n            >\n              {plan.popular && (\n                <span className=\"absolute -top-3 left-1/2 -translate-x-1/2 bg-pastel-primary px-4 py-1 rounded-full text-sm font-medium\">\n                  Most Popular\n                </span>\n              )}\n              <div className={`w-full h-1 bg-${plan.accent} rounded-full mb-6`} />\n              <h3 className=\"text-2xl font-medium text-pastel-text mb-2\">\n                {plan.name}\n              </h3>\n              <div className=\"mb-6\">\n                <span className=\"text-4xl font-light text-pastel-text\">{plan.price}</span>\n                <span className=\"text-pastel-text-light ml-2\">{plan.period}</span>\n              </div>\n              <ul className=\"space-y-3 mb-8\">\n                {plan.features.map((feature, i) => (\n                  <li key={i} className=\"text-pastel-text-light flex items-start\">\n                    <span className=\"text-pastel-accent mr-2\">✓</span>\n                    {feature}\n                  </li>\n                ))}\n              </ul>\n              <button className={`w-full py-3 bg-${plan.accent} text-pastel-text rounded-button font-medium hover:opacity-90 transition-opacity`}>\n                Get Started\n              </button>\n            </div>\n          ))}\n        </div>\n      </div>\n    </section>\n  )\n}"
    },
    {
      "path": "src/components/TestimonialsCarousel.tsx",
      "content": "import { useState } from 'react'\n\nconst testimonials = [\n  {\n    quote: \"This platform transformed how our team collaborates. The clean interface makes everything feel effortless.\",\n    author: \"Sarah Chen\",\n    role: \"Product Manager\",\n    company: \"TechCorp\"\n  },\n  {\n    quote: \"Finally, a tool that doesn't overwhelm with features. It does exactly what we need, beautifully.\",\n    author: \"Marcus Johnson\",\n    role: \"Creative Director\",\n    company: \"Design Studio\"\n  },\n  {\n    quote: \"The attention to detail is remarkable. Every interaction feels thoughtful and intentional.\",\n    author: \"Emma Williams\",\n    role: \"CEO\",\n    company: \"StartupHub\"\n  }\n]\n\nexport default function TestimonialsCarousel() {\n  const [activeIndex, setActiveIndex] = useState(0)\n\n  const nextTestimonial = () => {\n    setActiveIndex((prev) => (prev + 1) % testimonials.length)\n  }\n\n  const prevTestimonial = () => {\n    setActiveIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)\n  }\n\n  return (\n    <section className=\"px-6 py-section bg-white\">\n      <div className=\"max-w-4xl mx-auto\">\n        <h2 className=\"text-4xl font-light text-pastel-text text-center mb-component\">\n          Loved by Teams Everywhere\n        </h2>\n        <div className=\"relative\">\n          <div className=\"bg-pastel-bg rounded-card p-component\">\n            <blockquote className=\"text-xl text-pastel-text mb-6 text-center italic\">\n              \"{testimonials[activeIndex].quote}\"\n            </blockquote>\n            <div className=\"text-center\">\n              <p className=\"font-medium text-pastel-text\">\n                {testimonials[activeIndex].author}\n              </p>\n              <p className=\"text-pastel-text-light\">\n                {testimonials[activeIndex].role}, {testimonials[activeIndex].company}\n              </p>\n            </div>\n          </div>\n          <div className=\"flex justify-center gap-4 mt-6\">\n            <button\n              onClick={prevTestimonial}\n              className=\"p-3 rounded-button bg-white border border-pastel-border hover:bg-pastel-bg transition-colors\"\n              aria-label=\"Previous testimonial\"\n            >\n              ←\n            </button>\n            <div className=\"flex items-center gap-2\">\n              {testimonials.map((_, index) => (\n                <div\n                  key={index}\n                  className={`w-2 h-2 rounded-full transition-colors ${\n                    index === activeIndex ? 'bg-pastel-primary' : 'bg-pastel-border'\n                  }`}\n                />\n              ))}\n            </div>\n            <button\n              onClick={nextTestimonial}\n              className=\"p-3 rounded-button bg-white border border-pastel-border hover:bg-pastel-bg transition-colors\"\n              aria-label=\"Next testimonial\"\n            >\n              →\n            </button>\n          </div>\n        </div>\n      </div>\n    </section>\n  )\n}"
    },
    {
      "path": "src/components/StickyCTA.tsx",
      "content": "export default function StickyCTA() {\n  return (\n    <div className=\"fixed bottom-0 left-0 right-0 bg-white border-t border-pastel-border p-4 backdrop-blur-sm bg-opacity-95\">\n      <div className=\"max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4\">\n        <p className=\"text-pastel-text\">\n          Ready to simplify your workflow? Start your free 14-day trial.\n        </p>\n        <button className=\"px-6 py-3 bg-pastel-primary text-pastel-text rounded-button font-medium hover:opacity-90 transition-opacity whitespace-nowrap\">\n          Get Started Free →\n        </button>\n      </div>\n    </div>\n  )\n}"
    }
  ]
}

// {
//   "name": "minimal-vite-react-tailwind-law-firm",
//   "slug": "minimal-vite-react-tailwind-law-firm",
//   "description": "Trust-centric law practice site with Vite 7 + React + Tailwind CSS v4",
//   "version": "0.3.0",
//   "author": "TemplateSeed",
//   "repository": "",
//   "license": "MIT",
//   "metadata": {
//     "tags": ["vite", "react", "tailwind-v4", "typescript", "spa"],
//     "industry_tags": ["saas"],
//     "style_tags": ["professional", "clean", "corporate"],
//     "core_pages": {
//       "home": "Landing page with hero, practice areas, attorneys, case results, and consultation form"
//     },
//     "components": [
//       "Hero",
//       "PracticeAreasGrid",
//       "AttorneyBios",
//       "CaseResultsSlider",
//       "ConsultationForm"
//     ],
//     "design_tokens": {
//       "colors": {
//         "primary": "#1e3a5f",
//         "secondary": "#c9a961",
//         "accent": "#2c5282",
//         "neutral": "#64748b"
//       },
//       "fonts": {
//         "heading": "Playfair Display",
//         "body": "Inter"
//       }
//     },
//     "rsc_path": ""
//   },
//   "templateFiles": [
//     {
//       "file": "package.json",
//       "content": "{\n  \"name\": \"law-firm-site\",\n  \"private\": true,\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": {\n    \"dev\": \"vite\",\n    \"build\": \"tsc -b && vite build\",\n    \"lint\": \"eslint .\",\n    \"preview\": \"vite preview\"\n  },\n  \"dependencies\": {\n    \"react\": \"^19.1.0\",\n    \"react-dom\": \"^19.1.0\"\n  },\n  \"devDependencies\": {\n    \"@eslint/js\": \"^9.18.0\",\n    \"@types/react\": \"^19.1.0\",\n    \"@types/react-dom\": \"^19.1.0\",\n    \"@vitejs/plugin-react\": \"^4.3.5\",\n    \"eslint\": \"^9.18.0\",\n    \"eslint-plugin-react-hooks\": \"^5.1.0\",\n    \"eslint-plugin-react-refresh\": \"^0.4.20\",\n    \"globals\": \"^15.16.0\",\n    \"typescript\": \"~5.7.0\",\n    \"typescript-eslint\": \"^8.23.0\",\n    \"vite\": \"^7.0.4\",\n    \"tailwindcss\": \"4.1.11\",\n    \"@tailwindcss/vite\": \"4.1.11\"\n  }\n}"
//     },
//     {
//       "file": "vite.config.ts",
//       "content": "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'\n\n// https://vite.dev/config/\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n})"
//     },
//     {
//       "file": "tsconfig.json",
//       "content": "{\n  \"files\": [],\n  \"references\": [\n    { \"path\": \"./tsconfig.app.json\" },\n    { \"path\": \"./tsconfig.node.json\" }\n  ]\n}"
//     },
//     {
//       "file": "tsconfig.app.json",
//       "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2020\",\n    \"useDefineForClassFields\": true,\n    \"lib\": [\"ES2020\", \"DOM\", \"DOM.Iterable\"],\n    \"module\": \"ESNext\",\n    \"skipLibCheck\": true,\n\n    /* Bundler mode */\n    \"moduleResolution\": \"Bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"isolatedModules\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n    \"jsx\": \"react-jsx\",\n\n    /* Linting */\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"src\"]\n}"
//     },
//     {
//       "file": "tsconfig.node.json",
//       "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\",\n    \"lib\": [\"ES2023\"],\n    \"module\": \"ESNext\",\n    \"skipLibCheck\": true,\n\n    /* Bundler mode */\n    \"moduleResolution\": \"Bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"isolatedModules\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n\n    /* Linting */\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"vite.config.ts\"]\n}"
//     },
//     {
//       "file": "eslint.config.js",
//       "content": "import js from '@eslint/js'\nimport globals from 'globals'\nimport reactHooks from 'eslint-plugin-react-hooks'\nimport reactRefresh from 'eslint-plugin-react-refresh'\nimport tseslint from 'typescript-eslint'\n\nexport default tseslint.config(\n  { ignores: ['dist'] },\n  {\n    extends: [js.configs.recommended, ...tseslint.configs.recommended],\n    files: ['**/*.{ts,tsx}'],\n    languageOptions: {\n      ecmaVersion: 2020,\n      globals: globals.browser,\n    },\n    plugins: {\n      'react-hooks': reactHooks,\n      'react-refresh': reactRefresh,\n    },\n    rules: {\n      ...reactHooks.configs.recommended.rules,\n      'react-refresh/only-export-components': [\n        'warn',\n        { allowConstantExport: true },\n      ],\n    },\n  },\n)"
//     },
//     {
//       "file": ".gitignore",
//       "content": "# Logs\nlogs\n*.log\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\npnpm-debug.log*\nlerna-debug.log*\n\nnode_modules\ndist\ndist-ssr\n*.local\n\n# Editor directories and files\n.vscode/*\n!.vscode/extensions.json\n.idea\n.DS_Store\n*.suo\n*.ntvs*\n*.njsproj\n*.sln\n*.sw?"
//     },
//     {
//       "file": "index.html",
//       "content": "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/vite.svg\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Trust Law Partners - Professional Legal Services</title>\n    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n    <link href=\"https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap\" rel=\"stylesheet\">\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>"
//     },
//     {
//       "file": "src/main.tsx",
//       "content": "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './index.css'\nimport App from './App.tsx'\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)"
//     },
//     {
//       "file": "src/index.css",
//       "content": "@import \"tailwindcss\";\n\n@theme {\n  --color-primary: #1e3a5f;\n  --color-primary-light: #2c5282;\n  --color-secondary: #c9a961;\n  --color-secondary-light: #d4b374;\n  --color-accent: #2c5282;\n  --color-neutral: #64748b;\n  --color-neutral-light: #94a3b8;\n  --color-neutral-dark: #475569;\n  --font-family-heading: 'Playfair Display', serif;\n  --font-family-body: 'Inter', sans-serif;\n}\n\n* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: var(--font-family-body);\n  color: var(--color-neutral-dark);\n  line-height: 1.6;\n}\n\nh1, h2, h3, h4, h5, h6 {\n  font-family: var(--font-family-heading);\n  font-weight: 700;\n  color: var(--color-primary);\n}"
//     },
//     {
//       "file": "src/App.tsx",
//       "content": "import Hero from './components/Hero'\nimport PracticeAreasGrid from './components/PracticeAreasGrid'\nimport AttorneyBios from './components/AttorneyBios'\nimport CaseResultsSlider from './components/CaseResultsSlider'\nimport ConsultationForm from './components/ConsultationForm'\n\nfunction App() {\n  return (\n    <div className=\"min-h-screen bg-white\">\n      <Hero />\n      <PracticeAreasGrid />\n      <AttorneyBios />\n      <CaseResultsSlider />\n      <ConsultationForm />\n    </div>\n  )\n}\n\nexport default App"
//     },
//     {
//       "file": "src/components/Hero.tsx",
//       "content": "export default function Hero() {\n  return (\n    <section className=\"relative min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4 sm:px-6 lg:px-8\">\n      <div className=\"absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%239C92AC\" fill-opacity=\"0.03\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50\"></div>\n      <div className=\"relative max-w-7xl mx-auto text-center\">\n        <h1 className=\"text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 text-[--color-primary]\">\n          Trust. Excellence. Results.\n        </h1>\n        <p className=\"text-lg sm:text-xl md:text-2xl text-[--color-neutral] mb-8 max-w-3xl mx-auto\">\n          Dedicated legal professionals committed to protecting your interests and achieving the best possible outcomes for over 30 years.\n        </p>\n        <div className=\"flex flex-col sm:flex-row gap-4 justify-center\">\n          <button className=\"px-8 py-4 bg-[--color-primary] text-white rounded-lg font-semibold hover:bg-[--color-primary-light] transition duration-300 shadow-lg\">\n            Schedule Consultation\n          </button>\n          <button className=\"px-8 py-4 bg-white text-[--color-primary] border-2 border-[--color-primary] rounded-lg font-semibold hover:bg-slate-50 transition duration-300\">\n            View Practice Areas\n          </button>\n        </div>\n        <div className=\"mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto\">\n          <div className=\"text-center\">\n            <div className=\"text-3xl sm:text-4xl font-bold text-[--color-secondary] mb-2\">500+</div>\n            <div className=\"text-[--color-neutral]\">Cases Won</div>\n          </div>\n          <div className=\"text-center\">\n            <div className=\"text-3xl sm:text-4xl font-bold text-[--color-secondary] mb-2\">30+</div>\n            <div className=\"text-[--color-neutral]\">Years Experience</div>\n          </div>\n          <div className=\"text-center\">\n            <div className=\"text-3xl sm:text-4xl font-bold text-[--color-secondary] mb-2\">98%</div>\n            <div className=\"text-[--color-neutral]\">Client Satisfaction</div>\n          </div>\n        </div>\n      </div>\n    </section>\n  )\n}"
//     },
//     {
//       "file": "src/components/PracticeAreasGrid.tsx",
//       "content": "export default function PracticeAreasGrid() {\n  const practiceAreas = [\n    {\n      title: \"Corporate Law\",\n      description: \"Strategic legal counsel for businesses of all sizes, from startups to Fortune 500 companies.\",\n      icon: \"🏢\"\n    },\n    {\n      title: \"Estate Planning\",\n      description: \"Comprehensive estate planning services to protect your legacy and provide for your loved ones.\",\n      icon: \"📜\"\n    },\n    {\n      title: \"Real Estate\",\n      description: \"Expert guidance through complex real estate transactions and property disputes.\",\n      icon: \"🏠\"\n    },\n    {\n      title: \"Litigation\",\n      description: \"Aggressive representation in civil and commercial litigation matters.\",\n      icon: \"⚖️\"\n    },\n    {\n      title: \"Intellectual Property\",\n      description: \"Protection and enforcement of patents, trademarks, copyrights, and trade secrets.\",\n      icon: \"💡\"\n    },\n    {\n      title: \"Employment Law\",\n      description: \"Comprehensive employment law services for both employers and employees.\",\n      icon: \"👥\"\n    }\n  ]\n\n  return (\n    <section className=\"py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-50\">\n      <div className=\"max-w-7xl mx-auto\">\n        <div className=\"text-center mb-12\">\n          <h2 className=\"text-3xl sm:text-4xl font-bold mb-4\">Our Practice Areas</h2>\n          <p className=\"text-lg sm:text-xl text-[--color-neutral] max-w-3xl mx-auto\">\n            We provide comprehensive legal services across multiple practice areas, ensuring expert representation for all your legal needs.\n          </p>\n        </div>\n        <div className=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8\">\n          {practiceAreas.map((area, index) => (\n            <div key={index} className=\"bg-white p-6 sm:p-8 rounded-xl shadow-lg hover:shadow-xl transition duration-300 group\">\n              <div className=\"text-4xl sm:text-5xl mb-4\">{area.icon}</div>\n              <h3 className=\"text-xl sm:text-2xl font-bold mb-3 group-hover:text-[--color-secondary] transition duration-300\">\n                {area.title}\n              </h3>\n              <p className=\"text-[--color-neutral] mb-4\">{area.description}</p>\n              <a href=\"#\" className=\"text-[--color-primary] font-semibold hover:text-[--color-primary-light] transition duration-300\">\n                Learn More →\n              </a>\n            </div>\n          ))}\n        </div>\n      </div>\n    </section>\n  )\n}"
//     },
//     {
//       "file": "src/components/AttorneyBios.tsx",
//       "content": "export default function AttorneyBios() {\n  const attorneys = [\n    {\n      name: \"Sarah Mitchell\",\n      title: \"Senior Partner\",\n      specialization: \"Corporate Law & M&A\",\n      experience: \"25 years\",\n      education: \"Harvard Law School\",\n      image: \"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23e2e8f0'/%3E%3Ccircle cx='150' cy='120' r='50' fill='%23cbd5e1'/%3E%3Cpath d='M150 180 C 100 180, 60 230, 60 300 L 240 300 C 240 230, 200 180, 150 180' fill='%23cbd5e1'/%3E%3C/svg%3E\"\n    },\n    {\n      name: \"Michael Chen\",\n      title: \"Managing Partner\",\n      specialization: \"Litigation & Dispute Resolution\",\n      experience: \"20 years\",\n      education: \"Yale Law School\",\n      image: \"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23e2e8f0'/%3E%3Ccircle cx='150' cy='120' r='50' fill='%23cbd5e1'/%3E%3Cpath d='M150 180 C 100 180, 60 230, 60 300 L 240 300 C 240 230, 200 180, 150 180' fill='%23cbd5e1'/%3E%3C/svg%3E\"\n    },\n    {\n      name: \"Emily Rodriguez\",\n      title: \"Partner\",\n      specialization: \"Estate Planning & Trusts\",\n      experience: \"15 years\",\n      education: \"Stanford Law School\",\n      image: \"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23e2e8f0'/%3E%3Ccircle cx='150' cy='120' r='50' fill='%23cbd5e1'/%3E%3Cpath d='M150 180 C 100 180, 60 230, 60 300 L 240 300 C 240 230, 200 180, 150 180' fill='%23cbd5e1'/%3E%3C/svg%3E\"\n    },\n    {\n      name: \"David Thompson\",\n      title: \"Partner\",\n      specialization: \"Real Estate & Property Law\",\n      experience: \"18 years\",\n      education: \"Columbia Law School\",\n      image: \"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23e2e8f0'/%3E%3Ccircle cx='150' cy='120' r='50' fill='%23cbd5e1'/%3E%3Cpath d='M150 180 C 100 180, 60 230, 60 300 L 240 300 C 240 230, 200 180, 150 180' fill='%23cbd5e1'/%3E%3C/svg%3E\"\n    }\n  ]\n\n  return (\n    <section className=\"py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white\">\n      <div className=\"max-w-7xl mx-auto\">\n        <div className=\"text-center mb-12\">\n          <h2 className=\"text-3xl sm:text-4xl font-bold mb-4\">Meet Our Attorneys</h2>\n          <p className=\"text-lg sm:text-xl text-[--color-neutral] max-w-3xl mx-auto\">\n            Our team of experienced attorneys brings decades of expertise and a commitment to excellence in every case.\n          </p>\n        </div>\n        <div className=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8\">\n          {attorneys.map((attorney, index) => (\n            <div key={index} className=\"text-center group\">\n              <div className=\"relative mb-4 overflow-hidden rounded-lg\">\n                <img \n                  src={attorney.image} \n                  alt={attorney.name}\n                  className=\"w-full h-64 sm:h-80 object-cover group-hover:scale-105 transition duration-300\"\n                />\n              </div>\n              <h3 className=\"text-xl font-bold mb-1\">{attorney.name}</h3>\n              <p className=\"text-[--color-secondary] font-semibold mb-2\">{attorney.title}</p>\n              <p className=\"text-sm text-[--color-neutral] mb-1\">{attorney.specialization}</p>\n              <p className=\"text-sm text-[--color-neutral-light]\">{attorney.experience} • {attorney.education}</p>\n              <button className=\"mt-4 text-[--color-primary] font-semibold hover:text-[--color-primary-light] transition duration-300\">\n                View Profile →\n              </button>\n            </div>\n          ))}\n        </div>\n      </div>\n    </section>\n  )\n}"
//     },
//     {
//       "file": "src/components/CaseResultsSlider.tsx",
//       "content": "import { useState } from 'react'\n\nexport default function CaseResultsSlider() {\n  const [currentSlide, setCurrentSlide] = useState(0)\n  \n  const caseResults = [\n    {\n      amount: \"$12.5M\",\n      type: \"Corporate Acquisition\",\n      description: \"Successfully represented tech startup in acquisition by Fortune 500 company\",\n      year: \"2024\"\n    },\n    {\n      amount: \"$8.2M\",\n      type: \"Employment Dispute\",\n      description: \"Secured favorable settlement for executive in wrongful termination case\",\n      year: \"2024\"\n    },\n    {\n      amount: \"$15.7M\",\n      type: \"Real Estate Development\",\n      description: \"Structured complex multi-party real estate development deal\",\n      year: \"2023\"\n    },\n    {\n      amount: \"$6.3M\",\n      type: \"Patent Infringement\",\n      description: \"Won patent infringement case protecting client's intellectual property\",\n      year: \"2023\"\n    }\n  ]\n\n  const nextSlide = () => {\n    setCurrentSlide((prev) => (prev + 1) % caseResults.length)\n  }\n\n  const prevSlide = () => {\n    setCurrentSlide((prev) => (prev - 1 + caseResults.length) % caseResults.length)\n  }\n\n  return (\n    <section className=\"py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-[--color-primary] text-white\">\n      <div className=\"max-w-6xl mx-auto\">\n        <div className=\"text-center mb-12\">\n          <h2 className=\"text-3xl sm:text-4xl font-bold mb-4 text-white\">Recent Case Results</h2>\n          <p className=\"text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto\">\n            Our track record speaks for itself. Here are some of our recent successes.\n          </p>\n        </div>\n        <div className=\"relative\">\n          <div className=\"overflow-hidden\">\n            <div \n              className=\"flex transition-transform duration-500 ease-in-out\"\n              style={{ transform: `translateX(-${currentSlide * 100}%)` }}\n            >\n              {caseResults.map((result, index) => (\n                <div key={index} className=\"w-full flex-shrink-0 px-4\">\n                  <div className=\"bg-white/10 backdrop-blur-sm rounded-xl p-8 sm:p-12 text-center\">\n                    <div className=\"text-5xl sm:text-6xl md:text-7xl font-bold text-[--color-secondary] mb-4\">\n                      {result.amount}\n                    </div>\n                    <h3 className=\"text-2xl sm:text-3xl font-bold mb-2 text-white\">{result.type}</h3>\n                    <p className=\"text-lg text-gray-300 mb-4 max-w-2xl mx-auto\">{result.description}</p>\n                    <p className=\"text-gray-400\">{result.year}</p>\n                  </div>\n                </div>\n              ))}\n            </div>\n          </div>\n          <button \n            onClick={prevSlide}\n            className=\"absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 sm:translate-x-0 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 sm:p-4 transition duration-300\"\n          >\n            <svg className=\"w-5 h-5 sm:w-6 sm:h-6\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n              <path strokeLinecap=\"round\" strokeLinejoin=\"round\" strokeWidth={2} d=\"M15 19l-7-7 7-7\" />\n            </svg>\n          </button>\n          <button \n            onClick={nextSlide}\n            className=\"absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 sm:translate-x-0 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 sm:p-4 transition duration-300\"\n          >\n            <svg className=\"w-5 h-5 sm:w-6 sm:h-6\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">\n              <path strokeLinecap=\"round\" strokeLinejoin=\"round\" strokeWidth={2} d=\"M9 5l7 7-7 7\" />\n            </svg>\n          </button>\n          <div className=\"flex justify-center mt-8 gap-2\">\n            {caseResults.map((_, index) => (\n              <button\n                key={index}\n                onClick={() => setCurrentSlide(index)}\n                className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition duration-300 ${\n                  currentSlide === index ? 'bg-[--color-secondary]' : 'bg-white/30'\n                }`}\n              />\n            ))}\n          </div>\n        </div>\n      </div>\n    </section>\n  )\n}"
//     },
//     {
//       "file": "src/components/ConsultationForm.tsx",
//       "content": "import { useState } from 'react'\n\nexport default function ConsultationForm() {\n  const [formData, setFormData] = useState({\n    name: '',\n    email: '',\n    phone: '',\n    practiceArea: '',\n    message: ''\n  })\n\n  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {\n    setFormData({\n      ...formData,\n      [e.target.name]: e.target.value\n    })\n  }\n\n  const handleSubmit = (e: React.FormEvent) => {\n    e.preventDefault()\n    console.log('Form submitted:', formData)\n  }\n\n  return (\n    <section className=\"py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-50\">\n      <div className=\"max-w-4xl mx-auto\">\n        <div className=\"text-center mb-12\">\n          <h2 className=\"text-3xl sm:text-4xl font-bold mb-4\">Schedule Your Consultation</h2>\n          <p className=\"text-lg sm:text-xl text-[--color-neutral] max-w-3xl mx-auto\">\n            Take the first step towards resolving your legal matters. Contact us today for a confidential consultation.\n          </p>\n        </div>\n        <form onSubmit={handleSubmit} className=\"bg-white rounded-xl shadow-xl p-6 sm:p-8 md:p-10\">\n          <div className=\"grid grid-cols-1 md:grid-cols-2 gap-6\">\n            <div>\n              <label htmlFor=\"name\" className=\"block text-sm font-semibold text-[--color-primary] mb-2\">\n                Full Name *\n              </label>\n              <input\n                type=\"text\"\n                id=\"name\"\n                name=\"name\"\n                required\n                value={formData.name}\n                onChange={handleChange}\n                className=\"w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-transparent transition duration-300\"\n                placeholder=\"John Doe\"\n              />\n            </div>\n            <div>\n              <label htmlFor=\"email\" className=\"block text-sm font-semibold text-[--color-primary] mb-2\">\n                Email Address *\n              </label>\n              <input\n                type=\"email\"\n                id=\"email\"\n                name=\"email\"\n                required\n                value={formData.email}\n                onChange={handleChange}\n                className=\"w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-transparent transition duration-300\"\n                placeholder=\"john@example.com\"\n              />\n            </div>\n            <div>\n              <label htmlFor=\"phone\" className=\"block text-sm font-semibold text-[--color-primary] mb-2\">\n                Phone Number\n              </label>\n              <input\n                type=\"tel\"\n                id=\"phone\"\n                name=\"phone\"\n                value={formData.phone}\n                onChange={handleChange}\n                className=\"w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-transparent transition duration-300\"\n                placeholder=\"(555) 123-4567\"\n              />\n            </div>\n            <div>\n              <label htmlFor=\"practiceArea\" className=\"block text-sm font-semibold text-[--color-primary] mb-2\">\n                Practice Area *\n              </label>\n              <select\n                id=\"practiceArea\"\n                name=\"practiceArea\"\n                required\n                value={formData.practiceArea}\n                onChange={handleChange}\n                className=\"w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-transparent transition duration-300\"\n              >\n                <option value=\"\">Select a practice area</option>\n                <option value=\"corporate\">Corporate Law</option>\n                <option value=\"estate\">Estate Planning</option>\n                <option value=\"realestate\">Real Estate</option>\n                <option value=\"litigation\">Litigation</option>\n                <option value=\"ip\">Intellectual Property</option>\n                <option value=\"employment\">Employment Law</option>\n                <option value=\"other\">Other</option>\n              </select>\n            </div>\n          </div>\n          <div className=\"mt-6\">\n            <label htmlFor=\"message\" className=\"block text-sm font-semibold text-[--color-primary] mb-2\">\n              Tell us about your legal needs *\n            </label>\n            <textarea\n              id=\"message\"\n              name=\"message\"\n              required\n              rows={5}\n              value={formData.message}\n              onChange={handleChange}\n              className=\"w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-transparent transition duration-300 resize-none\"\n              placeholder=\"Please provide a brief description of your legal matter...\"\n            />\n          </div>\n          <div className=\"mt-8 text-center\">\n            <button\n              type=\"submit\"\n              className=\"px-8 py-4 bg-[--color-primary] text-white rounded-lg font-semibold hover:bg-[--color-primary-light] transition duration-300 shadow-lg\"\n            >\n              Submit Consultation Request\n            </button>\n            <p className=\"mt-4 text-sm text-[--color-neutral]\">\n              * Required fields. We'll respond within 24 business hours.\n            </p>\n          </div>\n        </form>\n      </div>\n    </section>\n  )\n}"
//     },
//     {
//       "file": "public/vite.svg",
//       "content": "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" aria-hidden=\"true\" role=\"img\" class=\"iconify iconify--logos\" width=\"31.88\" height=\"32\" preserveAspectRatio=\"xMidYMid meet\" viewBox=\"0 0 256 257\"><defs><linearGradient id=\"IconifyId1813088fe1fbc01fb466\" x1=\"-.828%\" x2=\"57.636%\" y1=\"7.652%\" y2=\"78.411%\"><stop offset=\"0%\" stop-color=\"#41D1FF\"></stop><stop offset=\"100%\" stop-color=\"#BD34FE\"></stop></linearGradient><linearGradient id=\"IconifyId1813088fe1fbc01fb467\" x1=\"43.376%\" x2=\"50.316%\" y1=\"2.242%\" y2=\"89.03%\"><stop offset=\"0%\" stop-color=\"#FFEA83\"></stop><stop offset=\"8.333%\" stop-color=\"#FFDD35\"></stop><stop offset=\"100%\" stop-color=\"#FFA800\"></stop></linearGradient></defs><path fill=\"url(#IconifyId1813088fe1fbc01fb466)\" d=\"M255.153 37.938L134.897 252.976c-2.483 4.44-8.862 4.466-11.382.048L.875 37.958c-2.746-4.814 1.371-10.646 6.827-9.67l120.385 21.517a6.537 6.537 0 0 0 2.322-.004l117.867-21.483c5.438-.991 9.574 4.796 6.877 9.62Z\"></path><path fill=\"url(#IconifyId1813088fe1fbc01fb467)\" d=\"M185.432.063L96.44 17.501a3.268 3.268 0 0 0-2.634 3.014l-5.474 92.456a3.268 3.268 0 0 0 3.997 3.378l24.777-5.718c2.318-.535 4.413 1.507 3.936 3.838l-7.361 36.047c-.495 2.426 1.782 4.5 4.151 3.78l15.304-4.649c2.372-.72 4.652 1.36 4.15 3.788l-11.698 56.621c-.732 3.542 3.979 5.473 5.943 2.437l1.313-2.028l72.516-144.72c1.215-2.423-.88-5.186-3.54-4.672l-25.505 4.922c-2.396.462-4.435-1.77-3.759-4.114l16.646-57.705c.677-2.35-1.37-4.583-3.769-4.113Z\"></path></svg>"
//     }
//   ],
//   "files": []
// }


      // // Generate pre-purged CSS for the salon template
      // const tsxSources: Array<{ path: string; content: string }> = []

      // // Collect TSX from metadata components
      // Object.entries(salonTemplate.metadata.components).forEach(([name, component]: [string, any]) => {
      //   if (component.tsx) {
      //     tsxSources.push({ path: `components/${name}.tsx`, content: component.tsx })
      //   }
      // })

      // // Collect TSX from files array (which has the actual content)
      // if (salonTemplate.files && Array.isArray(salonTemplate.files)) {
      //   salonTemplate.files.forEach((file: any) => {
      //     if (file.path && file.path.endsWith('.tsx')) {
      //       tsxSources.push({ path: file.path, content: file.content })
      //     }
      //   })
      // }

      // // CSS generation is now handled by the build pipeline
      // // Templates use Tailwind CDN or their own bundled CSS
      // const prePurgedCSS = '/* CSS generated during build */'

      // // Add the generated CSS to template (not metadata)
      // if (!salonTemplate.styles) {
      //   salonTemplate.styles = {
      //     css: '',
      //     fonts: []
      //   }
      // }
      // salonTemplate.styles.css = prePurgedCSS
      // salonTemplate.styles.fonts = [
      //   {
      //     family: 'Playfair Display',
      //     weights: ['400', '700'],
      //     url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap'
      //   },
      //   {
      //     family: 'Inter',
      //     weights: ['300', '400', '500', '600'],
      //     url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap'
      //   }
      // ]

      // // Add layouts with sections for the SaaS template
      // salonTemplate.layouts = [
      //   {
      //     id: 'default-layout',
      //     name: 'Main Layout',
      //     sections: {
      //       'hero-section': {
      //         id: 'hero-section',
      //         type: 'hero',
      //         content: {
      //           props: {
      //             title: 'Transform Your Business with AI Now',
      //             subtitle: 'The modern platform that helps you automate, analyze, and scale your operations',
      //             ctaText: 'Start Free Trial',
      //             ctaLink: '#signup'
      //           }
      //         },
      //         styles: {
      //           layout: 'centered',
      //           theme: 'minimal'
      //         }
      //       },
      //       'features-section': {
      //         id: 'features-section',
      //         type: 'features',
      //         content: {
      //           props: {
      //             title: 'Everything You Need to Succeed',
      //             subtitle: 'Powerful features designed for modern businesses',
      //             features: [
      //               {
      //                 icon: '🚀',
      //                 title: 'Lightning Fast',
      //                 description: 'Built for speed with cutting-edge technology stack'
      //               },
      //               {
      //                 icon: '🛡️',
      //                 title: 'Enterprise Security',
      //                 description: 'Bank-level encryption and compliance certifications'
      //               },
      //               {
      //                 icon: '📊',
      //                 title: 'Advanced Analytics',
      //                 description: 'Real-time insights to make data-driven decisions'
      //               },
      //               {
      //                 icon: '🔌',
      //                 title: 'Easy Integration',
      //                 description: 'Connect with your favorite tools in minutes'
      //               }
      //             ]
      //           }
      //         }
      //       },
      //       'pricing-section': {
      //         id: 'pricing-section',
      //         type: 'pricing',
      //         content: {
      //           props: {
      //             title: 'Simple, Transparent Pricing',
      //             subtitle: 'Choose the plan that fits your needs',
      //             plans: [
      //               {
      //                 name: 'Starter',
      //                 price: '$29',
      //                 period: 'month',
      //                 description: 'Perfect for small teams',
      //                 features: [
      //                   'Up to 10 users',
      //                   'Basic analytics',
      //                   'Email support',
      //                   '10GB storage'
      //                 ],
      //                 ctaText: 'Start Free',
      //                 highlighted: false
      //               },
      //               {
      //                 name: 'Professional',
      //                 price: '$99',
      //                 period: 'month',
      //                 description: 'For growing businesses',
      //                 features: [
      //                   'Unlimited users',
      //                   'Advanced analytics',
      //                   'Priority support',
      //                   '100GB storage',
      //                   'API access'
      //                 ],
      //                 ctaText: 'Start Free Trial',
      //                 highlighted: true,
      //                 badge: 'Most Popular'
      //               },
      //               {
      //                 name: 'Enterprise',
      //                 price: 'Custom',
      //                 period: '',
      //                 description: 'For large organizations',
      //                 features: [
      //                   'Everything in Pro',
      //                   'Custom integrations',
      //                   'Dedicated support',
      //                   'Unlimited storage',
      //                   'SLA guarantee'
      //                 ],
      //                 ctaText: 'Contact Sales',
      //                 highlighted: false
      //               }
      //             ]
      //           }
      //         }
      //       },
      //       'testimonials-section': {
      //         id: 'testimonials-section',
      //         type: 'testimonials',
      //         content: {
      //           props: {
      //             title: 'Loved by Teams Worldwide',
      //             subtitle: 'See what our customers have to say',
      //             testimonials: [
      //               {
      //                 content: 'This platform transformed how we work. The automation features alone saved us 20 hours per week.',
      //                 author: 'Sarah Chen',
      //                 role: 'CEO at TechStart',
      //                 rating: 5
      //               },
      //               {
      //                 content: 'Incredible value for money. The analytics dashboard gives us insights we never had before.',
      //                 author: 'Marcus Johnson',
      //                 role: 'Operations Manager',
      //                 rating: 5
      //               },
      //               {
      //                 content: 'The best decision we made this year. Customer support is exceptional and the platform just works.',
      //                 author: 'Emily Rodriguez',
      //                 role: 'Product Lead',
      //                 rating: 5
      //               }
      //             ]
      //           }
      //         }
      //       },
      //       'cta-section': {
      //         id: 'cta-section',
      //         type: 'cta',
      //         content: {
      //           props: {
      //             title: 'Ready to Get Started?',
      //             subtitle: 'Join thousands of companies already using our platform',
      //             ctaText: 'Start Your Free Trial',
      //             ctaLink: '#signup'
      //           }
      //         }
      //       }
      //     }
      //   }
      // ]
    // }

    // // Generate generic template for other cases
    // return {
    //   "name": `${specBlock.industry_tag}-${specBlock.tech_stack.replace(/[^a-z]/g, '-')}`,
    //   "slug": `${specBlock.industry_tag}-project`,
    //   "description": specBlock.goal,
    //   "version": "0.1.0",
    //   "author": "TemplateSeed",
    //   "repository": "",
    //   "license": "MIT",
    //   "metadata": {
    //     "tags": specBlock.tech_stack.split(', '),
    //     "industry_tags": [specBlock.industry_tag],
    //     "style_tags": specBlock.style_tags.split(', '),
    //     "core_pages": this.generatePagesFromSections(specBlock.section_list),
    //     "components": this.generateComponentsFromSections(specBlock.section_list),
    //     "design_tokens": this.generateDesignTokens(specBlock.style_tags),
    //     "rsc_path": ""
    //   },
    //   "templateFiles": [
    //     {
    //       "path": "package.json",
    //       "content": JSON.stringify({
    //         "name": `${specBlock.industry_tag}-app`,
    //         "private": true,
    //         "version": "0.0.0",
    //         "type": "module",
    //         "scripts": {
    //           "dev": "vite",
    //           "build": "tsc -b && vite build",
    //           "lint": "eslint .",
    //           "preview": "vite preview"
    //         },
    //         "dependencies": {
    //           "react": "^19.1.0",
    //           "react-dom": "^19.1.0"
    //         }
    //       })
    //     }
    //   ],
    //   "files": []
    }
  }

  private generatePagesFromSections(sectionList: string): Record<string, string> {
    const sections = sectionList.split(';').map(s => s.trim())
    const pages: Record<string, string> = {}

    pages.home = `Landing page with ${sections.join(', ').toLowerCase()}`

    sections.forEach(section => {
      const sectionLower = section.toLowerCase()
      if (sectionLower.includes('contact')) {
        pages.contact = 'Contact information and form'
      } else if (sectionLower.includes('about')) {
        pages.about = 'About us page'
      } else if (sectionLower.includes('service')) {
        pages.services = 'Services overview'
      }
    })

    return pages
  }

  private generateComponentsFromSections(sectionList: string): string[] {
    const sections = sectionList.split(';').map(s => s.trim())
    return sections.map(section =>
      section.replace(/\s+/g, '') // Remove spaces to create component names
    )
  }

  private generateDesignTokens(styleTags: string): any {
    const styles = styleTags.split(', ')
    const tokens: any = {
      colors: {},
      fonts: {
        heading: 'system-ui',
        body: 'system-ui'
      },
      spacing: {
        section: '64px',
        component: '32px'
      }
    }

    // Set color scheme based on style tags
    if (styles.includes('elegant') || styles.includes('professional')) {
      tokens.colors = {
        primary: '#1f2937',
        secondary: '#6b7280',
        accent: '#3b82f6',
        background: '#ffffff',
        text: '#111827'
      }
    } else if (styles.includes('modern') || styles.includes('tech')) {
      tokens.colors = {
        primary: '#0f172a',
        secondary: '#475569',
        accent: '#06b6d4',
        background: '#f8fafc',
        text: '#0f172a'
      }
    } else {
      tokens.colors = {
        primary: '#374151',
        secondary: '#9ca3af',
        accent: '#10b981',
        background: '#f9fafb',
        text: '#1f2937'
      }
    }

    return tokens
  }
}
