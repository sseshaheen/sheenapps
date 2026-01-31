// Smart Hints Engine - AI-powered contextual help system

import { OpenAIService } from '../ai/openai-service'
import { AnthropicService } from '../ai/anthropic-service'
import { RobustJSONParser } from '../ai/json-parser'
import type { UserBehavior, MCQQuestion, Answer } from '@/types/question-flow'
import { logger } from '@/utils/logger';

export interface Hint {
  id: string
  type: 'explanation' | 'suggestion' | 'encouragement' | 'tutorial' | 'warning'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  timing: 'immediate' | 'delayed' | 'on_idle' | 'on_confusion'
  content: {
    title: string
    message: string
    action?: {
      text: string
      handler: () => void
    }
    visual?: {
      highlight?: string[]
      animate?: string
      pointTo?: string
    }
  }
  trigger: string
  context: HintContext
  expires?: Date
}

export interface HintContext {
  timeOnQuestion: number
  optionHoverCount: number
  backtrackCount: number
  previewInteractions: number
  questionsAnswered: number
  currentQuestion?: MCQQuestion
  previousAnswers: Answer[]
  userBehavior: UserBehavior
  sessionDuration: number
  lastHintShown?: Date
  hintsShownCount: number
}

export interface ConfusionSignal {
  type: 'indecision' | 'uncertainty' | 'confusion' | 'preview_blindness' | 'option_analysis_paralysis' | 'rapid_switching'
  severity: 'low' | 'medium' | 'high'
  confidence: number
  detectedAt: Date
}

export interface HintAnalysis {
  needsHint: boolean
  hintType: Hint['type']
  priority: Hint['priority']
  optimalTiming: Hint['timing']
  reasoning: string
  confusionSignals: ConfusionSignal[]
}

export class HintEngine {
  private openaiService: OpenAIService | null = null
  private anthropicService: AnthropicService | null = null
  private userBehavior: UserBehavior
  private hintHistory: Hint[] = []
  private confusionDetectionThresholds = {
    indecision: { timeThreshold: 30000, severity: 'medium' },
    uncertainty: { hoverThreshold: 5, severity: 'high' },
    confusion: { backtrackThreshold: 2, severity: 'high' },
    preview_blindness: { interactionThreshold: 0, questionThreshold: 3, severity: 'medium' }
  }

  constructor(initialBehavior: UserBehavior) {
    // Only initialize AI services on server side
    if (typeof window === 'undefined') {
      this.openaiService = new OpenAIService()
      this.anthropicService = new AnthropicService()
    }
    this.userBehavior = initialBehavior
  }

  // Generate contextual hints based on user state
  async generateContextualHint(context: HintContext): Promise<Hint | null> {
    try {
      // Update behavior tracking
      this.userBehavior = context.userBehavior
      
      // Analyze current user state
      const analysis = await this.analyzeUserState(context)
      
      if (!analysis.needsHint) {
        return null
      }
      
      // Check if we should throttle hints
      if (this.shouldThrottleHints(context)) {
        return null
      }
      
      // Generate AI-powered hint
      const hint = await this.generateAIHint(analysis, context)
      
      if (hint) {
        this.hintHistory.push(hint)
      }
      
      return hint
    } catch (error) {
      logger.error('Error generating contextual hint:', error);
      return this.generateFallbackHint(context)
    }
  }

  private async analyzeUserState(context: HintContext): Promise<HintAnalysis> {
    // Detect confusion signals
    const confusionSignals = this.detectConfusionSignals(context)
    
    // Analyze user behavior patterns
    const behaviorPattern = this.analyzeBehaviorPattern(context)
    
    // Determine if hint is needed
    const needsHint = this.shouldShowHint(confusionSignals, behaviorPattern, context)
    
    if (!needsHint) {
      return {
        needsHint: false,
        hintType: 'suggestion',
        priority: 'low',
        optimalTiming: 'delayed',
        reasoning: 'User is progressing well without assistance',
        confusionSignals: []
      }
    }
    
    // Determine hint characteristics
    const hintType = this.determineHintType(confusionSignals, behaviorPattern)
    const priority = this.calculatePriority(confusionSignals)
    const timing = this.calculateOptimalTiming(confusionSignals, context)
    
    return {
      needsHint: true,
      hintType,
      priority,
      optimalTiming: timing,
      reasoning: this.generateReasoningExplanation(confusionSignals, behaviorPattern),
      confusionSignals
    }
  }

