/**
 * Code Content Component
 *
 * Displays code with syntax highlighting.
 * Handles streaming content with throttled highlighting for performance.
 *
 * V2 Architecture:
 * - Files < VIRTUALIZATION_THRESHOLD: Use traditional SyntaxHighlighter
 * - Files >= VIRTUALIZATION_THRESHOLD: Use VirtualizedCodeView (react-window)
 *
 * The virtualized view provides O(viewport) rendering instead of O(file-size),
 * enabling smooth scrolling even for files with 100k+ lines.
 */

'use client'

import { useState, useEffect, useRef, useMemo, memo } from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { VirtualizedCodeView } from './virtualized-code-view'
import { type SearchMatch, LINE_HEIGHT } from './types'

// Lazy-load react-syntax-highlighter (~100KB) - only loaded when highlighting is needed
// This improves Time to First Meaningful UI by keeping the initial bundle smaller
// See: PERFORMANCE_ANALYSIS.md - Bottleneck 1
const LazySyntaxHighlighter = dynamic(
  () => import('./syntax-highlighter-lazy').then(mod => mod.LazySyntaxHighlighter),
  {
    ssr: false,
    loading: () => null, // We handle the loading state ourselves with plain text fallback
  }
)

// ============================================================================
// Constants
// ============================================================================

const HIGHLIGHT_THROTTLE_MS = 80

// Threshold for switching to virtualized rendering.
// Set to 1000 to balance performance vs style consistency:
// - Below threshold: react-syntax-highlighter with oneDark/oneLight themes
// - Above threshold: react-window + Prism + Tailwind token classes (slightly different colors)
// Higher threshold = more consistent styling, lower = better perf for medium files.
const VIRTUALIZATION_THRESHOLD = 1000

// ============================================================================
// Types
// ============================================================================

interface CodeContentProps {
  content: string
  language: string
  isStreaming?: boolean
  showLineNumbers?: boolean
  highlightLines?: number[]
  currentSearchMatch?: SearchMatch | null
  followMode?: boolean
  className?: string
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Count newlines without allocating an array (O(n) time, O(1) space)
 */
function countLines(content: string): number {
  let count = 1
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') count++
  }
  return count
}

// ============================================================================
// Streaming Highlight Hook
// ============================================================================

/**
 * Manages content display during streaming with debounced highlighting.
 *
 * FIX (Jan 2026): Content now updates immediately on every chunk.
 * Only the highlighting flag is debounced to avoid expensive re-tokenization.
 * Previously, content was also debounced which made the UI look "stuck".
 *
 * @param rawContent - The raw content string
 * @param isStreaming - Whether content is still streaming
 */
function useStreamingHighlight(
  rawContent: string,
  isStreaming: boolean
): { content: string; isHighlighted: boolean } {
  // Content always reflects latest rawContent (no debounce on content)
  // Only highlighting is debounced during streaming
  // Initialize from !isStreaming to avoid flash of plain text on first render
  const [isHighlighted, setIsHighlighted] = useState(!isStreaming)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!isStreaming) {
      // Not streaming: clear any pending timeout and enable highlighting immediately
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = undefined
      }
      setIsHighlighted(true)
      return
    }

    // During streaming: disable highlighting, debounce re-enable
    // This prevents expensive re-tokenization on every chunk
    setIsHighlighted(false)

    // Clear existing timeout and reschedule (trailing debounce)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      // Enable highlighting after chunks stop arriving
      setIsHighlighted(true)
      timeoutRef.current = undefined
    }, HIGHLIGHT_THROTTLE_MS)
  }, [rawContent, isStreaming])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Content is always the raw content (updates immediately)
  return { content: rawContent, isHighlighted }
}

// ============================================================================
// Code Content Component
// ============================================================================

