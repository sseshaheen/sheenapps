import { 
  AIRequest, 
  AITier, 
  RequestAnalysis, 
  RoutingDecision, 
  ComplexityLevel, 
  RiskLevel 
} from './types'
import { ServiceSelector, AI_SERVICES, UsageTracker } from './service-registry'
import AITierConfigManager from './tier-config'
import { logger } from '@/utils/logger';

// Domain classification patterns
const DOMAIN_PATTERNS = {
  finance: [
    'financial', 'finance', 'money', 'payment', 'banking', 'investment', 'trading', 
    'portfolio', 'revenue', 'profit', 'budget', 'accounting', 'tax', 'loan', 'credit',
    'market analysis', 'risk assessment', 'compliance', 'audit'
  ],
  legal: [
    'legal', 'law', 'contract', 'agreement', 'terms', 'compliance', 'regulation',
    'policy', 'gdpr', 'privacy', 'intellectual property', 'patent', 'trademark',
    'litigation', 'dispute', 'jurisdiction', 'statute', 'legislation'
  ],
  healthcare: [
    'health', 'medical', 'patient', 'doctor', 'hospital', 'clinic', 'diagnosis',
    'treatment', 'medication', 'symptom', 'disease', 'therapy', 'wellness',
    'pharmaceutical', 'clinical trial', 'hipaa', 'medical record'
  ],
  marketing: [
    'marketing', 'advertising', 'campaign', 'brand', 'promotion', 'social media',
    'content marketing', 'seo', 'conversion', 'engagement', 'audience', 'targeting',
    'analytics', 'performance', 'roi', 'customer acquisition'
  ],
  business: [
    'business', 'strategy', 'operation', 'management', 'organization', 'process',
    'workflow', 'productivity', 'efficiency', 'performance', 'kpi', 'metrics',
    'analysis', 'planning', 'decision making', 'leadership'
  ],
  technical: [
    'code', 'programming', 'software', 'development', 'api', 'database', 'system',
    'architecture', 'infrastructure', 'deployment', 'testing', 'debugging',
    'security', 'performance', 'optimization', 'integration'
  ]
}

// Complexity indicators
const COMPLEXITY_INDICATORS = {
  very_complex: [
    'detailed analysis', 'comprehensive study', 'multi-step process', 'complex reasoning',
    'advanced analytics', 'strategic planning', 'research paper', 'in-depth investigation',
    'sophisticated model', 'expert-level', 'professional analysis', 'thorough examination'
  ],
  complex: [
    'analysis', 'research', 'strategy', 'detailed', 'comprehensive', 'advanced',
    'professional', 'business plan', 'market research', 'competitive analysis',
    'multi-faceted', 'intricate', 'elaborate'
  ],
  moderate: [
    'explanation', 'summary', 'comparison', 'recommendation', 'outline', 'overview',
    'description', 'evaluation', 'assessment', 'review', 'planning'
  ],
  simple: [
    'list', 'simple', 'quick', 'basic', 'short', 'brief', 'summarize', 'explain',
    'define', 'what is', 'how to', 'examples', 'tips', 'ideas'
  ]
}

// Risk level indicators
const RISK_INDICATORS = {
  critical: [
    'legal advice', 'medical diagnosis', 'financial recommendation', 'investment advice',
    'regulatory compliance', 'safety protocol', 'emergency response', 'critical decision',
    'high stakes', 'lawsuit', 'patient care', 'life-threatening'
  ],
  high: [
    'financial planning', 'business strategy', 'legal document', 'medical information',
    'compliance review', 'security assessment', 'risk evaluation', 'important decision',
    'significant impact', 'regulatory matter', 'contractual obligation'
  ],
  medium: [
    'business analysis', 'market research', 'content strategy', 'process improvement',
    'planning', 'evaluation', 'assessment', 'recommendation', 'consultation'
  ],
  low: [
    'general information', 'content creation', 'brainstorming', 'creative writing',
    'marketing copy', 'social media', 'blog post', 'documentation', 'education'
  ]
}

export class AITierRouter {
  private static initialized = false

  static async initialize(): Promise<void> {
    if (this.initialized) return

    // Ensure configuration is loaded
    await AITierConfigManager.initialize()
    
    // Initialize budget limits from configuration
    const config = AITierConfigManager.getConfig()
    Object.entries(config.tiers).forEach(([tierName, tierConfig]) => {
      UsageTracker.setBudgetLimit(tierName as AITier, tierConfig.maxMonthlyBudget)
    })

    this.initialized = true
    logger.info('🧠 AI Tier Router initialized');
    
    // Log development mode status
    if (this.isDevelopmentMode()) {
      logger.info('🔧 Running in development mode - will prefer mock services');
    }
  }

