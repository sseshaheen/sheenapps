/**
 * Code Search Component
 *
 * In-file search with match highlighting and navigation.
 *
 * V2 Optimization: Uses binary search (O(log n)) for offset-to-line conversion
 * instead of O(n) string splitting per match.
 */

'use client'

import { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  CaseSensitive,
  Regex,
} from 'lucide-react'
import { useLineIndex, offsetToLineIndex, buildLineStarts } from '@/hooks/use-line-index'
import { type SearchMatch as BaseSearchMatch } from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * Extended search match with additional fields for search UI.
 * Extends the base SearchMatch used by code viewer components.
 */
export interface SearchMatch extends BaseSearchMatch {
  /** Index of this match in the results array */
  index: number
  /** The matched text */
  text: string
}

export interface CodeSearchProps {
  content: string
  isOpen: boolean
  onClose: () => void
  onMatchChange?: (match: SearchMatch | null, allMatches: SearchMatch[]) => void
  className?: string
}

// ============================================================================
// Search Logic
// ============================================================================

/**
 * Find all matches in content.
 *
 * V2 Optimization: Uses pre-built lineStarts array for O(log n) offset-to-line
 * conversion instead of O(n) string splitting per match.
 *
 * @param content - Text to search in
 * @param query - Search query
 * @param caseSensitive - Whether search is case-sensitive
 * @param useRegex - Whether to treat query as regex
 * @param lineStarts - Pre-built line starts array (optional, will build if not provided)
 */
function findMatches(
  content: string,
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
  lineStarts?: number[]
): SearchMatch[] {
  if (!query) return []

  const matches: SearchMatch[] = []
  let searchPattern: RegExp

  try {
    if (useRegex) {
      searchPattern = new RegExp(query, caseSensitive ? 'g' : 'gi')
    } else {
      // Escape special regex characters for literal search
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      searchPattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi')
    }
  } catch {
    // Invalid regex
    return []
  }

  // Build line starts if not provided - O(n) once, then O(log n) per match
  const lines = lineStarts ?? buildLineStarts(content)

  let match: RegExpExecArray | null
  let index = 0

  while ((match = searchPattern.exec(content)) !== null) {
    // O(log n) line lookup using binary search
    const lineIndex = offsetToLineIndex(lines, match.index)
    const line = lineIndex + 1 // 1-indexed for display
    const column = match.index - lines[lineIndex] + 1 // 1-indexed column

    matches.push({
      index,
      start: match.index,
      end: match.index + match[0].length,
      line,
      column,
      text: match[0],
    })

    index++

    // Prevent infinite loop on zero-width matches
    if (match[0].length === 0) {
      searchPattern.lastIndex++
    }
  }

  return matches
}

// ============================================================================
// Hook for Search State
// ============================================================================

export function useCodeSearch(content: string) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Defer expensive search computation to avoid blocking UI during typing
  const deferredQuery = useDeferredValue(query)
  const deferredContent = useDeferredValue(content)

  // Use line index for O(log n) offset-to-line conversion
  const { lineStarts } = useLineIndex(deferredContent)

  const matches = useMemo(
    () => findMatches(deferredContent, deferredQuery, caseSensitive, useRegex, lineStarts),
    [deferredContent, deferredQuery, caseSensitive, useRegex, lineStarts]
  )

  const currentMatch = matches.length > 0 ? matches[currentMatchIndex] : null

  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length)
  }, [matches.length])

  const goToPreviousMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length)
  }, [matches.length])

  // Reset match index when matches change
  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [matches])

  // Indicate if search is still computing (query ahead of deferred)
  const isSearching = query !== deferredQuery

  return {
    query,
    setQuery,
    caseSensitive,
    setCaseSensitive,
    useRegex,
    setUseRegex,
    matches,
    currentMatch,
    currentMatchIndex,
    goToNextMatch,
    goToPreviousMatch,
    isSearching,
  }
}

// ============================================================================
// Search Bar Component
// ============================================================================