export const CodeContent = memo(function CodeContent({
  content,
  language,
  isStreaming = false,
  showLineNumbers = true,
  highlightLines = [],
  currentSearchMatch,
  followMode = true,
  className,
}: CodeContentProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const containerRef = useRef<HTMLDivElement>(null)

  // Memoize line count to avoid O(n) scan on every render during streaming
  const lineCount = useMemo(() => countLines(content), [content])
  const useVirtualization = lineCount >= VIRTUALIZATION_THRESHOLD

  // Handle streaming with throttled highlighting
  const { content: processedContent, isHighlighted } = useStreamingHighlight(
    content,
    isStreaming
  )

  // Map language aliases
  const normalizedLanguage = useMemo(() => {
    const aliases: Record<string, string> = {
      tsx: 'tsx',
      ts: 'typescript',
      jsx: 'jsx',
      js: 'javascript',
      py: 'python',
      rb: 'ruby',
      rs: 'rust',
      yml: 'yaml',
      md: 'markdown',
      sh: 'bash',
      zsh: 'bash',
    }
    return aliases[language] || language
  }, [language])

  // Combine highlight lines with current search match
  const allHighlightLines = useMemo(() => {
    const lines = new Set(highlightLines)
    if (currentSearchMatch) {
      lines.add(currentSearchMatch.line)
    }
    return Array.from(lines)
  }, [highlightLines, currentSearchMatch])

  // Custom line props for highlighting specific lines
  // Precompute Set for O(1) lookup (vs O(k) for includes)
  const highlightSet = useMemo(() => new Set(highlightLines), [highlightLines])

  const lineProps = useMemo(() => {
    if (allHighlightLines.length === 0) return undefined

    return (lineNumber: number) => {
      const style: React.CSSProperties = {}
      const isSearchMatch = currentSearchMatch?.line === lineNumber
      const isHighlightLine = highlightSet.has(lineNumber)

      if (isSearchMatch) {
        style.backgroundColor = isDark ? 'rgba(234, 179, 8, 0.2)' : 'rgba(234, 179, 8, 0.15)'
        style.display = 'block'
        style.borderLeft = '3px solid rgb(234, 179, 8)'
        style.marginLeft = '-3px'
        style.paddingLeft = '3px'
      } else if (isHighlightLine) {
        style.backgroundColor = isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)'
        style.display = 'block'
        style.borderLeft = '3px solid rgb(59, 130, 246)'
        style.marginLeft = '-3px'
        style.paddingLeft = '3px'
      }
      return { style }
    }
  }, [allHighlightLines, highlightSet, currentSearchMatch, isDark])

  // Auto-scroll to bottom during streaming (only if followMode is enabled)
  useEffect(() => {
    if (isStreaming && followMode && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [isStreaming, followMode, processedContent])

  // Scroll to search match
  useEffect(() => {
    if (currentSearchMatch && containerRef.current && !isStreaming) {
      // Use LINE_HEIGHT constant (21px) for consistent scroll positioning
      const targetScroll = (currentSearchMatch.line - 1) * LINE_HEIGHT - 100 // Offset for visibility
      containerRef.current.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      })
    }
  }, [currentSearchMatch, isStreaming])

  // V2: Use virtualized view for large files
  if (useVirtualization) {
    return (
      <VirtualizedCodeView
        content={content}
        language={normalizedLanguage}
        isStreaming={isStreaming}
        showLineNumbers={showLineNumbers}
        highlightLines={highlightLines}
        currentSearchMatch={currentSearchMatch}
        followMode={followMode}
        className={className}
      />
    )
  }

  // Traditional rendering for small files (< VIRTUALIZATION_THRESHOLD)
  return (
    <div
      ref={containerRef}
      // Code is always LTR, even in RTL locales (critical for correct display)
      dir="ltr"
      className={cn('h-full overflow-auto', className)}
      style={{ unicodeBidi: 'isolate' }}
    >
      {isHighlighted ? (
        <LazySyntaxHighlighter
          language={normalizedLanguage}
          isDark={isDark}
          showLineNumbers={showLineNumbers}
          wrapLines={allHighlightLines.length > 0}
          lineProps={lineProps}
        >
          {processedContent}
        </LazySyntaxHighlighter>
      ) : (
        // Plain text fallback during initial streaming load
        // Use whitespace-pre + horizontal scroll (like virtualized mode)
        <pre
          className={cn(
            'p-4 text-sm font-mono leading-relaxed overflow-x-auto',
            'text-foreground'
          )}
        >
          {showLineNumbers ? (
            <code className="flex">
              {/* Line numbers column */}
              <span className="flex-shrink-0 select-none text-muted-foreground/50 text-right pr-4">
                {processedContent.split('\n').map((_, i) => (
                  <span key={i} className="block">
                    {i + 1}
                  </span>
                ))}
              </span>
              {/* Code column - whitespace-pre for classic code behavior (horizontal scroll, no wrap) */}
              <span className="flex-1 whitespace-pre">
                {processedContent}
              </span>
            </code>
          ) : (
            <code className="whitespace-pre">{processedContent}</code>
          )}
        </pre>
      )}
    </div>
  )
})