  /**
   * Check if running in development mode
   */
  private static isDevelopmentMode(): boolean {
    return process.env.NODE_ENV === 'development' || 
           process.env.NODE_ENV === 'test' ||
           !process.env.NODE_ENV
  }

  /**
   * Route a request to the optimal AI tier and service
   */
  static async routeRequest(request: AIRequest): Promise<RoutingDecision> {
    await this.initialize()

    // Analyze the request
    const analysis = this.analyzeRequest(request)
    
    // Determine optimal tier
    const selectedTier = this.selectOptimalTier(analysis, request)
    
    // Select best provider for the tier
    const selectedProvider = await this.selectProviderForTier(selectedTier, analysis, request)
    
    // Generate fallback chain
    const fallbackChain = this.generateFallbackChain(selectedTier, analysis)
    
    // Calculate estimates
    const estimatedCost = this.estimateCost(selectedProvider, analysis)
    const estimatedTime = this.estimateResponseTime(selectedProvider)
    
    // Generate explanation
    const reasoning = this.generateRoutingReasoning(selectedTier, selectedProvider, analysis, request)
    
    const decision: RoutingDecision = {
      selectedTier,
      selectedProvider,
      fallbackChain,
      estimatedCost,
      estimatedTime,
      reasoning,
      confidence: this.calculateConfidence(analysis, selectedTier, selectedProvider)
    }

    logger.info(`🎯 Routing decision: ${request.type} -> ${selectedTier} (${selectedProvider})`)
    logger.info(`💰 Estimated cost: $${estimatedCost.toFixed(4)}, ⏱️ Time: ${estimatedTime}ms`)
    
    return decision
  }

  /**
   * Analyze request to determine complexity, risk, and domain
   */
  static analyzeRequest(request: AIRequest): RequestAnalysis {
    const content = (request.content || '').toLowerCase()
    const type = (request.type || '').toLowerCase()
    const context = JSON.stringify(request.context || {}).toLowerCase()
    const fullText = `${content} ${type} ${context}`

    // Determine domain
    const domain = this.classifyDomain(fullText, request.domain)
    
    // Determine complexity
    const complexity = this.assessComplexity(fullText, request)
    
    // Determine risk level
    const riskLevel = this.assessRiskLevel(fullText, domain, request)
    
    // Estimate token usage
    const estimatedTokens = this.estimateTokenUsage(content, type)
    
    // Determine urgency
    const urgency = this.assessUrgency(request)
    
    // Assess creativity requirement
    const creativityRequired = this.assessCreativityRequirement(fullText, type)
    
    // Assess analytical depth
    const analyticalDepth = this.assessAnalyticalDepth(fullText, complexity)
    
    // Calculate confidence requirement
    const confidenceRequired = this.calculateConfidenceRequirement(riskLevel, domain)

    return {
      complexity,
      riskLevel,
      estimatedTokens,
      domain,
      urgency,
      creativityRequired,
      analyticalDepth,
      confidenceRequired
    }
  }

  private static classifyDomain(text: string, explicitDomain?: string): string {
    if (explicitDomain) return explicitDomain

    let maxScore = 0
    let detectedDomain = 'general'

    Object.entries(DOMAIN_PATTERNS).forEach(([domain, patterns]) => {
      const score = patterns.reduce((acc, pattern) => 
        acc + (text.includes(pattern) ? 1 : 0), 0
      )
      
      if (score > maxScore) {
        maxScore = score
        detectedDomain = domain
      }
    })

    return detectedDomain
  }

