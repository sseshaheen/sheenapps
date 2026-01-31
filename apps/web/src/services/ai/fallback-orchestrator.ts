import { AIRequest, AIResponse, RoutingDecision, AITier } from './types'
import { AI_SERVICES, UsageTracker } from './service-registry'
import AITierConfigManager from './tier-config'
import AITierRouter from './tier-router'
import { logger } from '@/utils/logger';

// Fallback execution result
export interface FallbackResult {
  success: boolean
  response?: AIResponse
  finalProvider: string
  finalTier: AITier
  attemptsCount: number
  fallbacksUsed: string[]
  totalTime: number
  totalCost: number
  errors: Array<{
    provider: string
    error: string
    timestamp: Date
  }>
}

// Execution context for tracking attempts
interface ExecutionContext {
  originalRequest: AIRequest
  routingDecision: RoutingDecision
  startTime: Date
  attempts: Array<{
    provider: string
    tier: AITier
    startTime: Date
    endTime?: Date
    success: boolean
    error?: string
    cost?: number
    responseTime?: number
  }>
  totalCost: number
  maxRetries: number
}

export class FallbackOrchestrator {
  private static executionContexts: Map<string, ExecutionContext> = new Map()

  /**
   * Execute AI request with intelligent fallback handling
   */
  static async executeWithFallback(
    request: AIRequest,
    executeFunction: (provider: string, request: AIRequest) => Promise<AIResponse>
  ): Promise<FallbackResult> {
    const startTime = new Date()
    
    // Get routing decision
    const routingDecision = await AITierRouter.routeRequest(request)
    
    // Create execution context
    const contextId = this.generateContextId()
    const context: ExecutionContext = {
      originalRequest: request,
      routingDecision,
      startTime,
      attempts: [],
      totalCost: 0,
      maxRetries: this.getMaxRetries()
    }
    
    this.executionContexts.set(contextId, context)

    try {
      // Primary attempt
      const primaryResult = await this.attemptExecution(
        routingDecision.selectedProvider,
        routingDecision.selectedTier,
        request,
        executeFunction,
        context
      )

      if (primaryResult.success) {
        return this.buildSuccessResult(primaryResult, context)
      }

      // Execute fallback chain
      logger.info(`🔄 Primary provider ${routingDecision.selectedProvider} failed, trying fallbacks`);
      
      for (const fallbackProvider of routingDecision.fallbackChain) {
        if (context.attempts.length >= context.maxRetries) {
          logger.info(`⚠️ Maximum retry limit (${context.maxRetries}); reached`)
          break
        }

        const fallbackTier = this.determineFallbackTier(fallbackProvider)
        
        // Check if fallback is viable
        if (!this.isFallbackViable(fallbackProvider, fallbackTier, request, context)) {
          logger.info(`⚠️ Skipping unviable fallback: ${fallbackProvider}`);
          continue
        }

        const fallbackResult = await this.attemptExecution(
          fallbackProvider,
          fallbackTier,
          request,
          executeFunction,
          context
        )

        if (fallbackResult.success) {
          logger.info(`✅ Fallback succeeded with ${fallbackProvider}`);
          return this.buildSuccessResult(fallbackResult, context)
        }

        logger.info(`❌ Fallback ${fallbackProvider} also failed`);
      }

      // All attempts failed
      return this.buildFailureResult(context)
      
    } finally {
      this.executionContexts.delete(contextId)
    }
  }

