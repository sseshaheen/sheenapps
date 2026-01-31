import { logger } from '@/utils/logger';

import { 
  BusinessAnalysis, 
  BusinessName, 
  BusinessTagline, 
  FeatureRecommendation, 
  PricingStrategy,
  ContentStrategy,
  QualityScore,
  AIResponse 
} from './types'

export class AIResponseProcessor {
  // Main processing method that handles different response types
  async processResponse<T>(
    rawResponse: string, 
    expectedType: string,
    context?: any
  ): Promise<T> {
    try {
      // First try to parse as JSON
      const parsed = JSON.parse(rawResponse)
      
      // Validate and enhance based on type
      switch (expectedType) {
        case 'business_analysis':
          return await this.processBusinessAnalysis(parsed, context) as T
        case 'business_names':
          return await this.processBusinessNames(parsed, context) as T
        case 'taglines':
          return await this.processTaglines(parsed, context) as T
        case 'features':
          return await this.processFeatures(parsed, context) as T
        case 'pricing':
          return await this.processPricing(parsed, context) as T
        case 'content_strategy':
          return await this.processContentStrategy(parsed, context) as T
        default:
          return parsed as T
      }
    } catch (error) {
      // Fallback to text parsing if JSON fails
      logger.warn(`JSON parsing failed for ${expectedType}, attempting text parsing:`, error);
      return await this.parseUnstructuredResponse<T>(rawResponse, expectedType, context)
    }
  }

  // Business Analysis Processing
  async processBusinessAnalysis(parsed: any, context?: any): Promise<BusinessAnalysis> {
    const validated = this.validateBusinessAnalysis(parsed)
    const enhanced = await this.enhanceBusinessAnalysis(validated, context)
    return enhanced
  }

  private validateBusinessAnalysis(data: any): BusinessAnalysis {
    // Ensure all required fields are present with sensible defaults
    return {
      businessType: this.validateBusinessType(data.businessType),
      industry: data.industry || 'General Business',
      subCategory: data.subCategory || data.industry || 'Professional Services',
      coreOffering: data.coreOffering || 'Professional services and solutions',
      valuePropositions: this.validateArray(data.valuePropositions, [
        'Quality service and expertise',
        'Professional and reliable solutions',
        'Customer-focused approach'
      ]),
      targetAudience: data.targetAudience || 'Business professionals and consumers',
      demographics: {
        ageRange: data.demographics?.ageRange || '25-55',
        income: data.demographics?.income || '$40,000-100,000',
        geography: data.demographics?.geography || 'Local to regional',
        lifestyle: this.validateArray(data.demographics?.lifestyle, ['Professional', 'Goal-oriented'])
      },
      psychographics: {
        values: this.validateArray(data.psychographics?.values, ['Quality', 'Trust', 'Results']),
        interests: this.validateArray(data.psychographics?.interests, ['Professional development', 'Quality products']),
        painPoints: this.validateArray(data.psychographics?.painPoints, ['Time constraints', 'Need for reliable solutions']),
        motivations: this.validateArray(data.psychographics?.motivations, ['Success', 'Efficiency', 'Peace of mind'])
      },
      businessModel: this.validateBusinessModel(data.businessModel),
      revenueModel: this.validateRevenueModel(data.revenueModel),
      geographicScope: this.validateGeographicScope(data.geographicScope),
      brandPersonality: this.validateArray(data.brandPersonality, ['Professional', 'Trustworthy', 'Reliable']),
      communicationStyle: this.validateCommunicationStyle(data.communicationStyle),
      differentiators: this.validateArray(data.differentiators, ['Expertise and experience', 'Quality service']),
      marketOpportunities: this.validateArray(data.marketOpportunities, ['Growing market demand', 'Digital transformation']),
      challenges: this.validateArray(data.challenges, ['Market competition', 'Customer acquisition']),
      confidence: this.validateConfidence(data.confidence),
      keyInsights: this.validateArray(data.keyInsights, ['Focus on quality and service']),
      competitiveAdvantages: this.validateArray(data.competitiveAdvantages, ['Specialized expertise', 'Customer focus'])
    }
  }