  private static assessComplexity(text: string, request: AIRequest): ComplexityLevel {
    // Check for explicit complexity hints
    if (request.context?.complexity) {
      return request.context.complexity as ComplexityLevel
    }

    // Analyze text for complexity indicators
    let complexityScore = 0
    
    Object.entries(COMPLEXITY_INDICATORS).forEach(([level, indicators]) => {
      const matches = indicators.reduce((acc, indicator) => 
        acc + (text.includes(indicator) ? 1 : 0), 0
      )
      
      if (matches > 0) {
        switch (level) {
          case 'very_complex': complexityScore = Math.max(complexityScore, 4); break
          case 'complex': complexityScore = Math.max(complexityScore, 3); break
          case 'moderate': complexityScore = Math.max(complexityScore, 2); break
          case 'simple': complexityScore = Math.max(complexityScore, 1); break
        }
      }
    })

    // Consider text length as complexity factor
    const textLength = text.length
    if (textLength > 5000) complexityScore = Math.max(complexityScore, 4)
    else if (textLength > 2000) complexityScore = Math.max(complexityScore, 3)
    else if (textLength > 500) complexityScore = Math.max(complexityScore, 2)

    // Map score to complexity level
    if (complexityScore >= 4) return 'very_complex'
    if (complexityScore >= 3) return 'complex'
    if (complexityScore >= 2) return 'moderate'
    return 'simple'
  }

  private static assessRiskLevel(text: string, domain: string, request: AIRequest): RiskLevel {
    // High-risk domains get elevated risk levels
    const highRiskDomains = ['finance', 'legal', 'healthcare', 'medical']
    let baseRiskLevel: RiskLevel = highRiskDomains.includes(domain) ? 'high' : 'low'

    // Check for explicit risk indicators in text
    Object.entries(RISK_INDICATORS).forEach(([level, indicators]) => {
      const matches = indicators.reduce((acc, indicator) => 
        acc + (text.includes(indicator) ? 1 : 0), 0
      )
      
      if (matches > 0) {
        switch (level) {
          case 'critical':
            baseRiskLevel = 'critical'
            break
          case 'high':
            if (baseRiskLevel !== 'critical') baseRiskLevel = 'high'
            break
          case 'medium':
            if (!['critical', 'high'].includes(baseRiskLevel)) baseRiskLevel = 'medium'
            break
        }
      }
    })

    // Check user context for risk tolerance
    if (request.userContext?.riskTolerance === 'conservative') {
      if (baseRiskLevel === 'low') baseRiskLevel = 'medium'
      if (baseRiskLevel === 'medium') baseRiskLevel = 'high'
    }

    return baseRiskLevel
  }

  private static estimateTokenUsage(content: string, type: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    const baseTokens = Math.ceil(content.length / 4)
    
    // Adjust based on request type
    const typeMultipliers: Record<string, number> = {
      'analysis': 2.5,
      'generation': 2.0,
      'modification': 1.5,
      'classification': 1.0,
      'extraction': 1.2
    }
    
    const multiplier = typeMultipliers[type] || 1.5
    return Math.ceil(baseTokens * multiplier)
  }

  private static assessUrgency(request: AIRequest): 'low' | 'medium' | 'high' | 'urgent' {
    if (request.priority) return request.priority
    if (request.maxResponseTime && request.maxResponseTime < 2000) return 'urgent'
    if (request.maxResponseTime && request.maxResponseTime < 5000) return 'high'
    return 'medium'
  }

  private static assessCreativityRequirement(text: string, type: string): boolean {
    const creativeTypes = ['generation', 'creative_writing', 'brainstorming', 'ideation']
    const creativeKeywords = ['creative', 'original', 'innovative', 'unique', 'artistic', 'imaginative']
    
    return creativeTypes.includes(type) || 
           creativeKeywords.some(keyword => text.includes(keyword))
  }

  private static assessAnalyticalDepth(text: string, complexity: ComplexityLevel): 'shallow' | 'moderate' | 'deep' {
    if (complexity === 'very_complex') return 'deep'
    if (complexity === 'complex') return 'deep'
    if (complexity === 'moderate') return 'moderate'
    return 'shallow'
  }

  private static calculateConfidenceRequirement(riskLevel: RiskLevel, domain: string): number {
    let confidence = 0.7 // Base confidence requirement

    // Adjust based on risk level
    switch (riskLevel) {
      case 'critical': confidence = 0.95; break
      case 'high': confidence = 0.85; break
      case 'medium': confidence = 0.75; break
      case 'low': confidence = 0.65; break
    }

    // Adjust based on domain
    const highConfidenceDomains = ['finance', 'legal', 'healthcare']
    if (highConfidenceDomains.includes(domain)) {
      confidence = Math.max(confidence, 0.85)
    }

    return confidence
  }

