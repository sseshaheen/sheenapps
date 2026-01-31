import { 
  OpenAIServiceAdapter, 
  AnthropicServiceAdapter, 
  MockServiceAdapter 
} from './service-adapters'
// ClaudeWorkerAdapter moved to legacy folder - replaced by Worker API
import { AIProvider, AIServiceMethods, AIRequest, AIResponse } from './types'
import { logger } from '@/utils/logger';

// Service instance cache to avoid recreation
const serviceCache = new Map<string, AIServiceMethods>()

export class AIServiceFactory {
  /**
   * Create an AI service instance for the given provider
   */
  static create(provider: AIProvider): AIServiceMethods {
    // Check cache first
    if (serviceCache.has(provider)) {
      return serviceCache.get(provider)!
    }

    let service: AIServiceMethods

    try {
      switch (provider) {
        // OpenAI services
        case 'openai-gpt4o':
          service = new OpenAIServiceAdapter({ model: 'gpt-4o', maxTokens: 4000 })
          break
        case 'openai-gpt4o-mini':
          service = new OpenAIServiceAdapter({ model: 'gpt-4o-mini', maxTokens: 2000 })
          break
        case 'openai-gpt3.5':
          service = new OpenAIServiceAdapter({ model: 'gpt-3.5-turbo', maxTokens: 1500 })
          break

        // Anthropic services
        case 'claude-opus':
          service = new AnthropicServiceAdapter({ model: 'claude-3-opus-20240229', maxTokens: 4000 })
          break
        case 'claude-sonnet':
          service = new AnthropicServiceAdapter({ model: 'claude-3-sonnet-20240229', maxTokens: 3000 })
          break
        case 'claude-haiku':
          service = new AnthropicServiceAdapter({ model: 'claude-3-haiku-20240307', maxTokens: 2000 })
          break
        
        // Claude Worker service - REPLACED by Worker API
        case 'claude-worker':
          logger.warn('claude-worker provider is deprecated, use Worker API instead')
          service = new MockServiceAdapter() // Fallback to mock
          break

        // Mock services
        case 'mock':
        case 'mock-fast':
        case 'mock-premium':
          service = new MockServiceAdapter()
          break

        default:
          logger.warn(`Unknown provider: ${provider}, falling back to mock service`);
          service = new MockServiceAdapter()
      }

      // Cache the service instance
      serviceCache.set(provider, service)
      
      logger.info(`🏭 Created AI service for provider: ${provider}`);
      return service

    } catch (error) {
      logger.error(`❌ Failed to create service for ${provider}:`, error);
      
      // Fallback to mock service
      const fallbackService = new MockServiceAdapter()
      serviceCache.set(provider, fallbackService)
      return fallbackService
    }
  }

  /**
   * Get all available providers
   */
  static getAvailableProviders(): AIProvider[] {
    const providers: AIProvider[] = ['mock', 'mock-fast', 'mock-premium']

    // Add real providers if API keys are available
    if (process.env.OPENAI_API_KEY) {
      providers.push('openai-gpt4o', 'openai-gpt4o-mini', 'openai-gpt3.5')
    }

    if (process.env.ANTHROPIC_API_KEY) {
      providers.push('claude-opus', 'claude-sonnet', 'claude-haiku')
    }

    // Add claude-worker if configured
    if (process.env.NEXT_PUBLIC_CLAUDE_WORKER_URL && process.env.NEXT_PUBLIC_CLAUDE_SHARED_SECRET) {
      providers.push('claude-worker')
    }

    return providers
  }

  /**
   * Check if a provider is available (has required API keys)
   */
  static isProviderAvailable(provider: AIProvider): boolean {
    if (provider.startsWith('mock')) {
      return true
    }

    if (provider.startsWith('openai')) {
      return !!process.env.OPENAI_API_KEY
    }

    if (provider === 'claude-worker') {
      return !!process.env.NEXT_PUBLIC_CLAUDE_WORKER_URL && 
             !!process.env.NEXT_PUBLIC_CLAUDE_SHARED_SECRET
    }

    if (provider.startsWith('claude')) {
      return !!process.env.ANTHROPIC_API_KEY
    }

    return false
  }

  /**
   * Get provider health status
   */
  static async getProviderHealth(provider: AIProvider): Promise<{
    healthy: boolean
    latency?: number
    error?: string
  }> {
    try {
      const service = this.create(provider)
      const startTime = Date.now()

      // Simple health check request
      const testRequest: AIRequest = {
        type: 'health_check',
        content: 'ping',
        domain: 'system'
      }

      await service.processRequest(testRequest)
      
      const latency = Date.now() - startTime
      return { healthy: true, latency }

    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Reset service cache (useful for testing)
   */
  static resetCache(): void {
    serviceCache.clear()
    logger.info('🧹 AI service cache cleared');
  }

  /**
   * Get cached service count (for monitoring)
   */
  static getCacheSize(): number {
    return serviceCache.size
  }

  /**
   * Get provider-specific configuration
   */
  static getProviderConfig(provider: AIProvider): {
    name: string
    type: 'openai' | 'anthropic' | 'mock'
    costTier: 'low' | 'medium' | 'high'
    capabilities: string[]
  } {
    const configs = {
      'openai-gpt4o': {
        name: 'GPT-4o',
        type: 'openai' as const,
        costTier: 'high' as const,
        capabilities: ['text', 'analysis', 'generation', 'reasoning']
      },
      'openai-gpt4o-mini': {
        name: 'GPT-4o Mini',
        type: 'openai' as const,
        costTier: 'medium' as const,
        capabilities: ['text', 'analysis', 'generation']
      },
      'openai-gpt3.5': {
        name: 'GPT-3.5 Turbo',
        type: 'openai' as const,
        costTier: 'low' as const,
        capabilities: ['text', 'generation']
      },
      'claude-opus': {
        name: 'Claude 3 Opus',
        type: 'anthropic' as const,
        costTier: 'high' as const,
        capabilities: ['text', 'analysis', 'reasoning', 'creative']
      },
      'claude-sonnet': {
        name: 'Claude 3 Sonnet',
        type: 'anthropic' as const,
        costTier: 'medium' as const,
        capabilities: ['text', 'analysis', 'generation']
      },
      'claude-haiku': {
        name: 'Claude 3 Haiku',
        type: 'anthropic' as const,
        costTier: 'low' as const,
        capabilities: ['text', 'generation', 'speed']
      },
      'claude-worker': {
        name: 'Claude Worker',
        type: 'anthropic' as const,
        costTier: 'medium' as const,
        capabilities: ['text', 'web_design', 'component_generation', 'ui_modification']
      },
      'mock': {
        name: 'Mock AI',
        type: 'mock' as const,
        costTier: 'low' as const,
        capabilities: ['text', 'development', 'testing']
      },
      'mock-fast': {
        name: 'Mock AI Fast',
        type: 'mock' as const,
        costTier: 'low' as const,
        capabilities: ['text', 'development', 'testing', 'speed']
      },
      'mock-premium': {
        name: 'Mock AI Premium',
        type: 'mock' as const,
        costTier: 'low' as const,
        capabilities: ['text', 'development', 'testing', 'premium']
      }
    }

    return configs[provider] || configs['mock']
  }
}

export default AIServiceFactory