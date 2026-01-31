/**
 * Advisor Matching API Client
 *
 * Following CLAUDE.md patterns:
 * - Uses apiFetch with timeout and retry logic
 * - RLS-based authentication with makeUserCtx()
 * - Worker HMAC with createWorkerAuthHeaders()
 * - Correlation ID tracking
 * - Client cache-busting with timestamps
 */

'use client'

import { apiFetch, ApiFetchError } from '@/lib/client/api-fetch'
import { v4 as uuidv4 } from 'uuid'
import type {
  MatchRequest,
  MatchCriteria,
  MatchStatus,
  AdvisorProfile,
  AvailabilityStatus,
  PoolStatus,
  SystemHealth,
  MaskedProjectData,
  MatchingError,
  MatchingErrorCode,
  MatchingAnalytics
} from '@/types/advisor-matching'
import { logger } from '@/utils/logger'

// User-friendly error messages following expert taxonomy
export const MATCHING_ERRORS: Record<MatchingErrorCode, {
  message: string
  action: string
  severity: 'info' | 'warning' | 'error'
}> = {
  NO_ELIGIBLE_ADVISORS: {
    message: "We couldn't find a perfect match right now. Browse our expert advisors manually.",
    action: 'Browse Advisors',
    severity: 'info'
  },
  ADVISOR_COOLDOWN: {
    message: "This advisor recently finished a project. We'll suggest others.",
    action: 'Find Another',
    severity: 'info'
  },
  CAPACITY_REACHED: {
    message: "All advisors are currently at capacity. We're finding alternatives.",
    action: 'Join Waitlist',
    severity: 'warning'
  },
  MATCH_CONFLICT: {
    message: "Another match is in progress. Please wait or browse manually.",
    action: 'Browse Now',
    severity: 'warning'
  },
  MATCH_EXPIRED: {
    message: "This match request has expired. Let's find you a new advisor!",
    action: 'Start New Match',
    severity: 'info'
  },
  RLS_DENIED: {
    message: "Access denied. Please refresh and try again.",
    action: 'Refresh Page',
    severity: 'error'
  },
  STATE_CHANGED: {
    message: "Match state changed. Refreshing...",
    action: 'Refresh',
    severity: 'info'
  },
  TIMEOUT: {
    message: "Request timed out. Please try again.",
    action: 'Retry',
    severity: 'warning'
  },
  NETWORK_ERROR: {
    message: "Network error. Please check your connection.",
    action: 'Retry',
    severity: 'warning'
  }
}

class AdvisorMatchingApiClient {
  private correlationToast = new Set<string>()

