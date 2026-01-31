// Enhanced fallback for AI Bridge to use ENHANCED_IDEAL_AI_RESPONSE
// 
// ⚠️ DEPRECATION NOTICE:
// This service pulls in heavy modularPreviewImpact data with CSS configurations.
// For lightweight question data, use the new /api/questions/first endpoint instead.
//
import { ENHANCED_IDEAL_AI_RESPONSE } from './enhanced-ideal-ai-response'
import { IDEAL_AI_RESPONSE } from './ideal-ai-response'
import type { MCQQuestion } from '../../types/question-flow'
import { logger } from '@/utils/logger';

export class AIRefinementBridgeSimple {
  static generateFallbackQuestions(): { questions: MCQQuestion[], metadata: any } {
    logger.warn('⚠️ DEPRECATION WARNING: AIRefinementBridgeSimple pulls heavy data.');
    logger.warn('💡 Consider using /api/questions/first for lightweight first question only.');
    logger.info('🔄 Using ENHANCED_IDEAL_AI_RESPONSE for modular fallback questions');
    logger.info('📊 Enhanced response questions count:', ENHANCED_IDEAL_AI_RESPONSE.questions.length);
    logger.info('🎯 First question:', ENHANCED_IDEAL_AI_RESPONSE.questions[0]?.question);
    
    // Use our enhanced modular response system for better previews
    const idealResponse = ENHANCED_IDEAL_AI_RESPONSE
    
    // Convert the ideal response to our expected format
    const questions = this.convertToMCQQuestions(idealResponse)
    
    return {
      questions,
      metadata: {
        stage: 'initial',
        totalSteps: questions.length,
        aiProvider: 'enhanced-fallback'
      }
    }
  }

  private static convertToMCQQuestions(response: any): MCQQuestion[] {
    return response.questions.map((q: any) => ({
      id: q.id,
      type: 'single_choice' as const,
      category: q.category as any,
      question: q.question,
      context: q.context,
      options: q.options.map((opt: any) => ({
        id: opt.id,
        text: opt.title,
        description: opt.description,
        businessImplications: opt.pros || [],
        // Use modular preview impact (new system) or fall back to comprehensive impact
        previewImpact: (() => {
          if (opt.modularPreviewImpact) {
            logger.info('✨ Using MODULAR preview impact for option:', opt.title);
            logger.info('🎨 Modular modules:', Object.keys(opt.modularPreviewImpact.modules || {}))
            
            // Debug badge value for this specific option
            if (opt.modularPreviewImpact.modules.hero?.props?.badge) {
              logger.info(`🏷️ Badge for "${opt.title}":`, opt.modularPreviewImpact.modules.hero.props.badge)
            }
            
            return opt.modularPreviewImpact
          } else if (opt.comprehensivePreviewImpact) {
            logger.info('📦 Using COMPREHENSIVE preview impact for option:', opt.title);
            return opt.comprehensivePreviewImpact
          } else {
            logger.info('⚠️ Using DEFAULT preview impact for option:', opt.title);
            return {
              action: 'content_change',
              target: 'status',
              changes: { 'status-message': 'Choice applied successfully' },
              animationDuration: 500
            }
          }
        })()
      })),
      metadata: {
        difficultyLevel: q.difficulty,
        businessImpact: 'high' as const,
        estimatedTime: 30,
        aiReasoning: q.context || ''
      },
      followUpLogic: {
        conditions: [],
        nextQuestionId: null
      },
      // Copy pagination properties if they exist
      paginationEnabled: q.paginationEnabled,
      optionsPerPage: q.optionsPerPage
    }))
  }
}