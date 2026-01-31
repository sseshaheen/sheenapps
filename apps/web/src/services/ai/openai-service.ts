import OpenAI from 'openai'
import { RobustJSONParser } from './json-parser'
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

export class OpenAIService {
  private client: OpenAI
  private model: string

  constructor() {
    // Only create client if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
    }
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  }

  async analyzeBusinessIdea(
    idea: string, 
    serviceKey = 'openai-gpt4o-mini'
  ): Promise<AIResponse<BusinessAnalysis>> {
    const startTime = Date.now()
    
    if (!this.client) {
      return {
        success: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OpenAI API key not configured',
          retryable: false
        },
        data: null,
        metadata: {
          model: this.model || 'gpt-4o-mini',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        }
      }
    }
    
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert business analyst. Analyze business ideas and provide structured JSON responses with detailed insights about target market, value propositions, and strategic recommendations.

CRITICAL FORMATTING RULES:
- Respond ONLY with valid JSON
- NO markdown code blocks (no \`\`\`json)
- NO explanations before or after the JSON
- NO additional text
- Start directly with { and end with }
- Ensure all strings are properly quoted
- No trailing commas`
          },
          {
            role: 'user',
            content: `Analyze this business idea: "${idea}"

Provide a JSON response with this exact structure:
{
  "businessType": "saas|ecommerce|service|marketplace|content|consulting|local_business",
  "industry": "Industry name",
  "subCategory": "Specific subcategory",
  "coreOffering": "What the business does",
  "valuePropositions": ["value 1", "value 2", "value 3"],
  "targetAudience": "Primary target audience description",
  "demographics": {
    "ageRange": "age range",
    "income": "income range", 
    "geography": "geographic scope",
    "lifestyle": ["lifestyle 1", "lifestyle 2"]
  },
  "psychographics": {
    "values": ["value 1", "value 2"],
    "interests": ["interest 1", "interest 2"],
    "painPoints": ["pain 1", "pain 2"],
    "motivations": ["motivation 1", "motivation 2"]
  },
  "businessModel": "b2b|b2c|b2b2c|marketplace",
  "revenueModel": "subscription|one_time|freemium|commission|advertising|service_based",
  "geographicScope": "local|regional|national|global",
  "brandPersonality": ["trait 1", "trait 2", "trait 3"],
  "communicationStyle": "formal|casual|technical|emotional|authoritative|friendly",
  "differentiators": ["diff 1", "diff 2"],
  "marketOpportunities": ["opp 1", "opp 2", "opp 3"],
  "challenges": ["challenge 1", "challenge 2"],
  "confidence": 0.85,
  "keyInsights": ["insight 1", "insight 2"],
  "competitiveAdvantages": ["advantage 1", "advantage 2"]
}`
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content received from OpenAI')
      }

      const analysis = RobustJSONParser.parse<BusinessAnalysis>(content)
      const responseTime = Date.now() - startTime

      return {
        success: true,
        data: analysis,
        metadata: {
          model: serviceKey,
          tokensUsed: completion.usage?.total_tokens || 0,
          responseTime,
          confidence: analysis.confidence || 0.8,
          cost: this.calculateCost(completion.usage?.total_tokens || 0)
        }
      }

    } catch (error) {
      logger.error('OpenAI analysis failed:', error);
      throw error
    }
  }

  async *analyzeBusinessIdeaStream(
    idea: string,
    serviceKey = 'openai-gpt4o-mini'
  ): AsyncGenerator<StreamingAIResponse> {
    const startTime = Date.now()
    
    if (!this.client) {
      yield {
        type: 'error',
        content: 'OpenAI API key not configured'
      }
      return
    }
    
    yield { type: 'start', content: 'Connecting to OpenAI...' }
    
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system', 
            content: 'You are an expert business analyst providing real-time insights about business ideas.'
          },
          {
            role: 'user',
            content: `Analyze this business idea step by step: "${idea}"\n\nProvide insights about the business type, target market, and key opportunities.`
          }
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 500
      })

      let content = ''
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          content += delta
          yield {
            type: 'insight',
            content: delta,
            metadata: { confidence: 0.85 }
          }
        }
      }

      yield { type: 'complete', content: 'Analysis complete!' }

    } catch (error) {
      yield { type: 'error', content: 'Analysis failed, switching to backup service...' }
    }
  }

  async generateBusinessNames(
    analysis: BusinessAnalysis,
    serviceKey = 'openai-gpt4o-mini'
  ): Promise<AIResponse<BusinessName[]>> {
    const startTime = Date.now()
    
    if (!this.client) {
      return {
        success: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OpenAI API key not configured',
          retryable: false
        },
        data: null,
        metadata: {
          model: this.model || 'gpt-4o-mini',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        }
      }
    }
    
    let content: string | null = null

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a creative branding expert. Generate unique, memorable business names with detailed reasoning.

