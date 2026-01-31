/**
 * useUndoRedoManager - Custom hook for managing undo/redo state and UI updates
 * Consolidates all the complex logic from workspace-canvas.tsx
 */

import { useCallback, useEffect, useRef } from 'react'
import { usePerSectionHistoryStore } from '@/stores/per-section-history-store'
import { UndoRedoButtonManager } from '@/services/undo-redo/UndoRedoButtonManager'
import { logger } from '@/utils/logger'
import { TIMEOUTS } from '@/config/ui-constants'

interface UndoRedoConfig {
  currentLayoutId: string | null
  onUndo?: (sectionType: string, content: any) => Promise<void>
  onRedo?: (sectionType: string, content: any) => Promise<void>
}

export function useUndoRedoManager(config: UndoRedoConfig) {
  const { currentLayoutId, onUndo, onRedo } = config
  
  // Store access
  const {
    undo: perSectionUndo,
    redo: perSectionRedo,
    canUndo: perSectionCanUndo,
    canRedo: perSectionCanRedo,
    recordEdit: perSectionRecordEdit
  } = usePerSectionHistoryStore()
  
  // Button manager instance
  const buttonManagerRef = useRef<UndoRedoButtonManager | null>(null)
  
  // Initialize button manager
  useEffect(() => {
    if (!buttonManagerRef.current) {
      buttonManagerRef.current = new UndoRedoButtonManager()
    }
    
    return () => {
      buttonManagerRef.current?.destroy()
    }
  }, [])

  /**
   * Update buttons for a section (handles both regular edits and undo/redo operations)
   */
  const updateSectionButtons = useCallback((
    sectionType: string, 
    componentId?: string,
    isUndoRedoOperation = false
  ) => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    if (!iframe || !buttonManagerRef.current) return

    const layoutId = currentLayoutId || 'default'
    const sectionKey = sectionType
    const sectionId = isUndoRedoOperation ? sectionType : (componentId || sectionType)
    
    const canUndo = perSectionCanUndo(layoutId, sectionType, sectionKey)
    const canRedo = perSectionCanRedo(layoutId, sectionType, sectionKey)
    
    logger.info(`🔄 Updating buttons for ${sectionType}:`, { 
      canUndo, 
      canRedo, 
      isUndoRedoOperation,
      layoutId,
      sectionId
    })

    if (isUndoRedoOperation) {
      // Use direct DOM manipulation for undo/redo operations
      buttonManagerRef.current.updateButtonsDirectly({
        sectionType,
        sectionId,
        layoutId,
        iframe,
        canUndo,
        canRedo
      })
    } else {
      // Use normal iframe communication for regular edits
      buttonManagerRef.current.updateButtons({
        sectionType,
        sectionId,
        layoutId,
        iframe,
        canUndo,
        canRedo
      })
    }
  }, [currentLayoutId, perSectionCanUndo, perSectionCanRedo])

  /**
   * Handle undo operation with proper button updates
   */
  const handleUndo = useCallback(async (
    sectionType: string
  ) => {
    const layoutId = currentLayoutId || 'default'
    const sectionKey = sectionType
    
    logger.info(`↶ Processing undo for ${sectionType}`)
    
    if (perSectionCanUndo(layoutId, sectionType, sectionKey)) {
      const undoData = perSectionUndo(layoutId, sectionType, sectionKey)
      
      if (undoData?.content && onUndo) {
        await onUndo(sectionType, undoData.content)
        
        // Update buttons after undo with slight delay for DOM updates
        setTimeout(() => {
          // Clear cache for this section to force update
          buttonManagerRef.current?.clearSection(sectionType)
          updateSectionButtons(sectionType, undefined, true)
        }, TIMEOUTS.UNDO_REDO_UPDATE_DELAY)
      }
    } else {
      logger.warn(`↶ No undo available for ${sectionType}`)
    }
  }, [currentLayoutId, perSectionCanUndo, perSectionUndo, onUndo, updateSectionButtons])

  /**
   * Handle redo operation with proper button updates
   */
  const handleRedo = useCallback(async (
    sectionType: string
  ) => {
    const layoutId = currentLayoutId || 'default'
    const sectionKey = sectionType
    
    logger.info(`↷ Processing redo for ${sectionType}`)
    
    if (perSectionCanRedo(layoutId, sectionType, sectionKey)) {
      const redoData = perSectionRedo(layoutId, sectionType, sectionKey)
      
      if (redoData?.content && onRedo) {
        await onRedo(sectionType, redoData.content)
        
        // Update buttons after redo with slight delay for DOM updates
        setTimeout(() => {
          // Clear cache for this section to force update
          buttonManagerRef.current?.clearSection(sectionType)
          updateSectionButtons(sectionType, undefined, true)
        }, TIMEOUTS.UNDO_REDO_UPDATE_DELAY)
      }
    } else {
      logger.warn(`↷ No redo available for ${sectionType}`)
    }
  }, [currentLayoutId, perSectionCanRedo, perSectionRedo, onRedo, updateSectionButtons])

  /**
   * Record an edit and update buttons
   */
  const recordEditAndUpdateButtons = useCallback((
    sectionType: string,
    componentId: string,
    content: any,
    userAction: string,
    originalContent?: any
  ) => {
    const layoutId = currentLayoutId || 'default'
    const sectionKey = sectionType
    
    // Check if we need to record baseline first
    const hasHistory = perSectionCanUndo(layoutId, sectionType, sectionKey) || perSectionCanRedo(layoutId, sectionType, sectionKey)
    
    logger.info(`🔍 Recording edit for ${sectionType}:`, {
      hasHistory,
      hasOriginalContent: !!originalContent,
      layoutId,
      sectionKey,
      componentId
    })
    
    if (!hasHistory && originalContent) {
      // Record baseline first
      perSectionRecordEdit(layoutId, sectionType, sectionKey, originalContent, 'original')
      logger.info(`📸 Recorded baseline for ${sectionType}`)
    }
    
    // Record the edit
    perSectionRecordEdit(layoutId, sectionType, sectionKey, content, userAction)
    
    // Update buttons after recording
    setTimeout(() => {
      logger.info(`🔄 Calling updateSectionButtons for ${sectionType} with componentId: ${componentId}`)
      updateSectionButtons(sectionType, componentId, false)
    }, TIMEOUTS.BUTTON_UPDATE_DELAY)
    
    logger.info(`✏️ Recorded edit for ${sectionType}: "${userAction}"`)
  }, [currentLayoutId, perSectionRecordEdit, perSectionCanUndo, perSectionCanRedo, updateSectionButtons])

  /**
   * Get current state for a section
   */
  const getSectionState = useCallback((sectionType: string) => {
    const layoutId = currentLayoutId || 'default'
    const sectionKey = sectionType
    
    return {
      canUndo: perSectionCanUndo(layoutId, sectionType, sectionKey),
      canRedo: perSectionCanRedo(layoutId, sectionType, sectionKey)
    }
  }, [currentLayoutId, perSectionCanUndo, perSectionCanRedo])

  return {
    // Primary methods
    updateSectionButtons,
    handleUndo,
    handleRedo,
    recordEditAndUpdateButtons,
    
    // Utility methods
    getSectionState,
    
    // Direct store access (for when needed)
    perSectionUndo,
    perSectionRedo,
    perSectionCanUndo,
    perSectionCanRedo,
    perSectionRecordEdit
  }
}