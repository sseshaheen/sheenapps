/**
 * Undo/Redo Buttons - Expert requirement: Button enable/disable is just canUndo selector
 * Uses selectors for enable/disable state, no hidden managers
 */

'use client'

import React from 'react'
import { useBuilderStore, selectors } from '@/store/builder-store'
import { logger } from '@/utils/logger'

interface UndoRedoButtonsProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  showLabels?: boolean
}

export function UndoRedoButtons({ 
  className = '', 
  size = 'md',
  showLabels = true 
}: UndoRedoButtonsProps) {
  // Use unified store for undo/redo state
  const canUndo = useBuilderStore(selectors.canUndo)
  const canRedo = useBuilderStore(selectors.canRedo)
  const { undo, redo } = useBuilderStore()

  const handleUndo = () => {
    if (canUndo) {
      logger.info('🔄 Undo triggered from buttons')
      undo()
    }
  }

  const handleRedo = () => {
    if (canRedo) {
      logger.info('🔄 Redo triggered from buttons')
      redo()
    }
  }

  const sizeClasses = {
    sm: 'p-1.5 text-xs',
    md: 'p-2 text-sm',
    lg: 'p-3 text-base'
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4', 
    lg: 'w-5 h-5'
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Undo Button */}
      <button
        onClick={handleUndo}
        disabled={!canUndo}
        className={`
          ${sizeClasses[size]}
          rounded-md border transition-colors
          ${canUndo 
            ? 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700 hover:text-gray-900' 
            : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
          }
        `}
        title="Undo (Ctrl+Z)"
      >
        <div className="flex items-center gap-1.5">
          <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
          </svg>
          {showLabels && <span>Undo</span>}
        </div>
      </button>

      {/* Redo Button */}
      <button
        onClick={handleRedo}
        disabled={!canRedo}
        className={`
          ${sizeClasses[size]}
          rounded-md border transition-colors
          ${canRedo 
            ? 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700 hover:text-gray-900' 
            : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
          }
        `}
        title="Redo (Ctrl+Y)"
      >
        <div className="flex items-center gap-1.5">
          <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
          </svg>
          {showLabels && <span>Redo</span>}
        </div>
      </button>
    </div>
  )
}

// Utility components for specific use cases
export function SimpleUndoButton() {
  const canUndo = useBuilderStore(selectors.canUndo)
  const { undo } = useBuilderStore()

  return (
    <button
      onClick={() => canUndo && undo()}
      disabled={!canUndo}
      className={`p-2 rounded-md border transition-colors ${
        canUndo 
          ? 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700' 
          : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
      }`}
      title="Undo"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
      </svg>
    </button>
  )
}

export function SimpleRedoButton() {
  const canRedo = useBuilderStore(selectors.canRedo)
  const { redo } = useBuilderStore()

  return (
    <button
      onClick={() => canRedo && redo()}
      disabled={!canRedo}
      className={`p-2 rounded-md border transition-colors ${
        canRedo 
          ? 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700' 
          : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
      }`}
      title="Redo"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
      </svg>
    </button>
  )
}

export function UndoRedoIndicator() {
  const historyLength = useBuilderStore(selectors.historyLength)
  const canUndo = useBuilderStore(selectors.canUndo)
  const canRedo = useBuilderStore(selectors.canRedo)

  return (
    <div className="text-xs text-gray-500 flex items-center gap-2">
      <span>History: {historyLength}</span>
      <div className="flex gap-1">
        <span className={canUndo ? 'text-blue-600' : 'text-gray-400'}>↶</span>
        <span className={canRedo ? 'text-green-600' : 'text-gray-400'}>↷</span>
      </div>
    </div>
  )
}