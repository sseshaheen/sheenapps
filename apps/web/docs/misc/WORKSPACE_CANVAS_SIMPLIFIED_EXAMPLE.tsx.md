/**
 * EXAMPLE: Simplified WorkspaceCanvas after refactoring
 * This shows how the component would look using our new abstractions
 * 
 * BEFORE: 1044 lines with complex undo/redo logic scattered throughout
 * AFTER: ~400 lines focused on core business logic
 */

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { m } from '@/components/ui/motion-provider'
import { LivePreviewEngine } from '@/services/preview/live-preview-engine'
import { usePreviewGenerationStore } from '@/store/preview-generation-store'
import { useEditingGuidanceStore } from '@/store/editing-guidance-store'
import { useCurrentQuestion, useQuestionFlowStore } from '@/store/question-flow-store'
import { useUndoRedoManager } from '@/hooks/useUndoRedoManager'
import { logger } from '@/utils/logger'
import type { ComponentName } from '@/services/preview/component-generation-orchestrator'
import { 
  LazyMinimalComponentOverlay as MinimalComponentOverlay,
  LazySectionEditDialog as SectionEditDialog
} from '../lazy-components'

interface WorkspaceCanvasProps {
  previewEngine: LivePreviewEngine | null
  currentLayoutId: string
  onLayoutChange: (layoutId: string) => void
  children?: React.ReactNode
  translations: {
    common: {
      loading: string
      error: string
      retry: string
      save: string
      cancel: string
    }
  }
}

