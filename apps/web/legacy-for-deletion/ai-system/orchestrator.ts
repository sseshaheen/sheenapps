import { 
  BusinessAnalysis, 
  BusinessName, 
  BusinessTagline, 
  FeatureRecommendation, 
  PricingStrategy,
  ContentStrategy,
  GeneratedBusinessContent,
  StreamingAIResponse,
  AIResponse,
  UserContext
} from './types'
import { SpecBlock, SpecBlockGenerationResult } from '@/types/spec-block'
import { ServiceSelector, UsageTracker } from './service-registry'
import { PromptEngine } from './prompt-engine'
import { RealAIService } from './real-ai-service'
import { ClientAIService } from './client-ai-service'
import { AIResponseProcessor, ContentQualityScorer } from './response-processor'
import { logger } from '@/utils/logger';

export class AIOrchestrator {
  private promptEngine: PromptEngine
  private aiService: RealAIService | ClientAIService
  private responseProcessor: AIResponseProcessor
  private qualityScorer: ContentQualityScorer
  private userContext: UserContext

  constructor(userContext?: UserContext) {
    this.promptEngine = new PromptEngine()
    
    // Use ClientAIService in browser, RealAIService on server
    this.aiService = typeof window !== 'undefined' 
      ? new ClientAIService() 
      : new RealAIService()
      
    this.responseProcessor = new AIResponseProcessor()
    this.qualityScorer = new ContentQualityScorer()
    this.userContext = userContext || {
      prefersConciseResponses: false,
      previousInteractions: 0,
      preferredCommunicationStyle: 'detailed',
      riskTolerance: 'balanced'
    }
  }

  // Generate spec block from user's business idea
  async generateSpecBlock(userIdea: string): Promise<SpecBlockGenerationResult> {
    const startTime = Date.now();
    
    try {
      // Check basic input validity
      if (!userIdea || userIdea.trim().length === 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Please provide a business idea to get started'
          },
          metadata: {
            processingTime: Date.now() - startTime
          }
        };
      }

      // Let AI handle everything - moderation, understanding, and generation
      const serviceKey = ServiceSelector.selectBestService('analysis', 'quality', 'spec_generation');
      const response = await this.aiService.generateSpecBlock(userIdea.trim(), serviceKey);
      
      if (!response.success || !response.data) {
        // If AI couldn't process it, ask AI why and what to suggest
        const errorAnalysis = await this.generateIntelligentError(userIdea, response.error?.message);
        
        return {
          success: false,
          error: {
            code: errorAnalysis.code,
            message: errorAnalysis.message
          },
          metadata: {
            processingTime: Date.now() - startTime,
            aiModel: response.metadata?.model
          }
        };
      }

