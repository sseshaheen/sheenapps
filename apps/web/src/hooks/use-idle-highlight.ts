/**
 * Idle Highlight Hook
 *
 * Deferred syntax highlighting using requestIdleCallback.
 * Tokenizes lines during browser idle time to avoid blocking the UI.
 *
 * Strategy:
 * - Never highlight during streaming (plain text only)
 * - After streaming ends, wait for idle time
 * - Tokenize visible lines first, then buffer, then rest
 * - Cache results in a sparse Map (only tokenized lines)
 * - Cancel on new streaming or unmount
 *
 * FIX (Jan 2026): Scrolling no longer restarts highlighting.
 * Existing tokens are preserved and only missing lines are tokenized.
 * Incremental state updates avoid O(n²) Map cloning.
 */

'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Prism from 'prismjs'
// Import common language definitions
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
// Single source of truth for Token type
import { type Token } from '@/components/builder/code-viewer/types'

// Re-export for consumers who import from this module
export type { Token }

export interface HighlightState {
  /** Current highlight status */
  status: 'idle' | 'pending' | 'highlighting' | 'ready'
  /** Sparse map of line index -> tokens (only contains highlighted lines) */
  tokensByLine: Map<number, Token[]>
  /** Progress: number of lines highlighted so far */
  highlightedCount: number
  /** Total lines to highlight */
  totalLines: number
}

interface UseIdleHighlightOptions {
  /** Content to highlight (used for change detection, NOT split into lines) */
  content: string
  /** Programming language for syntax highlighting */
  language: string
  /** Whether content is still streaming (disables highlighting) */
  isStreaming: boolean
  /** Currently visible line range [start, end] (0-indexed) */
  visibleRange?: [number, number]
  /** Number of lines to buffer around visible range */
  bufferSize?: number
  /** Delay after streaming ends before starting highlight (ms) */
  idleDelay?: number
  /** Function to get line content by index (avoids split('\n') for large files) */
  getLine?: (index: number) => string
  /** Total line count (required if getLine is provided) */
  lineCount?: number
}

// Maximum lines to highlight beyond visible+buffer (prevents runaway on huge files)
const MAX_BACKGROUND_LINES = 20000

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BUFFER_SIZE = 50
const DEFAULT_IDLE_DELAY = 100
const LINES_PER_IDLE_FRAME = 100 // Lines to process per idle callback
const IDLE_TIMEOUT = 50 // Max time (ms) per idle callback

// Language aliases for Prism
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get Prism grammar for a language, with fallback to plain text.
 */
function getGrammar(language: string): Prism.Grammar | null {
  const normalizedLang = LANGUAGE_ALIASES[language] || language

  // Check if grammar is loaded
  if (Prism.languages[normalizedLang]) {
    return Prism.languages[normalizedLang]
  }

  return null
}

/**
 * Tokenize a single line of code.
 */
function tokenizeLine(line: string, grammar: Prism.Grammar | null): Token[] {
  if (!grammar || !line) {
    return [{ content: line, type: 'plain' }]
  }

  try {
    const tokens = Prism.tokenize(line, grammar)
    return flattenTokens(tokens)
  } catch {
    return [{ content: line, type: 'plain' }]
  }
}

/**
 * Flatten Prism tokens (which can be nested) into a simple array.
 */
function flattenTokens(tokens: (string | Prism.Token)[]): Token[] {
  const result: Token[] = []

  for (const token of tokens) {
    if (typeof token === 'string') {
      if (token) {
        result.push({ content: token, type: 'plain' })
      }
    } else {
      const content =
        typeof token.content === 'string'
          ? token.content
          : Array.isArray(token.content)
            ? flattenTokenContent(token.content)
            : String(token.content)

      if (content) {
        result.push({ content, type: token.type })
      }
    }
  }

  return result
}

/**
 * Flatten nested token content to string.
 */
function flattenTokenContent(content: (string | Prism.Token)[]): string {
  return content
    .map((item) => {
      if (typeof item === 'string') return item
      if (typeof item.content === 'string') return item.content
      if (Array.isArray(item.content)) return flattenTokenContent(item.content)
      return String(item.content)
    })
    .join('')
}

