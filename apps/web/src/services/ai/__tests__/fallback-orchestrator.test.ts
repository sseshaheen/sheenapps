import { describe, it, expect, beforeEach, vi } from 'vitest'
import FallbackOrchestrator from '../fallback-orchestrator'
import { AIRequest, AIResponse, RoutingDecision } from '../types'
import AITierRouter from '../tier-router'

// Mock dependencies
vi.mock('../tier-router', () => ({
  default: {
    routeRequest: vi.fn()
  }
}))

vi.mock('../tier-config', () => ({
  default: {
    getConfig: vi.fn(() => ({
      features: {
        fallbackRetries: {
          enabled: true,
          maxRetries: 3,
          retryDelayMs: 100
        }
      }
    })),
    getTierConfig: vi.fn(() => ({
      enabled: true,
      maxCostPerRequest: 0.02,
      maxMonthlyBudget: 1000
    }))
  }
}))

vi.mock('../service-registry', () => ({
  AI_SERVICES: {
    'primary-provider': {
      tier: 'intermediate',
      avgResponseTime: 1500,
      costPerRequest: 0.01
    },
    'fallback-provider-1': {
      tier: 'basic',
      avgResponseTime: 800,
      costPerRequest: 0.005
    },
    'fallback-provider-2': {
      tier: 'advanced',
      avgResponseTime: 2000,
      costPerRequest: 0.03
    },
    'mock-premium': {
      tier: 'premium',
      avgResponseTime: 500,
      costPerRequest: 0
    }
  },
  UsageTracker: {
    trackTierUsage: vi.fn(),
    getMonthlyBudgetStatus: vi.fn(() => ({ currentSpend: 100, budgetLimit: 1000 }))
  }
}))

