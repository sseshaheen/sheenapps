import { AIRequest, AIResponse, StreamingAIResponse, AIProvider } from './types'
import { FallbackOrchestrator } from './fallback-orchestrator'
import { AITierRouter } from './tier-router'
import { AIServiceFactory } from './service-factory'
import { RealAIService } from './real-ai-service'
import { logger } from '@/utils/logger';

export interface UnifiedAIOptions {
  useTierRouting?: boolean
  forceProvider?: AIProvider
  maxCost?: number
  timeout?: number
  tierOverride?: string
  enableFallback?: boolean
  locale?: string // For locale-aware response generation (e.g., Arabic)
}

export class UnifiedAIService {
  private realAIService: RealAIService
  private static instance: UnifiedAIService

  constructor() {
    this.realAIService = new RealAIService()
  }

  // Singleton pattern for consistent service usage
  static getInstance(): UnifiedAIService {
    if (!this.instance) {
      this.instance = new UnifiedAIService()
    }
    return this.instance
  }

  /**
   * Main entry point for processing AI requests with tier routing
   */
  async processRequest(
    request: AIRequest,
    options: UnifiedAIOptions = {}
  ): Promise<AIResponse> {
    const startTime = Date.now()
    
    try {
      // Check if tier routing is enabled
      const tierRoutingEnabled = this.shouldUseTierRouting(options)

      if (!tierRoutingEnabled) {
        logger.info('🔄 Using legacy AI service (tier routing disabled)')
        return await this.processWithLegacyService(request, options.locale)
      }

      // Use tier-aware routing
      logger.info('🎯 Processing request with tier routing:', request.type)
      
      const result = await FallbackOrchestrator.executeWithFallback(
        {
          ...request,
          maxCost: options.maxCost,
          tier: options.tierOverride as any,
          forceRealAI: process.env.NODE_ENV !== 'development'
        },
        async (provider, req) => {
          const service = AIServiceFactory.create(provider as AIProvider)
          return await service.processRequest(req)
        }
      )

      if (!result.success || !result.response) {
        throw new Error(`Tier routing failed: ${result.errors?.[0]?.error || 'Unknown error'}`)
      }

      // Add tier routing metadata
      const enhancedResponse = {
        ...result.response,
        metadata: {
          ...result.response.metadata,
          tierRouting: {
            finalProvider: result.finalProvider,
            finalTier: result.finalTier,
            attemptsCount: result.attemptsCount,
            fallbacksUsed: result.fallbacksUsed,
            totalCost: result.totalCost
          },
          totalResponseTime: Date.now() - startTime
        }
      }

      logger.info(`✅ Request completed via ${result.finalProvider} (${result.finalTier}) in ${Date.now() - startTime}ms`)
      return enhancedResponse

    } catch (error) {
      logger.error('❌ Unified AI service error:', error);
      
      // Fallback to legacy service on error
      if (options.enableFallback !== false) {
        logger.info('🔄 Falling back to legacy service due to error');
        return await this.processWithLegacyService(request, options.locale)
      }

      // Return error response
      return {
        success: false,
        data: null,
        metadata: {
          model: 'unknown',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        },
        error: {
          code: 'UNIFIED_SERVICE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true
        }
      }
    }
  }

  /**
   * Streaming version of processRequest
   */
  async *processRequestStream(
    request: AIRequest,
    options: UnifiedAIOptions = {}
  ): AsyncGenerator<StreamingAIResponse> {
    const tierRoutingEnabled = this.shouldUseTierRouting(options)

    if (!tierRoutingEnabled) {
      logger.info('🔄 Using legacy streaming service');
      yield* this.processStreamWithLegacyService(request, options.locale)
      return
    }

    try {
      // Get routing decision first
      const routingDecision = await AITierRouter.routeRequest(request)
      logger.info(`🎯 Streaming via ${routingDecision.selectedProvider} (${routingDecision.selectedTier})`)

      const service = AIServiceFactory.create(routingDecision.selectedProvider as AIProvider)
      
      if (service.processRequestStream) {
        yield* service.processRequestStream(request)
      } else {
        // Fallback to regular response converted to stream
        const response = await service.processRequest(request)
        
        yield {
          type: 'start',
          content: '',
          metadata: { progress: 0 }
        }
        
        yield {
          type: 'chunk',
          content: JSON.stringify(response.data),
          metadata: { progress: 100 }
        }
        
        yield {
          type: 'complete',
          content: '',
          metadata: { progress: 100 }
        }
      }

    } catch (error) {
      logger.error('❌ Streaming error, falling back to legacy:', error);
      yield* this.processStreamWithLegacyService(request, options.locale)
    }
  }

  /**
   * Business-specific methods with tier routing
   */
  async analyzeBusinessIdea(
    idea: string,
    options: UnifiedAIOptions = {}
  ): Promise<AIResponse> {
    const request: AIRequest = {
      type: 'business_analysis',
      content: idea,
      domain: 'business',
      priority: 'medium'
    }

    return this.processRequest(request, {
      ...options,
      useTierRouting: options.useTierRouting ?? true,
      maxCost: options.maxCost ?? 0.10 // Default higher cost for analysis
    })
  }

  async generateBusinessNames(
    analysis: any,
    options: UnifiedAIOptions = {}
  ): Promise<AIResponse> {
    const request: AIRequest = {
      type: 'name_generation',
      content: JSON.stringify(analysis),
      domain: 'business',
      priority: 'low'
    }

    return this.processRequest(request, {
      ...options,
      useTierRouting: options.useTierRouting ?? true,
      maxCost: options.maxCost ?? 0.05
    })
  }

