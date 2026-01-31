import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { 
  MCQQuestion, 
  Answer, 
  CompletedQuestion,
  BusinessContext,
  EngagementAction,
  UserBehavior
} from '@/types/question-flow'
import { AIQuestionGenerator } from '@/services/ai/question-generator'
import { fetchApi } from '@/lib/api-utils'
import { logger } from '@/utils/logger';

interface QuestionFlowState {
  // Core state
  currentQuestion: MCQQuestion | null
  questionHistory: CompletedQuestion[]
  businessContext: BusinessContext | null
  
  // Flow control
  flowPhase: 'analysis' | 'questioning' | 'building' | 'refining'
  questionQueue: MCQQuestion[]
  completionPercentage: number
  
  // User engagement
  engagementScore: number
  timeSpent: number
  confidenceLevel: number
  userBehavior: UserBehavior
  
  // State flags
  isLoading: boolean
  isGeneratingQuestion: boolean
  error: string | null
  
  // Actions
  startQuestionFlow: (businessIdea: string, projectId?: string) => Promise<void>
  answerQuestion: (answer: Answer) => Promise<void>
  skipQuestion: (reason: string) => void
  requestExplanation: (questionId: string) => Promise<string>
  regenerateQuestion: () => Promise<void>
  trackEngagement: (action: EngagementAction) => void
  updateUserBehavior: (behavior: Partial<UserBehavior>) => void
  
  // Reset/cleanup
  resetFlow: () => void
}

const initialUserBehavior: UserBehavior = {
  timeOnQuestion: 0,
  optionHoverCount: 0,
  backtrackCount: 0,
  previewInteractions: 0,
  questionsAnswered: 0,
  skipRate: 0,
  engagementScore: 0
}

// Track if we're already starting a flow to prevent duplicates
let isStartingFlow = false

