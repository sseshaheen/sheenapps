/**
 * Compatibility exports for gradual migration to unified store
 * Import from here instead of individual store files
 */

// Export compatibility layers that match original APIs
export { useBuilderStore } from './builder-store-compat'
export { useQuestionFlowStore } from './question-flow-store-compat'
export { usePreviewGenerationStore } from './preview-generation-store-compat'
export { useEditingGuidanceStore } from './editing-guidance-store-compat'
export { usePerSectionHistoryStore } from './per-section-history-store-compat'

// Re-export all individual selectors for better performance
export {
  // Builder selectors
  useBusinessIdea,
  useBusinessConfig,
  useBuildProgress,
  useIsModalOpen,
  useIsBuilderOpen,
  
  // Question flow selectors
  useCurrentQuestion,
  useQuestionHistory,
  useEngagementScore,
  useFlowProgress,
  
  // Preview selectors
  useIsGenerating,
  useIsGenerated,
  useGenerationProgress,
  
  // UI selectors
  useEditingGuidance,
  
  // History selectors
  useCanUndo,
  useCanRedo,
  
  // Actions
  useBuilderActions
} from '../unified-builder-store'

// Re-export types
export type { 
  BusinessIdea, 
  BuilderConfig, 
  BuildProgress 
} from '../unified-builder-store'