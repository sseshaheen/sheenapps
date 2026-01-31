// Tier-specific mock responses that demonstrate different quality levels
// This helps visualize the value of different AI tiers during development

import { AIResponse, BusinessAnalysis, BusinessName, BusinessTagline } from '../types'

// Response quality matrices based on tier
export const TIER_QUALITY_PROFILES = {
  basic: {
    creativity: 0.6,
    depth: 0.5,
    accuracy: 0.7,
    detail: 0.5,
    processingTime: 500,
    cost: 0.001
  },
  intermediate: {
    creativity: 0.75,
    depth: 0.7,
    accuracy: 0.8,
    detail: 0.7,
    processingTime: 800,
    cost: 0.005
  },
  advanced: {
    creativity: 0.85,
    depth: 0.85,
    accuracy: 0.9,
    detail: 0.85,
    processingTime: 1200,
    cost: 0.02
  },
  premium: {
    creativity: 0.95,
    depth: 0.95,
    accuracy: 0.95,
    detail: 0.95,
    processingTime: 1800,
    cost: 0.08
  },
  specialized: {
    creativity: 0.98,
    depth: 0.98,
    accuracy: 0.98,
    detail: 0.98,
    processingTime: 2500,
    cost: 0.15
  }
}

// Business analysis responses by tier
export const BUSINESS_ANALYSIS_BY_TIER = {
  basic: (idea: string): AIResponse<BusinessAnalysis> => ({
    success: true,
    data: {
      businessType: 'service',
      industry: 'Professional Services',
      subCategory: 'General Business',
      coreOffering: idea.slice(0, 100),
      valuePropositions: [
        'Provides essential service',
        'Meets basic customer needs'
      ],
      targetAudience: 'General consumers',
      demographics: {
        ageRange: '25-55',
        income: 'Middle class',
        geography: 'Local/Regional',
        lifestyle: ['busy professionals']
      },
      psychographics: {
        values: ['convenience', 'value'],
        interests: ['productivity'],
        painPoints: ['time constraints'],
        motivations: ['efficiency']
      },
      businessModel: 'b2c',
      revenueModel: 'service_based',
      geographicScope: 'local',
      brandPersonality: ['reliable', 'practical'],
      communicationStyle: 'casual',
      differentiators: ['basic service delivery'],
      marketOpportunities: ['standard market'],
      challenges: ['competition'],
      confidence: 0.7,
      keyInsights: ['Basic market understanding'],
      competitiveAdvantages: ['service availability']
    },
    metadata: {
      model: 'mock-basic',
      tokensUsed: 150,
      responseTime: 500,
      cost: 0.001,
      confidence: 0.7
    }
  }),

  intermediate: (idea: string): AIResponse<BusinessAnalysis> => ({
    success: true,
    data: {
      businessType: 'service',
      industry: 'Professional Services',
      subCategory: 'Specialized Business Solutions',
      coreOffering: `Enhanced ${idea} with improved customer experience`,
      valuePropositions: [
        'Delivers superior service quality',
        'Provides comprehensive solutions',
        'Ensures customer satisfaction',
        'Offers competitive pricing'
      ],
      targetAudience: 'Working professionals and small business owners',
      demographics: {
        ageRange: '28-45',
        income: '$50k-$100k annually',
        geography: 'Urban and suburban areas',
        lifestyle: ['career-focused', 'efficiency-seeking', 'quality-conscious']
      },
      psychographics: {
        values: ['quality', 'reliability', 'professionalism'],
        interests: ['business growth', 'time management', 'technology'],
        painPoints: ['finding reliable services', 'time constraints', 'quality concerns'],
        motivations: ['success', 'efficiency', 'peace of mind']
      },
      businessModel: 'b2c',
      revenueModel: 'service_based',
      geographicScope: 'regional',
      brandPersonality: ['professional', 'trustworthy', 'innovative'],
      communicationStyle: 'formal',
      differentiators: ['superior quality', 'customer-centric approach', 'proven expertise'],
      marketOpportunities: ['growing demand for quality services', 'digital transformation'],
      challenges: ['market competition', 'customer acquisition costs'],
      confidence: 0.85,
      keyInsights: [
        'Market shows strong demand for quality services',
        'Customer loyalty is achievable through consistent delivery'
      ],
      competitiveAdvantages: ['service excellence', 'customer relationships', 'market positioning']
    },
    metadata: {
      model: 'mock-intermediate',
      tokensUsed: 300,
      responseTime: 800,
      cost: 0.005,
      confidence: 0.85
    }
  }),

  premium: (idea: string): AIResponse<BusinessAnalysis> => ({
    success: true,
    data: {
      businessType: 'service',
      industry: 'Professional Services',
      subCategory: 'Premium Business Solutions & Consulting',
      coreOffering: `Comprehensive ${idea} ecosystem with strategic insights and premium delivery`,
      valuePropositions: [
        'Delivers transformational business outcomes',
        'Provides end-to-end strategic solutions',
        'Ensures measurable ROI and value creation',
        'Offers white-glove service experience',
        'Leverages cutting-edge methodologies'
      ],
      targetAudience: 'Senior executives, business owners, and high-net-worth individuals seeking premium solutions',
      demographics: {
        ageRange: '35-55',
        income: '$100k+ annually (individual) / $1M+ revenue (business)',
        geography: 'Major metropolitan areas and affluent suburbs',
        lifestyle: ['executive leadership', 'strategic thinking', 'premium service expectations', 'results-oriented']
      },
      psychographics: {
        values: ['excellence', 'innovation', 'strategic thinking', 'premium quality', 'exclusivity'],
        interests: ['business strategy', 'market leadership', 'innovative solutions', 'executive networking'],
        painPoints: ['finding truly expert providers', 'ensuring strategic alignment', 'maximizing ROI', 'time optimization'],
        motivations: ['market leadership', 'competitive advantage', 'operational excellence', 'legacy building']
      },
      businessModel: 'b2b',
      revenueModel: 'service_based',
      geographicScope: 'national',
      brandPersonality: ['sophisticated', 'authoritative', 'innovative', 'exclusive', 'results-driven'],
      communicationStyle: 'authoritative',
      differentiators: [
        'Proven track record with Fortune 500 clients',
        'Proprietary methodologies and frameworks',
        'C-suite level expertise and insights',
        'Measurable business impact and ROI',
        'Exclusive client partnership approach'
      ],
      marketOpportunities: [
        'Digital transformation acceleration creating demand for expert guidance',
        'Economic uncertainty driving need for strategic optimization',
        'Increased focus on operational efficiency and cost management',
        'Growing market for specialized consulting services'
      ],
      challenges: [
        'High client expectations requiring consistent excellence',
        'Longer sales cycles due to strategic nature of decisions',
        'Need for continuous innovation and methodology development',
        'Talent acquisition and retention in competitive market'
      ],
      confidence: 0.95,
      keyInsights: [
        'Premium market segment shows strong willingness to pay for proven expertise',
        'Strategic positioning as transformation partner rather than vendor creates sustainable competitive advantage',
        'Client success stories and measurable outcomes are the primary drivers of new business acquisition',
        'Long-term partnership model generates higher lifetime value than transactional relationships'
      ],
      competitiveAdvantages: [
        'Deep industry expertise and proven methodologies',
        'Exclusive client relationships and high switching costs',
        'Premium brand positioning and market reputation',
        'Scalable delivery model with consistent quality standards'
      ]
    },
    metadata: {
      model: 'mock-premium',
      tokensUsed: 800,
      responseTime: 1800,
      cost: 0.08,
      confidence: 0.95
    }
  })
}

