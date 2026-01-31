// Enhanced types for the AI-driven MCQ question flow system

export interface MCQQuestion {
  id: string
  type: 'single_choice' | 'multiple_choice' | 'text_input' | 'range_slider' | 'priority_ranking'
  category: 'audience' | 'features' | 'design' | 'technical' | 'business'
  question: string
  context?: string // Why this matters
  options: QuestionOption[]
  metadata: {
    aiReasoning: string
    estimatedTime: number
    difficultyLevel: 'beginner' | 'intermediate' | 'advanced'
    businessImpact: 'high' | 'medium' | 'low'
  }
  validation?: ValidationRule[]
  followUpLogic: {
    conditions?: Array<{
      if: string
      then: string
    }>
    nextQuestionId?: string | null
  }
  visualHints?: {
    showPreviewHighlight: boolean
    previewAnimation: string
    relatedFeatures: string[]
  }
  // Pagination support
  paginationEnabled?: boolean
  optionsPerPage?: number
}

export interface QuestionOption {
  id: string
  text: string
  description?: string
  icon?: string
  previewImpact: PreviewImpact
  modularPreviewImpact?: {
    type: string
    modules: Record<string, unknown>
  } // Optional modular preview impact for new API system
  followUpTrigger?: string
  businessImplications: string[]
}

export interface PreviewImpact {
  // Legacy format support
  action?: 'theme_change' | 'feature_add' | 'layout_update' | 'content_change'
  target?: string
  animationDuration?: number
  
  // New enhanced format
  type?: 'layout_update' | 'theme_change' | 'feature_addition' | 'content_change' | 'style_refinement' | 'revert' | 'modular-transformation' | 'complete-transformation' | 'component_update' | 'section-restoration'
  priority?: 'high' | 'medium' | 'low'
  affects?: string[]
  dependencies?: string[]
  conflicts?: string[]
  
  // Modular transformation support
  modules?: Record<string, any>
  
  changes: {
    layout?: {
      structure?: 'single-page' | 'multi-page' | 'dashboard' | 'wizard'
      navigation?: 'header' | 'sidebar' | 'footer' | 'floating' | 'none'
      grid?: 'simple' | 'masonry' | 'custom' | 'responsive'
      spacing?: 'compact' | 'comfortable' | 'spacious'
    }
    
    styling?: {
      colorScheme?: {
        primary?: string
        secondary?: string
        accent?: string
        background?: string
        text?: string
      }
      typography?: {
        headingFont?: string
        bodyFont?: string
        scale?: 'small' | 'medium' | 'large'
      }
      components?: {
        buttons?: 'rounded' | 'sharp' | 'pill' | 'minimal'
        cards?: 'flat' | 'shadow' | 'border' | 'elevated'
        inputs?: 'outlined' | 'filled' | 'underlined' | 'minimal'
      }
    }
    
    content?: {
      tone?: 'professional' | 'casual' | 'friendly' | 'expert'
      density?: 'minimal' | 'moderate' | 'detailed' | 'comprehensive'
      mediaRatio?: 'text-heavy' | 'balanced' | 'visual-heavy'
      messaging?: Record<string, string>
    }
    
    features?: {
      add?: string[]
      remove?: string[]
      modify?: Record<string, unknown>
      integrations?: string[]
    }
    
    // Legacy support
    [key: string]: unknown
  }
}

export interface ValidationRule {
  type: 'required' | 'min_length' | 'max_length' | 'pattern'
  value: string | number
  message: string
}

export interface Answer {
  questionId: string
  optionId?: string
  answer: string
  metadata: {
    timeSpent: number
    confidence: number
    skipped: boolean
  }
}

export interface CompletedQuestion {
  question: MCQQuestion
  answer: Answer
  timestamp: Date
}

export interface BusinessContext {
  originalIdea: string
  businessType?: string
  targetAudience?: string
  industryCategory?: string
  complexity: 'simple' | 'moderate' | 'complex'
  previousAnswers: Answer[]
}

export interface QuestionFlow {
  id: string
  businessContext: BusinessContext
  questions: MCQQuestion[]
  currentQuestionIndex: number
  completionPercentage: number
  engagementScore: number
  adaptivePath: string[]
}

export interface QuestionGenerationRequest {
  businessIdea: string
  previousAnswers: Answer[]
  context: BusinessContext
  questionType: 'foundation' | 'conditional' | 'refinement'
  trigger?: string
}

export interface QuestionGenerationResponse {
  question: MCQQuestion
  confidence: number
  reasoning: string
  alternativeQuestions?: MCQQuestion[]
}

// Engagement tracking types
export interface EngagementAction {
  type: 'answer_question' | 'preview_interaction' | 'feature_discovery' | 'template_selection' | 'design_customization' | 'export_attempt' | 'share_project' | 'return_session'
  questionId?: string
  duration?: number
  data?: Record<string, unknown>
}

export interface UserBehavior {
  timeOnQuestion: number
  optionHoverCount: number
  backtrackCount: number
  previewInteractions: number
  questionsAnswered: number
  skipRate: number
  engagementScore: number
}

// Preview system types
export interface PreviewUpdate {
  id: string
  type: 'content_change' | 'feature_addition' | 'theme_change' | 'layout_update' | 'section_update' | 'no_change'
  changes: PreviewChange[]
  duration: number
  explanation: string
  delay?: number
}

export interface PreviewChange {
  selector: string
  property?: string
  value?: string
  action?: 'appendChild' | 'removeChild' | 'replaceChild'
  element?: HTMLElement
  animation?: 'typewriter' | 'fadeIn' | 'slideInFromRight' | 'morphIcon' | 'pulse' | 'slideDown' | 'slideUp'
}

export interface BuildState {
  currentBuildStep: string | null
  buildMessages: Record<string, string>
  completionPercentage: number
  isBuilding: boolean
  currentBuildStepIndex: number
}