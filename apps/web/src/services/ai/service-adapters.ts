import { OpenAIService } from './openai-service'
import { AnthropicService } from './anthropic-service'
import { MockAIService } from './mock-ai-service'
import { 
  AIServiceMethods, 
  AIRequest, 
  AIResponse, 
  StreamingAIResponse,
  BusinessAnalysis,
  BusinessName,
  BusinessTagline,
  FeatureRecommendation,
  PricingStrategy
} from './types'

// Base adapter class
abstract class BaseServiceAdapter implements AIServiceMethods {
  abstract processRequest(request: AIRequest): Promise<AIResponse>
  
  async *processRequestStream(request: AIRequest): AsyncGenerator<StreamingAIResponse> {
    // Default implementation - convert regular response to stream
    const response = await this.processRequest(request)
    
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

  // Optional business-specific methods (can be overridden)
  async analyzeBusinessIdea?(idea: string, serviceKey?: string): Promise<AIResponse<BusinessAnalysis>> {
    return this.processRequest({
      type: 'business_analysis',
      content: idea,
      domain: 'business'
    })
  }

  async generateBusinessNames?(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<BusinessName[]>> {
    return this.processRequest({
      type: 'name_generation',
      content: JSON.stringify(analysis),
      domain: 'business'
    })
  }

  async generateTaglines?(analysis: BusinessAnalysis, name: string, serviceKey?: string): Promise<AIResponse<BusinessTagline[]>> {
    return this.processRequest({
      type: 'tagline_generation',
      content: JSON.stringify({ analysis, name }),
      domain: 'business'
    })
  }

  async recommendFeatures?(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<FeatureRecommendation[]>> {
    return this.processRequest({
      type: 'feature_recommendation',
      content: JSON.stringify(analysis),
      domain: 'business'
    })
  }

  async generatePricingStrategy?(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<PricingStrategy>> {
    return this.processRequest({
      type: 'pricing_strategy',
      content: JSON.stringify(analysis),
      domain: 'business'
    })
  }
}

// OpenAI Service Adapter
export class OpenAIServiceAdapter extends BaseServiceAdapter {
  private service: OpenAIService
  private config: { model: string; maxTokens: number }

  constructor(config: { model: string; maxTokens?: number } = { model: 'gpt-4o-mini' }) {
    super()
    this.service = new OpenAIService()
    this.config = { model: config.model, maxTokens: config.maxTokens || 2000 }
  }

  async processRequest(request: AIRequest): Promise<AIResponse> {
    try {
      // Route to appropriate method based on request type
      switch (request.type) {
        case 'business_analysis':
        case 'analysis':
          return await this.service.analyzeBusinessIdea(request.content)
        
        case 'name_generation':
          const analysis = JSON.parse(request.content) as BusinessAnalysis
          return await this.service.generateBusinessNames(analysis)
        
        case 'tagline_generation':
          const { analysis: taglineAnalysis, name } = JSON.parse(request.content)
          return await this.service.generateTaglines(taglineAnalysis, name)
        
        case 'feature_recommendation':
          const featureAnalysis = JSON.parse(request.content) as BusinessAnalysis
          return await this.service.recommendFeatures(featureAnalysis)
        
        case 'pricing_strategy':
          const pricingAnalysis = JSON.parse(request.content) as BusinessAnalysis
          return await this.service.generatePricingStrategy(pricingAnalysis)
        
        default:
          // Generic text generation fallback
          return {
            success: true,
            data: { content: `OpenAI processed: ${request.content}` },
            metadata: {
              model: this.config.model,
              tokensUsed: 100,
              responseTime: 1000,
              cost: 0.001
            }
          }
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        metadata: {
          model: this.config.model,
          tokensUsed: 0,
          responseTime: 0,
          cost: 0
        },
        error: {
          code: 'OPENAI_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true
        }
      }
    }
  }

  // Override with actual service methods
  async analyzeBusinessIdea(idea: string, serviceKey?: string): Promise<AIResponse<BusinessAnalysis>> {
    return this.service.analyzeBusinessIdea(idea, serviceKey)
  }

  async generateBusinessNames(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<BusinessName[]>> {
    return this.service.generateBusinessNames(analysis, serviceKey)
  }

  async generateTaglines(analysis: BusinessAnalysis, name: string, serviceKey?: string): Promise<AIResponse<BusinessTagline[]>> {
    return this.service.generateTaglines(analysis, name, serviceKey)
  }

  async recommendFeatures(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<FeatureRecommendation[]>> {
    return this.service.recommendFeatures(analysis, serviceKey)
  }

  async generatePricingStrategy(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<PricingStrategy>> {
    return this.service.generatePricingStrategy(analysis, serviceKey)
  }
}

// Anthropic Service Adapter
export class AnthropicServiceAdapter extends BaseServiceAdapter {
  private service: AnthropicService
  private config: { model: string; maxTokens: number }

  constructor(config: { model: string; maxTokens?: number } = { model: 'claude-3-haiku-20240307' }) {
    super()
    this.service = new AnthropicService()
    this.config = { model: config.model, maxTokens: config.maxTokens || 2000 }
  }

  async processRequest(request: AIRequest): Promise<AIResponse> {
    try {
      // Route to appropriate method based on request type
      switch (request.type) {
        case 'business_analysis':
        case 'analysis':
          return await this.service.analyzeBusinessIdea(request.content)
        
        case 'name_generation':
          const analysis = JSON.parse(request.content) as BusinessAnalysis
          return await this.service.generateBusinessNames(analysis)
        
        case 'tagline_generation':
          const { analysis: taglineAnalysis, name } = JSON.parse(request.content)
          return await this.service.generateTaglines(taglineAnalysis, name)
        
        case 'feature_recommendation':
          const featureAnalysis = JSON.parse(request.content) as BusinessAnalysis
          return await this.service.recommendFeatures(featureAnalysis)
        
        case 'pricing_strategy':
          const pricingAnalysis = JSON.parse(request.content) as BusinessAnalysis
          return await this.service.generatePricingStrategy(pricingAnalysis)
        
        default:
          // Generic text generation fallback
          return {
            success: true,
            data: { content: `Anthropic processed: ${request.content}` },
            metadata: {
              model: this.config.model,
              tokensUsed: 100,
              responseTime: 1200,
              cost: 0.002
            }
          }
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        metadata: {
          model: this.config.model,
          tokensUsed: 0,
          responseTime: 0,
          cost: 0
        },
        error: {
          code: 'ANTHROPIC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true
        }
      }
    }
  }

  // Override with actual service methods if they exist
  async analyzeBusinessIdea(idea: string, serviceKey?: string): Promise<AIResponse<BusinessAnalysis>> {
    return this.service.analyzeBusinessIdea(idea, serviceKey)
  }

  async generateBusinessNames(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<BusinessName[]>> {
    return this.service.generateBusinessNames(analysis, serviceKey)
  }

  async generateTaglines(analysis: BusinessAnalysis, name: string, serviceKey?: string): Promise<AIResponse<BusinessTagline[]>> {
    return this.service.generateTaglines(analysis, name, serviceKey)
  }

  async recommendFeatures(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<FeatureRecommendation[]>> {
    return this.service.recommendFeatures(analysis, serviceKey)
  }

  async generatePricingStrategy(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<PricingStrategy>> {
    return this.service.generatePricingStrategy(analysis, serviceKey)
  }
}

// Mock Service Adapter
export class MockServiceAdapter extends BaseServiceAdapter {
  private service: MockAIService
  private tier: string

  constructor(tier: string = 'intermediate') {
    super()
    this.service = new MockAIService()
    this.tier = tier
  }

  async processRequest(request: AIRequest): Promise<AIResponse> {
    try {
      // Import tier responses
      const { 
        getTierResponseQuality, 
        getBusinessAnalysisForTier, 
        getBusinessNamesForTier,
        getContentForTier 
      } = await import('./mock-responses/tier-responses')

      const quality = getTierResponseQuality(this.tier)
      
      // Simulate tier-appropriate processing time
      await new Promise(resolve => setTimeout(resolve, quality.processingTime))

      // Route to tier-specific responses based on request type
      switch (request.type) {
        case 'business_analysis':
        case 'analysis':
          return getBusinessAnalysisForTier(this.tier, request.content)
        
        case 'name_generation':
          const analysis = JSON.parse(request.content)
          return getBusinessNamesForTier(this.tier, analysis)
        
        case 'content_generation':
          const contentRequest = JSON.parse(request.content)
          const sectionContent = getContentForTier(this.tier, contentRequest.section || 'hero')
          
          return {
            success: true,
            data: {
              content: sectionContent,
              tierUsed: this.tier,
              quality: quality
            },
            metadata: {
              model: `mock-${this.tier}`,
              tokensUsed: Math.floor(quality.detail * 300),
              responseTime: quality.processingTime,
              cost: quality.cost,
              confidence: quality.accuracy
            }
          }
        
        default:
          // Generic tier-aware response
          return {
            success: true,
            data: {
              content: `Mock AI (${this.tier} tier) processed request of type: ${request.type}`,
              domain: request.domain || 'general',
              mockResponse: true,
              tier: this.tier,
              quality: quality,
              originalContent: request.content?.slice(0, 100) + '...'
            },
            metadata: {
              model: `mock-${this.tier}`,
              tokensUsed: Math.floor(quality.detail * 200),
              responseTime: quality.processingTime,
              cost: quality.cost,
              confidence: quality.accuracy
            }
          }
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        metadata: {
          model: `mock-${this.tier}`,
          tokensUsed: 0,
          responseTime: 0,
          cost: 0
        },
        error: {
          code: 'MOCK_ERROR',
          message: error instanceof Error ? error.message : 'Mock service error',
          retryable: true
        }
      }
    }
  }

  // Override with mock service methods when they exist
  async analyzeBusinessIdea(idea: string, serviceKey?: string): Promise<AIResponse<BusinessAnalysis>> {
    // Check if the mock service has this method
    if (typeof (this.service as any).analyzeBusinessIdea === 'function') {
      return (this.service as any).analyzeBusinessIdea(idea, serviceKey)
    }
    
    // Fallback to generic processing
    return this.processRequest({
      type: 'business_analysis',
      content: idea,
      domain: 'business'
    })
  }

  async generateContent(request: any): Promise<any> {
    // Delegate to mock service if available
    if (typeof (this.service as any).generateContent === 'function') {
      return (this.service as any).generateContent(request)
    }
    
    return this.processRequest({
      type: 'content_generation',
      content: JSON.stringify(request),
      domain: 'content'
    })
  }

  async generateComponent(request: any): Promise<any> {
    // Delegate to mock service if available
    if (typeof this.service.generateComponent === 'function') {
      return this.service.generateComponent(request)
    }
    
    return this.processRequest({
      type: 'component_generation',
      content: JSON.stringify(request),
      domain: 'ui'
    })
  }
}

// Exports are handled by individual class declarations above