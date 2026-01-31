/**
 * Build State Mapping Utilities
 * Maps worker build states to our local project build status types
 */

export type ProjectBuildStatus = 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded'
export type WorkerBuildStatus = 'queued' | 'building' | 'completed' | 'failed'

/**
 * Maps worker build status to our local project build status
 * Prevents silent UI progress indicator breakage from state mismatches
 */
export function mapWorkerStatusToProjectStatus(workerStatus: string): ProjectBuildStatus {
  switch (workerStatus.toLowerCase()) {
    case 'queued':
      return 'queued'
    case 'building':
      return 'building'
    case 'completed':
      return 'deployed'  // Worker 'completed' = our 'deployed'
    case 'failed':
      return 'failed'
    case 'canceled':
    case 'cancelled':
      return 'canceled'
    case 'superseded':
      return 'superseded'
    default:
      // Log unexpected states for monitoring
      console.warn(`⚠️ Unknown worker build status: "${workerStatus}", defaulting to 'queued'`);
      return 'queued'
  }
}

/**
 * Maps our local status back to worker status for API calls
 */
export function mapProjectStatusToWorkerStatus(projectStatus: ProjectBuildStatus): WorkerBuildStatus {
  switch (projectStatus) {
    case 'queued':
      return 'queued'
    case 'building':
      return 'building'
    case 'deployed':
      return 'completed'  // Our 'deployed' = worker 'completed'
    case 'failed':
      return 'failed'
    case 'canceled':
    case 'superseded':
      // Worker doesn't have these states in main flow, map to failed
      return 'failed'
    default:
      return 'queued'
  }
}

/**
 * Gets human-readable status message for UI display
 */
export function getStatusDisplayMessage(status: ProjectBuildStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued for build'
    case 'building':
      return 'Building project'
    case 'deployed':
      return 'Build completed'
    case 'failed':
      return 'Build failed'
    case 'canceled':
      return 'Build canceled'
    case 'superseded':
      return 'Build superseded'
    default:
      return 'Unknown status'
  }
}

/**
 * Determines if a status represents a final state (no more transitions expected)
 */
export function isFinalStatus(status: ProjectBuildStatus): boolean {
  return ['deployed', 'failed', 'canceled', 'superseded'].includes(status)
}

/**
 * Determines if a status represents an active/in-progress state
 */
export function isActiveStatus(status: ProjectBuildStatus): boolean {
  return ['queued', 'building'].includes(status)
}

/**
 * Gets appropriate CSS class for status styling
 */
export function getStatusStyleClass(status: ProjectBuildStatus): string {
  switch (status) {
    case 'queued':
      return 'status-queued text-blue-600'
    case 'building':
      return 'status-building text-yellow-600 animate-pulse'
    case 'deployed':
      return 'status-deployed text-green-600'
    case 'failed':
      return 'status-failed text-red-600'
    case 'canceled':
      return 'status-canceled text-gray-600'
    case 'superseded':
      return 'status-superseded text-gray-500'
    default:
      return 'status-unknown text-gray-400'
  }
}