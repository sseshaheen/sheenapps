// App Refinement Framework - TypeScript Implementation
// Defines the complete type system for the app refinement process

// ===== CORE BUSINESS CONTEXT =====

export interface BusinessContext {
  // Primary Classification
  industry: 'restaurant' | 'salon' | 'consulting' | 'ecommerce' | 'healthcare' | 'education' | 'fitness' | 'real-estate' | 'services' | 'other'
  businessModel: 'b2c' | 'b2b' | 'marketplace' | 'saas' | 'content' | 'community'
  scale: 'local' | 'regional' | 'national' | 'global'
  
  // Target Audience Analysis
  primaryUsers: {
    demographics: 'young-adults' | 'professionals' | 'families' | 'seniors' | 'mixed'
    techSavviness: 'low' | 'medium' | 'high'
    devicePreference: 'mobile-first' | 'desktop-first' | 'tablet-optimized' | 'cross-platform'
    pricesensitivity: 'budget' | 'value' | 'premium' | 'luxury'
  }
  
  // Value Proposition
  coreValue: string // "Quick booking", "Expert advice", "Seamless shopping"
  differentiators: string[] // What makes this business unique
  keyOutcomes: string[] // What success looks like for users
  competitiveAdvantage: string // Main competitive edge
}

// ===== FUNCTIONAL REQUIREMENTS =====

export interface FunctionalNeeds {
  // Core Platform Features
  essential: {
    userManagement: 'none' | 'basic' | 'advanced' | 'enterprise'
    contentManagement: 'static' | 'dynamic' | 'user-generated' | 'collaborative'
    dataCollection: 'none' | 'forms' | 'analytics' | 'comprehensive'
    communications: 'none' | 'email' | 'messaging' | 'multi-channel'
    search: 'none' | 'basic' | 'advanced' | 'ai-powered'
  }
  
  // Business-Specific Features
  businessFeatures: {
    booking?: {
      type: 'simple' | 'complex' | 'recurring' | 'marketplace'
      calendar: boolean
      resources: boolean
      payments: boolean
    }
    ecommerce?: {
      catalog: 'simple' | 'complex' | 'digital' | 'subscription'
      inventory: boolean
      shipping: boolean
      variants: boolean
    }
    content?: {
      blog: boolean
      resources: boolean
      courses: boolean
      community: boolean
    }
    crm?: {
      contacts: boolean
      pipeline: boolean
      automation: boolean
      reporting: boolean
    }
  }
  
  // Integration Requirements
  integrations: {
    priority: 'low' | 'medium' | 'high' | 'critical'
    required: string[] // Must-have integrations
    desired: string[] // Nice-to-have integrations
    budget: 'free-only' | 'low-cost' | 'moderate' | 'enterprise'
  }
}

// ===== DESIGN PREFERENCES =====

export interface DesignPreferences {
  brandPersonality: {
    tone: 'professional' | 'friendly' | 'playful' | 'luxury' | 'minimalist' | 'bold' | 'trustworthy'
    trustLevel: 'corporate' | 'personal' | 'community' | 'expert' | 'innovative'
    energy: 'calm' | 'dynamic' | 'urgent' | 'inspiring' | 'relaxing'
    formality: 'casual' | 'business-casual' | 'formal' | 'academic'
  }
  
  visualStyle: {
    colorApproach: 'brand-driven' | 'industry-standard' | 'user-preference' | 'accessibility-first'
    layout: 'minimal' | 'content-rich' | 'dashboard' | 'storytelling' | 'magazine'
    imagery: 'photography' | 'illustrations' | 'icons' | 'minimal' | 'data-viz'
    typography: 'modern' | 'classic' | 'playful' | 'technical' | 'elegant'
  }
  
  userExperience: {
    complexity: 'simple' | 'moderate' | 'feature-rich' | 'enterprise'
    guidance: 'self-service' | 'guided' | 'assisted' | 'automated'
    customization: 'none' | 'basic' | 'advanced' | 'white-label'
    pace: 'quick' | 'deliberate' | 'exploratory' | 'efficient'
  }
}

// ===== DECISION FRAMEWORK =====

export interface DecisionCategory {
  id: string
  name: string
  description: string
  impact: 'foundation' | 'feature' | 'refinement' | 'polish'
  priority: number // 1-10, lower = earlier in flow
  dependencies?: string[] // Required previous decisions
  applicableWhen?: (context: BusinessContext) => boolean
}

export interface DecisionOption {
  id: string
  title: string
  description: string
  shortDescription: string
  bestFor: string[] // "Small businesses", "E-commerce", etc.
  pros: string[]
  cons?: string[]
  previewImpact: PreviewImpact
  technicalRequirements?: string[]
  estimatedComplexity: 'low' | 'medium' | 'high'
}