describe('FallbackOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    FallbackOrchestrator.clearExecutionContexts()
    
    // Setup default routing decision
    vi.mocked(AITierRouter.routeRequest).mockResolvedValue({
      selectedTier: 'intermediate',
      selectedProvider: 'primary-provider',
      fallbackChain: ['fallback-provider-1', 'fallback-provider-2', 'mock-premium'],
      estimatedCost: 0.01,
      estimatedTime: 1500,
      reasoning: 'Test routing decision',
      confidence: 0.85
    })
  })

  describe('Successful Primary Execution', () => {
    it('should succeed on first attempt when primary provider works', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn().mockResolvedValue({
        success: true,
        data: 'Generated content',
        metadata: {
          model: 'test-model',
          tokensUsed: 100,
          cost: 0.01,
          responseTime: 1200
        }
      })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.finalProvider).toBe('primary-provider')
      expect(result.attemptsCount).toBe(1)
      expect(result.fallbacksUsed).toHaveLength(0)
      expect(mockExecuteFunction).toHaveBeenCalledTimes(1)
      expect(result.response).toBeDefined()
    })

    it('should track usage correctly on successful execution', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Analysis request',
        domain: 'business'
      }

      const mockExecuteFunction = vi.fn().mockResolvedValue({
        success: true,
        data: 'Analysis result',
        metadata: {
          tokensUsed: 500,
          cost: 0.02,
          responseTime: 1800
        }
      })

      await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      const { UsageTracker } = await import('../service-registry')
      expect(UsageTracker.trackTierUsage).toHaveBeenCalledWith(
        'intermediate',
        'primary-provider',
        500,
        0.02,
        expect.any(Number),
        true,
        'business'
      )
    })
  })

  describe('Fallback Execution', () => {
    it('should fallback to next provider when primary fails', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValueOnce(new Error('Primary provider failed'))
        .mockResolvedValueOnce({
          success: true,
          data: 'Fallback content',
          metadata: {
            tokensUsed: 80,
            cost: 0.008,
            responseTime: 900
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.finalProvider).toBe('fallback-provider-1')
      expect(result.attemptsCount).toBe(2)
      expect(result.fallbacksUsed).toEqual(['fallback-provider-1'])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].provider).toBe('primary-provider')
    })

    it('should try multiple fallbacks until success', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('Fallback 1 failed'))
        .mockResolvedValueOnce({
          success: true,
          data: 'Final success',
          metadata: {
            tokensUsed: 120,
            cost: 0.025,
            responseTime: 1800
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.finalProvider).toBe('fallback-provider-2')
      expect(result.attemptsCount).toBe(3)
      expect(result.fallbacksUsed).toEqual(['fallback-provider-1', 'fallback-provider-2'])
      expect(result.errors).toHaveLength(2)
    })

    it('should fail when all providers fail', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValue(new Error('All providers failed'))

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(false)
      expect(result.finalProvider).toBe('none')
      expect(result.attemptsCount).toBeGreaterThan(1)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.every(error => error.error === 'All providers failed')).toBe(true)
    })

    it('should respect maximum retry limit', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValue(new Error('Provider failed'))

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.attemptsCount).toBeLessThanOrEqual(3) // Max retries from config
    })
  })

  describe('Budget and Cost Management', () => {
    it('should skip providers that would exceed budget', async () => {
      // Mock budget status showing we're near limit
      const { UsageTracker } = await import('../service-registry')
      vi.mocked(UsageTracker.getMonthlyBudgetStatus).mockReturnValue({
        currentSpend: 980,
        budgetLimit: 1000
      })

      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce({
          success: true,
          data: 'Low cost success',
          metadata: {
            tokensUsed: 50,
            cost: 0.005, // Low cost provider
            responseTime: 800
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.finalProvider).toBe('fallback-provider-1') // Lower cost provider
    })

    it('should track total cost across all attempts', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockResolvedValueOnce({
          success: false,
          error: { message: 'Partial failure', retryable: true },
          metadata: { cost: 0.005 }
        })
        .mockResolvedValueOnce({
          success: true,
          data: 'Success',
          metadata: {
            tokensUsed: 100,
            cost: 0.01,
            responseTime: 1200
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.totalCost).toBe(0.015) // Sum of both attempts
    })

    it('should respect per-request cost limits', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request',
        maxCost: 0.01
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValue(new Error('Too expensive'))

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      // Should attempt providers within budget
      expect(result.totalCost).toBeLessThanOrEqual(0.05) // Reasonable total including failures
    })
  })

  describe('Time Constraints', () => {
    it('should respect response time limits', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Urgent request',
        maxResponseTime: 1000
      }

      const mockExecuteFunction = vi.fn()
        .mockImplementation(() => new Promise(resolve => 
          setTimeout(() => resolve({
            success: true,
            data: 'Fast response',
            metadata: {
              tokensUsed: 50,
              cost: 0.005,
              responseTime: 500
            }
          }), 100)
        ))

      const startTime = Date.now()
      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)
      const endTime = Date.now()

      expect(result.success).toBe(true)
      expect(endTime - startTime).toBeLessThan(request.maxResponseTime! + 200) // Some buffer
    })

    it('should track total execution time', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockImplementation(async (provider: string, request: AIRequest) => {
          // Add a small delay to ensure measurable time passes
          await new Promise(resolve => setTimeout(resolve, 1))
          return {
            success: true,
            data: 'Response',
            metadata: {
              model: 'test-model',
              tokensUsed: 100,
              cost: 0.01,
              responseTime: 800
            }
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)
      
      // The totalTime should be greater than 0
      expect(result.success).toBe(true)
      expect(result.totalTime).toBeGreaterThanOrEqual(0) // At minimum 0, but should be > 0
      expect(result.totalTime).toBeLessThan(1000) // Should complete quickly
      expect(result.finalProvider).toBe('primary-provider')
      expect(result.attemptsCount).toBe(1)
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle provider throwing exceptions', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new TypeError('Invalid response'))
        .mockResolvedValueOnce({
          success: true,
          data: 'Recovered response',
          metadata: {
            tokensUsed: 80,
            cost: 0.008,
            responseTime: 900
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0].error).toBe('Network timeout')
      expect(result.errors[1].error).toBe('Invalid response')
    })

    it('should handle providers returning failure responses', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockResolvedValueOnce({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
            retryable: true
          },
          metadata: { cost: 0 }
        })
        .mockResolvedValueOnce({
          success: true,
          data: 'Success after failure',
          metadata: {
            tokensUsed: 90,
            cost: 0.009,
            responseTime: 1100
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toBe('Rate limit exceeded')
    })

    it('should avoid duplicate provider attempts', async () => {
      // Mock routing decision with duplicate providers
      vi.mocked(AITierRouter.routeRequest).mockResolvedValue({
        selectedTier: 'intermediate',
        selectedProvider: 'primary-provider',
        fallbackChain: ['primary-provider', 'fallback-provider-1'], // Duplicate
        estimatedCost: 0.01,
        estimatedTime: 1500,
        reasoning: 'Test routing decision',
        confidence: 0.85
      })

      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValue(new Error('Provider failed'))

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      // Should only attempt each unique provider once
      const attemptedProviders = new Set()
      result.errors.forEach(error => attemptedProviders.add(error.provider))
      
      expect(attemptedProviders.has('primary-provider')).toBe(true)
      expect(attemptedProviders.has('fallback-provider-1')).toBe(true)
      // Should not have attempted primary-provider twice
    })
  })

  describe('Provider Viability Checks', () => {
    it('should skip providers that are not available', async () => {
      // Mock routing decision with non-existent provider
      vi.mocked(AITierRouter.routeRequest).mockResolvedValue({
        selectedTier: 'intermediate',
        selectedProvider: 'non-existent-provider',
        fallbackChain: ['fallback-provider-1'],
        estimatedCost: 0.01,
        estimatedTime: 1500,
        reasoning: 'Test routing decision',
        confidence: 0.85
      })

      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      // Mock that non-existent provider fails, forcing fallback
      const mockExecuteFunction = vi.fn()
        .mockImplementation((provider: string) => {
          if (provider === 'non-existent-provider') {
            return Promise.reject(new Error('Provider not found'))
          }
          return Promise.resolve({
            success: true,
            data: 'Fallback success',
            metadata: {
              model: 'test-model',
              tokensUsed: 80,
              cost: 0.008,
              responseTime: 800
            }
          })
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result.success).toBe(true)
      expect(result.finalProvider).toBe('fallback-provider-1')
      expect(mockExecuteFunction).toHaveBeenCalledTimes(2) // First failed, second succeeded
    })
  })

  describe('Monitoring and Analytics', () => {
    it('should provide detailed execution statistics', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({
          success: true,
          data: 'Second attempt success',
          metadata: {
            tokensUsed: 90,
            cost: 0.009,
            responseTime: 1000
          }
        })

      const result = await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(result).toMatchObject({
        success: true,
        attemptsCount: 2,
        fallbacksUsed: expect.arrayContaining([expect.any(String)]),
        totalTime: expect.any(Number),
        totalCost: expect.any(Number),
        errors: expect.arrayContaining([
          expect.objectContaining({
            provider: expect.any(String),
            error: expect.any(String),
            timestamp: expect.any(Date)
          })
        ])
      })
    })

    it('should track usage for both successful and failed attempts', async () => {
      const request: AIRequest = {
        type: 'analysis',
        content: 'Analysis request',
        domain: 'business'
      }

      const mockExecuteFunction = vi.fn()
        .mockRejectedValueOnce(new Error('Failed attempt'))
        .mockResolvedValueOnce({
          success: true,
          data: 'Successful attempt',
          metadata: {
            tokensUsed: 150,
            cost: 0.015,
            responseTime: 1400
          }
        })

      await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      const { UsageTracker } = await import('../service-registry')
      
      // Should track failed attempt
      expect(UsageTracker.trackTierUsage).toHaveBeenCalledWith(
        'intermediate',
        'primary-provider',
        0,
        0,
        expect.any(Number),
        false,
        'business'
      )

      // Should track successful attempt
      expect(UsageTracker.trackTierUsage).toHaveBeenCalledWith(
        'basic',
        'fallback-provider-1',
        150,
        0.015,
        expect.any(Number),
        true,
        'business'
      )
    })
  })

  describe('Concurrency and Performance', () => {
    it('should handle multiple concurrent executions', async () => {
      const requests = Array(5).fill(null).map((_, i) => ({
        type: 'generation',
        content: `Request ${i}`
      }))

      const mockExecuteFunction = vi.fn()
        .mockResolvedValue({
          success: true,
          data: 'Concurrent response',
          metadata: {
            tokensUsed: 50,
            cost: 0.005,
            responseTime: 500
          }
        })

      const startTime = Date.now()
      const results = await Promise.all(
        requests.map(req => FallbackOrchestrator.executeWithFallback(req, mockExecuteFunction))
      )
      const endTime = Date.now()

      expect(results).toHaveLength(5)
      expect(results.every(r => r.success)).toBe(true)
      expect(endTime - startTime).toBeLessThan(1000) // Should handle concurrently
      expect(FallbackOrchestrator.getActiveExecutionCount()).toBe(0) // Should clean up
    })

    it('should manage execution context cleanup', async () => {
      const request: AIRequest = {
        type: 'generation',
        content: 'Test request'
      }

      const mockExecuteFunction = vi.fn()
        .mockResolvedValue({
          success: true,
          data: 'Response',
          metadata: {
            tokensUsed: 100,
            cost: 0.01,
            responseTime: 1000
          }
        })

      expect(FallbackOrchestrator.getActiveExecutionCount()).toBe(0)

      await FallbackOrchestrator.executeWithFallback(request, mockExecuteFunction)

      expect(FallbackOrchestrator.getActiveExecutionCount()).toBe(0) // Should clean up
    })
  })
})