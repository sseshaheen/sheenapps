/**
 * Compatibility layer for builder-store.ts
 * Maps the original builder store API to the unified store
 */

import { 
  useUnifiedBuilderStore,
  useBusinessIdea,
  useBusinessConfig,
  useBuildProgress,
  useIsModalOpen,
  useIsBuilderOpen,
  useBuilderActions
} from '../unified-builder-store'

// Re-export types
export type { BusinessIdea, BuilderConfig, BuildProgress } from '../unified-builder-store'

// Create a compatibility hook that matches the original API
export const useBuilderStore = () => {
  const businessIdea = useBusinessIdea()
  const config = useBusinessConfig()
  const progress = useBuildProgress()
  const isModalOpen = useIsModalOpen()
  const isBuilderOpen = useIsBuilderOpen()
  const actions = useBuilderActions()

  return {
    // State
    businessIdea,
    config,
    progress,
    isModalOpen,
    isBuilderOpen,
    
    // Actions
    setBusinessIdea: actions.setBusinessIdea,
    updateConfig: actions.updateConfig,
    setProgress: actions.setProgress,
    openModal: actions.openModal,
    closeModal: actions.closeModal,
    openBuilder: actions.openBuilder,
    closeBuilder: actions.closeBuilder,
    reset: actions.reset
  }
}

// Individual selector exports for better performance
export { 
  useBusinessIdea,
  useBusinessConfig,
  useBuildProgress,
  useIsModalOpen,
  useIsBuilderOpen
}