export const useQuestionFlowStore = create<QuestionFlowState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentQuestion: null,
      questionHistory: [],
      businessContext: null,
      flowPhase: 'analysis',
      questionQueue: [],
      completionPercentage: 0,
      engagementScore: 0,
      timeSpent: 0,
      confidenceLevel: 0,
      userBehavior: initialUserBehavior,
      isLoading: false,
      isGeneratingQuestion: false,
      error: null,

      // Actions
      startQuestionFlow: async (businessIdea: string, projectId?: string) => {
        // Prevent duplicate calls
        if (isStartingFlow) {
          logger.info('Store: Already starting flow, ignoring duplicate call');
          return
        }
        
        isStartingFlow = true
        
        logger.info('Store: Starting question flow for:', businessIdea, 'Project:', projectId);
        set({ isLoading: true, error: null, flowPhase: 'analysis' })
        
        // Generate projectId if not provided
        const actualProjectId = projectId || `project_${Date.now()}`
        
        try {
          // 1. First run prompt analysis (placeholder for now)
          logger.info('Store: Running prompt analysis for:', businessIdea);
          set({ flowPhase: 'analysis' })
          
          // 2. Call new lightweight API for first question only
          logger.info('Store: Calling lightweight first question API...');
          
          // Use fetchApi utility to avoid locale prefix issues
          const response = await fetchApi(`/api/questions/first/${actualProjectId}`, {
            method: 'GET'
          })
          
          logger.info('Store: API response status:', { status: response.status, ok: response.ok }, 'store');
          
          if (!response.ok) {
            const errorText = await response.text()
            logger.error('Store: API error response:', { errorText }, 'store');
            throw new Error(`API call failed: ${response.status} - ${errorText}`)
          }
          
          const result = await response.json()
          logger.info('Store: Raw API result:', result);
          
          if (!result.success) {
            logger.error('Store: API returned error:', result.error);
            throw new Error(result.error || 'API returned error')
          }
          
          if (!result.question) {
            logger.error('Store: No question in API response');
            throw new Error('No question data received from API')
          }
          
          console.log('Store: First question loaded:', { 
            projectId: result.projectId,
            questionId: result.question?.id,
            questionText: result.question?.question,
            optionsCount: result.question?.options?.length,
            options: result.question?.options?.map(opt => ({
              id: opt.id,
              text: opt.text,
              description: opt.description
            })),
            metadata: result.metadata,
            // DEBUG: Check first option structure
            firstOption: result.question?.options?.[0],
            firstOptionModular: result.question?.options?.[0]?.modularPreviewImpact
          })
          
          // Create business context from prompt analysis and API response
          const businessContext: BusinessContext = {
            originalIdea: businessIdea,
            businessType: 'services', // Will be enhanced by prompt analysis
            targetAudience: undefined, // Will be determined by user answers
            industryCategory: undefined, // Will be determined by prompt analysis
            complexity: 'moderate', // Default for now
            previousAnswers: []
          }
          
          // Store the single question in queue for consistency
          const questionQueue = result.question ? [result.question] : []
          
          console.log('Store: Setting state with question:', {
            hasQuestion: !!result.question,
            questionId: result.question?.id,
            queueLength: questionQueue.length,
            isLoading: false
          })
          
          set({
            businessContext,
            questionQueue,
            currentQuestion: result.question || null,
            completionPercentage: 0,
            flowPhase: 'questioning',
            isLoading: false
          })
          
          logger.info('Store: State updated successfully');
          console.log('Store: Current state after update:', {
            currentQuestion: get().currentQuestion,
            isLoading: get().isLoading,
            flowPhase: get().flowPhase
          })
          
          logger.info('Store: AI-powered question flow started successfully');
          
          // Track the start event
          get().trackEngagement({ type: 'answer_question' })
          
        } catch (error) {
          logger.error('Store: AI question generation failed, falling back to client-side:', error);
          
          // Fallback to client-side generation
          try {
            const generator = new AIQuestionGenerator()
            logger.info('Store: Using fallback client-side generator...');
            const flow = await generator.generateQuestionFlow(businessIdea)
            
            set({
              businessContext: flow.businessContext,
              questionQueue: flow.questions,
              currentQuestion: flow.questions[0] || null,
              completionPercentage: 0,
              flowPhase: 'questioning',
              isLoading: false
            })
            
            logger.info('Store: Fallback question flow started successfully');
            get().trackEngagement({ type: 'answer_question' })
            
          } catch (fallbackError) {
            logger.error('Store: Both AI and fallback generation failed:', fallbackError);
            set({ 
              error: 'Failed to generate questions. Please try again.',
              isLoading: false 
            })
          }
        } finally {
          // Reset the flag
          isStartingFlow = false
          
          // Ensure we always stop loading after 10 seconds
          setTimeout(() => {
            const currentState = get()
            if (currentState.isLoading) {
              logger.error('⏱️ Question loading timeout - forcing stop');
              set({ 
                isLoading: false,
                error: 'Question generation timed out. Please refresh and try again.'
              })
            }
          }, 10000)
        }
      },

      answerQuestion: async (answer: Answer) => {
        const state = get()
        console.log('🏪 Store: answerQuestion called with:', {
          answer,
          hasCurrentQuestion: !!state.currentQuestion,
          hasBusinessContext: !!state.businessContext,
          currentHistoryLength: state.questionHistory.length
        })
        
        if (!state.currentQuestion || !state.businessContext) {
          console.log('❌ Store: Cannot answer question - missing currentQuestion or businessContext')
          return
        }
        
        set({ isGeneratingQuestion: true })
        
        try {
          // Record the completed question
          const completedQuestion: CompletedQuestion = {
            question: state.currentQuestion,
            answer,
            timestamp: new Date()
          }
          
          const newHistory = [...state.questionHistory, completedQuestion]
          const newBusinessContext = {
            ...state.businessContext,
            previousAnswers: [...state.businessContext.previousAnswers, answer]
          }
          
          // Update user behavior
          const updatedBehavior = {
            ...state.userBehavior,
            questionsAnswered: state.userBehavior.questionsAnswered + 1,
            timeOnQuestion: answer.metadata.timeSpent,
            engagementScore: state.userBehavior.engagementScore + 10
          }
          
          // Calculate completion percentage
          const totalExpectedQuestions = 8 // Estimated flow length
          const completionPercentage = Math.min(
            ((newHistory.length) / totalExpectedQuestions) * 100,
            100
          )
          
          // Generate next question
          let nextQuestion: MCQQuestion | null = null
          
          // Check if we have more queued questions
          const remainingQueue = state.questionQueue.slice(1)
          
          if (remainingQueue.length > 0) {
            nextQuestion = remainingQueue[0]
          } else {
            // Generate dynamic follow-up question
            const generator = new AIQuestionGenerator()
            nextQuestion = await generator.generateFollowUpQuestion(
              newBusinessContext.previousAnswers,
              newBusinessContext
            )
          }
          
          // Determine flow phase
          let newPhase = state.flowPhase
          if (completionPercentage >= 70) {
            newPhase = 'building'
          } else if (completionPercentage >= 90) {
            newPhase = 'refining'
          }
          
          console.log('🏪 Store: Updating state with new question history:', {
            newHistoryLength: newHistory.length,
            newCompletionPercentage: completionPercentage,
            hasNextQuestion: !!nextQuestion,
            nextQuestionId: nextQuestion?.id
          })

          set({
            questionHistory: newHistory,
            businessContext: newBusinessContext,
            currentQuestion: nextQuestion,
            questionQueue: remainingQueue,
            completionPercentage,
            flowPhase: newPhase,
            userBehavior: updatedBehavior,
            engagementScore: state.engagementScore + 10,
            isGeneratingQuestion: false
          })

          console.log('✅ Store: State updated successfully - questionHistory should trigger useEffect')
          
          // Track engagement
          get().trackEngagement({ 
            type: 'answer_question',
            questionId: answer.questionId,
            duration: answer.metadata.timeSpent
          })
          
        } catch (error) {
          logger.error('Failed to process answer:', error);
          set({ 
            error: 'Failed to process your answer. Please try again.',
            isGeneratingQuestion: false 
          })
        }
      },

      skipQuestion: (reason: string) => {
        const state = get()
        if (!state.currentQuestion) return
        
        // Update skip behavior
        const updatedBehavior = {
          ...state.userBehavior,
          skipRate: (state.userBehavior.skipRate * state.userBehavior.questionsAnswered + 1) / 
                   (state.userBehavior.questionsAnswered + 1)
        }
        
        // Move to next question
        const remainingQueue = state.questionQueue.slice(1)
        const nextQuestion = remainingQueue.length > 0 ? remainingQueue[0] : null
        
        set({
          currentQuestion: nextQuestion,
          questionQueue: remainingQueue,
          userBehavior: updatedBehavior,
          completionPercentage: state.completionPercentage + 5 // Small progress for skip
        })
        
        logger.info(`Question skipped: ${reason}`);
      },

      requestExplanation: async (questionId: string): Promise<string> => {
        const state = get()
        const question = state.currentQuestion
        
        if (!question || question.id !== questionId) {
          return "Explanation not available for this question."
        }
        
        // Return the AI reasoning from metadata
        return question.metadata.aiReasoning || "This question helps us understand your business needs better."
      },

      regenerateQuestion: async () => {
        const state = get()
        if (!state.businessContext) return
        
        set({ isGeneratingQuestion: true })
        
        try {
          const generator = new AIQuestionGenerator()
          const newQuestion = await generator.generateFollowUpQuestion(
            state.businessContext.previousAnswers,
            state.businessContext
          )
          
          if (newQuestion) {
            set({
              currentQuestion: newQuestion,
              questionQueue: [newQuestion],
              isGeneratingQuestion: false
            })
          } else {
            set({ 
              error: 'Unable to generate a new question. Please continue with the current one.',
              isGeneratingQuestion: false 
            })
          }
        } catch (error) {
          logger.error('Failed to regenerate question:', error);
          set({ 
            error: 'Failed to generate new question.',
            isGeneratingQuestion: false 
          })
        }
      },

      trackEngagement: (action: EngagementAction) => {
        const state = get()
        
        // Calculate engagement points
        const points = calculateEngagementPoints(action)
        
        set({
          engagementScore: state.engagementScore + points,
          timeSpent: state.timeSpent + (action.duration || 0)
        })
        
        logger.info(`Engagement tracked: ${action.type} (+${points} points);`)
      },

      updateUserBehavior: (behaviorUpdate: Partial<UserBehavior>) => {
        const state = get()
        set({
          userBehavior: {
            ...state.userBehavior,
            ...behaviorUpdate
          }
        })
      },

      resetFlow: () => {
        set({
          currentQuestion: null,
          questionHistory: [],
          businessContext: null,
          flowPhase: 'analysis',
          questionQueue: [],
          completionPercentage: 0,
          engagementScore: 0,
          timeSpent: 0,
          confidenceLevel: 0,
          userBehavior: initialUserBehavior,
          isLoading: false,
          isGeneratingQuestion: false,
          error: null
        })
      }
    }),
    {
      name: 'question-flow-store',
      partialize: (state: QuestionFlowState) => ({
        questionHistory: state.questionHistory,
        businessContext: state.businessContext,
        engagementScore: state.engagementScore,
        completionPercentage: state.completionPercentage
      })
    }
  )
)

