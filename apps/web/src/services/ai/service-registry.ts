import { AIService, AITier, RiskLevel, ComplexityLevel } from './types'
import { logger } from '@/utils/logger';

// AI Service Registry - Central configuration for all AI services
export const AI_SERVICES: Record<string, AIService> = {
  // OpenAI Services
  'openai-gpt4o': {
    name: 'GPT-4o',
    provider: 'openai',
    model: 'gpt-4o',
    tier: 'premium',
    capabilities: [
      {
        type: 'analysis',
        specialty: 'business_strategy',
        quality: 'premium',
        useCase: ['business_analysis', 'strategic_planning', 'market_research', 'spec_generation']
      },
      {
        type: 'creative_writing',
        specialty: 'marketing_copy',
        quality: 'premium',
        useCase: ['taglines', 'brand_story', 'value_propositions']
      }
    ],
    costPerRequest: 0.03,
    avgResponseTime: 2000,
    maxTokens: 8192,
    rateLimit: {
      requestsPerMinute: 200,
      tokensPerMinute: 40000
    },
    riskLevelSupport: ['low', 'medium', 'high', 'critical'],
    complexitySupport: ['moderate', 'complex', 'very_complex'],
    domainSpecialization: ['finance', 'legal', 'healthcare', 'business'],
    qualityScore: 0.95,
    reliabilityScore: 0.92
  },

  'openai-gpt4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    tier: 'intermediate',
    capabilities: [
      {
        type: 'analysis',
        specialty: 'business_analysis',
        quality: 'balanced',
        useCase: ['business_analysis', 'content_generation', 'feature_recommendations', 'spec_generation']
      },
      {
        type: 'creative_writing',
        specialty: 'marketing_copy',
        quality: 'balanced',
        useCase: ['taglines', 'descriptions', 'marketing_content']
      }
    ],
    costPerRequest: 0.01,
    avgResponseTime: 1200,
    maxTokens: 4096,
    rateLimit: {
      requestsPerMinute: 500,
      tokensPerMinute: 60000
    },
    riskLevelSupport: ['low', 'medium', 'high'],
    complexitySupport: ['simple', 'moderate', 'complex'],
    domainSpecialization: ['general', 'business', 'marketing'],
    qualityScore: 0.85,
    reliabilityScore: 0.90
  },

  'openai-gpt3.5': {
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    tier: 'basic',
    capabilities: [
      {
        type: 'text_generation',
        specialty: 'content_creation',
        quality: 'fast',
        useCase: ['business_names', 'feature_descriptions', 'quick_content', 'spec_generation']
      },
      {
        type: 'classification',
        specialty: 'categorization',
        quality: 'fast',
        useCase: ['business_type', 'industry_classification', 'audience_segmentation']
      }
    ],
    costPerRequest: 0.002,
    avgResponseTime: 800,
    maxTokens: 4096,
    rateLimit: {
      requestsPerMinute: 3500,
      tokensPerMinute: 90000
    },
    riskLevelSupport: ['low', 'medium'],
    complexitySupport: ['simple', 'moderate'],
    domainSpecialization: ['general'],
    qualityScore: 0.75,
    reliabilityScore: 0.88
  },

  // Claude Services
  'claude-opus': {
    name: 'Claude Opus',
    provider: 'claude',
    model: 'claude-3-opus',
    tier: 'premium',
    capabilities: [
      {
        type: 'analysis',
        specialty: 'deep_reasoning',
        quality: 'premium',
        useCase: ['strategic_analysis', 'complex_reasoning', 'research', 'spec_generation']
      },
      {
        type: 'creative_writing',
        specialty: 'narrative_content',
        quality: 'premium',
        useCase: ['brand_stories', 'detailed_descriptions', 'strategic_copy']
      }
    ],
    costPerRequest: 0.075,
    avgResponseTime: 2500,
    maxTokens: 100000,
    rateLimit: {
      requestsPerMinute: 500,
      tokensPerMinute: 40000
    },
    riskLevelSupport: ['low', 'medium', 'high', 'critical'],
    complexitySupport: ['complex', 'very_complex'],
    domainSpecialization: ['finance', 'legal', 'healthcare', 'research'],
    qualityScore: 0.98,
    reliabilityScore: 0.94
  },

  'claude-sonnet': {
    name: 'Claude Sonnet',
    provider: 'claude',
    model: 'claude-3-sonnet',
    tier: 'advanced',
    capabilities: [
      {
        type: 'analysis',
        specialty: 'deep_reasoning',
        quality: 'premium',
        useCase: ['audience_profiling', 'competitive_analysis', 'content_strategy', 'spec_generation']
      },
      {
        type: 'creative_writing',
        specialty: 'narrative_content',
        quality: 'premium',
        useCase: ['brand_stories', 'detailed_descriptions', 'strategic_copy']
      }
    ],
    costPerRequest: 0.015,
    avgResponseTime: 1500,
    maxTokens: 100000,
    rateLimit: {
      requestsPerMinute: 1000,
      tokensPerMinute: 50000
    },
    riskLevelSupport: ['low', 'medium', 'high'],
    complexitySupport: ['moderate', 'complex'],
    domainSpecialization: ['business', 'creative', 'analysis'],
    qualityScore: 0.90,
    reliabilityScore: 0.91
  },

  'claude-haiku': {
    name: 'Claude Haiku',
    provider: 'claude',
    model: 'claude-3-haiku',
    tier: 'basic',
    capabilities: [
      {
        type: 'text_generation',
        specialty: 'quick_responses',
        quality: 'fast',
        useCase: ['simple_analysis', 'content_generation', 'classification', 'spec_generation']
      }
    ],
    costPerRequest: 0.001,
    avgResponseTime: 600,
    maxTokens: 8192,
    rateLimit: {
      requestsPerMinute: 2000,
      tokensPerMinute: 100000
    },
    riskLevelSupport: ['low', 'medium'],
    complexitySupport: ['simple', 'moderate'],
    domainSpecialization: ['general'],
    qualityScore: 0.78,
    reliabilityScore: 0.89
  },

  // Claude Worker Service - Optimized for web page design and modifications
  'claude-worker': {
    name: 'Claude Worker',
    provider: 'claude',
    model: 'claude-worker',
    tier: 'advanced',
    capabilities: [
      {
        type: 'component_generation',
        specialty: 'web_design',
        quality: 'premium',
        useCase: ['webpage_design', 'ui_generation', 'design_modifications', 'component_creation']
      },
      {
        type: 'code_generation',
        specialty: 'frontend_code',
        quality: 'premium',
        useCase: ['html_generation', 'css_styling', 'react_components', 'tailwind_classes']
      },
      {
        type: 'creative_writing',
        specialty: 'web_content',
        quality: 'premium',
        useCase: ['web_copy', 'landing_pages', 'marketing_content', 'ui_text']
      }
    ],
    costPerRequest: 0.02, // Estimated based on Claude API pricing
    avgResponseTime: 3000, // Includes network latency to worker
    maxTokens: 100000, // Claude's high token limit
    rateLimit: {
      requestsPerMinute: 50, // Based on quota system in claudeRunner
      tokensPerMinute: 50000
    },
    riskLevelSupport: ['low', 'medium', 'high'],
    complexitySupport: ['simple', 'moderate', 'complex', 'very_complex'],
    domainSpecialization: ['web_design', 'ui', 'frontend', 'marketing'],
    qualityScore: 0.92,
    reliabilityScore: 0.88 // Slightly lower due to network dependency
  },

  // Mock Services for Development
  'mock-fast': {
    name: 'Mock Fast',
    provider: 'mock',
    model: 'mock-fast',
    tier: 'basic',
    capabilities: [
      {
        type: 'text_generation',
        specialty: 'quick_responses',
        quality: 'fast',
        useCase: ['development', 'testing', 'prototyping', 'spec_generation']
      }
    ],
    costPerRequest: 0,
    avgResponseTime: 300,
    maxTokens: 2048,
    rateLimit: {
      requestsPerMinute: 10000,
      tokensPerMinute: 1000000
    },
    riskLevelSupport: ['low'],
    complexitySupport: ['simple'],
    domainSpecialization: ['development'],
    qualityScore: 0.60,
    reliabilityScore: 0.99
  },

  'mock-premium': {
    name: 'Mock Premium',
    provider: 'mock',
    model: 'mock-premium',
    tier: 'premium',
    capabilities: [
      {
        type: 'analysis',
        specialty: 'comprehensive_analysis',
        quality: 'premium',
        useCase: ['development', 'testing', 'prototyping', 'spec_generation']
      },
      {
        type: 'creative_writing',
        specialty: 'creative_content',
        quality: 'premium',
        useCase: ['development', 'testing', 'prototyping']
      }
    ],
    costPerRequest: 0,
    avgResponseTime: 1500,
    maxTokens: 8192,
    rateLimit: {
      requestsPerMinute: 1000,
      tokensPerMinute: 100000
    },
    riskLevelSupport: ['low', 'medium', 'high', 'critical'],
    complexitySupport: ['simple', 'moderate', 'complex', 'very_complex'],
    domainSpecialization: ['development'],
    qualityScore: 0.90,
    reliabilityScore: 0.99
  }
}

