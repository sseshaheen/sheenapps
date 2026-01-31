/**
 * Advisor Matching React Hooks
 *
 * Following CLAUDE.md patterns:
 * - Always use React Query for data fetching - never plain useEffect
 * - Auth store integration with proper imports
 * - Visibility-aware polling with network detection
 * - Cache-busting and proper invalidation
 */

'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuthStore } from '@/store' // ✅ CLAUDE.md: Always import from /store
import { advisorMatchingApi } from '@/services/advisor-matching-api'
import { useRouter } from '@/i18n/routing' // ✅ CLAUDE.md: Locale-aware navigation
import type {
  MatchRequest,
  MatchCriteria,
  MatchStatus,
  PoolStatus,
  SystemHealth,
  TERMINAL_MATCH_STATES
} from '@/types/advisor-matching'
import { isTerminalState } from '@/types/advisor-matching'
import { logger } from '@/utils/logger'

// Auth integration hook following CLAUDE.md patterns
export function useMatchingWithAuth() {
  const { user } = useAuthStore() // ✅ CLAUDE.md: Get user from auth store

  return {
    user,
    canCreateMatch: !!user,
    userId: user?.id
  }
}

// Network and visibility aware polling
export function useNetworkAwarePolling(enabled: boolean, interval: number) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [isVisible, setIsVisible] = useState(typeof document !== 'undefined' ? !document.hidden : true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const handleVisibilityChange = () => setIsVisible(!document.hidden)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Only poll when online and visible
  return enabled && isOnline && isVisible ? interval : false
}

// Adaptive polling based on match status
export function useAdaptivePolling(matchId: string, currentStatus?: MatchStatus) {
  const backoffMultiplier = useRef(1)
  const maxBackoff = 120000 // 2 minutes max

  const shouldStopPolling = useMemo(() => {
    return currentStatus ? isTerminalState(currentStatus) : false
  }, [currentStatus])

  const getNextInterval = useCallback((hasError: boolean) => {
    if (shouldStopPolling) return false

    if (hasError) {
      // Exponential backoff on errors, capped
      backoffMultiplier.current = Math.min(backoffMultiplier.current * 2, maxBackoff / 15000)
      return 15000 * backoffMultiplier.current
    } else {
      // Reset backoff on success
      backoffMultiplier.current = 1
      return 15000
    }
  }, [shouldStopPolling])

  return { shouldStopPolling, getNextInterval }
}

// Main match request hook with adaptive polling
export function useMatchRequest(projectId: string) {
  const queryClient = useQueryClient()
  const [lastError, setLastError] = useState<Error | null>(null)

  const query = useQuery({
    queryKey: ['match-request', projectId],
    queryFn: async () => {
      try {
        setLastError(null)
        const matches = await advisorMatchingApi.getProjectMatches(projectId)
        return matches.length > 0 ? matches[0] : null
      } catch (error) {
        setLastError(error as Error)
        throw error
      }
    },
    staleTime: 0, // ✅ CLAUDE.md: Consider stale immediately
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false
  })

  const { shouldStopPolling, getNextInterval } = useAdaptivePolling(
    projectId,
    query.data?.status
  )

  const nextInterval = getNextInterval(lastError !== null)
  const pollingInterval = useNetworkAwarePolling(
    !shouldStopPolling && !!query.data,
    typeof nextInterval === 'number' ? nextInterval : 60000
  )

  // Update refetch interval based on status and errors
  useEffect(() => {
    if (shouldStopPolling) {
      queryClient.cancelQueries({ queryKey: ['match-request', projectId] })
    }
  }, [shouldStopPolling, queryClient, projectId])

  return {
    ...query,
    match: query.data,
    shouldStopPolling,
    pollingInterval
  }
}

// Match status hook with single match ID
export function useMatchStatus(matchId: string) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['match-status', matchId],
    queryFn: () => advisorMatchingApi.getMatchStatus(matchId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    enabled: !!matchId
  })
}

