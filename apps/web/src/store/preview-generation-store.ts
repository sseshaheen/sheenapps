// Centralized store for preview generation state
import { create } from 'zustand'
import { logger } from '@/utils/logger';

interface GenerationState {
  // Track which choices have been generated
  generatedChoices: Set<string>
  
  // Track which choice is currently being generated
  currentlyGenerating: string | null
  
  // Track generation queue (choices waiting to be generated) 
  generationQueue: string[]
  
  // Track which choice is currently being previewed
  currentPreview: string | null
  
  // Track cached preview content
  cachedPreviews: Map<string, any>
  
  // Track generation progress per choice
  generationProgress: Map<string, number>
  
  // Track generation stage per choice
  generationStages: Map<string, { stage: string; component: string; loadingMessage: string }>
  
  // Actions
  markAsGenerated: (choiceId: string, content: any) => void
  startGenerating: (choiceId: string) => void
  finishGenerating: (choiceId: string) => void
  setCurrentPreview: (choiceId: string | null) => void
  addToQueue: (choiceIds: string[]) => void
  removeFromQueue: (choiceId: string) => void
  prioritizeInQueue: (choiceId: string) => void
  addToGenerationQueue: (choiceId: string) => void
  updateGenerationProgress: (choiceId: string, progress: number, stage?: { stage: string; component: string; loadingMessage: string; completedComponents?: number; totalComponents?: number }) => void
  getCachedPreview: (choiceId: string) => any | null
  getGenerationProgress: (choiceId: string) => number
  getGenerationStage: (choiceId: string) => { stage: string; component: string; loadingMessage: string } | null
  isGenerated: (choiceId: string) => boolean
  isInQueue: (choiceId: string) => boolean
  isGenerating: (choiceId: string) => boolean
  cleanupCompletedGeneration: (choiceId: string) => void
  reset: () => void
  forceFinishAll: () => void
}

export const usePreviewGenerationStore = create<GenerationState>((set, get) => ({
  generatedChoices: new Set(),
  currentlyGenerating: null,
  generationQueue: [],
  currentPreview: null,
  cachedPreviews: new Map(),
  generationProgress: new Map(),
  generationStages: new Map(),

  markAsGenerated: (choiceId: string, content: any) => {
    set(state => ({
      generatedChoices: new Set([...state.generatedChoices, choiceId]),
      cachedPreviews: new Map(state.cachedPreviews).set(choiceId, content),
      currentlyGenerating: state.currentlyGenerating === choiceId ? null : state.currentlyGenerating
    }))
    
    // DEBUG: Log what content is being cached
    console.log('📦 CACHE DEBUG - Storing content for choice:', {
      choiceId,
      contentType: content?.type,
      hasModules: !!content?.modules,
      moduleKeys: content?.modules ? Object.keys(content.modules) : 'none',
      heroTitle: content?.modules?.hero?.props?.title || 'no hero title'
    })
    logger.info('✅ Marked as generated:', choiceId);
  },

  startGenerating: (choiceId: string) => {
    set(state => ({
      currentlyGenerating: choiceId,
      generationProgress: new Map(state.generationProgress).set(choiceId, 0),
      generationStages: new Map(state.generationStages)
    }))
    logger.info('🧠 Actually started generating:', choiceId);
  },

  finishGenerating: (choiceId: string) => {
    set(state => {
      const newProgress = new Map(state.generationProgress)
      const newStages = new Map(state.generationStages)
      
      // Set progress to 100% instead of deleting (for completion animation)
      newProgress.set(choiceId, 100)
      
      // Keep stage for completion display, or set completion stage
      newStages.set(choiceId, {
        stage: 'complete',
        component: 'completion',
        loadingMessage: 'Generation complete!'
      })
      
      return {
        currentlyGenerating: state.currentlyGenerating === choiceId ? null : state.currentlyGenerating,
        generationQueue: state.generationQueue.filter(id => id !== choiceId),
        generationProgress: newProgress,
        generationStages: newStages
      }
    })
    logger.info('✅ Finished generating and set progress to 100%:', choiceId);
  },

  setCurrentPreview: (choiceId: string | null) => {
    set({ currentPreview: choiceId })
  },

  addToQueue: (choiceIds: string[]) => {
    set(state => ({
      generationQueue: [...new Set([...state.generationQueue, ...choiceIds])]
    }))
  },

  addToGenerationQueue: (choiceId: string) => {
    set(state => {
      if (!state.generationQueue.includes(choiceId) && !state.generatedChoices.has(choiceId) && state.currentlyGenerating !== choiceId) {
        return {
          generationQueue: [...state.generationQueue, choiceId]
        }
      }
      return state
    })
    logger.info('📋 Added to generation queue:', choiceId);
  },

  removeFromQueue: (choiceId: string) => {
    set(state => ({
      generationQueue: state.generationQueue.filter(id => id !== choiceId)
    }))
  },

  prioritizeInQueue: (choiceId: string) => {
    set(state => ({
      generationQueue: [choiceId, ...state.generationQueue.filter(id => id !== choiceId)]
    }))
  },

  getCachedPreview: (choiceId: string) => {
    return get().cachedPreviews.get(choiceId) || null
  },

  isGenerated: (choiceId: string) => {
    return get().generatedChoices.has(choiceId)
  },

  isInQueue: (choiceId: string) => {
    return get().generationQueue.includes(choiceId)
  },

  isGenerating: (choiceId: string) => {
    return get().currentlyGenerating === choiceId
  },

  cleanupCompletedGeneration: (choiceId: string) => {
    set(state => {
      const newProgress = new Map(state.generationProgress)
      const newStages = new Map(state.generationStages)
      newProgress.delete(choiceId)
      newStages.delete(choiceId)
      
      return {
        generationProgress: newProgress,
        generationStages: newStages
      }
    })
    logger.info('🧹 Cleaned up completed generation data for:', choiceId);
  },

  updateGenerationProgress: (choiceId: string, progress: number, stage?: { stage: string; component: string; loadingMessage: string }) => {
    set(state => {
      const newProgress = new Map(state.generationProgress).set(choiceId, progress)
      const newStages = new Map(state.generationStages)
      if (stage) {
        newStages.set(choiceId, stage)
      }
      return {
        generationProgress: newProgress,
        generationStages: newStages
      }
    })
  },

  getGenerationProgress: (choiceId: string) => {
    return get().generationProgress.get(choiceId) || 0
  },

  getGenerationStage: (choiceId: string) => {
    return get().generationStages.get(choiceId) || null
  },

  reset: () => {
    set({
      generatedChoices: new Set(),
      currentlyGenerating: null,
      generationQueue: [],
      currentPreview: null,
      cachedPreviews: new Map(),
      generationProgress: new Map(),
      generationStages: new Map()
    })
  },

  forceFinishAll: () => {
    set(state => ({
      currentlyGenerating: null,
      generationProgress: new Map(),
      generationStages: new Map(),
      // Keep generated choices and cached previews
      generatedChoices: state.generatedChoices,
      cachedPreviews: state.cachedPreviews,
      generationQueue: state.generationQueue,
      currentPreview: state.currentPreview
    }))
    logger.info('🔧 Force finished all generating states');
  }
}))