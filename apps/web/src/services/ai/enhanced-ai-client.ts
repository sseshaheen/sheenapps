// Enhanced AI Client - Production-ready client for AI services
// This client provides a clean interface for AI operations
// Currently uses internal mock endpoints, will switch to real AI later

import { 
  AIComponentRequest, 
  AIComponentResponse, 
  AIContentRequest, 
  AIContentResponse,
  AILayoutRequest,
  AILayoutResponse,
  AIIntegrationRequest,
  AIIntegrationResponse 
} from './mock-responses/types'
import { createApiUrl } from '@/lib/api-utils'
import { logger } from '@/utils/logger';

export interface AIClientConfig {
  baseUrl?: string
  timeout?: number
  retryAttempts?: number
  apiKey?: string
  model?: string
  enableCaching?: boolean
}

export class EnhancedAIClient {
  private config: Required<AIClientConfig>
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map()

  constructor(config: Partial<AIClientConfig> = {}) {
    this.config = {
      baseUrl: '', // We'll use createApiUrl for each request instead
      timeout: 30000, // 30 seconds
      retryAttempts: 3,
      apiKey: process.env.AI_API_KEY || 'mock-key',
      model: process.env.AI_MODEL || 'mock-ai-v1',
      enableCaching: true,
      ...config
    }
  }

  // ===== COMPONENT OPERATIONS =====