  /**
   * Select optimal tier based on analysis and constraints
   */
  private static selectOptimalTier(analysis: RequestAnalysis, request: AIRequest): AITier {
    // Use explicit tier if provided
    if (request.tier && this.isTierEnabled(request.tier)) {
      return request.tier
    }

    const config = AITierConfigManager.getConfig()
    
    // Check domain-specific rules first
    const domainTier = config.routing.domainSpecificRules[analysis.domain]
    if (domainTier && this.isTierEnabled(domainTier)) {
      logger.info(`🎯 Using domain-specific tier for ${analysis.domain}: ${domainTier}`);
      return domainTier
    }

    // Check risk level mapping
    const riskTier = config.routing.riskLevelMapping[analysis.riskLevel]
    if (riskTier && this.isTierEnabled(riskTier)) {
      logger.info(`🎯 Using risk-based tier for ${analysis.riskLevel}: ${riskTier}`);
      return riskTier
    }

    // Check complexity mapping
    const complexityTier = config.routing.complexityMapping[analysis.complexity]
    if (complexityTier && this.isTierEnabled(complexityTier)) {
      logger.info(`🎯 Using complexity-based tier for ${analysis.complexity}: ${complexityTier}`);
      return complexityTier
    }

    // Check budget constraints
    if (request.maxCost) {
      const affordableTiers = Object.entries(config.tiers)
        .filter(([_, tierConfig]) => tierConfig.maxCostPerRequest <= request.maxCost && tierConfig.enabled)
        .sort((a, b) => b[1].priority - a[1].priority) // Prefer higher tier within budget
      
      if (affordableTiers.length > 0) {
        const selectedTier = affordableTiers[0][0] as AITier
        logger.info(`💰 Using budget-constrained tier: ${selectedTier}`);
        return selectedTier
      }
    }

    // Check time constraints
    if (request.maxResponseTime) {
      if (request.maxResponseTime < 1000) return 'basic' // Fastest
      if (request.maxResponseTime < 3000) return 'intermediate'
    }

    // Fallback to default tier
    const defaultTier = config.routing.defaultTier
    logger.info(`🔄 Using default tier: ${defaultTier}`);
    return defaultTier
  }

  private static async selectProviderForTier(tier: AITier, analysis: RequestAnalysis, request: AIRequest): Promise<string> {
    // In development mode, always prefer mock services
    if (this.isDevelopmentMode() && !request.forceRealAI) {
      const mockProviders = ['mock-fast', 'mock-premium']
      const tierConfig = AITierConfigManager.getTierConfig(tier)
      
      // Check if tier has mock providers
      const tierMockProviders = []
      if (tierConfig?.providers) {
        for (const provider of tierConfig.providers) {
          if (mockProviders.includes(provider) && await this.isProviderHealthy(provider)) {
            tierMockProviders.push(provider)
          }
        }
      }
      
      if (tierMockProviders.length > 0) {
        logger.info(`🔧 Development mode: Using mock provider ${tierMockProviders[0]} for tier ${tier}`);
        return tierMockProviders[0]
      }
      
      // Fallback to any available mock
      logger.info(`🔧 Development mode: Using fallback mock-premium for tier ${tier}`);
      return 'mock-premium'
    }

    const tierConfig = AITierConfigManager.getTierConfig(tier)
    if (!tierConfig || tierConfig.providers.length === 0) {
      logger.warn(`⚠️ No providers available for tier ${tier}, using fallback`);
      return 'mock-premium'
    }

    // Filter available providers
    const availableProviders = []
    for (const provider of tierConfig.providers) {
      if (await this.isProviderHealthy(provider)) {
        availableProviders.push(provider)
      }
    }

    if (availableProviders.length === 0) {
      logger.warn(`⚠️ No healthy providers for tier ${tier}, using fallback`);
      return 'mock-premium'
    }

    // Use ServiceSelector for optimal provider selection
    return ServiceSelector.selectOptimalServiceForRequest(
      analysis.complexity,
      analysis.riskLevel,
      analysis.domain,
      request.maxCost,
      request.maxResponseTime
    )
  }

