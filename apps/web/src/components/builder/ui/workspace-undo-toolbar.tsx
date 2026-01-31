/**
 * Workspace Undo/Redo Toolbar - i18n-aware component
 *
 *
 * Research-backed design (Phase 9 - Arabic Launch):
 * - Prominent placement reduces user anxiety by 47% (LogRocket UX 2025)
 * - Visual cues signal reversibility, building trust
 * - Keyboard shortcuts (Ctrl+Z) expected by users
 * - Calm colors signal "safe to explore"
 */

'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { usePureDataHistory } from '@/services/undo-redo/PureDataHistoryManager'
import { useCallback, useEffect } from 'react'

export interface UndoToolbarTranslations {
  undo: string
  redo: string
  undoTooltip: string
  redoTooltip: string
  nothingToUndo: string
  nothingToRedo: string
  undoShortcut: string
  redoShortcut: string
}

interface WorkspaceUndoToolbarProps {
  translations: UndoToolbarTranslations
  /** Whether to show text labels (default: false for compact mode) */
  showLabels?: boolean
  /** Enable keyboard shortcuts (default: true) */
  enableShortcuts?: boolean
  /** Custom class name */
  className?: string
  /** Callback when undo/redo is performed */
  onAction?: (action: 'undo' | 'redo', success: boolean) => void
}

/**
 * Workspace Undo/Redo Toolbar
 *
 * Provides prominent, accessible undo/redo controls with:
 * - i18n support (Arabic dialects with dialect-appropriate messaging)
 * - Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z / Cmd on Mac)
 * - Visual feedback for available actions
 * - Tooltips with shortcuts info
 */
export function WorkspaceUndoToolbar({
  translations,
  showLabels = false,
  enableShortcuts = true,
  className,
  onAction
}: WorkspaceUndoToolbarProps) {
  const { undo, redo, canUndo, canRedo, historyState } = usePureDataHistory()

  const handleUndo = useCallback(() => {
    if (!canUndo) return
    const result = undo()
    onAction?.('undo', result.success)
  }, [canUndo, undo, onAction])

  const handleRedo = useCallback(() => {
    if (!canRedo) return
    const result = redo()
    onAction?.('redo', result.success)
  }, [canRedo, redo, onAction])

  // Keyboard shortcut handler
  useEffect(() => {
    if (!enableShortcuts) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept undo/redo when user is typing in an input field
      // They expect Ctrl+Z to undo their typing, not workspace state
      const target = e.target as HTMLElement | null
      const isTypingContext =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable

      if (isTypingContext) return

      // Check for Ctrl+Z (Windows) or Cmd+Z (Mac)
      const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
      const modifier = isMac ? e.metaKey : e.ctrlKey

      if (modifier && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          // Ctrl+Shift+Z = Redo
          handleRedo()
        } else {
          // Ctrl+Z = Undo
          handleUndo()
        }
      }

      // Also support Ctrl+Y for redo (Windows convention)
      if (!isMac && e.ctrlKey && e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enableShortcuts, handleUndo, handleRedo])

  // Build tooltip with shortcut info
  const undoTooltip = canUndo
    ? `${translations.undoTooltip} (${translations.undoShortcut})`
    : translations.nothingToUndo

  const redoTooltip = canRedo
    ? `${translations.redoTooltip} (${translations.redoShortcut})`
    : translations.nothingToRedo

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        className
      )}
      role="toolbar"
      aria-label="Undo/Redo"
    >
      {/* Undo Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleUndo}
        disabled={!canUndo}
        className={cn(
          'h-8 px-2 text-gray-300 hover:text-white hover:bg-gray-700/50',
          'transition-all duration-200',
          !canUndo && 'opacity-40 cursor-not-allowed'
        )}
        title={undoTooltip}
        aria-label={undoTooltip}
      >
        <Icon name="undo-2" className="w-4 h-4" />
        {showLabels && (
          <span className="ms-1.5 text-sm">{translations.undo}</span>
        )}
      </Button>

      {/* Redo Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRedo}
        disabled={!canRedo}
        className={cn(
          'h-8 px-2 text-gray-300 hover:text-white hover:bg-gray-700/50',
          'transition-all duration-200',
          !canRedo && 'opacity-40 cursor-not-allowed'
        )}
        title={redoTooltip}
        aria-label={redoTooltip}
      >
        <Icon name="redo-2" className="w-4 h-4" />
        {showLabels && (
          <span className="ms-1.5 text-sm">{translations.redo}</span>
        )}
      </Button>

      {/* History indicator (subtle, only when there's history) */}
      {historyState.historyLength > 1 && (
        <span
          className="text-xs text-gray-500 ms-1 tabular-nums"
          title={`${historyState.currentIndex + 1}/${historyState.historyLength}`}
        >
          {historyState.currentIndex + 1}/{historyState.historyLength}
        </span>
      )}
    </div>
  )
}

/**
 * Compact version for mobile/small screens
 */
export function CompactUndoToolbar({
  translations,
  onAction
}: Pick<WorkspaceUndoToolbarProps, 'translations' | 'onAction'>) {
  return (
    <WorkspaceUndoToolbar
      translations={translations}
      showLabels={false}
      enableShortcuts={true}
      onAction={onAction}
      className="gap-0.5"
    />
  )
}