  /**
   * Attempt execution with a specific provider
   */
  private static async attemptExecution(
    provider: string,
    tier: AITier,
    request: AIRequest,
    executeFunction: (provider: string, request: AIRequest) => Promise<AIResponse>,
    context: ExecutionContext
  ): Promise<{ success: boolean; response?: AIResponse; error?: string }> {
    const attemptStart = new Date()
    
    const attempt = {
      provider,
      tier,
      startTime: attemptStart,
      endTime: undefined as Date | undefined,
      success: false,
      error: undefined as string | undefined,
      cost: 0,
      responseTime: 0
    }

    context.attempts.push(attempt)

    try {
      // Check budget constraints before attempting
      if (this.wouldExceedBudget(tier, context)) {
        const error = `Budget exceeded for tier ${tier}`
        attempt.error = error
        logger.info(`💰 ${error}`);
        return { success: false, error }
      }

      // Check rate limits
      if (this.isRateLimited(provider)) {
        const error = `Rate limited for provider ${provider}`
        attempt.error = error
        logger.info(`⏱️ ${error}`);
        return { success: false, error }
      }

      logger.info(`🔄 Attempting execution with ${provider} (${tier});`)
      
      // Execute the request
      const response = await executeFunction(provider, request)
      
      const attemptEnd = new Date()
      const responseTime = attemptEnd.getTime() - attemptStart.getTime()
      const cost = response.metadata?.cost || 0

      // Update attempt record
      attempt.endTime = attemptEnd
      attempt.success = response.success
      attempt.cost = cost
      attempt.responseTime = responseTime
      context.totalCost += cost

      if (response.success) {
        // Track successful usage
        UsageTracker.trackTierUsage(
          tier,
          provider,
          response.metadata?.tokensUsed || 0,
          cost,
          responseTime,
          true,
          context.originalRequest.domain
        )

        logger.info(`✅ Execution succeeded with ${provider} (${responseTime}ms, $${cost.toFixed(4)})`)
        return { success: true, response }
      } else {
        const error = response.error?.message || 'Unknown error'
        attempt.error = error
        
        // Track failed usage
        UsageTracker.trackTierUsage(
          tier,
          provider,
          0,
          cost,
          responseTime,
          false,
          context.originalRequest.domain
        )

        logger.info(`❌ Execution failed with ${provider}: ${error}`)
        return { success: false, error }
      }

    } catch (error) {
      const attemptEnd = new Date()
      const responseTime = attemptEnd.getTime() - attemptStart.getTime()
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      attempt.endTime = attemptEnd
      attempt.error = errorMessage
      attempt.responseTime = responseTime

      // Track failed usage
      UsageTracker.trackTierUsage(
        tier,
        provider,
        0,
        0,
        responseTime,
        false,
        context.originalRequest.domain
      )

      logger.info(`💥 Execution threw error with ${provider}: ${errorMessage}`)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Check if a fallback option is viable
   */
  private static isFallbackViable(
    provider: string,
    tier: AITier,
    request: AIRequest,
    context: ExecutionContext
  ): boolean {
    // Check if provider exists and is healthy
    const service = AI_SERVICES[provider]
    if (!service) {
      logger.info(`❌ Provider ${provider} not found`)
      return false
    }

    // Check if we've already tried this provider
    const alreadyTried = context.attempts.some(attempt => attempt.provider === provider)
    if (alreadyTried) {
      logger.info(`⚠️ Provider ${provider} already attempted`)
      return false
    }

    // Check budget constraints
    if (this.wouldExceedBudget(tier, context)) {
      logger.info(`💰 Provider ${provider} would exceed budget`);
      return false
    }

    // Check if tier is enabled
    const tierConfig = AITierConfigManager.getTierConfig(tier)
    if (!tierConfig?.enabled) {
      logger.info(`⚠️ Tier ${tier} is disabled`);
      return false
    }

    // Check time constraints
    if (request.maxResponseTime) {
      const elapsedTime = Date.now() - context.startTime.getTime()
      const remainingTime = request.maxResponseTime - elapsedTime
      
      if (service.avgResponseTime > remainingTime) {
        logger.info(`⏱️ Provider ${provider} too slow for remaining time`);
        return false
      }
    }

    return true
  }

  /**
   * Determine the appropriate tier for a fallback provider
   */
  private static determineFallbackTier(provider: string): AITier {
    const service = AI_SERVICES[provider]
    return service?.tier || 'basic'
  }

  /**
   * Check if using this tier would exceed budget
   */
  private static wouldExceedBudget(tier: AITier, context: ExecutionContext): boolean {
    const tierConfig = AITierConfigManager.getTierConfig(tier)
    if (!tierConfig) return false

    // Check per-request budget
    if (context.originalRequest.maxCost && 
        tierConfig.maxCostPerRequest > context.originalRequest.maxCost) {
      return true
    }

    // Check monthly budget
    const budgetStatus = UsageTracker.getMonthlyBudgetStatus(tier)
    if (budgetStatus && budgetStatus.budgetLimit > 0) {
      const projectedCost = budgetStatus.currentSpend + tierConfig.maxCostPerRequest
      if (projectedCost > budgetStatus.budgetLimit) {
        return true
      }
    }

    return false
  }

  /**
   * Check if provider is currently rate limited
   */
  private static isRateLimited(provider: string): boolean {
    // TODO: Implement actual rate limiting check
    // For now, assume no rate limiting
    return false
  }

  /**
   * Build success result
   */
  private static buildSuccessResult(
    executionResult: { success: boolean; response?: AIResponse },
    context: ExecutionContext
  ): FallbackResult {
    const endTime = new Date()
    const totalTime = endTime.getTime() - context.startTime.getTime()
    const successfulAttempt = context.attempts.find(a => a.success)
    
    return {
      success: true,
      response: executionResult.response,
      finalProvider: successfulAttempt?.provider || 'unknown',
      finalTier: successfulAttempt?.tier || 'basic',
      attemptsCount: context.attempts.length,
      fallbacksUsed: context.attempts.slice(1).map(a => a.provider), // All except first
      totalTime,
      totalCost: context.totalCost,
      errors: context.attempts
        .filter(a => !a.success && a.error)
        .map(a => ({
          provider: a.provider,
          error: a.error!,
          timestamp: a.startTime
        }))
    }
  }

  /**
   * Build failure result
   */
  private static buildFailureResult(context: ExecutionContext): FallbackResult {
    const endTime = new Date()
    const totalTime = endTime.getTime() - context.startTime.getTime()
    
    return {
      success: false,
      finalProvider: 'none',
      finalTier: 'basic',
      attemptsCount: context.attempts.length,
      fallbacksUsed: context.attempts.slice(1).map(a => a.provider),
      totalTime,
      totalCost: context.totalCost,
      errors: context.attempts
        .filter(a => a.error)
        .map(a => ({
          provider: a.provider,
          error: a.error!,
          timestamp: a.startTime
        }))
    }
  }

  /**
   * Get maximum retry attempts from configuration
   */
  private static getMaxRetries(): number {
    const config = AITierConfigManager.getConfig()
    return config.features.fallbackRetries.enabled ? 
      config.features.fallbackRetries.maxRetries : 
      0
  }

  /**
   * Generate unique context ID
   */
  private static generateContextId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Monitoring and analytics methods

  /**
   * Get fallback statistics
   */
  static getFallbackStats(): {
    totalExecutions: number
    successRate: number
    avgFallbacksUsed: number
    avgExecutionTime: number
    topFailureReasons: Array<{ reason: string; count: number }>
  } {
    // TODO: Implement persistent statistics storage
    // For now, return mock data
    return {
      totalExecutions: 0,
      successRate: 0,
      avgFallbacksUsed: 0,
      avgExecutionTime: 0,
      topFailureReasons: []
    }
  }

  /**
   * Get fallback rate (percentage of requests that required fallbacks)
   */
  static getFallbackRate(): number {
    // TODO: Implement based on historical data
    // For now, return 0 since we don't track this yet
    return 0
  }

  /**
   * Get provider reliability scores
   */
  static getProviderReliability(): Record<string, {
    successRate: number
    avgResponseTime: number
    totalAttempts: number
  }> {
    // TODO: Implement based on historical data
    return {}
  }

  /**
   * Health check for all providers
   */
  static async performHealthCheck(): Promise<Record<string, {
    healthy: boolean
    responseTime?: number
    error?: string
  }>> {
    const results: Record<string, any> = {}
    
    for (const [providerKey, service] of Object.entries(AI_SERVICES)) {
      try {
        // TODO: Implement actual health check ping
        // For now, assume all providers are healthy
        results[providerKey] = {
          healthy: true,
          responseTime: service.avgResponseTime
        }
      } catch (error) {
        results[providerKey] = {
          healthy: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
    
    return results
  }

  /**
   * Emergency fallback to most reliable service
   */
  static getEmergencyFallback(): string {
    // Always fallback to mock service as last resort
    return 'mock-premium'
  }

  /**
   * Clear execution contexts (for cleanup)
   */
  static clearExecutionContexts(): void {
    this.executionContexts.clear()
  }

  /**
   * Get active execution count
   */
  static getActiveExecutionCount(): number {
    return this.executionContexts.size
  }
}

export default FallbackOrchestrator