// Business name generation by tier
export const BUSINESS_NAMES_BY_TIER = {
  basic: (analysis: BusinessAnalysis): AIResponse<BusinessName[]> => ({
    success: true,
    data: [
      {
        name: 'QuickServe Pro',
        reasoning: 'Simple, clear name that conveys speed and professionalism',
        brandFit: 0.7,
        memorability: 0.6,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: ['FastService', 'ProServe'],
        tags: ['professional', 'quick']
      },
      {
        name: 'ServiceHub',
        reasoning: 'Indicates central location for services',
        brandFit: 0.6,
        memorability: 0.7,
        availability: {
          domain: false,
          trademark: true,
          social: { instagram: false, twitter: true, facebook: true }
        },
        alternatives: ['ServiceCenter', 'ServicePoint'],
        tags: ['central', 'services']
      }
    ],
    metadata: {
      model: 'mock-basic',
      tokensUsed: 100,
      responseTime: 600,
      cost: 0.002
    }
  }),

  intermediate: (analysis: BusinessAnalysis): AIResponse<BusinessName[]> => ({
    success: true,
    data: [
      {
        name: 'Synergy Solutions',
        reasoning: 'Conveys collaborative approach and comprehensive service delivery',
        brandFit: 0.85,
        memorability: 0.8,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: ['Synergy Partners', 'Unity Solutions', 'Collaborative Edge'],
        tags: ['collaborative', 'comprehensive', 'professional']
      },
      {
        name: 'Apex Performance',
        reasoning: 'Suggests peak performance and excellence in service delivery',
        brandFit: 0.9,
        memorability: 0.85,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: false, facebook: true }
        },
        alternatives: ['Peak Performance', 'Summit Solutions', 'Zenith Services'],
        tags: ['excellence', 'performance', 'premium']
      },
      {
        name: 'Catalyst Consulting',
        reasoning: 'Implies transformation and positive change for clients',
        brandFit: 0.8,
        memorability: 0.9,
        availability: {
          domain: false,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: false }
        },
        alternatives: ['Transform Partners', 'Change Catalyst', 'Growth Engine'],
        tags: ['transformation', 'growth', 'strategic']
      }
    ],
    metadata: {
      model: 'mock-intermediate',
      tokensUsed: 250,
      responseTime: 900,
      cost: 0.008
    }
  }),

  premium: (analysis: BusinessAnalysis): AIResponse<BusinessName[]> => ({
    success: true,
    data: [
      {
        name: 'Meridian Strategic Partners',
        reasoning: 'Sophisticated name suggesting navigation expertise and strategic partnership. Meridian implies guidance through complex business landscapes.',
        brandFit: 0.95,
        memorability: 0.9,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: ['Meridian Advisors', 'Compass Strategic', 'Navigator Partners'],
        tags: ['strategic', 'navigation', 'partnership', 'sophisticated']
      },
      {
        name: 'Vanguard Excellence Group',
        reasoning: 'Positions as industry leader and innovator. Vanguard suggests being at the forefront of industry advancement.',
        brandFit: 0.92,
        memorability: 0.95,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: ['Vanguard Strategic', 'Excellence Partners', 'Pioneer Group'],
        tags: ['leadership', 'innovation', 'excellence', 'pioneering']
      },
      {
        name: 'Axiom Transformation',
        reasoning: 'Axiom suggests fundamental truth and principle-based approach. Combined with transformation, it conveys deep, foundational change.',
        brandFit: 0.88,
        memorability: 0.85,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: false, facebook: true }
        },
        alternatives: ['Axiom Strategic', 'Principle Partners', 'Foundation Group'],
        tags: ['fundamental', 'transformation', 'principle-based', 'strategic']
      },
      {
        name: 'Zenith Performance Institute',
        reasoning: 'Institute positioning adds credibility and expertise. Zenith represents peak achievement and industry authority.',
        brandFit: 0.94,
        memorability: 0.92,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: ['Zenith Advisory', 'Peak Institute', 'Summit Performance'],
        tags: ['authority', 'institute', 'peak performance', 'expertise']
      }
    ],
    metadata: {
      model: 'mock-premium',
      tokensUsed: 500,
      responseTime: 1500,
      cost: 0.025
    }
  })
}