  private static generateFallbackChain(primaryTier: AITier, analysis: RequestAnalysis): string[] {
    // In development mode, short-circuit to mock providers
    if (this.isDevelopmentMode()) {
      return ['mock-fast', 'mock-premium']
    }

    const config = AITierConfigManager.getConfig()
    const fallbackChain: string[] = []
    
    let currentTier: AITier | undefined = primaryTier
    const visited = new Set<AITier>()

    while (currentTier && !visited.has(currentTier) && fallbackChain.length < 3) {
      visited.add(currentTier)
      
      const tierConfig = config.tiers[currentTier]
      if (tierConfig?.fallbackTier && config.tiers[tierConfig.fallbackTier]?.enabled) {
        const fallbackProvider = ServiceSelector.selectOptimalServiceForRequest(
          analysis.complexity,
          analysis.riskLevel,
          analysis.domain
        )
        
        if (fallbackProvider && !fallbackChain.includes(fallbackProvider)) {
          fallbackChain.push(fallbackProvider)
        }
        
        currentTier = tierConfig.fallbackTier
      } else {
        break
      }
    }

    // Always ensure mock service as final fallback
    if (!fallbackChain.includes('mock-premium')) {
      fallbackChain.push('mock-premium')
    }

    return fallbackChain
  }

  private static estimateCost(provider: string, analysis: RequestAnalysis): number {
    const service = AI_SERVICES[provider]
    if (!service) return 0

    // Base cost from service
    const baseCost = service.costPerRequest
    
    // Adjust based on estimated token usage
    const tokenMultiplier = Math.max(1, analysis.estimatedTokens / 1000)
    
    return baseCost * tokenMultiplier
  }

  private static estimateResponseTime(provider: string): number {
    const service = AI_SERVICES[provider]
    return service?.avgResponseTime || 2000
  }

  private static generateRoutingReasoning(
    tier: AITier, 
    provider: string, 
    analysis: RequestAnalysis, 
    request: AIRequest
  ): string {
    const reasons = []

    reasons.push(`Selected ${tier} tier for ${analysis.complexity} complexity and ${analysis.riskLevel} risk`)
    
    if (analysis.domain !== 'general') {
      reasons.push(`Domain: ${analysis.domain}`)
    }
    
    if (request.maxCost) {
      reasons.push(`Budget constraint: $${request.maxCost}`)
    }
    
    if (request.maxResponseTime) {
      reasons.push(`Time constraint: ${request.maxResponseTime}ms`)
    }

    const service = AI_SERVICES[provider]
    if (service) {
      reasons.push(`Provider: ${service.name} (quality: ${(service.qualityScore * 100).toFixed(0)}%)`)
    }

    return reasons.join('. ')
  }

  private static calculateConfidence(
    analysis: RequestAnalysis, 
    tier: AITier, 
    provider: string
  ): number {
    let confidence = 0.8 // Base confidence

    // Adjust based on service quality
    const service = AI_SERVICES[provider]
    if (service) {
      confidence = (confidence + service.qualityScore + service.reliabilityScore) / 3
    }

    // Adjust based on tier appropriateness
    const config = AITierConfigManager.getConfig()
    const tierConfig = config.tiers[tier]
    
    if (tierConfig) {
      // Check if tier rules match the analysis
      const ruleMatches = tierConfig.rules.filter(rule => {
        switch (rule.type) {
          case 'complexity':
            return rule.value.includes(analysis.complexity)
          case 'risk_level':
            return rule.value.includes(analysis.riskLevel)
          case 'domain':
            return rule.value.includes(analysis.domain)
          default:
            return false
        }
      })
      
      if (ruleMatches.length > 0) {
        const avgWeight = ruleMatches.reduce((sum, rule) => sum + rule.weight, 0) / ruleMatches.length
        confidence = Math.min(1, confidence + avgWeight * 0.2)
      }
    }

    return Math.round(confidence * 100) / 100
  }

  // Utility methods
  private static isTierEnabled(tier: AITier): boolean {
    const tierConfig = AITierConfigManager.getTierConfig(tier)
    return tierConfig?.enabled || false
  }

  private static async isProviderHealthy(provider: string): Promise<boolean> {
    // ✅ EXPERT OPTIMIZATION: Use cached health checks with circuit breaker
    const { HealthCheckService } = await import('./health-check.service')
    return await HealthCheckService.isProviderHealthy(provider)
  }

  // Static analysis methods for external use
  static classifyRequestDomain(content: string): string {
    return this.classifyDomain(content.toLowerCase())
  }

  static assessRequestComplexity(content: string, context?: any): ComplexityLevel {
    return this.assessComplexity(content.toLowerCase(), { content, context } as AIRequest)
  }

  static assessRequestRisk(content: string, domain?: string): RiskLevel {
    return this.assessRiskLevel(content.toLowerCase(), domain || 'general', { content } as AIRequest)
  }
}

export default AITierRouter