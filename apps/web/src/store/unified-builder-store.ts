/**
 * Unified Builder Store - Consolidates all builder-related state
 * Combines: builder, question-flow, preview-generation, editing-guidance, and history stores
 * Auth store kept separate for security and modularity
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { 
  MCQQuestion, 
  Answer, 
  CompletedQuestion,
  BusinessContext,
  UserBehavior
} from '@/types/question-flow'
import { logger } from '@/utils/logger'

// ============================================
// Type Definitions from Individual Stores
// ============================================

// From builder-store.ts
export interface BusinessIdea {
  description: string
  attachments?: File[]
  language?: string
  timestamp: Date
}

export interface BuilderConfig {
  businessType?: 'saas' | 'ecommerce' | 'marketplace' | 'portfolio' | 'other'
  theme?: {
    primary: string
    secondary: string
    font: string
  }
  features?: string[]
  backend?: 'supabase' | 'express' | 'firebase' | 'django'
  monetization?: 'subscription' | 'oneoff' | 'freemium' | 'none'
  targetAudience?: string
  brandName?: string
}

export interface BuildProgress {
  currentStep: string
  completedSteps: string[]
  totalSteps: number
  isBuilding: boolean
}

// From per-section-history-store.ts
interface SectionEdit {
  id: string
  content: any
  userAction: string
  timestamp: number
}

interface SectionHistory {
  edits: SectionEdit[]
  currentIndex: number
}

// ============================================
// Unified Store State Interface
// ============================================

interface UnifiedBuilderState {
  // ========== Business Slice ==========
  business: {
    idea: BusinessIdea | null
    config: BuilderConfig
    progress: BuildProgress
  }

  // ========== Question Flow Slice ==========
  questionFlow: {
    currentQuestion: MCQQuestion | null
    questionHistory: CompletedQuestion[]
    businessContext: BusinessContext | null
    flowPhase: 'analysis' | 'questioning' | 'building' | 'refining'
    questionQueue: MCQQuestion[]
    completionPercentage: number
    engagementScore: number
    timeSpent: number
    confidenceLevel: number
    userBehavior: UserBehavior
    isLoading: boolean
    isGeneratingQuestion: boolean
    error: string | null
  }

  // ========== Preview Generation Slice ==========
  preview: {
    generatedChoices: Set<string>
    currentlyGenerating: string | null
    generationQueue: string[]
    currentPreview: string | null
    cachedPreviews: Map<string, any>
    generationProgress: Map<string, number>
    generationStages: Map<string, { stage: string; component: string; loadingMessage: string }>
  }

  // ========== UI State Slice ==========
  ui: {
    isModalOpen: boolean
    isBuilderOpen: boolean
    editingGuidance: {
      currentStep: number
      isVisible: boolean
      shouldShowHeroEditButton: boolean
      hasBeenDismissed: boolean
    }
  }

  // ========== History Slice ==========
  history: {
    // Key format: ${layoutId}_${sectionType}_${sectionId}
    sections: Record<string, SectionHistory>
  }

  // ========== Actions ==========
  actions: {
    // Business actions
    setBusinessIdea: (idea: BusinessIdea) => void
    updateConfig: (updates: Partial<BuilderConfig>) => void
    setProgress: (progress: Partial<BuildProgress>) => void

    // UI actions
    openModal: () => void
    closeModal: () => void
    openBuilder: () => void
    closeBuilder: () => void

    // Question flow actions
    setCurrentQuestion: (question: MCQQuestion | null) => void
    addToQuestionHistory: (completed: CompletedQuestion) => void
    updateBusinessContext: (context: Partial<BusinessContext>) => void
    setFlowPhase: (phase: 'analysis' | 'questioning' | 'building' | 'refining') => void
    updateEngagementScore: (score: number) => void
    setQuestionFlowLoading: (loading: boolean) => void
    setQuestionFlowError: (error: string | null) => void

    // Preview actions
    markAsGenerated: (choiceId: string, content: any) => void
    startGenerating: (choiceId: string) => void
    finishGenerating: (choiceId: string) => void
    setCurrentPreview: (choiceId: string | null) => void
    updateGenerationProgress: (choiceId: string, progress: number, stage?: any) => void
    addToGenerationQueue: (choiceId: string) => void
    removeFromGenerationQueue: (choiceId: string) => void

    // Editing guidance actions
    setGuidanceStep: (step: number) => void
    setGuidanceVisible: (visible: boolean) => void
    setShouldShowHeroEditButton: (show: boolean) => void
    setGuidanceDismissed: (dismissed: boolean) => void

    // History actions
    recordEdit: (layoutId: string, sectionType: string, sectionId: string, content: any, userAction: string) => void
    undo: (layoutId: string, sectionType: string, sectionId: string) => SectionEdit | null
    redo: (layoutId: string, sectionType: string, sectionId: string) => SectionEdit | null
    clearSectionHistory: (layoutId: string, sectionType: string, sectionId: string) => void

    // Global actions
    reset: () => void
    resetQuestionFlow: () => void
    resetPreview: () => void
  }
}

// ============================================
// Initial State
// ============================================

const initialState: Omit<UnifiedBuilderState, 'actions'> = {
  business: {
    idea: null,
    config: {},
    progress: {
      currentStep: '',
      completedSteps: [],
      totalSteps: 0,
      isBuilding: false
    }
  },
  questionFlow: {
    currentQuestion: null,
    questionHistory: [],
    businessContext: null,
    flowPhase: 'analysis',
    questionQueue: [],
    completionPercentage: 0,
    engagementScore: 0,
    timeSpent: 0,
    confidenceLevel: 50,
    userBehavior: {
      timeOnQuestion: 0,
      optionHoverCount: 0,
      backtrackCount: 0,
      previewInteractions: 0,
      questionsAnswered: 0,
      skipRate: 0,
      engagementScore: 0
    },
    isLoading: false,
    isGeneratingQuestion: false,
    error: null
  },
  preview: {
    generatedChoices: new Set(),
    currentlyGenerating: null,
    generationQueue: [],
    currentPreview: null,
    cachedPreviews: new Map(),
    generationProgress: new Map(),
    generationStages: new Map()
  },
  ui: {
    isModalOpen: false,
    isBuilderOpen: false,
    editingGuidance: {
      currentStep: 0,
      isVisible: false,
      shouldShowHeroEditButton: false,
      hasBeenDismissed: false
    }
  },
  history: {
    sections: {}
  }
}

// ============================================
// Store Creation with Immer for immutability
// ============================================

export const useUnifiedBuilderStore = create<UnifiedBuilderState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initialState,

        actions: {
          // ========== Business Actions ==========
          setBusinessIdea: (idea) => set((state) => {
            state.business.idea = idea
          }),

          updateConfig: (updates) => set((state) => {
            state.business.config = { ...state.business.config, ...updates }
          }),

          setProgress: (progress) => set((state) => {
            state.business.progress = { ...state.business.progress, ...progress }
          }),

          // ========== UI Actions ==========
          openModal: () => set((state) => {
            state.ui.isModalOpen = true
          }),

          closeModal: () => set((state) => {
            state.ui.isModalOpen = false
          }),

          openBuilder: () => set((state) => {
            state.ui.isBuilderOpen = true
          }),

          closeBuilder: () => set((state) => {
            state.ui.isBuilderOpen = false
          }),

          // ========== Question Flow Actions ==========
          setCurrentQuestion: (question) => set((state) => {
            state.questionFlow.currentQuestion = question
          }),

          addToQuestionHistory: (completed) => set((state) => {
            state.questionFlow.questionHistory.push(completed)
          }),

          updateBusinessContext: (context) => set((state) => {
            state.questionFlow.businessContext = state.questionFlow.businessContext 
              ? { ...state.questionFlow.businessContext, ...context }
              : context as BusinessContext
          }),

          setFlowPhase: (phase) => set((state) => {
            state.questionFlow.flowPhase = phase
          }),

          updateEngagementScore: (score) => set((state) => {
            state.questionFlow.engagementScore = score
          }),

          setQuestionFlowLoading: (loading) => set((state) => {
            state.questionFlow.isLoading = loading
          }),

          setQuestionFlowError: (error) => set((state) => {
            state.questionFlow.error = error
          }),

          // ========== Preview Actions ==========
          markAsGenerated: (choiceId, content) => set((state) => {
            state.preview.generatedChoices.add(choiceId)
            state.preview.cachedPreviews.set(choiceId, content)
          }),

          startGenerating: (choiceId) => set((state) => {
            state.preview.currentlyGenerating = choiceId
          }),

          finishGenerating: (choiceId) => set((state) => {
            state.preview.currentlyGenerating = null
            state.preview.generationQueue = state.preview.generationQueue.filter(id => id !== choiceId)
          }),

          setCurrentPreview: (choiceId) => set((state) => {
            state.preview.currentPreview = choiceId
          }),

          updateGenerationProgress: (choiceId, progress, stage) => set((state) => {
            state.preview.generationProgress.set(choiceId, progress)
            if (stage) {
              state.preview.generationStages.set(choiceId, stage)
            }
          }),

          addToGenerationQueue: (choiceId) => set((state) => {
            if (!state.preview.generationQueue.includes(choiceId)) {
              state.preview.generationQueue.push(choiceId)
            }
          }),

          removeFromGenerationQueue: (choiceId) => set((state) => {
            state.preview.generationQueue = state.preview.generationQueue.filter(id => id !== choiceId)
          }),

          // ========== Editing Guidance Actions ==========
          setGuidanceStep: (step) => set((state) => {
            state.ui.editingGuidance.currentStep = step
            state.ui.editingGuidance.shouldShowHeroEditButton = step === 1
          }),

          setGuidanceVisible: (visible) => set((state) => {
            state.ui.editingGuidance.isVisible = visible
            if (!visible) {
              state.ui.editingGuidance.shouldShowHeroEditButton = false
            }
          }),

          setShouldShowHeroEditButton: (show) => set((state) => {
            state.ui.editingGuidance.shouldShowHeroEditButton = show
          }),

          setGuidanceDismissed: (dismissed) => set((state) => {
            state.ui.editingGuidance.hasBeenDismissed = dismissed
            if (dismissed) {
              state.ui.editingGuidance.isVisible = false
            }
          }),

          // ========== History Actions ==========
          recordEdit: (layoutId, sectionType, sectionId, content, userAction) => set((state) => {
            const key = `${layoutId}_${sectionType}_${sectionId}`
            const MAX_HISTORY = 10

            if (!state.history.sections[key]) {
              state.history.sections[key] = {
                edits: [],
                currentIndex: -1
              }
            }

            const history = state.history.sections[key]
            
            // Remove any edits after current index (when recording after undo)
            history.edits = history.edits.slice(0, history.currentIndex + 1)
            
            // Add new edit
            history.edits.push({
              id: `${Date.now()}-${Math.random()}`,
              content,
              userAction,
              timestamp: Date.now()
            })

            // Maintain max history limit
            if (history.edits.length > MAX_HISTORY) {
              history.edits = history.edits.slice(-MAX_HISTORY)
            }

            history.currentIndex = history.edits.length - 1
          }),

          undo: (layoutId, sectionType, sectionId) => {
            const key = `${layoutId}_${sectionType}_${sectionId}`
            const history = get().history.sections[key]
            
            if (!history || history.currentIndex <= 0) return null

            set((state) => {
              state.history.sections[key].currentIndex--
            })

            return get().history.sections[key].edits[get().history.sections[key].currentIndex]
          },

          redo: (layoutId, sectionType, sectionId) => {
            const key = `${layoutId}_${sectionType}_${sectionId}`
            const history = get().history.sections[key]
            
            if (!history || history.currentIndex >= history.edits.length - 1) return null

            set((state) => {
              state.history.sections[key].currentIndex++
            })

            return get().history.sections[key].edits[get().history.sections[key].currentIndex]
          },

          clearSectionHistory: (layoutId, sectionType, sectionId) => set((state) => {
            const key = `${layoutId}_${sectionType}_${sectionId}`
            delete state.history.sections[key]
          }),

          // ========== Global Actions ==========
          reset: () => set(() => ({
            ...initialState,
            actions: get().actions
          })),

          resetQuestionFlow: () => set((state) => {
            state.questionFlow = initialState.questionFlow
          }),

          resetPreview: () => set((state) => {
            state.preview = initialState.preview
          })
        }
      })),
      {
        name: 'unified-builder-store',
        partialize: (state) => ({
          // Persist only necessary data
          business: state.business,
          questionFlow: {
            ...state.questionFlow,
            // Don't persist transient state
            isLoading: false,
            isGeneratingQuestion: false,
            error: null
          },
          history: state.history
          // Don't persist UI state or preview cache
        })
      }
    ),
    {
      name: 'UnifiedBuilderStore'
    }
  )
)

// ============================================
// Granular Selectors for Performance
// ============================================

// Business selectors
export const useBusinessIdea = () => useUnifiedBuilderStore(state => state.business.idea)
export const useBusinessConfig = () => useUnifiedBuilderStore(state => state.business.config)
export const useBuildProgress = () => useUnifiedBuilderStore(state => state.business.progress)

// Question flow selectors
export const useCurrentQuestion = () => useUnifiedBuilderStore(state => state.questionFlow.currentQuestion)
export const useQuestionHistory = () => useUnifiedBuilderStore(state => state.questionFlow.questionHistory)
export const useEngagementScore = () => useUnifiedBuilderStore(state => state.questionFlow.engagementScore)
export const useFlowProgress = () => useUnifiedBuilderStore(state => ({
  completionPercentage: state.questionFlow.completionPercentage,
  engagementScore: state.questionFlow.engagementScore,
  timeSpent: state.questionFlow.timeSpent
}))

// Preview selectors
export const useIsGenerating = (choiceId: string) => useUnifiedBuilderStore(
  state => state.preview.currentlyGenerating === choiceId
)
export const useIsGenerated = (choiceId: string) => useUnifiedBuilderStore(
  state => state.preview.generatedChoices.has(choiceId)
)
export const useGenerationProgress = (choiceId: string) => useUnifiedBuilderStore(
  state => state.preview.generationProgress.get(choiceId) || 0
)

// UI selectors
export const useIsModalOpen = () => useUnifiedBuilderStore(state => state.ui.isModalOpen)
export const useIsBuilderOpen = () => useUnifiedBuilderStore(state => state.ui.isBuilderOpen)
export const useEditingGuidance = () => useUnifiedBuilderStore(state => state.ui.editingGuidance)

// History selectors
export const useCanUndo = (layoutId: string, sectionType: string, sectionId: string) => {
  const key = `${layoutId}_${sectionType}_${sectionId}`
  return useUnifiedBuilderStore(state => {
    const history = state.history.sections[key]
    return history ? history.currentIndex > 0 : false
  })
}

export const useCanRedo = (layoutId: string, sectionType: string, sectionId: string) => {
  const key = `${layoutId}_${sectionType}_${sectionId}`
  return useUnifiedBuilderStore(state => {
    const history = state.history.sections[key]
    return history ? history.currentIndex < history.edits.length - 1 : false
  })
}

// Actions selector - for components that need multiple actions
export const useBuilderActions = () => useUnifiedBuilderStore(state => state.actions)