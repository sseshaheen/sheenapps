/**
 * Plan Files Utility
 *
 * Extracts planned file information from FeaturePlanResponse and FixPlanResponse.
 * Used for the Plan→Build handshake UI to show what files will be generated.
 *
 * @see ux-analysis-code-generation-wait-time.md
 */

import type { FeaturePlanResponse, FixPlanResponse } from '@/types/chat-plan'

export interface PlannedFile {
  path: string
  changeType: 'create' | 'modify' | 'delete' | 'unknown'
  description?: string
  stepTitle?: string
}

/**
 * Extract planned files from a FeaturePlanResponse or FixPlanResponse
 */
export function extractPlannedFiles(
  plan: FeaturePlanResponse | FixPlanResponse
): PlannedFile[] {
  const files: PlannedFile[] = []
  const seenPaths = new Set<string>()

  if (plan.mode === 'feature') {
    // Extract from plan.steps (primary source)
    if (plan.plan?.steps) {
      for (const step of plan.plan.steps) {
        if (step.files && Array.isArray(step.files)) {
          for (const filePath of step.files) {
            if (!seenPaths.has(filePath)) {
              seenPaths.add(filePath)
              files.push({
                path: filePath,
                changeType: 'unknown', // Feature plans don't specify change type
                description: step.description,
                stepTitle: step.title,
              })
            }
          }
        }
      }
    }

    // Also check legacy steps field
    if (plan.steps) {
      for (const step of plan.steps) {
        if (step.files_affected && Array.isArray(step.files_affected)) {
          for (const filePath of step.files_affected) {
            if (!seenPaths.has(filePath)) {
              seenPaths.add(filePath)
              files.push({
                path: filePath,
                changeType: 'unknown',
                description: step.description,
                stepTitle: step.title,
              })
            }
          }
        }
      }
    }
  } else if (plan.mode === 'fix') {
    // Extract from solution.changes (primary source)
    if (plan.solution?.changes) {
      for (const change of plan.solution.changes) {
        if (change.file && !seenPaths.has(change.file)) {
          seenPaths.add(change.file)
          files.push({
            path: change.file,
            changeType: change.changeType,
            description: change.description,
          })
        }
      }
    }

    // Also check legacy solutions field
    if (plan.solutions) {
      for (const solution of plan.solutions) {
        if (solution.files_affected && Array.isArray(solution.files_affected)) {
          for (const filePath of solution.files_affected) {
            if (!seenPaths.has(filePath)) {
              seenPaths.add(filePath)
              files.push({
                path: filePath,
                changeType: 'modify', // Fixes typically modify files
                description: solution.description,
                stepTitle: solution.title,
              })
            }
          }
        }
      }
    }
  }

  return files
}

/**
 * Get a summary of planned file operations
 */
export function getPlannedFilesSummary(files: PlannedFile[]): {
  total: number
  create: number
  modify: number
  delete: number
  unknown: number
} {
  const summary = {
    total: files.length,
    create: 0,
    modify: 0,
    delete: 0,
    unknown: 0,
  }

  for (const file of files) {
    switch (file.changeType) {
      case 'create':
        summary.create++
        break
      case 'modify':
        summary.modify++
        break
      case 'delete':
        summary.delete++
        break
      default:
        summary.unknown++
    }
  }

  return summary
}

/**
 * Get the file name from a path
 */
export function getFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * Group files by directory
 */
export function groupFilesByDirectory(
  files: PlannedFile[]
): Record<string, PlannedFile[]> {
  const groups: Record<string, PlannedFile[]> = {}

  for (const file of files) {
    const parts = file.path.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'

    if (!groups[dir]) {
      groups[dir] = []
    }
    groups[dir].push(file)
  }

  return groups
}