  private async enhanceBusinessAnalysis(analysis: BusinessAnalysis, context?: any): Promise<BusinessAnalysis> {
    // Add our intelligence on top of AI response
    const enhanced = { ...analysis }

    // Enhance based on business type patterns
    if (analysis.businessType === 'ecommerce') {
      enhanced.keyInsights.push('Visual presentation crucial for online sales')
      enhanced.marketOpportunities.push('Mobile commerce growth opportunity')
    }

    if (analysis.businessType === 'saas') {
      enhanced.keyInsights.push('User onboarding critical for retention')
      enhanced.marketOpportunities.push('Integration ecosystem expansion')
    }

    if (analysis.businessType === 'service') {
      enhanced.keyInsights.push('Trust and credibility drive customer decisions')
      enhanced.marketOpportunities.push('Digitization of service delivery')
    }

    // Enhance based on geographic scope
    if (analysis.geographicScope === 'local') {
      enhanced.marketOpportunities.push('Local SEO and community engagement opportunities')
      enhanced.challenges.push('Limited market size requires efficiency')
    }

    return enhanced
  }

  // Business Names Processing
  async processBusinessNames(parsed: any, context?: any): Promise<BusinessName[]> {
    const names = Array.isArray(parsed) ? parsed : (parsed.names || [])
    return names.map((name: any) => this.validateBusinessName(name)).filter(Boolean)
  }

  private validateBusinessName(data: any): BusinessName {
    return {
      name: data.name || 'Business Name',
      reasoning: data.reasoning || 'Professional business name',
      brandFit: this.validateScore(data.brandFit),
      memorability: this.validateScore(data.memorability),
      availability: {
        domain: data.availability?.domain ?? true,
        trademark: data.availability?.trademark ?? true,
        social: {
          instagram: data.availability?.social?.instagram ?? true,
          twitter: data.availability?.social?.twitter ?? true,
          facebook: data.availability?.social?.facebook ?? true
        }
      },
      alternatives: this.validateArray(data.alternatives, []),
      tags: this.validateArray(data.tags, ['professional', 'memorable'])
    }
  }

  // Taglines Processing
  async processTaglines(parsed: any, context?: any): Promise<BusinessTagline[]> {
    const taglines = Array.isArray(parsed) ? parsed : (parsed.taglines || [])
    return taglines.map((tagline: any) => this.validateTagline(tagline)).filter(Boolean)
  }

  private validateTagline(data: any): BusinessTagline {
    const text = data.text || 'Quality solutions for your needs'
    return {
      text,
      style: this.validateTaglineStyle(data.style),
      psychologicalTrigger: data.psychologicalTrigger || 'Trust and reliability',
      targetEmotion: data.targetEmotion || 'Confidence',
      wordCount: text.split(' ').length,
      memorability: this.validateScore(data.memorability),
      brandFit: this.validateScore(data.brandFit),
      explanation: data.explanation || 'Communicates core value proposition'
    }
  }

  // Features Processing
  async processFeatures(parsed: any, context?: any): Promise<FeatureRecommendation[]> {
    const features = Array.isArray(parsed) ? parsed : (parsed.features || [])
    return features.map((feature: any) => this.validateFeature(feature)).filter(Boolean)
  }

  private validateFeature(data: any): FeatureRecommendation {
    return {
      name: data.name || 'Essential Feature',
      description: data.description || 'Important functionality for your business',
      priority: this.validatePriority(data.priority),
      category: this.validateCategory(data.category),
      complexity: this.validateComplexity(data.complexity),
      estimatedCost: this.validateCost(data.estimatedCost),
      reasoning: data.reasoning || 'Important for business operations',
      benefits: this.validateArray(data.benefits, ['Improved efficiency', 'Better user experience']),
      examples: this.validateArray(data.examples, ['Implementation example']),
      integrations: this.validateArray(data.integrations, [])
    }
  }

  // Pricing Processing
  async processPricing(parsed: any, context?: any): Promise<PricingStrategy> {
    return this.validatePricingStrategy(parsed)
  }

  private validatePricingStrategy(data: any): PricingStrategy {
    return {
      model: this.validatePricingModel(data.model),
      tiers: (data.tiers || []).map((tier: any) => this.validatePricingTier(tier)),
      reasoning: data.reasoning || 'Balanced approach to value and accessibility',
      marketPositioning: this.validateMarketPositioning(data.marketPositioning),
      competitiveAnalysis: data.competitiveAnalysis || 'Competitively positioned in market',
      recommendations: this.validateArray(data.recommendations, ['Monitor market response', 'Test pricing sensitivity'])
    }
  }

  private validatePricingTier(data: any): any {
    return {
      name: data.name || 'Standard',
      price: data.price || '$99',
      billingCycle: data.billingCycle,
      description: data.description || 'Great value option',
      features: this.validateArray(data.features, ['Core features']),
      limitations: this.validateArray(data.limitations, []),
      popular: data.popular || false,
      targetSegment: data.targetSegment || 'General customers',
      valueProposition: data.valueProposition || 'Good value for money'
    }
  }

