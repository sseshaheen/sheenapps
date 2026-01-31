/**
 * Virtualized Code View
 *
 * High-performance code viewer using react-window v2 for virtualization.
 * Only renders visible lines + small buffer, enabling smooth scrolling
 * even for files with 100k+ lines.
 *
 * Key features:
 * - Fixed row height (no wrapping) - horizontal scroll for long lines
 * - Plain text during streaming, syntax highlighting on idle
 * - O(1) scroll to any line via react-window
 * - Memoized LineRow prevents unnecessary re-renders
 */

'use client'

import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { List, type ListImperativeAPI } from 'react-window'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { useLineIndex } from '@/hooks/use-line-index'
import { useIdleHighlight } from '@/hooks/use-idle-highlight'
import { type SearchMatch, type Token, LINE_HEIGHT } from './types'

// ============================================================================
// Constants
// ============================================================================

const OVERSCAN_COUNT = 10 // Render extra lines above/below viewport
const LINE_NUMBER_WIDTH = 48 // px for line number gutter

export interface VirtualizedCodeViewProps {
  content: string
  language: string
  isStreaming?: boolean
  showLineNumbers?: boolean
  highlightLines?: number[]
  currentSearchMatch?: SearchMatch | null
  followMode?: boolean
  className?: string
  /** Token map for syntax highlighting (line index -> tokens) */
  tokensByLine?: Map<number, Token[]>
}

// Row props passed via rowProps in react-window v2
interface LineRowProps {
  getLine: (index: number) => string
  showLineNumbers: boolean
  highlightLines: Set<number>
  currentMatchLine: number | null
  isDark: boolean
  tokensByLine?: Map<number, Token[]>
}

// ============================================================================
// LineRow Component
// ============================================================================

// React-window v2 rowComponent signature
interface LineRowComponentProps {
  ariaAttributes: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
  index: number
  style: React.CSSProperties
  getLine: (index: number) => string
  showLineNumbers: boolean
  highlightLines: Set<number>
  currentMatchLine: number | null
  isDark: boolean
  tokensByLine?: Map<number, Token[]>
}

function LineRow({
  ariaAttributes,
  index,
  style,
  getLine,
  showLineNumbers,
  highlightLines,
  currentMatchLine,
  isDark,
  tokensByLine,
}: LineRowComponentProps) {
  const lineContent = getLine(index)
  const lineNumber = index + 1 // 1-indexed for display
  const isSearchMatch = currentMatchLine === lineNumber
  const isHighlighted = highlightLines.has(lineNumber)
  const tokens = tokensByLine?.get(index)

  // Determine line background styling
  const lineStyle: React.CSSProperties = isSearchMatch
    ? {
        ...style,
        backgroundColor: isDark ? 'rgba(234, 179, 8, 0.2)' : 'rgba(234, 179, 8, 0.15)',
        borderLeft: '3px solid rgb(234, 179, 8)',
        paddingLeft: showLineNumbers ? undefined : '13px',
      }
    : isHighlighted
      ? {
          ...style,
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
          borderLeft: '3px solid rgb(59, 130, 246)',
          paddingLeft: showLineNumbers ? undefined : '13px',
        }
      : style

  return (
    // Spread ariaAttributes for react-window v2 accessibility semantics
    // CRITICAL: Explicit dir="ltr" ensures flex layout works in RTL page context.
    // react-window's internal wrappers may not inherit dir from parent container.
    <div {...ariaAttributes} dir="ltr" style={lineStyle} className="flex">
      {showLineNumbers && (
        <span
          className={cn(
            'flex-shrink-0 select-none text-muted-foreground/50 text-right pr-4',
            'font-mono text-sm'
          )}
          style={{ width: LINE_NUMBER_WIDTH, minWidth: LINE_NUMBER_WIDTH }}
        >
          {lineNumber}
        </span>
      )}
      <span className="flex-1 whitespace-pre font-mono text-sm overflow-x-visible">
        {tokens ? (
          // Render syntax-highlighted tokens
          tokens.map((token, i) => (
            <span key={i} className={getTokenClassName(token.type)}>
              {token.content}
            </span>
          ))
        ) : (
          // Plain text (during streaming or before highlighting)
          lineContent || '\u200B' // Zero-width space for empty lines to maintain height
        )}
      </span>
    </div>
  )
}

// ============================================================================
// Token Styling
// ============================================================================

/**
 * Map Prism token types to CSS classes.
 * Uses Tailwind classes that match common syntax highlighting themes.
 */