// Content generation responses by tier
export const CONTENT_BY_TIER = {
  basic: {
    hero: {
      primary: 'Get the service you need.',
      secondary: 'We provide reliable solutions for your business.',
      cta: 'Get Started'
    }
  },
  intermediate: {
    hero: {
      primary: 'Transform Your Business with Expert Solutions',
      secondary: 'Professional services designed to accelerate your growth and maximize efficiency.',
      cta: 'Discover How'
    }
  },
  premium: {
    hero: {
      primary: 'Elevate Your Enterprise to Unprecedented Heights',
      secondary: 'Strategic transformation partnerships that deliver measurable results and sustainable competitive advantage.',
      cta: 'Begin Your Transformation'
    }
  }
}

export function getTierResponseQuality(tier: string) {
  return TIER_QUALITY_PROFILES[tier as keyof typeof TIER_QUALITY_PROFILES] || TIER_QUALITY_PROFILES.basic
}

export function getBusinessAnalysisForTier(tier: string, idea: string) {
  const generator = BUSINESS_ANALYSIS_BY_TIER[tier as keyof typeof BUSINESS_ANALYSIS_BY_TIER]
  return generator ? generator(idea) : BUSINESS_ANALYSIS_BY_TIER.basic(idea)
}

export function getBusinessNamesForTier(tier: string, analysis: BusinessAnalysis) {
  const generator = BUSINESS_NAMES_BY_TIER[tier as keyof typeof BUSINESS_NAMES_BY_TIER]
  return generator ? generator(analysis) : BUSINESS_NAMES_BY_TIER.basic(analysis)
}

export function getContentForTier(tier: string, section: string) {
  const tierContent = CONTENT_BY_TIER[tier as keyof typeof CONTENT_BY_TIER]
  return tierContent?.[section as keyof typeof tierContent] || CONTENT_BY_TIER.basic[section as keyof typeof CONTENT_BY_TIER.basic]
}