// Create match request mutation
export function useCreateMatchRequest() {
  const queryClient = useQueryClient()
  const { userId } = useMatchingWithAuth()

  return useMutation({
    mutationFn: async ({
      projectId,
      criteria
    }: {
      projectId: string
      criteria: MatchCriteria
    }) => {
      if (!userId) {
        throw new Error('Authentication required')
      }

      return advisorMatchingApi.createMatchRequest(projectId, criteria, userId)
    },
    onSuccess: (data, variables) => {
      // Optimistic update + cache invalidation
      queryClient.invalidateQueries({ queryKey: ['match-request', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-matches'] })

      logger.info('Match request created successfully', {
        projectId: variables.projectId,
        matchId: data.matchId,
        correlationId: data.correlationId
      })
    },
    onError: (error) => {
      logger.error('Failed to create match request', { error })
    },
    retry: 0 // ✅ CLAUDE.md: Never retry mutations automatically
  })
}

// Match decision hooks
export function useMatchDecisions(matchId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const userId = user?.id

  const clientDecisionMutation = useMutation({
    mutationFn: (decision: { approved: boolean; reason?: string }) =>
      advisorMatchingApi.clientDecision(
        matchId,
        decision.approved ? 'approved' : 'declined',
        decision.reason
      ),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['match-request'] })
      queryClient.invalidateQueries({ queryKey: ['match-status', matchId] })
      queryClient.invalidateQueries({ queryKey: ['advisor-pool-status'] })
    },
    onError: (error: any) => {
      logger.error('Client decision failed', {
        matchId,
        error: error.message,
        correlationId: error.correlationId
      })
    },
    retry: 0
  })

  const advisorDecisionMutation = useMutation({
    mutationFn: (decision: { accepted: boolean; reason?: string }) => {
      if (!userId) throw new Error('Authentication required')
      return advisorMatchingApi.advisorDecision(
        matchId,
        decision.accepted ? 'approved' : 'declined',
        userId,
        decision.reason
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-request'] })
      queryClient.invalidateQueries({ queryKey: ['match-status', matchId] })
    },
    retry: 0
  })

  return {
    submitClientDecision: clientDecisionMutation.mutate,
    submitAdvisorDecision: advisorDecisionMutation.mutate,
    isSubmittingClient: clientDecisionMutation.isPending,
    isSubmittingAdvisor: advisorDecisionMutation.isPending,
    clientError: clientDecisionMutation.error,
    advisorError: advisorDecisionMutation.error
  }
}

// Guard hook to prevent multiple concurrent requests per project
export function useMatchRequestGuard(projectId: string) {
  const { data: activeMatch } = useMatchRequest(projectId)

  const canRequestMatch = useMemo(() => {
    if (!activeMatch) return true

    // Block if request is pending or matched (awaiting decisions)
    return !['pending', 'matched'].includes(activeMatch.status)
  }, [activeMatch])

  return {
    canRequestMatch,
    activeMatchStatus: activeMatch?.status,
    blockingReason: !canRequestMatch
      ? `A ${activeMatch?.status} match request is already in progress`
      : null
  }
}

// Admin hooks for dashboard
export function usePoolStatus() {
  return useQuery({
    queryKey: ['advisor-pool-status'],
    queryFn: () => advisorMatchingApi.getPoolStatus(true),
    refetchInterval: 30000, // Standard admin polling
    staleTime: 20000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false
  })
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => advisorMatchingApi.getSystemHealth(),
    refetchInterval: 120000, // 2 minute intervals
    staleTime: 60000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false
  })
}

// Emergency assignment hook (admin only)
export function useEmergencyAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
      projectId: string
      advisorId: string
      reason: string
      bypassAvailability?: boolean
    }) => {
      const idempotencyKey = crypto.randomUUID()
      return advisorMatchingApi.createEmergencyAssignment({
        ...params,
        idempotencyKey
      })
    },
    onSuccess: (data, variables) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['match-request', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['advisor-pool-status'] })
      queryClient.invalidateQueries({ queryKey: ['system-health'] })

      logger.info('Emergency assignment created', {
        projectId: variables.projectId,
        advisorId: variables.advisorId,
        matchId: data.matchId
      })
    },
    retry: 0
  })
}