  async generateComponent(request: AIComponentRequest): Promise<AIComponentResponse> {
    console.log('🤖 Enhanced AI Client: Generating component:', {
      type: request.componentType,
      businessType: request.businessContext.type,
      intent: request.userIntent.substring(0, 50) + '...'
    })

    const cacheKey = this.buildCacheKey('component', request)
    
    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        logger.info('📦 Cache hit for component generation');
        return cached
      }
    }

    const enhancedRequest = {
      ...request,
      type: 'generate' as const,
      metadata: {
        clientVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        model: this.config.model
      }
    }

    const response = await this.makeRequest<AIComponentResponse>(
      '/api/ai/components',
      enhancedRequest
    )

    // Cache successful responses
    if (response.success && this.config.enableCaching) {
      this.setCache(cacheKey, response, 30 * 60 * 1000) // 30 minutes
    }

    return response
  }

  async modifyComponent(
    currentComponent: any, 
    userIntent: string, 
    businessContext: any
  ): Promise<AIComponentResponse> {
    console.log('🤖 Enhanced AI Client: Modifying component:', {
      componentType: currentComponent.type,
      intent: userIntent.substring(0, 50) + '...'
    })

    const request: AIComponentRequest = {
      type: 'modify',
      componentType: currentComponent.type,
      userIntent,
      businessContext,
      currentComponent
    }

    return this.makeRequest<AIComponentResponse>('/api/ai/components', request)
  }

  async enhanceComponent(
    currentComponent: any, 
    enhancements: string[], 
    businessContext: any
  ): Promise<AIComponentResponse> {
    console.log('🤖 Enhanced AI Client: Enhancing component:', {
      componentType: currentComponent.type,
      enhancements
    })

    const request: AIComponentRequest = {
      type: 'enhance',
      componentType: currentComponent.type,
      userIntent: `Add the following enhancements: ${enhancements.join(', ')}`,
      businessContext,
      currentComponent
    }

    return this.makeRequest<AIComponentResponse>('/api/ai/components', request)
  }

  // ===== CONTENT OPERATIONS =====

  async generateContent(request: AIContentRequest): Promise<AIContentResponse> {
    console.log('🤖 Enhanced AI Client: Generating content:', {
      type: request.type,
      section: request.section,
      tone: request.tone,
      businessType: request.businessContext.type
    })

    const cacheKey = this.buildCacheKey('content', request)
    
    if (this.config.enableCaching) {
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        logger.info('📦 Cache hit for content generation');
        return cached
      }
    }

    const enhancedRequest = {
      ...request,
      metadata: {
        clientVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        model: this.config.model
      }
    }

    const response = await this.makeRequest<AIContentResponse>(
      '/api/ai/content',
      enhancedRequest
    )

    if (response.success && this.config.enableCaching) {
      this.setCache(cacheKey, response, 15 * 60 * 1000) // 15 minutes
    }

    return response
  }

  async generateCopy(
    section: string, 
    businessContext: any, 
    options: {
      tone?: string
      length?: 'short' | 'medium' | 'long'
      keywords?: string[]
      callToAction?: string
    } = {}
  ): Promise<AIContentResponse> {
    const request: AIContentRequest = {
      type: 'copy',
      section,
      tone: options.tone || 'professional',
      length: options.length || 'medium',
      businessContext,
      requirements: {
        includeKeywords: options.keywords,
        callToAction: options.callToAction
      }
    }

    return this.generateContent(request)
  }

  async generateHeadlines(
    section: string, 
    businessContext: any, 
    count: number = 3
  ): Promise<string[]> {
    const request: AIContentRequest = {
      type: 'headlines',
      section,
      tone: 'engaging',
      length: 'short',
      businessContext
    }

    const response = await this.generateContent(request)
    
    if (response.success) {
      return [
        response.content.primary,
        ...response.content.alternatives.slice(0, count - 1)
      ]
    }

    return []
  }

  // ===== LAYOUT OPERATIONS =====

  async generateLayout(request: AILayoutRequest): Promise<AILayoutResponse> {
    console.log('🤖 Enhanced AI Client: Generating layout:', {
      businessType: request.businessType,
      personality: request.personality,
      sections: request.sections
    })

    // Note: Layout endpoint not implemented yet, using mock service directly
    const { MockAIService } = await import('./mock-ai-service')
    const mockAI = new MockAIService()
    
    return mockAI.generateLayout(request)
  }

  // ===== INTEGRATION OPERATIONS =====

  async recommendIntegrations(request: AIIntegrationRequest): Promise<AIIntegrationResponse> {
    console.log('🤖 Enhanced AI Client: Recommending integrations:', {
      businessType: request.businessType,
      features: request.features,
      budget: request.budget
    })

    // Note: Integration endpoint not implemented yet, using mock service directly
    const { MockAIService } = await import('./mock-ai-service')
    const mockAI = new MockAIService()
    
    return mockAI.recommendIntegrations(request)
  }

  // ===== HELPER METHODS =====

  private async makeRequest<T>(endpoint: string, data: any): Promise<T> {
    const url = createApiUrl(endpoint)
    
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        logger.info(`🔄 AI Request attempt ${attempt}/${this.config.retryAttempts}: ${endpoint}`);
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
            'X-AI-Model': this.config.model
          },
          body: JSON.stringify(data),
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }
        
        const result = await response.json()
        
        logger.info(`✅ AI Request successful: ${endpoint}`);
        return result
        
      } catch (error) {
        lastError = error as Error
        logger.warn(`⚠️ AI Request attempt ${attempt} failed:`, error.message);
        
        // Don't retry on certain errors
        if (error.name === 'AbortError' || (error as any).status === 400) {
          break
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < this.config.retryAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    throw new Error(`AI request failed after ${this.config.retryAttempts} attempts: ${lastError?.message}`)
  }

  private buildCacheKey(operation: string, request: any): string {
    // Create a hash-like key from the request
    const keyData = {
      operation,
      ...request
    }
    
    return `ai_${operation}_${this.hashObject(keyData)}`
  }

  private hashObject(obj: any): string {
    // Simple hash function for cache keys
    const str = JSON.stringify(obj, Object.keys(obj).sort())
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    if (Date.now() > cached.timestamp + cached.ttl) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
    
    // Cleanup old entries
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }
  }

  // ===== UTILITY METHODS =====

  async getServiceStatus(): Promise<any> {
    try {
      const response = await fetch(createApiUrl('/api/ai/components?action=status'))
      return await response.json()
    } catch (error) {
      logger.error('Failed to get AI service status:', error);
      return { status: 'unavailable', error: error.message }
    }
  }

  clearCache(): void {
    this.cache.clear()
    logger.info('🧹 AI Client cache cleared');
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

// Export singleton instance
export const aiClient = new EnhancedAIClient()