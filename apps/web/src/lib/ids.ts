/**
 * ID Generation Utilities
 *
 * Provides functions for generating unique, traceable IDs for build sessions
 * and other correlation purposes.
 *
 * Build Session ID Philosophy:
 * - Generated ONCE at submit time
 * - NEVER regenerated during the build lifecycle
 * - Used to correlate all events, metrics, and recommendations for a single build
 * - Includes projectId and timestamp for debugging/tracing
 */

'use client'

/**
 * Generate a unique build session ID.
 *
 * Format: bs_{projectId}_{timestamp}_{randomSuffix}
 *
 * This ID is generated ONCE when a build is submitted and should
 * NEVER be regenerated until the build completes/fails and a new build starts.
 *
 * @param projectId - The project ID this build session is for
 * @returns A unique build session ID
 */
export function generateBuildSessionId(projectId: string): string {
  const timestamp = Date.now()
  const randomSuffix = crypto.randomUUID().slice(0, 8)
  return `bs_${projectId}_${timestamp}_${randomSuffix}`
}

/**
 * Parse a build session ID to extract its components.
 * Useful for logging and debugging.
 *
 * @param buildSessionId - The build session ID to parse
 * @returns Parsed components or null if invalid format
 */
export function parseBuildSessionId(buildSessionId: string): {
  projectId: string
  timestamp: number
  randomSuffix: string
} | null {
  const match = buildSessionId.match(/^bs_(.+)_(\d+)_([a-f0-9]{8})$/)
  if (!match) return null

  return {
    projectId: match[1],
    timestamp: parseInt(match[2], 10),
    randomSuffix: match[3]
  }
}

/**
 * Check if a build session ID is valid format.
 *
 * @param buildSessionId - The ID to validate
 * @returns True if valid format
 */
export function isValidBuildSessionId(buildSessionId: string | null | undefined): buildSessionId is string {
  if (!buildSessionId) return false
  return /^bs_.+_\d+_[a-f0-9]{8}$/.test(buildSessionId)
}

/**
 * Get a shortened version of the build session ID for logging.
 *
 * @param buildSessionId - The full build session ID
 * @returns Shortened version (e.g., "bs_abc...xyz")
 */
export function shortenBuildSessionId(buildSessionId: string | null | undefined): string {
  if (!buildSessionId) return 'null'
  if (buildSessionId.length <= 20) return buildSessionId
  return `${buildSessionId.slice(0, 10)}...${buildSessionId.slice(-8)}`
}