  private detectConfusionSignals(context: HintContext): ConfusionSignal[] {
    const signals: ConfusionSignal[] = []
    const now = new Date()
    
    // Long time on question without answer (indecision)
    if (context.timeOnQuestion > this.confusionDetectionThresholds.indecision.timeThreshold) {
      signals.push({
        type: 'indecision',
        severity: context.timeOnQuestion > 60000 ? 'high' : 'medium',
        confidence: Math.min(context.timeOnQuestion / 60000, 1.0),
        detectedAt: now
      })
    }
    
    // Multiple option hovers without selection (uncertainty)
    if (context.optionHoverCount > this.confusionDetectionThresholds.uncertainty.hoverThreshold) {
      signals.push({
        type: 'uncertainty',
        severity: context.optionHoverCount > 10 ? 'high' : 'medium',
        confidence: Math.min(context.optionHoverCount / 10, 1.0),
        detectedAt: now
      })
    }
    
    // Backtracking in flow (confusion)
    if (context.backtrackCount > this.confusionDetectionThresholds.confusion.backtrackThreshold) {
      signals.push({
        type: 'confusion',
        severity: 'high',
        confidence: Math.min(context.backtrackCount / 5, 1.0),
        detectedAt: now
      })
    }
    
    // No preview interaction after several questions (preview blindness)
    if (context.previewInteractions === 0 && 
        context.questionsAnswered >= this.confusionDetectionThresholds.preview_blindness.questionThreshold) {
      signals.push({
        type: 'preview_blindness',
        severity: 'medium',
        confidence: Math.min(context.questionsAnswered / 5, 0.8),
        detectedAt: now
      })
    }
    
    // Rapid option switching (analysis paralysis)
    if (context.optionHoverCount > 8 && context.timeOnQuestion > 45000) {
      signals.push({
        type: 'option_analysis_paralysis',
        severity: 'high',
        confidence: 0.9,
        detectedAt: now
      })
    }
    
    return signals
  }

  private analyzeBehaviorPattern(context: HintContext): {
    engagementLevel: 'low' | 'medium' | 'high'
    learningStyle: 'explorer' | 'systematic' | 'impulsive'
    confidenceLevel: 'low' | 'medium' | 'high'
  } {
    const { userBehavior, timeOnQuestion, questionsAnswered, previewInteractions } = context
    
    // Determine engagement level
    let engagementLevel: 'low' | 'medium' | 'high' = 'medium'
    if (userBehavior.engagementScore > 100 && previewInteractions > 2) {
      engagementLevel = 'high'
    } else if (userBehavior.engagementScore < 30 || timeOnQuestion < 5000) {
      engagementLevel = 'low'
    }
    
    // Determine learning style
    let learningStyle: 'explorer' | 'systematic' | 'impulsive' = 'systematic'
    if (previewInteractions > questionsAnswered * 0.5) {
      learningStyle = 'explorer'
    } else if (timeOnQuestion < 15000 && context.optionHoverCount < 3) {
      learningStyle = 'impulsive'
    }
    
    // Determine confidence level
    let confidenceLevel: 'low' | 'medium' | 'high' = 'medium'
    if (userBehavior.skipRate > 0.3 || context.backtrackCount > 2) {
      confidenceLevel = 'low'
    } else if (timeOnQuestion < 20000 && context.optionHoverCount < 4) {
      confidenceLevel = 'high'
    }
    
    return { engagementLevel, learningStyle, confidenceLevel }
  }

  private shouldShowHint(
    signals: ConfusionSignal[],
    pattern: ReturnType<typeof this.analyzeBehaviorPattern>,
    context: HintContext
  ): boolean {
    // Always show hints for high-severity confusion
    if (signals.some(s => s.severity === 'high')) {
      return true
    }
    
    // Show hints for low confidence users
    if (pattern.confidenceLevel === 'low' && signals.length > 0) {
      return true
    }
    
    // Show hints for first-time users
    if (context.questionsAnswered <= 1) {
      return true
    }
    
    // Show preview hints for non-explorers
    if (pattern.learningStyle !== 'explorer' && 
        signals.some(s => s.type === 'preview_blindness')) {
      return true
    }
    
    return false
  }