// Helper function to calculate engagement points
function calculateEngagementPoints(action: EngagementAction): number {
  const pointsMap: Record<string, number> = {
    'answer_question': 10,
    'preview_interaction': 5,
    'feature_discovery': 15,
    'template_selection': 8,
    'design_customization': 12,
    'export_attempt': 25,
    'share_project': 20,
    'return_session': 30
  }
  
  return pointsMap[action.type] || 0
}

// Selector hooks for specific parts of the state
export const useCurrentQuestion = () => useQuestionFlowStore(state => state.currentQuestion)
export const useQuestionHistory = () => useQuestionFlowStore(state => state.questionHistory)

// Create stable selectors that don't create new objects on every render
export const useFlowProgress = () => {
  const completionPercentage = useQuestionFlowStore(state => state.completionPercentage)
  const engagementScore = useQuestionFlowStore(state => state.engagementScore)
  const flowPhase = useQuestionFlowStore(state => state.flowPhase)
  
  return { completionPercentage, engagementScore, flowPhase }
}

export const useQuestionFlowActions = () => {
  const startQuestionFlow = useQuestionFlowStore(state => state.startQuestionFlow)
  const answerQuestion = useQuestionFlowStore(state => state.answerQuestion)
  const skipQuestion = useQuestionFlowStore(state => state.skipQuestion)
  const requestExplanation = useQuestionFlowStore(state => state.requestExplanation)
  const regenerateQuestion = useQuestionFlowStore(state => state.regenerateQuestion)
  const trackEngagement = useQuestionFlowStore(state => state.trackEngagement)
  
  return {
    startQuestionFlow,
    answerQuestion,
    skipQuestion,
    requestExplanation,
    regenerateQuestion,
    trackEngagement
  }
}