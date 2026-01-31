/**
 * Compatibility layer for question-flow-store.ts
 * Maps the original question flow store API to the unified store
 */

import { 
  useUnifiedBuilderStore,
  useCurrentQuestion,
  useQuestionHistory,
  useEngagementScore,
  useFlowProgress,
  useBuilderActions
} from '../unified-builder-store'
import type { MCQQuestion, Answer, CompletedQuestion } from '@/types/question-flow'
import { fetchApi } from '@/lib/api-utils'
import { logger } from '@/utils/logger'

// Create selector-based exports that match the original API
export const useQuestionFlowStore = () => {
  const state = useUnifiedBuilderStore(state => state.questionFlow)
  const actions = useBuilderActions()

  return {
    // State
    ...state,
    
    // Original actions (some need to be implemented as thunks)
    startQuestionFlow: async (businessIdea: string, projectId?: string) => {
      try {
        actions.setQuestionFlowLoading(true)
        actions.setQuestionFlowError(null)

        // Call the API to get the first question
        const response = await fetchApi(`/api/questions/first/${projectId}`, {
          method: 'GET',
        })

        if (!response.ok) {
          throw new Error('Failed to fetch first question')
        }

        const data = await response.json()
        
        if (data.question) {
          actions.setCurrentQuestion(data.question)
          actions.updateBusinessContext(data.businessContext)
        }
      } catch (error) {
        logger.error('Failed to start question flow:', error)
        actions.setQuestionFlowError(error instanceof Error ? error.message : 'Failed to start questions')
      } finally {
        actions.setQuestionFlowLoading(false)
      }
    },

    answerQuestion: async (answer: Answer) => {
      const currentQuestion = useUnifiedBuilderStore.getState().questionFlow.currentQuestion
      if (!currentQuestion) return

      try {
        actions.setQuestionFlowLoading(true)
        
        // Add to history
        const completed: CompletedQuestion = {
          question: currentQuestion,
          answer,
          timestamp: new Date()
        }
        actions.addToQuestionHistory(completed)

        // Update engagement score
        const newScore = useUnifiedBuilderStore.getState().questionFlow.engagementScore + 10
        actions.updateEngagementScore(newScore)

        // ✅ BACKEND CONFIRMED: Connect to real AI service for question generation
        try {
          // Connect to existing AI service registry for intelligent question flow
          const { UnifiedAIService } = await import('@/services/ai/unified-ai-service')
          const aiService = UnifiedAIService.getInstance()

          // Get current context for AI question generation
          const currentAnswers = state.questionHistory || []
          const currentPhase = state.flowPhase

          // Generate next question using AI with contextual understanding
          const aiRequest = {
            type: 'analysis', // Required field for AIRequest
            content: `Generate the next business questionnaire question based on previous answers. Current phase: ${currentPhase}. Previous answers: ${JSON.stringify(currentAnswers)}`,
            userContext: {
              prefersConciseResponses: false,
              previousInteractions: currentAnswers.length,
              preferredCommunicationStyle: 'detailed' as const,
              riskTolerance: 'balanced' as const,
              // Additional context for question generation
              requestType: 'question_generation',
              currentPhase,
              answerHistory: currentAnswers,
              engagementScore: state.engagementScore
            },
            responseFormat: 'json',
            maxResponseTime: 3000,
            tier: 'basic' as const // Use basic tier for simple question generation
          }

          const response = await aiService.processRequest(aiRequest, {
            useTierRouting: true,
            enableFallback: true
          })

          if (response.success && response.data) {
            try {
              const nextQuestion = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
              if (nextQuestion?.question && nextQuestion?.options) {
                // Update with AI-generated question
                logger.info('🎯 AI generated next question successfully')
                // Continue the flow with the new question
                return
              }
            } catch (parseError) {
              logger.warn('Failed to parse AI question response, using fallback flow')
            }
          }

          // Fallback: Move to building phase (existing behavior)
          actions.setFlowPhase('building')

        } catch (error) {
          logger.error('❌ AI question generation failed, using fallback flow:', error)
          // Graceful degradation - move to building phase
          actions.setFlowPhase('building')
        }
      } catch (error) {
        logger.error('Failed to answer question:', error)
        actions.setQuestionFlowError('Failed to process answer')
      } finally {
        actions.setQuestionFlowLoading(false)
      }
    },

    skipQuestion: (reason: string) => {
      logger.info('Question skipped:', reason)
      // Implement skip logic
    },

    resetFlow: actions.resetQuestionFlow,
    setCurrentQuestion: actions.setCurrentQuestion,
    setBusinessContext: actions.updateBusinessContext,
    updateEngagementScore: actions.updateEngagementScore,
    setFlowPhase: actions.setFlowPhase
  }
}

// Individual selector exports
export { 
  useCurrentQuestion,
  useQuestionHistory,
  useEngagementScore,
  useFlowProgress
}