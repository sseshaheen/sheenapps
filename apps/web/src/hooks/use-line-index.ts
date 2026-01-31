/**
 * Line Index Hook
 *
 * Provides O(1) line access and O(log n) offset→line lookup
 * using a lineStarts array. Designed for virtualized code rendering.
 *
 * Key insight: lineStarts[i] = byte offset where line i begins
 * - O(1) line content: text.slice(lineStarts[i], lineStarts[i+1] - 1)
 * - O(log n) offset→line: binary search
 */

import { useMemo, useRef, useCallback } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface LineIndex {
  /** Start offset of each line in the content string */
  lineStarts: number[]
  /** Total number of lines */
  lineCount: number
  /** Get content of a specific line (0-indexed) */
  getLine: (index: number) => string
  /** Get line number from character offset (0-indexed line, O(log n)) */
  offsetToLine: (offset: number) => number
  /** Get character offset from line number (0-indexed) */
  lineToOffset: (lineIndex: number) => number
  /** Check if content ends with newline */
  endsWithNewline: boolean
}

// ============================================================================
// Core Functions (Pure, testable)
// ============================================================================

/**
 * Build lineStarts array from content string.
 * lineStarts[0] = 0 (first line always starts at 0)
 * lineStarts[i] = position after newline for line i
 */
export function buildLineStarts(content: string): number[] {
  const starts: number[] = [0]

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1)
    }
  }

  return starts
}

/**
 * Incrementally update lineStarts when new content is appended.
 * Only scans the new chunk, not the entire content.
 *
 * @param existingStarts Current lineStarts array
 * @param newChunk The appended content
 * @param appendOffset Where the chunk was appended (previous content length)
 * @returns Updated lineStarts array (mutates in place for performance)
 */
export function updateLineStartsIncremental(
  existingStarts: number[],
  newChunk: string,
  appendOffset: number
): number[] {
  for (let i = 0; i < newChunk.length; i++) {
    if (newChunk[i] === '\n') {
      existingStarts.push(appendOffset + i + 1)
    }
  }
  return existingStarts
}

/**
 * Binary search to find line index from character offset.
 * Returns 0-indexed line number.
 *
 * @param lineStarts Array of line start offsets
 * @param offset Character offset in content
 * @returns Line index (0-indexed)
 */
export function offsetToLineIndex(lineStarts: number[], offset: number): number {
  // Handle edge cases
  if (lineStarts.length === 0) return 0
  if (offset < 0) return 0
  if (offset >= lineStarts[lineStarts.length - 1]) {
    // Offset is in or after the last line
    return lineStarts.length - 1
  }

  // Binary search: find largest i where lineStarts[i] <= offset
  let lo = 0
  let hi = lineStarts.length - 1

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1 // Ceiling division
    if (lineStarts[mid] <= offset) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return lo
}

/**
 * Get column (0-indexed) from offset within a line.
 */