// Service selection logic based on task requirements
export class ServiceSelector {
  static selectBestService(
    taskType: string,
    priority: 'speed' | 'quality' | 'cost',
    useCase: string
  ): string {
    const services = Object.entries(AI_SERVICES)

    // Filter services that support the use case
    const compatibleServices = services.filter(([_, service]) =>
      service.capabilities.some(cap => cap.useCase.includes(useCase))
    )

    if (compatibleServices.length === 0) {
      return 'mock-premium' // Fallback
    }

    // Select based on priority
    switch (priority) {
      case 'speed':
        return compatibleServices.reduce((fastest, [key, service]) => {
          const fastestService = AI_SERVICES[fastest]
          return service.avgResponseTime < fastestService.avgResponseTime ? key : fastest
        }, compatibleServices[0][0])

      case 'quality':
        return compatibleServices.find(([_, service]) =>
          service.capabilities.some(cap => cap.quality === 'premium')
        )?.[0] || compatibleServices[0][0]

      case 'cost':
        return compatibleServices.reduce((cheapest, [key, service]) => {
          const cheapestService = AI_SERVICES[cheapest]
          return service.costPerRequest < cheapestService.costPerRequest ? key : cheapest
        }, compatibleServices[0][0])

      default:
        return compatibleServices[0][0]
    }
  }