  async generateContent(
    contentRequest: any,
    options: UnifiedAIOptions = {}
  ): Promise<AIResponse> {
    const request: AIRequest = {
      type: 'content_generation',
      content: JSON.stringify(contentRequest),
      domain: this.detectContentDomain(contentRequest),
      priority: 'low'
    }

    return this.processRequest(request, {
      ...options,
      useTierRouting: options.useTierRouting ?? true,
      maxCost: options.maxCost ?? 0.03
    })
  }

  async generateComponent(
    componentRequest: any,
    options: UnifiedAIOptions = {}
  ): Promise<AIResponse> {
    const request: AIRequest = {
      type: 'component_generation',
      content: JSON.stringify(componentRequest),
      domain: 'ui',
      priority: 'medium'
    }

    return this.processRequest(request, {
      ...options,
      useTierRouting: options.useTierRouting ?? true,
      maxCost: options.maxCost ?? 0.07
    })
  }

  // Private helper methods

  private shouldUseTierRouting(options: UnifiedAIOptions): boolean {
    // Check explicit option first
    if (options.useTierRouting !== undefined) {
      return options.useTierRouting
    }

    // Check environment variable
    if (process.env.AI_TIER_ROUTING_ENABLED === 'true') {
      return true
    }

    // Default to false for safety (gradual rollout)
    return false
  }

  private async processWithLegacyService(request: AIRequest, locale?: string): Promise<AIResponse> {
    // Use locale from request or parameter (request takes precedence)
    const effectiveLocale = request.locale || locale

    try {
      // Convert unified request to legacy format if needed
      if (request.type === 'business_analysis') {
        return await this.realAIService.analyzeBusinessIdea(request.content, undefined, effectiveLocale)
      }

      if (request.type === 'name_generation') {
        const analysis = JSON.parse(request.content)
        return await this.realAIService.generateBusinessNames(analysis, undefined, effectiveLocale)
      }

      // Generic fallback
      return {
        success: true,
        data: { content: `Legacy service processed: ${request.type}` },
        metadata: {
          model: 'legacy-service',
          tokensUsed: 100,
          responseTime: 1000,
          cost: 0.001
        }
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        metadata: {
          model: 'legacy-service',
          tokensUsed: 0,
          responseTime: 0,
          cost: 0
        },
        error: {
          code: 'LEGACY_SERVICE_ERROR',
          message: error instanceof Error ? error.message : 'Legacy service error',
          retryable: true
        }
      }
    }
  }

  private async *processStreamWithLegacyService(request: AIRequest, locale?: string): AsyncGenerator<StreamingAIResponse> {
    // Note: locale parameter preserved for future use when streaming methods support it
    // Currently streaming methods don't support locale - consider adding if needed

    try {
      if (request.type === 'business_analysis') {
        // TODO: Add locale support to analyzeBusinessIdeaStream when needed
        yield* this.realAIService.analyzeBusinessIdeaStream(request.content)
        return
      }

      // Generic fallback streaming
      yield { type: 'start', content: '' }
      yield { type: 'chunk', content: `Legacy streaming: ${request.type}` }
      yield { type: 'complete', content: '' }

    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Legacy streaming error'
      }
    }
  }

  private detectContentDomain(contentRequest: any): string {
    const businessContext = contentRequest.businessContext
    const section = contentRequest.section
    const type = contentRequest.type
    const componentType = contentRequest.componentType

    // Check for web design/UI related requests
    if (type === 'component' || type === 'ui' || type === 'webpage' || 
        componentType || section === 'design' || contentRequest.isWebDesign) {
      return 'web_design'
    }
    
    if (businessContext?.type === 'finance' || section === 'pricing') {
      return 'finance'
    }
    
    if (businessContext?.type === 'healthcare' || section === 'medical') {
      return 'healthcare'
    }
    
    if (type === 'marketing' || section === 'hero' || section === 'cta') {
      return 'marketing'
    }
    
    return 'content'
  }

  // Utility methods for monitoring and debugging

  getServiceHealth(): Promise<{
    tierRoutingEnabled: boolean
    availableProviders: AIProvider[]
    cacheSize: number
  }> {
    return Promise.resolve({
      tierRoutingEnabled: this.shouldUseTierRouting({}),
      availableProviders: AIServiceFactory.getAvailableProviders(),
      cacheSize: AIServiceFactory.getCacheSize()
    })
  }

  async testProvider(provider: AIProvider): Promise<{
    healthy: boolean
    latency?: number
    error?: string
  }> {
    return AIServiceFactory.getProviderHealth(provider)
  }

  // Static convenience methods

  static async processRequest(
    request: AIRequest,
    options?: UnifiedAIOptions
  ): Promise<AIResponse> {
    const instance = this.getInstance()
    return instance.processRequest(request, options)
  }

  static async analyzeBusinessIdea(
    idea: string,
    options?: UnifiedAIOptions
  ): Promise<AIResponse> {
    const instance = this.getInstance()
    return instance.analyzeBusinessIdea(idea, options)
  }

  static async generateContent(
    contentRequest: any,
    options?: UnifiedAIOptions
  ): Promise<AIResponse> {
    const instance = this.getInstance()
    return instance.generateContent(contentRequest, options)
  }
}

export default UnifiedAIService