/**
 * requestIdleCallback polyfill for Safari.
 */
const requestIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback
    : (cb: IdleRequestCallback): number => {
        return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1) as unknown as number
      }

const cancelIdleCallback =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? window.cancelIdleCallback
    : (id: number) => clearTimeout(id as unknown as NodeJS.Timeout)

// ============================================================================
// Hook
// ============================================================================

export function useIdleHighlight({
  content,
  language,
  isStreaming,
  visibleRange = [0, 50],
  bufferSize = DEFAULT_BUFFER_SIZE,
  idleDelay = DEFAULT_IDLE_DELAY,
  getLine: externalGetLine,
  lineCount: externalLineCount,
}: UseIdleHighlightOptions): HighlightState {
  const [status, setStatus] = useState<HighlightState['status']>('idle')
  const [tokensByLine, setTokensByLine] = useState<Map<number, Token[]>>(new Map())
  const [highlightedCount, setHighlightedCount] = useState(0)

  // Refs for managing async highlighting
  const idleCallbackRef = useRef<number | null>(null)
  const delayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef(false)
  // Track content to detect actual content changes vs just scroll
  const contentRef = useRef(content)
  // Track current tokens ref for incremental updates
  const tokensRef = useRef<Map<number, Token[]>>(new Map())

  // CRITICAL: Avoid split('\n') for large files - use provided getLine if available
  // Only split for small files (fallback when getLine not provided)
  const { getLine, totalLines } = useMemo(() => {
    if (externalGetLine && externalLineCount !== undefined) {
      // Use provided line accessor (from useLineIndex) - O(1) per line, no array allocation
      return { getLine: externalGetLine, totalLines: externalLineCount }
    }
    // Fallback: split content (only for small files or when not using virtualization)
    const lines = content.split('\n')
    return {
      getLine: (i: number) => lines[i] ?? '',
      totalLines: lines.length,
    }
  }, [content, externalGetLine, externalLineCount])

  // Get grammar for language
  const grammar = useMemo(() => getGrammar(language), [language])

  // Get lines to highlight, prioritizing visible, excluding already cached
  // For very large files, caps background work to prevent runaway
  const getLinesToHighlight = useCallback(
    (existingTokens: Map<number, Token[]>): number[] => {
      const [visStart, visEnd] = visibleRange
      const result: number[] = []

      // Helper to add line if not already tokenized
      const addIfMissing = (i: number) => {
        if (i >= 0 && i < totalLines && !existingTokens.has(i)) {
          result.push(i)
        }
      }

      // 1. Visible lines (highest priority) - always highlight these
      for (let i = visStart; i <= Math.min(visEnd, totalLines - 1); i++) {
        addIfMissing(i)
      }

      // 2. Buffer around visible
      const bufferStart = Math.max(0, visStart - bufferSize)
      const bufferEnd = Math.min(totalLines - 1, visEnd + bufferSize)

      for (let i = bufferStart; i < visStart; i++) {
        addIfMissing(i)
      }
      for (let i = visEnd + 1; i <= bufferEnd; i++) {
        addIfMissing(i)
      }

      // 3. Remaining lines (lowest priority) - CAPPED to prevent runaway on huge files
      // For files > MAX_BACKGROUND_LINES, only highlight visible+buffer
      if (totalLines <= MAX_BACKGROUND_LINES) {
        for (let i = 0; i < bufferStart; i++) {
          addIfMissing(i)
        }
        for (let i = bufferEnd + 1; i < totalLines; i++) {
          addIfMissing(i)
        }
      }

      return result
    },
    [visibleRange, bufferSize, totalLines]
  )

  // Cancel any pending highlighting
  const cancelHighlighting = useCallback(() => {
    abortRef.current = true

    if (idleCallbackRef.current !== null) {
      cancelIdleCallback(idleCallbackRef.current)
      idleCallbackRef.current = null
    }

    if (delayTimeoutRef.current !== null) {
      clearTimeout(delayTimeoutRef.current)
      delayTimeoutRef.current = null
    }
  }, [])

  // Start or resume highlighting process
  const startHighlighting = useCallback(
    (existingTokens: Map<number, Token[]>) => {
      const linesToHighlight = getLinesToHighlight(existingTokens)

      if (linesToHighlight.length === 0) {
        // All lines already highlighted
        setStatus('ready')
        return
      }

      let currentIndex = 0
      abortRef.current = false

      setStatus('highlighting')

      const processLines = (deadline: IdleDeadline) => {
        if (abortRef.current) {
          setStatus(tokensRef.current.size > 0 ? 'ready' : 'idle')
          return
        }

        const startTime = performance.now()
        let processedInFrame = 0
        const batchUpdates: Array<[number, Token[]]> = []

        // Process lines while we have time
        while (
          currentIndex < linesToHighlight.length &&
          processedInFrame < LINES_PER_IDLE_FRAME &&
          (deadline.timeRemaining() > 0 || performance.now() - startTime < IDLE_TIMEOUT)
        ) {
          const lineIndex = linesToHighlight[currentIndex]
          // Use getLine for O(1) access instead of lines[lineIndex] which requires split('\n')
          const line = getLine(lineIndex)

          // Only tokenize if not already in cache
          if (!tokensRef.current.has(lineIndex)) {
            const tokens = tokenizeLine(line, grammar)
            batchUpdates.push([lineIndex, tokens])
            processedInFrame++
          }

          currentIndex++
        }

        // Batch update state
        // NOTE: new Map(prev) is O(map_size) per batch, yielding O(n²/b) total for n lines.
        // With n=20k, b=100: ~2M entry copies. Acceptable in requestIdleCallback on modern
        // hardware. If jank appears on mid-range devices, switch to: tokensRef + version
        // counter (ref holds canonical Map, version integer triggers re-renders).
        if (batchUpdates.length > 0) {
          setTokensByLine((prev) => {
            const next = new Map(prev)
            for (const [idx, tokens] of batchUpdates) {
              next.set(idx, tokens)
              tokensRef.current.set(idx, tokens)
            }
            return next
          })
          setHighlightedCount((prev) => prev + batchUpdates.length)
        }

        // Continue if more lines to process
        if (currentIndex < linesToHighlight.length && !abortRef.current) {
          idleCallbackRef.current = requestIdleCallback(processLines, { timeout: IDLE_TIMEOUT })
        } else {
          setStatus('ready')
          idleCallbackRef.current = null
        }
      }

      // Start processing
      idleCallbackRef.current = requestIdleCallback(processLines, { timeout: IDLE_TIMEOUT })
    },
    [getLine, grammar, getLinesToHighlight]
  )

  // Effect: Reset tokens when content changes (not when visibleRange changes)
  useEffect(() => {
    if (content !== contentRef.current) {
      // Content actually changed - reset everything
      contentRef.current = content
      tokensRef.current = new Map()
      setTokensByLine(new Map())
      setHighlightedCount(0)
    }
  }, [content])

  // Effect: Start highlighting when streaming ends
  useEffect(() => {
    cancelHighlighting()

    if (isStreaming) {
      // During streaming: reset to idle, no highlighting
      setStatus('idle')
      return
    }

    if (!content || content.length === 0) {
      setStatus('idle')
      return
    }

    // After streaming ends: wait for idle delay, then start highlighting
    setStatus('pending')

    delayTimeoutRef.current = setTimeout(() => {
      delayTimeoutRef.current = null
      startHighlighting(tokensRef.current)
    }, idleDelay)

    return () => {
      cancelHighlighting()
    }
  }, [content, isStreaming, language, idleDelay, cancelHighlighting, startHighlighting])

  // Effect: When visible range changes, prioritize those lines (but don't reset)
  useEffect(() => {
    // Only re-prioritize if we're already highlighting or ready
    if (status === 'highlighting' || status === 'ready') {
      const missingLines = getLinesToHighlight(tokensRef.current)
      if (missingLines.length > 0 && !isStreaming) {
        // Cancel current work and restart with new priorities
        cancelHighlighting()
        startHighlighting(tokensRef.current)
      }
    }
  }, [visibleRange, status, isStreaming, getLinesToHighlight, cancelHighlighting, startHighlighting])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelHighlighting()
    }
  }, [cancelHighlighting])

  return {
    status,
    tokensByLine,
    highlightedCount,
    totalLines,
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { UseIdleHighlightOptions }