export function CodeSearchBar({
  content,
  isOpen,
  onClose,
  onMatchChange,
  className,
}: CodeSearchProps) {
  const t = useTranslations('builder.codeViewer.search')
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    query,
    setQuery,
    caseSensitive,
    setCaseSensitive,
    useRegex,
    setUseRegex,
    matches,
    currentMatch,
    currentMatchIndex,
    goToNextMatch,
    goToPreviousMatch,
    isSearching,
  } = useCodeSearch(content)

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isOpen])

  // Notify parent of match changes
  useEffect(() => {
    onMatchChange?.(currentMatch, matches)
  }, [currentMatch, matches, onMatchChange])

  // Handle keyboard shortcuts within search bar
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          goToPreviousMatch()
        } else {
          goToNextMatch()
        }
      } else if (e.key === 'F3' || (e.key === 'g' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        if (e.shiftKey) {
          goToPreviousMatch()
        } else {
          goToNextMatch()
        }
      }
    },
    [onClose, goToNextMatch, goToPreviousMatch]
  )

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border',
        className
      )}
    >
      {/* Search icon */}
      <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      {/* Input - dir="auto" allows searching for Arabic text in code comments */}
      <input
        ref={inputRef}
        type="text"
        dir="auto"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('placeholder')}
        className={cn(
          'flex-1 min-w-0 bg-transparent text-sm',
          'placeholder:text-muted-foreground',
          'focus:outline-none'
        )}
        aria-label={t('placeholder')}
      />

      {/* Match count */}
      {query && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {isSearching
            ? t('searching')
            : matches.length === 0
              ? t('noResults')
              : t('matchCount', { current: currentMatchIndex + 1, total: matches.length })}
        </span>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={goToPreviousMatch}
          disabled={matches.length === 0}
          className={cn(
            'p-1 rounded transition-colors',
            'hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title={t('previousMatch')}
          aria-label={t('previousMatch')}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={goToNextMatch}
          disabled={matches.length === 0}
          className={cn(
            'p-1 rounded transition-colors',
            'hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title={t('nextMatch')}
          aria-label={t('nextMatch')}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-border" />

      {/* Options */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={cn(
            'p-1 rounded transition-colors',
            caseSensitive
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted text-muted-foreground'
          )}
          title={t('caseSensitive')}
          aria-label={t('caseSensitive')}
          aria-pressed={caseSensitive}
        >
          <CaseSensitive className="w-4 h-4" />
        </button>
        <button
          onClick={() => setUseRegex(!useRegex)}
          className={cn(
            'p-1 rounded transition-colors',
            useRegex
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted text-muted-foreground'
          )}
          title={t('useRegex')}
          aria-label={t('useRegex')}
          aria-pressed={useRegex}
        >
          <Regex className="w-4 h-4" />
        </button>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-muted transition-colors"
        title={t('close')}
        aria-label={t('close')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================================================
// Utility: Highlight matches in content
// ============================================================================

export function highlightMatches(
  content: string,
  matches: SearchMatch[],
  currentMatchIndex: number
): React.ReactNode[] {
  if (matches.length === 0) {
    return [content]
  }

  const result: React.ReactNode[] = []
  let lastEnd = 0

  matches.forEach((match, index) => {
    // Add text before match
    if (match.start > lastEnd) {
      result.push(content.slice(lastEnd, match.start))
    }

    // Add highlighted match
    const isCurrentMatch = index === currentMatchIndex
    result.push(
      <mark
        key={`match-${index}`}
        className={cn(
          'rounded-sm',
          isCurrentMatch
            ? 'bg-yellow-400 text-yellow-950'
            : 'bg-yellow-200/50 text-inherit'
        )}
      >
        {match.text}
      </mark>
    )

    lastEnd = match.end
  })

  // Add remaining text
  if (lastEnd < content.length) {
    result.push(content.slice(lastEnd))
  }

  return result
}

export default CodeSearchBar