  // Content Strategy Processing
  async processContentStrategy(parsed: any, context?: any): Promise<ContentStrategy> {
    return this.validateContentStrategy(parsed)
  }

  private validateContentStrategy(data: any): ContentStrategy {
    return {
      tone: data.tone || 'Professional and approachable',
      messagingFramework: {
        primaryMessage: data.messagingFramework?.primaryMessage || 'Quality solutions for your business',
        supportingMessages: this.validateArray(data.messagingFramework?.supportingMessages, ['Reliable service']),
        proofPoints: this.validateArray(data.messagingFramework?.proofPoints, ['Proven experience'])
      },
      contentTypes: {
        hero: data.contentTypes?.hero || 'Welcome to our professional services',
        about: data.contentTypes?.about || 'We are dedicated to providing quality solutions',
        features: this.validateArray(data.contentTypes?.features, ['Professional service']),
        testimonials: this.validateArray(data.contentTypes?.testimonials, ['Great service and results']),
        faqs: this.validateArray(data.contentTypes?.faqs, ['What services do you offer?'])
      },
      seoStrategy: {
        primaryKeywords: this.validateArray(data.seoStrategy?.primaryKeywords, ['professional services']),
        contentTopics: this.validateArray(data.seoStrategy?.contentTopics, ['Industry insights']),
        competitorGaps: this.validateArray(data.seoStrategy?.competitorGaps, ['Content opportunities'])
      }
    }
  }

  // Fallback text parsing for unstructured responses
  private async parseUnstructuredResponse<T>(
    text: string, 
    expectedType: string, 
    context?: any
  ): Promise<T> {
    // Simple text parsing as fallback
    switch (expectedType) {
      case 'business_analysis':
        return this.parseBusinessAnalysisFromText(text) as T
      case 'business_names':
        return this.parseBusinessNamesFromText(text) as T
      default:
        throw new Error(`Unable to parse unstructured response for type: ${expectedType}`)
    }
  }

  private parseBusinessAnalysisFromText(text: string): BusinessAnalysis {
    // Extract key information from text using patterns
    const businessType = this.extractBusinessTypeFromText(text)
    const industry = this.extractIndustryFromText(text)
    
    return {
      businessType,
      industry,
      subCategory: industry,
      coreOffering: 'Professional services and solutions',
      valuePropositions: ['Quality service', 'Professional expertise', 'Reliable solutions'],
      targetAudience: 'Business professionals',
      demographics: {
        ageRange: '25-55',
        income: '$40,000-100,000',
        geography: 'Local to regional',
        lifestyle: ['Professional']
      },
      psychographics: {
        values: ['Quality', 'Trust'],
        interests: ['Professional development'],
        painPoints: ['Time constraints'],
        motivations: ['Success']
      },
      businessModel: 'b2b',
      revenueModel: 'service_based',
      geographicScope: 'regional',
      brandPersonality: ['Professional', 'Trustworthy'],
      communicationStyle: 'formal',
      differentiators: ['Expertise'],
      marketOpportunities: ['Growing demand'],
      challenges: ['Competition'],
      confidence: 0.6, // Lower confidence for text-parsed responses
      keyInsights: ['Focus on service quality'],
      competitiveAdvantages: ['Professional expertise']
    }
  }

  private parseBusinessNamesFromText(text: string): BusinessName[] {
    // Extract business names from text
    const lines = text.split('\n')
    const names: BusinessName[] = []
    
    for (const line of lines) {
      const nameMatch = line.match(/(?:Name|Business):\s*(.+?)(?:\s*-|\s*\n|$)/i)
      if (nameMatch) {
        names.push({
          name: nameMatch[1].trim(),
          reasoning: 'Extracted from text response',
          brandFit: 0.7,
          memorability: 0.7,
          availability: {
            domain: true,
            trademark: true,
            social: { instagram: true, twitter: true, facebook: true }
          },
          alternatives: [],
          tags: ['text-parsed']
        })
      }
    }
    
    return names.length > 0 ? names : [{
      name: 'Professional Services',
      reasoning: 'Default name from text parsing',
      brandFit: 0.6,
      memorability: 0.6,
      availability: {
        domain: true,
        trademark: true,
        social: { instagram: true, twitter: true, facebook: true }
      },
      alternatives: [],
      tags: ['default']
    }]
  }

  // Validation helper methods
  private validateArray(value: any, defaultValue: string[]): string[] {
    if (Array.isArray(value) && value.length > 0) {
      return value.filter(item => typeof item === 'string' && item.trim().length > 0)
    }
    return defaultValue
  }