  // New tier-aware selection methods
  static getServicesByTier(tier?: AITier): Record<AITier, string[]> | string[] {
    if (tier) {
      return Object.entries(AI_SERVICES)
        .filter(([_, service]) => service.tier === tier)
        .map(([key, _]) => key)
    }
    
    // Return all services grouped by tier
    const servicesByTier: Record<AITier, string[]> = {
      basic: [],
      intermediate: [],
      advanced: [],
      premium: [],
      specialized: []
    }
    
    Object.entries(AI_SERVICES).forEach(([key, service]) => {
      servicesByTier[service.tier].push(key)
    })
    
    return servicesByTier
  }

  static getAvailableServices(): Record<string, AIService> {
    return AI_SERVICES
  }

  static selectServiceForComplexity(
    complexity: ComplexityLevel,
    domain?: string,
    riskLevel?: RiskLevel
  ): string {
    const services = Object.entries(AI_SERVICES)
      .filter(([_, service]) => {
        // Check complexity support
        const supportsComplexity = service.complexitySupport.includes(complexity)
        
        // Check risk level if specified
        const supportsRisk = !riskLevel || service.riskLevelSupport.includes(riskLevel)
        
        // Check domain specialization if specified
        const supportsDomain = !domain || !service.domainSpecialization || 
          service.domainSpecialization.includes(domain) || 
          service.domainSpecialization.includes('general')
        
        return supportsComplexity && supportsRisk && supportsDomain
      })
      .sort((a, b) => {
        // Prefer services with higher quality scores for complex tasks
        if (complexity === 'very_complex' || complexity === 'complex') {
          return b[1].qualityScore - a[1].qualityScore
        }
        // For simple tasks, prefer faster/cheaper services
        return a[1].avgResponseTime - b[1].avgResponseTime
      })

    return services.length > 0 ? services[0][0] : 'mock-premium'
  }