export interface RefinementDecision {
  categoryId: string
  category: DecisionCategory
  options: DecisionOption[]
  currentSelection?: string
  reasoning?: string // Why this question is being asked
  context?: string // Additional context for the user
}

// ===== PREVIEW SYSTEM =====

export interface PreviewImpact {
  type: 'layout_update' | 'theme_change' | 'feature_addition' | 'content_change' | 'style_refinement'
  priority: 'high' | 'medium' | 'low'
  affects: string[] // Component IDs or areas that change
  
  changes: {
    layout?: {
      structure?: 'single-page' | 'multi-page' | 'dashboard' | 'wizard'
      navigation?: 'header' | 'sidebar' | 'footer' | 'floating' | 'none'
      grid?: 'simple' | 'masonry' | 'custom' | 'responsive'
      spacing?: 'compact' | 'comfortable' | 'spacious'
    }
    
    styling?: {
      colorScheme?: {
        primary: string
        secondary: string
        accent: string
        background: string
        text: string
      }
      typography?: {
        headingFont: string
        bodyFont: string
        scale: 'small' | 'medium' | 'large'
      }
      components?: {
        buttons: 'rounded' | 'sharp' | 'pill' | 'minimal'
        cards: 'flat' | 'shadow' | 'border' | 'elevated'
        inputs: 'outlined' | 'filled' | 'underlined' | 'minimal'
      }
    }
    
    content?: {
      tone?: 'professional' | 'casual' | 'friendly' | 'expert'
      density?: 'minimal' | 'moderate' | 'detailed' | 'comprehensive'
      mediaRatio?: 'text-heavy' | 'balanced' | 'visual-heavy'
      messaging?: Record<string, string> // Key: component, Value: new text
    }
    
    features?: {
      add?: string[] // Component IDs to add
      remove?: string[] // Component IDs to remove
      modify?: Record<string, any> // Component modifications
      integrations?: string[] // New integrations to enable
    }
  }
  
  dependencies?: string[] // Previous choices this builds on
  conflicts?: string[] // Choices this makes incompatible
}

// ===== PROMPT ANALYSIS =====

export interface PromptAnalysisResult {
  // Direct Information Extraction
  explicit: {
    businessType?: string
    mentionedFeatures: string[]
    statedGoals: string[]
    constraints: string[]
    budget?: 'low' | 'medium' | 'high'
    timeline?: 'asap' | 'weeks' | 'months' | 'flexible'
  }
  
  // AI Inference Results
  implicit: {
    industryBestPractices: string[]
    likelyTargetAudience: Partial<BusinessContext['primaryUsers']>
    complexityIndicators: string[]
    urgencySignals: 'research' | 'planning' | 'immediate' | 'crisis'
    competitorAnalysis?: string[]
  }
  
  // Gap Analysis
  missing: {
    criticalQuestions: string[] // Must ask these
    assumptions: Array<{
      assumption: string
      confidence: number // 0-1
      impact: 'high' | 'medium' | 'low'
    }>
    uncertainties: string[]
  }
  
  // Smart Routing
  recommendedFlow: {
    startingPoint: string // Which decision category to begin with
    priorityOrder: string[] // Optimal question sequence
    skipReasons: Record<string, string> // Why certain questions can be skipped
    focusAreas: string[] // Areas needing extra attention
  }
}

// ===== SMART DEFAULTS =====

export interface SmartDefault {
  value: any
  confidence: number // 0-1, how confident we are
  reasoning: string // Why this default makes sense
  basedOn: 'industry' | 'businessModel' | 'demographics' | 'complexity' | 'explicit'
  alternatives: Array<{
    value: any
    reason: string
    probability: number
  }>
}

export interface DefaultsEngine {
  getDefaultsFor(
    category: string,
    context: Partial<BusinessContext>,
    previousChoices: Record<string, string>
  ): Record<string, SmartDefault>
}

// ===== QUESTION GENERATION =====

export interface QuestionContext {
  businessContext: Partial<BusinessContext>
  previousDecisions: Record<string, string>
  userBehavior: {
    timeOnQuestions: number[]
    changeFrequency: number
    explorationLevel: 'low' | 'medium' | 'high'
  }
  progressMetrics: {
    completionPercentage: number
    confidenceLevel: number
    satisfactionSignals: string[]
  }
}

export interface QuestionGenerationStrategy {
  // Determines which question to ask next
  getNextDecision(context: QuestionContext): RefinementDecision | null
  
  // Customizes question based on context
  customizeQuestion(
    baseDecision: RefinementDecision,
    context: QuestionContext
  ): RefinementDecision
  
