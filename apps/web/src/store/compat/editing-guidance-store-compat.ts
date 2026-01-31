/**
 * Compatibility layer for editing-guidance-store.ts
 * Maps the original editing guidance store API to the unified store
 */

import { 
  useUnifiedBuilderStore,
  useEditingGuidance,
  useBuilderActions
} from '../unified-builder-store'

export const useEditingGuidanceStore = () => {
  const editingGuidance = useEditingGuidance()
  const actions = useBuilderActions()

  return {
    // State
    currentStep: editingGuidance.currentStep,
    isVisible: editingGuidance.isVisible,
    shouldShowHeroEditButton: editingGuidance.shouldShowHeroEditButton,
    hasBeenDismissed: editingGuidance.hasBeenDismissed,
    
    // Actions
    setCurrentStep: actions.setGuidanceStep,
    setVisible: actions.setGuidanceVisible,
    setShouldShowHeroEditButton: actions.setShouldShowHeroEditButton,
    setDismissed: actions.setGuidanceDismissed,
    reset: () => {
      actions.setGuidanceStep(0)
      actions.setGuidanceVisible(false)
      actions.setShouldShowHeroEditButton(false)
      // Note: Don't reset dismissed state - user's dismissal should persist
    }
  }
}

// Individual selector export
export { useEditingGuidance }