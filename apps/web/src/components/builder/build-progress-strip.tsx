/**
 * BuildProgressStrip Component
 *
 * Compact, pinned progress indicator shown during code generation.
 * Part of the "peek + pin" UX pattern - always visible during builds,
 * allows user to expand to full code viewer.
 *
 * Features:
 * - Shows file count: "Generating files... (3/18)"
 * - Shows current file being generated
 * - Expand button to show full code viewer
 * - Non-intrusive - doesn't steal scroll or hijack UI
 *
 * @see ux-analysis-code-generation-wait-time.md
 */

'use client'

import { useCodeViewerStore } from '@/store/code-viewer-store'
import { ChevronDown, ChevronUp, Code, Loader2 } from 'lucide-react'
import { useMemo } from 'react'

export interface BuildProgressStripProps {
  /**
   * Whether the code viewer is currently expanded/visible
   */
  isCodeViewerExpanded: boolean

  /**
   * Callback to toggle code viewer visibility
   */
  onToggleCodeViewer: () => void

  /**
   * Total number of planned files (if known from manifest)
   */
  plannedFileCount?: number

  /**
   * Optional class name for styling
   */
  className?: string
}

export function BuildProgressStrip({
  isCodeViewerExpanded,
  onToggleCodeViewer,
  plannedFileCount,
  className = '',
}: BuildProgressStripProps) {
  // Get streaming state from store
  const streaming = useCodeViewerStore((state) => state.streaming)
  const filesByPath = useCodeViewerStore((state) => state.filesByPath)
  const fileOrder = useCodeViewerStore((state) => state.fileOrder)

  // Calculate file counts
  // EXPERT FIX ROUND 16: Single pass through files array for efficiency
  const fileCounts = useMemo(() => {
    const inferredTotal = fileOrder.length
    const canShowFraction = (typeof plannedFileCount === 'number' && plannedFileCount > 0) || inferredTotal > 0
    const total = (typeof plannedFileCount === 'number' && plannedFileCount > 0) ? plannedFileCount : inferredTotal

    // Single iteration instead of double Object.values scan
    const files = Object.values(filesByPath)
    let completedRaw = 0
    let streamingCount = 0

    for (const f of files) {
      if (f.status === 'streaming') {
        streamingCount++
      } else if (f.status === 'modified' || f.status === 'new') {
        // 'modified' and 'new' are definitively "done"
        // Note: 'idle' excluded - it means "exists but hasn't been touched yet"
        completedRaw++
      }
    }

    const completed = total > 0 ? Math.min(completedRaw, total) : completedRaw

    return { total, completed, streamingCount, canShowFraction }
  }, [filesByPath, fileOrder, plannedFileCount])

  // Get current file name (just the filename, not full path)
  const currentFileName = useMemo(() => {
    if (!streaming.currentFile) return null
    const parts = streaming.currentFile.split('/')
    return parts[parts.length - 1]
  }, [streaming.currentFile])

  // EXPERT FIX ROUND 17: Show strip earlier when we know files are planned
  // Previously only showed when streaming or files completed, which missed the
  // "plan converted, waiting for first file" state
  const shouldShow =
    streaming.isActive ||
    fileCounts.completed > 0 ||
    (typeof plannedFileCount === 'number' && plannedFileCount > 0)

  if (!shouldShow) {
    return null
  }

  // Determine status text
  // EXPERT FIX ROUND 12/14: Use canShowFraction to show proper format (avoid "0/0")
  const statusText = streaming.isActive
    ? fileCounts.canShowFraction
      ? `Generating files... (${fileCounts.completed}/${fileCounts.total})`
      : `Generating files... (${fileCounts.completed})`
    : `${fileCounts.completed} files generated`

  return (
    <div
      className={`
        flex items-center justify-between gap-3 px-4 py-2
        bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800
        text-sm
        ${className}
      `}
    >
      {/* Left side: Status and current file */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Icon */}
        {streaming.isActive ? (
          <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" />
        ) : (
          <Code className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        )}

        {/* Status text */}
        <span className="text-blue-700 dark:text-blue-300 font-medium flex-shrink-0">
          {statusText}
        </span>

        {/* Current file indicator */}
        {currentFileName && streaming.isActive && (
          <span className="text-blue-600/70 dark:text-blue-400/70 truncate">
            · {currentFileName}
          </span>
        )}
      </div>

      {/* Right side: Expand/collapse button */}
      <button
        type="button"
        onClick={onToggleCodeViewer}
        className="
          flex items-center gap-1.5 px-3 py-1 rounded-md
          text-blue-700 dark:text-blue-300
          hover:bg-blue-100 dark:hover:bg-blue-900/50
          transition-colors flex-shrink-0
        "
      >
        <span className="text-sm">
          {isCodeViewerExpanded ? 'Hide Code' : 'View Code'}
        </span>
        {isCodeViewerExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}

export default BuildProgressStrip
