/**
 * Advisor Matching Service
 *
 * High-level service for background advisor matching with auto-provisioning.
 *
 * Following backend team's recommendations:
 * - Client-side triggering after project creation
 * - Empty matchCriteria {} for auto-detection
 * - Non-blocking error handling
 * - SSE-based notifications
 */

'use client'

import { advisorMatchingApi } from './advisor-matching-api'
import type { MatchCriteria, MatchRequest } from '@/types/advisor-matching'
import { logger } from '@/utils/logger'

export interface TriggerMatchOptions {
  projectId: string
  criteria?: MatchCriteria
  expiresInHours?: number
  excludeAdvisors?: string[]
}

export interface MatchResult {
  success: boolean
  status: 'matched' | 'pending' | 'failed'
  matchId?: string
  matchRequest?: MatchRequest
  error?: string
}

/**
 * Trigger advisor matching for a project (non-blocking)
 *
 * Recommended usage:
 * ```typescript
 * // After project creation
 * triggerAdvisorMatch({ projectId }).catch(err => {
 *   toast.error('Could not find advisor. Click "Request Advisor" to retry.');
 * });
 * ```
 */
export async function triggerAdvisorMatch(options: TriggerMatchOptions): Promise<MatchResult> {
  const {
    projectId,
    criteria = {}, // ✅ Empty by default - backend auto-detects
    expiresInHours = 2,
    excludeAdvisors = []
  } = options

  try {
    logger.info('Triggering advisor match', { projectId, excludeAdvisors })

    // Create match request with minimal criteria
    const matchCriteria: MatchCriteria = {
      ...criteria,
      // TODO: Add excludeAdvisors to MatchCriteria type
      // excludeAdvisors: excludeAdvisors.length > 0 ? excludeAdvisors : undefined
    }

    const response = await advisorMatchingApi.createMatchRequest(
      projectId,
      matchCriteria,
      '' // userId will be extracted from auth context by API
    )

    // Fetch full match details
    const match = await advisorMatchingApi.getMatchStatus(response.matchId)

    if (match.status === 'matched') {
      logger.info('Advisor matched immediately', {
        projectId,
        matchId: response.matchId,
        advisorId: match.suggested_advisor_id
      })

      return {
        success: true,
        status: 'matched',
        matchId: response.matchId,
        matchRequest: match
      }
    } else if (match.status === 'pending') {
      logger.info('Match pending - no advisors available yet', {
        projectId,
        matchId: response.matchId
      })

      return {
        success: true,
        status: 'pending',
        matchId: response.matchId,
        matchRequest: match
      }
    }

    return {
      success: true,
      // Status is based on the actual match status, not hardcoded comparison
      status: (match.status === 'finalized' || match.status === 'client_approved' || match.status === 'advisor_accepted') ? 'matched' : 'pending',
      matchId: response.matchId,
      matchRequest: match
    }

  } catch (error) {
    logger.error('Advisor match failed', {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return {
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Failed to create match request'
    }
  }
}

/**
 * Approve a match (client decision)
 */
export async function approveMatch(matchId: string, userId: string): Promise<{
  success: boolean
  workspaceProvisioning?: 'queued'
  error?: string
}> {
  try {
    logger.info('Approving match', { matchId, userId })

    const response = await advisorMatchingApi.clientDecision(
      matchId,
      'approved',
      userId
    )

    // Check if auto-provisioning is enabled
    const match = await advisorMatchingApi.getMatchStatus(matchId)

    logger.info('Match approved', {
      matchId,
      status: match.status,
      autoProvisioning: match.status === 'finalized' ? 'queued' : 'awaiting_advisor'
    })

    return {
      success: true,
      workspaceProvisioning: match.status === 'finalized' ? 'queued' : undefined
    }

  } catch (error) {
    logger.error('Match approval failed', {
      matchId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve match'
    }
  }
}

/**
 * Decline a match (client decision)
 */
export async function declineMatch(
  matchId: string,
  userId: string,
  reason?: string
): Promise<{
  success: boolean
  projectId?: string
  advisorId?: string
  error?: string
}> {
  try {
    logger.info('Declining match', { matchId, userId, reason })

    const match = await advisorMatchingApi.getMatchStatus(matchId)
    const projectId = match.project_id
    const advisorId = match.suggested_advisor_id

    await advisorMatchingApi.clientDecision(
      matchId,
      'declined',
      userId,
      reason
    )

    logger.info('Match declined', { matchId, projectId, advisorId })

    return {
      success: true,
      projectId,
      advisorId
    }

  } catch (error) {
    logger.error('Match decline failed', {
      matchId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decline match'
    }
  }
}

/**
 * Get active match for a project
 */
export async function getActiveMatch(projectId: string): Promise<MatchRequest | null> {
  try {
    const matches = await advisorMatchingApi.getProjectMatches(projectId)

    // Find active match (matched or pending approval)
    const activeMatch = matches.find(m =>
      m.status === 'matched' ||
      m.status === 'client_approved' ||
      m.status === 'advisor_accepted'
    )

    return activeMatch || null

  } catch (error) {
    logger.error('Failed to get active match', {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}

/**
 * Check if project is new (created within last 48 hours)
 */
export function isNewProject(createdAt: string | Date): boolean {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  const ageMs = Date.now() - created.getTime()
  const hours48 = 48 * 60 * 60 * 1000

  return ageMs < hours48
}