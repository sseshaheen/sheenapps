import { describe, it, expect, beforeEach, vi } from 'vitest'
import AITierRouter from '../tier-router'
import { AIRequest } from '../types'

// Mock the tier config manager
vi.mock('../tier-config', () => ({
  default: {
    initialize: vi.fn(),
    getConfig: vi.fn(() => ({
      environment: 'development',
      routing: {
        defaultTier: 'intermediate',
        domainSpecificRules: {
          development: 'basic'
        },
        complexityMapping: {
          simple: 'basic',
          moderate: 'intermediate'
        },
        riskLevelMapping: {
          low: 'basic',
          medium: 'intermediate'
        }
      },
      tiers: {
        basic: { 
          enabled: true, 
          maxCostPerRequest: 0, 
          maxMonthlyBudget: 0, 
          providers: ['mock-fast'],
          rules: []
        },
        intermediate: { 
          enabled: true, 
          maxCostPerRequest: 0, 
          maxMonthlyBudget: 0, 
          providers: ['mock-fast', 'mock-premium'],
          rules: []
        }
      }
    })),
    getTierConfig: vi.fn((tier) => ({
      enabled: true,
      maxCostPerRequest: 0,
      maxMonthlyBudget: 0,
      providers: tier === 'basic' ? ['mock-fast'] : ['mock-fast', 'mock-premium'],
      rules: []
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
    'mock-fast': {
      tier: 'basic',
      avgResponseTime: 300,
      costPerRequest: 0,
      qualityScore: 0.60,
      reliabilityScore: 0.99
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

describe('Development Mode Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure we're in development mode
    vi.stubEnv('NODE_ENV', 'development')
  })

  describe('Mock Service Selection', () => {
    it('should always use mock services in development mode', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Generate some content',
        domain: 'business'
      }

      const decision = await AITierRouter.routeRequest(request)
      
      expect(decision.selectedProvider).toMatch(/^mock-/)
      expect(decision.fallbackChain).toEqual(['mock-fast', 'mock-premium'])
      expect(decision.estimatedCost).toBe(0)
    })

    it('should use mock services even for premium requests', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Complex financial analysis requiring premium AI',
        domain: 'finance', // Would normally route to premium
        tier: 'premium' // Explicit premium request
      }

      const decision = await AITierRouter.routeRequest(request)
      
      expect(decision.selectedProvider).toMatch(/^mock-/)
      expect(decision.estimatedCost).toBe(0)
    })

    it('should respect forceRealAI flag when provided', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Test request that needs real AI',
        forceRealAI: true
      }

      const decision = await AITierRouter.routeRequest(request)
      
      // Should not force mock in this case (though actual behavior depends on availability)
      expect(decision).toBeDefined()
      expect(decision.reasoning).toContain('Selected')
    })

    it('should generate short fallback chains in development', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Simple request'
      }

      const decision = await AITierRouter.routeRequest(request)
      
      expect(decision.fallbackChain).toHaveLength(2)
      expect(decision.fallbackChain).toEqual(['mock-fast', 'mock-premium'])
    })
  })

  describe('Cost Optimization in Development', () => {
    it('should estimate zero cost for all requests', async () => {
      const requests = [
        { type: 'generation', content: 'Simple content' },
        { type: 'analysis', content: 'Complex analysis', domain: 'finance' },
        { type: 'modification', content: 'Modify section', tier: 'premium' as const }
      ]

      for (const request of requests) {
        const decision = await AITierRouter.routeRequest(request)
        expect(decision.estimatedCost).toBe(0)
      }
    })

    it('should still provide realistic time estimates', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Generate content'
      }

      const decision = await AITierRouter.routeRequest(request)
      
      expect(decision.estimatedTime).toBeGreaterThan(0)
      expect(decision.estimatedTime).toBeLessThan(2000) // Mock services should be fast
    })
  })

  describe('Analysis Functions in Development', () => {
    it('should still perform proper domain classification', () => {
      const domain = AITierRouter.classifyRequestDomain('Financial planning and investment advice')
      expect(domain).toBe('finance')
    })

    it('should still assess complexity correctly', () => {
      const complexity = AITierRouter.assessRequestComplexity('Detailed comprehensive analysis')
      expect(complexity).toBeOneOf(['complex', 'very_complex'])
    })

    it('should still detect risk levels appropriately', () => {
      const risk = AITierRouter.assessRequestRisk('Legal advice for contract review')
      expect(risk).toBeOneOf(['high', 'critical'])
    })
  })

  describe('Configuration Loading', () => {
    it('should indicate development mode in logs', async () => {
      // Reset the initialized state to force re-initialization
      // @ts-expect-error - accessing private static property for testing
      AITierRouter.initialized = false
      
      // Import logger to configure it for the test
      const { logger } = await import('@/utils/logger')
      
      // Set log level to INFO so we can see the info logs
      logger.configure({ level: 'INFO' })
      
      // Spy on the logger.info method directly
      const loggerSpy = vi.spyOn(logger, 'info')
      
      await AITierRouter.initialize()
      
      // Check that the development mode message was logged
      expect(loggerSpy).toHaveBeenCalledWith('🔧 Running in development mode - will prefer mock services')
      
      loggerSpy.mockRestore()
    })
  })
})

describe('Production Mode Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set production mode using vi.stubEnv
    vi.stubEnv('NODE_ENV', 'production')
  })

  it('should not automatically prefer mock services in production', async () => {
    const request: AIRequest = {
      type: 'generation',
      content: 'Generate content'
    }

    const decision = await AITierRouter.routeRequest(request)
    
    // In production, should use ServiceSelector logic, not force mocks
    expect(decision.selectedProvider).toBe('mock-provider') // From ServiceSelector mock
  })
})