function getTokenClassName(type: string): string {
  // Map common Prism token types to Tailwind classes
  const classMap: Record<string, string> = {
    // Keywords & control flow
    keyword: 'text-purple-500 dark:text-purple-400',
    'keyword-control': 'text-purple-500 dark:text-purple-400',
    builtin: 'text-purple-500 dark:text-purple-400',

    // Strings
    string: 'text-green-600 dark:text-green-400',
    'template-string': 'text-green-600 dark:text-green-400',
    char: 'text-green-600 dark:text-green-400',
    regex: 'text-red-500 dark:text-red-400',

    // Numbers
    number: 'text-orange-500 dark:text-orange-400',
    boolean: 'text-orange-500 dark:text-orange-400',

    // Comments
    comment: 'text-gray-500 dark:text-gray-500 italic',
    prolog: 'text-gray-500 dark:text-gray-500',
    doctype: 'text-gray-500 dark:text-gray-500',

    // Functions & methods
    function: 'text-blue-500 dark:text-blue-400',
    'function-name': 'text-blue-500 dark:text-blue-400',
    method: 'text-blue-500 dark:text-blue-400',

    // Classes & types
    'class-name': 'text-yellow-600 dark:text-yellow-400',
    'type-annotation': 'text-yellow-600 dark:text-yellow-400',
    constant: 'text-yellow-600 dark:text-yellow-400',

    // Variables & properties
    variable: 'text-foreground',
    property: 'text-sky-500 dark:text-sky-400',
    parameter: 'text-foreground',

    // Operators & punctuation
    operator: 'text-foreground',
    punctuation: 'text-muted-foreground',

    // HTML/JSX
    tag: 'text-red-500 dark:text-red-400',
    'attr-name': 'text-orange-500 dark:text-orange-400',
    'attr-value': 'text-green-600 dark:text-green-400',

    // Others
    namespace: 'text-pink-500 dark:text-pink-400',
    symbol: 'text-purple-500 dark:text-purple-400',
    inserted: 'text-green-600 dark:text-green-400',
    deleted: 'text-red-500 dark:text-red-400',
    important: 'text-red-500 dark:text-red-400 font-bold',
  }

  return classMap[type] || 'text-foreground'
}

// ============================================================================
// VirtualizedCodeView Component
// ============================================================================

export const VirtualizedCodeView = memo(function VirtualizedCodeView({
  content,
  language,
  isStreaming = false,
  showLineNumbers = true,
  highlightLines = [],
  currentSearchMatch,
  followMode = true,
  className,
  tokensByLine: externalTokens,
}: VirtualizedCodeViewProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const listRef = useRef<ListImperativeAPI>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Build line index for O(1) line access
  const { lineCount, getLine } = useLineIndex(content)

  // Track visible range for prioritized highlighting
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 50])

  // Idle syntax highlighting - only after streaming ends
  // Pass getLine and lineCount to avoid split('\n') in the hook (O(n) allocation)
  const { tokensByLine: idleTokens, status: highlightStatus } = useIdleHighlight({
    content,
    language,
    isStreaming,
    visibleRange,
    getLine,
    lineCount,
  })

  // Use external tokens if provided, otherwise use idle-generated tokens
  const tokensByLine = externalTokens ?? idleTokens

  // Memoize highlight set for O(1) lookup in LineRow
  const highlightSet = useMemo(() => new Set(highlightLines), [highlightLines])

  // Row props passed to each LineRow
  const rowProps: LineRowProps = useMemo(
    () => ({
      getLine,
      showLineNumbers,
      highlightLines: highlightSet,
      currentMatchLine: currentSearchMatch?.line ?? null,
      isDark,
      tokensByLine,
    }),
    [getLine, showLineNumbers, highlightSet, currentSearchMatch?.line, isDark, tokensByLine]
  )

  // Auto-scroll to bottom during streaming (follow mode)
  useEffect(() => {
    if (isStreaming && followMode && listRef.current && lineCount > 0) {
      listRef.current.scrollToRow({ index: lineCount - 1, align: 'end' })
    }
  }, [isStreaming, followMode, lineCount, listRef])

  // Scroll to search match
  useEffect(() => {
    if (currentSearchMatch && listRef.current && !isStreaming) {
      // Scroll to match line, centered in view
      listRef.current.scrollToRow({ index: currentSearchMatch.line - 1, align: 'center' })
    }
  }, [currentSearchMatch, isStreaming, listRef])

  // Handle container resize
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateDimensions = () => {
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    // Initial measurement
    updateDimensions()

    // Watch for resize
    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, []) // Empty deps - effect reconnects via the callback ref pattern

  // Ref callback to capture container and trigger resize observation
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    if (node) {
      setDimensions({
        width: node.clientWidth,
        height: node.clientHeight,
      })
    }
  }, [])

  // Track visible rows for prioritized syntax highlighting
  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      setVisibleRange([visibleRows.startIndex, visibleRows.stopIndex])
    },
    []
  )

  return (
    <div
      ref={setContainerRef}
      dir="ltr"
      className={cn('h-full overflow-hidden', className)}
      style={{ unicodeBidi: 'isolate' }}
    >
      {/*
        NOTE: Horizontal scroll for very long lines (5k+ chars) needs testing.
        If it fails, fix by adding innerElementType with width: max-content.
      */}
      {dimensions.height > 0 && (
        <List<LineRowProps>
          listRef={listRef}
          rowComponent={LineRow}
          rowCount={lineCount}
          rowHeight={LINE_HEIGHT}
          rowProps={rowProps}
          overscanCount={OVERSCAN_COUNT}
          onRowsRendered={handleRowsRendered}
          className="scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
          style={{
            height: dimensions.height,
            width: dimensions.width,
            overflowX: 'auto',
            overflowY: 'auto',
          }}
        />
      )}
    </div>
  )
})

// ============================================================================
// Exports
// ============================================================================

export { LINE_HEIGHT, LINE_NUMBER_WIDTH }
