/**
 * Code Diff View Component
 *
 * Side-by-side or unified diff view with syntax highlighting.
 */

'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  calculateDiff,
  groupIntoHunks,
  type DiffLine,
  type DiffHunk,
} from '@/utils/diff-calculation'
import { ChevronDown, Minus, Plus, Equal } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface CodeDiffViewProps {
  oldContent: string
  newContent: string
  language: string
  className?: string
  mode?: 'unified' | 'split'
  showLineNumbers?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const CONTEXT_LINES = 3

// ============================================================================
// Line Number Column
// ============================================================================

interface LineNumberProps {
  number: number | null
  type: DiffLine['type']
}

function LineNumber({ number, type }: LineNumberProps) {
  return (
    <span
      className={cn(
        'inline-block w-10 text-right pr-2 text-xs select-none',
        type === 'equal' && 'text-muted-foreground',
        type === 'delete' && 'text-red-400 bg-red-500/5',
        type === 'insert' && 'text-green-400 bg-green-500/5'
      )}
    >
      {number ?? ' '}
    </span>
  )
}

// ============================================================================
// Diff Line Component
// ============================================================================

interface DiffLineRowProps {
  line: DiffLine
  showLineNumbers: boolean
}

function DiffLineRow({ line, showLineNumbers }: DiffLineRowProps) {
  const getLineIcon = () => {
    switch (line.type) {
      case 'delete':
        return <Minus className="w-3 h-3 text-red-400" />
      case 'insert':
        return <Plus className="w-3 h-3 text-green-400" />
      default:
        return <span className="w-3 h-3" />
    }
  }

  return (
    <div
      className={cn(
        'flex items-stretch font-mono text-sm',
        line.type === 'equal' && 'bg-transparent',
        line.type === 'delete' && 'bg-red-500/10',
        line.type === 'insert' && 'bg-green-500/10'
      )}
    >
      {showLineNumbers && (
        <>
          <LineNumber number={line.oldLineNumber} type={line.type} />
          <LineNumber number={line.newLineNumber} type={line.type} />
        </>
      )}
      <span className="flex items-center justify-center w-6 flex-shrink-0">
        {getLineIcon()}
      </span>
      <span
        className={cn(
          'flex-1 whitespace-pre overflow-x-auto px-2',
          line.type === 'delete' && 'text-red-300',
          line.type === 'insert' && 'text-green-300'
        )}
      >
        {line.content || ' '}
      </span>
    </div>
  )
}

// ============================================================================
// Collapsed Section
// ============================================================================

interface CollapsedSectionProps {
  count: number
}

function CollapsedSection({ count }: CollapsedSectionProps) {
  return (
    <div
      className={cn(
        'w-full flex items-center justify-center gap-2 py-1',
        'bg-muted/30 text-muted-foreground text-xs',
        'border-y border-border/50'
      )}
    >
      <ChevronDown className="w-3 h-3" />
      <span>{count} unchanged lines</span>
      <ChevronDown className="w-3 h-3" />
    </div>
  )
}

// ============================================================================
// Hunk Header
// ============================================================================

interface HunkHeaderProps {
  hunk: DiffHunk
  index: number
}

function HunkHeader({ hunk, index }: HunkHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1 bg-blue-500/10 text-blue-400 text-xs font-mono border-y border-blue-500/20">
      <span>
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </span>
    </div>
  )
}

// ============================================================================
// Stats Badge
// ============================================================================

interface StatsBadgeProps {
  additions: number
  deletions: number
}

function StatsBadge({ additions, deletions }: StatsBadgeProps) {
  return (
    <div className="flex items-center gap-3 text-xs">
      {additions > 0 && (
        <span className="flex items-center gap-1 text-green-400">
          <Plus className="w-3 h-3" />
          {additions}
        </span>
      )}
      {deletions > 0 && (
        <span className="flex items-center gap-1 text-red-400">
          <Minus className="w-3 h-3" />
          {deletions}
        </span>
      )}
      {additions === 0 && deletions === 0 && (
        <span className="text-muted-foreground">No changes</span>
      )}
    </div>
  )
}

// ============================================================================
// Main Diff View Component
// ============================================================================