  private validateScore(value: any): number {
    const num = parseFloat(value)
    return isNaN(num) ? 0.7 : Math.min(Math.max(num, 0), 1)
  }

  private validateConfidence(value: any): number {
    const num = parseFloat(value)
    return isNaN(num) ? 0.75 : Math.min(Math.max(num, 0), 1)
  }

  private validateBusinessType(value: any): BusinessAnalysis['businessType'] {
    const validTypes: BusinessAnalysis['businessType'][] = ['saas', 'ecommerce', 'service', 'marketplace', 'content', 'consulting', 'local_business']
    return validTypes.includes(value) ? value : 'service'
  }

  private validateBusinessModel(value: any): BusinessAnalysis['businessModel'] {
    const validModels: BusinessAnalysis['businessModel'][] = ['b2b', 'b2c', 'b2b2c', 'marketplace']
    return validModels.includes(value) ? value : 'b2b'
  }

  private validateRevenueModel(value: any): BusinessAnalysis['revenueModel'] {
    const validModels: BusinessAnalysis['revenueModel'][] = ['subscription', 'one_time', 'freemium', 'commission', 'advertising', 'service_based']
    return validModels.includes(value) ? value : 'service_based'
  }

  private validateGeographicScope(value: any): BusinessAnalysis['geographicScope'] {
    const validScopes: BusinessAnalysis['geographicScope'][] = ['local', 'regional', 'national', 'global']
    return validScopes.includes(value) ? value : 'regional'
  }

  private validateCommunicationStyle(value: any): BusinessAnalysis['communicationStyle'] {
    const validStyles: BusinessAnalysis['communicationStyle'][] = ['formal', 'casual', 'technical', 'emotional', 'authoritative', 'friendly']
    return validStyles.includes(value) ? value : 'formal'
  }

  private validateTaglineStyle(value: any): BusinessTagline['style'] {
    const validStyles: BusinessTagline['style'][] = ['benefit_focused', 'emotional', 'descriptive', 'question', 'challenge']
    return validStyles.includes(value) ? value : 'benefit_focused'
  }

  private validatePriority(value: any): FeatureRecommendation['priority'] {
    const validPriorities: FeatureRecommendation['priority'][] = ['must_have', 'should_have', 'nice_to_have']
    return validPriorities.includes(value) ? value : 'should_have'
  }

  private validateCategory(value: any): FeatureRecommendation['category'] {
    const validCategories: FeatureRecommendation['category'][] = ['core', 'growth', 'optimization', 'engagement']
    return validCategories.includes(value) ? value : 'core'
  }

  private validateComplexity(value: any): FeatureRecommendation['complexity'] {
    const validComplexities: FeatureRecommendation['complexity'][] = ['simple', 'moderate', 'complex']
    return validComplexities.includes(value) ? value : 'moderate'
  }

  private validateCost(value: any): FeatureRecommendation['estimatedCost'] {
    const validCosts: FeatureRecommendation['estimatedCost'][] = ['low', 'medium', 'high']
    return validCosts.includes(value) ? value : 'medium'
  }

  private validatePricingModel(value: any): PricingStrategy['model'] {
    const validModels: PricingStrategy['model'][] = ['freemium', 'subscription', 'one_time', 'usage_based', 'tiered', 'custom']
    return validModels.includes(value) ? value : 'tiered'
  }

  private validateMarketPositioning(value: any): PricingStrategy['marketPositioning'] {
    const validPositions: PricingStrategy['marketPositioning'][] = ['budget', 'value', 'premium', 'luxury']
    return validPositions.includes(value) ? value : 'value'
  }

  // Text extraction helpers
  private extractBusinessTypeFromText(text: string): BusinessAnalysis['businessType'] {
    const lowerText = text.toLowerCase()
    
    if (lowerText.includes('saas') || lowerText.includes('software as a service')) return 'saas'
    if (lowerText.includes('ecommerce') || lowerText.includes('e-commerce') || lowerText.includes('online store')) return 'ecommerce'
    if (lowerText.includes('marketplace')) return 'marketplace'
    if (lowerText.includes('consulting')) return 'consulting'
    if (lowerText.includes('local') || lowerText.includes('brick and mortar')) return 'local_business'
    
    return 'service'
  }

