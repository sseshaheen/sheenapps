import { create } from 'zustand'

interface EditingGuidanceState {
  // Current guidance step
  currentStep: number
  
  // Whether guidance is currently visible
  isVisible: boolean
  
  // Whether to force show edit button for hero section (step 1 - "first-edit")
  shouldShowHeroEditButton: boolean
  
  // Actions
  setCurrentStep: (step: number) => void
  setVisible: (visible: boolean) => void
  setShouldShowHeroEditButton: (show: boolean) => void
  reset: () => void
}

/**
 * Store for coordinating editing guidance state between components
 * Allows EditingGuidance to communicate with preview components
 */
export const useEditingGuidanceStore = create<EditingGuidanceState>((set) => ({
  currentStep: 0,
  isVisible: false,
  shouldShowHeroEditButton: false,
  
  setCurrentStep: (step: number) => set((state) => ({
    ...state,
    currentStep: step,
    // Show hero edit button only on step 1 (first-edit)
    shouldShowHeroEditButton: step === 1
  })),
  
  setVisible: (visible: boolean) => set((state) => ({
    ...state,
    isVisible: visible,
    // Hide hero edit button when guidance is not visible
    shouldShowHeroEditButton: visible ? state.shouldShowHeroEditButton : false
  })),
  
  setShouldShowHeroEditButton: (show: boolean) => set((state) => ({
    ...state,
    shouldShowHeroEditButton: show
  })),
  
  reset: () => set({
    currentStep: 0,
    isVisible: false,
    shouldShowHeroEditButton: false
  })
}))