  // Validates if question is still relevant
  isQuestionRelevant(
    categoryId: string,
    context: QuestionContext
  ): boolean
  
  // Estimates remaining questions
  estimateRemainingQuestions(context: QuestionContext): number
}

// ===== VALIDATION & QUALITY =====

export interface ValidationResult {
  isValid: boolean
  warnings: string[]
  errors: string[]
  suggestions: string[]
  qualityScore: number // 0-100
}

export interface QualityMetrics {
  completeness: number // How much of the app is defined
  coherence: number // How well choices work together
  feasibility: number // How realistic the requirements are
  userExperience: number // Predicted UX quality
  businessAlignment: number // How well it serves business goals
}

// ===== EXPORT FORMATS =====

export interface RefinementResults {
  businessContext: BusinessContext
  decisions: Record<string, string> // categoryId -> optionId
  previewState: any // Current preview configuration
  qualityMetrics: QualityMetrics
  
  // Export Options
  exports: {
    requirements: string // Detailed requirements document
    designSpecs: string // Design system specification
    technicalSpecs: string // Technical implementation guide
    timeline: string // Estimated development timeline
    budget: string // Cost estimation
  }
}

// ===== SYSTEM INTEGRATION =====

export interface RefinementEngine {
  // Core Operations
  analyzePrompt(prompt: string): Promise<PromptAnalysisResult>
  initializeRefinement(analysis: PromptAnalysisResult): QuestionContext
  getNextQuestion(context: QuestionContext): RefinementDecision | null
  applyDecision(context: QuestionContext, decision: string, option: string): QuestionContext
  
  // Preview Management
  generatePreview(context: QuestionContext): any
  applyPreviewImpact(impact: PreviewImpact): Promise<void>
  
  // Quality & Validation
  validateChoices(context: QuestionContext): ValidationResult
  calculateQuality(context: QuestionContext): QualityMetrics
  
  // Export & Completion
  generateResults(context: QuestionContext): RefinementResults
  exportSpecifications(results: RefinementResults, format: string): string
}

// ===== FRAMEWORK CONSTANTS =====

export const DECISION_CATEGORIES: DecisionCategory[] = [
  {
    id: 'app-architecture',
    name: 'App Architecture',
    description: 'How should your app be structured?',
    impact: 'foundation',
    priority: 1
  },
  {
    id: 'user-access',
    name: 'User Access Strategy', 
    description: 'How should users access your app?',
    impact: 'foundation',
    priority: 2
  },
  {
    id: 'visual-foundation',
    name: 'Visual Foundation',
    description: 'What personality should your app convey?',
    impact: 'foundation', 
    priority: 3
  },
  {
    id: 'content-strategy',
    name: 'Content Strategy',
    description: 'How should information be presented?',
    impact: 'feature',
    priority: 4
  },
  {
    id: 'interaction-model',
    name: 'Interaction Model',
    description: 'How should users interact with your app?',
    impact: 'feature',
    priority: 5
  },
  {
    id: 'communication-style',
    name: 'Communication Style',
    description: 'How should your app communicate with users?',
    impact: 'feature',
    priority: 6
  },
  {
    id: 'mobile-experience',
    name: 'Mobile Experience',
    description: 'How should your app work on mobile devices?',
    impact: 'refinement',
    priority: 7
  },
  {
    id: 'business-features',
    name: 'Business Features',
    description: 'What key business functionality do you need?',
    impact: 'feature',
    priority: 8,
    applicableWhen: (context) => context.businessModel !== 'content'
  },
  {
    id: 'personality-details',
    name: 'Personality Details',
    description: 'What details make your app feel uniquely yours?',
    impact: 'polish',
    priority: 9
  }
]

export const INDUSTRY_DEFAULTS: Record<string, Partial<BusinessContext>> = {
  restaurant: {
    businessModel: 'b2c',
    primaryUsers: {
      demographics: 'mixed',
      techSavviness: 'medium',
      devicePreference: 'mobile-first',
      pricesensitivity: 'budget'
    }
  },
  salon: {
    businessModel: 'b2c', 
    primaryUsers: {
      demographics: 'mixed',
      techSavviness: 'medium',
      devicePreference: 'mobile-first',
      pricesensitivity: 'value'
    }
  },
  consulting: {
    businessModel: 'b2b',
    primaryUsers: {
      demographics: 'professionals',
      techSavviness: 'high',
      devicePreference: 'desktop-first',
      pricesensitivity: 'luxury'
    }
  },
  ecommerce: {
    businessModel: 'b2c',
    primaryUsers: {
      demographics: 'mixed',
      techSavviness: 'medium',
      devicePreference: 'cross-platform',
      pricesensitivity: 'value'
    }
  }
  // ... more industry defaults
}