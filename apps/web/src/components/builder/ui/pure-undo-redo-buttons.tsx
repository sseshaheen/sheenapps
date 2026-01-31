/**
 * Pure Data Undo/Redo Buttons - Sprint 3 Implementation
 * Expert requirement: "Update button states via selectors"
 */

'use client'

import React from 'react'
import { usePureDataHistory } from '@/services/undo-redo/PureDataHistoryManager'
import { BUTTON_STYLES, TIMEOUTS } from '@/config/ui-constants'

export interface PureUndoRedoButtonsProps {
  /** Position of the buttons */
  position?: 'inline' | 'floating' | 'toolbar'
  
  /** Section ID for context (optional) */
  sectionId?: string
  
  /** Custom styling */
  className?: string
  
  /** Show button labels */
  showLabels?: boolean
  
  /** Callback for button actions */
  onAction?: (action: 'undo' | 'redo', result: any) => void
}

/**
 * Pure Data Undo/Redo Buttons
 * 
 * Replaces DOM-dependent button system with pure React components
 * that use store selectors for state and pure data operations.
 */
export function PureUndoRedoButtons({
  position = 'inline',
  sectionId,
  className = '',
  showLabels = false,
  onAction
}: PureUndoRedoButtonsProps) {
  const { undo, redo, canUndo, canRedo, historyState } = usePureDataHistory()

  const handleUndo = async () => {
    const result = undo()
    
    if (result.success) {
      console.log(`Pure data undo successful - affected ${result.sectionsAffected.length} sections`)
    } else {
      console.warn('Pure data undo failed:', result.error)
    }

    onAction?.('undo', result)
  }

  const handleRedo = async () => {
    const result = redo()
    
    if (result.success) {
      console.log(`Pure data redo successful - affected ${result.sectionsAffected.length} sections`)
    } else {
      console.warn('Pure data redo failed:', result.error)
    }

    onAction?.('redo', result)
  }

  // Position-specific styling
  const getPositionStyles = () => {
    switch (position) {
      case 'floating':
        return {
          position: 'absolute' as const,
          top: '1rem',
          right: '1rem',
          zIndex: 50,
          display: 'flex',
          gap: '0.5rem',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '0.5rem',
          padding: '0.5rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }
      case 'toolbar':
        return {
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center'
        }
      default:
        return {
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center'
        }
    }
  }

  return (
    <div 
      className={`pure-undo-redo-buttons ${className}`}
      style={getPositionStyles()}
      data-section-id={sectionId}
      data-position={position}
    >
      {/* Undo Button */}
      <button
        onClick={handleUndo}
        disabled={!canUndo}
        className="undo-button"
        style={{
          ...BUTTON_STYLES.undo,
          opacity: canUndo ? 1 : 0.5,
          cursor: canUndo ? 'pointer' : 'not-allowed',
          padding: showLabels ? '0.5rem 1rem' : '0.5rem',
          borderRadius: '0.25rem',
          border: 'none',
          color: 'white',
          fontSize: '0.875rem',
          fontWeight: '500',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem'
        }}
        title={`Undo (${historyState.currentIndex + 1}/${historyState.historyLength})`}
        onMouseOver={(e) => {
          if (canUndo) {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)'
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <span>↶</span>
        {showLabels && <span>Undo</span>}
      </button>

      {/* Redo Button */}
      <button
        onClick={handleRedo}
        disabled={!canRedo}
        className="redo-button"
        style={{
          ...BUTTON_STYLES.redo,
          opacity: canRedo ? 1 : 0.5,
          cursor: canRedo ? 'pointer' : 'not-allowed',
          padding: showLabels ? '0.5rem 1rem' : '0.5rem',
          borderRadius: '0.25rem',
          border: 'none',
          color: 'white',
          fontSize: '0.875rem',
          fontWeight: '500',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem'
        }}
        title={`Redo (${historyState.currentIndex + 1}/${historyState.historyLength})`}
        onMouseOver={(e) => {
          if (canRedo) {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)'
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <span>↷</span>
        {showLabels && <span>Redo</span>}
      </button>

      {/* History State Debug Info (development only) */}
      {/* eslint-disable-next-line no-restricted-globals */}
      {process.env.NODE_ENV === 'development' && (
        <div 
          style={{
            fontSize: '0.75rem',
            color: '#666',
            marginLeft: '0.5rem',
            fontFamily: 'monospace'
          }}
          title="History Debug Info"
        >
          {historyState.currentIndex + 1}/{historyState.historyLength}
        </div>
      )}
    </div>
  )
}

/**
 * Section-specific pure undo/redo buttons
 * For use in section edit overlays
 */
export function SectionPureUndoRedoButtons({
  sectionId,
  onAction
}: {
  sectionId: string
  onAction?: (action: 'undo' | 'redo', result: any) => void
}) {
  return (
    <PureUndoRedoButtons
      position="inline"
      sectionId={sectionId}
      showLabels={false}
      onAction={onAction}
      className="section-undo-redo"
    />
  )
}

/**
 * Floating pure undo/redo buttons
 * For use in workspace overlay
 */
export function FloatingPureUndoRedoButtons({
  onAction
}: {
  onAction?: (action: 'undo' | 'redo', result: any) => void
}) {
  return (
    <PureUndoRedoButtons
      position="floating"
      showLabels={true}
      onAction={onAction}
      className="floating-undo-redo"
    />
  )
}

/**
 * Toolbar pure undo/redo buttons
 * For use in workspace header/toolbar
 */
export function ToolbarPureUndoRedoButtons({
  onAction
}: {
  onAction?: (action: 'undo' | 'redo', result: any) => void
}) {
  return (
    <PureUndoRedoButtons
      position="toolbar"
      showLabels={true}
      onAction={onAction}
      className="toolbar-undo-redo"
    />
  )
}

/**
 * History state indicator component
 * Shows current history position and validation status
 */
export function HistoryStateIndicator() {
  const { historyState, validateIntegrity, getMetrics } = usePureDataHistory()
  const [expanded, setExpanded] = React.useState(false)

  const validation = validateIntegrity()
  const metrics = getMetrics()

  // eslint-disable-next-line no-restricted-globals
  if (process.env.NODE_ENV !== 'development') {
    return null // Only show in development
  }

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        background: validation.isValid ? '#10b981' : '#ef4444',
        color: 'white',
        padding: '0.5rem',
        borderRadius: '0.25rem',
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        cursor: 'pointer',
        zIndex: 1000
      }}
      onClick={() => setExpanded(!expanded)}
      title="Click to expand history details"
    >
      <div>
        History: {historyState.currentIndex + 1}/{historyState.historyLength}
        {!validation.isValid && ' ⚠️'}
      </div>
      
      {expanded && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.7rem' }}>
          <div>Sections: {historyState.sectionsCount}</div>
          <div>Memory: ~{Math.round(metrics.memoryEstimate / 1024)}KB</div>
          <div>Valid: {validation.isValid ? 'Yes' : 'No'}</div>
          {validation.issues.length > 0 && (
            <div style={{ color: '#fbbf24' }}>
              Issues: {validation.issues.length}
            </div>
          )}
        </div>
      )}
    </div>
  )
}