export function CodeDiffView({
  oldContent,
  newContent,
  language,
  className,
  mode = 'unified',
  showLineNumbers = true,
}: CodeDiffViewProps) {
  // Calculate diff
  const { lines, stats } = useMemo(
    () => calculateDiff(oldContent, newContent),
    [oldContent, newContent]
  )

  // Group into hunks
  const hunks = useMemo(
    () => groupIntoHunks(lines, CONTEXT_LINES),
    [lines]
  )

  // No changes
  if (stats.additions === 0 && stats.deletions === 0) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-center p-8">
          <Equal className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground mb-2">No changes</h3>
          <p className="text-sm text-muted-foreground">
            The current content matches the previous version.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('h-full flex flex-col bg-background', className)}>
      {/* Header with stats */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <span className="text-sm text-muted-foreground">
          {hunks.length} {hunks.length === 1 ? 'change' : 'changes'}
        </span>
        <StatsBadge additions={stats.additions} deletions={stats.deletions} />
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex}>
            {/* Show collapsed indicator between hunks */}
            {hunkIndex > 0 && (
              <CollapsedSection
                count={
                  hunk.oldStart -
                  (hunks[hunkIndex - 1].oldStart + hunks[hunkIndex - 1].oldLines)
                }
              />
            )}

            {/* Hunk header */}
            <HunkHeader hunk={hunk} index={hunkIndex} />

            {/* Hunk lines */}
            <div className="font-mono text-sm">
              {hunk.lines.map((line, lineIndex) => (
                <DiffLineRow
                  key={`${hunkIndex}-${lineIndex}`}
                  line={line}
                  showLineNumbers={showLineNumbers}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Split Diff View (Side-by-Side)
// ============================================================================

export interface SplitDiffViewProps {
  oldContent: string
  newContent: string
  language: string
  className?: string
  showLineNumbers?: boolean
}

export function SplitDiffView({
  oldContent,
  newContent,
  language,
  className,
  showLineNumbers = true,
}: SplitDiffViewProps) {
  // Calculate diff
  const { lines, stats } = useMemo(
    () => calculateDiff(oldContent, newContent),
    [oldContent, newContent]
  )

  // Split lines for side-by-side view
  const { leftLines, rightLines } = useMemo(() => {
    const left: (DiffLine | null)[] = []
    const right: (DiffLine | null)[] = []

    let i = 0
    while (i < lines.length) {
      const line = lines[i]

      if (line.type === 'equal') {
        left.push(line)
        right.push(line)
        i++
      } else if (line.type === 'delete') {
        // Look ahead for paired insert
        const nextLine = lines[i + 1]
        if (nextLine?.type === 'insert') {
          left.push(line)
          right.push(nextLine)
          i += 2
        } else {
          left.push(line)
          right.push(null) // Empty placeholder
          i++
        }
      } else if (line.type === 'insert') {
        left.push(null) // Empty placeholder
        right.push(line)
        i++
      }
    }

    return { leftLines: left, rightLines: right }
  }, [lines])

  // No changes
  if (stats.additions === 0 && stats.deletions === 0) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-center p-8">
          <Equal className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground mb-2">No changes</h3>
          <p className="text-sm text-muted-foreground">
            The current content matches the previous version.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('h-full flex flex-col bg-background', className)}>
      {/* Header with stats */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Previous</span>
          <span className="text-sm text-muted-foreground">Current</span>
        </div>
        <StatsBadge additions={stats.additions} deletions={stats.deletions} />
      </div>

      {/* Split view */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-w-max">
          {/* Left side (old) */}
          <div className="flex-1 border-r border-border">
            {leftLines.map((line, index) => (
              <div
                key={`left-${index}`}
                className={cn(
                  'flex items-stretch font-mono text-sm min-h-[1.5rem]',
                  line?.type === 'delete' && 'bg-red-500/10',
                  line?.type === 'equal' && 'bg-transparent',
                  !line && 'bg-muted/20'
                )}
              >
                {showLineNumbers && (
                  <span className="w-10 text-right pr-2 text-xs text-muted-foreground select-none">
                    {line?.oldLineNumber ?? ' '}
                  </span>
                )}
                <span
                  className={cn(
                    'flex-1 whitespace-pre overflow-x-auto px-2',
                    line?.type === 'delete' && 'text-red-300'
                  )}
                >
                  {line?.content || ' '}
                </span>
              </div>
            ))}
          </div>

          {/* Right side (new) */}
          <div className="flex-1">
            {rightLines.map((line, index) => (
              <div
                key={`right-${index}`}
                className={cn(
                  'flex items-stretch font-mono text-sm min-h-[1.5rem]',
                  line?.type === 'insert' && 'bg-green-500/10',
                  line?.type === 'equal' && 'bg-transparent',
                  !line && 'bg-muted/20'
                )}
              >
                {showLineNumbers && (
                  <span className="w-10 text-right pr-2 text-xs text-muted-foreground select-none">
                    {line?.newLineNumber ?? ' '}
                  </span>
                )}
                <span
                  className={cn(
                    'flex-1 whitespace-pre overflow-x-auto px-2',
                    line?.type === 'insert' && 'text-green-300'
                  )}
                >
                  {line?.content || ' '}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CodeDiffView