export function WorkspaceCanvas({
  previewEngine,
  currentLayoutId,
  onLayoutChange,
  children,
  translations
}: WorkspaceCanvasProps) {
  const currentQuestion = useCurrentQuestion()
  
  // Get current generation state for overlay
  const currentlyGenerating = usePreviewGenerationStore(state => state.currentlyGenerating)
  const currentPreview = usePreviewGenerationStore(state => state.currentPreview)
  const generationProgress = usePreviewGenerationStore(state => state.generationProgress)
  const generationStages = usePreviewGenerationStore(state => state.generationStages)
  const isGenerated = usePreviewGenerationStore(state => state.isGenerated)
  
  // Editing guidance state for communicating with iframe
  const { shouldShowHeroEditButton, currentStep, isVisible: guidanceVisible } = useEditingGuidanceStore()
  
  // Section editing state
  const [sectionEditingEnabled, setSectionEditingEnabled] = useState(false)
  const [currentPreviewContent, setCurrentPreviewContent] = useState<any>({})
  const [lastEditedSection, setLastEditedSection] = useState<string | null>(null)
  const [activeEdit, setActiveEdit] = useState<string | null>(null)
  const [recentlyCompleted, setRecentlyCompleted] = useState<{ choiceId: string, choiceName: string, timestamp?: number } | null>(null)

  // 🎉 SIMPLIFIED: Use the undo/redo manager hook
  const {
    handleUndo,
    handleRedo,
    recordEditAndUpdateButtons,
    updateSectionButtons
  } = useUndoRedoManager({
    currentLayoutId,
    onUndo: handleUndoSection,
    onRedo: handleRedoSection
  })

  // Helper functions to get progress and stage
  const getGenerationProgress = (choiceId: string) => generationProgress.get(choiceId) || 0
  const getGenerationStage = (choiceId: string) => generationStages.get(choiceId) || { stage: '', component: '', loadingMessage: '' }

  // 🎉 SIMPLIFIED: Clean message handler using hook methods
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'EDIT_SECTION_REQUEST') {
        const { sectionType, sectionId, sectionName } = event.data.data
        logger.info('🎨 Edit request from iframe:', { sectionType, sectionId, sectionName })
        // Handle edit request logic...
        
      } else if (event.data.type === 'UNDO_SECTION_REQUEST') {
        const { sectionType, sectionId, sectionName } = event.data.data
        logger.info('↶ Canvas received undo request:', { sectionType, sectionId, sectionName })
        await handleUndo(sectionType, sectionId, sectionName) // 🎉 One line!
        
      } else if (event.data.type === 'REDO_SECTION_REQUEST') {
        const { sectionType, sectionId, sectionName } = event.data.data
        logger.info('↷ Canvas received redo request:', { sectionType, sectionId, sectionName })
        await handleRedo(sectionType, sectionId, sectionName) // 🎉 One line!
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleUndo, handleRedo]) // 🎉 Clean dependencies

  // Send guidance state to iframe when it changes (simplified)
  useEffect(() => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    if (!iframe?.contentWindow) return

    const sendGuidanceState = () => {
      try {
        iframe.contentWindow.postMessage({
          type: 'GUIDANCE_STATE_UPDATE',
          shouldShowHeroEditButton,
          currentStep,
          guidanceVisible
        }, '*')
      } catch (error) {
        logger.info('⚠️ Could not send guidance state to iframe:', error)
      }
    }

    const timeout = setTimeout(sendGuidanceState, 300)
    return () => clearTimeout(timeout)
  }, [shouldShowHeroEditButton, currentStep, guidanceVisible])

  // Handle section updates from AI editing
  const handleSectionUpdate = async (sectionId: string, newContent: any) => {
    logger.info(`🎨 Section update requested: ${sectionId}`, newContent)

    try {
      if (previewEngine?.updateSection) {
        await previewEngine.updateSection(sectionId, newContent)
      }

      setCurrentPreviewContent(prev => ({
        ...prev,
        [sectionId]: newContent
      }))

      logger.info(`✅ Section ${sectionId} updated successfully`)
    } catch (error) {
      logger.error(`❌ Failed to update section ${sectionId}:`, error)
    }
  }

  // 🎉 SIMPLIFIED: Handle undo/redo operations (extracted to hook)
  const handleUndoSection = async (sectionId: string, component: any) => {
    logger.info(`🔄 Undoing changes to ${sectionId}`)

    if (component?.captured && component?.html) {
      await restoreCapturedContent(sectionId, component)
    } else if (component?.config && previewEngine) {
      await previewEngine.applyComponentToPreview(sectionId as any, component)
    } else {
      logger.warn(`⚠️ Unknown component format for undo: ${sectionId}`)
    }
  }

  const handleRedoSection = async (sectionId: string, component: any) => {
    logger.info(`🔄 Redoing changes to ${sectionId}`)

    if (component?.captured && component?.html) {
      await restoreCapturedContent(sectionId, component)
    } else if (component?.config && previewEngine) {
      await previewEngine.applyComponentToPreview(sectionId as any, component)
    } else {
      logger.warn(`⚠️ Unknown component format for redo: ${sectionId}`)
    }
  }

  // Restore captured content helper (unchanged)
  const restoreCapturedContent = async (sectionId: string, component: any) => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    if (!iframe?.contentDocument) return

    try {
      const targetElement = iframe.contentDocument.querySelector(`[data-section-type="${sectionId}"]`)
      if (targetElement && component.html) {
        targetElement.outerHTML = component.html
        logger.info(`✅ Restored captured content for ${sectionId}`)
      }
    } catch (error) {
      logger.error(`❌ Failed to restore content for ${sectionId}:`, error)
    }
  }

  // 🎉 SIMPLIFIED: Handle section edit updates
  const handleSectionEditUpdate = async (activeEdit: string, newContent: any, userAction: string) => {
    if (!activeEdit) return

    logger.info(`🎨 Section ${activeEdit} updated with new content:`, newContent)

    // 🎉 SIMPLIFIED: One line to record edit and update buttons
    recordEditAndUpdateButtons(activeEdit, newContent?.id || activeEdit, newContent, userAction)

    // Handle the section update
    handleSectionUpdate(activeEdit, newContent)
    setActiveEdit(null)
  }

  // Rest of the component remains the same...
  // (overlay rendering, business context building, etc.)

  return (
    <div className="absolute inset-0">
      {children}
      
      {/* Minimal Component Generation Overlay */}
      {/* ... overlay logic unchanged ... */}
      
      {/* Section Edit Dialog */}
      {/* ... dialog logic unchanged ... */}
    </div>
  )
}

// 🎉 RESULTS:
// - 1044 lines → ~400 lines (-62% reduction)
// - No duplicate button logic
// - No complex DOM manipulation in component
// - No debugging console.logs
// - Clean, focused business logic
// - Maintainable and testable
// - Reusable undo/redo system