import { OpenAIService } from './openai-service'
import { AnthropicService } from './anthropic-service'
import { MockAIService } from './mock-service'
import { aiCache } from './cache-service'
import { StreamProcessor } from './stream-processor'
import { logger } from '@/utils/logger';
import { 
  AIResponse, 
  StreamingAIResponse, 
  BusinessAnalysis, 
  BusinessName, 
  BusinessTagline, 
  FeatureRecommendation, 
  PricingStrategy 
} from './types'
import { SpecBlock } from '@/types/spec-block'

export class RealAIService {
  private openai: OpenAIService
  private anthropic: AnthropicService
  private mock: MockAIService
  private useRealAI: boolean
  
  // Known prompts that our mock service handles well
  private readonly KNOWN_PROMPTS = [
    'I want to sell homemade cookies online',
    'I need a booking app for my salon',
    'Create an e-commerce store for handmade jewelry',
    'Build a food delivery app for my restaurant'
  ]

  constructor() {
    this.openai = new OpenAIService()
    this.anthropic = new AnthropicService()
    this.mock = new MockAIService()
    
    // Use real AI if API keys are available
    this.useRealAI = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY)
  }
  
  // Check if the user's prompt closely matches any known prompt
  private isKnownPrompt(userInput: string): boolean {
    const normalizedInput = userInput.trim().toLowerCase()
    
    // Check for exact or very close matches
    return this.KNOWN_PROMPTS.some(knownPrompt => {
      const normalizedKnown = knownPrompt.toLowerCase()
      
      // Exact match
      if (normalizedInput === normalizedKnown) return true
      
      // Close match with minor variations (punctuation, capitalization)
      const cleanInput = normalizedInput.replace(/[.,!?;:]/g, '').trim()
      const cleanKnown = normalizedKnown.replace(/[.,!?;:]/g, '').trim()
      
      if (cleanInput === cleanKnown) return true
      
      // Very close match (within 5 character edits)
      const distance = this.levenshteinDistance(cleanInput, cleanKnown)
      return distance <= 5
    })
  }
  
  // Simple Levenshtein distance for fuzzy matching
  private levenshteinDistance(str1: string, str2: string): number {
    const track = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null))
    
    for (let i = 0; i <= str1.length; i += 1) {
      track[0][i] = i
    }
    
    for (let j = 0; j <= str2.length; j += 1) {
      track[j][0] = j
    }
    
    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
        track[j][i] = Math.min(
          track[j][i - 1] + 1, // deletion
          track[j - 1][i] + 1, // insertion
          track[j - 1][i - 1] + indicator // substitution
        )
      }
    }
    
    return track[str2.length][str1.length]
  }

  // Check if a spec block came from a known prompt based on its content
  private isKnownSpecBlock(specBlock: SpecBlock): boolean {
    // Define exact known spec block patterns that our mock service handles
    const knownSpecPatterns = [
      {
        goal: 'to streamline salon appointments with an elegant online booking system for clients',
        industry: 'services'
      },
      {
        goal: 'to sell homemade cookies online with a beautiful storefront and ordering system',
        industry: 'food'
      },
      {
        goal: 'to create an online store for handmade jewelry with custom design options',
        industry: 'fashion'
      },
      {
        goal: 'to build a food delivery app for restaurants with real-time order tracking',
        industry: 'food'
      }
    ]
    
    // Normalize the spec block goal for comparison
    const normalizedGoal = specBlock.goal?.toLowerCase().trim() || ''
    const normalizedIndustry = specBlock.industry_tag?.toLowerCase().trim() || ''
    
    // Check for exact matches only
    return knownSpecPatterns.some(pattern => {
      const goalMatch = normalizedGoal === pattern.goal.toLowerCase()
      const industryMatch = normalizedIndustry === pattern.industry.toLowerCase()
      return goalMatch && industryMatch
    })
  }

  async analyzeBusinessIdea(
    idea: string,
    serviceKey = 'auto',
    locale?: string // NEW: locale parameter for i18n support
  ): Promise<AIResponse<BusinessAnalysis>> {
    // Check cache first (include locale in cache key for language-specific results)
    const cacheKey = 'analysis'
    const cacheInput = locale ? `${idea}:${locale}` : idea
    const cached = aiCache.get<AIResponse<BusinessAnalysis>>(cacheKey, cacheInput, serviceKey)
    if (cached) {
      logger.info('📦 Using cached analysis for:', idea.slice(0, 50) + '...')
      return cached
    }

    // Check if this is a known prompt that our mock service handles well
    const isKnown = this.isKnownPrompt(idea)

    // Check if we should force mock service for known prompts (default: true)
    const useMockForKnownPrompts = process.env.USE_MOCK_FOR_KNOWN_PROMPTS !== 'false'

    // Use mock service for known prompts to save costs
    if ((isKnown && useMockForKnownPrompts) || !this.useRealAI) {
      if (isKnown && this.useRealAI) {
        logger.info('✅ Using FREE mock service for known business prompt analysis - no API costs!')
      }
      const result = await this.mock.analyzeBusinessIdea(idea, serviceKey)
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      return result
    }

    try {
      let result: AIResponse<BusinessAnalysis>

      // Prefer Claude for analysis (better reasoning)
      if (process.env.ANTHROPIC_API_KEY && serviceKey !== 'openai-gpt4o-mini') {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('💰 WARNING: Using PAID AI service (Anthropic/Claude) for business analysis. This will incur costs!')
        }
        result = await this.anthropic.analyzeBusinessIdea(idea, 'claude-3-5-haiku', locale)
      } else if (process.env.OPENAI_API_KEY) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('💰 WARNING: Using PAID AI service (OpenAI) for business analysis. This will incur costs!')
        }
        result = await this.openai.analyzeBusinessIdea(idea, 'openai-gpt4o-mini')
      } else {
        throw new Error('No AI services available')
      }

      // Cache successful result
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      logger.info('💾 Cached new analysis for:', idea.slice(0, 50) + '...')
      return result

    } catch (error) {
      logger.warn('Real AI failed, falling back to mock:', error);
      const result = await this.mock.analyzeBusinessIdea(idea, serviceKey)
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      return result
    }
  }

  async *analyzeBusinessIdeaStream(
    idea: string,
    serviceKey = 'auto'
  ): AsyncGenerator<StreamingAIResponse> {
    const processor = new StreamProcessor()
    
    if (!this.useRealAI) {
      const mockStream = this.mock.analyzeBusinessIdeaStream(idea, serviceKey)
      yield* processor.processRawStream(mockStream, idea)
      return
    }

    try {
      let rawStream: AsyncGenerator<StreamingAIResponse>
      
      // Prefer Claude for streaming analysis
      if (process.env.ANTHROPIC_API_KEY && serviceKey !== 'openai-gpt4o-mini') {
        rawStream = this.anthropic.analyzeBusinessIdeaStream(idea, 'claude-3-5-haiku')
      } else if (process.env.OPENAI_API_KEY) {
        rawStream = this.openai.analyzeBusinessIdeaStream(idea, 'openai-gpt4o-mini')
      } else {
        throw new Error('No AI services available')
      }
      
      // Process raw stream into clean, structured responses
      yield* processor.processRawStream(rawStream, idea)
      
    } catch (error) {
      logger.warn('Real AI streaming failed, falling back to mock:', error);
      const mockStream = this.mock.analyzeBusinessIdeaStream(idea, serviceKey)
      yield* processor.processRawStream(mockStream, idea)
    }
  }

  async generateBusinessNames(
    analysis: BusinessAnalysis,
    serviceKey = 'auto',
    locale?: string
  ): Promise<AIResponse<BusinessName[]>> {
    // Check cache first (use industry + business type + locale as key for names)
    const cacheKey = 'names'
    const localeSuffix = locale ? `:${locale}` : ''
    const cacheInput = `${analysis.industry}-${analysis.businessType}-${analysis.brandPersonality.join(',')}${localeSuffix}`
    const cached = aiCache.get<AIResponse<BusinessName[]>>(cacheKey, cacheInput, serviceKey)
    if (cached) {
      logger.info('📦 Using cached names for:', analysis.industry)
      return cached
    }

    if (!this.useRealAI) {
      const result = await this.mock.generateBusinessNames(analysis, serviceKey)
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      return result
    }

    try {
      let result: AIResponse<BusinessName[]>

      // Prefer OpenAI for creative naming (better creativity)
      if (process.env.OPENAI_API_KEY && serviceKey !== 'claude-3-5-haiku') {
        result = await this.openai.generateBusinessNames(analysis, 'openai-gpt4o-mini')
      } else if (process.env.ANTHROPIC_API_KEY) {
        result = await this.anthropic.generateBusinessNames(analysis, 'claude-3-5-haiku', locale)
      } else {
        throw new Error('No AI services available')
      }

      // Cache successful result
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      logger.info('💾 Cached new names for:', analysis.industry)
      return result

    } catch (error) {
      logger.warn('Real AI failed, falling back to mock:', error);
      const result = await this.mock.generateBusinessNames(analysis, serviceKey)
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      return result
    }
  }

  async generateTaglines(
    analysis: BusinessAnalysis,
    selectedName: string,
    serviceKey = 'auto',
    locale?: string
  ): Promise<AIResponse<BusinessTagline[]>> {
    if (!this.useRealAI) {
      return this.mock.generateTaglines(analysis, selectedName, serviceKey)
    }

    try {
      // Prefer OpenAI for copywriting
      if (process.env.OPENAI_API_KEY && serviceKey !== 'claude-3-5-haiku') {
        return await this.openai.generateTaglines(analysis, selectedName, 'openai-gpt4o-mini')
      }

      // Fallback to Claude
      if (process.env.ANTHROPIC_API_KEY) {
        return await this.anthropic.generateTaglines(analysis, selectedName, 'claude-3-5-haiku', locale)
      }

      throw new Error('No AI services available')

    } catch (error) {
      logger.warn('Real AI failed, falling back to mock:', error);
      return this.mock.generateTaglines(analysis, selectedName, serviceKey)
    }
  }

  async recommendFeatures(
    analysis: BusinessAnalysis,
    serviceKey = 'auto',
    locale?: string
  ): Promise<AIResponse<FeatureRecommendation[]>> {
    if (!this.useRealAI) {
      return this.mock.recommendFeatures(analysis, serviceKey)
    }

    try {
      // Prefer Claude for feature analysis (better reasoning)
      if (process.env.ANTHROPIC_API_KEY && serviceKey !== 'openai-gpt4o-mini') {
        return await this.anthropic.recommendFeatures(analysis, 'claude-3-5-haiku', locale)
      }

      // Fallback to OpenAI
      if (process.env.OPENAI_API_KEY) {
        return await this.openai.recommendFeatures(analysis, 'openai-gpt4o-mini')
      }

      throw new Error('No AI services available')

    } catch (error) {
      logger.warn('Real AI failed, falling back to mock:', error);
      return this.mock.recommendFeatures(analysis, serviceKey)
    }
  }

  async generatePricingStrategy(
    analysis: BusinessAnalysis,
    serviceKey = 'auto',
    locale?: string
  ): Promise<AIResponse<PricingStrategy>> {
    if (!this.useRealAI) {
      return this.mock.generatePricingStrategy(analysis, serviceKey)
    }

    try {
      // Prefer Claude for strategic pricing (better analysis)
      if (process.env.ANTHROPIC_API_KEY && serviceKey !== 'openai-gpt4o-mini') {
        return await this.anthropic.generatePricingStrategy(analysis, 'claude-3-5-haiku', locale)
      }

      // Fallback to OpenAI
      if (process.env.OPENAI_API_KEY) {
        return await this.openai.generatePricingStrategy(analysis, 'openai-gpt4o-mini')
      }

      throw new Error('No AI services available')

    } catch (error) {
      logger.warn('Real AI failed, falling back to mock:', error);
      return this.mock.generatePricingStrategy(analysis, serviceKey)
    }
  }

  async generateSpecBlock(
    userIdea: string,
    serviceKey = 'auto',
    locale?: string
  ): Promise<AIResponse<SpecBlock>> {
    // Check cache first (include locale in cache key)
    const cacheKey = 'spec_block'
    const cacheInput = locale ? `${userIdea}:${locale}` : userIdea
    const cached = aiCache.get<AIResponse<SpecBlock>>(cacheKey, cacheInput, serviceKey)
    if (cached) {
      logger.info('📦 Using cached spec block for:', userIdea.slice(0, 50) + '...')
      return cached
    }

    // Check if this is a known prompt that our mock service handles well
    const isKnown = this.isKnownPrompt(userIdea)

    // Check if we should force mock service for known prompts (default: true)
    const useMockForKnownPrompts = process.env.USE_MOCK_FOR_KNOWN_PROMPTS !== 'false'

    // Use mock service for known prompts to save costs
    if ((isKnown && useMockForKnownPrompts) || !this.useRealAI) {
      if (isKnown && this.useRealAI) {
        logger.info('✅ Using FREE mock service for known business prompt - no API costs!')
      }
      const result = await this.mock.generateSpecBlock(userIdea, serviceKey)
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      return result
    }

    try {
      let result: AIResponse<SpecBlock>

      // Prefer Claude for spec generation (better structured output)
      if (process.env.ANTHROPIC_API_KEY && serviceKey !== 'openai-gpt4o-mini') {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('💰 WARNING: Using PAID AI service (Anthropic/Claude) for spec generation. This will incur costs!')
        }
        result = await this.anthropic.generateSpecBlock(userIdea, 'claude-3-5-haiku', locale)
      } else if (process.env.OPENAI_API_KEY) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('💰 WARNING: Using PAID AI service (OpenAI) for spec generation. This will incur costs!')
        }
        result = await this.openai.generateSpecBlock(userIdea, 'openai-gpt4o-mini')
      } else {
        throw new Error('No AI services available')
      }

      // Cache successful result
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      logger.info('💾 Cached new spec block for:', userIdea.slice(0, 50) + '...')
      return result

    } catch (error) {
      logger.warn('Real AI failed, falling back to mock:', error);
      const result = await this.mock.generateSpecBlock(userIdea, serviceKey)
      aiCache.set(cacheKey, cacheInput, serviceKey, result)
      return result
    }
  }

  async generateProjectFromSpec(
    specBlock: SpecBlock,
    serviceKey = 'auto'
  ): Promise<AIResponse<any>> {
    if (!this.useRealAI) {
      return this.mock.generateProjectFromSpec(specBlock, serviceKey)
    }

    // Check if this spec block came from a known prompt based on its content
    const isKnownSpec = this.isKnownSpecBlock(specBlock)
    const useMockForKnownPrompts = process.env.USE_MOCK_FOR_KNOWN_PROMPTS !== 'false'
    
    // Use mock service for known spec blocks to save costs and provide instant response
    if (isKnownSpec && useMockForKnownPrompts) {
      logger.info('✅ Using FREE mock service for known spec block - no API costs!')
      return this.mock.generateProjectFromSpec(specBlock, serviceKey)
    }

    try {
      // Claude Worker has been replaced by Worker API
      // Template generation now happens via Worker API in project creation flow
      
      // Fallback to Anthropic if Claude Worker not available
      if (process.env.ANTHROPIC_API_KEY) {
        return await this.anthropic.generateProjectFromSpec(specBlock, 'claude-3-5-haiku')
      }
      
      // Final fallback to OpenAI
      if (process.env.OPENAI_API_KEY) {
        return await this.openai.generateProjectFromSpec(specBlock, 'openai-gpt4o-mini')
      }
      
      throw new Error('No AI services available for template generation')
      
    } catch (error) {
      logger.warn('Real AI failed for template generation, falling back to mock:', error);
      return this.mock.generateProjectFromSpec(specBlock, serviceKey)
    }
  }

  async generateCompletion(
    prompt: string,
    serviceKey = 'auto'
  ): Promise<string> {
    if (!this.useRealAI) {
      // Return a mock completion for development
      return 'Mock completion response';
    }

    try {
      // Prefer Claude for text generation
      if (process.env.ANTHROPIC_API_KEY && serviceKey !== 'openai-gpt4o-mini') {
        return await this.anthropic.generateCompletion(prompt)
      }
      
      // Fallback to OpenAI
      if (process.env.OPENAI_API_KEY) {
        return await this.openai.generateCompletion(prompt)
      }
      
      throw new Error('No AI services available')
      
    } catch (error) {
      logger.warn('Real AI completion failed, returning fallback:', error);
      return 'Unable to generate completion at this time.';
    }
  }

  getServiceStatus(): { useRealAI: boolean; availableServices: string[] } {
    const availableServices = []
    
    if (process.env.OPENAI_API_KEY) {
      availableServices.push('openai-gpt4o-mini')
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      availableServices.push('claude-3-5-haiku')
    }
    
    if (availableServices.length === 0) {
      availableServices.push('mock-service')
    }

    return {
      useRealAI: this.useRealAI,
      availableServices
    }
  }
}