      // Basic structural validation only - ensure required fields exist
      if (!response.data.goal || !response.data.section_list || !response.data.style_tags || !response.data.industry_tag) {
        const errorAnalysis = await this.generateIntelligentError(
          userIdea, 
          'The AI response was missing required fields'
        );
        
        return {
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: errorAnalysis.message
          },
          metadata: {
            processingTime: Date.now() - startTime,
            aiModel: response.metadata?.model
          }
        };
      }

      // Track usage
      UsageTracker.trackUsage(serviceKey, response.metadata.tokensUsed, response.metadata.cost);

      return {
        success: true,
        spec: response.data,
        metadata: {
          processingTime: Date.now() - startTime,
          aiModel: response.metadata.model,
          confidence: response.metadata.confidence
        }
      };

    } catch (error) {
      logger.error('Spec block generation failed:', error);
      
      // Even for system errors, try to generate helpful message
      const errorAnalysis = await this.generateIntelligentError(
        userIdea,
        error instanceof Error ? error.message : 'System error'
      );
      
      return {
        success: false,
        error: {
          code: 'SYSTEM_ERROR',
          message: errorAnalysis.message
        },
        metadata: {
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  // Generate complete project from spec block
  async generateProjectFromSpec(specBlock: SpecBlock): Promise<AIResponse<any>> {
    const startTime = Date.now();
    
    try {
      logger.info('🎨 Starting template generation from spec block', {
        goal: specBlock.goal.slice(0, 50),
        industry: specBlock.industry_tag,
        techStack: specBlock.tech_stack
      });

      const serviceKey = ServiceSelector.selectBestService('generation', 'quality', 'template_generation');
      const response = await this.aiService.generateProjectFromSpec(specBlock, serviceKey);
      
      if (!response.success || !response.data) {
        logger.error('❌ Template generation failed', {
          error: response.error?.message
        });
        
        return {
          success: false,
          data: null,
          metadata: {
            model: response.metadata?.model || 'unknown',
            tokensUsed: 0,
            responseTime: Date.now() - startTime,
            cost: 0
          },
          error: {
            code: 'TEMPLATE_GENERATION_FAILED',
            message: response.error?.message || 'Failed to generate project template',
            retryable: true
          }
        };
      }

      // Track usage
      UsageTracker.trackUsage(serviceKey, response.metadata.tokensUsed, response.metadata.cost);

      logger.info('✅ Template generation completed', {
        templateName: response.data.name,
        responseTime: Date.now() - startTime
      });

      return {
        success: true,
        data: response.data,
        metadata: {
          model: response.metadata.model,
          tokensUsed: response.metadata.tokensUsed,
          responseTime: Date.now() - startTime,
          confidence: response.metadata.confidence,
          cost: response.metadata.cost
        }
      };

    } catch (error) {
      logger.error('❌ Template generation system error:', error);
      
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
          code: 'SYSTEM_ERROR',
          message: 'System error during template generation',
          retryable: true
        }
      };
    }
  }

  // Generate intelligent, contextual error messages using AI
  private async generateIntelligentError(userInput: string, technicalError?: string): Promise<{ code: string; message: string }> {
    try {
      const prompt = `Analyze why this business idea input couldn't be processed and provide a helpful, friendly error message.

User input: "${userInput}"
Technical error (if any): "${technicalError || 'Unable to generate spec block'}"

Respond with a JSON object containing:
1. "code": A short error code (e.g., "UNCLEAR_IDEA", "MISSING_DETAILS", "INAPPROPRIATE_CONTENT")
2. "message": A friendly, helpful message explaining what went wrong and how to fix it
3. "suggestion": Specific advice on what the user should include or change

The message should be:
- Encouraging and friendly
- Specific about what's missing or wrong
- Actionable with clear next steps
- Free of technical jargon

Example response:
{
  "code": "UNCLEAR_IDEA",
  "message": "I couldn't quite understand your business concept. Could you tell me more about what your business will do and who your customers are?",
  "suggestion": "Try describing what product or service you'll offer and who will benefit from it. For example: 'An online store selling handmade jewelry to young professionals.'"
}`;

      const serviceKey = ServiceSelector.selectBestService('analysis', 'speed', 'error_analysis');
      const errorResponse = await this.aiService.generateCompletion(prompt, serviceKey);
      
      if (errorResponse && typeof errorResponse === 'string') {
        try {
          const parsed = JSON.parse(errorResponse);
          return {
            code: parsed.code || 'PROCESSING_ERROR',
            message: parsed.message + (parsed.suggestion ? ` ${parsed.suggestion}` : '')
          };
        } catch {
          // If parsing fails, use the response as the message
          return {
            code: 'PROCESSING_ERROR',
            message: errorResponse
          };
        }
      }
    } catch (error) {
      logger.error('Failed to generate intelligent error:', error);
    }

    // Fallback message if AI error generation fails
    return {
      code: 'PROCESSING_ERROR',
      message: "I'm having trouble understanding your business idea. Could you try describing it differently? Include what your business does and who your customers are."
    };
  }

  // Main orchestration method - generates complete business content
  async generateBusinessContent(userIdea: string): Promise<GeneratedBusinessContent> {
    const startTime = Date.now()
    let totalCost = 0
    const servicesUsed: string[] = []

    try {
      // Step 1: Analyze business idea
      const analysisResult = await this.analyzeBusinessIdea(userIdea)
      totalCost += analysisResult.metadata.cost
      servicesUsed.push(analysisResult.metadata.model)

      // Step 2: Generate business names
      const namesResult = await this.generateBusinessNames(analysisResult.data)
      totalCost += namesResult.metadata.cost
      servicesUsed.push(namesResult.metadata.model)

      // Step 3: Select best name for subsequent generation
      const selectedName = this.selectBestName(namesResult.data)

      // Step 4: Generate taglines
      const taglinesResult = await this.generateTaglines(analysisResult.data, selectedName.name)
      totalCost += taglinesResult.metadata.cost
      servicesUsed.push(taglinesResult.metadata.model)

      // Step 5: Generate feature recommendations (parallel with pricing)
      const [featuresResult, pricingResult] = await Promise.all([
        this.generateFeatureRecommendations(analysisResult.data),
        this.generatePricingStrategy(analysisResult.data)
      ])
      totalCost += featuresResult.metadata.cost + pricingResult.metadata.cost
      servicesUsed.push(featuresResult.metadata.model, pricingResult.metadata.model)

      // Step 6: Generate content strategy
      const contentResult = await this.generateContentStrategy(analysisResult.data, selectedName.name)
      totalCost += contentResult.metadata.cost
      servicesUsed.push(contentResult.metadata.model)

      // Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence([
        analysisResult.metadata.confidence || 0.8,
        namesResult.metadata.confidence || 0.8,
        taglinesResult.metadata.confidence || 0.8
      ])

      return {
        analysis: analysisResult.data,
        names: namesResult.data,
        taglines: taglinesResult.data,
        features: featuresResult.data,
        pricing: pricingResult.data,
        contentStrategy: contentResult.data,
        metadata: {
          generationTime: Date.now() - startTime,
          totalCost,
          confidence: overallConfidence,
          servicesUsed: [...new Set(servicesUsed)] // Remove duplicates
        }
      }

    } catch (error) {
      logger.error('Error in AI orchestration:', error);
      throw new Error('Failed to generate business content. Please try again.')
    }
  }

  // Streaming business analysis with real-time updates
  async *analyzeBusinessIdeaStream(userIdea: string): AsyncGenerator<StreamingAIResponse> {
    const serviceKey = ServiceSelector.selectBestService('analysis', 'quality', 'business_analysis')
    
    try {
      // Start streaming analysis with real AI
      const stream = this.aiService.analyzeBusinessIdeaStream(userIdea, serviceKey)
      
      for await (const chunk of stream) {
        yield chunk
        
        // Track progress and provide contextual insights
        if (chunk.type === 'insight' && chunk.metadata?.progress) {
          this.updateUserContext(chunk)
        }
      }
      
    } catch (error) {
      yield {
        type: 'error',
        content: 'Analysis failed, but we can still help you build your business!'
      }
    }
  }

  // Individual generation methods with enhanced processing
  async analyzeBusinessIdea(userIdea: string): Promise<AIResponse<BusinessAnalysis>> {
    const serviceKey = ServiceSelector.selectBestService('analysis', 'quality', 'business_analysis')
    const prompt = this.promptEngine.createBusinessAnalysisPrompt(userIdea, this.userContext)
    
    try {
      const response = await this.aiService.analyzeBusinessIdea(userIdea, serviceKey)
      
      // Process and enhance the response
      const processedAnalysis = await this.responseProcessor.processResponse<BusinessAnalysis>(
        JSON.stringify(response.data), 
        'business_analysis',
        { userIdea, userContext: this.userContext }
      )

      // Score quality
      const qualityScore = this.qualityScorer.scoreGeneratedContent(
        processedAnalysis, 
        processedAnalysis,
        'business_analysis'
      )

      // Track usage
      UsageTracker.trackUsage(serviceKey, response.metadata.tokensUsed, response.metadata.cost)

      return {
        ...response,
        data: processedAnalysis,
        metadata: {
          ...response.metadata,
          confidence: Math.min(response.metadata.confidence || 0.8, qualityScore.overall)
        }
      }

    } catch (error) {
      logger.error('Business analysis failed:', error);
      // Return fallback analysis
      return this.generateFallbackAnalysis(userIdea)
    }
  }

  async generateBusinessNames(analysis: BusinessAnalysis): Promise<AIResponse<BusinessName[]>> {
    const serviceKey = ServiceSelector.selectBestService('generation', 'speed', 'business_names')
    
    try {
      const response = await this.aiService.generateBusinessNames(analysis, serviceKey)
      
      // Process and validate names
      const processedNames = await this.responseProcessor.processResponse<BusinessName[]>(
        JSON.stringify(response.data),
        'business_names',
        { analysis }
      )

      // Score and rank names
      const scoredNames = processedNames.map(name => ({
        ...name,
        overallScore: (name.brandFit + name.memorability) / 2
      })).sort((a, b) => b.overallScore - a.overallScore)

      UsageTracker.trackUsage(serviceKey, response.metadata.tokensUsed, response.metadata.cost)

      return {
        ...response,
        data: scoredNames
      }

    } catch (error) {
      logger.error('Name generation failed:', error);
      return this.generateFallbackNames(analysis)
    }
  }

  async generateTaglines(
    analysis: BusinessAnalysis, 
    selectedName: string
  ): Promise<AIResponse<BusinessTagline[]>> {
    const serviceKey = ServiceSelector.selectBestService('generation', 'quality', 'taglines')
    
    try {
      const response = await this.aiService.generateTaglines(analysis, selectedName, serviceKey)
      
      const processedTaglines = await this.responseProcessor.processResponse<BusinessTagline[]>(
        JSON.stringify(response.data),
        'taglines',
        { analysis, selectedName }
      )

      // Score taglines for effectiveness
      const scoredTaglines = processedTaglines.map(tagline => ({
        ...tagline,
        overallScore: (tagline.brandFit + tagline.memorability) / 2
      })).sort((a, b) => b.overallScore - a.overallScore)

      UsageTracker.trackUsage(serviceKey, response.metadata.tokensUsed, response.metadata.cost)

      return {
        ...response,
        data: scoredTaglines
      }

    } catch (error) {
      logger.error('Tagline generation failed:', error);
      return this.generateFallbackTaglines(analysis, selectedName)
    }
  }

  async generateFeatureRecommendations(
    analysis: BusinessAnalysis
  ): Promise<AIResponse<FeatureRecommendation[]>> {
    const serviceKey = ServiceSelector.selectBestService('analysis', 'quality', 'feature_recommendations')
    
    try {
      const response = await this.aiService.recommendFeatures(analysis, serviceKey)
      
      const processedFeatures = await this.responseProcessor.processResponse<FeatureRecommendation[]>(
        JSON.stringify(response.data),
        'features',
        { analysis }
      )

      // Prioritize features based on business context
      const prioritizedFeatures = this.prioritizeFeatures(processedFeatures, analysis)

      UsageTracker.trackUsage(serviceKey, response.metadata.tokensUsed, response.metadata.cost)

      return {
        ...response,
        data: prioritizedFeatures
      }

    } catch (error) {
      logger.error('Feature recommendation failed:', error);
      return this.generateFallbackFeatures(analysis)
    }
  }

  async generatePricingStrategy(
    analysis: BusinessAnalysis
  ): Promise<AIResponse<PricingStrategy>> {
    const serviceKey = ServiceSelector.selectBestService('analysis', 'quality', 'pricing_strategy')
    
    try {
      const response = await this.aiService.generatePricingStrategy(analysis, serviceKey)
      
      const processedPricing = await this.responseProcessor.processResponse<PricingStrategy>(
        JSON.stringify(response.data),
        'pricing',
        { analysis }
      )

      UsageTracker.trackUsage(serviceKey, response.metadata.tokensUsed, response.metadata.cost)

      return {
        ...response,
        data: processedPricing
      }

    } catch (error) {
      logger.error('Pricing strategy generation failed:', error);
      return this.generateFallbackPricing(analysis)
    }
  }

  async generateContentStrategy(
    analysis: BusinessAnalysis,
    selectedName: string
  ): Promise<AIResponse<ContentStrategy>> {
    const serviceKey = ServiceSelector.selectBestService('generation', 'quality', 'content_strategy')
    
    try {
      // For now, use a simplified generation since we don't have this in mock service
      const mockContentStrategy: ContentStrategy = {
        tone: `${analysis.communicationStyle} and ${analysis.brandPersonality[0].toLowerCase()}`,
        messagingFramework: {
          primaryMessage: analysis.valuePropositions[0],
          supportingMessages: analysis.valuePropositions.slice(1, 4),
          proofPoints: analysis.competitiveAdvantages
        },
        contentTypes: {
          hero: `Welcome to ${selectedName} - ${analysis.valuePropositions[0].toLowerCase()}`,
          about: `${selectedName} is dedicated to ${analysis.coreOffering.toLowerCase()}. We believe in ${analysis.psychographics.values.join(', ').toLowerCase()}.`,
          features: analysis.valuePropositions,
          testimonials: [
            `"${selectedName} exceeded our expectations with their ${analysis.brandPersonality[0].toLowerCase()} approach."`,
            `"Finally found a solution that understands our needs as ${analysis.targetAudience.toLowerCase()}."`
          ],
          faqs: [
            `What makes ${selectedName} different?`,
            `How do you ensure ${analysis.brandPersonality[0].toLowerCase()} service?`,
            `What can I expect from working with ${selectedName}?`
          ]
        },
        seoStrategy: {
          primaryKeywords: [
            analysis.coreOffering.toLowerCase(),
            `${analysis.industry.toLowerCase()} services`,
            `${analysis.subCategory.toLowerCase()}`,
            analysis.targetAudience.toLowerCase()
          ],
          contentTopics: [
            `${analysis.industry} trends and insights`,
            `How to choose the right ${analysis.subCategory.toLowerCase()}`,
            `${analysis.valuePropositions[0]} best practices`
          ],
          competitorGaps: [
            `Lack of ${analysis.brandPersonality[0].toLowerCase()} approach in market`,
            `Limited focus on ${analysis.targetAudience.toLowerCase()} needs`
          ]
        }
      }

      return {
        success: true,
        data: mockContentStrategy,
        metadata: {
          model: serviceKey,
          tokensUsed: 800,
          responseTime: 1000,
          cost: 0.01
        }
      }

    } catch (error) {
      logger.error('Content strategy generation failed:', error);
      return this.generateFallbackContentStrategy(analysis, selectedName)
    }
  }

  // Helper methods
  private selectBestName(names: BusinessName[]): BusinessName {
    // Select the name with highest combined score
    const scored = names.map(name => ({
      ...name,
      combinedScore: (name.brandFit * 0.6) + (name.memorability * 0.4)
    }))
    
    return scored.sort((a, b) => b.combinedScore - a.combinedScore)[0]
  }

  private prioritizeFeatures(
    features: FeatureRecommendation[], 
    analysis: BusinessAnalysis
  ): FeatureRecommendation[] {
    // Sort features by priority and business context relevance
    const priorityScore = {
      'must_have': 3,
      'should_have': 2,
      'nice_to_have': 1
    }

    return features.sort((a, b) => {
      const scoreA = priorityScore[a.priority]
      const scoreB = priorityScore[b.priority]
      
      if (scoreA !== scoreB) return scoreB - scoreA
      
      // Secondary sort by category relevance to business type
      const categoryRelevance = this.getCategoryRelevance(analysis.businessType)
      const relevanceA = categoryRelevance[a.category] || 0
      const relevanceB = categoryRelevance[b.category] || 0
      
      return relevanceB - relevanceA
    })
  }

  private getCategoryRelevance(businessType: string): Record<string, number> {
    const relevanceMap: Record<string, Record<string, number>> = {
      'saas': { 'core': 4, 'growth': 3, 'engagement': 2, 'optimization': 1 },
      'ecommerce': { 'core': 4, 'optimization': 3, 'engagement': 2, 'growth': 1 },
      'service': { 'core': 4, 'engagement': 3, 'growth': 2, 'optimization': 1 }
    }
    
    return relevanceMap[businessType] || { 'core': 4, 'growth': 3, 'engagement': 2, 'optimization': 1 }
  }

  private calculateOverallConfidence(confidenceScores: number[]): number {
    const average = confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
    
    // Apply penalty for inconsistent scores
    const variance = confidenceScores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / confidenceScores.length
    const penalty = Math.min(variance * 0.5, 0.1)
    
    return Math.max(average - penalty, 0.5)
  }

  private updateUserContext(chunk: StreamingAIResponse): void {
    // Update user context based on AI insights
    if (chunk.metadata?.confidence && chunk.metadata.confidence > 0.85) {
      this.userContext.previousInteractions++
    }
  }

  // Fallback methods for error resilience
  private generateFallbackAnalysis(userIdea: string): AIResponse<BusinessAnalysis> {
    const fallbackAnalysis: BusinessAnalysis = {
      businessType: 'service',
      industry: 'Professional Services',
      subCategory: 'General Services',
      coreOffering: 'Professional services and solutions',
      valuePropositions: [
        'Expert knowledge and experience',
        'Personalized approach to each client',
        'Reliable and timely service delivery'
      ],
      targetAudience: 'Business professionals and entrepreneurs',
      demographics: {
        ageRange: '30-55',
        income: '$50,000-120,000',
        geography: 'Local to regional',
        lifestyle: ['Professional', 'Goal-oriented']
      },
      psychographics: {
        values: ['Quality', 'Trust', 'Results'],
        interests: ['Business growth', 'Professional development'],
        painPoints: ['Time constraints', 'Need for expertise'],
        motivations: ['Success', 'Efficiency', 'Competitive advantage']
      },
      businessModel: 'b2b',
      revenueModel: 'service_based',
      geographicScope: 'regional',
      brandPersonality: ['Professional', 'Trustworthy', 'Expert'],
      communicationStyle: 'formal',
      differentiators: ['Deep expertise', 'Personal attention', 'Proven results'],
      marketOpportunities: ['Digital transformation', 'Remote service delivery'],
      challenges: ['Market competition', 'Building trust'],
      confidence: 0.6,
      keyInsights: ['Focus on building trust and credibility'],
      competitiveAdvantages: ['Specialized knowledge', 'Client relationships']
    }

    return {
      success: true,
      data: fallbackAnalysis,
      metadata: {
        model: 'fallback',
        tokensUsed: 0,
        responseTime: 100,
        confidence: 0.6,
        cost: 0
      }
    }
  }

  private generateFallbackNames(analysis: BusinessAnalysis): AIResponse<BusinessName[]> {
    const fallbackNames: BusinessName[] = [
      {
        name: `${analysis.brandPersonality[0]} Solutions`,
        reasoning: 'Reliable fallback name emphasizing key brand characteristic',
        brandFit: 0.7,
        memorability: 0.6,
        availability: {
          domain: true,
          trademark: true,
          social: { instagram: true, twitter: true, facebook: true }
        },
        alternatives: [`${analysis.brandPersonality[0]} Services`, `${analysis.industry.split(' ')[0]} Pro`],
        tags: ['fallback', 'safe']
      }
    ]

    return {
      success: true,
      data: fallbackNames,
      metadata: {
        model: 'fallback',
        tokensUsed: 0,
        responseTime: 100,
        cost: 0
      }
    }
  }

  private generateFallbackTaglines(analysis: BusinessAnalysis, name: string): AIResponse<BusinessTagline[]> {
    const fallbackTaglines: BusinessTagline[] = [
      {
        text: analysis.valuePropositions[0],
        style: 'benefit_focused',
        psychologicalTrigger: 'Value communication',
        targetEmotion: 'Confidence',
        wordCount: analysis.valuePropositions[0].split(' ').length,
        memorability: 0.7,
        brandFit: 0.8,
        explanation: 'Uses primary value proposition as tagline'
      }
    ]

    return {
      success: true,
      data: fallbackTaglines,
      metadata: {
        model: 'fallback',
        tokensUsed: 0,
        responseTime: 100,
        cost: 0
      }
    }
  }

  private generateFallbackFeatures(analysis: BusinessAnalysis): AIResponse<FeatureRecommendation[]> {
    const fallbackFeatures: FeatureRecommendation[] = [
      {
        name: 'Contact & Communication',
        description: 'Easy ways for customers to reach and communicate with your business',
        priority: 'must_have',
        category: 'core',
        complexity: 'simple',
        estimatedCost: 'low',
        reasoning: 'Essential for any business to connect with customers',
        benefits: ['Customer accessibility', 'Lead generation', 'Professional presence'],
        examples: ['Contact forms', 'Phone integration', 'Email setup']
      }
    ]

    return {
      success: true,
      data: fallbackFeatures,
      metadata: {
        model: 'fallback',
        tokensUsed: 0,
        responseTime: 100,
        cost: 0
      }
    }
  }

  private generateFallbackPricing(analysis: BusinessAnalysis): AIResponse<PricingStrategy> {
    const fallbackPricing: PricingStrategy = {
      model: 'tiered',
      tiers: [
        {
          name: 'Standard',
          price: '$99',
          description: 'Great starting option',
          features: analysis.valuePropositions.slice(0, 3),
          targetSegment: 'General customers',
          valueProposition: 'Good value for essential features'
        }
      ],
      reasoning: 'Simple tiered approach suitable for most businesses',
      marketPositioning: 'value',
      competitiveAnalysis: 'Positioned for value-conscious customers',
      recommendations: ['Test market response', 'Consider customer feedback']
    }

    return {
      success: true,
      data: fallbackPricing,
      metadata: {
        model: 'fallback',
        tokensUsed: 0,
        responseTime: 100,
        cost: 0
      }
    }
  }

  private generateFallbackContentStrategy(analysis: BusinessAnalysis, name: string): AIResponse<ContentStrategy> {
    const fallbackStrategy: ContentStrategy = {
      tone: 'Professional and approachable',
      messagingFramework: {
        primaryMessage: analysis.valuePropositions[0],
        supportingMessages: analysis.valuePropositions.slice(1),
        proofPoints: analysis.competitiveAdvantages
      },
      contentTypes: {
        hero: `Welcome to ${name}`,
        about: `We provide ${analysis.coreOffering.toLowerCase()}`,
        features: analysis.valuePropositions,
        testimonials: ['Great service and results'],
        faqs: ['What services do you offer?', 'How can I get started?']
      },
      seoStrategy: {
        primaryKeywords: [analysis.industry.toLowerCase()],
        contentTopics: ['Industry insights'],
        competitorGaps: ['Service quality focus']
      }
    }

    return {
      success: true,
      data: fallbackStrategy,
      metadata: {
        model: 'fallback',
        tokensUsed: 0,
        responseTime: 100,
        cost: 0
      }
    }
  }
}