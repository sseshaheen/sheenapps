/**
 * Admin Matching Hooks
 *
 * Following CLAUDE.md patterns:
 * - React Query for data fetching with real-time updates
 * - Admin authentication with role verification
 * - Network-aware polling for live dashboard data
 * - Comprehensive error handling
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store' // CLAUDE.md: Always import from /store
import { advisorMatchingApi, MatchingApiError } from '@/services/advisor-matching-api'
import type {
  PoolStatus,
  SystemHealth,
  MatchingAnalytics,
  MatchRequest
} from '@/types/advisor-matching'
import { logger } from '@/utils/logger'
import { useCallback } from 'react'

/**
 * Hook to fetch advisor pool status with real-time updates
 */
export function usePoolStatus(includeDetails = false) {
  const { user, isAuthenticated } = useAuthStore()

  // Only admin users can access pool status
  const isAdmin = user?.app_metadata?.role === 'admin' || user?.app_metadata?.role === 'super_admin'

  return useQuery({
    queryKey: ['admin-pool-status', includeDetails],
    queryFn: () => advisorMatchingApi.getPoolStatus(includeDetails),
    enabled: isAuthenticated && isAdmin && !!user,
    staleTime: 30 * 1000, // 30 seconds - pool status changes frequently
    refetchInterval: 60 * 1000, // Refresh every minute for dashboard
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false, // Only poll when tab is active
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error instanceof MatchingApiError && error.message.includes('denied')) {
        return false
      }
      return failureCount < 2
    }
  })
}

/**
 * Hook to fetch system health metrics with polling
 */
export function useSystemHealth(enablePolling = true) {
  const { user, isAuthenticated } = useAuthStore()
  const isAdmin = user?.app_metadata?.role === 'admin' || user?.app_metadata?.role === 'super_admin'

  return useQuery({
    queryKey: ['admin-system-health'],
    queryFn: () => advisorMatchingApi.getSystemHealth(),
    enabled: isAuthenticated && isAdmin && !!user,
    staleTime: 0, // Always consider stale for health metrics
    refetchInterval: enablePolling ? 30 * 1000 : false, // Poll every 30 seconds
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (error instanceof MatchingApiError && error.message.includes('denied')) {
        return false
      }
      return failureCount < 2
    }
  })
}

/**
 * Hook to fetch matching analytics with period selection
 */
export function useMatchingAnalytics(period: string = 'week') {
  const { user, isAuthenticated } = useAuthStore()
  const isAdmin = user?.app_metadata?.role === 'admin' || user?.app_metadata?.role === 'super_admin'

  return useQuery({
    queryKey: ['admin-matching-analytics', period],
    queryFn: () => advisorMatchingApi.getMatchingAnalytics(user!.id, period),
    enabled: isAuthenticated && isAdmin && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes - analytics don't change rapidly
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (error instanceof MatchingApiError && error.message.includes('denied')) {
        return false
      }
      return failureCount < 3
    }
  })
}

/**
 * Hook for emergency advisor assignment
 */
export function useEmergencyAssignment() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: (params: {
      projectId: string
      advisorId: string
      reason: string
      bypassAvailability?: boolean
      idempotencyKey: string
    }) => advisorMatchingApi.createEmergencyAssignment(params),
    onSuccess: (data, variables) => {
      logger.info('Emergency assignment created successfully', {
        matchId: data.matchId,
        projectId: variables.projectId,
        advisorId: variables.advisorId,
        adminUserId: user?.id
      })

      // Invalidate related queries to refresh dashboard
      queryClient.invalidateQueries({
        queryKey: ['admin-pool-status']
      })

      queryClient.invalidateQueries({
        queryKey: ['admin-matching-analytics']
      })

      // Invalidate project matches to show new assignment
      queryClient.invalidateQueries({
        queryKey: ['advisor-matching', 'projects', variables.projectId]
      })
    },
    onError: (error: MatchingApiError, variables) => {
      logger.error('Emergency assignment failed', {
        error: error.message,
        correlationId: error.correlationId,
        projectId: variables.projectId,
        advisorId: variables.advisorId,
        adminUserId: user?.id
      })
    }
  })
}

/**
 * Hook to get all active matches for admin monitoring
 */
export function useActiveMatches() {
  const { user, isAuthenticated } = useAuthStore()
  const isAdmin = user?.app_metadata?.role === 'admin' || user?.app_metadata?.role === 'super_admin'

  return useQuery({
    queryKey: ['admin-active-matches'],
    queryFn: async () => {
      // This would need a specific admin endpoint to get all active matches
      // For now, return empty array - backend team would need to implement this
      logger.warn('Active matches endpoint not implemented yet')
      return [] as MatchRequest[]
    },
    enabled: isAuthenticated && isAdmin && !!user,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 2 * 60 * 1000, // Refresh every 2 minutes
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false
  })
}

/**
 * Hook for advisor eligibility validation in emergency assignments
 */
export function useAdvisorEligibilityValidation() {
  const validateAdvisorEligibility = useCallback((
    advisor: any, // Would need proper AdvisorProfile type
    bypassAvailability = false
  ): {
    warnings: string[]
    violations: string[]
    hasViolations: boolean
    canAssign: boolean
  } => {
    const warnings: string[] = []
    const violations: string[] = []

    // Check availability constraints
    if (!advisor.is_available && !bypassAvailability) {
      violations.push('Advisor is currently unavailable')
    }

    // Check capacity constraints
    if (advisor.active_projects >= advisor.max_concurrent_projects) {
      if (bypassAvailability) {
        warnings.push(`Advisor at capacity (${advisor.active_projects}/${advisor.max_concurrent_projects})`)
      } else {
        violations.push(`Advisor at capacity (${advisor.active_projects}/${advisor.max_concurrent_projects})`)
      }
    }

    // Check preference rules (if implemented)
    if (advisor.admin_preferences?.never_assign) {
      violations.push('Admin rule: Never assign this advisor')
    }

    // Check for cooldown period
    if (advisor.last_project_end && advisor.cooldown_hours) {
      const lastEnd = new Date(advisor.last_project_end)
      const cooldownEnd = new Date(lastEnd.getTime() + (advisor.cooldown_hours * 60 * 60 * 1000))

      if (new Date() < cooldownEnd) {
        const hoursLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / (1000 * 60 * 60))
        warnings.push(`Advisor in cooldown period (${hoursLeft}h remaining)`)
      }
    }

    const hasViolations = violations.length > 0
    const canAssign = !hasViolations || bypassAvailability

    return {
      warnings,
      violations,
      hasViolations,
      canAssign
    }
  }, [])

  return { validateAdvisorEligibility }
}

/**
 * Hook for dashboard refresh control
 */
export function useDashboardRefresh() {
  const queryClient = useQueryClient()

  const refreshAllDashboardData = useCallback(async () => {
    // Invalidate all admin queries to force refresh
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['admin-pool-status']
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin-system-health']
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin-matching-analytics']
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin-active-matches']
      })
    ])

    logger.info('Admin dashboard data refreshed')
  }, [queryClient])

  return { refreshAllDashboardData }
}