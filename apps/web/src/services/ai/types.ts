// Core AI service types and interfaces

// AI Tier Classifications
export type AITier = 'basic' | 'intermediate' | 'advanced' | 'premium' | 'specialized'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'very_complex'

export type AIProvider = 
  | 'openai-gpt4o' 
  | 'openai-gpt4o-mini' 
  | 'openai-gpt3.5'
  | 'claude-opus' 
  | 'claude-sonnet'
  | 'claude-worker' 
  | 'claude-haiku'
  | 'mock' 
  | 'mock-fast' 
  | 'mock-premium'

export interface AIService {
  name: string
  provider: 'openai' | 'claude' | 'mock'
  model: string
  tier: AITier
  capabilities: AICapability[]
  costPerRequest: number
  avgResponseTime: number
  maxTokens: number
  rateLimit: {
    requestsPerMinute: number
    tokensPerMinute: number
  }
  // New tier-specific properties
  riskLevelSupport: RiskLevel[]
  complexitySupport: ComplexityLevel[]
  domainSpecialization?: string[]
  qualityScore: number // 0-1
  reliabilityScore: number // 0-1
}

// Extended service interface with methods
export interface AIServiceMethods {
  processRequest(request: AIRequest): Promise<AIResponse>
  processRequestStream?(request: AIRequest): AsyncGenerator<StreamingAIResponse>
  analyzeBusinessIdea?(idea: string, serviceKey?: string): Promise<AIResponse<BusinessAnalysis>>
  generateBusinessNames?(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<BusinessName[]>>
  generateTaglines?(analysis: BusinessAnalysis, name: string, serviceKey?: string): Promise<AIResponse<BusinessTagline[]>>
  recommendFeatures?(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<FeatureRecommendation[]>>
  generatePricingStrategy?(analysis: BusinessAnalysis, serviceKey?: string): Promise<AIResponse<PricingStrategy>>
  generateCompletion?(prompt: string, serviceKey?: string): Promise<string>
  generateProjectFromSpec?(specBlock: any, serviceKey?: string): Promise<AIResponse<any>>
}

export interface AICapability {
  type: 'text_generation' | 'analysis' | 'classification' | 'extraction' | 'creative_writing' | 'component_generation' | 'code_generation'
  specialty: string
  quality: 'fast' | 'balanced' | 'premium'
  useCase: string[]
}

export interface AIPrompt {
  system: string
  user: string
  constraints: {
    maxTokens: number
    temperature: number
    requiresStructuredOutput?: boolean
    requiresCreativity?: boolean
    streaming?: boolean
  }
  metadata?: {
    promptType: string
    expectedResponseFormat: 'json' | 'text' | 'markdown'
    priority: 'low' | 'medium' | 'high'
  }
}

export interface AIResponse<T = any> {
  success: boolean
  data: T
  metadata: {
    model: string
    tokensUsed: number
    responseTime: number
    confidence?: number
    cost: number
  }
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export interface StreamingAIResponse {
  type: 'start' | 'chunk' | 'insight' | 'recommendation' | 'complete' | 'error'
  content: string
  metadata?: {
    confidence?: number
    progress?: number
    chunkIndex?: number
  }
}

// Business analysis types
export interface BusinessAnalysis {
  businessType: 'saas' | 'ecommerce' | 'service' | 'marketplace' | 'content' | 'consulting' | 'local_business'
  industry: string
  subCategory: string
  coreOffering: string
  valuePropositions: string[]
  targetAudience: string
  demographics: {
    ageRange: string
    income: string
    geography: string
    lifestyle: string[]
  }
  psychographics: {
    values: string[]
    interests: string[]
    painPoints: string[]
    motivations: string[]
  }
  businessModel: 'b2b' | 'b2c' | 'b2b2c' | 'marketplace'
  revenueModel: 'subscription' | 'one_time' | 'freemium' | 'commission' | 'advertising' | 'service_based'
  geographicScope: 'local' | 'regional' | 'national' | 'global'
  brandPersonality: string[]
  communicationStyle: 'formal' | 'casual' | 'technical' | 'emotional' | 'authoritative' | 'friendly'
  differentiators: string[]
  marketOpportunities: string[]
  challenges: string[]
  confidence: number
  keyInsights: string[]
  competitiveAdvantages: string[]
}

export interface BusinessName {
  name: string
  reasoning: string
  brandFit: number // 0-1
  memorability: number // 0-1
  availability: {
    domain: boolean
    trademark: boolean
    social: {
      instagram: boolean
      twitter: boolean
      facebook: boolean
    }
  }
  alternatives: string[]
  tags: string[]
}

export interface BusinessTagline {
  text: string
  style: 'benefit_focused' | 'emotional' | 'descriptive' | 'question' | 'challenge'
  psychologicalTrigger: string
  targetEmotion: string
  wordCount: number
  memorability: number
  brandFit: number
  explanation: string
}

export interface FeatureRecommendation {
  name: string
  description: string
  priority: 'must_have' | 'should_have' | 'nice_to_have'
  category: 'core' | 'growth' | 'optimization' | 'engagement'
  complexity: 'simple' | 'moderate' | 'complex'
  estimatedCost: 'low' | 'medium' | 'high'
  reasoning: string
  benefits: string[]
  examples: string[]
  integrations?: string[]
}

export interface PricingStrategy {
  model: 'freemium' | 'subscription' | 'one_time' | 'usage_based' | 'tiered' | 'custom'
  tiers: PricingTier[]
  reasoning: string
  marketPositioning: 'budget' | 'value' | 'premium' | 'luxury'
  competitiveAnalysis: string
  recommendations: string[]
}

export interface PricingTier {
  name: string
  price: string
  billingCycle?: 'monthly' | 'yearly' | 'one_time'
  description: string
  features: string[]
  limitations?: string[]
  popular?: boolean
  targetSegment: string
  valueProposition: string
}

export interface ContentStrategy {
  tone: string
  messagingFramework: {
    primaryMessage: string
    supportingMessages: string[]
    proofPoints: string[]
  }
  contentTypes: {
    hero: string
    about: string
    features: string[]
    testimonials: string[]
    faqs: string[]
  }
  seoStrategy: {
    primaryKeywords: string[]
    contentTopics: string[]
    competitorGaps: string[]
  }
}

export interface GeneratedBusinessContent {
  analysis: BusinessAnalysis
  names: BusinessName[]
  taglines: BusinessTagline[]
  features: FeatureRecommendation[]
  pricing: PricingStrategy
  contentStrategy: ContentStrategy
  metadata: {
    generationTime: number
    totalCost: number
    confidence: number
    servicesUsed: string[]
  }
}

// Quality scoring
export interface QualityScore {
  relevance: number // 0-1
  creativity: number // 0-1
  brandFit: number // 0-1
  marketAppeal: number // 0-1
  uniqueness: number // 0-1
  overall: number // 0-1
  weakAreas: string[]
  strengths: string[]
}

// User context for personalization
export interface UserContext {
  userId?: string
  prefersConciseResponses: boolean
  industryExpertise?: string
  previousInteractions: number
  preferredCommunicationStyle: 'direct' | 'detailed' | 'creative'
  riskTolerance: 'conservative' | 'balanced' | 'aggressive'
  budgetRange?: 'startup' | 'small_business' | 'enterprise'
}

// Tier routing and request analysis types
export interface AIRequest {
  type: string
  content: string
  context?: any
  userContext?: UserContext
  domain?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  maxCost?: number
  maxResponseTime?: number
  requiresExplainability?: boolean
  tier?: AITier // Optional tier override
  fallbackChain?: AITier[]
  forceRealAI?: boolean // Force real AI even in development mode
  locale?: string // For locale-aware response generation (e.g., Arabic)
}

export interface RequestAnalysis {
  complexity: ComplexityLevel
  riskLevel: RiskLevel
  estimatedTokens: number
  domain: string
  urgency: 'low' | 'medium' | 'high' | 'urgent'
  creativityRequired: boolean
  analyticalDepth: 'shallow' | 'moderate' | 'deep'
  confidenceRequired: number // 0-1
}

export interface RoutingDecision {
  selectedTier: AITier
  selectedProvider: string
  fallbackChain: string[]
  estimatedCost: number
  estimatedTime: number
  reasoning: string
  confidence: number
}

export interface TierConfig {
  name: AITier
  priority: number
  maxCostPerRequest: number
  maxMonthlyBudget: number
  providers: string[]
  fallbackTier?: AITier
  rules: TierRule[]
  enabled: boolean
}

export interface TierRule {
  type: 'domain' | 'complexity' | 'risk_level' | 'user_tier' | 'budget' | 'time_constraint'
  operator: 'equals' | 'in' | 'greater_than' | 'less_than' | 'contains'
  value: any
  weight: number // 0-1, for weighted scoring
}

export interface UsageRecord {
  timestamp: Date
  requestId: string
  tierUsed: AITier
  providerUsed: string
  requestType: string
  domain: string
  tokensUsed: number
  cost: number
  responseTime: number
  success: boolean
  fallbacksUsed: number
  userContext?: UserContext
  satisfaction?: number // User feedback 0-1
}

export interface CostReport {
  timeframe: { start: Date; end: Date }
  totalCost: number
  totalRequests: number
  averageCostPerRequest: number
  costByTier: Record<AITier, number>
  costByProvider: Record<string, number>
  costByDomain: Record<string, number>
  requestVolume: Record<AITier, number>
  projectedMonthlyCost: number
  budgetUtilization: number // 0-1
  topCostDrivers: Array<{
    category: string
    cost: number
    percentage: number
  }>
  optimizationOpportunities: OptimizationSuggestion[]
}

export interface OptimizationSuggestion {
  type: 'tier_optimization' | 'caching_optimization' | 'provider_optimization' | 'batching_optimization'
  impact: 'low' | 'medium' | 'high'
  description: string
  potentialSavings: number
  implementationEffort: 'low' | 'medium' | 'high'
  action: string
  priority: number
}

// Component-specific AI request/response types
export interface AIComponentRequest {
  type: 'generate' | 'modify' | 'enhance'
  componentType: 'header' | 'hero' | 'features' | 'footer' | 'navigation' | 'pricing' | 'testimonials'
  userIntent: string
  style?: string
  requirements?: string
  businessContext: {
    type: string
    personality: string[]
    audience: string[]
    brandName?: string
    industry?: string
  }
  currentComponent?: ComponentDefinition
  constraints?: {
    colors?: string[]
    fonts?: string[]
    maxSections?: number
    requiredElements?: string[]
  }
  examples?: ComponentDefinition[]
}

export interface AIComponentResponse {
  success: boolean
  component?: ComponentDefinition
  data?: ComponentDefinition // Alias for component
  error?: {
    code: string
    message: string
    details?: any
  }
  metadata: {
    model: string
    prompt: string
    reasoning: string
    confidence: number
    processingTime: number
    alternatives: ComponentDefinition[]
    tags: string[]
  }
  feedback?: {
    requestFeedback: boolean
    improvementSuggestions?: string[]
  }
}

export interface ComponentDefinition {
  id: string
  type: string
  name: string
  html: string
  css: string
  props: Record<string, any>
  responsive: {
    mobile?: Partial<ComponentDefinition>
    tablet?: Partial<ComponentDefinition>
  }
  accessibility: {
    ariaLabels: Record<string, string>
    keyboardNavigation: boolean
    screenReaderOptimized: boolean
  }
  seo: {
    structuredData?: Record<string, any>
    metaTags?: Record<string, string>
  }
  performance: {
    lazyLoad: boolean
    criticalCSS: string
    optimizedImages: boolean
  }
}