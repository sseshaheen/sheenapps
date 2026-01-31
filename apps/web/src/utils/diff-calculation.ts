/**
 * Diff Calculation Utility
 *
 * Line-based diff calculation for code viewer.
 * Uses diff-match-patch under the hood with line-based semantic cleanup.
 */

import DiffMatchPatch from 'diff-match-patch'

// ============================================================================
// Types
// ============================================================================

export type DiffType = 'equal' | 'insert' | 'delete'

export interface DiffLine {
  type: DiffType
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
}

export interface DiffResult {
  lines: DiffLine[]
  stats: {
    additions: number
    deletions: number
    unchanged: number
  }
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

// ============================================================================
// Constants
// ============================================================================

const LARGE_DIFF_THRESHOLD = 200_000 // 200KB

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate line-based diff between two strings
 */
export function calculateDiff(oldContent: string, newContent: string): DiffResult {
  const dmp = new DiffMatchPatch()

  // Use line-based diff for better results
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(oldContent, newContent)
  const diffs = dmp.diff_main(chars1, chars2, false)
  dmp.diff_charsToLines_(diffs, lineArray)
  dmp.diff_cleanupSemantic(diffs)

  // Convert to our line format
  const lines: DiffLine[] = []
  let oldLineNumber = 1
  let newLineNumber = 1
  let additions = 0
  let deletions = 0
  let unchanged = 0

  for (const [operation, text] of diffs) {
    const lineContents = text.split('\n')
    // Remove last empty line from split if text ended with \n
    if (lineContents[lineContents.length - 1] === '') {
      lineContents.pop()
    }

    for (const line of lineContents) {
      if (operation === DiffMatchPatch.DIFF_EQUAL) {
        lines.push({
          type: 'equal',
          content: line,
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++,
        })
        unchanged++
      } else if (operation === DiffMatchPatch.DIFF_DELETE) {
        lines.push({
          type: 'delete',
          content: line,
          oldLineNumber: oldLineNumber++,
          newLineNumber: null,
        })
        deletions++
      } else if (operation === DiffMatchPatch.DIFF_INSERT) {
        lines.push({
          type: 'insert',
          content: line,
          oldLineNumber: null,
          newLineNumber: newLineNumber++,
        })
        additions++
      }
    }
  }

  return {
    lines,
    stats: { additions, deletions, unchanged },
  }
}

/**
 * Check if diff should be computed in a web worker (large files)
 */
export function shouldUseWorker(oldContent: string, newContent: string): boolean {
  return oldContent.length + newContent.length > LARGE_DIFF_THRESHOLD
}

/**
 * Group diff lines into hunks (collapsed sections with context)
 */
export function groupIntoHunks(
  diffLines: DiffLine[],
  contextLines: number = 3
): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null
  let contextBuffer: DiffLine[] = []

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i]
    const isChange = line.type !== 'equal'

    if (isChange) {
      // Start new hunk if needed
      if (!currentHunk) {
        const startContext = contextBuffer.slice(-contextLines)
        currentHunk = {
          oldStart: startContext[0]?.oldLineNumber ?? line.oldLineNumber ?? 1,
          oldLines: 0,
          newStart: startContext[0]?.newLineNumber ?? line.newLineNumber ?? 1,
          newLines: 0,
          lines: [...startContext],
        }
        // Count context lines
        for (const ctx of startContext) {
          currentHunk.oldLines++
          currentHunk.newLines++
        }
      }
      contextBuffer = []

      // Add the change
      currentHunk.lines.push(line)
      if (line.type === 'delete') {
        currentHunk.oldLines++
      } else if (line.type === 'insert') {
        currentHunk.newLines++
      }
    } else {
      // Equal line
      if (currentHunk) {
        // Check if we should close the hunk
        const remainingChanges = diffLines
          .slice(i + 1, i + 1 + contextLines * 2)
          .some((l) => l.type !== 'equal')

        if (remainingChanges || contextBuffer.length < contextLines) {
          // Keep building context / add to current hunk
          currentHunk.lines.push(line)
          currentHunk.oldLines++
          currentHunk.newLines++
          contextBuffer.push(line)

          // If we have enough trailing context and no more changes nearby, close hunk
          if (contextBuffer.length >= contextLines && !remainingChanges) {
            hunks.push(currentHunk)
            currentHunk = null
            contextBuffer = []
          }
        } else {
          // Close the hunk
          hunks.push(currentHunk)
          currentHunk = null
          contextBuffer = [line]
        }
      } else {
        // Building leading context buffer
        contextBuffer.push(line)
        if (contextBuffer.length > contextLines * 2) {
          contextBuffer.shift()
        }
      }
    }
  }

  // Don't forget last hunk
  if (currentHunk) {
    hunks.push(currentHunk)
  }

  return hunks
}

/**
 * Get word-level diff within a line (for inline highlighting)
 */
export function getWordDiff(
  oldLine: string,
  newLine: string
): { old: Array<{ text: string; changed: boolean }>; new: Array<{ text: string; changed: boolean }> } {
  const dmp = new DiffMatchPatch()
  const diffs = dmp.diff_main(oldLine, newLine)
  dmp.diff_cleanupSemantic(diffs)

  const oldParts: Array<{ text: string; changed: boolean }> = []
  const newParts: Array<{ text: string; changed: boolean }> = []

  for (const [operation, text] of diffs) {
    if (operation === DiffMatchPatch.DIFF_EQUAL) {
      oldParts.push({ text, changed: false })
      newParts.push({ text, changed: false })
    } else if (operation === DiffMatchPatch.DIFF_DELETE) {
      oldParts.push({ text, changed: true })
    } else if (operation === DiffMatchPatch.DIFF_INSERT) {
      newParts.push({ text, changed: true })
    }
  }

  return { old: oldParts, new: newParts }
}

/**
 * Format diff stats as string
 */
export function formatDiffStats(stats: DiffResult['stats']): string {
  const parts: string[] = []
  if (stats.additions > 0) parts.push(`+${stats.additions}`)
  if (stats.deletions > 0) parts.push(`-${stats.deletions}`)
  return parts.join(' ') || 'No changes'
}