  static selectOptimalServiceForRequest(
    complexity: ComplexityLevel,
    riskLevel: RiskLevel,
    domain: string,
    maxCost?: number,
    maxTime?: number
  ): string {
    const services = Object.entries(AI_SERVICES)
      .filter(([_, service]) => {
        // Must support complexity and risk level
        const supportsComplexity = service.complexitySupport.includes(complexity)
        const supportsRisk = service.riskLevelSupport.includes(riskLevel)
        
        // Check cost constraints
        const withinBudget = !maxCost || service.costPerRequest <= maxCost
        
        // Check time constraints
        const withinTime = !maxTime || service.avgResponseTime <= maxTime
        
        // Check domain specialization
        const supportsDomain = !service.domainSpecialization || 
          service.domainSpecialization.includes(domain) || 
          service.domainSpecialization.includes('general')
        
        return supportsComplexity && supportsRisk && withinBudget && withinTime && supportsDomain
      })
      .map(([key, service]) => ({
        key,
        service,
        // Calculate fitness score based on multiple factors
        score: this.calculateServiceFitnessScore(service, complexity, riskLevel, domain)
      }))
      .sort((a, b) => b.score - a.score)

    return services.length > 0 ? services[0].key : 'mock-premium'
  }

  private static calculateServiceFitnessScore(
    service: AIService,
    complexity: ComplexityLevel,
    riskLevel: RiskLevel,
    domain: string
  ): number {
    let score = 0
    
    // Base quality and reliability scores
    score += service.qualityScore * 40
    score += service.reliabilityScore * 30
    
    // Bonus for exact complexity match
    const complexityIndex = ['simple', 'moderate', 'complex', 'very_complex'].indexOf(complexity)
    const serviceMaxComplexity = Math.max(...service.complexitySupport.map(c => 
      ['simple', 'moderate', 'complex', 'very_complex'].indexOf(c)
    ))
    
    if (serviceMaxComplexity >= complexityIndex) {
      score += 20
    }
    
    // Bonus for risk level support
    if (service.riskLevelSupport.includes(riskLevel)) {
      score += 10
    }
    
    // Bonus for domain specialization
    if (service.domainSpecialization?.includes(domain)) {
      score += 15
    }
    
    // Penalty for over-engineering (using premium service for simple tasks)
    if (complexity === 'simple' && service.tier === 'premium') {
      score -= 25
    }
    
    // Penalty for under-engineering (using basic service for complex tasks)
    if ((complexity === 'complex' || complexity === 'very_complex') && service.tier === 'basic') {
      score -= 30
    }
    
    return score
  }

  static getServiceCapabilities(serviceKey: string): string[] {
    const service = AI_SERVICES[serviceKey]
    return service?.capabilities.flatMap(cap => cap.useCase) || []
  }

  static estimateCost(serviceKey: string, estimatedTokens: number): number {
    const service = AI_SERVICES[serviceKey]
    if (!service) return 0

    // Simplified cost calculation
    return service.costPerRequest * (estimatedTokens / 1000)
  }

  static isServiceAvailable(serviceKey: string): boolean {
    // In development, mock services are always available
    const service = AI_SERVICES[serviceKey]
    if (service?.provider === 'mock') return true

    // For production services, check API keys and rate limits
    return this.checkServiceHealth(serviceKey)
  }