  private determineHintType(
    signals: ConfusionSignal[],
    pattern: ReturnType<typeof this.analyzeBehaviorPattern>
  ): Hint['type'] {
    // Confusion signals -> explanations
    if (signals.some(s => s.type === 'confusion')) {
      return 'explanation'
    }
    
    // Indecision -> suggestions
    if (signals.some(s => s.type === 'indecision' || s.type === 'option_analysis_paralysis')) {
      return 'suggestion'
    }
    
    // Low engagement -> encouragement
    if (pattern.engagementLevel === 'low') {
      return 'encouragement'
    }
    
    // Preview blindness -> tutorial
    if (signals.some(s => s.type === 'preview_blindness')) {
      return 'tutorial'
    }
    
    return 'suggestion'
  }

  private calculatePriority(signals: ConfusionSignal[]): Hint['priority'] {
    const highSeverityCount = signals.filter(s => s.severity === 'high').length
    const mediumSeverityCount = signals.filter(s => s.severity === 'medium').length
    
    if (highSeverityCount >= 2) return 'urgent'
    if (highSeverityCount >= 1) return 'high'
    if (mediumSeverityCount >= 2) return 'medium'
    return 'low'
  }

  private calculateOptimalTiming(
    signals: ConfusionSignal[],
    context: HintContext
  ): Hint['timing'] {
    // Urgent signals need immediate attention
    if (signals.some(s => s.severity === 'high')) {
      return 'immediate'
    }
    
    // Long idle time suggests confusion
    if (context.timeOnQuestion > 45000) {
      return 'on_confusion'
    }
    
    // Multiple medium signals need attention
    if (signals.filter(s => s.severity === 'medium').length >= 2) {
      return 'delayed'
    }
    
    return 'on_idle'
  }

