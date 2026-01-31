'use client'

import React, { useCallback, useRef } from 'react'
import { MobilePanel } from '../workspace/mobile-workspace-layout'
import { useCurrentQuestion } from '@/store/question-flow-store'
import { useBuilderStore, selectors } from '@/store/builder-store'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'

interface MobilePreviewPanelProps {
  previewContainerRef: (element: HTMLDivElement | null) => void
  children: React.ReactNode
}

export function MobilePreviewPanel({
  previewContainerRef,
  children
}: MobilePreviewPanelProps) {
  const currentQuestion = useCurrentQuestion()
  
  // Add undo/redo functionality for mobile
  const { undo, redo } = useBuilderStore()
  const currentLayoutId = useBuilderStore(selectors.currentLayout)?.id
  const sections = useBuilderStore(selectors.currentSections)
  const useReactPreview = FEATURE_FLAGS.ENABLE_REACT_PREVIEW
  
  // For mobile, we'll use a general undo/redo (since we don't know which section the user wants to modify)
  // We can improve this later with section-specific controls
  const canUndo = Object.keys(sections).length > 0 // Simple check - can improve with proper history
  const canRedo = false // For now, we'll implement basic undo only
  
  const handleUndo = () => {
    // For mobile, we'll implement a simple last-action undo
    // This can be enhanced with proper section-specific undo later
    console.log('📱 Mobile: Undo requested (to be implemented with section-specific logic)')
  }
  
  const handleRedo = () => {
    console.log('📱 Mobile: Redo requested (to be implemented with section-specific logic)')
  }
  
  // Debug: Log what children we're receiving
  // console.log('🔍 MobilePreviewPanel Debug:', {
  //   hasChildren: !!children,
  //   childrenType: typeof children,
  //   childrenKeys: React.isValidElement(children) ? Object.keys(children) : 'not-element',
  //   currentQuestion: !!currentQuestion
  // })
  
  // Create a ref to track the container element for the monitor component
  const containerElementRef = useRef<HTMLDivElement | null>(null)
  
  // Combined callback ref that handles both parent callback and local ref
  const combinedRef = useCallback((element: HTMLDivElement | null) => {
    containerElementRef.current = element
    previewContainerRef(element)
  }, [previewContainerRef])

  return (
    <MobilePanel id="preview" className="bg-gray-100">
      <div className="h-full flex flex-col">
        {/* Mobile Preview Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-white font-medium text-sm">
              {currentQuestion ? 'Live Preview' : 'Preview'}
            </h3>
            <div className="text-xs text-gray-400">
              {currentQuestion ? 'Updates live' : 'Start questions first'}
            </div>
          </div>
          
          {/* Mobile Undo/Redo Controls */}
          {useReactPreview && Object.keys(sections).length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={!canUndo}
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50"
                title="Undo last change"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRedo}
                disabled={!canRedo}
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50"
                title="Redo last change"
              >
                <Icon name="arrow-right" className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Preview Content */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={combinedRef}
            className="w-full h-full overflow-auto bg-white preview-container"
            style={{ minHeight: '100%' }}
            key="preview-container-stable"
          >
            {children}
          </div>

          {/* Mobile Preview Monitor - placeholder for future implementation */}
          {currentQuestion && (
            <div className="absolute top-2 right-2 bg-green-500 w-2 h-2 rounded-full"></div>
          )}
        </div>
      </div>
    </MobilePanel>
  )
}