  private static checkServiceHealth(serviceKey: string): boolean {
    // TODO: Implement actual health checks
    // For now, assume production services are available if API keys exist
    const service = AI_SERVICES[serviceKey]

    switch (service.provider) {
      case 'openai':
        return !!process.env.OPENAI_API_KEY
      case 'claude':
        // Special handling for claude-worker
        if (serviceKey === 'claude-worker') {
          return !!process.env.NEXT_PUBLIC_CLAUDE_WORKER_URL && 
                 !!process.env.NEXT_PUBLIC_CLAUDE_SHARED_SECRET
        }
        return !!process.env.CLAUDE_API_KEY
      default:
        return true
    }
  }
}

// Enhanced usage tracking for tier-aware cost management
export class UsageTracker {
  private static usage: Map<string, {
    requests: number
    tokens: number
    cost: number
    lastReset: Date
  }> = new Map()

  // New tier-specific tracking
  private static tierUsage: Map<AITier, {
    requests: number
    tokens: number
    cost: number
    successfulRequests: number
    failedRequests: number
    avgResponseTime: number
    lastReset: Date
  }> = new Map()

  private static domainUsage: Map<string, {
    requests: number
    cost: number
    tier: AITier
    lastUsed: Date
  }> = new Map()

  private static monthlyBudgets: Map<AITier, {
    budgetLimit: number
    currentSpend: number
    resetDate: Date
  }> = new Map()

  // Legacy methods (maintained for backward compatibility)
  static trackUsage(serviceKey: string, tokensUsed: number, cost: number) {
    const current = this.usage.get(serviceKey) || {
      requests: 0,
      tokens: 0,
      cost: 0,
      lastReset: new Date()
    }

    current.requests++
    current.tokens += tokensUsed
    current.cost += cost

    this.usage.set(serviceKey, current)
  }

  static getUsageStats(serviceKey: string) {
    return this.usage.get(serviceKey) || {
      requests: 0,
      tokens: 0,
      cost: 0,
      lastReset: new Date()
    }
  }

  static getTotalCost(): number {
    return Array.from(this.usage.values()).reduce((total, stats) => total + stats.cost, 0)
  }

  static resetUsageStats() {
    this.usage.clear()
  }

  // New tier-aware tracking methods
  static trackTierUsage(
    tier: AITier,
    serviceKey: string,
    tokensUsed: number,
    cost: number,
    responseTime: number,
    success: boolean,
    domain?: string
  ) {
    // Track by tier
    const tierStats = this.tierUsage.get(tier) || {
      requests: 0,
      tokens: 0,
      cost: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      lastReset: new Date()
    }

    tierStats.requests++
    tierStats.tokens += tokensUsed
    tierStats.cost += cost
    
    if (success) {
      tierStats.successfulRequests++
    } else {
      tierStats.failedRequests++
    }

    // Update average response time
    const totalResponseTime = tierStats.avgResponseTime * (tierStats.requests - 1) + responseTime
    tierStats.avgResponseTime = totalResponseTime / tierStats.requests

    this.tierUsage.set(tier, tierStats)

    // Track by domain if provided
    if (domain) {
      const domainStats = this.domainUsage.get(domain) || {
        requests: 0,
        cost: 0,
        tier,
        lastUsed: new Date()
      }

      domainStats.requests++
      domainStats.cost += cost
      domainStats.tier = tier // Track the tier most recently used for this domain
      domainStats.lastUsed = new Date()

      this.domainUsage.set(domain, domainStats)
    }

    // Update monthly budget tracking
    this.updateMonthlyBudget(tier, cost)

    // Also track legacy usage for backward compatibility
    this.trackUsage(serviceKey, tokensUsed, cost)
  }

  static getTierUsageStats(tier: AITier) {
    return this.tierUsage.get(tier) || {
      requests: 0,
      tokens: 0,
      cost: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      lastReset: new Date()
    }
  }