export function offsetToColumn(lineStarts: number[], offset: number): number {
  const lineIndex = offsetToLineIndex(lineStarts, offset)
  return offset - lineStarts[lineIndex]
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for managing line index state.
 *
 * Optimized for streaming: detects appends and updates lineStarts incrementally
 * instead of rescanning the entire content on every chunk.
 *
 * Usage:
 * ```tsx
 * const { lineCount, getLine, offsetToLine } = useLineIndex(content)
 *
 * // Render virtualized lines
 * <FixedSizeList itemCount={lineCount}>
 *   {({ index }) => <div>{getLine(index)}</div>}
 * </FixedSizeList>
 *
 * // Find line from search match offset
 * const lineNum = offsetToLine(match.start)
 * ```
 */
export function useLineIndex(content: string): LineIndex {
  // Cache for getLine() to avoid repeated slicing
  const lineCache = useRef(new Map<number, string>())
  // Track previous content and lineStarts for incremental updates
  const lastContentRef = useRef<string>('')
  const lineStartsRef = useRef<number[]>([0])

  // Build/update index when content changes
  // Optimization: detect appends and update incrementally (O(chunk) instead of O(content))
  const { lineStarts, endsWithNewline } = useMemo(() => {
    const prevContent = lastContentRef.current
    const prevStarts = lineStartsRef.current

    let starts: number[]

    if (content.length === 0) {
      // Empty content
      starts = [0]
      lineCache.current.clear()
    } else if (content.length > prevContent.length && content.startsWith(prevContent)) {
      // Append detected: only scan the new chunk
      const appendOffset = prevContent.length
      const newChunk = content.slice(appendOffset)

      // CRITICAL: Capture old line count BEFORE mutation for correct cache invalidation
      // If chunk contains newlines, the previous last line changes and must be invalidated
      const oldLineCount = prevStarts.length
      const firstAffectedLine = Math.max(0, oldLineCount - 1)

      // CRITICAL: Mutate in place, NOT clone. Cloning 100k+ items per chunk is O(n) and kills perf.
      // Content changes already trigger re-render via useMemo deps; we don't need new array reference.
      starts = prevStarts
      updateLineStartsIncremental(starts, newChunk, appendOffset)

      // Invalidate cache from old last line onward (covers both old last line and any new lines)
      for (let i = firstAffectedLine; i < starts.length; i++) {
        lineCache.current.delete(i)
      }
    } else {
      // Full rebuild (new content or replacement)
      starts = buildLineStarts(content)
      lineCache.current.clear()
    }

    // Update refs for next comparison
    lastContentRef.current = content
    lineStartsRef.current = starts

    const endsNL = content.length > 0 && content[content.length - 1] === '\n'

    return {
      lineStarts: starts,
      endsWithNewline: endsNL,
    }
  }, [content])

  // Line count: number of lineStarts entries
  // If content ends with newline, last "line" is empty and we may want to exclude it
  // for display purposes, but for now we include all lines
  const lineCount = lineStarts.length

  // Get line content by index (0-indexed)
  const getLine = useCallback(
    (index: number): string => {
      if (index < 0 || index >= lineStarts.length) {
        return ''
      }

      // Check cache first
      const cached = lineCache.current.get(index)
      if (cached !== undefined) {
        return cached
      }

      const start = lineStarts[index]
      const end = index < lineStarts.length - 1 ? lineStarts[index + 1] - 1 : content.length

      // Handle trailing newline: don't include it in the line content
      let lineEnd = end
      if (lineEnd > start && content[lineEnd - 1] === '\n') {
        lineEnd--
      }
      // Also handle \r\n
      if (lineEnd > start && content[lineEnd - 1] === '\r') {
        lineEnd--
      }

      const line = content.slice(start, lineEnd)

      // Cache the result (limit cache size to prevent memory issues)
      if (lineCache.current.size < 10000) {
        lineCache.current.set(index, line)
      }

      return line
    },
    [content, lineStarts]
  )

  // Offset to line (0-indexed)
  const offsetToLine = useCallback(
    (offset: number): number => {
      return offsetToLineIndex(lineStarts, offset)
    },
    [lineStarts]
  )

  // Line to offset
  const lineToOffset = useCallback(
    (lineIndex: number): number => {
      if (lineIndex < 0) return 0
      if (lineIndex >= lineStarts.length) return content.length
      return lineStarts[lineIndex]
    },
    [lineStarts, content.length]
  )

  return {
    lineStarts,
    lineCount,
    getLine,
    offsetToLine,
    lineToOffset,
    endsWithNewline,
  }
}

// ============================================================================
// Streaming Support
// ============================================================================

/**
 * Hook variant optimized for streaming content.
 * Maintains lineStarts incrementally rather than rebuilding on each chunk.
 *
 * For now, we'll use the standard useLineIndex which rebuilds.
 * This is a future optimization if we see performance issues.
 */
export function useStreamingLineIndex(content: string, isStreaming: boolean): LineIndex {
  // For now, delegate to standard implementation
  // The memoization in useLineIndex handles most cases efficiently
  // Future: implement true incremental updates for very large streaming files
  return useLineIndex(content)
}
