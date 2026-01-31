// Mock AI Response Types - Ideal JSON structures for AI integration

export interface AIComponentRequest {
  type: 'generate' | 'modify' | 'enhance'
  componentType: 'header' | 'hero' | 'features' | 'footer' | 'navigation' | 'pricing' | 'testimonials'
  userIntent: string                    // "Make it more modern and professional"
  style?: string
  requirements?: string
  businessContext: {
    type: string                        // 'salon', 'restaurant', 'ecommerce'
    personality: string[]               // ['luxury', 'warm', 'professional']
    audience: string[]                  // ['young_professionals', 'families']
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
  examples?: ComponentDefinition[]      // Reference examples
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
    model: string                       // 'gpt-4', 'claude-3'
    prompt: string                      // Actual prompt sent to AI
    reasoning: string                   // Why AI made these choices
    confidence: number                  // 0-100 confidence score
    processingTime: number              // milliseconds
    alternatives: ComponentDefinition[] // Alternative suggestions
    tags: string[]                      // ['modern', 'professional', 'clean']
  }
  feedback?: {
    requestFeedback: boolean           // Should we ask user for feedback?
    improvementSuggestions?: string[]  // Suggestions for further enhancement
  }
}

export interface ComponentDefinition {
  id: string
  type: string                          // 'header', 'hero', etc.
  name: string                          // 'Modern Professional Header'
  html: string                          // Generated HTML
  css: string                           // Generated CSS
  props: Record<string, any>            // Dynamic properties
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

export interface AIContentRequest {
  type: 'copy' | 'headlines' | 'descriptions' | 'cta' | 'testimonials'
  section: string                       // 'hero', 'features', 'about'
  tone: string                          // 'professional', 'friendly', 'luxury'
  length: 'short' | 'medium' | 'long'
  componentType?: string                // Optional component type for design requests
  businessContext: {
    type: string
    name: string
    services: string[]
    uniqueValue: string
    targetAudience: string[]
  }
  currentContent?: string
  requirements?: {
    includeKeywords?: string[]
    callToAction?: string
    emotionalTone?: string
    writingStyle?: string
  }
}

export interface AIContentResponse {
  success: boolean
  content: {
    primary: string                     // Main content
    alternatives: string[]              // Alternative versions
    seoOptimized: string               // SEO-optimized version
    variations: {
      short: string
      medium: string
      long: string
    }
  }
  metadata: {
    readabilityScore: number
    seoScore: number
    emotionalTone: string
    keywords: string[]
    readingTime: string
    targetAudience: string[]
  }
}

export interface AILayoutRequest {
  businessType: string
  personality: string[]
  sections: string[]                    // ['hero', 'features', 'testimonials']
  goals: string[]                       // ['increase_conversions', 'build_trust']
  constraints: {
    maxSections?: number
    requiredSections: string[]
    skipSections?: string[]
  }
  currentLayout?: LayoutDefinition
}

export interface AILayoutResponse {
  success: boolean
  layout: LayoutDefinition
  recommendations: {
    sectionOrder: string[]
    reasoning: Record<string, string>   // Why each section is positioned there
    conversionOptimizations: string[]
    alternativeLayouts: LayoutDefinition[]
  }
  metadata: {
    confidence: number
    conversionScore: number             // Estimated conversion potential
    designScore: number                 // Design quality score
    userExperienceScore: number
  }
}

export interface LayoutDefinition {
  id: string
  name: string
  sections: LayoutSection[]
  globalStyles: {
    colorScheme: string
    typography: string
    spacing: string
    borderRadius: string
  }
  responsive: {
    mobile: Partial<LayoutDefinition>
    tablet: Partial<LayoutDefinition>
  }
}

export interface LayoutSection {
  id: string
  type: string
  position: number
  component: ComponentDefinition
  styling: {
    background: string
    padding: string
    margin: string
    fullWidth: boolean
  }
  animations: AnimationDefinition[]
  conditional?: {
    showIf: string[]                    // Show if business has these features
    hideIf: string[]                    // Hide if business has these features
  }
}

export interface AnimationDefinition {
  name: string
  trigger: 'onLoad' | 'onScroll' | 'onHover' | 'onClick'
  duration: number
  delay: number
  easing: string
  properties: Record<string, any>
}

export interface AIIntegrationRequest {
  businessType: string
  features: string[]                    // Current business features
  goals: string[]                       // 'increase_bookings', 'automate_payments'
  budget: 'free' | 'low' | 'medium' | 'high'
  technicalLevel: 'beginner' | 'intermediate' | 'advanced'
  currentIntegrations?: string[]
}

export interface AIIntegrationResponse {
  success: boolean
  recommendations: IntegrationRecommendation[]
  priorityOrder: string[]               // Order of implementation
  estimatedROI: Record<string, number>  // Expected return on investment
  metadata: {
    totalSetupTime: string
    complexity: 'low' | 'medium' | 'high'
    maintenanceRequired: boolean
  }
}

export interface IntegrationRecommendation {
  id: string
  name: string
  provider: string
  category: 'payment' | 'booking' | 'analytics' | 'crm' | 'marketing'
  description: string
  benefits: string[]
  setupComplexity: 'low' | 'medium' | 'high'
  monthlyCost: string
  features: string[]
  apiDocumentation: string
  configurationSteps: string[]
  requiredCredentials: string[]
  integrationCode: {
    html: string
    javascript: string
    css: string
  }
}

// Error handling
export interface AIErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: any
    retryable: boolean
    fallbackSuggestion?: string
  }
}

// Union types for all responses
export type AIResponse = AIComponentResponse | AIContentResponse | AILayoutResponse | AIIntegrationResponse | AIErrorResponse