  static getAllTierUsageStats() {
    const stats: Record<string, any> = {}
    
    for (const [tier, usage] of this.tierUsage.entries()) {
      stats[tier] = {
        ...usage,
        successRate: usage.requests > 0 ? usage.successfulRequests / usage.requests : 0,
        costPerRequest: usage.requests > 0 ? usage.cost / usage.requests : 0
      }
    }
    
    return stats
  }

  static getDomainUsageStats(domain?: string) {
    if (domain) {
      return this.domainUsage.get(domain)
    }
    
    // Return all domain usage stats
    const domainStats: Record<string, any> = {}
    for (const [domain, usage] of this.domainUsage.entries()) {
      domainStats[domain] = usage
    }
    return domainStats
  }

  static getMonthlyBudgetStatus(tier?: AITier) {
    if (tier) {
      return this.monthlyBudgets.get(tier)
    }
    
    // Return all budget statuses
    const budgetStatuses: Record<string, any> = {}
    for (const [tier, budget] of this.monthlyBudgets.entries()) {
      budgetStatuses[tier] = {
        ...budget,
        utilizationPercentage: budget.budgetLimit > 0 ? (budget.currentSpend / budget.budgetLimit) * 100 : 0,
        remainingBudget: budget.budgetLimit - budget.currentSpend
      }
    }
    return budgetStatuses
  }

  private static updateMonthlyBudget(tier: AITier, cost: number) {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    let budget = this.monthlyBudgets.get(tier)
    
    if (!budget || budget.resetDate.getMonth() !== currentMonth || budget.resetDate.getFullYear() !== currentYear) {
      // Reset budget for new month
      budget = {
        budgetLimit: 0, // Will be set from tier config
        currentSpend: 0,
        resetDate: new Date(currentYear, currentMonth, 1)
      }
    }

    budget.currentSpend += cost
    this.monthlyBudgets.set(tier, budget)
  }

  static setBudgetLimit(tier: AITier, budgetLimit: number) {
    const budget = this.monthlyBudgets.get(tier) || {
      budgetLimit: 0,
      currentSpend: 0,
      resetDate: new Date()
    }
    
    budget.budgetLimit = budgetLimit
    this.monthlyBudgets.set(tier, budget)
  }

  static checkBudgetExceeded(tier: AITier): boolean {
    const budget = this.monthlyBudgets.get(tier)
    if (!budget || budget.budgetLimit <= 0) return false
    
    return budget.currentSpend >= budget.budgetLimit
  }

  static getBudgetUtilization(tier?: AITier): number {
    if (tier) {
      const budget = this.monthlyBudgets.get(tier)
      if (!budget || budget.budgetLimit <= 0) return 0
      
      return (budget.currentSpend / budget.budgetLimit) * 100
    }
    
    // Return overall budget utilization
    const allBudgets = Array.from(this.monthlyBudgets.values())
    if (allBudgets.length === 0) return 0

    const totalBudget = allBudgets.reduce((sum, budget) => sum + budget.budgetLimit, 0)
    const totalSpent = allBudgets.reduce((sum, budget) => sum + budget.currentSpend, 0)

    return totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  }

