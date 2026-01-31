/**
 * Compatibility layer for preview-generation-store.ts
 * Maps the original preview generation store API to the unified store
 */

import { 
  useUnifiedBuilderStore,
  useIsGenerating,
  useIsGenerated,
  useGenerationProgress,
  useBuilderActions
} from '../unified-builder-store'

export const usePreviewGenerationStore = () => {
  const preview = useUnifiedBuilderStore(state => state.preview)
  const actions = useBuilderActions()

  return {
    // State
    generatedChoices: preview.generatedChoices,
    currentlyGenerating: preview.currentlyGenerating,
    generationQueue: preview.generationQueue,
    currentPreview: preview.currentPreview,
    cachedPreviews: preview.cachedPreviews,
    generationProgress: preview.generationProgress,
    generationStages: preview.generationStages,
    
    // Actions
    markAsGenerated: actions.markAsGenerated,
    startGenerating: actions.startGenerating,
    finishGenerating: actions.finishGenerating,
    setCurrentPreview: actions.setCurrentPreview,
    addToQueue: (choiceIds: string[]) => {
      choiceIds.forEach(id => actions.addToGenerationQueue(id))
    },
    removeFromQueue: actions.removeFromGenerationQueue,
    prioritizeInQueue: (choiceId: string) => {
      // Remove and re-add to front
      actions.removeFromGenerationQueue(choiceId)
      const currentQueue = useUnifiedBuilderStore.getState().preview.generationQueue
      useUnifiedBuilderStore.setState(state => ({
        ...state,
        preview: {
          ...state.preview,
          generationQueue: [choiceId, ...currentQueue]
        }
      }))
    },
    addToGenerationQueue: actions.addToGenerationQueue,
    updateGenerationProgress: actions.updateGenerationProgress,
    getCachedPreview: (choiceId: string) => preview.cachedPreviews.get(choiceId) || null,
    getGenerationProgress: (choiceId: string) => preview.generationProgress.get(choiceId) || 0,
    getGenerationStage: (choiceId: string) => preview.generationStages.get(choiceId) || null,
    isGenerated: (choiceId: string) => preview.generatedChoices.has(choiceId),
    isGenerating: (choiceId: string) => preview.currentlyGenerating === choiceId,
    reset: actions.resetPreview
  }
}

// Individual selector exports
export { 
  useIsGenerating,
  useIsGenerated,
  useGenerationProgress
}