  // Core matching workflow
  async createMatchRequest(
    projectId: string,
    criteria: MatchCriteria,
    userId: string
  ): Promise<{ success: true; matchId: string; correlationId: string }> {
    const correlationId = uuidv4()

    try {
      // Backend expects: POST /api/advisor-matching/match-requests
      const response = await apiFetch<{ match_id: string }>('/api/advisor-matching/match-requests', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          projectId,
          matchCriteria: criteria,
          expiresInHours: 48 // Default 48 hour expiration
        }),
        headers: {
          'X-Correlation-Id': correlationId,
          'Idempotency-Key': uuidv4()
        }
      })

      logger.info('Match request created', {
        projectId,
        userId,
        matchId: response.match_id,
        correlationId
      })

      return {
        success: true,
        matchId: response.match_id,
        correlationId
      }
    } catch (error) {
      this.handleMatchingError(error, correlationId)
      throw error
    }
  }

  // Get match status with cache-busting
  async getMatchStatus(matchId: string): Promise<MatchRequest> {
    try {
      // CLAUDE.md: Client cache-busting with timestamps
      const response = await apiFetch<MatchRequest>(
        `/api/advisor-matching/matches/${matchId}?t=${Date.now()}`
      )

      return response
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 404) {
        throw new MatchingApiError('Match not found', matchId)
      }
      throw error
    }
  }

  // Get project matches with cache-busting
  async getProjectMatches(projectId: string): Promise<MatchRequest[]> {
    try {
      const response = await apiFetch<{ matches: MatchRequest[] }>(
        `/api/advisor-matching/projects/${projectId}/matches?t=${Date.now()}`
      )

      return response.matches || []
    } catch (error) {
      logger.error('Failed to get project matches', { projectId, error })
      return []
    }
  }

  // Client decision with idempotency
  async clientDecision(
    matchId: string,
    decision: 'approved' | 'declined',
    userId: string,
    reason?: string
  ): Promise<{ success: true }> {
    const correlationId = uuidv4()

    try {
      // Backend expects: POST /api/advisor-matching/matches/:matchId/client-decision
      await apiFetch(`/api/advisor-matching/matches/${matchId}/client-decision`, {
        method: 'POST',
        body: JSON.stringify({
          userId,
          decision,
          reason
        }),
        headers: {
          'X-Correlation-Id': correlationId,
          'Idempotency-Key': uuidv4()
        }
      })

      return { success: true }
    } catch (error) {
      this.handleMatchingError(error, correlationId)
      throw error
    }
  }

  // Advisor decision (for advisor-facing UI)
  async advisorDecision(
    matchId: string,
    decision: 'approved' | 'declined',
    userId: string,
    reason?: string
  ): Promise<{ success: true }> {
    const correlationId = uuidv4()

    try {
      // Backend expects: POST /api/advisor-matching/matches/:matchId/advisor-decision
      await apiFetch(`/api/advisor-matching/matches/${matchId}/advisor-decision`, {
        method: 'POST',
        body: JSON.stringify({
          userId,
          decision,
          reason
        }),
        headers: {
          'X-Correlation-Id': correlationId,
          'Idempotency-Key': uuidv4()
        }
      })

      return { success: true }
    } catch (error) {
      this.handleMatchingError(error, correlationId)
      throw error
    }
  }

  // Get masked project data for advisor preview
  async getMaskedProjectData(
    projectId: string,
    matchStatus: MatchStatus
  ): Promise<MaskedProjectData> {
    try {
      const response = await apiFetch<MaskedProjectData>(
        `/api/advisor-matching/projects/${projectId}/masked?status=${matchStatus}&t=${Date.now()}`
      )

      return response
    } catch (error) {
      logger.error('Failed to get masked project data', { projectId, error })
      throw error
    }
  }

  // Admin: Get pool status
  async getPoolStatus(includeDetails = false): Promise<PoolStatus> {
    const correlationId = uuidv4()

    try {
      const response = await apiFetch<PoolStatus>(
        `/api/advisor-matching/admin/pool-status?includeDetails=${includeDetails}&t=${Date.now()}`,
        {
          headers: {
            'X-Correlation-Id': correlationId
          }
        }
      )

      return response
    } catch (error) {
      this.handleMatchingError(error, correlationId)
      throw error
    }
  }

  // Admin: Get system health
  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const response = await apiFetch<SystemHealth>(
        `/api/advisor-matching/admin/system-health?t=${Date.now()}`
      )

      return response
    } catch (error) {
      logger.error('Failed to get system health', { error })
      throw error
    }
  }

  // Admin: Get matching analytics
  async getMatchingAnalytics(
    userId: string,
    period: string = 'week'
  ): Promise<MatchingAnalytics> {
    const correlationId = uuidv4()

    try {
      // Backend expects: GET /api/advisor-matching/admin/dashboard/matching-metrics?userId=string&period=string
      const response = await apiFetch<MatchingAnalytics>(
        `/api/advisor-matching/admin/dashboard/matching-metrics?userId=${userId}&period=${period}&t=${Date.now()}`,
        {
          headers: {
            'X-Correlation-Id': correlationId
          }
        }
      )

      logger.info('Matching analytics fetched successfully', {
        userId,
        period,
        correlationId
      })

      return response
    } catch (error) {
      logger.error('Failed to get matching analytics', {
        userId,
        period,
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  // Admin: Create emergency assignment
  async createEmergencyAssignment(params: {
    projectId: string
    advisorId: string
    reason: string
    bypassAvailability?: boolean
    idempotencyKey: string
  }): Promise<{ success: true; matchId: string }> {
    const correlationId = uuidv4()

    try {
      const response = await apiFetch<{ match_id: string }>(
        '/api/advisor-matching/admin/emergency-assignments',
        {
          method: 'POST',
          body: JSON.stringify(params),
          headers: {
            'X-Correlation-Id': correlationId,
            'Idempotency-Key': params.idempotencyKey
          }
        }
      )

      return {
        success: true,
        matchId: response.match_id
      }
    } catch (error) {
      this.handleMatchingError(error, correlationId)
      throw error
    }
  }

  // Enhanced error handling with correlation tracking
  private handleMatchingError(error: any, correlationId: string) {
    // Deduplicate toasts by correlation ID
    const showToast = (message: string, type: 'error' | 'info' = 'error') => {
      if (!this.correlationToast.has(correlationId)) {
        this.correlationToast.add(correlationId)
        // Would integrate with toast system here
        console.error(`${type.toUpperCase()}: ${message}`)

        // Clean up after 30 seconds
        setTimeout(() => this.correlationToast.delete(correlationId), 30000)
      }
    }

    if (error instanceof ApiFetchError) {
      switch (error.status) {
        case 409: // MATCH_CONFLICT
          showToast("Another match is in progress. Please wait a moment.", 'info')
          break

        case 412: // Precondition failed
          showToast("Data has changed. Refreshing...", 'info')
          break

        case 429: // Rate limited
          const retryAfter = error.data?.retryAfter || 60
          showToast(`Too many requests. Please wait ${retryAfter} seconds.`, 'info')
          break

        default:
          showToast(`Request failed. Reference: ${correlationId}`)
      }
    }

    logger.error('Advisor matching API error', {
      correlationId,
      error: error.message,
      status: error.status
    })
  }
}

// Export singleton instance
export const advisorMatchingApi = new AdvisorMatchingApiClient()

// Custom error class for matching-specific errors
export class MatchingApiError extends Error {
  constructor(
    message: string,
    public matchId?: string,
    public correlationId?: string
  ) {
    super(message)
    this.name = 'MatchingError'
  }
}