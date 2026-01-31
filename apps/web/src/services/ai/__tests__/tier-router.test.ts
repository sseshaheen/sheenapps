import { describe, it, expect, beforeEach, vi } from 'vitest'
import AITierRouter from '../tier-router'
import { AIRequest, ComplexityLevel, RiskLevel, AITier } from '../types'
import AITierConfigManager from '../tier-config'

// Mock the tier config manager
vi.mock('../tier-config', () => ({
  default: {
    initialize: vi.fn(),
    getConfig: vi.fn(() => ({
      routing: {
        defaultTier: 'intermediate',
        domainSpecificRules: {
          finance: 'premium',
          legal: 'premium',
          healthcare: 'premium',
          marketing: 'intermediate',
          general: 'basic'
        },
        complexityMapping: {
          simple: 'basic',
          moderate: 'intermediate',
          complex: 'advanced',
          very_complex: 'premium'
        },
        riskLevelMapping: {
          low: 'basic',
          medium: 'intermediate',
          high: 'advanced',
          critical: 'premium'
        }
      },
      tiers: {
        basic: { 
          enabled: true, 
          maxCostPerRequest: 0.005, 
          maxMonthlyBudget: 500, 
          providers: ['openai-gpt3.5', 'mock-fast'], 
          rules: [],
          priority: 1 
        },
        intermediate: { 
          enabled: true, 
          maxCostPerRequest: 0.02, 
          maxMonthlyBudget: 1500, 
          providers: ['openai-gpt4o-mini', 'mock-fast'], 
          rules: [],
          priority: 2 
        },
        advanced: { 
          enabled: true, 
          maxCostPerRequest: 0.05, 
          maxMonthlyBudget: 3000, 
          providers: ['claude-sonnet', 'mock-premium'], 
          rules: [],
          priority: 3 
        },
        premium: { 
          enabled: true, 
          maxCostPerRequest: 0.15, 
          maxMonthlyBudget: 5000, 
          providers: ['claude-opus', 'mock-premium'], 
          rules: [],
          priority: 4 
        },
        specialized: { 
          enabled: true, 
          maxCostPerRequest: 0.25, 
          maxMonthlyBudget: 2000, 
          providers: ['claude-opus'], 
          rules: [],
          priority: 5 
        }
      }
    })),
    getTierConfig: vi.fn((tier: AITier) => ({
      enabled: true,
      maxCostPerRequest: 0.02,
      maxMonthlyBudget: 1000,
      providers: ['mock-provider'],
      rules: [
        {
          type: 'complexity',
          operator: 'in',
          value: ['simple', 'moderate'],
          weight: 0.8
        }
      ]
    }))
  }
}))

// Mock service registry
vi.mock('../service-registry', () => ({
  ServiceSelector: {
    selectOptimalServiceForRequest: vi.fn(() => 'mock-provider')
  },
  UsageTracker: {
    setBudgetLimit: vi.fn()
  },
  AI_SERVICES: {
    'mock-provider': {
      tier: 'intermediate',
      avgResponseTime: 1000,
      costPerRequest: 0.01,
      qualityScore: 0.85,
      reliabilityScore: 0.90
    },
    'openai-gpt3.5': {
      tier: 'basic',
      avgResponseTime: 800,
      costPerRequest: 0.002,
      qualityScore: 0.75,
      reliabilityScore: 0.88
    },
    'openai-gpt4o-mini': {
      tier: 'intermediate',
      avgResponseTime: 1200,
      costPerRequest: 0.01,
      qualityScore: 0.85,
      reliabilityScore: 0.90
    },
    'claude-sonnet': {
      tier: 'advanced',
      avgResponseTime: 1500,
      costPerRequest: 0.015,
      qualityScore: 0.90,
      reliabilityScore: 0.91
    },
    'claude-opus': {
      tier: 'premium',
      avgResponseTime: 2500,
      costPerRequest: 0.075,
      qualityScore: 0.98,
      reliabilityScore: 0.94
    },
    'mock-premium': {
      tier: 'premium',
      avgResponseTime: 1500,
      costPerRequest: 0,
      qualityScore: 0.90,
      reliabilityScore: 0.99
    }
  }
}))