  private extractIndustryFromText(text: string): string {
    const lowerText = text.toLowerCase()
    
    if (lowerText.includes('technology') || lowerText.includes('software')) return 'Technology'
    if (lowerText.includes('fashion') || lowerText.includes('jewelry') || lowerText.includes('clothing')) return 'Fashion & Accessories'
    if (lowerText.includes('food') || lowerText.includes('restaurant') || lowerText.includes('beverage')) return 'Food & Beverage'
    if (lowerText.includes('health') || lowerText.includes('beauty') || lowerText.includes('wellness')) return 'Health & Beauty'
    if (lowerText.includes('education') || lowerText.includes('training')) return 'Education'
    if (lowerText.includes('finance') || lowerText.includes('financial')) return 'Financial Services'
    
    return 'Professional Services'
  }
}

// Quality scoring system
export class ContentQualityScorer {
  scoreGeneratedContent(
    content: any, 
    context: BusinessAnalysis,
    expectedType: string
  ): QualityScore {
    const relevance = this.scoreRelevance(content, context, expectedType)
    const creativity = this.scoreCreativity(content, expectedType)
    const brandFit = this.scoreBrandFit(content, context)
    const marketAppeal = this.scoreMarketAppeal(content, context)
    const uniqueness = this.scoreUniqueness(content, expectedType)
    
    const overall = (relevance + creativity + brandFit + marketAppeal + uniqueness) / 5
    
    return {
      relevance,
      creativity,
      brandFit,
      marketAppeal,
      uniqueness,
      overall,
      weakAreas: this.identifyWeakAreas({relevance, creativity, brandFit, marketAppeal, uniqueness}),
      strengths: this.identifyStrengths({relevance, creativity, brandFit, marketAppeal, uniqueness})
    }
  }

  private scoreRelevance(content: any, context: BusinessAnalysis, expectedType: string): number {
    // Score how relevant the content is to the business context
    let score = 0.7 // Base score
    
    if (expectedType === 'business_names' && Array.isArray(content)) {
      // Check if names relate to industry/business type
      const industryTerms = this.getIndustryTerms(context.industry)
      const hasRelevantTerms = content.some((name: any) => 
        industryTerms.some(term => name.name?.toLowerCase().includes(term))
      )
      score += hasRelevantTerms ? 0.2 : 0
    }
    
    return Math.min(score, 1)
  }

  private scoreCreativity(content: any, expectedType: string): number {
    // Score creative elements and uniqueness
    let score = 0.6 // Base score
    
    if (expectedType === 'business_names' && Array.isArray(content)) {
      // Avoid generic terms
      const genericTerms = ['solutions', 'services', 'company', 'corp', 'inc']
      const hasGenericTerms = content.some((name: any) => 
        genericTerms.some(term => name.name?.toLowerCase().includes(term))
      )
      score += hasGenericTerms ? 0 : 0.3
    }
    
    return Math.min(score, 1)
  }

  private scoreBrandFit(content: any, context: BusinessAnalysis): number {
    // Score how well content fits the brand personality
    const brandTerms = context.brandPersonality.map(p => p.toLowerCase())
    const score = 0.7 // Base score
    
    // Implementation would check content alignment with brand personality
    return score
  }

  private scoreMarketAppeal(content: any, context: BusinessAnalysis): number {
    // Score appeal to target market
    return 0.75 // Simplified scoring
  }

  private scoreUniqueness(content: any, expectedType: string): number {
    // Score uniqueness and differentiation
    return 0.8 // Simplified scoring
  }

  private identifyWeakAreas(scores: Record<string, number>): string[] {
    const threshold = 0.6
    return Object.entries(scores)
      .filter(([_, score]) => score < threshold)
      .map(([area, _]) => area)
  }

  private identifyStrengths(scores: Record<string, number>): string[] {
    const threshold = 0.8
    return Object.entries(scores)
      .filter(([_, score]) => score >= threshold)
      .map(([area, _]) => area)
  }

  private getIndustryTerms(industry: string): string[] {
    const industryTerms: Record<string, string[]> = {
      'Technology': ['tech', 'digital', 'smart', 'pro', 'sync', 'cloud'],
      'Fashion & Accessories': ['style', 'fashion', 'chic', 'luxe', 'boutique', 'studio'],
      'Food & Beverage': ['fresh', 'taste', 'kitchen', 'cafe', 'bistro', 'table'],
      'Health & Beauty': ['wellness', 'pure', 'glow', 'zen', 'spa', 'beauty']
    }
    
    return industryTerms[industry] || []
  }

  async refineIfNeeded(
    content: any, 
    score: QualityScore, 
    processor: AIResponseProcessor
  ): Promise<any> {
    if (score.overall < 0.7) {
      logger.info(`Content quality score (${score.overall}); below threshold, refinement recommended`)
      // In a real implementation, this could trigger AI refinement
      return content
    }
    return content
  }
}