CRITICAL FORMATTING RULES:
- Respond ONLY with valid JSON array
- NO markdown code blocks (no \`\`\`json)
- NO explanations before or after the JSON
- NO additional text
- Start directly with [ and end with ]
- Ensure all strings are properly quoted
- No trailing commas`
          },
          {
            role: 'user',
            content: `Create 6 unique business names for:
Industry: ${analysis.industry}
Business Type: ${analysis.businessType}
Brand Personality: ${analysis.brandPersonality.join(', ')}
Target Audience: ${analysis.targetAudience}

Return ONLY this JSON array structure:
[
  {
    "name": "Business Name",
    "reasoning": "Why this name works",
    "brandFit": 0.9,
    "memorability": 0.85,
    "availability": {
      "domain": true,
      "trademark": true,
      "social": {"instagram": true, "twitter": true, "facebook": true}
    },
    "alternatives": ["alt1", "alt2"],
    "tags": ["modern", "memorable"]
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`
          }
        ],
        temperature: 0.8,
        max_tokens: 1200
      })

      content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content received from OpenAI')
      }

      const names = RobustJSONParser.parse<BusinessName[]>(content)
      const responseTime = Date.now() - startTime

      return {
        success: true,
        data: names,
        metadata: {
          model: serviceKey,
          tokensUsed: completion.usage?.total_tokens || 0,
          responseTime,
          cost: this.calculateCost(completion.usage?.total_tokens || 0)
        }
      }

    } catch (error) {
      logger.error('OpenAI name generation failed:', error);
      if (content) {
        logger.error('AI response parsing failed, content length:', content.length)
      }
      throw error
    }
  }

  async generateTaglines(
    analysis: BusinessAnalysis,
    selectedName: string,
    serviceKey = 'openai-gpt4o-mini'
  ): Promise<AIResponse<BusinessTagline[]>> {
    const startTime = Date.now()
    
    if (!this.client) {
      return {
        success: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OpenAI API key not configured',
          retryable: false
        },
        data: null,
        metadata: {
          model: this.model || 'gpt-4o-mini',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        }
      }
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert copywriter creating powerful, memorable taglines that convert.

CRITICAL FORMATTING RULES:
- Respond ONLY with valid JSON array
- NO markdown code blocks (no \`\`\`json)
- NO explanations before or after the JSON
- NO additional text
- Start directly with [ and end with ]
- Ensure all strings are properly quoted
- No trailing commas`
          },
          {
            role: 'user',
            content: `Create 5 compelling taglines for "${selectedName}":
Industry: ${analysis.industry}
Value Propositions: ${analysis.valuePropositions.join(', ')}
Target Audience: ${analysis.targetAudience}
Communication Style: ${analysis.communicationStyle}

Return ONLY this JSON array:
[
  {
    "text": "Tagline text",
    "style": "benefit_focused",
    "psychologicalTrigger": "What triggers this uses",
    "targetEmotion": "Target emotion",
    "wordCount": 4,
    "memorability": 0.9,
    "brandFit": 0.85,
    "explanation": "Why this works"
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`
          }
        ],
        temperature: 0.9,
        max_tokens: 1000
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content received from OpenAI')
      }

      const taglines = RobustJSONParser.parse<BusinessTagline[]>(content)
      const responseTime = Date.now() - startTime

      return {
        success: true,
        data: taglines,
        metadata: {
          model: serviceKey,
          tokensUsed: completion.usage?.total_tokens || 0,
          responseTime,
          cost: this.calculateCost(completion.usage?.total_tokens || 0)
        }
      }

    } catch (error) {
      logger.error('OpenAI tagline generation failed:', error);
      throw error
    }
  }

  async recommendFeatures(
    analysis: BusinessAnalysis,
    serviceKey = 'openai-gpt4o-mini'
  ): Promise<AIResponse<FeatureRecommendation[]>> {
    const startTime = Date.now()
    
    if (!this.client) {
      return {
        success: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OpenAI API key not configured',
          retryable: false
        },
        data: null,
        metadata: {
          model: this.model || 'gpt-4o-mini',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        }
      }
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a product strategist recommending essential features for businesses.'
          },
          {
            role: 'user',
            content: `Recommend 8 features for this ${analysis.businessType} business:
Industry: ${analysis.industry}
Target Audience: ${analysis.targetAudience}
Business Model: ${analysis.businessModel}
Pain Points: ${analysis.psychographics.painPoints.join(', ')}

JSON structure:
[
  {
    "name": "Feature Name",
    "description": "What this feature does",
    "priority": "must_have|should_have|nice_to_have",
    "category": "core|growth|optimization|engagement",
    "complexity": "simple|moderate|complex", 
    "estimatedCost": "low|medium|high",
    "reasoning": "Why important",
    "benefits": ["benefit1", "benefit2"],
    "examples": ["example1", "example2"]
  }
]`
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content received from OpenAI')
      }

      const features = RobustJSONParser.parse<FeatureRecommendation[]>(content)
      const responseTime = Date.now() - startTime

      return {
        success: true,
        data: features,
        metadata: {
          model: serviceKey,
          tokensUsed: completion.usage?.total_tokens || 0,
          responseTime,
          cost: this.calculateCost(completion.usage?.total_tokens || 0)
        }
      }

    } catch (error) {
      logger.error('OpenAI feature recommendation failed:', error);
      throw error
    }
  }

  async generatePricingStrategy(
    analysis: BusinessAnalysis,
    serviceKey = 'openai-gpt4o-mini'
  ): Promise<AIResponse<PricingStrategy>> {
    const startTime = Date.now()
    
    if (!this.client) {
      return {
        success: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OpenAI API key not configured',
          retryable: false
        },
        data: null,
        metadata: {
          model: this.model || 'gpt-4o-mini',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        }
      }
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a pricing strategist creating optimal pricing models for businesses.'
          },
          {
            role: 'user',
            content: `Create pricing strategy for:
Business Type: ${analysis.businessType}
Revenue Model: ${analysis.revenueModel}
Target Audience: ${analysis.targetAudience}
Geographic Scope: ${analysis.geographicScope}
Income Range: ${analysis.demographics.income}

JSON structure:
{
  "model": "freemium|subscription|one_time|usage_based|tiered|custom",
  "tiers": [
    {
      "name": "Tier Name",
      "price": "$99",
      "billingCycle": "monthly|yearly|one_time",
      "description": "Tier description",
      "features": ["feature1", "feature2"],
      "targetSegment": "Who this is for",
      "valueProposition": "Why choose this",
      "popular": false
    }
  ],
  "reasoning": "Why this model",
  "marketPositioning": "budget|value|premium|luxury",
  "competitiveAnalysis": "Market context",
  "recommendations": ["rec1", "rec2"]
}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1200
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content received from OpenAI')
      }

      const pricing = RobustJSONParser.parse<PricingStrategy>(content)
      const responseTime = Date.now() - startTime

      return {
        success: true,
        data: pricing,
        metadata: {
          model: serviceKey,
          tokensUsed: completion.usage?.total_tokens || 0,
          responseTime,
          cost: this.calculateCost(completion.usage?.total_tokens || 0)
        }
      }

    } catch (error) {
      logger.error('OpenAI pricing generation failed:', error);
      throw error
    }
  }

  async generateCompletion(prompt: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured')
    }
    
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })

      return completion.choices[0]?.message?.content || ''
    } catch (error) {
      logger.error('Error generating completion:', error);
      throw error
    }
  }

  async generateSpecBlock(
    userIdea: string,
    serviceKey = 'openai-gpt4o-mini'
  ): Promise<AIResponse<SpecBlock>> {
    const startTime = Date.now()
    
    if (!this.client) {
      return {
        success: false,
        error: {
          code: 'API_KEY_MISSING',
          message: 'OpenAI API key not configured',
          retryable: false
        },
        data: null,
        metadata: {
          model: this.model || 'gpt-4o-mini',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        }
      }
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert at converting free-form business ideas into structured specification blocks. Extract the essential elements and format them cleanly.

CRITICAL FORMATTING RULES:
- Respond ONLY with valid JSON
- NO markdown code blocks (no \`\`\`json)
- NO explanations before or after the JSON
- Start directly with { and end with }`
          },
          {
            role: 'user',
            content: `Convert this business idea into a spec block: "${userIdea}"

Return JSON with EXACTLY these five fields:
{
  "goal": "One sentence describing the main business objective",
  "section_list": "Semicolon-separated list of website sections (e.g., 'Hero; Feature grid; Pricing; Testimonials')",
  "style_tags": "Comma-separated, lowercase single words (e.g., 'modern, minimal, professional')",
  "industry_tag": "Single lowercase word (e.g., 'saas', 'ecommerce', 'consulting')",
  "extra": "Any additional requirements in a concise sentence; empty string if none"
}

Guidelines:
- Make reasonable assumptions if information is missing
- Use 2-4 style tags that match the business personality
- Include standard sections appropriate for the business type
- Keep the goal focused and actionable`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })

      const responseText = completion.choices[0]?.message?.content || ''
      
      // Parse the response
      let parsedResponse: any;
      try {
        parsedResponse = RobustJSONParser.parse<any>(responseText)
      } catch (parseError) {
        logger.error('Failed to parse AI response:', parseError)
        return {
          success: false,
          error: {
            code: 'PARSE_ERROR',
            message: 'Failed to understand the AI response',
            retryable: true
          },
          data: null,
          metadata: {
            model: this.model,
            tokensUsed: completion.usage?.total_tokens || 0,
            responseTime: Date.now() - startTime,
            cost: this.calculateCost(completion.usage?.total_tokens || 0)
          }
        }
      }

      // Check if AI rejected the input
      if (parsedResponse.error) {
        return {
          success: false,
          error: {
            code: 'AI_REJECTED',
            message: parsedResponse.error,
            retryable: false
          },
          data: null,
          metadata: {
            model: this.model,
            tokensUsed: completion.usage?.total_tokens || 0,
            responseTime: Date.now() - startTime,
            cost: this.calculateCost(completion.usage?.total_tokens || 0)
          }
        }
      }

      const tokensUsed = completion.usage?.total_tokens || 0

      return {
        success: true,
        data: parsedResponse as SpecBlock,
        metadata: {
          model: this.model,
          tokensUsed,
          responseTime: Date.now() - startTime,
          confidence: 0.85,
          cost: this.calculateCost(tokensUsed)
        }
      }

    } catch (error) {
      logger.error('Error generating spec block:', error)
      
      return {
        success: false,
        error: {
          code: 'GENERATION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate spec block',
          retryable: true
        },
        data: null,
        metadata: {
          model: this.model,
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        }
      }
    }
  }

  async generateProjectFromSpec(
    specBlock: SpecBlock,
    serviceKey = 'gpt-4o-mini'
  ): Promise<AIResponse<any>> {
    // For now, delegate to Claude Worker Adapter
    // In the future, this could be implemented directly
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Project generation from spec is handled by Claude Worker',
        retryable: false
      },
      data: null,
      metadata: {
        model: serviceKey,
        tokensUsed: 0,
        responseTime: 0,
        cost: 0
      }
    }
  }

  private calculateCost(tokens: number): number {
    // gpt-4o-mini pricing: $0.00015 per 1K input tokens, $0.0006 per 1K output tokens
    // Approximating 70% input, 30% output
    const inputTokens = tokens * 0.7
    const outputTokens = tokens * 0.3
    const inputCost = (inputTokens / 1000) * 0.00015
    const outputCost = (outputTokens / 1000) * 0.0006
    return inputCost + outputCost
  }
}