describe('AITierRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Domain Classification', () => {
    it('should classify finance domain correctly', () => {
      const domain = AITierRouter.classifyRequestDomain('I need help with financial planning and investment analysis')
      expect(domain).toBe('finance')
    })

    it('should classify legal domain correctly', () => {
      const domain = AITierRouter.classifyRequestDomain('Please review this contract and legal agreement')
      expect(domain).toBe('legal')
    })

    it('should classify healthcare domain correctly', () => {
      const domain = AITierRouter.classifyRequestDomain('Analyze patient medical records and symptoms')
      expect(domain).toBe('healthcare')
    })

    it('should classify marketing domain correctly', () => {
      const domain = AITierRouter.classifyRequestDomain('Create a marketing campaign for social media engagement')
      expect(domain).toBe('marketing')
    })

    it('should classify technical domain correctly', () => {
      const domain = AITierRouter.classifyRequestDomain('Help me debug this code and optimize the API performance')
      expect(domain).toBe('technical')
    })

    it('should default to general for unclear domains', () => {
      const domain = AITierRouter.classifyRequestDomain('Hello world test message')
      expect(domain).toBe('general')
    })
  })

  describe('Complexity Assessment', () => {
    it('should assess simple complexity', () => {
      const complexity = AITierRouter.assessRequestComplexity('List 5 quick tips for productivity')
      expect(complexity).toBe('simple')
    })

    it('should assess moderate complexity', () => {
      const complexity = AITierRouter.assessRequestComplexity('Provide an explanation of how machine learning works')
      expect(complexity).toBe('moderate')
    })

    it('should assess complex complexity', () => {
      const complexity = AITierRouter.assessRequestComplexity('Conduct a detailed analysis of market trends and competitive landscape')
      expect(complexity).toBeOneOf(['complex', 'very_complex']) // Can be either based on keywords
    })

    it('should assess very complex based on content length', () => {
      const longContent = 'a'.repeat(6000) + ' detailed comprehensive analysis research'
      const complexity = AITierRouter.assessRequestComplexity(longContent)
      expect(complexity).toBe('very_complex')
    })

    it('should assess complexity based on keywords', () => {
      const complexity = AITierRouter.assessRequestComplexity('Provide comprehensive study with detailed analysis and sophisticated model')
      expect(complexity).toBe('very_complex')
    })
  })

  describe('Risk Assessment', () => {
    it('should assess low risk for general content', () => {
      const risk = AITierRouter.assessRequestRisk('Write a blog post about cooking tips')
      expect(risk).toBe('low')
    })

    it('should assess medium risk for business content', () => {
      const risk = AITierRouter.assessRequestRisk('Help me with business analysis and planning')
      expect(risk).toBe('medium')
    })

    it('should assess high risk for finance domain', () => {
      const risk = AITierRouter.assessRequestRisk('Provide financial planning advice', 'finance')
      expect(risk).toBe('high')
    })

    it('should assess critical risk for sensitive indicators', () => {
      const risk = AITierRouter.assessRequestRisk('I need legal advice for this lawsuit')
      expect(risk).toBe('critical')
    })

    it('should elevate risk for high-risk domains', () => {
      const risk = AITierRouter.assessRequestRisk('General question about treatments', 'healthcare')
      expect(risk).toBe('high')
    })
  })

  describe('Request Routing', () => {
    it('should route simple requests to basic tier', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'List 5 simple tips',
        domain: 'general'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).toBe('basic')
    })

    it('should route complex analysis to appropriate tier', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Provide competitive analysis and market research',
        domain: 'business'
      }

      const decision = await AITierRouter.routeRequest(request)
      // Should route to at least intermediate tier for analysis
      expect(['intermediate', 'advanced', 'premium']).toContain(decision.selectedTier)
    })

    it('should route finance requests to premium tier', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'I need help with investment planning',
        domain: 'finance'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).toBe('premium')
    })

    it('should respect explicit tier override', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Simple content generation',
        tier: 'premium'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).toBe('premium')
    })

    it('should respect budget constraints for non-domain-specific requests', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Simple text', // Very simple to avoid complexity routing
        // Don't specify a domain that has specific routing rules
        maxCost: 0.01 // Lower than premium tier cost
      }

      const decision = await AITierRouter.routeRequest(request)
      // Should select basic tier which is the only one under 0.01
      expect(decision.selectedTier).toBe('basic')
      expect(decision.estimatedCost).toBeLessThanOrEqual(0.01)
    })

    it('should respect time constraints', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Urgent simple request',
        maxResponseTime: 500
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).toBe('basic') // Fastest tier
    })

    it('should generate appropriate fallback chains', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Business analysis request',
        domain: 'business'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.fallbackChain).toBeInstanceOf(Array)
      expect(decision.fallbackChain.length).toBeGreaterThan(0)
      expect(decision.fallbackChain).toContain('mock-premium') // Always includes mock fallback
    })

    it('should provide cost and time estimates', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Generate some content'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.estimatedCost).toBeGreaterThanOrEqual(0)
      expect(decision.estimatedTime).toBeGreaterThan(0)
      expect(decision.reasoning).toBeTruthy()
      expect(decision.confidence).toBeGreaterThan(0)
      expect(decision.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('Request Analysis', () => {
    it('should properly analyze a complex business request', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Provide comprehensive market analysis for our fintech startup including competitive landscape, regulatory considerations, and growth strategies',
        domain: 'finance',
        priority: 'high'
      }

      const analysis = AITierRouter.analyzeRequest(request)
      
      expect(analysis.domain).toBe('finance')
      expect(analysis.complexity).toBeOneOf(['complex', 'very_complex'])
      expect(analysis.riskLevel).toBe('high') // Finance domain elevates risk
      expect(analysis.urgency).toBe('high')
      expect(analysis.analyticalDepth).toBe('deep')
      expect(analysis.confidenceRequired).toBeGreaterThan(0.8)
    })

    it('should properly analyze a simple content request', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Write a short blog post about coffee brewing tips'
      }

      const analysis = AITierRouter.analyzeRequest(request)
      
      expect(analysis.complexity).toBe('simple')
      expect(analysis.riskLevel).toBe('low')
      expect(analysis.creativityRequired).toBe(true) // Generation type
      expect(analysis.analyticalDepth).toBe('shallow')
    })

    it('should detect domain from context when not explicitly provided', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Review this patient data and medical symptoms',
        context: {
          businessType: 'healthcare',
          industry: 'medical'
        }
      }

      const analysis = AITierRouter.analyzeRequest(request)
      expect(analysis.domain).toBe('healthcare')
      expect(analysis.riskLevel).toBe('high') // Healthcare domain
    })

    it('should estimate token usage appropriately', async () => {
      const shortRequest: AIRequest = {
        type: 'generation',
        content: 'Hello'
      }

      const longRequest: AIRequest = {
        type: 'analysis',
        content: 'a'.repeat(2000) // Long content
      }

      const shortAnalysis = AITierRouter.analyzeRequest(shortRequest)
      const longAnalysis = AITierRouter.analyzeRequest(longRequest)

      expect(longAnalysis.estimatedTokens).toBeGreaterThan(shortAnalysis.estimatedTokens)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty content gracefully', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: ''
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).toBeTruthy()
      expect(decision.selectedProvider).toBeTruthy()
    })

    it('should handle requests with conflicting constraints', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Very complex detailed analysis requiring premium quality',
        maxCost: 0.005, // Low budget (only basic tier)
        maxResponseTime: 1000 // Fast response needed
      }

      const decision = await AITierRouter.routeRequest(request)
      // Should try to meet constraints even if it means lower quality
      expect(decision.selectedTier).toBe('basic') // Only tier that meets budget
      expect(decision.estimatedCost).toBeLessThanOrEqual(0.005)
      // Basic tier services should have reasonable response times
      expect(decision.estimatedTime).toBeGreaterThan(0)
    })

    it('should handle unknown domains gracefully', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Some content about xyz unknown domain',
        domain: 'unknown-domain'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).toBeTruthy()
    })

    it('should provide reasonable defaults when tier config is missing', async () => {
      // Mock missing tier config
      vi.mocked(AITierConfigManager.getTierConfig).mockReturnValueOnce(null)

      const request: AIRequest = {
        type: 'generation',
        content: 'Test content'
      }

      const decision = await AITierRouter.routeRequest(request)
      // Should still route successfully even without tier config
      expect(decision.selectedTier).toBeTruthy()
      expect(['basic', 'intermediate']).toContain(decision.selectedTier)
    })
  })

  describe('Performance and Optimization', () => {
    it('should complete routing in reasonable time', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Standard business analysis request'
      }

      const startTime = Date.now()
      await AITierRouter.routeRequest(request)
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(100) // Should complete in under 100ms
    })

    it('should handle multiple concurrent routing requests', async () => {
      const requests = Array(10).fill(null).map((_, i) => ({
        type: 'generation',
        content: `Request ${i}`,
        domain: i % 2 === 0 ? 'business' : 'marketing'
      }))

      const startTime = Date.now()
      const decisions = await Promise.all(
        requests.map(req => AITierRouter.routeRequest(req))
      )
      const endTime = Date.now()

      expect(decisions).toHaveLength(10)
      expect(decisions.every(d => d.selectedTier)).toBe(true)
      expect(endTime - startTime).toBeLessThan(500) // Should handle 10 requests in under 500ms
    })
  })

  describe('Configuration Integration', () => {
    it('should respect tier enablement settings', async () => {
      // Mock disabled tier
      vi.mocked(AITierConfigManager.getTierConfig).mockImplementation((tier: AITier) => {
        if (tier === 'premium') {
          return { enabled: false, maxCostPerRequest: 0.15, maxMonthlyBudget: 5000, providers: [] } as any
        }
        return { enabled: true, maxCostPerRequest: 0.02, maxMonthlyBudget: 1000, providers: ['mock'] } as any
      })

      const request: AIRequest = {
        type: 'analysis',
        content: 'Financial analysis requiring premium tier',
        domain: 'finance'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).not.toBe('premium') // Should not select disabled tier
    })

    it('should use domain-specific rules from configuration', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Marketing content creation',
        domain: 'marketing'
      }

      const decision = await AITierRouter.routeRequest(request)
      expect(decision.selectedTier).toBe('intermediate') // Per domain mapping
    })
  })
})

describe('Request Analysis Edge Cases', () => {
  it('should handle multilingual content', async () => {
    const request: AIRequest = {
      type: 'analysis',
      content: 'Analyse financière détaillée et stratégie d\'investissement', // French
      domain: 'finance'
    }

    const analysis = AITierRouter.analyzeRequest(request)
    expect(analysis.domain).toBe('finance')
    expect(analysis.riskLevel).toBe('high')
  })

  it('should handle mixed case and special characters', async () => {
    const request: AIRequest = {
      type: 'generation',
      content: 'URGENT!!! Need LEGAL advice for CONTRACT review @#$%',
    }

    const analysis = AITierRouter.analyzeRequest(request)
    expect(analysis.domain).toBe('legal')
    expect(analysis.riskLevel).toBeOneOf(['high', 'critical'])
  })

  it('should prioritize explicit domain over detected domain', async () => {
    const request: AIRequest = {
      type: 'analysis',
      content: 'Legal contract review and financial analysis',
      domain: 'business' // Explicit domain
    }

    const analysis = AITierRouter.analyzeRequest(request)
    expect(analysis.domain).toBe('business') // Should use explicit domain
  })
})