  // Analytics and optimization methods
  static getTopCostDrivers(limit: number = 5): Array<{
    category: string
    cost: number
    percentage: number
  }> {
    const totalCost = this.getTotalCostByTier()
    const drivers: Array<{ category: string; cost: number; percentage: number }> = []

    // Add tier costs
    for (const [tier, usage] of this.tierUsage.entries()) {
      if (usage.cost > 0) {
        drivers.push({
          category: `Tier: ${tier}`,
          cost: usage.cost,
          percentage: totalCost > 0 ? (usage.cost / totalCost) * 100 : 0
        })
      }
    }

    // Add domain costs
    for (const [domain, usage] of this.domainUsage.entries()) {
      if (usage.cost > 0) {
        drivers.push({
          category: `Domain: ${domain}`,
          cost: usage.cost,
          percentage: totalCost > 0 ? (usage.cost / totalCost) * 100 : 0
        })
      }
    }

    return drivers
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit)
  }

  static getTotalCostByTier(): number {
    return Array.from(this.tierUsage.values()).reduce((total, stats) => total + stats.cost, 0)
  }

  static getAverageCostPerRequest(tier?: AITier): number {
    if (tier) {
      const stats = this.getTierUsageStats(tier)
      return stats.requests > 0 ? stats.cost / stats.requests : 0
    }

    const totalCost = this.getTotalCostByTier()
    const totalRequests = Array.from(this.tierUsage.values()).reduce((total, stats) => total + stats.requests, 0)
    
    return totalRequests > 0 ? totalCost / totalRequests : 0
  }

  static getSuccessRate(tier?: AITier): number {
    if (tier) {
      const stats = this.getTierUsageStats(tier)
      return stats.requests > 0 ? stats.successfulRequests / stats.requests : 0
    }

    const totalRequests = Array.from(this.tierUsage.values()).reduce((total, stats) => total + stats.requests, 0)
    const totalSuccessful = Array.from(this.tierUsage.values()).reduce((total, stats) => total + stats.successfulRequests, 0)
    
    return totalRequests > 0 ? totalSuccessful / totalRequests : 0
  }

  static resetTierUsageStats() {
    this.tierUsage.clear()
    this.domainUsage.clear()
    logger.info('🔄 Tier usage statistics reset');
  }

  static resetMonthlyBudgets() {
    for (const [tier, budget] of this.monthlyBudgets.entries()) {
      budget.currentSpend = 0
      budget.resetDate = new Date()
      this.monthlyBudgets.set(tier, budget)
    }
    logger.info('🔄 Monthly budgets reset');
  }

  // Additional methods for API compatibility
  static getTotalRequests(): number {
    return Array.from(this.tierUsage.values()).reduce((total, stats) => total + stats.requests, 0)
  }

  static getRequestsInTimeframe(startDate: Date, endDate: Date): number {
    // For now, return recent requests since we don't track by date
    // In a real implementation, you'd filter by date
    return this.getTotalRequests()
  }

  static getRequestsByTier(): Record<AITier, number> {
    const requestsByTier: Record<AITier, number> = {
      basic: 0,
      intermediate: 0,
      advanced: 0,
      premium: 0,
      specialized: 0
    }

    for (const [tier, stats] of this.tierUsage.entries()) {
      requestsByTier[tier] = stats.requests
    }

    return requestsByTier
  }

  static getCostByTier(): Record<AITier, number> {
    const costByTier: Record<AITier, number> = {
      basic: 0,
      intermediate: 0,
      advanced: 0,
      premium: 0,
      specialized: 0
    }

    for (const [tier, stats] of this.tierUsage.entries()) {
      costByTier[tier] = stats.cost
    }

    return costByTier
  }

  static getRecentRequests(limit: number): Array<any> {
    // Simplified implementation - in real app would track individual requests
    const requests: Array<any> = []
    
    for (const [tier, stats] of this.tierUsage.entries()) {
      if (stats.requests > 0) {
        requests.push({
          tier,
          requests: stats.requests,
          cost: stats.cost,
          avgResponseTime: stats.avgResponseTime,
          successRate: stats.requests > 0 ? stats.successfulRequests / stats.requests : 0,
          timestamp: stats.lastReset
        })
      }
    }

    return requests.slice(0, limit)
  }

  static getAverageResponseTime(): number {
    const allStats = Array.from(this.tierUsage.values())
    if (allStats.length === 0) return 0

    const totalResponseTime = allStats.reduce((sum, stats) => sum + (stats.avgResponseTime * stats.requests), 0)
    const totalRequests = allStats.reduce((sum, stats) => sum + stats.requests, 0)

    return totalRequests > 0 ? totalResponseTime / totalRequests : 0
  }

  static clear(): void {
    this.usage.clear()
    this.tierUsage.clear()
    this.domainUsage.clear()
    this.monthlyBudgets.clear()
    logger.info('🔄 All usage tracking data cleared');
  }
}