  private async generateAIHint(analysis: HintAnalysis, context: HintContext): Promise<Hint | null> {
    // Skip AI generation on client side
    if (!this.openaiService) {
      return this.generateFallbackHint(context)
    }
    
    const prompt = this.buildHintPrompt(analysis, context)
    
    try {
      const response = await this.openaiService.generateCompletion(prompt)
      const hintData = RobustJSONParser.parse<{
        title: string
        message: string
        action?: { text: string; actionType: string }
        visual?: { highlight?: string[]; animate?: string; pointTo?: string }
      }>(response)
      
      return {
        id: `hint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: analysis.hintType,
        priority: analysis.priority,
        timing: analysis.optimalTiming,
        content: {
          title: hintData.title,
          message: hintData.message,
          action: hintData.action ? {
            text: hintData.action.text,
            handler: () => this.handleHintAction(hintData.action!.actionType, context)
          } : undefined,
          visual: hintData.visual
        },
        trigger: analysis.confusionSignals.map(s => s.type).join(','),
        context,
        expires: new Date(Date.now() + 300000) // 5 minutes
      }
    } catch (error) {
      logger.error('Error generating AI hint:', error);
      return null
    }
  }

  private buildHintPrompt(analysis: HintAnalysis, context: HintContext): string {
    const confusionTypes = analysis.confusionSignals.map(s => s.type).join(', ')
    
    return `
You are a helpful AI assistant guiding users through a business builder interface.

Current situation:
- User has been on current question for ${Math.round(context.timeOnQuestion / 1000)} seconds
- Hovered over ${context.optionHoverCount} options
- Has answered ${context.questionsAnswered} questions total
- Preview interactions: ${context.previewInteractions}
- Detected confusion signals: ${confusionTypes}

Question context: ${context.currentQuestion?.question || 'No current question'}
Question category: ${context.currentQuestion?.category || 'unknown'}

Generate a helpful ${analysis.hintType} that addresses the user's confusion.

Requirements:
- Be encouraging and supportive
- Provide specific, actionable guidance
- Keep message under 100 words
- Suggest concrete next steps when appropriate
- Don't be condescending or obvious

Return JSON:
{
  "title": "Brief, encouraging title (max 6 words)",
  "message": "Helpful message addressing the specific confusion",
  "action": {
    "text": "Action button text (optional)",
    "actionType": "show_example|highlight_preview|show_explanation|skip_question"
  },
  "visual": {
    "highlight": ["css_selector1", "css_selector2"],
    "animate": "pulse|glow|bounce",
    "pointTo": "css_selector"
  }
}
`
  }

  private generateFallbackHint(context: HintContext): Hint {
    const fallbackHints = [
      {
        title: "Take Your Time",
        message: "No rush! Consider what best describes your business vision.",
        type: 'encouragement' as const
      },
      {
        title: "Try the Preview",
        message: "Click on an option to see how it affects your business preview in real-time.",
        type: 'tutorial' as const
      },
      {
        title: "Need Help?",
        message: "Each option shows different aspects of your business. Choose what feels most relevant.",
        type: 'explanation' as const
      }
    ]
    
    const hint = fallbackHints[Math.floor(Math.random() * fallbackHints.length)]
    
    return {
      id: `fallback_${Date.now()}`,
      type: hint.type,
      priority: 'medium',
      timing: 'delayed',
      content: {
        title: hint.title,
        message: hint.message
      },
      trigger: 'fallback',
      context
    }
  }

  private shouldThrottleHints(context: HintContext): boolean {
    // Don't show more than 3 hints per session
    if (context.hintsShownCount >= 3) {
      return true
    }
    
    // Don't show hints more frequently than every 2 minutes
    if (context.lastHintShown && 
        Date.now() - context.lastHintShown.getTime() < 120000) {
      return true
    }
    
    return false
  }

  private handleHintAction(actionType: string, context: HintContext): void {
    switch (actionType) {
      case 'show_example':
        // Trigger example display
        logger.info('Showing example for current question');
        break
      case 'highlight_preview':
        // Highlight preview area
        logger.info('Highlighting preview area');
        break
      case 'show_explanation':
        // Show detailed explanation
        logger.info('Showing detailed explanation');
        break
      case 'skip_question':
        // Offer to skip current question
        logger.info('Offering to skip question');
        break
      default:
        logger.info('Unknown action type:', actionType);
    }
  }

  private generateReasoningExplanation(
    signals: ConfusionSignal[],
    pattern: ReturnType<typeof this.analyzeBehaviorPattern>
  ): string {
    if (signals.length === 0) {
      return 'User is progressing normally'
    }
    
    const primarySignal = signals.reduce((prev, current) => 
      current.severity === 'high' ? current : prev
    )
    
    const reasoningMap = {
      'indecision': 'User spending too much time on question without answering',
      'uncertainty': 'User hovering over many options without selecting',
      'confusion': 'User backtracking frequently through the flow',
      'preview_blindness': 'User not engaging with preview functionality',
      'option_analysis_paralysis': 'User overthinking option selection',
      'rapid_switching': 'User rapidly switching between options'
    }
    
    return reasoningMap[primarySignal.type] || 'General confusion detected'
  }

  // Public utility methods
  updateUserBehavior(behavior: Partial<UserBehavior>): void {
    this.userBehavior = { ...this.userBehavior, ...behavior }
  }

  getHintHistory(): Hint[] {
    return this.hintHistory.filter(hint => 
      !hint.expires || hint.expires > new Date()
    )
  }

  clearExpiredHints(): void {
    const now = new Date()
    this.hintHistory = this.hintHistory.filter(hint => 
      !hint.expires || hint.expires > now
    )
  }

  // Analytics
  getHintEffectiveness(): {
    totalHints: number
    hintsByType: Record<string, number>
    averageTimeToAction: number
    userSatisfactionScore: number
  } {
    const hintsByType = this.hintHistory.reduce((acc, hint) => {
      acc[hint.type] = (acc[hint.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return {
      totalHints: this.hintHistory.length,
      hintsByType,
      averageTimeToAction: 0, // Would calculate from actual usage data
      userSatisfactionScore: 0.8 // Would be based on user feedback
    }
  }
}